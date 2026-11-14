/**
 * ShellPulse news — Host half.
 *
 * The browser half cannot call `https://api.shellpulse.xyz` directly: the public
 * API answers CORS with an origin allowlist, and the Harness page origin is
 * either a changing loopback port or `file://`. This half registers a same-origin
 * proxy on the Host's own web server, so the panel only talks to `/shellpulse/*`.
 *
 * The proxy is deliberately narrow: fixed upstream, fixed routes, whitelisted
 * query parameters, GET only. It must never become a general-purpose fetcher.
 */

const DEFAULT_API_BASE = 'https://api.shellpulse.xyz'
const DEFAULT_CACHE_SECONDS = 45
const MAX_CACHE_SECONDS = 600
const MAX_LIMIT = 50
const MAX_BYTES = 512 * 1024
const TIMEOUT_MS = 15000
const TRANSLATE_MAX_CHARS = 6000
const PAPER_MAX_CHARS = 30000
const PAPER_CACHE_TTL = 10 * 60 * 1000
const PAPER_HTML_MAX_BYTES = 3 * 1024 * 1024
const PAPER_RENDER_MAX_BYTES = 2 * 1024 * 1024
const IMAGE_HOSTS = new Set(['ar5iv.labs.arxiv.org', 'arxiv.org', 'www.arxiv.org', 'static.arxiv.org'])
const IMAGE_MAX_BYTES = 8 * 1024 * 1024
const IMAGE_CACHE_TTL = 60 * 60 * 1000
const IMAGE_CACHE_LIMIT = 60
const BUILD = '0.9.0'

const FEED_VIEWS = new Set(['all', 'hot', 'featured'])
const LANGS = new Set(['zh', 'en'])
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/

export const name = 'shellpulse-news'
export const inject = ['webServer']

/**
 * Register the same-origin proxy.
 * @param ctx - the plugin context; `webServer` is the Host HTTP server.
 * @param config - row config from `cordis.patch.yml` (`apiBase`, `cacheSeconds`).
 */
export function apply(ctx, config) {
  const settings = config ?? {}
  const apiBase = normalizeBase(settings.apiBase)
  const cacheSeconds = clampInt(settings.cacheSeconds, 0, MAX_CACHE_SECONDS, DEFAULT_CACHE_SECONDS)
  const llmProvider = typeof settings.llmProvider === 'string' && settings.llmProvider !== '' ? settings.llmProvider : 'deepseek-official'
  const llmModel = typeof settings.llmModel === 'string' && settings.llmModel !== '' ? settings.llmModel : 'deepseek-flash'
  const log = ctx.logger
  const cache = new Map() // key -> { expires, status, body, retryAfter }
  const inflight = new Map() // key -> Promise<entry>

  const resolveRoute = (url) => {
    const path = url.pathname.startsWith('/shellpulse') ? url.pathname.slice('/shellpulse'.length) : ''
    if (path === '/meta') return { upstreamPath: '/api/meta', search: '', ttl: 300 }
    if (path === '/head') {
      const since = url.searchParams.get('since')
      if (since !== null && Number.isNaN(Date.parse(since))) return null
      return { upstreamPath: '/api/feed/head', search: since ? `?since=${encodeURIComponent(since)}` : '', ttl: 0 }
    }
    if (path === '/feed') {
      const params = filterFeedParams(url.searchParams)
      if (params === null) return null
      const search = params.toString()
      // A category view runs the backend's keyword filter and costs seconds;
      // keep it warm longer so switching tabs stays instant.
      const ttl = url.searchParams.has('category') ? Math.max(cacheSeconds, 120) : cacheSeconds
      return {
        upstreamPath: '/api/feed',
        search: search ? `?${search}` : '',
        ttl,
        refresh: url.searchParams.get('refresh') === '1',
      }
    }
    if (path.startsWith('/item/')) {
      const id = path.slice('/item/'.length)
      if (!KEY_PATTERN.test(id)) return null
      return { upstreamPath: `/api/item/${id}`, search: '', ttl: 60 }
    }
    return null
  }

  const fetchUpstream = async (upstreamUrl) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetch(upstreamUrl, {
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': 'shellpulse-dsh-news/0.1.0' },
      })
      const body = await response.text()
      if (body.length > MAX_BYTES) throw new Error('upstream response too large')
      return {
        status: response.status,
        body: response.ok ? body : JSON.stringify({ error: 'upstream_error', status: response.status }),
        retryAfter: response.headers.get('retry-after'),
        cacheable: response.ok,
      }
    } finally {
      clearTimeout(timer)
    }
  }

  const respond = (res, entry, fromCache) => {
    res.writeHead(entry.status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-shellpulse-build': BUILD,
      ...(fromCache ? { 'x-shellpulse-cache': 'hit' } : {}),
      ...(entry.retryAfter ? { 'retry-after': entry.retryAfter } : {}),
    })
    res.end(entry.body)
  }

  const fail = (res, status, code) => {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify({ error: code }))
  }

  const handle = async (req, res) => {
    let url
    try {
      url = new URL(req.url ?? '/', 'http://shellpulse.invalid')
    } catch {
      fail(res, 400, 'bad_request')
      return
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/shellpulse/img') {
      await handleImage(req, res, url)
      return
    }

    if (req.method === 'POST' && url.pathname === '/shellpulse/explain') {
      await handleExplain(req, res)
      return
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/shellpulse/paper') {
      await handlePaper(req, res, url)
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'application/json' })
      res.end('{"error":"method_not_allowed"}')
      return
    }

    const route = resolveRoute(url)
    if (route === null) {
      fail(res, 400, 'bad_request')
      return
    }

    const key = route.upstreamPath + route.search
    const now = Date.now()
    if (route.ttl > 0 && route.refresh !== true) {
      const hit = cache.get(key)
      if (hit !== undefined && hit.expires > now) {
        respond(res, hit, true)
        return
      }
    }

    let pending = inflight.get(key)
    if (pending === undefined) {
      pending = (async () => {
        const entry = await fetchUpstream(apiBase + route.upstreamPath + route.search)
        const stored = { ...entry, expires: Date.now() + route.ttl * 1000 }
        if (route.ttl > 0 && entry.cacheable) {
          cache.set(key, stored)
          if (cache.size > 200) {
            const oldest = cache.keys().next()
            if (!oldest.done) cache.delete(oldest.value)
          }
        }
        return stored
      })()
      inflight.set(key, pending)
      pending.finally(() => inflight.delete(key)).catch(() => {})
    }

    let entry
    try {
      entry = await pending
    } catch (error) {
      log?.warn?.(`[shellpulse-news] upstream request failed: ${error instanceof Error ? error.message : String(error)}`)
      fail(res, 502, 'upstream_unavailable')
      return
    }

    respond(res, entry, false)
  }

  const fetchItem = async (id, signal) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const relay = () => controller.abort()
    if (signal) signal.addEventListener('abort', relay, { once: true })
    try {
      const response = await fetch(`${apiBase}/api/item/${encodeURIComponent(id)}`, {
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': 'shellpulse-dsh-news/0.1.0' },
      })
      if (!response.ok) return null
      return await response.json()
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', relay)
    }
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['tools'], (scope) => {
      scope.effect(
        () =>
          scope.tools.register({
            name: 'shellpulse_article',
            description:
              'Read one ShellPulse AI-news article by id: title, source, summary and the stored body (Chinese translation when available). Use it before analysing or discussing an article the user referenced.',
            parameters: {
              type: 'object',
              additionalProperties: false,
              required: ['id'],
              properties: {
                id: { type: 'string', description: 'ShellPulse item id, for example 85c26a2f267ce1cc' },
              },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'title', 'source', 'url', 'body', 'body_language', 'truncated'],
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  source: { type: 'string' },
                  url: { type: 'string' },
                  published_at: { type: 'string' },
                  summary: { type: 'string' },
                  body: { type: 'string' },
                  body_language: { type: 'string' },
                  truncated: { type: 'boolean' },
                },
              },
              render: (_args, value) => [
                {
                  type: 'text',
                  text: [
                    `# ${value.title}`,
                    `${value.source} · ${value.url}`,
                    value.summary ? `\n${value.summary}` : '',
                    value.body ? `\n${value.body}${value.truncated ? '\n\n[truncated]' : ''}` : '',
                  ]
                    .filter(Boolean)
                    .join('\n'),
                },
              ],
            },
            async execute(args, exec) {
              const data = await fetchItem(String(args.id), exec.signal)
              if (data === null) throw new Error(`ShellPulse article ${args.id} is unavailable`)
              const zh = typeof data.body_zh === 'string' ? data.body_zh.trim() : ''
              const body = zh !== '' ? zh : typeof data.body === 'string' ? data.body.trim() : ''
              const limit = 6000
              return {
                id: String(data.id ?? args.id),
                title: String(data.title_zh || data.title || ''),
                source: String((data.source && data.source.name) || ''),
                url: String(data.url || ''),
                published_at: data.published_at ? String(data.published_at) : undefined,
                summary: String(data.llm_summary || data.summary || '').slice(0, 600),
                body: body.slice(0, limit),
                body_language: zh !== '' ? 'zh' : 'en',
                truncated: body.length > limit || Boolean(data.body_zh_truncated),
              }
            },
          }),
        'shellpulse-news:article-tool',
      )
    })
  }

  const imageCache = new Map()

  const sendImage = (res, entry) => {
    res.writeHead(200, {
      'content-type': entry.type,
      'content-length': entry.buf.length,
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
    })
    res.end(entry.buf)
  }

  const handleImage = async (req, res, url) => {
    const raw = url.searchParams.get('u') ?? ''
    let target
    try {
      target = new URL(raw)
    } catch {
      fail(res, 400, 'bad_request')
      return
    }
    if (!IMAGE_HOSTS.has(target.hostname)) {
      fail(res, 403, 'forbidden')
      return
    }
    const cached = imageCache.get(target.href)
    if (cached !== undefined && Date.now() - cached.at < IMAGE_CACHE_TTL) {
      sendImage(res, cached)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const onClose = () => controller.abort()
    res.on('close', onClose)
    try {
      const response = await fetch(target.href, {
        signal: controller.signal,
        headers: { accept: 'image/*', 'user-agent': 'shellpulse-dsh-news/0.1.0' },
      })
      if (!response.ok) {
        fail(res, 502, 'image_unavailable')
        return
      }
      const finalUrl = new URL(response.url || target.href)
      if (!IMAGE_HOSTS.has(finalUrl.hostname)) {
        fail(res, 403, 'forbidden')
        return
      }
      const type = response.headers.get('content-type') ?? ''
      if (!type.startsWith('image/')) {
        fail(res, 502, 'image_unavailable')
        return
      }
      const buf = Buffer.from(await response.arrayBuffer())
      if (buf.length > IMAGE_MAX_BYTES) {
        fail(res, 502, 'image_unavailable')
        return
      }
      const entry = { at: Date.now(), type, buf }
      imageCache.set(target.href, entry)
      if (imageCache.size > IMAGE_CACHE_LIMIT) {
        const oldest = imageCache.keys().next()
        if (!oldest.done) imageCache.delete(oldest.value)
      }
      sendImage(res, entry)
    } catch (error) {
      log?.warn?.(`[shellpulse-news] image failed: ${error instanceof Error ? error.message : String(error)}`)
      fail(res, 502, 'image_unavailable')
    } finally {
      clearTimeout(timer)
      res.off('close', onClose)
    }
  }

  const paperCache = new Map()

  const fetchCss = async (href, signal, depth = 0) => {
    if (depth > 3) return ''
    const url = href.startsWith('http') ? href : `https://arxiv.org${href.startsWith('/') ? '' : '/'}${href}`
    const response = await fetch(url, {
      signal,
      headers: { accept: 'text/css', 'user-agent': 'shellpulse-dsh-news/0.1.0' },
    })
    if (!response.ok) return ''
    let css = await response.text()
    if (css.length > 600 * 1024) return ''
    // arXiv's paper sheet is a thin @import chain; inline it before serving.
    const imports = [...css.matchAll(/@import\s+(?:url\()?["']([^"']+)["']\)?[^;]*;/g)]
    for (const statement of imports) {
      const target = statement[1]
      const inlined = await fetchCss(target, signal, depth + 1)
      if (inlined !== '') css = css.replace(statement[0], inlined)
    }
    // The sheet declares its tokens on :root; inside a shadow root that selector
    // never matches, so bind them to the host element instead.
    return css.replace(/:root\b/g, ':host').replace(/url\(\s*['"]?\//g, 'url(https://arxiv.org/')
  }

  const fetchArxivPage = async (arxivId, signal) => {
    let version = null
    try {
      const abs = await fetch(`https://arxiv.org/abs/${arxivId}`, {
        signal,
        headers: { accept: 'text/html', 'user-agent': 'shellpulse-dsh-news/0.1.0' },
      })
      if (abs.ok) {
        const text = await abs.text()
        const match = new RegExp(`/html/${arxivId.replace(/\./g, '\\.')}v(\\d+)`).exec(text)
        if (match !== null) version = match[1]
      }
    } catch {
      /* fall back to v1 */
    }
    const candidate = `https://arxiv.org/html/${arxivId}v${version ?? '1'}`
    const response = await fetch(candidate, {
      signal,
      headers: { accept: 'text/html', 'user-agent': 'shellpulse-dsh-news/0.1.0' },
    })
    if (!response.ok) return null
    const page = await response.text()
    if (page.length > PAPER_HTML_MAX_BYTES) return null
    const article = /<article[^>]*class="[^"]*ltx_document[^"]*"[^>]*>([\s\S]*?)<\/article>/i.exec(page)
    if (article === null) return null
    const cssLink = /<link[^>]*rel="stylesheet"[^>]*href="([^"]*arxiv-html-papers[^"]*)"/i.exec(page)
    const css = cssLink === null ? '' : await fetchCss(cssLink[1], signal)
    return { raw: page, html: sanitizeArxivHtml(article[1]), css, pageUrl: candidate }
  }

  const fetchPaper = async (id, signal) => {
    const cached = paperCache.get(id)
    if (cached !== undefined && Date.now() - cached.at < PAPER_CACHE_TTL) return cached.value
    const item = await fetchItem(id, signal)
    if (item === null) return null
    const arxiv = arxivIdOf(item.url || item.raw_url || '')
    if (arxiv === null) throw new Error('not_arxiv')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)
    const relay = () => controller.abort()
    if (signal) signal.addEventListener('abort', relay, { once: true })
    try {
      let raw = null
      let html = ''
      let css = ''
      let source = 'arxiv'
      try {
        const page = await fetchArxivPage(arxiv, controller.signal)
        if (page !== null) {
          raw = page.raw
          html = page.html
          css = page.css
        }
      } catch {
        /* fall through to ar5iv */
      }
      if (raw === null) {
        const response = await fetch(`https://ar5iv.labs.arxiv.org/html/${arxiv}`, {
          signal: controller.signal,
          headers: { accept: 'text/html', 'user-agent': 'shellpulse-dsh-news/0.1.0' },
        })
        if (!response.ok) throw new Error('paper_unavailable')
        raw = await response.text()
        if (raw.length > PAPER_HTML_MAX_BYTES) throw new Error('paper_unavailable')
        html = paperHtml(raw)
        source = 'ar5iv'
      }
      const full = htmlToMarkdown(raw)
      if (full.length < 200) throw new Error('paper_empty')
      const value = {
        id,
        source,
        url: String(item.url || ''),
        title: String(item.title_zh || item.title || ''),
        text: full.slice(0, PAPER_MAX_CHARS),
        html,
        css,
        truncated: full.length > PAPER_MAX_CHARS,
      }
      paperCache.set(id, { at: Date.now(), value })
      return value
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', relay)
    }
  }

  const readJsonBody = async (req, limit = 65536) => {
    let size = 0
    const chunks = []
    for await (const chunk of req) {
      size += chunk.length
      if (size > limit) throw new Error('body too large')
      chunks.push(chunk)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }

  const runLlm = async (system, prompt, signal, maxChars = TRANSLATE_MAX_CHARS) => {
    const llm = ctx.get('llm')
    if (!llm || typeof llm.stream !== 'function') throw new Error('llm-unavailable')
    let output = ''
    const stream = llm.stream({
      provider: llmProvider,
      model: llmModel,
      messages: [
        { role: 'system', content: [{ type: 'text', text: system }] },
        { role: 'user', content: [{ type: 'text', text: prompt.slice(0, maxChars) }] },
      ],
      signal,
    })
    for await (const chunk of stream) {
      if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') output += chunk.text
    }
    return output.trim()
  }

  const explainWindow = { startedAt: 0, count: 0 }

  const handleExplain = async (req, res) => {
    // Only same-origin JSON requests may spend the user's model quota: a
    // cross-site form/fetch cannot set this content type, and a browser request
    // always carries an Origin that must match the Host it addressed.
    const contentType = String(req.headers['content-type'] ?? '').toLowerCase()
    if (!contentType.startsWith('application/json')) {
      fail(res, 415, 'unsupported_media_type')
      return
    }
    const origin = req.headers.origin
    const host = req.headers.host
    if (typeof origin === 'string' && host !== undefined) {
      let originHost
      try {
        originHost = new URL(origin).host
      } catch {
        fail(res, 403, 'forbidden')
        return
      }
      if (originHost !== host) {
        fail(res, 403, 'forbidden')
        return
      }
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      fail(res, 403, 'forbidden')
      return
    }
    const now = Date.now()
    if (now - explainWindow.startedAt > 60000) {
      explainWindow.startedAt = now
      explainWindow.count = 0
    }
    explainWindow.count += 1
    if (explainWindow.count > 10) {
      fail(res, 429, 'rate_limited')
      return
    }

    let body
    try {
      body = await readJsonBody(req)
    } catch {
      fail(res, 400, 'bad_request')
      return
    }
    const text = body && typeof body.text === 'string' ? body.text.trim() : ''
    if (text === '' || text.length > 4000) {
      fail(res, 400, 'bad_request')
      return
    }
    const paperTitle = body && typeof body.title === 'string' ? body.title.slice(0, 200) : ''
    const mode = body && body.mode === 'translate' ? 'translate' : 'explain'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 90000)
    const onClose = () => controller.abort()
    res.on('close', onClose)
    try {
      const system =
        mode === 'translate'
          ? 'You translate academic text into Simplified Chinese. Keep proper nouns, symbols and technical terms in English where readers expect them, and keep mathematical notation unchanged. Output only the translation, preserving paragraph breaks.'
          : 'You explain excerpts from academic papers to a developer reader. Answer in Simplified Chinese. For a short excerpt: what it says, the key term or symbol, and why it matters in context, in at most two short paragraphs. For a longer passage: first one sentence naming the topic, then the key points as a short list. Do not restate the excerpt verbatim.'
      const answer = await runLlm(
        system,
        mode === 'translate'
          ? text
          : `${paperTitle ? `论文：${paperTitle}\n\n` : ''}选中的文字：\n${text}`,
        controller.signal,
        4000,
      )
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-shellpulse-build': BUILD,
      })
      res.end(JSON.stringify({ text: answer }))
    } catch (error) {
      log?.warn?.(`[shellpulse-news] explain failed: ${error instanceof Error ? error.message : String(error)}`)
      fail(res, 502, 'explain_failed')
    } finally {
      clearTimeout(timer)
      res.off('close', onClose)
    }
  }

  const handlePaper = async (req, res, url) => {
    const id = url.searchParams.get('id') ?? ''
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      fail(res, 400, 'bad_request')
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)
    const onClose = () => controller.abort()
    res.on('close', onClose)
    try {
      const paper = await fetchPaper(id, controller.signal)
      if (paper === null) {
        fail(res, 404, 'not_found')
        return
      }
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-shellpulse-build': BUILD,
      })
      res.end(JSON.stringify(paper))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log?.warn?.(`[shellpulse-news] paper fetch failed: ${message}`)
      fail(res, message === 'not_arxiv' ? 422 : 502, message === 'not_arxiv' ? 'not_arxiv' : 'paper_unavailable')
    } finally {
      clearTimeout(timer)
      res.off('close', onClose)
    }
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/shellpulse',
        handler: handle,
      }),
    'shellpulse-news:proxy',
  )
}

/**
 * Keep only the documented `/api/feed` parameters, rejecting anything unknown so
 * the proxy cannot be extended into an arbitrary request by the page.
 * @returns a normalized query, or `null` when a value is outside its contract.
 */
function filterFeedParams(input) {
  const out = new URLSearchParams()
  for (const [key, value] of input) {
    switch (key) {
      case 'view':
        if (!FEED_VIEWS.has(value)) return null
        break
      case 'lang':
        if (!LANGS.has(value)) return null
        break
      case 'category':
      case 'channel':
        if (!KEY_PATTERN.test(value)) return null
        break
      case 'source_id':
        if (!ID_PATTERN.test(value)) return null
        break
      case 'hours': {
        const hours = Number(value)
        if (!Number.isInteger(hours) || hours < 1 || hours > 720) return null
        break
      }
      case 'offset': {
        const offset = Number(value)
        if (!Number.isInteger(offset) || offset < 0) return null
        break
      }
      case 'include_total':
        if (value !== 'true' && value !== 'false') return null
        break
      case 'refresh':
        if (value !== '1') return null
        continue
      case 'limit': {
        const limit = Number(value)
        if (!Number.isInteger(limit) || limit < 1) return null
        out.set('limit', String(Math.min(limit, MAX_LIMIT)))
        continue
      }
      default:
        return null
    }
    out.set(key, value)
  }
  return out
}

/** Pull the arXiv identifier out of an abs/pdf URL. */
function arxivIdOf(url) {
  const match = /arxiv\.org\/(?:abs|pdf)\/([^?#\s]+?)(?:v\d+)?(?:\.pdf)?$/i.exec(String(url))
  return match === null ? null : match[1]
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
}

function plainText(fragment) {
  return decodeEntities(fragment.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/**
 * Sanitize arXiv's own article HTML before it is rendered in a shadow root:
 * scripts, embedded frames, event handlers and navigation links are removed,
 * figures are rewritten through the local image proxy, and the paper keeps its
 * LaTeXML classes so arXiv's own stylesheet applies.
 */
export function sanitizeArxivHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<(iframe|object|embed|form|select|textarea)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|input|link|meta)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s(href|src)\s*=\s*"(?:javascript|data):[^"]*"/gi, '')
    .replace(/<a\b[^>]*>/gi, '<span>')
    .replace(/<\/a>/gi, '</span>')
    .replace(/<div[^>]*class="[^"]*ltx_para[^"]*"[^>]*>[\s\S]*?<\/div>/gi, (block) =>
      /marginparsep has been altered|topmargin has been altered|page layout violates the dash style|please do not change the page layout|not able to reliably undo|offending package\(s\)/i.test(plainText(block))
        ? ''
        : block,
    )
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const match = /src\s*=\s*"([^"]+)"/i.exec(tag)
      if (match === null) return ''
      let src = match[1]
      if (src.startsWith('/')) src = `https://arxiv.org${src}`
      if (!/^https:\/\//i.test(src)) return ''
      let parsed
      try {
        parsed = new URL(src)
      } catch {
        return ''
      }
      if (!IMAGE_HOSTS.has(parsed.hostname)) return ''
      return `<img src="/shellpulse/img?u=${encodeURIComponent(src)}" alt="" />`
    })
}

/**
 * Reduce a LaTeXML paper page to readable Markdown. Deliberately small: headings,
 * paragraphs, list items and figure captions survive; math, tables and scripts do not.
 */
export function htmlToMarkdown(html) {
  let body = String(html)
  const article = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(body)
  if (article !== null) body = article[1]
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<math[\s\S]*?<\/math>/gi, '')
    .replace(/<table[\s\S]*?<\/table>/gi, '\n\n')
    .replace(/<figure[\s\S]*?<\/figure>/gi, (block) => {
      const caption = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(block)
      return caption === null ? '\n\n' : `\n\n> ${plainText(caption[1])}\n\n`
    })
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, inner) => {
      const depth = Math.min(Number(level) + 1, 6)
      return `\n\n${'#'.repeat(depth)} ${plainText(inner)}\n\n`
    })
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|section|blockquote|ul|ol|li|tr)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  let out = decodeEntities(body)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
  // LaTeXML renders its own layout warnings as the first paragraphs.
  const boilerplate = /^(marginparsep has been altered|topmargin has been altered|marginparpush has been altered|the page layout violates the dash style|please do not change the page layout|savetrees, or fullpage|we[’']re not able to reliably undo|the offending package\(s\))/i
  const paragraphs = out.split(/\n{2,}/)
  while (paragraphs.length > 0 && boilerplate.test(paragraphs[0].trim())) paragraphs.shift()
  return paragraphs.join('\n\n')
}

/**
 * Reduce the paper page to the body HTML the client may render: scripts, styles,
 * images and layout wrappers go away, while MathML and tables stay so formulas
 * typeset natively in Chromium.
 */
export function paperHtml(html) {
  const source = String(html)
  const article = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(source)
  let body = article === null ? source : article[1]
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<img[^>]*>/gi, (tag) => {
      const match = /src\s*=\s*"([^"]+)"/i.exec(tag)
      if (match === null) return ''
      const raw = match[1]
      if (raw.startsWith('data:')) return ''
      const absolute = raw.startsWith('/') ? `https://ar5iv.labs.arxiv.org${raw}` : raw
      if (!/^https?:\/\//i.test(absolute)) return ''
      let parsed
      try {
        parsed = new URL(absolute)
      } catch {
        return ''
      }
      if (!IMAGE_HOSTS.has(parsed.hostname)) return ''
      return `<img src="/shellpulse/img?u=${encodeURIComponent(absolute)}" alt="" />`
    })
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<div[^>]*class="[^"]*ltx_para[^"]*"[^>]*>[\s\S]*?<\/div>/gi, (block) =>
      /marginparsep has been altered|topmargin has been altered|page layout violates the dash style|please do not change the page layout|not able to reliably undo|offending package\(s\)/i.test(plainText(block))
        ? ''
        : block,
    )
  return body.slice(0, PAPER_RENDER_MAX_BYTES)
}

function normalizeBase(value) {
  const raw = typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT_API_BASE
  const url = new URL(raw)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('shellpulse-news: apiBase must be an http(s) URL')
  }
  return url.origin + url.pathname.replace(/\/+$/, '')
}

function clampInt(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isInteger(number)) return fallback
  return Math.min(Math.max(number, min), max)
}

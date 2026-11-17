import assert from 'node:assert/strict'
import test from 'node:test'

import { apply } from '../index.js'

/** Install the proxy against a fake `ctx.webServer`, returning its handler. */
function mount(config = {}) {
  let handler
  const ctx = {
    logger: { warn() {} },
    effect: (fn) => {
      fn()
      return () => {}
    },
    webServer: {
      register(route) {
        handler = route.handler
        return () => {}
      },
    },
  }
  apply(ctx, { apiBase: 'https://example.test', cacheSeconds: 45, ...config })
  assert.equal(typeof handler, 'function')
  return handler
}

/** Minimal Node response double that records what the handler wrote. */
function responseDouble() {
  const state = { status: 0, headers: {}, body: '' }
  const res = {
    writeHead(status, headers = {}) {
      state.status = status
      state.headers = headers
      return res
    },
    end(body = '') {
      state.body = body
      return res
    },
  }
  return { res, state }
}

/** Call the handler and resolve once it settles. */
async function call(handler, url, method = 'GET', headers = {}) {
  const { res, state } = responseDouble()
  await handler({ method, url, headers }, res)
  return state
}

function withFetch(impl, fn) {
  const original = globalThis.fetch
  globalThis.fetch = impl
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original
  })
}

test('clamps limit and keeps the documented query', async () => {
  const handler = mount()
  let requested
  await withFetch(
    async (url) => {
      requested = url
      return new Response('{"items":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
    },
    () => call(handler, '/shellpulse/feed?view=hot&limit=999&lang=zh'),
  )
  assert.equal(requested, 'https://example.test/api/feed?view=hot&limit=50&lang=zh')
})

test('keeps the paper source prefix and rejects malformed prefixes', async () => {
  const handler = mount()
  let requested
  await withFetch(
    async (url) => {
      requested = url
      return new Response('{"items":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
    },
    () => call(handler, '/shellpulse/feed?view=all&category=papers&source_prefix=arxiv-'),
  )
  assert.equal(requested, 'https://example.test/api/feed?view=all&category=papers&source_prefix=arxiv-')
  const bad = await call(handler, '/shellpulse/feed?view=all&source_prefix=bad%20prefix')
  assert.equal(bad.status, 400)
})

test('rejects unknown or malformed parameters before any request', async () => {
  const handler = mount()
  let called = false
  await withFetch(
    async () => {
      called = true
      return new Response('{}', { status: 200 })
    },
    async () => {
      assert.equal((await call(handler, '/shellpulse/feed?view=other')).status, 400)
      assert.equal((await call(handler, '/shellpulse/feed?view=hot&admin=1')).status, 400)
      assert.equal((await call(handler, '/shellpulse/feed?view=hot&hours=9999')).status, 400)
      assert.equal((await call(handler, '/shellpulse/nowhere')).status, 400)
      assert.equal((await call(handler, '/shellpulse/item/bad id')).status, 400)
    },
  )
  assert.equal(called, false)
})

test('answers 405 for methods other than GET and HEAD', async () => {
  const handler = mount()
  const state = await call(handler, '/shellpulse/meta', 'POST')
  assert.equal(state.status, 405)
  assert.equal(state.headers.allow, 'GET, HEAD')
})

test('caches successful responses per key', async () => {
  const handler = mount()
  let calls = 0
  await withFetch(
    async () => {
      calls += 1
      return new Response('{"total":0,"items":[]}', { status: 200 })
    },
    async () => {
      assert.equal((await call(handler, '/shellpulse/feed?view=featured')).status, 200)
      const second = await call(handler, '/shellpulse/feed?view=featured')
      assert.equal(second.status, 200)
      assert.equal(second.headers['x-shellpulse-cache'], 'hit')
    },
  )
  assert.equal(calls, 1)
})

test('does not cache the change probe', async () => {
  const handler = mount()
  let calls = 0
  await withFetch(
    async () => {
      calls += 1
      return new Response('{"version":1}', { status: 200 })
    },
    async () => {
      await call(handler, '/shellpulse/head?since=2026-11-13T00%3A00%3A00Z')
      await call(handler, '/shellpulse/head?since=2026-11-13T00%3A00%3A00Z')
    },
  )
  assert.equal(calls, 2)
})

test('passes a rate limit through with its Retry-After', async () => {
  const handler = mount()
  await withFetch(
    async () => new Response('{"detail":"slow down"}', { status: 429, headers: { 'retry-after': '7' } }),
    async () => {
      const state = await call(handler, '/shellpulse/feed')
      assert.equal(state.status, 429)
      assert.equal(state.headers['retry-after'], '7')
    },
  )
})

test('maps upstream failures to a short 502', async () => {
  const handler = mount()
  await withFetch(
    async () => {
      throw new Error('offline')
    },
    async () => {
      const state = await call(handler, '/shellpulse/meta')
      assert.equal(state.status, 502)
      assert.deepEqual(JSON.parse(state.body), { error: 'upstream_unavailable' })
    },
  )
})

test('registers the article tool with a usable definition', async () => {
  const tools = []
  const ctx = {
    logger: { warn() {} },
    effect: (fn) => {
      fn()
      return () => {}
    },
    inject: (deps, callback) => {
      assert.deepEqual([...deps], ['tools'])
      callback({
        effect: (fn) => {
          fn()
          return () => {}
        },
        tools: {
          register: (definition) => {
            tools.push(definition)
            return () => {}
          },
        },
      })
    },
    webServer: { register: () => () => {} },
  }
  apply(ctx, { apiBase: 'https://example.test' })

  assert.equal(tools.length, 1)
  const tool = tools[0]
  assert.equal(tool.name, 'shellpulse_article')
  assert.equal(tool.parameters.properties.id.type, 'string')
  assert.equal(tool.output.schema.type, 'object')

  await withFetch(
    async (url) => {
      assert.equal(url, 'https://example.test/api/item/abc')
      return new Response(
        JSON.stringify({
          id: 'abc',
          title: 'Original title',
          title_zh: '中文标题',
          url: 'https://example.com/a',
          llm_summary: '摘要',
          body: 'English body',
          body_zh: '中文正文',
          body_zh_truncated: true,
          source: { name: '机器之心' },
        }),
        { status: 200 },
      )
    },
    async () => {
      const value = await tool.execute({ id: 'abc' }, {})
      assert.equal(value.title, '中文标题')
      assert.equal(value.body, '中文正文')
      assert.equal(value.body_language, 'zh')
      assert.equal(value.source, '机器之心')
      assert.equal(value.truncated, true)
      const rendered = tool.output.render({}, value)
      assert.equal(rendered[0].type, 'text')
      assert.match(rendered[0].text, /中文标题/)
    },
  )
})

test('refresh=1 bypasses the Host cache', async () => {
  let calls = 0
  const handler = mount()
  await withFetch(
    async () => {
      calls += 1
      return new Response('{"items":[],"has_more":false}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
    async () => {
      await call(handler, '/shellpulse/feed?view=hot')
      await call(handler, '/shellpulse/feed?view=hot')
      assert.equal(calls, 1)
      await call(handler, '/shellpulse/feed?view=hot&refresh=1')
      assert.equal(calls, 2)
    },
  )
})

test('explain rejects non-JSON and cross-origin requests', async () => {
  const handler = mount()
  const wrongType = await call(handler, '/shellpulse/explain', 'POST', { 'content-type': 'text/plain' })
  assert.equal(wrongType.status, 415)

  const crossOrigin = await call(handler, '/shellpulse/explain', 'POST', {
    'content-type': 'application/json',
    origin: 'https://evil.test',
    host: '127.0.0.1:1234',
  })
  assert.equal(crossOrigin.status, 403)

  const crossSite = await call(handler, '/shellpulse/explain', 'POST', {
    'content-type': 'application/json',
    'sec-fetch-site': 'cross-site',
  })
  assert.equal(crossSite.status, 403)
})

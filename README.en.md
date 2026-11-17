# ShellPulse news for DeepSeek Harness

> 中文说明见 [README.md](README.md)。The Chinese document is the primary one; this file mirrors it
> for English readers.

A right-sidebar tab that shows the public [ShellPulse](https://www.shellpulse.xyz/) AI feed
while you work: the materialized hot ranking, the latest timeline and the featured picks,
with Chinese titles and summaries when available.

## What it does

- **Right sidebar tab**, next to Files / Browser / Terminal, so the conversation stays visible.
- **Left rail entry** that opens the same feed as a full page in the main column, for reading
  without the conversation taking half the width. Both surfaces share one implementation.
- **Five views** — 新闻 (`all`, paginated with load-more), 精选 (`featured`), 热点 (`hot`, the
  server's Top 20), 教程 (`all&category=tutorials`) and 论文 (`all&source_prefix=arxiv-`) — plus
  a category filter filled from `/api/meta`. The backend's plain `all` view excludes tutorials
  and papers by policy (2026-11-15), so the two content types have their own tabs. The papers
  tab is the arXiv feed: `source_prefix` matches every `arxiv-*` source (including categories
  added later), and it deliberately sends no `category` — the backend reads that parameter as
  a keyword filter, and `category=papers` drops about a third of the arXiv items and mixes in
  news. Category views are warmed in the background and cached longer, because the backend's
  keyword filter makes them slower than the plain timeline.
- **Row thumbnails**: the first publisher image in the item's summary (the API has no image
  field, so this is the same markdown/HTML extractor the public site uses) renders as a 16:9
  thumbnail to the right of the summary — the title keeps the full row width — and larger in
  the full-page view. Roughly half the feed has one; an item without an image, or one whose
  CDN refuses a referrer-less request, keeps the text-only row instead of a broken frame.
- **Rows** carry a publisher mark, source, relative time, multi-source count
  (`story_size > 1`), `热点` / `精选` badges when the item has them, and the model quality
  score (`llm_quality` × 100, the same number the site calls "AI 评分").
- **Detail view**: selecting a row fetches `/api/item/{id}` and replaces the list with the
  article — title, model summary, `body_zh` (falling back to `body`), a truncation note when
  the translation is partial, categories, and open/copy actions. Back returns to the list
  with its view and filters intact.
- **AI actions**: the detail view offers `AI 解读` (a structured explain-this-article prompt) and
  `和 AI 聊聊` (a discussion opener). Both insert the prompt into the current Session's
  composer through the standard `inputActions` prop, so the user reviews and sends it; when
  the composer is not bound (the full-page entry), the prompt is copied to the clipboard
  instead and the hint says so.
- **`shellpulse_article` tool**: the Host half registers a model-facing tool that returns one
  article's title, source, summary and stored body (Chinese translation first). The inserted
  prompts carry the article id and ask the agent to call it, so an analysis or a follow-up
  discussion reads exactly what the panel shows instead of re-fetching the publisher page.
  The tool is registered through `ctx.tools.register` with a plain JSON Schema definition, so
  the bundle depends on no `@deepseek-ai/*` package.
- **Full-paper reader, arXiv's own rendering**: `加载原文` calls `GET /shellpulse/paper?id=…`.
  The Host resolves the arXiv id, reads the abs page for the latest version, and fetches
  `https://arxiv.org/html/<id>v<n>` (falling back to `ar5iv.labs.arxiv.org` when arXiv has no
  HTML). It returns the article HTML plus arXiv's own paper stylesheet (its `@import` chain
  inlined, `:root` rebound to `:host`, image URLs absolute), and the client mounts both in a
  shadow root, so the paper keeps arXiv's typography, tables, figure captions and MathML
  while none of that CSS leaks into the Harness UI.
- **Why not KaTeX/MathJax**: the plugin has no build step or asset pipeline, and loading a CDN
  script into an offline app is not acceptable. arXiv's HTML already carries MathML, which
  Chromium typesets natively, so the reader keeps that instead of adding a second engine.
- **Figure images**: `sanitizeArxivHtml` rewrites allowlisted figure images
  (`arxiv.org`, `static.arxiv.org`, `ar5iv.labs.arxiv.org`) to `/shellpulse/img?u=…`; the Host
  proxy re-checks the host, refuses non-`image/*` responses and anything over 8 MB, and caches
  for an hour.
- **Sanitised before rendering**: the Host strips scripts, frames and event handlers as a first
  pass, then the client re-parses the markup with `DOMParser` and applies a DOM allowlist —
  dropping executable/navigable elements, every `on*` and `style` attribute, and any `src` that
  is not the local image proxy. The paper stylesheet loses `@import` and any `url()` that does
  not point at arXiv, so neither the HTML nor the CSS can reach a third-party origin.
- **Explain a selection**: selecting text inside the paper (including inside the shadow root)
  shows a floating `解释这段` button; it posts the excerpt to `POST /shellpulse/explain`, which
  asks the model for a short Chinese explanation of the passage, its key symbols and its
  context, and shows the answer in a popover.
- **Markdown body**: fenced code, headings, ordered/bullet lists, quotes, GitHub tables,
  rules, and inline code/bold/links are rendered as React nodes, never as HTML, so article
  text cannot inject markup. Ordered markers without a following space (`1.动作空间`, common
  in translated bodies) and `1、` still count as lists. Unknown constructs stay plain text.
- **Publisher mark**: the source icon the API carries, then `GET /shellpulse/icon?u=<origin>` —
  the Host reads the publisher page's `<link rel="icon">`, falls back to `/favicon.ico`, the
  `www.` spelling and `/apple-touch-icon.png`, keeps only `image/*` answers and caches the
  bytes for a week — then the source initial. No third-party favicon service is involved; a
  site whose WAF refuses non-browser clients still lands on its initial.
- **Change probe** every 60 s through `/api/feed/head`; a "N 条新内容" strip appears instead
  of silently reloading the list.
- **Failure states stay readable**: the last good list is kept and marked stale.
- **First run is discoverable**: the panel opens once per browser profile (the
  `dsh.shellpulse.news.intro.v1` key); closing it afterwards is respected.

## Architecture

The browser half never calls the public API directly. Production CORS is an origin
allowlist, and the Harness page origin is either a changing loopback port or `file://`,
so the Host half (`index.js`) registers a same-origin proxy on the Host's own web server:

```
browser:  fetch('/shellpulse/feed?view=hot')
              │
Host:     ctx.webServer.register({ kind: 'prefix', path: '/shellpulse' })
              ├─ GET /shellpulse/feed   → https://api.shellpulse.xyz/api/feed
              ├─ GET /shellpulse/meta   → /api/meta
              ├─ GET /shellpulse/head   → /api/feed/head
              ├─ GET /shellpulse/item/:id → /api/item/:id
              ├─ GET /shellpulse/img?u=…  → a publisher image (arXiv hosts only)
              ├─ GET /shellpulse/paper?id=… → the arXiv HTML + its stylesheet
              └─ GET /shellpulse/icon?u=… → the publisher's own favicon
              │  whitelisted params · 45 s memory cache · single-flight · 8 s timeout
              ▼
          https://api.shellpulse.xyz
```

Rules the proxy keeps:

- **Every request passes Connection's fence first.** `index.js` declares `connection`
  in `inject` and calls `ctx.connection.requestRejection(req)` before touching the URL:
  a foreign Host or Origin, a cross-site request, or a caller without the browser's
  login session gets `403` / `401` and never reaches an upstream, the model, or the
  publisher fetches. This is the same admission check the Host's own routes use, and it
  is why the plugin's routes are not an unauthenticated endpoint on the loopback port.
- `GET`/`HEAD` only; every other method answers `405`.
- The upstream origin and route set are fixed. `/shellpulse/icon` is the only route that
  reads a publisher directly, and it only accepts a public `http(s)` origin: loopback,
  RFC 1918, link-local and CGNAT literals are refused, the name has to resolve through
  `dns.lookup` to public addresses only, redirects are re-validated hop by hop (at most 3),
  and only `image/*` bodies under 512 KB are returned. Everything else stays on the fixed
  upstream.
- Query parameters are whitelisted and bounded (`limit` ≤ 50, `hours` ≤ 720, known views
  and languages only). Unknown parameters answer `400`.
- Only successful responses are cached, keyed by route + query; upstream `429` is returned
  with its `Retry-After`, network failures answer `502` with a short JSON body.
- Responses are `no-store` so the browser does not add a second cache layer.

## Install

From this directory:

```bash
dsh plugin --profile <profile> add link:$PWD
```

Or in the Harness GUI: **Plugins → Add plugin** and paste the absolute path to this
directory. Enable the bundle, restart the Host if the profile does not hot-reload, then
reload the page. Open it from:

- the left rail's **AI 新闻** entry (full page in the main column), or
- the right sidebar's **+** control (guide → AI 新闻) for the narrow tab.

## Configuration

```yaml
- insert:
    - id: shellpulse-news
      name: '@lukema/dsh-news'
      config:
        apiBase: https://api.shellpulse.xyz   # another deployment, or http://127.0.0.1:8000
        cacheSeconds: 45                      # 0 disables the Host cache (max 600)
        llmProvider: deepseek-official        # model used by AI 翻译
        llmModel: deepseek-flash
```

The row config is read once when the plugin activates; change it in the profile patch and
reload the Host.

## Development

No build step: `index.js` is a plain ESM plugin and `client.js` is a lazy-CJS factory for
the Harness module loader. After editing `client.js`, reload the page; after editing
`index.js`, restart the Host.

```bash
node --check index.js
node --check client.js
node --test test/*.test.js
```

`test/proxy.test.js` exercises the Host routing contract with a fake `ctx.webServer`:
parameter whitelisting, cache hits, `429` passthrough and the method guard.

## Privacy

- The panel never talks to ShellPulse directly: the Host half requests `api.shellpulse.xyz`,
  `arxiv.org` and `ar5iv.labs.arxiv.org` on the user's machine.
- `AI 解读` / `和 AI 聊聊` only put text into the composer; nothing is sent until the user
  presses Enter.
- `解释这段` / `翻译这段` send the selected excerpt and the paper title to the model the user
  configured in Harness (`ctx.llm`). No ShellPulse server is involved, and nothing is stored.
  The route sits behind Connection's fence (same-origin browser session only), takes a JSON
  body, and rate-limits to 10 calls per minute, so another page cannot spend the user's quota.
- No API keys, tokens or accounts are required. Images are fetched through the local proxy and
  cached in memory only. Icons are too: resolving a publisher's `<link rel="icon">` means the
  Host reads that publisher's homepage once, then keeps the icon in memory for a week.
- List thumbnails load straight from the publisher's CDN with no referrer (the browser then
  fetches nothing else); they are not routed through the Host proxy.

## Limits

- The public API has no search endpoint, so the panel has no search box.
- Full article bodies and translations stay out of the sidebar; the row links to the source.
- The papers tab relies on the backend's `source_prefix`; a ShellPulse deployment older than
  2026-11-17 ignores that parameter and the tab falls back to the mixed `category=papers` feed.
- A source with no discoverable icon — a WAF that refuses every client, or a page that
  declares only an empty `data:` icon — keeps the initial-letter tile instead of a broken
  image.
- The right sidebar needs a session; without one there is no place to mount the tab.

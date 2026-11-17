# ShellPulse 新闻 · DeepSeek Harness 插件

在 Harness 右侧栏直接刷 [ShellPulse](https://www.shellpulse.xyz/) 的 AI 信息流：热点榜、最新时间线和精选，能拿到中文标题和中文摘要。

> English readers: see [README.en.md](README.en.md).

## 功能

- **右侧栏标签页**：和 Files / Browser / Terminal 并排，看新闻时对话不消失。
- **左侧导航入口**：把同一份信息流以整页形式开在主栏，不想让对话占掉一半宽度时用；两个界面共用一套实现。
- **五个视图**：新闻（`all`，带「加载更多」）、精选（`featured`）、热点（`hot`，服务端 Top 20）、教程（`all&category=tutorials`）、论文（`all&source_prefix=arxiv-`），另外还有一个从 `/api/meta` 填充的分类筛选。后端按策略（2026-11-15）把教程和论文从普通 `all` 里排除，所以这两类各有独立标签。论文标签就是 arXiv 流：`source_prefix` 覆盖所有 `arxiv-*` 来源（以后新增的 arXiv 分类自动包含），并且**故意不带 `category`**——后端把 `category` 当关键词过滤器，`category=papers` 会漏掉约三分之一的 arXiv 条目、还会混进新闻。分类视图会后台预热、缓存更久，因为后端的关键词过滤比普通时间线慢。
- **列表缩略图**：取摘要里的第一张发布方图片（API 没有图片字段，所以用的是和官网一致的 markdown/HTML 抽取逻辑），以 16:9 缩略图放在摘要右侧——标题仍占整行宽度——整页视图里更大。约一半条目有图；没图、或 CDN 拒绝无 referrer 请求的条目保持纯文字行，不会出现破图。
- **每条记录**带发布方图标、来源、相对时间、多来源数量（`story_size > 1`）、热点 / 精选 标签（有则显示），以及 AI 评分（`llm_quality` × 100，和站点的「AI 评分」是同一个数）。
- **详情视图**：点一条会请求 `/api/item/{id}`，用整篇文章替换列表——标题、模型摘要、`body_zh`（没有则用 `body`）、译文不完整时的截断提示、分类，以及打开原文 / 复制链接。返回时列表的视图和筛选条件都还在。
- **AI 动作**：详情页提供 `AI 解读`（结构化的「解释这篇文章」提示词）和 `和 AI 聊聊`（讨论开场白）。两者都通过标准的 `inputActions` 把提示词送进当前会话的输入框，由用户确认后自己发送；输入框没绑定（比如整页入口）时改为复制到剪贴板，并提示已复制。
- **`shellpulse_article` 工具**：宿主半注册一个面向模型的工具，返回某篇文章的标题、来源、摘要和已存正文（优先中文译文）。插入的提示词里带文章 id 并要求 agent 调用它，所以分析和追问读到的内容和面板里看到的一致，不用重新抓发布方页面。工具用 `ctx.tools.register` + 普通 JSON Schema 注册，所以插件不依赖任何 `@deepseek-ai/*` 包。
- **arXiv 原文阅读，用 arXiv 自己的排版**：`加载原文` 调 `GET /shellpulse/paper?id=…`。宿主解析 arXiv id、读 abs 页拿最新版本号，再抓 `https://arxiv.org/html/<id>v<n>`（arXiv 没有 HTML 时退回 `ar5iv.labs.arxiv.org`）。返回文章 HTML 和 arXiv 自己的论文样式表（内联 `@import` 链、`:root` 改绑到 `:host`、图片地址绝对化），客户端把两者挂进 shadow root，所以论文的字体排印、表格、图注和 MathML 都保留，而样式不会漏进 Harness 界面。
- **为什么不用 KaTeX/MathJax**：插件没有构建步骤和资源管线，把 CDN 脚本加载进一个离线应用也不可接受。arXiv 的 HTML 本来就带 MathML，Chromium 原生就能排，所以直接用，不再引第二套引擎。
- **图片**：`sanitizeArxivHtml` 把白名单内的插图（`arxiv.org`、`static.arxiv.org`、`ar5iv.labs.arxiv.org`）改写成 `/shellpulse/img?u=…`；宿主代理会再校验一次域名、拒绝非 `image/*` 响应和超过 8 MB 的内容，并缓存一小时。
- **渲染前净化**：宿主先剥掉脚本、frame 和事件处理器，客户端再用 `DOMParser` 重新解析并套 DOM 白名单——丢掉可执行/可跳转元素、所有 `on*` 和 `style` 属性，以及任何不是本地图片代理的 `src`。论文样式表会丢掉 `@import` 和所有不指向 arXiv 的 `url()`，所以 HTML 和 CSS 都到不了第三方域名。
- **划词解释**：在论文里选中文字（包括 shadow root 内）会浮出 `解释这段` 按钮；它把选段发到 `POST /shellpulse/explain`，请模型给出这段的中文解释、关键符号和上下文，结果在浮层里显示。
- **Markdown 正文**：代码块、标题、有序/无序列表、引用、GitHub 表格、分隔线和行内代码/加粗/链接都渲染成 React 节点而不是 HTML，所以文章内容注入不了标记。`1.动作空间` 这种点后不带空格的编号（译文中很常见）和 `1、` 也算有序列表。不认识的写法保持纯文本。
- **发布方图标**：先用 API 带的图标，再用 `GET /shellpulse/icon?u=<origin>`——宿主读发布方页面的 `<link rel="icon">`，退回 `/favicon.ico`、`www.` 写法和 `/apple-touch-icon.png`，只收 `image/*` 响应并把字节缓存一周——最后才退回首字母色块。全程不碰第三方 favicon 服务；对非浏览器客户端一律 403 的站点（WAF）就停在首字母。
- **变更探测**：每 60 秒打一次 `/api/feed/head`；有新内容时显示「N 条新内容」横条，而不是悄悄重载列表。
- **失败状态可读**：保留上一次成功的列表并标记为过期。
- **首次可发现**：面板每个浏览器 profile 自动展开一次（`dsh.shellpulse.news.intro.v1`），之后关掉就保持关掉。

## 架构

浏览器半从不直连公开 API：生产 CORS 是 origin 白名单，而 Harness 页面 origin 可能是变化的回环端口或 `file://`。所以宿主半（`index.js`）在宿主自己的 web server 上注册一个同源代理：

```
浏览器:  fetch('/shellpulse/feed?view=hot')
              │
宿主:    ctx.webServer.register({ kind: 'prefix', path: '/shellpulse' })
              ├─ GET /shellpulse/feed   → https://api.shellpulse.xyz/api/feed
              ├─ GET /shellpulse/meta   → /api/meta
              ├─ GET /shellpulse/head   → /api/feed/head
              ├─ GET /shellpulse/item/:id → /api/item/:id
              ├─ GET /shellpulse/img?u=…  → 发布方图片（仅 arXiv 域名）
              ├─ GET /shellpulse/paper?id=… → arXiv HTML + 其样式表
              └─ GET /shellpulse/icon?u=… → 发布方自己的 favicon
              │  参数白名单 · 45 秒内存缓存 · 单飞 · 8 秒超时
              ▼
          https://api.shellpulse.xyz
```

代理遵守的规则：

- **每个请求都先过 Connection 的围栏。** `index.js` 在 `inject` 里声明 `connection`，并在解析 URL 之前调用 `ctx.connection.requestRejection(req)`：外部 Host 或 Origin、跨站请求、没有浏览器登录会话的调用者，一律 `403` / `401`，到不了上游、模型或发布方抓取。这是宿主自己的路由用的同一套准入检查，也是这些路由不是回环端口上「谁都能调」的接口的原因。
- 只允许 `GET`/`HEAD`，其他方法回 `405`。
- 上游 origin 和路由集合是固定的。`/shellpulse/icon` 是唯一直接读发布方的路由，且只接受公网 `http(s)` origin：回环、RFC 1918、link-local、CGNAT 字面量一律拒绝，域名必须通过 `dns.lookup` 只解析到公网地址，重定向逐跳重新校验（最多 3 跳），只返回 512 KB 以内的 `image/*`。其余全部走固定上游。
- 查询参数白名单且有上限（`limit` ≤ 50、`hours` ≤ 720，只认已知视图和语言）。未知参数回 `400`。
- 只缓存成功响应，按路由 + 查询串索引；上游 `429` 连同 `Retry-After` 透传，网络失败回一个短 JSON `502`。
- 响应是 `no-store`，浏览器不会再加一层缓存。

## 安装

在本目录下：

```bash
dsh plugin --profile <profile> add link:$PWD
```

或者在 Harness 图形界面里：**插件 → 添加插件**，粘贴本目录的绝对路径。启用 bundle；profile 不会热重载的话重启一次宿主，然后刷新页面。入口有两个：

- 左侧导航栏的 **AI 新闻**（主栏整页）；
- 右侧栏的 **+**（引导 → AI 新闻），打开窄标签页。

## 配置

```yaml
- insert:
    - id: shellpulse-news
      name: '@lukema/dsh-news'
      config:
        apiBase: https://api.shellpulse.xyz   # 换部署地址，或 http://127.0.0.1:8000
        cacheSeconds: 45                      # 0 关掉宿主缓存（上限 600）
        llmProvider: deepseek-official        # AI 翻译用的模型
        llmModel: deepseek-flash
```

这行配置在插件激活时读一次；改完写进 profile patch 并重载宿主。

## 开发

没有构建步骤：`index.js` 是普通 ESM 插件，`client.js` 是给 Harness 模块加载器用的惰性 CJS 工厂。改完 `client.js` 刷新页面；改完 `index.js` 重启宿主。

```bash
node --check index.js
node --check client.js
node --test test/*.test.js
```

`test/proxy.test.js` 用假的 `ctx.webServer` / `ctx.connection` 检验宿主路由契约：参数白名单、缓存命中、`429` 透传、方法守卫，以及准入围栏。`test/client.test.js` 在 VM 里加载 `client.js`，覆盖标签页注册、Markdown 渲染、缩略图抽取和论文查询串。

## 隐私

- 面板从不直接连 ShellPulse：宿主半在用户自己机器上请求 `api.shellpulse.xyz`、`arxiv.org`、`ar5iv.labs.arxiv.org`。
- `AI 解读` / `和 AI 聊聊` 只往输入框里放文本，用户按回车之前什么都不发送。
- `解释这段` / `翻译这段` 把选段和论文标题发到用户在 Harness 里配置的模型（`ctx.llm`），不经过 ShellPulse 服务器，也不落盘。这条路由在 Connection 围栏后面（仅同源浏览器会话）、要求 JSON body、每分钟最多 10 次，所以别的页面花不掉用户的额度。
- 不需要任何 API key、token 或账号。图片走本地代理，只在内存里缓存；图标同理——解析 `<link rel="icon">` 意味着宿主读一次发布方首页，然后把图标在内存里存一周。
- 列表缩略图直接从发布方 CDN 加载，不带 referrer（浏览器不会再多请求别的地址），不经过宿主代理。

## 限制

- 公开 API 没有搜索接口，所以面板没有搜索框。
- 完整正文和译文只留在详情视图，列表行还是回到原文。
- 论文标签依赖后端的 `source_prefix`；2026-11-17 之前的 ShellPulse 部署会忽略该参数，标签退化成混合的 `category=papers` 流。
- 找不到图标的来源（对所有客户端都 403 的 WAF，或页面只声明了一个空的 `data:` 图标）保留首字母色块，而不是破图。
- 右侧栏需要会话；没有会话就没有地方挂这个标签页。

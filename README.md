# ShellPulse 新闻 · DeepSeek Harness 插件

在 DSH 右侧栏直接刷 [ShellPulse](https://www.shellpulse.xyz/) 的 AI 信息流：热点榜、最新时间线、精选、教程和 arXiv 论文，带中文标题、中文摘要和 AI 解读。

[![npm](https://img.shields.io/npm/v/@lukema/dsh-news?label=npm&color=blue)](https://www.npmjs.com/package/@lukema/dsh-news)
[![DSH](https://img.shields.io/badge/DSH-%E2%89%A5%200.2.2--rc.1%20%3C%200.3.0-4b5563)](https://github.com/deepseek-ai/dsh)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![catalog](https://img.shields.io/badge/awesome--dsh--plugin-listed-6b7280)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/lukema95__dsh-news.yml)

> English · [README.en.md](README.en.md)

## 截图

| 新闻时间线 | 热点榜 |
| :---: | :---: |
| ![新闻时间线：列表行带发布方图标、缩略图、AI 评分](https://raw.githubusercontent.com/lukema95/dsh-news/main/assets/screenshots/news-list.webp) | ![热点榜：带名次、热点标签与多来源计数](https://raw.githubusercontent.com/lukema95/dsh-news/main/assets/screenshots/hot-ranking.webp) |

| 论文（仅 arXiv） | 论文原文 + 划词翻译与解释 |
| :---: | :---: |
| ![论文标签只显示 arXiv 来源](https://raw.githubusercontent.com/lukema95/dsh-news/main/assets/screenshots/papers-arxiv.webp) | ![arXiv 原文阅读，选中文字后可翻译或解释](https://raw.githubusercontent.com/lukema95/dsh-news/main/assets/screenshots/paper-reader.webp) |

## 功能

- **两个入口**：右侧栏标签页（和 Files / Browser / Terminal 并排，看新闻时对话不消失）与左侧导航的 **AI 新闻** 整页（不想让对话占掉一半宽度时用）；两者共用同一套实现。
- **五个视图**：新闻（`all`，可加载更多）、精选（`featured`）、热点（`hot`，服务端 Top 20）、教程、论文（**仅 arXiv**）。除教程和论文外，其余视图带分类筛选（数据来自 `/api/meta`）。
- **列表**：发布方图标（宿主解析 `<link rel="icon">`，失败退回首字母）、来源、相对时间、多来源计数（N 家报道）、`热点` / `精选` 标签、AI 评分，以及摘要右侧的 16:9 缩略图。
- **详情**：点一条读全文——标题、模型摘要、中文正文（缺失时用原文）、译文截断提示、分类，以及 `打开原文` / `复制链接`；返回后列表的视图和筛选条件不变。
- **AI 动作**：`AI 解读`（结构化解释这篇文章）和 `和 AI 聊聊`（讨论开场白）把提示词放进当前会话输入框，由你确认后发送；整页入口没有输入框时改为复制到剪贴板。
- **论文阅读**：`加载原文` 取 arXiv 官方 HTML 版，连 arXiv 自己的样式一起挂进 shadow root，字体排印、表格、图注和 MathML 都保留；选中任意段落可 `解释这段` / `翻译这段`。
- **给 agent 读同一篇文章**：宿主注册 `shellpulse_article` 工具，返回同一篇文章的标题、来源、摘要与正文，AI 分析和追问不用重新抓发布方页面。
- **安全**：所有 `/shellpulse/*` 路由在入口处先过 DSH Connection 的 Host/Origin 围栏与浏览器登录校验，未通过直接 `401` / `403`，不会打到上游、模型或发布方。

## 安装

### 插件市场（推荐）

在 Harness 里打开 **插件 → 发现**，搜索 `dsh-news` 或 `ShellPulse`，点安装。

### npm / 命令行

```bash
dsh plugin --profile <profile> add @lukema/dsh-news
```

### 从源码

```bash
git clone https://github.com/lukema95/dsh-news.git
cd dsh-news
dsh plugin --profile <profile> add link:$PWD
```

装好后重启一次宿主（`index.js` 是宿主半，需要重新加载），再刷新页面。

## 使用

- 入口：左侧导航的 **AI 新闻**（整页）或右侧栏 **+** → 引导里的 **AI 新闻**（窄标签页）。
- 顶部标签切换五个视图；`新闻` / `精选` / `热点` 有分类下拉，`论文` 固定 arXiv，`教程` 不带分类。
- 列表底部 `加载更多` 翻页；右上角 `刷新`；每 60 秒探测一次新内容，出现 `N 条新内容` 横条而不是悄悄重排。
- 点任意一条进入详情；详情里可 `AI 解读`、`和 AI 聊聊`、`加载原文`（论文）、`打开原文`、`复制链接`。
- 论文视图里选中文字，浮出 `解释这段` / `翻译这段`。

## 配置

在 profile 的 `cordis.patch.yml` 里覆盖默认值：

```yaml
- insert:
    - id: shellpulse-news
      name: '@lukema/dsh-news'
      config:
        apiBase: https://api.shellpulse.xyz   # 换部署地址，或 http://127.0.0.1:8000
        cacheSeconds: 45                      # 宿主缓存秒数，0 关闭（上限 600）
        llmProvider: deepseek-official        # AI 翻译/解释用的模型提供方
        llmModel: deepseek-flash              # 模型 id
```

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `apiBase` | `https://api.shellpulse.xyz` | 上游 API 地址，可指向自建部署 |
| `cacheSeconds` | `45` | 宿主内存缓存秒数，`0` 关闭，最大 `600` |
| `llmProvider` | `deepseek-official` | `解释这段` / `翻译这段` 使用的提供方 |
| `llmModel` | `deepseek-flash` | 同上，模型 id |

配置在插件激活时读一次；改完重载宿主。

## 架构

浏览器半不直连公开 API（生产 CORS 是 origin 白名单，而 Harness 页面 origin 可能是变化的回环端口），所以宿主半在宿主自己的 web server 上注册同源代理：

```
浏览器:  fetch('/shellpulse/feed?view=hot')
              │
宿主:    ctx.webServer.register({ kind: 'prefix', path: '/shellpulse' })
              ├─ GET /shellpulse/feed      → https://api.shellpulse.xyz/api/feed
              ├─ GET /shellpulse/meta      → /api/meta
              ├─ GET /shellpulse/head      → /api/feed/head
              ├─ GET /shellpulse/item/:id  → /api/item/:id
              ├─ GET /shellpulse/img?u=…   → 发布方图片（仅 arXiv 域名）
              ├─ GET /shellpulse/paper?id=… → arXiv HTML + 其样式表
              └─ GET /shellpulse/icon?u=…  → 发布方自己的 favicon
              │  参数白名单 · 45 秒缓存 · 单飞 · 8 秒超时
              ▼
          https://api.shellpulse.xyz
```

代理遵守的规则：

- **先过围栏**：`inject` 声明 `connection`，每个请求在解析 URL 之前调用 `ctx.connection.requestRejection(req)`；外部 Host/Origin、跨站请求、没有浏览器登录会话的调用者一律 `401` / `403`。
- **只读、固定上游**：只允许 `GET` / `HEAD`，其余回 `405`；上游 origin 和路由集合固定。唯一直接读发布方的是 `/shellpulse/icon`，它只接受公网 `http(s)` origin——回环、RFC 1918、link-local、CGNAT 字面量拒绝，域名必须只解析到公网地址，重定向逐跳校验（最多 3 跳），只返回 512 KB 内的 `image/*`。
- **参数白名单**：`limit` ≤ 50、`hours` ≤ 720，只认已知视图、语言与来源前缀；未知参数回 `400`。
- **缓存与失败**：只缓存成功响应（按路由 + 查询串），上游 `429` 连同 `Retry-After` 透传，网络失败回短 JSON `502`；响应是 `no-store`，浏览器不再加一层缓存。

<details>
<summary>实现细节（图标发现、图片代理、Markdown 渲染、净化、缓存与工具）</summary>

- **图标发现**：`GET /shellpulse/icon?u=<origin>` 先试 `/favicon.ico`，再解析页面里的 `<link rel="icon|shortcut icon|apple-touch-icon">`（按 `sizes` 打分，相对路径同时按文档和站点根解析），然后试 `www.` / 非 `www.` 写法与 `/apple-touch-icon.png`；只收 `image/*`，字节缓存一周。对非浏览器客户端一律 403 的站点（WAF）停在首字母。
- **图片代理**：`sanitizeArxivHtml` 把白名单插图（`arxiv.org`、`static.arxiv.org`、`ar5iv.labs.arxiv.org`）改写成 `/shellpulse/img?u=…`；宿主再校验域名、拒绝非 `image/*` 与超过 8 MB 的内容，缓存一小时。列表缩略图不走上游代理，直接带 `no-referrer` 从发布方 CDN 加载。
- **Markdown 渲染**：代码块、标题、有序/无序列表、引用、GitHub 表格、分隔线、行内代码/加粗/链接都渲染成 React 节点而不是 HTML；`1.动作空间` 这类点后不带空格的编号和 `1、` 也算有序列表，不认识的写法保持纯文本。
- **净化**：论文 HTML 先由宿主剥掉脚本、frame 和事件处理器，客户端再用 `DOMParser` 复检并套 DOM 白名单——丢掉可执行/可跳转元素、所有 `on*` 与 `style` 属性，以及任何不是本地图片代理的 `src`；论文 CSS 去掉 `@import` 和指向非 arXiv 的 `url()`。
- **为什么不用 KaTeX/MathJax**：插件没有构建步骤和资源管线，也不该把 CDN 脚本加载进离线应用；arXiv 的 HTML 自带 MathML，Chromium 原生排版。
- **首次引导**：面板每个浏览器 profile 自动展开一次（`dsh.shellpulse.news.intro.v1`），之后关掉就保持关掉。

</details>

## 隐私

- 面板不直连 ShellPulse：宿主半在你自己机器上请求 `api.shellpulse.xyz`、`arxiv.org`、`ar5iv.labs.arxiv.org`，以及解析图标时读一次发布方首页。
- `AI 解读` / `和 AI 聊聊` 只往输入框放文本，按回车前不发送。
- `解释这段` / `翻译这段` 把选段和论文标题发到你在 Harness 里配置的模型（`ctx.llm`），不经过 ShellPulse，也不落盘；该路由在围栏后面、要求 JSON body、每分钟最多 10 次。
- 不需要任何 API key、token 或账号。图片与图标只在内存里缓存；列表缩略图从发布方 CDN 加载时不带 referrer。

## 兼容性与已知限制

- 需要 **DSH ≥ 0.2.2-rc.1 < 0.3.0**（`package.json` 的 `engines.dsh`）。
- 论文标签依赖后端 `source_prefix` 参数；2026-11-17 之前的 ShellPulse 部署会忽略它，标签退化成混合的 `category=papers` 流。
- 公开 API 没有搜索接口，所以面板没有搜索框。
- 找不到图标的来源（WAF 拒绝所有客户端，或页面只声明空的 `data:` 图标）保留首字母色块；CDN 拒绝无 referrer 请求的缩略图则整块不显示，不会出现破图。
- 右侧栏需要会话；没有会话就没有地方挂这个标签页。

## 常见问题

**面板打开是空白 / 一直转圈？**
先看宿主日志里有没有 `401` / `403`。这两个码说明请求没通过 Connection 围栏——通常是页面不是从宿主自己的地址打开的（例如静态预览），或者登录会话丢失；重新打开宿主打印的 URL 即可。

**论文标签是空的？**
上游部署还不支持 `source_prefix`，会返回 0 条；让后端升级到 2026-11-17 之后的版本。

**某个来源没有图标？**
该站点对所有非浏览器客户端返回 403（WAF），或只在页面里声明了空图标。会显示首字母，不是故障。

**缩略图时有时无？**
缩略图来自发布方 CDN，部分站点（例如开了 referer 白名单的对象存储）会拒绝无 referrer 的请求；这些行保持纯文字。

## 开发

没有构建步骤：`index.js` 是普通 ESM 插件，`client.js` 是给 Harness 模块加载器用的惰性 CJS 工厂。改 `client.js` 后刷新页面；改 `index.js` 后重启宿主。

```bash
node --check index.js
node --check client.js
node --test test/*.test.js
```

`test/proxy.test.js` 用假的 `ctx.webServer` / `ctx.connection` 检验宿主路由契约：参数白名单、缓存命中、`429` 透传、方法守卫和准入围栏；`test/client.test.js` 在 VM 里加载 `client.js`，覆盖标签页注册、Markdown 渲染、缩略图抽取和论文查询串。

## 贡献

欢迎 issue 和 PR。提 PR 前请先跑上面的三条命令；改功能的 PR 请一并补测试。

## 许可证

[MIT](LICENSE) © [lukema95](https://github.com/lukema95)

## 相关链接

- npm：<https://www.npmjs.com/package/@lukema/dsh-news>
- 目录条目：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/lukema95__dsh-news.yml>
- ShellPulse：[shellpulse.xyz](https://www.shellpulse.xyz/?utm_source=dsh&utm_medium=plugin)

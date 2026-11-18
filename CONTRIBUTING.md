# 开发与贡献

这个仓库是一个 DSH 插件：`index.js` 是宿主半（Node ESM），`client.js` 是给 Harness 模块加载器用的客户端半（惰性 CJS 工厂），`cordis.patch.yml` 负责把它挂进 profile。

## 本地开发

```bash
git clone https://github.com/lukema95/dsh-news.git
cd dsh-news
dsh plugin --profile <profile> add link:$PWD
```

改完代码后：

- 改 `client.js` → 刷新页面即可（没有构建步骤）；
- 改 `index.js` → 重启宿主（宿主半不会热重载）；
- 改 `cordis.patch.yml` / 配置 → 重载宿主。

## 测试

```bash
node --check index.js
node --check client.js
node --test test/*.test.js
```

- `test/proxy.test.js`：用假的 `ctx.webServer` / `ctx.connection` 检验宿主路由契约——参数白名单、缓存命中、`429` 透传、方法守卫、准入围栏，以及图标路由的图标发现与公网限制。
- `test/client.test.js`：在 VM 里加载 `client.js`，覆盖标签页注册、Markdown 渲染（含表格）、缩略图抽取、论文查询串和标签渲染。

提 PR 前请跑完上面三条命令；改行为的 PR 请补测试。

## 目录结构

```
index.js            宿主半：/shellpulse/* 同源代理（feed、item、img、paper、explain、icon）
client.js           客户端半：右侧栏标签页、整页视图、Markdown 与 arXiv 阅读器
cordis.patch.yml    挂载到 profile 的补丁
locale/*.json       插件市场展示用的标题与描述
assets/screenshots  市场截图（由 screenshots.json 声明）
```

宿主的约定只有一句话：所有路由在入口先过 `ctx.connection.requestRejection(req)`，上游固定、只读、参数白名单，不成为通用抓取器。

## 发布

```bash
npm version patch
npm publish
```

目录条目在另一个仓库：`awesome-dsh-plugin/awesome-dsh-plugin` 的 `data/plugins/lukema95__dsh-news.yml`。描述变更需要给那边提 PR；截图不用——本仓库根目录的 `screenshots.json` 会在下一次夜间构建时被读取。

## 许可证

[MIT](LICENSE)

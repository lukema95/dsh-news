# ShellPulse news for DeepSeek Harness

The ShellPulse AI feed in your DSH right sidebar: the hot ranking, the latest timeline, featured picks, tutorials and arXiv papers, with Chinese titles and summaries when available.

[![npm](https://img.shields.io/npm/v/@lukema/dsh-news?label=npm&color=blue)](https://www.npmjs.com/package/@lukema/dsh-news)
[![DSH](https://img.shields.io/badge/DSH-%E2%89%A5%200.2.2--rc.1%20%3C%200.3.0-4b5563)](https://github.com/deepseek-ai/dsh)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![catalog](https://img.shields.io/badge/awesome--dsh--plugin-listed-6b7280)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/lukema95__dsh-news.yml)

> 中文说明见 [README.md](README.md)。The Chinese document is the primary one.

## Screenshots

![Timeline with publisher icons, thumbnails, hot/featured flags and AI scores](https://raw.githubusercontent.com/lukema95/dsh-news/main/assets/screenshots/news-list.webp)

![arXiv HTML rendered with its own typography; select text to translate or explain](https://raw.githubusercontent.com/lukema95/dsh-news/main/assets/screenshots/paper-reader.webp)

More screenshots (hot ranking, papers list) in [assets/screenshots](assets/screenshots).

## What it does

- **Two surfaces**: a right-sidebar tab next to Files / Browser / Terminal, and a full-page **AI 新闻** entry in the left rail. The conversation stays visible while you read.
- **Five views**: news (paginated), featured, hot (the server's Top 20), tutorials, and papers (**arXiv only**). The first three can be filtered by category.
- **Rows** carry a publisher mark, source, relative time, multi-source count, `热点` / `精选` flags, the AI score, and a 16:9 thumbnail to the right of the summary.
- **Detail view**: the article's title, summary, Chinese body and categories, plus `打开原文` / `复制链接`. Back keeps the list's view and filters.
- **AI actions**: `AI 解读` and `和 AI 聊聊` insert a prompt into the current Session's composer for you to review and send; in the full-page entry the prompt is copied instead.
- **Paper reader**: `加载原文` opens arXiv's HTML version with its own typography, tables, captions and formulas; selecting text offers `解释这段` / `翻译这段`.
- **Nothing to configure**: no API key, token or account, and every request leaves your own machine.

## Install

### Plugin market (recommended)

Open **Plugins → Discover** in Harness and search for `dsh-news` or `ShellPulse`.

### npm / CLI

```bash
dsh plugin --profile <profile> add @lukema/dsh-news
```

### From source

```bash
git clone https://github.com/lukema95/dsh-news.git
cd dsh-news
dsh plugin --profile <profile> add link:$PWD
```

Restart the Host once after installing, then reload the page.

## Usage

- Entry points: **AI 新闻** in the left rail (full page) or the right sidebar's **+** → **AI 新闻** (narrow tab).
- The tabs at the top switch views; `news` / `featured` / `hot` carry the category dropdown, `papers` is fixed to arXiv, `tutorials` has no category.
- `加载更多` paginates, `刷新` refreshes, and a 60-second probe shows an `N 条新内容` strip instead of silently reordering the list.
- Click a row for the detail view: `AI 解读`, `和 AI 聊聊`, `加载原文` (papers), `打开原文`, `复制链接`.
- In the paper reader, selecting text reveals `解释这段` / `翻译这段`.

## Configuration

The defaults work out of the box. To change them (for example to point at a self-hosted deployment), override the row in the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: shellpulse-news
      name: '@lukema/dsh-news'
      config:
        apiBase: https://api.shellpulse.xyz   # another deployment, or http://127.0.0.1:8000
        cacheSeconds: 45                      # Host cache in seconds, 0 disables (max 600)
        llmProvider: deepseek-official        # provider used by translate / explain
        llmModel: deepseek-flash              # model id for the same
```

| Key | Default | Meaning |
| --- | --- | --- |
| `apiBase` | `https://api.shellpulse.xyz` | Upstream API, can point at a self-hosted deployment |
| `cacheSeconds` | `45` | Host memory cache in seconds, `0` disables, maximum `600` |
| `llmProvider` | `deepseek-official` | Provider for `解释这段` / `翻译这段` |
| `llmModel` | `deepseek-flash` | Model id for the same |

Reload the Host after changing it.

## Privacy

- The panel never talks to ShellPulse directly: requests leave your machine from the Harness Host and only reach `api.shellpulse.xyz`, `arxiv.org`, `ar5iv.labs.arxiv.org`, plus the publisher's homepage once while resolving a source icon.
- `AI 解读` / `和 AI 聊聊` only put text into the composer; nothing is sent until you press Enter.
- `解释这段` / `翻译这段` send the excerpt and paper title to the model you configured in Harness, never to ShellPulse, and store nothing.
- No account or key is required; images and icons are cached in memory only, and thumbnails load from the publisher's CDN with no referrer.

## Compatibility and known limits

- Requires **DSH ≥ 0.2.2-rc.1 < 0.3.0**.
- The papers tab needs a ShellPulse backend from after 2026-11-17; older deployments show the mixed paper feed.
- The public API has no search endpoint, so there is no search box.
- A few sites provide no icon (a WAF that refuses every client) or refuse referrer-less thumbnails; those rows fall back to the initial letter or plain text, never a broken frame.
- The right sidebar needs a session; without one, use the full-page entry.

## License

[MIT](LICENSE) © [lukema95](https://github.com/lukema95)

## Links

- npm: <https://www.npmjs.com/package/@lukema/dsh-news>
- Catalog entry: <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/lukema95__dsh-news.yml>
- ShellPulse: [shellpulse.xyz](https://www.shellpulse.xyz/?utm_source=dsh&utm_medium=plugin)
- Development and contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

/**
 * ShellPulse news — Client half.
 *
 * A right-sidebar tab that shows the public ShellPulse AI feed next to the
 * conversation. All network traffic goes through the Host proxy at
 * `/shellpulse/*` (see index.js), so the page never talks to the public API
 * directly and never needs CORS.
 *
 * Plain lazy-CJS on purpose: no build step, React comes from the host module
 * table, and every style is either a local stylesheet element or a theme token.
 */

window.__ModuleLoader__.load({
  id: '@lukema/dsh-news',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const TAB_ID = '@lukema/dsh-news'
    const PANEL_ID = 'shellpulse.news'
    const KIND = 'shellpulse-news'
    const NAMESPACE = 'shellpulseNews'
    const INTRO_KEY = 'dsh.shellpulse.news.intro.v1'
    const API = '/shellpulse'
    const SITE = 'https://www.shellpulse.xyz/?utm_source=dsh&utm_medium=plugin'
    const VIEWS = ['all', 'featured', 'hot', 'tutorials', 'papers']

    const COPY = {
      zh: {
        'type.title': 'AI 新闻',
        'guide.title': 'AI 新闻',
        'guide.description': 'AI 信息流：新闻、热点、教程与论文',
        'view.hot': '热点',
        'view.all': '新闻',
        'view.featured': '精选',
        'view.tutorials': '教程',
        'view.papers': '论文',
        'category.all': '全部分类',
        'action.refresh': '刷新',
        'action.retry': '重试',
        'action.open': '打开原文',
        'action.copy': '复制链接',
        'action.copied': '已复制',
        'action.more': '加载更多',
        'action.back': '返回',
        'detail.truncated': '译文有删减，完整内容请看原文。',
        'ai.analyze': 'AI 解读',
        'ai.chat': '和 AI 聊聊',
        'action.translate': 'AI 翻译',
        'action.translating': '翻译中…',
        'action.original': '原文',
        'action.translation': '译文',
        'action.loadPaper': '加载原文',
        'paper.error': '取不到这篇论文的全文（可能没有 HTML 版本）',
        'paper.explain': '解释这段',
        'paper.translate': '翻译这段',
        'paper.explaining': '解释中…',
        'paper.explainError': '解释失败，可重试',
        'state.translateError': '翻译失败，可重试',
        'ai.inserted': '已放进输入框，按回车发送',
        'ai.copied': '已复制，粘贴到对话即可',
        'ai.prompt.analyze': '解读这条 AI 新闻，用你自己的话讲清楚，不要复述全文。\n\n标题：{title}\n来源：{source}\n链接：{url}\n文章 id：{id}\n摘要：{summary}\n\n先调用 shellpulse_article 读取全文（优先中文译文），再给出：\n1. 实际发生了什么（一句事实陈述）\n2. 关键数字与参与方\n3. 对开发者的影响\n4. 值得怀疑或需要核实的地方',
        'ai.prompt.chat': '我想聊聊这篇报道：\n\n标题：{title}\n来源：{source}\n链接：{url}\n文章 id：{id}\n\n先调用 shellpulse_article 读一下全文，然后我们从「这件事为什么重要」开始聊；不用急着总结全文。',
        'state.loading': '加载中…',
        'state.empty': '暂无内容',
        'state.error': '加载失败',
        'state.crashed': '这块内容渲染失败了',
        'state.stale': '更新失败，显示的是上次内容',
        'banner.new': '{n} 条新内容',
        'meta.stories': '{n} 家报道',
        'meta.score': 'AI 评分 {n}',
        'badge.hot': '热点',
        'badge.featured': '精选',
        'footer.source': '数据来自 shellpulse.xyz',
        'time.now': '刚刚',
        'time.minutes': '{n} 分钟前',
        'time.hours': '{n} 小时前',
        'time.days': '{n} 天前',
      },
      en: {
        'type.title': 'AI news',
        'guide.title': 'AI news',
        'guide.description': 'AI feed: news, trending, tutorials and papers',
        'view.hot': 'Trending',
        'view.all': 'News',
        'view.featured': 'Featured',
        'view.tutorials': 'Tutorials',
        'view.papers': 'Papers',
        'category.all': 'All categories',
        'action.refresh': 'Refresh',
        'action.retry': 'Retry',
        'action.open': 'Open article',
        'action.copy': 'Copy link',
        'action.copied': 'Copied',
        'action.more': 'Load more',
        'action.back': 'Back',
        'detail.truncated': 'The translation is truncated — open the original for the full text.',
        'ai.analyze': 'Explain with AI',
        'ai.chat': 'Discuss with AI',
        'action.translate': 'Translate with AI',
        'action.translating': 'Translating…',
        'action.original': 'Original',
        'action.translation': 'Translation',
        'action.loadPaper': 'Load full paper',
        'paper.error': 'Could not load the full paper (no HTML version available)',
        'paper.explain': 'Explain selection',
        'paper.translate': 'Translate selection',
        'paper.explaining': 'Explaining…',
        'paper.explainError': 'Explanation failed — try again',
        'state.translateError': 'Translation failed — try again',
        'ai.inserted': 'Added to the composer — press Enter to send',
        'ai.copied': 'Copied — paste it into the chat',
        'ai.prompt.analyze': 'Explain this AI news item in your own words; do not restate the whole article.\n\nTitle: {title}\nSource: {source}\nURL: {url}\nArticle id: {id}\nSummary: {summary}\n\nCall shellpulse_article first to read the stored full text (prefer the Chinese translation), then cover:\n1. what actually happened (one factual sentence)\n2. key numbers and parties involved\n3. what it means for developers\n4. what is worth doubting or verifying',
        'ai.prompt.chat': 'I want to talk about this article:\n\nTitle: {title}\nSource: {source}\nURL: {url}\nArticle id: {id}\n\nCall shellpulse_article first to read the full text, then start with why this matters; no need to summarise the whole piece.',
        'state.loading': 'Loading…',
        'state.empty': 'Nothing here yet',
        'state.error': 'Could not load the feed',
        'state.crashed': 'This view failed to render',
        'state.stale': 'Update failed — showing the previous result',
        'banner.new': '{n} new',
        'meta.stories': '{n} sources',
        'meta.score': 'AI score {n}',
        'badge.hot': 'Hot',
        'badge.featured': 'Featured',
        'footer.source': 'Data from shellpulse.xyz',
        'time.now': 'just now',
        'time.minutes': '{n}m ago',
        'time.hours': '{n}h ago',
        'time.days': '{n}d ago',
      },
    }

    const CSS = `
.sp-news-root,.sp-news-root *{box-sizing:border-box}
.sp-news-root{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;font-family:var(--dsw-font-family,inherit)}
.sp-news-root.is-page{width:100%;max-width:920px;margin:0 auto}
.sp-news-root.is-page .sp-news-title{font-size:16px}
.sp-news-root.is-page .sp-news-row{padding:18px 24px 20px}
.sp-news-root.is-page .sp-news-header{padding:10px 20px}
.sp-news-root.is-page .sp-news-detail{margin:2px 24px 18px}
.sp-news-root.is-page .sp-news-summary{font-size:13px}
.sp-news-root.is-page .sp-news-meta{font-size:11.5px}
.sp-news-root.is-page .sp-news-article{padding:28px 40px 44px}
.sp-news-root.is-page .sp-news-article-title{font-size:22px}
.sp-news-root.is-page .sp-news-body{font-size:14px;line-height:1.85}
.sp-news-root.is-page .sp-news-paper{font-size:16px}
.sp-news-root.is-page .sp-news-footer{padding:8px 20px}
.sp-news-header{display:flex;flex:0 0 auto;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.sp-news-tabs{display:flex;gap:2px;padding:2px;border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.sp-news-tab{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;padding:2px 10px;border-radius:6px;cursor:pointer}
.sp-news-tab[aria-pressed="true"]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv1)}
.sp-news-spacer{flex:1 1 auto}
.sp-news-icon{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.sp-news-icon:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.sp-news-icon[disabled]{opacity:.45;cursor:default}
.sp-news-select{max-width:120px;height:24px;padding:0 4px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px}
.sp-news-banner{display:block;width:100%;padding:6px 12px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;text-align:left;cursor:pointer}
.sp-news-banner:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sp-news-list{flex:1 1 auto;min-height:0;margin:0;padding:0;list-style:none;overflow-y:auto;overscroll-behavior:contain}
.sp-news-item{border-bottom:1px solid var(--dsw-alias-border-l1)}
.sp-news-item:last-child{border-bottom:0}
.sp-news-row{display:block;width:100%;padding:15px 16px 17px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background .12s ease}
.sp-news-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sp-news-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 7px;margin:0 0 7px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.4;min-width:0}
/* Solid pills, not tinted labels: both flags have to read at a glance in either
   theme. The label-primary / label-primary-inverted pair is flipped by the theme,
   so 精选 is a near-black pill in light mode and a near-white one in dark mode;
   热点 keeps the fixed amber fill with near-black text, legible on both. */
.sp-news-badge{display:inline-flex;align-items:center;height:18px;padding:0 7px;border:0;border-radius:999px;font-size:10.5px;line-height:1;font-weight:600;letter-spacing:.01em;white-space:nowrap;flex:0 0 auto}
.sp-news-badge.is-hot{color:var(--dsw-static-neutral-bluish-900,#1b1b1c);background:var(--dsw-alias-state-warn-primary,#f59e0b);box-shadow:inset 0 0 0 1px rgb(0 0 0 / .08)}
.sp-news-badge.is-featured{color:var(--dsw-alias-label-primary-inverted,#fff);background:var(--dsw-alias-label-primary,#1b1b1c)}
.sp-news-root.is-page .sp-news-badge{height:19px;font-size:11px;padding:0 8px}
.sp-news-src{display:inline-flex;align-items:center;gap:5px;min-width:0}
.sp-news-src-img{width:14px;height:14px;border-radius:3px;object-fit:cover;flex:0 0 auto;background:var(--dsw-alias-bg-layer-2)}
.sp-news-src-letter{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:3px;flex:0 0 auto;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:9px;font-weight:600;line-height:1}
.sp-news-src-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;color:var(--dsw-alias-label-secondary)}
.sp-news-dot{color:var(--dsw-alias-label-tertiary)}
.sp-news-score{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap;letter-spacing:.01em}
.sp-news-flex{display:flex;gap:12px;align-items:flex-start;margin-top:6px}
.sp-news-main{flex:1 1 auto;min-width:0}
.sp-news-thumb{flex:0 0 auto;width:92px;height:52px;border-radius:6px;object-fit:cover;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.sp-news-root.is-page .sp-news-thumb{width:132px;height:74px;border-radius:8px}
.sp-news-headline{display:flex;align-items:baseline;gap:8px}
.sp-news-rank{flex:0 0 auto;min-width:18px;color:var(--dsw-alias-label-tertiary);font-size:14px;font-weight:400;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.sp-news-title{flex:1 1 auto;font-size:14.5px;font-weight:500;line-height:1.5;letter-spacing:.005em;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.sp-news-summary{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.65}
.sp-news-detail{margin:2px 16px 16px;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.sp-news-detail p{margin:0 0 10px;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.65}
.sp-news-actions{display:flex;gap:8px;align-items:center}
.sp-news-action{border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:22px;padding:2px 12px;text-decoration:none;cursor:pointer}
.sp-news-action:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sp-news-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.sp-news-tag{color:var(--dsw-alias-label-tertiary);font-size:11px}
.sp-news-more{display:flex;justify-content:center;padding:12px}
.sp-news-state{display:flex;flex:1 1 auto;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px 16px;color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center}
.sp-news-state.is-error{color:var(--dsw-alias-state-error-primary)}
.sp-news-skeleton{height:56px;margin:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:linear-gradient(90deg,transparent,var(--dsw-alias-bg-layer-1),transparent);background-size:200% 100%;animation:sp-news-pulse 1.4s ease-in-out infinite}
@keyframes sp-news-pulse{0%{background-position:200% 0}100%{background-position:-200% 0}}
.sp-news-detailbar{padding:8px 32px}
.sp-news-root.is-page .sp-news-detailbar{padding:10px 40px}
.sp-news-back{display:inline-flex;align-items:center;gap:4px;margin-left:-4px;padding:4px 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.sp-news-back:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.sp-news-article{flex:1 1 auto;min-height:0;width:100%;overflow-y:auto;overscroll-behavior:contain;padding:22px 32px 36px}
.sp-news-article-title{margin:0 0 10px;font-size:17px;font-weight:600;line-height:1.45;letter-spacing:.005em;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.sp-news-article-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 7px;margin-bottom:16px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.sp-news-lead{margin:0 0 16px;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.7}
.sp-news-truncate{margin:0 0 14px;padding-left:10px;border-left:2px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.6}
.sp-news-paper-shadow{display:block;max-width:100%}
.sp-news-paper{max-width:68ch;margin:0 auto;font-family:'Iowan Old Style','Source Serif 4',Georgia,'Songti SC','Noto Serif CJK SC',serif;font-size:15px;line-height:1.78;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.sp-news-paper p{margin:0 0 15px}
.sp-news-paper h1,.sp-news-paper h2{margin:34px 0 14px;font-size:18px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary);letter-spacing:.01em}
.sp-news-paper h3,.sp-news-paper h4{margin:26px 0 10px;font-size:16px;font-weight:600;line-height:1.45;color:var(--dsw-alias-label-primary)}
.sp-news-paper h5,.sp-news-paper h6{margin:20px 0 8px;font-size:15px;font-weight:600;line-height:1.45;color:var(--dsw-alias-label-primary)}
.sp-news-paper ul,.sp-news-paper ol{margin:0 0 15px;padding-left:24px}
.sp-news-paper li{margin:5px 0}
.sp-news-paper figure{margin:24px 0;text-align:center}
.sp-news-paper img{display:block;max-width:100%;height:auto;margin:0 auto}
.sp-news-paper figcaption{margin:10px auto 0;max-width:90%;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary);text-align:center;font-family:var(--dsw-font-family,inherit)}
.sp-news-paper table{margin:20px auto;border-collapse:collapse;font-size:12px;line-height:1.5;font-family:var(--dsw-font-family,inherit)}
.sp-news-paper td,.sp-news-paper th{padding:5px 10px;border:1px solid var(--dsw-alias-border-l1);vertical-align:top;text-align:left}
.sp-news-paper pre{margin:0 0 16px;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);overflow-x:auto}
.sp-news-paper code{font-family:var(--dsw-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px}
.sp-news-paper blockquote{margin:0 0 15px;padding-left:14px;border-left:2px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-tertiary)}
.sp-news-paper math[display="block"]{display:block;margin:18px auto;overflow-x:auto;overflow-y:hidden;text-align:center}
.sp-news-explain-actions{position:fixed;z-index:40;display:flex;gap:6px;transform:translate(-50%,-120%)}
.sp-news-explain-btn{padding:4px 10px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;line-height:16px;cursor:pointer;box-shadow:var(--dsw-shadow-lv2)}
.sp-news-explain-btn:hover{background:var(--dsw-alias-bg-base);border-color:var(--dsw-alias-border-l3)}
.sp-news-explain{position:fixed;z-index:41;width:340px;max-height:46vh;overflow-y:auto;padding:10px 12px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-shadow-lv2)}
.sp-news-explain-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;color:var(--dsw-alias-label-tertiary);font-size:11px}
.sp-news-explain-close{border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:1;padding:2px 4px;border-radius:4px;cursor:pointer}
.sp-news-explain-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.sp-news-explain .sp-news-body{margin:0;font-size:12px;line-height:1.7}
.sp-news-article-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.sp-news-tools{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px}
.sp-news-toggle{display:inline-flex;gap:2px;margin-bottom:12px;padding:2px;border-radius:7px;background:var(--dsw-alias-bg-layer-1)}
.sp-news-toggle button{border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;line-height:18px;padding:1px 10px;border-radius:5px;cursor:pointer}
.sp-news-toggle button.is-active{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.sp-news-action.is-primary{border-color:transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);font-weight:500}
.sp-news-action.is-primary:hover{opacity:.9;background:var(--dsw-alias-label-primary)}
.sp-news-hint{margin-top:10px;color:var(--dsw-alias-label-tertiary);font-size:11px}
.sp-news-action-sm{line-height:20px;padding:1px 10px;font-size:11px}
.sp-news-body{margin-top:18px;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l1);font-size:13px;line-height:1.8;color:var(--dsw-alias-label-secondary)}
.sp-md-p{margin:0 0 14px;white-space:pre-wrap;overflow-wrap:anywhere}
.sp-md-h{margin:24px 0 10px;font-weight:600;line-height:1.45;color:var(--dsw-alias-label-primary)}
.sp-md-h:first-child{margin-top:0}
h3.sp-md-h{font-size:15px}
h4.sp-md-h{font-size:14px}
h5.sp-md-h,h6.sp-md-h{font-size:13px}
.sp-md-list{margin:0 0 14px;padding-left:20px}
.sp-md-list li{margin:5px 0;line-height:1.8;overflow-wrap:anywhere}
.sp-md-pre{margin:0 0 16px;padding:12px 14px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);overflow-x:auto}
.sp-md-pre-code{font-family:var(--dsw-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:1.7;color:var(--dsw-alias-label-primary);white-space:pre}
.sp-md-code{padding:1px 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-1);font-family:var(--dsw-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;color:var(--dsw-alias-label-primary)}
.sp-md-quote{margin:0 0 14px;padding:2px 0 2px 12px;border-left:2px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-tertiary)}
.sp-md-img{display:block;max-width:100%;height:auto;margin:14px 0;border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.sp-md-img-fallback{display:inline-block;margin:6px 0;color:var(--dsw-alias-label-tertiary);font-size:11px}
.sp-md-hr{margin:20px 0;border:0;border-top:1px solid var(--dsw-alias-border-l1)}
.sp-md-table-wrap{margin:0 0 16px;overflow-x:auto}
.sp-md-table{border-collapse:collapse;width:100%;font-size:12.5px;line-height:1.65}
.sp-md-table th,.sp-md-table td{padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);vertical-align:top;white-space:normal;overflow-wrap:anywhere}
.sp-md-table th{background:var(--dsw-alias-bg-layer-1);font-weight:600;color:var(--dsw-alias-label-primary)}
.sp-md-table td{color:var(--dsw-alias-label-secondary)}
.sp-md-link{color:var(--dsw-alias-label-primary);text-decoration:underline;text-underline-offset:2px}
.sp-md-link:hover{color:var(--dsw-alias-brand-text,var(--dsw-alias-label-primary))}
.sp-news-progress{position:relative;flex:0 0 auto;height:2px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.sp-news-progress::after{content:'';position:absolute;inset:0;width:40%;background:var(--dsw-alias-label-tertiary);animation:sp-news-progress 1.1s ease-in-out infinite}
@keyframes sp-news-progress{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
@media (prefers-reduced-motion:reduce){.sp-news-progress::after{animation:none;width:100%;opacity:.5}}
.sp-news-footer{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px}
.sp-news-footer a{color:inherit;text-decoration:none}
.sp-news-footer a:hover{color:var(--dsw-alias-label-secondary);text-decoration:underline}
.sp-news-root button:focus-visible,.sp-news-root a:focus-visible,.sp-news-root [role="button"]:focus-visible,.sp-news-root select:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.sp-news-skeleton{animation:none}}
`

    async function requestJson(path, signal) {
      const response = await fetch(API + path, { signal, headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    }

    /** Only arXiv items have a paper reader; everything else keeps the link out. */
    function isPaperUrl(url) {
      return /^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\//i.test(String(url || ''))
    }

    /**
     * The papers tab is the arXiv feed and nothing else: `source_prefix` selects
     * every `arxiv-*` source (including future categories), while `category` is
     * deliberately absent — the backend reads it as a keyword filter and drops
     * roughly a third of the arXiv items it is applied to.
     */
    function feedQuery(view, category, force = false) {
      const papers = view === 'papers'
      const fixedCategory = view === 'tutorials' ? 'tutorials' : ''
      const apiView = papers || fixedCategory ? 'all' : view
      const params = new URLSearchParams()
      params.set('view', apiView)
      if (papers) params.set('source_prefix', 'arxiv-')
      else if (fixedCategory) params.set('category', fixedCategory)
      else if (category) params.set('category', category)
      if (apiView === 'all') {
        params.set('limit', '15')
        params.set('include_total', 'false')
      }
      // Bypass the Host cache for an explicit refresh or a new-content jump.
      if (force) params.set('refresh', '1')
      return `/feed?${params.toString()}`
    }

    /**
     * First publisher image carried by the item's summary. The site extracts the
     * same markdown/HTML image for its list thumbnails; the API has no dedicated
     * image field, so the summary is the only source.
     */
    const SUMMARY_MD_IMAGE = /!\[([^\]\n]*)\]\((https?:\/\/[^)\s]+)\)/
    const SUMMARY_HTML_IMAGE = /<img\b[^>]*\ssrc=["'](https?:\/\/[^"']+)["']/i
    function thumbOf(item) {
      const raw = typeof item.summary === 'string' ? item.summary : ''
      if (raw === '') return null
      const markdown = SUMMARY_MD_IMAGE.exec(raw)
      if (markdown !== null) return { src: markdown[2], alt: markdown[1] }
      const html = SUMMARY_HTML_IMAGE.exec(raw)
      if (html !== null) return { src: html[1], alt: '' }
      return null
    }

    /** List thumbnail; a blocked or broken image simply disappears. */
    function NewsThumb({ src, alt }) {
      const [failed, setFailed] = useState(false)
      if (failed) return null
      return h('img', {
        className: 'sp-news-thumb',
        src,
        alt: alt || '',
        loading: 'lazy',
        referrerPolicy: 'no-referrer',
        onError: () => setFailed(true),
      })
    }

    function titleOf(item) {
      return item.title_zh && item.title_zh.trim() !== '' ? item.title_zh : item.title
    }

    /**
     * Row summary: the model summary when present, otherwise the publisher text.
     * Embedded image markup is dropped — the row shows the picture as a thumbnail.
     */
    function summaryOf(item) {
      const summary = item.llm_summary && item.llm_summary.trim() !== '' ? item.llm_summary : item.summary
      if (!summary) return ''
      return String(summary)
        .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, ' ')
        .replace(/<img\b[^>]*>/gi, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, ' ')
        .trim()
    }

    function newestPublishedAt(items) {
      let newest = 0
      for (const item of items) {
        const time = Date.parse(item.published_at)
        if (!Number.isNaN(time) && time > newest) newest = time
      }
      return newest === 0 ? null : new Date(newest).toISOString()
    }

    function relativeTime(iso, t) {
      const then = Date.parse(iso)
      if (Number.isNaN(then)) return ''
      const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000))
      if (minutes < 1) return t('time.now')
      if (minutes < 60) return t('time.minutes', { n: minutes })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('time.hours', { n: hours })
      const days = Math.floor(hours / 24)
      if (days < 30) return t('time.days', { n: days })
      return new Date(then).toLocaleDateString()
    }

    function clockOf(timestamp) {
      // 24-hour on purpose: the browser locale may be en-US while the Host UI
      // is Chinese, and a mixed "09:00 AM" next to Chinese copy reads wrong.
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    }

    const INLINE_RULES = [
      {
        re: /!\[([^\]\n]*)\]\((https?:\/\/[^)\s]+)\)/,
        build: (m, key) => h(MarkdownImage, { key, src: m[2], alt: m[1] }),
      },
      {
        re: /`([^`\n]+)`/,
        build: (m, key) => h('code', { key, className: 'sp-md-code' }, m[1]),
      },
      {
        re: /\*\*([^*\n]+)\*\*/,
        build: (m, key) => h('strong', { key }, m[1]),
      },
      {
        re: /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/,
        build: (m, key) =>
          h(
            'a',
            { key, className: 'sp-md-link', href: m[2], target: '_blank', rel: 'noopener noreferrer' },
            m[1],
          ),
      },
      {
        re: /\*([^*\n]+)\*/,
        build: (m, key) => h('em', { key }, m[1]),
      },
    ]

    /** Article illustration; a broken or blocked image degrades to its caption. */
    function MarkdownImage({ src, alt }) {
      const [failed, setFailed] = useState(false)
      if (failed) return h('span', { className: 'sp-md-img-fallback' }, alt || '')
      return h('img', {
        className: 'sp-md-img',
        src,
        alt: alt || '',
        loading: 'lazy',
        referrerPolicy: 'no-referrer',
        onError: () => setFailed(true),
      })
    }

    /** Inline markdown: code, bold, links, emphasis. Returns strings and elements. */
    function renderInline(text, keyBase) {
      const out = []
      let rest = text
      let count = 0
      while (rest.length > 0) {
        let best = null
        for (const rule of INLINE_RULES) {
          const match = rule.re.exec(rest)
          if (match !== null && (best === null || match.index < best.match.index)) best = { rule, match }
        }
        if (best === null) {
          out.push(rest)
          break
        }
        if (best.match.index > 0) out.push(rest.slice(0, best.match.index))
        out.push(best.rule.build(best.match, `${keyBase}-${count++}`))
        rest = rest.slice(best.match.index + best.match[0].length)
      }
      return out
    }

    /**
     * Small block-level markdown renderer: fences, headings, lists, quotes,
     * GitHub tables, rules and paragraphs. React elements only — no HTML is ever
     * interpreted, so article text cannot inject markup.
     */
    function renderMarkdown(source) {
      const lines = String(source).replace(/\r\n?/g, '\n').split('\n')
      const blocks = []
      let index = 0
      let key = 0
      const isBullet = (line) => /^\s*[-*+]\s+/.test(line)
      // CJK copy often writes "1.动作空间" without a space after the marker.
      const isOrdered = (line) => /^\s*\d{1,3}[.)．、](?:\s+|(?=[^\d\s]))/.test(line)
      const isFence = (line) => /^\s*```/.test(line)
      const isHeading = (line) => /^#{1,6}\s+/.test(line)
      const isQuote = (line) => /^\s*>\s?/.test(line)
      const cellsOf = (line) =>
        line
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim())
      const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line)
      const isTableDivider = (line) => cellsOf(line).every((cell) => /^:?-{2,}:?$/.test(cell))
      const startsTable = (at) => at + 1 < lines.length && isTableRow(lines[at]) && isTableDivider(lines[at + 1])
      const alignOf = (cell) => {
        const left = cell.startsWith(':')
        const right = cell.endsWith(':')
        if (left && right) return 'center'
        return right ? 'right' : 'left'
      }

      while (index < lines.length) {
        const line = lines[index]
        if (line.trim() === '') {
          index += 1
          continue
        }
        if (isFence(line)) {
          index += 1
          const code = []
          while (index < lines.length && !isFence(lines[index])) {
            code.push(lines[index])
            index += 1
          }
          index += 1
          blocks.push(
            h(
              'pre',
              { key: key++, className: 'sp-md-pre' },
              h('code', { className: 'sp-md-pre-code' }, code.join('\n')),
            ),
          )
          continue
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading !== null) {
          const level = Math.min(heading[1].length + 2, 6)
          blocks.push(
            h(`h${level}`, { key: key++, className: 'sp-md-h' }, renderInline(heading[2], `h${key}`)),
          )
          index += 1
          continue
        }
        if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
          blocks.push(h('hr', { key: key++, className: 'sp-md-hr' }))
          index += 1
          continue
        }
        if (isQuote(line)) {
          const quote = []
          while (index < lines.length && isQuote(lines[index])) {
            quote.push(lines[index].replace(/^\s*>\s?/, ''))
            index += 1
          }
          blocks.push(
            h('blockquote', { key: key++, className: 'sp-md-quote' }, renderInline(quote.join('\n'), `q${key}`)),
          )
          continue
        }
        if (startsTable(index)) {
          const header = cellsOf(lines[index])
          const aligns = cellsOf(lines[index + 1]).map(alignOf)
          index += 2
          const rows = []
          while (index < lines.length && isTableRow(lines[index])) {
            rows.push(cellsOf(lines[index]))
            index += 1
          }
          const tableKey = key++
          blocks.push(
            h(
              'div',
              { key: tableKey, className: 'sp-md-table-wrap' },
              h(
                'table',
                { className: 'sp-md-table' },
                h(
                  'thead',
                  {},
                  h(
                    'tr',
                    {},
                    header.map((cell, column) =>
                      h(
                        'th',
                        { key: column, style: { textAlign: aligns[column] ?? 'left' } },
                        renderInline(cell, `th${tableKey}-${column}`),
                      ),
                    ),
                  ),
                ),
                h(
                  'tbody',
                  {},
                  rows.map((row, rowIndex) =>
                    h(
                      'tr',
                      { key: rowIndex },
                      header.map((_, column) =>
                        h(
                          'td',
                          { key: column, style: { textAlign: aligns[column] ?? 'left' } },
                          renderInline(row[column] ?? '', `td${tableKey}-${rowIndex}-${column}`),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          )
          continue
        }
        if (isBullet(line) || isOrdered(line)) {
          const ordered = isOrdered(line)
          const items = []
          while (index < lines.length && (ordered ? isOrdered(lines[index]) : isBullet(lines[index]))) {
            items.push(lines[index].replace(ordered ? /^\s*\d{1,3}[.)．、]\s*/ : /^\s*[-*+]\s+/, ''))
            index += 1
          }
          blocks.push(
            h(
              ordered ? 'ol' : 'ul',
              { key: key++, className: 'sp-md-list' },
              items.map((text, itemIndex) => h('li', { key: itemIndex }, renderInline(text, `li${key}-${itemIndex}`))),
            ),
          )
          continue
        }
        const paragraph = []
        while (
          index < lines.length &&
          lines[index].trim() !== '' &&
          !isFence(lines[index]) &&
          !isHeading(lines[index]) &&
          !isQuote(lines[index]) &&
          !isBullet(lines[index]) &&
          !isOrdered(lines[index]) &&
          !startsTable(index)
        ) {
          paragraph.push(lines[index])
          index += 1
        }
        blocks.push(
          h('p', { key: key++, className: 'sp-md-p' }, renderInline(paragraph.join('\n'), `p${key}`)),
        )
      }
      return blocks
    }

    /**
     * Publisher mark. Prefers the icon the API carries, then the Host's icon
     * route (it resolves `<link rel="icon">` and caches the bytes), and finally
     * the source initial. No third-party favicon service is involved.
     */
    function iconProxy(url) {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
        return `/shellpulse/icon?u=${encodeURIComponent(parsed.origin)}`
      } catch {
        return null
      }
    }

    /**
     * Publisher mark. Prefers the source icon the API carries, then the origin's
     * own favicon, and finally the source initial — the same degradation the
     * public site uses, minus the Google favicon service.
     */
    const PAPER_DROP = new Set([
      'script', 'style', 'noscript', 'iframe', 'object', 'embed', 'svg', 'canvas',
      'form', 'input', 'button', 'select', 'textarea', 'video', 'audio', 'source',
      'link', 'meta', 'annotation', 'annotation-xml',
    ])
    const PAPER_ALLOWED = new Set([
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'strong', 'em', 'b', 'i', 'br', 'hr', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
      'caption', 'figure', 'figcaption', 'span', 'img',
      'math', 'mrow', 'mi', 'mo', 'mn', 'ms', 'mtext', 'mspace', 'mfrac', 'msqrt', 'mroot',
      'msup', 'msub', 'msubsup', 'munder', 'mover', 'munderover', 'mtable', 'mtr', 'mtd',
      'mstyle', 'mpadded', 'menclose', 'semantics',
    ])
    const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'

    /**
     * Whitelist the paper HTML before it is injected: allowed tags keep their
     * children and lose every attribute, MathML keeps its namespace so Chromium
     * typesets formulas, and everything else is unwrapped or dropped.
     */
    function sanitizePaperHtml(html) {
      const parsed = new DOMParser().parseFromString(String(html), 'text/html')
      const output = document.createElement('div')
      const visit = (node, parent) => {
        if (node.nodeType === 3) {
          parent.appendChild(document.createTextNode(node.nodeValue))
          return
        }
        if (node.nodeType !== 1) return
        const tag = node.tagName.toLowerCase()
        if (PAPER_DROP.has(tag)) return
        if (!PAPER_ALLOWED.has(tag)) {
          for (const child of node.childNodes) visit(child, parent)
          return
        }
        const ns = node.namespaceURI === MATHML_NS ? MATHML_NS : 'http://www.w3.org/1999/xhtml'
        const element = document.createElementNS(ns, tag)
        if (tag === 'img') {
          const src = node.getAttribute('src') ?? ''
          if (!src.startsWith('/shellpulse/img?u=')) return
          element.setAttribute('src', src)
          element.setAttribute('alt', '')
          element.setAttribute('loading', 'lazy')
          element.setAttribute('referrerpolicy', 'no-referrer')
          parent.appendChild(element)
          return
        }
        if (tag === 'math') {
          const display = node.getAttribute('display')
          if (display === 'block' || display === 'inline') element.setAttribute('display', display)
        }
        parent.appendChild(element)
        for (const child of node.childNodes) visit(child, element)
      }
      for (const child of parsed.body.childNodes) visit(child, output)
      return output.innerHTML
    }

    /** Elements that can execute script, load remote code or navigate. */
    const PAPER_DROP_TAGS = new Set([
      'script', 'style', 'link', 'meta', 'base', 'iframe', 'frame', 'frameset', 'object',
      'embed', 'applet', 'form', 'input', 'button', 'select', 'textarea', 'video', 'audio',
      'source', 'track', 'canvas', 'template', 'noscript',
    ])

    /**
     * DOM-level allowlist for arXiv markup. Classes and ids are kept because the
     * paper stylesheet needs them; everything that can run code, navigate, load a
     * remote resource or smuggle a handler is removed. Regex sanitising on the
     * Host is only a first pass and cannot be trusted on its own.
     */
    function sanitizePaperDom(html) {
      const doc = new DOMParser().parseFromString(String(html), 'text/html')
      const clean = (parent) => {
        for (const child of [...parent.children]) {
          const tag = child.tagName.toLowerCase()
          if (PAPER_DROP_TAGS.has(tag)) {
            child.remove()
            continue
          }
          if (tag === 'a') {
            const span = doc.createElement('span')
            span.append(...child.childNodes)
            child.replaceWith(span)
            clean(span)
            continue
          }
          for (const attribute of [...child.attributes]) {
            const name = attribute.name.toLowerCase()
            if (
              name.startsWith('on') ||
              name === 'style' ||
              name === 'srcset' ||
              name === 'ping' ||
              name === 'formaction' ||
              name.startsWith('xlink:') ||
              name === 'href'
            ) {
              child.removeAttribute(attribute.name)
            } else if (name === 'src' && !attribute.value.startsWith('/shellpulse/img?u=')) {
              child.removeAttribute(attribute.name)
            }
          }
          clean(child)
        }
      }
      clean(doc.body)
      return doc.body.innerHTML
    }

    /** Keep the paper stylesheet local: drop imports and remote url() targets. */
    function sanitizePaperCss(css) {
      return String(css)
        .replace(/@import[^;]*;/gi, '')
        .replace(/expression\s*\(/gi, 'x(')
        .replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (match, _quote, href) =>
          href.startsWith('/shellpulse/img?') || /^https:\/\/(?:www\.|static\.)?arxiv\.org\//i.test(href)
            ? match
            : 'none',
        )
    }

    /** Keeps one render error from blanking the whole sidebar slot. */
    class PanelBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false, message: '' }
      }

      static getDerivedStateFromError(error) {
        return { failed: true, message: error && error.message ? String(error.message) : 'render error' }
      }

      componentDidCatch(error) {
        console.error('[shellpulse-news] panel crashed', error)
      }

      render() {
        if (!this.state.failed) return this.props.children
        return h(
          'div',
          { className: 'sp-news-state is-error' },
          h('span', null, `${this.props.label || '渲染失败'}: ${this.state.message}`),
          h(
            'button',
            {
              type: 'button',
              className: 'sp-news-action',
              onClick: () => {
                this.setState({ failed: false, message: '' })
                if (typeof this.props.onRetry === 'function') this.props.onRetry()
              },
            },
            '重试',
          ),
        )
      }
    }

    function SourceMark({ icon, url, name }) {
      const candidates = [icon, iconProxy(url)].filter(Boolean)
      const [index, setIndex] = useState(0)
      const src = candidates[index]
      if (!src) {
        const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'
        return h('span', { className: 'sp-news-src-letter', 'aria-hidden': true }, initial)
      }
      return h('img', {
        className: 'sp-news-src-img',
        src,
        alt: '',
        loading: 'lazy',
        referrerPolicy: 'no-referrer',
        onError: () => setIndex((current) => current + 1),
      })
    }

    /** The ShellPulse brand mark, inlined so the rail and guide glyph match the site. */
    const ICON_SRC = 'data:image/png;base64,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'

    function NewsIcon({ size = 16 }) {
      return h('img', {
        src: ICON_SRC,
        width: size,
        height: size,
        alt: '',
        'aria-hidden': true,
        style: { display: 'block', width: size, height: size },
      })
    }

    function RefreshIcon() {
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M13.2 8a5.2 5.2 0 1 1-1.5-3.7' }),
        h('path', { d: 'M13.2 2.6v3.1H10' }),
      )
    }

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'],
      __markdown: renderMarkdown,
      __feedQuery: feedQuery,
      __thumbOf: thumbOf,
      __sanitizePaperCss: sanitizePaperCss,
      apply(ctx) {
        const t = ctx.locale.bind(NAMESPACE)

        function NewsPanel({ mode, inputActions } = {}) {
          const [view, setView] = useState('all')
          const [category, setCategory] = useState('')
          const [items, setItems] = useState([])
          const [loading, setLoading] = useState(true)
          const [error, setError] = useState(null)
          const [stale, setStale] = useState(false)
          const [meta, setMeta] = useState(null)
          const [detailId, setDetailId] = useState(null)
          const [detail, setDetail] = useState(null)
          const [detailLoading, setDetailLoading] = useState(false)
          const [detailError, setDetailError] = useState(null)
          const [detailNonce, setDetailNonce] = useState(0)
          const [aiHint, setAiHint] = useState(null)
          const [paperMode, setPaperMode] = useState(false)
          const [paper, setPaper] = useState(null)
          const [paperLoading, setPaperLoading] = useState(false)
          const [paperError, setPaperError] = useState(null)
          const [selection, setSelection] = useState(null)
          const [explain, setExplain] = useState(null)
          const [copied, setCopied] = useState(null)
          const [newCount, setNewCount] = useState(0)
          const [updatedAt, setUpdatedAt] = useState(null)
          const [hasMore, setHasMore] = useState(false)
          const [loadingMore, setLoadingMore] = useState(false)
          const runId = useRef(0)
          const abortRef = useRef(null)
          const listRef = useRef(null)
          const paperRef = useRef(null)
          const paperShadowRef = useRef(null)
          const paperRun = useRef(0)
          const articleRef = useRef(null)
          const listScroll = useRef(0)

          const selectView = (key) => {
            if (key === view) return
            setItems([])
            setHasMore(false)
            setLoading(true)
            setView(key)
          }

          const selectCategory = (value) => {
            if (value === category) return
            setItems([])
            setHasMore(false)
            setLoading(true)
            setCategory(value)
          }

          const load = useCallback(async (force = false) => {
            const id = ++runId.current
            if (abortRef.current) abortRef.current.abort()
            const controller = new AbortController()
            abortRef.current = controller
            setLoading(true)
            setError(null)
            try {
              const data = await requestJson(feedQuery(view, category, force), controller.signal)
              if (id !== runId.current) return
              setItems(Array.isArray(data.items) ? data.items : [])
              setHasMore(Boolean(data.has_more))
              setNewCount(0)
              setStale(false)
              setUpdatedAt(Date.now())
            } catch (err) {
              if (id !== runId.current || (err && err.name === 'AbortError')) return
              setError(err && err.message ? err.message : 'request failed')
              setStale(true)
            } finally {
              if (id === runId.current) setLoading(false)
            }
          }, [view, category])

          const loadMore = useCallback(async () => {
            if (loadingMore || !hasMore) return
            const id = runId.current
            setLoadingMore(true)
            try {
              const data = await requestJson(`${feedQuery(view, category)}&offset=${items.length}`)
              if (id !== runId.current) return
              setItems((current) => [...current, ...(Array.isArray(data.items) ? data.items : [])])
              setHasMore(Boolean(data.has_more))
            } catch {
              /* keep the rows we already have; the button stays for a retry */
            } finally {
              if (id === runId.current) setLoadingMore(false)
            }
          }, [view, category, items.length, hasMore, loadingMore])

          useEffect(() => {
            load()
            return () => {
              if (abortRef.current) abortRef.current.abort()
            }
          }, [load])

          useEffect(() => {
            // Warm the paper view in the background: its backend filter costs
            // seconds, and the tab should feel instant the first time.
            const timer = setTimeout(() => {
              requestJson('/feed?view=all&category=papers&limit=15&include_total=false').catch(() => {})
              requestJson('/feed?view=all&category=tutorials&limit=15&include_total=false').catch(() => {})
            }, 1500)
            return () => clearTimeout(timer)
          }, [])

          useEffect(() => {
            let cancelled = false
            requestJson('/meta')
              .then((data) => {
                if (!cancelled) setMeta(data)
              })
              .catch(() => {})
            return () => {
              cancelled = true
            }
          }, [])

          const newest = useMemo(() => newestPublishedAt(items), [items])
          useEffect(() => {
            if (!newest) return
            let cancelled = false
            const timer = setInterval(async () => {
              try {
                const data = await requestJson(`/head?since=${encodeURIComponent(newest)}`)
                if (!cancelled) setNewCount(Number(data.new_count) || 0)
              } catch {
                /* a failed probe is not an error the reader needs to see */
              }
            }, 60000)
            return () => {
              cancelled = true
              clearInterval(timer)
            }
          }, [newest])

          const categories = meta && Array.isArray(meta.categories) ? meta.categories : []

          const copyLink = async (url, id) => {
            try {
              await navigator.clipboard.writeText(url)
            } catch {
              const area = document.createElement('textarea')
              area.value = url
              area.style.position = 'fixed'
              area.style.opacity = '0'
              document.body.appendChild(area)
              area.select()
              try {
                document.execCommand('copy')
              } finally {
                area.remove()
              }
            }
            setCopied(id)
            setTimeout(() => setCopied((current) => (current === id ? null : current)), 1500)
          }

          const sendToAgent = async (text) => {
            if (inputActions && typeof inputActions.insertText === 'function') {
              try {
                const span = typeof inputActions.captureInsertion === 'function' ? inputActions.captureInsertion() : undefined
                if (span !== undefined && inputActions.insertText(text, span)) {
                  setAiHint(t('ai.inserted'))
                  setTimeout(() => setAiHint((current) => (current === t('ai.inserted') ? null : current)), 3000)
                  return
                }
              } catch {
                /* fall through to the clipboard path */
              }
            }
            try {
              await navigator.clipboard.writeText(text)
              setAiHint(t('ai.copied'))
            } catch {
              setAiHint(t('ai.copied'))
            }
            setTimeout(() => setAiHint(null), 3000)
          }

          const loadPaper = async (item) => {
            const run = ++paperRun.current
            setPaperMode(true)
            setPaperLoading(true)
            setPaperError(null)
            setPaper(null)
            try {
              const response = await fetch(`/shellpulse/paper?id=${encodeURIComponent(item.id)}`)
              if (run !== paperRun.current) return
              if (!response.ok) throw new Error(`HTTP ${response.status}`)
              const data = await response.json()
              if (run !== paperRun.current) return
              setPaper(data)
            } catch {
              if (run !== paperRun.current) return
              setPaperError(true)
            } finally {
              if (run === paperRun.current) setPaperLoading(false)
            }
          }

          const explainSelection = async (mode = 'explain') => {
            if (selection === null) return
            const { text, x, y } = selection
            setSelection(null)
            setExplain({ mode, loading: true, text: '', error: false, x, y })
            try {
              const response = await fetch('/shellpulse/explain', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ text, title: paper ? paper.title : '', mode }),
              })
              if (!response.ok) throw new Error(`HTTP ${response.status}`)
              const data = await response.json()
              setExplain({ mode, loading: false, text: String(data.text || ''), error: false, x, y })
            } catch {
              setExplain({ mode, loading: false, text: '', error: true, x, y })
            }
          }

          const askAi = (kind, item) => {
            const title = titleOf(item)
            const source = item.source && item.source.name ? item.source.name : ''
            const summary = String(item.llm_summary || item.summary || '').slice(0, 200)
            sendToAgent(
              t(kind === 'analyze' ? 'ai.prompt.analyze' : 'ai.prompt.chat', {
                title,
                source,
                url: item.url,
                id: item.id,
                summary,
              }),
            )
          }

          const openDetail = (id) => {
            listScroll.current = listRef.current ? listRef.current.scrollTop : 0
            setDetailId(id)
            setDetailNonce((nonce) => nonce + 1)
          }

          useEffect(() => {
            if (detailId === null) return
            let cancelled = false
            const controller = new AbortController()
            setDetailLoading(true)
            setDetailError(null)
            setDetail(null)
            requestJson(`/item/${encodeURIComponent(detailId)}`, controller.signal)
              .then((data) => {
                if (!cancelled) setDetail(data)
              })
              .catch((err) => {
                if (cancelled || (err && err.name === 'AbortError')) return
                setDetailError(err && err.message ? err.message : 'request failed')
              })
              .finally(() => {
                if (!cancelled) setDetailLoading(false)
              })
            return () => {
              cancelled = true
              controller.abort()
            }
          }, [detailId, detailNonce])

          const rows = items.map((item, index) => {
            const stories = Number(item.story_size) || 0
            const sourceName = item.source && item.source.name ? item.source.name : ''
            const isHot = view === 'hot' || item.hot_rank != null
            const isFeatured = item.is_featured === true
            const score = item.llm_quality == null ? null : Math.round(item.llm_quality * 100)
            const thumb = thumbOf(item)
            const summary = summaryOf(item)
            return h(
              'li',
              { key: item.id, className: 'sp-news-item' },
              h(
                'div',
                {
                  className: 'sp-news-row',
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => openDetail(item.id),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openDetail(item.id)
                    }
                  },
                },
                h(
                  'div',
                  { className: 'sp-news-meta' },
                  isHot ? h('span', { className: 'sp-news-badge is-hot' }, t('badge.hot')) : null,
                  isFeatured ? h('span', { className: 'sp-news-badge is-featured' }, t('badge.featured')) : null,
                  h(
                    'span',
                    { className: 'sp-news-src' },
                    h(SourceMark, {
                      icon: item.source ? item.source.icon : null,
                      url: (item.source && item.source.url) || item.url,
                      name: sourceName,
                    }),
                    h('span', { className: 'sp-news-src-name' }, sourceName),
                  ),
                  h('span', { className: 'sp-news-dot' }, '·'),
                  h('span', null, relativeTime(item.published_at, t)),
                  stories > 1 ? h('span', { className: 'sp-news-dot' }, '·') : null,
                  stories > 1 ? h('span', null, t('meta.stories', { n: stories })) : null,
                  score != null ? h('span', { className: 'sp-news-score' }, t('meta.score', { n: score })) : null,
                ),
                h(
                  'div',
                  { className: 'sp-news-headline' },
                  view === 'hot' ? h('span', { className: 'sp-news-rank' }, String(item.hot_rank || index + 1)) : null,
                  h('span', { className: 'sp-news-title' }, titleOf(item)),
                ),
                summary === '' && thumb === null
                  ? null
                  : h(
                      'div',
                      { className: 'sp-news-flex' },
                      summary === ''
                        ? null
                        : h('div', { className: 'sp-news-main' }, h('div', { className: 'sp-news-summary' }, summary)),
                      thumb === null ? null : h(NewsThumb, { src: thumb.src, alt: thumb.alt }),
                    ),
              ),
            )
          })

          let body
          if (loading && items.length === 0) {
            body = h(
              'div',
              { className: 'sp-news-list', 'aria-busy': true },
              h('div', { className: 'sp-news-skeleton' }),
              h('div', { className: 'sp-news-skeleton' }),
              h('div', { className: 'sp-news-skeleton' }),
            )
          } else if (error && items.length === 0) {
            body = h(
              'div',
              { className: 'sp-news-state is-error' },
              h('span', null, t('state.error')),
              h('button', { type: 'button', className: 'sp-news-action', onClick: load }, t('action.retry')),
            )
          } else if (items.length === 0) {
            body = h('div', { className: 'sp-news-state' }, h('span', null, t('state.empty')))
          } else {
            body = h(
              'ul',
              { className: 'sp-news-list', ref: listRef },
              rows,
              (view === 'all' || view === 'tutorials' || view === 'papers') && hasMore
                ? h(
                    'li',
                    { className: 'sp-news-more' },
                    h(
                      'button',
                      { type: 'button', className: 'sp-news-action', onClick: loadMore, disabled: loadingMore },
                      loadingMore ? t('state.loading') : t('action.more'),
                    ),
                  )
                : null,
            )
          }

          useEffect(() => {
            if (detail === null || articleRef.current === null) return
            // The article mounts inside the sidebar's scroll surface, which keeps
            // its offset across renders; clear our own container and any scrolled
            // ancestor so a newly opened article starts at its title.
            let node = articleRef.current
            while (node !== null) {
              if (node.scrollTop > 0) node.scrollTop = 0
              node = node.parentElement
            }
          }, [detail])

          useEffect(() => {
            if (detailId === null && listRef.current !== null) listRef.current.scrollTop = listScroll.current
          }, [detailId])

          const detailScore = detail && detail.llm_quality != null ? Math.round(detail.llm_quality * 100) : null
          const detailText = detail
            ? detail.body_zh && detail.body_zh.trim() !== ''
              ? detail.body_zh
              : detail.body || ''
            : ''
          const detailBar = h(
            'div',
            { className: 'sp-news-header sp-news-detailbar' },
            h('button', { type: 'button', className: 'sp-news-back', onClick: () => setDetailId(null) }, `← ${t('action.back')}`),
            h('span', { className: 'sp-news-spacer' }),
            detailScore !== null ? h('span', { className: 'sp-news-score' }, t('meta.score', { n: detailScore })) : null,
          )
          const detailSourceName = detail && detail.source && detail.source.name ? detail.source.name : ''
          const detailStories = detail ? Number(detail.story_size) || 0 : 0
          const paperBar = h(
            'div',
            { className: 'sp-news-header sp-news-detailbar' },
            h('button', { type: 'button', className: 'sp-news-back', onClick: () => setPaperMode(false) }, `← ${t('action.back')}`),
            h('span', { className: 'sp-news-spacer' }),
          )

          useEffect(() => {
            const onPointerDown = (event) => {
              const target = event.target
              const inButton = target instanceof Element && target.closest('.sp-news-explain-actions') !== null
              const inPopover = target instanceof Element && target.closest('.sp-news-explain') !== null
              if (!inButton) setSelection(null)
              if (!inPopover) setExplain(null)
            }
            const onKeyDown = (event) => {
              if (event.key === 'Escape') {
                setSelection(null)
                setExplain(null)
              }
            }
            const onScroll = () => setSelection(null)
            document.addEventListener('mousedown', onPointerDown, true)
            document.addEventListener('keydown', onKeyDown)
            window.addEventListener('scroll', onScroll, true)
            return () => {
              document.removeEventListener('mousedown', onPointerDown, true)
              document.removeEventListener('keydown', onKeyDown)
              window.removeEventListener('scroll', onScroll, true)
            }
          }, [])

          const paperMarkup = useMemo(() => {
            if (!paper || typeof paper.html !== 'string') return ''
            try {
              return sanitizePaperHtml(paper.html)
            } catch (error) {
              console.error('[shellpulse-news] paper sanitize failed', error)
              return ''
            }
          }, [paper])

          useEffect(() => {
            const host = paperShadowRef.current
            if (!host || !paper || typeof paper.css !== 'string' || paper.css.length <= 500) return
            let root
            try {
              root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
            } catch (error) {
              console.error('[shellpulse-news] shadow root failed', error)
              return
            }
            try {
              const style = document.createElement('style')
              style.textContent = `:host{display:block;padding:0;box-sizing:border-box}.ltx_document{margin-left:0;margin-right:0}img{max-width:100%;height:auto}${sanitizePaperCss(paper.css)}`
              const content = document.createElement('div')
              content.innerHTML = sanitizePaperDom(paper.html)
              root.replaceChildren(style, content)
            } catch (error) {
              console.error('[shellpulse-news] paper html injection failed', error)
              return
            }
            // Shadow content is not covered by document.getSelection() in every
            // Chromium build, so read the shadow selection directly.
            const readShadowSelection = (event) => {
              try {
                const selection = typeof root.getSelection === 'function' ? root.getSelection() : null
                if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
                const text = selection.toString().trim()
                if (text.length < 2 || text.length > 2000) return
                const rect = selection.getRangeAt(0).getBoundingClientRect()
                if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return
                if (rect.width === 0 || rect.height === 0) return
                // Anchor the button at the pointer: for a multi-paragraph selection
                // the range's top edge can be far above where the user let go.
                const x = Number.isFinite(event?.clientX) ? event.clientX : rect.left + rect.width / 2
                const y = Number.isFinite(event?.clientY) ? event.clientY : rect.top
                setSelection({ text, x, y })
              } catch (error) {
                console.error('[shellpulse-news] shadow selection failed', error)
              }
            }
            root.addEventListener('mouseup', readShadowSelection)
            const settle = requestAnimationFrame(() => {
              let node = host
              while (node !== null) {
                if (node.scrollTop > 0) node.scrollTop = 0
                node = node.parentElement
              }
            })
            return () => {
              cancelAnimationFrame(settle)
              root.removeEventListener('mouseup', readShadowSelection)
            }
          }, [paper])

          const paperPane = paperLoading
            ? h('div', { className: 'sp-news-article' }, h('div', { className: 'sp-news-state' }, t('state.loading')))
            : paperError
              ? h(
                  'div',
                  { className: 'sp-news-article' },
                  h(
                    'div',
                    { className: 'sp-news-state is-error' },
                    h('span', null, t('paper.error')),
                    h('button', { type: 'button', className: 'sp-news-action', onClick: () => detail && loadPaper(detail) }, t('action.retry')),
                  ),
                )
              : paper
                ? h(
                    'article',
                    { className: 'sp-news-article', ref: paperRef },
                    h('h2', { className: 'sp-news-article-title' }, paper.title),
                    h(
                      'div',
                      { className: 'sp-news-article-meta' },
                      h('span', null, `arXiv · ${paper.source}`),
                    ),
                    typeof paper.css === 'string' && paper.css.length > 500
                      ? h('div', { className: 'sp-news-paper-shadow', ref: paperShadowRef })
                      : h('div', { className: 'sp-news-paper', dangerouslySetInnerHTML: { __html: paperMarkup } }),
                  )
                : null

          const detailPane = detailLoading
            ? h('div', { className: 'sp-news-article' }, h('div', { className: 'sp-news-state' }, t('state.loading')))
            : detailError
              ? h(
                  'div',
                  { className: 'sp-news-article' },
                  h(
                    'div',
                    { className: 'sp-news-state is-error' },
                    h('span', null, t('state.error')),
                    h('button', { type: 'button', className: 'sp-news-action', onClick: () => setDetailNonce((nonce) => nonce + 1) }, t('action.retry')),
                  ),
                )
              : detail
                ? h(
                    'article',
                    { className: 'sp-news-article', ref: articleRef },
                    h('h2', { className: 'sp-news-article-title' }, titleOf(detail)),
                    h(
                      'div',
                      { className: 'sp-news-article-meta' },
                      detail.hot_rank != null ? h('span', { className: 'sp-news-badge is-hot' }, t('badge.hot')) : null,
                      detail.is_featured === true ? h('span', { className: 'sp-news-badge is-featured' }, t('badge.featured')) : null,
                      h(
                        'span',
                        { className: 'sp-news-src' },
                        h(SourceMark, {
                          icon: detail.source ? detail.source.icon : null,
                          url: (detail.source && detail.source.url) || detail.url,
                          name: detailSourceName,
                        }),
                        h('span', { className: 'sp-news-src-name' }, detailSourceName),
                      ),
                      h('span', { className: 'sp-news-dot' }, '·'),
                      h('span', null, relativeTime(detail.published_at, t)),
                      detailStories > 1 ? h('span', { className: 'sp-news-dot' }, '·') : null,
                      detailStories > 1 ? h('span', null, t('meta.stories', { n: detailStories })) : null,
                    ),
                    h(
                      'div',
                      { className: 'sp-news-tools' },
                      h('button', { type: 'button', className: 'sp-news-action is-primary sp-news-action-sm', onClick: () => askAi('analyze', detail) }, t('ai.analyze')),
                      isPaperUrl(detail.url)
                        ? h('button', { type: 'button', className: 'sp-news-action sp-news-action-sm', onClick: () => loadPaper(detail) }, t('action.loadPaper'))
                        : null,
                    ),
                    detail.llm_summary ? h('p', { className: 'sp-news-lead' }, detail.llm_summary) : null,
                    h('div', { className: 'sp-news-body' }, renderMarkdown(detailText)),
                    detail.body_zh_truncated ? h('p', { className: 'sp-news-truncate' }, t('detail.truncated')) : null,
                    Array.isArray(detail.categories) && detail.categories.length > 0
                      ? h(
                          'div',
                          { className: 'sp-news-tags' },
                          detail.categories.map((key) => h('span', { key, className: 'sp-news-tag' }, `#${key}`)),
                        )
                      : null,
                    h(
                      'div',
                      { className: 'sp-news-article-actions' },
                      h('button', { type: 'button', className: 'sp-news-action', onClick: () => askAi('chat', detail) }, t('ai.chat')),
                      h('a', { className: 'sp-news-action', href: detail.url, target: '_blank', rel: 'noopener noreferrer' }, t('action.open')),
                      h(
                        'button',
                        { type: 'button', className: 'sp-news-action', onClick: () => copyLink(detail.url, detail.id) },
                        copied === detail.id ? t('action.copied') : t('action.copy'),
                      ),
                    ),
                    aiHint !== null ? h('div', { className: 'sp-news-hint', role: 'status' }, aiHint) : null,
                  )
                : null

          return h(
            'div',
            { className: mode === 'page' ? 'sp-news-root is-page' : 'sp-news-root' },
            h('style', null, CSS),
            paperMode
              ? paperBar
              : detailId !== null
                ? detailBar
                : h(
                  'div',
                  { className: 'sp-news-header' },
              h(
                'div',
                { className: 'sp-news-tabs', role: 'group', 'aria-label': t('guide.title') },
                VIEWS.map((key) =>
                  h(
                    'button',
                    {
                      key,
                      type: 'button',
                      className: 'sp-news-tab',
                      'aria-pressed': view === key,
                      onClick: () => selectView(key),
                    },
                    t(`view.${key}`),
                  ),
                ),
              ),
              h('span', { className: 'sp-news-spacer' }),
              categories.length > 0 && view !== 'tutorials' && view !== 'papers'
                ? h(
                    'select',
                    {
                      className: 'sp-news-select',
                      value: category,
                      'aria-label': t('category.all'),
                      onChange: (event) => selectCategory(event.target.value),
                    },
                    h('option', { value: '' }, t('category.all')),
                    categories
                      .filter((entry) => entry && entry.key)
                      .map((entry) => h('option', { key: entry.key, value: entry.key }, entry.label || entry.key)),
                  )
                : null,
              h(
                'button',
                { type: 'button', className: 'sp-news-icon', onClick: load, disabled: loading, 'aria-label': t('action.refresh'), title: t('action.refresh') },
                h(RefreshIcon),
              ),
            ),
            paperMode
              ? h(PanelBoundary, { label: t('state.crashed'), onRetry: () => (detail ? loadPaper(detail) : undefined) }, paperPane)
              : detailId !== null
                ? h(PanelBoundary, { label: t('state.crashed'), onRetry: () => setDetailNonce((nonce) => nonce + 1) }, detailPane)
                : h(
                  React.Fragment,
                  null,
                  newCount > 0 ? h('button', { type: 'button', className: 'sp-news-banner', onClick: () => load(true) }, t('banner.new', { n: newCount })) : null,
                  stale && items.length > 0 ? h('div', { className: 'sp-news-banner' }, t('state.stale')) : null,
                  body,
                ),
            loading ? h('div', { className: 'sp-news-progress', role: 'status', 'aria-label': t('state.loading') }) : null,
            selection !== null
              ? h(
                  'div',
                  {
                    className: 'sp-news-explain-actions',
                    style: { left: `${selection.x}px`, top: `${selection.y}px` },
                    onMouseDown: (event) => event.preventDefault(),
                  },
                  h('button', { type: 'button', className: 'sp-news-explain-btn', onClick: () => explainSelection('explain') }, t('paper.explain')),
                  h('button', { type: 'button', className: 'sp-news-explain-btn', onClick: () => explainSelection('translate') }, t('paper.translate')),
                )
              : null,
            explain !== null
              ? h(
                  'div',
                  {
                    className: 'sp-news-explain',
                    style: {
                      left: `${Math.max(12, Math.min(explain.x - 170, (globalThis.innerWidth || 1200) - 352))}px`,
                      top: `${Math.min(explain.y + 16, (globalThis.innerHeight || 800) - 320)}px`,
                    },
                  },
                  h(
                    'div',
                    { className: 'sp-news-explain-head' },
                    h('span', null, t(explain.mode === 'translate' ? 'paper.translate' : 'paper.explain')),
                    h('button', { type: 'button', className: 'sp-news-explain-close', onClick: () => setExplain(null), 'aria-label': 'Close' }, '×'),
                  ),
                  explain.loading
                    ? h('div', { className: 'sp-news-hint' }, t('paper.explaining'))
                    : explain.error
                      ? h('div', { className: 'sp-news-hint' }, t('paper.explainError'))
                      : h('div', { className: 'sp-news-body' }, renderMarkdown(explain.text)),
                )
              : null,
            h(
              'div',
              { className: 'sp-news-footer' },
              h('a', { href: SITE, target: '_blank', rel: 'noopener noreferrer' }, t('footer.source')),
              updatedAt ? h('span', null, clockOf(updatedAt)) : null,
            ),
          )
        }

        /**
         * The slot entry itself: a boundary at the very top means a throw in any
         * part of the panel (not only the paper pane) degrades to a message
         * instead of blanking the whole sidebar slot.
         */
        function PanelRoot(props) {
          const [nonce, setNonce] = useState(0)
          return h(
            PanelBoundary,
            { key: nonce, label: t('state.crashed'), onRetry: () => setNonce((value) => value + 1) },
            h(NewsPanel, { ...props, key: nonce }),
          )
        }

        ctx.effect(() => ctx.locale.register(NAMESPACE, COPY), 'dsh-news:copy')
        ctx.effect(
          () =>
            ctx.sidebarRightTabs.register({
              id: TAB_ID,
              kind: KIND,
              priority: 'extension',
              title: () => t('type.title'),
              guide: [
                {
                  id: 'open',
                  order: 40,
                  title: () => t('guide.title'),
                  description: () => t('guide.description'),
                  icon: NewsIcon,
                },
              ],
            }),
          'dsh-news:tab-type',
        )
        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.right.pane.tab', () =>
              ctx.slots.register(
                {
                  name: 'sidebar.right.pane.tab',
                  key: TAB_ID,
                  locale: NAMESPACE,
                },
                PanelRoot,
              ),
            ),
          'dsh-news:tab-body',
        )
        // A left-rail entry that opens the same feed as a full page. It is a
        // separate surface from the right tab on purpose: the tab is for
        // glancing while a conversation is open, the page is for reading.
        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.panellist', () =>
              ctx.slots.register(
                {
                  name: 'sidebar.panellist',
                  id: PANEL_ID,
                  order: 5,
                  label: () => t('type.title'),
                  locale: NAMESPACE,
                },
                NewsIcon,
              ),
            ),
          'dsh-news:sidebar-entry',
        )
        ctx.effect(
          () =>
            ctx.slots.inject('main', () =>
              ctx.slots.register(
                {
                  name: 'main',
                  key: PANEL_ID,
                  locale: NAMESPACE,
                },
                (props) => h(PanelRoot, { ...props, mode: 'page' }),
              ),
            ),
          'dsh-news:sidebar-page',
        )

        // A fresh install is otherwise invisible behind the sidebar's "+" guide.
        // Open the panel once per browser profile; afterwards the user's own
        // layout decides.
        const introTimer = setTimeout(() => {
          try {
            if (globalThis.localStorage?.getItem(INTRO_KEY) === '1') return
            ctx.sidebarRight.openTab(KIND, { revealIfOpened: false })
            globalThis.localStorage?.setItem(INTRO_KEY, '1')
          } catch {
            /* no session is mounted yet; the guide entry still works */
          }
        }, 1500)
        ctx.effect(() => () => clearTimeout(introTimer), 'dsh-news:intro')
      },
    }
  },
})

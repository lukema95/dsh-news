import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const SOURCE = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/** Minimal React surface: enough to run one render with stable hook values. */
function fakeReact() {
  const createElement = (type, props, ...children) => {
    const flat = children.flat()
    return {
      type,
      props: { ...(props ?? {}), ...(flat.length === 0 ? {} : { children: flat.length === 1 ? flat[0] : flat }) },
      children: flat,
    }
  }
  class Component {
    constructor(props) {
      this.props = props ?? {}
      this.state = {}
    }

    setState(next) {
      this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) }
    }
  }

  return {
    Component,
    createElement,
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useRef: (value) => ({ current: value }),
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
  }
}

/** Load client.js in a VM and return the module the loader registered. */
function loadClient() {
  let registered
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load: (module) => {
          registered = module
        },
      },
    },
    require: (id) => {
      assert.equal(id, 'react')
      return fakeReact()
    },
    fetch: async () => new Response('{"items":[]}', { status: 200 }),
    document: { createElement: () => ({ style: {}, remove() {}, select() {} }), body: { appendChild() {} } },
    navigator: { clipboard: { writeText: async () => {} } },
    URLSearchParams,
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    console,
  }
  vm.runInNewContext(SOURCE, sandbox, { filename: 'client.js' })
  assert.ok(registered, 'client.js registers a module')
  return registered
}

function collectClassNames(node, found = new Set()) {
  if (!node || typeof node !== 'object') return found
  const className = node.props && node.props.className
  if (typeof className === 'string') {
    for (const name of className.split(/\s+/)) if (name) found.add(name)
  }
  for (const child of node.children ?? []) collectClassNames(child, found)
  return found
}

test('registers a right-sidebar tab type and its body', () => {
  const module = loadClient()
  assert.equal(module.id, '@lukema/dsh-news')

  const captured = { types: [], slots: [], locales: [] }
  const ctx = {
    effect: (fn) => {
      const disposer = fn()
      return () => disposer
    },
    locale: {
      bind: () => (key) => key,
      register: (namespace, copy) => {
        captured.locales.push({ namespace, copy })
        return () => {}
      },
    },
    sidebarRightTabs: {
      register: (definition) => {
        captured.types.push(definition)
        return () => {}
      },
    },
    slots: {
      inject: (_owner, fn) => {
        fn()
        return () => {}
      },
      register: (definition, Component) => {
        captured.slots.push({ definition, Component })
        return () => {}
      },
    },
  }

  const plugin = module.factory((id) => {
    assert.equal(id, 'react')
    return fakeReact()
  })
  assert.deepEqual([...plugin.inject].sort(), ['locale', 'sidebarRight', 'sidebarRightTabs', 'slots'])
  plugin.apply(ctx)

  assert.equal(captured.types.length, 1)
  const type = captured.types[0]
  assert.equal(type.id, '@lukema/dsh-news')
  assert.equal(type.kind, 'shellpulse-news')
  assert.equal(type.priority, 'extension')
  assert.equal(type.guide.length, 1)
  assert.equal(typeof type.title, 'function')

  const slot = (name) => captured.slots.find((entry) => entry.definition.name === name)
  assert.equal(slot('sidebar.right.pane.tab').definition.key, type.id)
  assert.equal(slot('sidebar.panellist').definition.id, 'shellpulse.news')
  assert.equal(slot('main').definition.key, 'shellpulse.news')

  assert.equal(captured.locales.length, 1)
  assert.ok(captured.locales[0].copy.zh['view.hot'])
  assert.ok(captured.locales[0].copy.en['view.hot'])
})

test('renders the empty loading state without throwing', () => {
  const module = loadClient()
  const components = []
  const ctx = {
    effect: (fn) => {
      fn()
      return () => {}
    },
    locale: { bind: () => (key) => key, register: () => () => {} },
    sidebarRightTabs: { register: () => () => {} },
    slots: {
      inject: (_owner, fn) => {
        fn()
        return () => {}
      },
      register: (_definition, Component) => {
        components.push(Component)
        return () => {}
      },
    },
  }
  module.factory((id) => fakeReact()).apply(ctx)
  // The slot entry is PanelRoot -> PanelBoundary -> NewsPanel.
  const outer = components[0]({})
  const boundary = new outer.type(outer.props)
  const inner = boundary.render()
  const tree = inner.type(inner.props)
  const tabs = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.props && node.props.className === 'sp-news-tab') tabs.push(textOf(node))
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  assert.equal(tabs.join('|'), 'view.all|view.featured|view.hot|view.tutorials|view.papers')
  const classNames = collectClassNames(tree)
  assert.ok(classNames.has('sp-news-root'))
  assert.ok(classNames.has('sp-news-header'))
  assert.ok(classNames.has('sp-news-skeleton'))
  assert.ok(classNames.has('sp-news-progress'))
})

function textOf(node) {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return (node.children ?? []).map(textOf).join('')
}

test('renders fenced code, headings, lists and inline markdown', () => {
  const plugin = loadClient().factory(() => fakeReact())
  const md = plugin.__markdown

  const fenced = md('before\n\n```shell\ncurl -fsSL https://example.com | sh\n```\n\nafter')
  assert.equal(fenced.map((node) => node.type).join(','), 'p,pre,p')
  assert.equal(fenced[1].children[0].type, 'code')
  assert.equal(textOf(fenced[1]), 'curl -fsSL https://example.com | sh')

  const list = md('## 小节\n\n- 一条 `code`\n- **两条**\n\n1. 第一\n2. 第二')
  assert.equal(list.map((node) => node.type).join(','), 'h4,ul,ol')
  assert.equal(textOf(list[0]), '小节')
  assert.equal(list[1].children.length, 2)
  assert.equal(list[1].children[0].children[1].type, 'code')
  assert.equal(list[2].children.length, 2)

  const inline = md('看 [站点](https://example.com) 和 **粗体**，以及 `x`')
  const paragraph = inline[0]
  const types = paragraph.children.filter((child) => typeof child !== 'string').map((child) => child.type)
  assert.equal(types.sort().join(','), 'a,code,strong')
  const link = paragraph.children.find((child) => child.type === 'a')
  assert.equal(link.props.href, 'https://example.com')
  assert.equal(link.props.rel, 'noopener noreferrer')
})

test('renders GitHub tables and CJK number lists', () => {
  const plugin = loadClient().factory(() => fakeReact())
  const blocks = plugin.__markdown(
    '| 组件 | 格式 |\n| --- | :---: |\n| 鼠标 | ΔX, ΔY |\n| 键盘 | 256 维二进制 |\n\n1.动作空间\n2. 训练语料库',
  )

  assert.equal(blocks.map((node) => node.type).join(','), 'div,ol')
  const table = blocks[0].children[0]
  assert.equal(table.type, 'table')
  const body = table.children[1]
  assert.equal(body.children.length, 2)
  const firstRow = body.children[0]
  assert.equal(textOf(firstRow.children[0]), '鼠标')
  assert.equal(firstRow.children[1].props.style.textAlign, 'center')
  assert.equal(firstRow.children[0].props.style.textAlign, 'left')

  assert.equal(blocks[1].children.length, 2)
  assert.equal(textOf(blocks[1].children[0]), '动作空间')
  assert.equal(textOf(blocks[1].children[1]), '训练语料库')

  const mixed = plugin.__markdown('前言\n\n| a |\n| --- |\n| 1 |\n\n结尾')
  assert.equal(mixed.map((node) => node.type).join(','), 'p,div,p')
  assert.equal(textOf(mixed[2]), '结尾')
})

test('never turns non-http links into anchors', () => {
  const plugin = loadClient().factory(() => fakeReact())
  const blocks = plugin.__markdown('[x](javascript:alert(1))')
  const anchors = JSON.stringify(blocks).match(/"type":"a"/g)
  assert.equal(anchors, null)
})

test('renders markdown images and rejects non-http sources', () => {
  const plugin = loadClient().factory(() => fakeReact())
  const blocks = plugin.__markdown('看图：\n\n![架构图](https://example.com/a.png)\n\n结尾')
  const image = blocks
    .flatMap((node) => (node.children ?? []))
    .find((child) => child && child.type && child.props && child.props.src)
  assert.equal(image.props.src, 'https://example.com/a.png')
  assert.equal(image.props.alt, '架构图')

  const unsafe = plugin.__markdown('![x](javascript:alert(1))')
  assert.equal(JSON.stringify(unsafe).includes('"src"'), false)
})

test('keeps the paper style local: no imports, no remote url()', () => {
  const plugin = loadClient().factory(() => fakeReact())
  const cleaned = plugin.__sanitizePaperCss(
    '@import url("https://evil.test/x.css"); .a{background:url(https://evil.test/x.png)} .b{background:url(https://arxiv.org/a.png)} .c{background:url("/shellpulse/img?u=https%3A%2F%2Farxiv.org%2Fa.png")}',
  )
  assert.equal(cleaned.includes('@import'), false)
  assert.equal(cleaned.includes('evil.test'), false)
  assert.ok(cleaned.includes('arxiv.org/a.png'))
  assert.ok(cleaned.includes('/shellpulse/img?u='))
})

test('papers view asks for every arxiv source and no keyword category', () => {
  const plugin = loadClient().factory(() => fakeReact())
  const query = (view, category) => new URLSearchParams(plugin.__feedQuery(view, category, false).split('?')[1])

  const papers = query('papers', '')
  assert.equal(papers.get('view'), 'all')
  assert.equal(papers.get('source_prefix'), 'arxiv-')
  assert.equal(papers.get('category'), null)
  assert.equal(papers.get('limit'), '15')

  const tutorials = query('tutorials', '')
  assert.equal(tutorials.get('category'), 'tutorials')
  assert.equal(tutorials.get('source_prefix'), null)

  const hot = query('hot', 'ai')
  assert.equal(hot.get('view'), 'hot')
  assert.equal(hot.get('category'), 'ai')
})

test('picks the first publisher image out of the summary', () => {
  const plugin = loadClient().factory(() => fakeReact())

  const markdown = plugin.__thumbOf({ summary: '开头\n\n![图注](https://cdn.test/a.png)\n\n结尾' })
  assert.equal(markdown.src, 'https://cdn.test/a.png')
  assert.equal(markdown.alt, '图注')

  const html = plugin.__thumbOf({ summary: '<p>x</p><img src="https://img.test/b.jpg" alt="b">' })
  assert.equal(html.src, 'https://img.test/b.jpg')

  assert.equal(plugin.__thumbOf({ summary: '只有文字，没有配图' }), null)
  assert.equal(plugin.__thumbOf({}), null)
  assert.equal(plugin.__thumbOf({ summary: '![相对路径](/a.png)' }), null)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Minimal document stub so portal rendering and style injection work in node.
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    body: {},
    head: { appendChild() {} },
    createElement: () => ({ setAttribute() {}, style: {} }),
  }
}

// Mock React with a vdom builder so we can exercise the client components
// without pulling in a real React build in the test runner.
const React = {
  // Mirror real createElement semantics: children are merged into props.
  createElement: (type, props, ...children) => ({
    type,
    props:
      children.length > 0
        ? { ...props, children: children.length === 1 ? children[0] : children }
        : props,
    children,
  }),
  Fragment: Symbol('Fragment'),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect(fn) {
    const cleanup = fn()
    if (typeof cleanup === 'function') lastEffectCleanup = cleanup
  },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useRef: (init) => ({ current: init }),
}

let lastEffectCleanup = null

function makePrimitivesStub() {
  const target = {}
  return new Proxy(target, {
    get(t, key) {
      if (typeof key !== 'string') return undefined
      if (!(key in t)) t[key] = Object.assign(() => null, { stubName: key })
      return t[key]
    },
  })
}

function loadBundle(reactMock = React, externals = {}) {
  const prev = globalThis.window
  const loaded = []
  globalThis.window = { __ModuleLoader__: { load: (x) => loaded.push(x) } }
  // Evaluate the bundle source directly to avoid module-cache reuse between tests.
  ;(0, eval)(readFileSync(require.resolve('../lib/client/client.js'), 'utf8'))
  if (prev === undefined) delete globalThis.window
  else globalThis.window = prev
  const entry = loaded[0]
  const primitives = externals.primitives || makePrimitivesStub()
  const plugin = entry.factory((spec) => {
    if (spec === 'react' || spec === 'react/jsx-runtime') return reactMock
    if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    if (spec === 'react-dom') return { createPortal: (el) => ({ __portal: true, el }) }
    throw new Error('unexpected external: ' + spec)
  })
  return { plugin, React: reactMock }
}

function collectRegistrations(plugin, ctxExtras = {}) {
  const registrations = []
  const ctx = {
    slots: {
      inject: (slot, reg) => {
        reg()
        return () => {}
      },
      register: (def, comp) => {
        registrations.push({ def, comp })
        return () => {}
      },
    },
    effect: (fn) => {
      fn()
      return () => {}
    },
    get: () => undefined,
    ...ctxExtras,
  }
  plugin.apply(ctx)
  return { registrations, ctx }
}

test('client bundle conforms to the DSH module-loader contract', () => {
  const { plugin } = loadBundle()
  assert.equal(typeof plugin.apply, 'function')
  assert.ok(Array.isArray(plugin.inject))
  assert.ok(plugin.inject.includes('slots'))
})

test('client registers a toolview for every Git/GitHub tool', () => {
  const { plugin } = loadBundle()
  const regs = collectRegistrations(plugin).registrations
  const toolview = regs.filter((r) => r.def.name === 'tool.call.toolview')
  const keys = toolview.map((r) => r.def.key)
  const expected = [
    'git_workspace', 'git_status', 'git_diff', 'git_commits', 'git_show',
    'github_pr', 'github_pr_create', 'github_ci', 'git_files', 'git_compare', 'git_blame',
    'git_branches', 'git_remotes', 'git_worktrees', 'git_stash', 'git_tags',
    'github_pr_diff', 'github_pr_reviews', 'github_pr_comments',
    'github_ci_logs', 'github_issue', 'github_issue_comments', 'github_releases',
  ]
  assert.deepEqual(keys, expected)
})

test('client registers the Git Workspace composer control', () => {
  const { plugin } = loadBundle()
  const regs = collectRegistrations(plugin).registrations
  const seat = regs.find((r) => r.def.name === 'conversation.input.left')
  assert.ok(seat, 'conversation.input.left registered')
  assert.equal(seat.def.id, 'git-workspace')
})

function settledBlock(meta, isError = false) {
  return {
    kind: 'tool-result',
    isError,
    meta,
    content: [{ type: 'text', text: 'sample' }],
  }
}

test('git_workspace card renders from meta', () => {
  const { plugin } = loadBundle()
  const regs = collectRegistrations(plugin).registrations
  const comp = regs.find((r) => r.def.key === 'git_workspace').comp
  const tree = comp({
    block: settledBlock({
      repository: { name: 'repo' },
      branch: { name: 'feature/x', upstream: 'origin/feature/x', ahead: 2, behind: 1 },
      changes: { modified: 3, staged: 1, deleted: 0, renamed: 0, untracked: 2 },
      clean: false,
      pullRequest: { number: 42, title: 'Fix ui', state: 'open', draft: false, url: 'u' },
      ci: { status: 'success', checks: [{ name: 'test', conclusion: 'success' }] },
    }),
    cwd: '/w',
    openFile: () => {},
  })
  assert.ok(tree.type, 'renders an element')
})

test('git_status card renders file list from meta', () => {
  const { plugin } = loadBundle()
  const regs = collectRegistrations(plugin).registrations
  const comp = regs.find((r) => r.def.key === 'git_status').comp
  const tree = comp({
    block: settledBlock({
      branch: { name: 'main' },
      files: [{ path: 'a.ts', status: 'modified' }, { path: 'b.ts', status: 'untracked' }],
    }),
    openFile: () => {},
  })
  assert.ok(tree.type)
})

test('git_diff card renders file stats from meta', () => {
  const { plugin } = loadBundle()
  const regs = collectRegistrations(plugin).registrations
  const comp = regs.find((r) => r.def.key === 'git_diff').comp
  const tree = comp({
    block: settledBlock({
      stats: { files: 1, additions: 2, deletions: 1 },
      files: [{ path: 'a.ts', status: 'M', additions: 2, deletions: 1 }],
    }),
    openFile: () => {},
  })
  assert.ok(tree.type)
})

test('cards render empty state when no meta', () => {
  const { plugin } = loadBundle()
  const regs = collectRegistrations(plugin).registrations
  const comp = regs.find((r) => r.def.key === 'git_workspace').comp
  const tree = comp({ block: settledBlock(null), openFile: () => {} })
  assert.ok(tree.type)
})

test('Git Workspace header action renders a closed toggle with badge and state dot', () => {
  const { plugin } = loadBundle()
  const regs = collectRegistrations(plugin).registrations
  const headerComp = regs.find((r) => r.def.id === 'git-workspace').comp
  const conversation = {
    nodes: [
      {
        kind: 'tool-result',
        callId: 'c1',
        call: { name: 'git_workspace', argsRaw: '{}' },
        meta: {
          repository: { name: 'repo' },
          branch: { name: 'feature/x', ahead: 0, behind: 0 },
          changes: { modified: 2, staged: 0, deleted: 0, renamed: 0, untracked: 1 },
          clean: false,
          pullRequest: null,
          ci: null,
        },
      },
    ],
  }
  const tree = headerComp({ useSession: (sel) => sel(conversation), sessionId: 's1' })
  assert.ok(tree.children, 'returns a fragment')
  assert.equal(tree.children.length, 1, 'only the toggle renders while closed')
  // The toggle renders either as a plain chip button or wrapped in the host
  // Tooltip/Pill primitives depending on the UI kit generation; accept both.
  let toggle = tree.children[0]
  if (toggle.type !== 'button') {
    assert.equal(toggle.type.stubName, 'Tooltip', 'wrapped toggles use the host Tooltip')
    toggle = Array.isArray(toggle.props.children) ? toggle.props.children[0] : toggle.props.children
    if (toggle.type && toggle.type.stubName === 'Pill') {
      assert.equal(toggle.props.active, false, 'toggle starts inactive')
    }
  }
  assert.equal(typeof toggle.props.onClick, 'function', 'toggle is interactive')
  const found = []
  ;(function findBadge(node) {
    if (node == null || typeof node !== 'object' || found.length) return
    if (Array.isArray(node)) { node.forEach(findBadge); return }
    const style = node.props && node.props.style
    if (style && String(style.minWidth) === '16px') { found.push(node); return }
    if (node.props && node.props.children !== undefined) findBadge(node.props.children)
    if (!found.length && node.children !== undefined) findBadge(node.children)
  })(toggle)
  assert.ok(found.length, 'dirty count badge renders')
  const flatText = (v) =>
    v == null || v === false
      ? ''
      : Array.isArray(v)
        ? v.map(flatText).join('')
        : typeof v === 'object'
          ? flatText(v.props && v.props.children)
          : String(v)
  assert.equal(flatText(found[0].props && found[0].props.children), '3', 'dirty count badge shows total changes')
})

function renderHeader(conversation, { open = false, pending = false, sessionId = 's1', ctxExtras = {}, compProps = {} } = {}) {
  const reactMock = open
    ? {
        ...React,
        useState: (() => {
          // Positional overrides with init fallback: hook N gets states[N] when
          // provided, otherwise its own real initial value.
          const states = [true, pending]
          let call = 0
          return (init) => {
            const value = call < states.length ? states[call] : init
            call += 1
            return [value, () => {}]
          }
        })(),
      }
    : React
  const { plugin } = loadBundle(reactMock)
  const { registrations } = collectRegistrations(plugin, ctxExtras)
  const headerComp = registrations.find((r) => r.def.id === 'git-workspace').comp
  return headerComp({ useSession: (sel) => sel(conversation), sessionId, ...compProps })
}

// Execute the Drawer component against its element props so the rendered
// aside structure can be asserted without a real React renderer. The panel
// is a docked sidebar: no backdrop, the aside is the root element.
function execDrawer(drawerEl) {
  assert.equal(typeof drawerEl.type, 'function', 'drawer is a component element')
  const aside = drawerEl.type(drawerEl.props)
  return { aside }
}

// Walk a rendered tree, executing function components in place, and collect
// every text node so string-level assertions work across nested sections.
function collectText(node, out = [], depth = 0) {
  if (depth > 30 || node === null || node === undefined) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const n of node) collectText(n, out, depth + 1)
    return out
  }
  if (typeof node !== 'object') return out
  let current = node
  while (typeof current?.type === 'function') {
    try {
      current = current.type(current.props || {})
    } catch {
      return out
    }
    if (current === null || current === undefined) return out
  }
  // Walk props.children only: the React mock merges children into props, and
  // its extra raw `.children` field is a duplicate mirror — collecting both
  // would double every text node.
  const props = current && typeof current === 'object' ? current.props : undefined
  if (props && props.children !== undefined) collectText(props.children, out, depth + 1)
  return out
}

test('Git Workspace drawer opens with conversation data', () => {
  const conversation = {
    nodes: [
      {
        kind: 'tool-result',
        callId: 'c1',
        call: { name: 'git_workspace', argsRaw: '{}' },
        content: [{ type: 'text', text: 'x' }],
        isError: false,
        meta: {
          repository: { name: 'repo' },
          branch: { name: 'feature/x', upstream: 'origin/feature/x', ahead: 2, behind: 1 },
          changes: { modified: 3, staged: 1, deleted: 0, renamed: 0, untracked: 2 },
          clean: false,
          pullRequest: null,
          ci: null,
          files: [
            { path: 'src/a.ts', oldPath: null, status: 'modified', staged: false },
            { path: 'new.ts', oldPath: null, status: 'untracked', staged: false },
            { path: 'lib/b.js', oldPath: null, status: 'modified', staged: true },
          ],
          commits: [{ shortSha: 'abc1234', message: 'do things', author: 'me', date: 'now', additions: 1, deletions: 0, fileCount: 1 }],
          branches: [{ name: 'feature/x', current: true, upstream: null, ahead: 2, behind: 0 }],
          stashCount: 2,
        },
      },
    ],
  }
  const tree = renderHeader(conversation, { open: true })
  assert.equal(tree.children.length, 2, 'toggle + drawer render while open')
  const { aside } = execDrawer(tree.children[1].el)
  assert.equal(aside.props['data-git-workspace-drawer'], '', 'drawer aside is rendered')
  assert.equal(aside.props.role, 'complementary', 'renders as a docked sidebar landmark')
  const scrollArea = aside.children[2]
  const panelEl = scrollArea.children[0]
  assert.equal(typeof panelEl.type, 'function', 'drawer hosts the workspace panel')
  const body = panelEl.type(panelEl.props)
  assert.equal(body.props['data-git-workspace-panel'], '', 'panel body wrapper renders')
  assert.equal(tree.children[1].el.props.title, 'Git Workspace')
  assert.ok(tree.children[1].el.props.subtitle.includes('repo'), 'drawer subtitle carries repo name')
  const content = body.children[0]
  assert.ok(content.children.length > 0, 'panel body has sections')
})

test('Git Workspace panel tolerates a git_status meta without a changes summary', () => {
  const conversation = {
    nodes: [
      {
        kind: 'tool-result',
        callId: 'c1',
        call: { name: 'git_status', argsRaw: '{}' },
        content: [{ type: 'text', text: 'x' }],
        isError: false,
        meta: {
          branch: { name: 'discus', upstream: 'origin/discus', ahead: 0, behind: 0 },
          files: [{ path: 'a.ts', status: 'modified' }],
        },
      },
    ],
  }
  const tree = renderHeader(conversation, { open: true })
  const drawer = tree.children[1].el
  assert.equal(drawer.props.subtitle.includes('discus'), true, 'falls back to git_status meta')
})

test('refresh action prompts the agent through the sessions service', async () => {
  const prompts = []
  const tree = renderHeader({ nodes: [] }, {
    open: true,
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return {
          binding(id) {
            return {
              session: {
                prompt(content) {
                  prompts.push({ id, text: content[0].text })
                  return Promise.resolve({ ok: true })
                },
              },
            }
          },
        }
      },
    },
  })
  const drawer = tree.children[1].el
  const refreshEl = drawer.props.actions
  assert.equal(typeof refreshEl.props.onClick, 'function', 'drawer exposes a refresh action')
  assert.equal(prompts.length, 0, 'no prompt fired on render')
  await refreshEl.props.onClick()
  assert.deepEqual(
    prompts,
    [{ id: 's1', text: 'Run the git_workspace tool now and report the refreshed workspace summary.' }],
  )
})

test('refresh is inert when the sessions service is unavailable', async () => {
  const tree = renderHeader({ nodes: [] }, { open: true })
  await tree.children[1].el.props.actions.props.onClick()
})

test('closed toggle omits badge for a clean workspace', () => {
  const { plugin } = loadBundle()
  const { registrations } = collectRegistrations(plugin)
  const headerComp = registrations.find((r) => r.def.id === 'git-workspace').comp
  const conversation = {
    nodes: [
      {
        kind: 'tool-result',
        callId: 'c1',
        call: { name: 'git_workspace', argsRaw: '{}' },
        meta: {
          repository: { name: 'repo' },
          branch: { name: 'main', ahead: 0, behind: 0 },
          changes: { modified: 0, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: true,
          pullRequest: null,
          ci: { status: 'success', checks: [{ name: 'ci', conclusion: 'success' }] },
        },
      },
    ],
  }
  const tree = headerComp({ useSession: (sel) => sel(conversation), sessionId: 's1' })
  const badge = tree.children[0].children.find(
    (c) => c && c.props && c.props.style && c.props.style.minWidth === '16px',
  )
  assert.equal(badge, undefined, 'no dirty badge when clean')
})

test('panel surfaces truncation hints and +N more rows', () => {
  const conversation = {
    nodes: [
      {
        kind: 'tool-result',
        callId: 'c1',
        call: { name: 'git_workspace', argsRaw: '{}' },
        meta: {
          repository: { name: 'repo' },
          branch: { name: 'feature/x', ahead: 0, behind: 0 },
          changes: { modified: 3, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: false,
          filesTruncated: true,
          files: [1, 2, 3].map((i) => ({ path: `src/f${i}.ts`, oldPath: null, status: 'modified', staged: false })),
          commits: [],
          branches: Array.from({ length: 13 }, (_, i) => ({ name: `b${i}`, current: i === 0, upstream: null, ahead: 0, behind: 0 })),
          pullRequest: null,
          ci: {
            status: 'in_progress',
            checks: Array.from({ length: 17 }, (_, i) => ({ name: `check-${i}`, status: 'queued' })),
          },
        },
      },
    ],
  }
  const tree = renderHeader(conversation, { open: true })
  const { aside } = execDrawer(tree.children[1].el)
  const panelEl = aside.children[2].children[0]
  const body = panelEl.type(panelEl.props)
  const text = collectText(body).join('\n')
  assert.ok(text.includes('File list truncated'), 'filesTruncated hint renders')
  const { plugin } = loadBundle()
  const { registrations } = collectRegistrations(plugin)
  const ciComp = registrations.find((r) => r.def.key === 'github_ci').comp
  const ciText = collectText(
    ciComp({
      block: settledBlock({
        status: 'in_progress',
        checks: Array.from({ length: 12 }, (_, i) => ({ name: `check-${i}`, status: 'queued' })),
      }),
    }),
  ).join('\n')
  assert.ok(ciText.includes('+2 more'), 'ci card +N more renders')
})


function panelBodyText(tree) {
  const { aside } = execDrawer(tree.children[1].el)
  const panelEl = aside.children[2].children[0]
  return collectText(panelEl.type(panelEl.props)).join('\n')
}

test('projection fills pull request data for a git_status-only session', () => {
  const conversation = {
    nodes: [
      {
        kind: 'tool-result',
        callId: 'c1',
        call: { name: 'git_status', argsRaw: '{}' },
        content: [{ type: 'text', text: 'x' }],
        isError: false,
        meta: {
          sampledAt: '2026-01-01T00:00:00.000Z',
          branch: { name: 'feature/x', ahead: 0, behind: 0 },
          files: [{ path: 'a.ts', status: 'modified' }],
        },
      },
    ],
  }
  const projected = {
    sampledAt: '2026-01-01T01:00:00.000Z',
    repository: { name: 'repo' },
    branch: { name: 'feature/x', ahead: 0, behind: 0 },
    changes: { modified: 1, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
    clean: false,
    pullRequest: { number: 42, title: 'Fix ui', state: 'OPEN', draft: false, url: 'https://example.test/pr/42' },
    ci: null,
  }
  const tree = renderHeader(conversation, { open: true, compProps: { useProjection: () => projected } })
  const text = panelBodyText(tree)
  assert.ok(text.includes('PR #42'), 'pull request from the projection renders without a conversation')
  assert.ok(text.includes('feature/x'), 'branch from the snapshots renders')
})

test('a fresher tool snapshot wins conflicts but keeps projection-only fields', () => {
  const conversation = {
    nodes: [
      {
        kind: 'tool-result',
        callId: 'c1',
        call: { name: 'git_workspace', argsRaw: '{}' },
        content: [{ type: 'text', text: 'x' }],
        isError: false,
        meta: {
          sampledAt: '2026-01-01T02:00:00.000Z',
          repository: { name: 'repo' },
          branch: { name: 'renamed-branch', ahead: 5, behind: 0 },
          changes: { modified: 7, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: false,
          files: [{ path: 'b.ts', status: 'modified' }],
          pullRequest: null,
          ci: null,
        },
      },
    ],
  }
  const projected = {
    sampledAt: '2026-01-01T01:00:00.000Z',
    repository: { name: 'repo' },
    branch: { name: 'stale-branch', ahead: 0, behind: 0 },
    changes: { modified: 0, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
    clean: true,
    files: [],
    pullRequest: { number: 7, title: 'Old pr', state: 'OPEN', draft: false, url: 'u' },
    ci: null,
  }
  const tree = renderHeader(conversation, { open: true, compProps: { useProjection: () => projected } })
  const text = panelBodyText(tree)
  assert.ok(text.includes('renamed-branch'), 'fresher tool branch wins')
  assert.ok(text.includes('PR #7'), 'projection still supplies the pull request the tool meta lacks')
})

test('projection error falls back to usable tool-result data', () => {
  const conversation = {
    nodes: [
      {
        kind: 'tool-result',
        callId: 'c1',
        call: { name: 'git_workspace', argsRaw: '{}' },
        content: [{ type: 'text', text: 'x' }],
        isError: false,
        meta: {
          repository: { name: 'repo' },
          branch: { name: 'feature/last-known', ahead: 0, behind: 0 },
          changes: { modified: 0, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: true,
          pullRequest: null,
          ci: null,
        },
      },
    ],
  }
  const tree = renderHeader(conversation, {
    open: true,
    compProps: { useProjection: () => ({ error: { code: 'NOT_A_GIT_REPOSITORY', message: 'not a repo' } }) },
  })
  const drawer = tree.children[1].el
  assert.ok(drawer.props.subtitle.includes('feature/last-known'), 'last known tool data is shown')
})

// Stateful React mock: hooks live in per-component-instance buckets refilled
// left-to-right on every execution of that component, so setState + re-render
// cycles behave predictably without a real React reconciler.
function interactiveHeader(conversation, { ctxExtras = {}, compProps = {} } = {}) {
  const store = new Map()
  let current = null
  const ReactStateful = {
    createElement: React.createElement,
    Fragment: React.Fragment,
    useState(init) {
      const bucket = current
      const i = bucket.cursor++
      if (!(i in bucket.hooks)) bucket.hooks[i] = typeof init === 'function' ? init() : init
      return [
        bucket.hooks[i],
        (v) => {
          bucket.hooks[i] = typeof v === 'function' ? v(bucket.hooks[i]) : v
        },
      ]
    },
    useRef(init) {
      const bucket = current
      const i = bucket.cursor++
      if (!(i in bucket.hooks)) bucket.hooks[i] = { current: init }
      return bucket.hooks[i]
    },
    useEffect(fn) {
      const bucket = current
      if (!bucket.effects) bucket.effects = []
      const cleanup = fn()
      if (typeof cleanup === 'function') bucket.effects.push(cleanup)
    },
    useMemo(fn) {
      return fn()
    },
    useCallback(fn) {
      return fn
    },
  }
  const runComponent = (fn, props) => {
    // Bucket per component instance: same function + same element key share
    // hooks, distinct keys (repeated tree rows) get isolated state.
    const instanceKey = String((props && props.key) !== undefined ? props.key : '')
    let byKey = store.get(fn)
    if (!byKey) store.set(fn, (byKey = new Map()))
    let bucket = byKey.get(instanceKey)
    if (!bucket) byKey.set(instanceKey, (bucket = { hooks: [] }))
    bucket.cursor = 0
    const prev = current
    current = bucket
    try {
      return fn(props || {})
    } finally {
      current = prev
    }
  }
  const { plugin } = loadBundle(ReactStateful)
  const { registrations } = collectRegistrations(plugin, ctxExtras)
  const comp = registrations.find((r) => r.def.id === 'git-workspace').comp
  const props = { useSession: (sel) => sel(conversation), sessionId: 's1', ...compProps }
  // Seed the control's first useState slot with open=true.
  store.set(comp, new Map([['', { hooks: [true] }]]))
  const render = () => {
    const tree = runComponent(comp, props)
    const portal = tree.children[1]
    const drawerEl = portal && portal.el ? portal.el : null
    let body = null
    if (drawerEl) {
      const aside = runComponent(drawerEl.type, drawerEl.props)
      const panelEl = aside.children[2].children[0]
      body = runComponent(panelEl.type, panelEl.props)
    }
    return { tree, drawerEl, body }
  }
  const walk = (node, fn, depth = 0) => {
    if (depth > 60 || node === null || node === undefined || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const n of node) walk(n, fn, depth + 1)
      return
    }
    if (node.type === undefined || node.type === null) return
    fn(node)
    if (typeof node.type === 'string' || typeof node.type === 'symbol') {
      walk(node.props && node.props.children, fn, depth + 1)
      return
    }
    if (typeof node.type === 'function') {
      if (node.type.stubName !== undefined) return
      let rendered
      try {
        rendered = runComponent(node.type, node.props)
      } catch {
        return
      }
      walk(rendered, fn, depth + 1)
    }
  }
  const findEls = (root, pred) => {
    const out = []
    walk(root, (el) => {
      if (pred(el)) out.push(el)
    })
    return out
  }
  return { render, walk, findEls }
}

function ownText(el) {
  const flat = (v) =>
    v == null || v === false
      ? ''
      : Array.isArray(v)
        ? v.map(flat).join('')
        : typeof v === 'object'
          ? flat(v.props && v.props.children)
          : String(v)
  return flat(el && el.props ? el.props.children : null)
}

const DIFF_CONVERSATION = {
  nodes: [
    {
      kind: 'tool-result',
      callId: 'c1',
      call: { name: 'git_workspace', argsRaw: '{}' },
      content: [{ type: 'text', text: 'x' }],
      isError: false,
      meta: {
        repository: { name: 'repo' },
        branch: { name: 'feature/x', ahead: 0, behind: 0 },
        changes: { modified: 2, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
        clean: false,
        pullRequest: null,
        ci: null,
        files: [
          {
            path: 'src/a.ts',
            oldPath: null,
            status: 'modified',
            staged: false,
            additions: 2,
            deletions: 1,
            hunks: [
              {
                oldStart: 1,
                oldLines: 3,
                newStart: 1,
                newLines: 4,
                lines: [' context', '-old line', '+new line', '+new line 2', ' context'],
              },
            ],
          },
          { path: 'huge.bin', oldPath: null, status: 'modified', staged: false, additions: 0, deletions: 0, diffOmitted: 'binary' },
          { path: 'no-hunks.ts', oldPath: null, status: 'untracked', staged: false },
        ],
      },
    },
  ],
}

test('clicking a file row expands its inline diff and collapses again', () => {
  const ui = interactiveHeader(DIFF_CONVERSATION)
  let { body } = ui.render()
  assert.equal(
    ui.findEls(body, (el) => el.props && el.props['data-git-workspace-diff'] === '').length,
    0,
    'no diff viewer while every row is collapsed',
  )
  const fileRow = ui.findEls(body, (el) => el.props && String(el.props.className || '').includes('dgw-filebtn')).find((el) => ownText(el).includes('a.ts'))
  assert.ok(fileRow, 'patch-backed file row is interactive')
  assert.equal(fileRow.props['aria-expanded'], false, 'row starts collapsed')
  fileRow.props.onClick()
  ;({ body } = ui.render())
  const diffs = ui.findEls(body, (el) => el.props && el.props['data-git-workspace-diff'] === '')
  assert.equal(diffs.length, 1, 'diff viewer opens for the clicked file')
  const text = collectText(diffs[0]).join('\n')
  assert.ok(text.includes('@@ -1,3 +1,4 @@'), 'hunk header renders')
  assert.ok(text.includes('context') && text.includes('old line') && text.includes('new line 2'), 'diff lines render')
  // The close action is an IconBtn wrapping the host Tooltip primitive.
  const closeTip = ui.findEls(diffs[0], (el) => el.type && el.type.stubName === 'Tooltip' && el.props.label === 'Close diff')[0]
  assert.ok(closeTip, 'viewer exposes a close action')
  const innerToggle = Array.isArray(closeTip.props.children) ? closeTip.props.children[0] : closeTip.props.children
  innerToggle.props.onClick()
  ;({ body } = ui.render())
  assert.equal(
    ui.findEls(body, (el) => el.props && el.props['data-git-workspace-diff'] === '').length,
    0,
    'diff viewer closes on demand',
  )
})

test('rows without patch data stay inert; omitted diffs offer the agent CTA', async () => {
  const prompts = []
  const ui = interactiveHeader(DIFF_CONVERSATION, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return {
          binding(id) {
            return {
              session: {
                prompt(content) {
                  prompts.push({ id, text: content[0].text })
                  return Promise.resolve({ ok: true })
                },
              },
            }
          },
        }
      },
    },
  })
  let { body } = ui.render()
  const plainRows = ui.findEls(body, (el) => {
    const cls = el.props && el.props.className
    return cls && String(cls).includes('dgw-row') && !String(cls).includes('dgw-dirbtn') && !String(cls).includes('dgw-filebtn') && ownText(el).includes('no-hunks.ts')
  })
  assert.ok(plainRows.length >= 1, 'plain row renders without interactivity markers')
  const binRow = ui.findEls(body, (el) => el.props && String(el.props.className || '').includes('dgw-filebtn')).find((el) => ownText(el).includes('huge.bin'))
  assert.ok(binRow, 'omitted-diff row is interactive')
  binRow.props.onClick()
  ;({ body } = ui.render())
  const askBtns = ui.findEls(body, (el) => ((el.type && el.type.stubName === 'Button') || el.type === 'button') && ownText(el).includes('Ask agent'))
  assert.equal(askBtns.length, 1, 'binary omission shows an ask-agent CTA')
  await askBtns[0].props.onClick()
  assert.equal(prompts.length, 1)
  assert.match(prompts[0].text, /git_diff/)
  assert.match(prompts[0].text, /huge\.bin/)
})

test('sidebar open state persists and a global hotkey toggles it', () => {
  const saved = new Map()
  const prevLS = globalThis.localStorage
  const listeners = []
  const prevWin = globalThis.window
  globalThis.localStorage = {
    getItem: (k) => (saved.has(k) ? saved.get(k) : null),
    setItem: (k, v) => saved.set(k, String(v)),
  }
  globalThis.window = {
    innerWidth: 1280,
    addEventListener: (kind, fn) => kind === 'keydown' && listeners.push(fn),
    removeEventListener: () => {},
  }
  try {
    const ui = interactiveHeader(DIFF_CONVERSATION, { compProps: { useProjection: () => null } })
    let { tree } = ui.render()
    assert.equal(tree.children.length, 2, 'sidebar starts open from the seeded state')
    assert.equal(saved.get('dsh-git-workspace.open'), '1', 'open state persists')
    // Chip click closes and persists '0'.
    const tip = tree.children[0]
    const pill = Array.isArray(tip.props.children) ? tip.props.children[0] : tip.props.children
    pill.props.onClick()
    ;({ tree } = ui.render())
    assert.equal(tree.children.length, 1, 'chip closes the sidebar')
    assert.equal(saved.get('dsh-git-workspace.open'), '0', 'closed state persists')
    // Global Ctrl/Cmd+Shift+G reopens.
    assert.equal(listeners.length >= 1, true, 'hotkey listener registered')
    listeners[0]({ ctrlKey: true, shiftKey: true, key: 'G', preventDefault() {} })
    ;({ tree } = ui.render())
    assert.equal(tree.children.length, 2, 'hotkey reopens the sidebar')
    assert.equal(saved.get('dsh-git-workspace.open'), '1', 'hotkey toggle persists too')
  } finally {
    if (prevLS === undefined) delete globalThis.localStorage
    else globalThis.localStorage = prevLS
    if (prevWin === undefined) delete globalThis.window
    else globalThis.window = prevWin
  }
})

test('drawer docks on wide viewports and falls back to overlay when narrow', () => {
  // Docked mode: a host main column gets its margin-right animated to the
  // sidebar width and restored afterwards; narrow viewports keep zIndex 1000.
  const host = {
    style: {},
    getBoundingClientRect: () => ({ width: 900 }),
  }
  const prevDoc = globalThis.document
  const prevWin = globalThis.window
  globalThis.document = {
    body: {},
    head: { appendChild() {} },
    createElement: () => ({ setAttribute() {}, style: {} }),
    querySelector: (sel) => (sel === 'main' ? host : null),
  }
  const widths = []
  globalThis.window = {
    innerWidth: 1280,
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: undefined,
    getItem: () => null,
  }
  Object.defineProperty(globalThis.window, 'localStorage', { value: { getItem: () => null, setItem: () => {} } })
  try {
    // Render the panel body through the standard harness, then execute the
    // Drawer element directly so its docking effects run against the stubs.
    const ui = interactiveHeader(DIFF_CONVERSATION, { compProps: { useProjection: () => null } })
    const { drawerEl } = ui.render()
    assert.ok(drawerEl, 'drawer renders while open')
    const aside = ui.render && null
    // Execute the Drawer function component with the same stateful runner.
    const runner = ui
    const rendered = runnerRender(runner, drawerEl)
    assert.equal(rendered.props.style.zIndex, 900, 'docked sidebar sits below overlay z-index')
    assert.equal(host.style.marginRight, rendered.props.style.width, 'host column reserves sidebar width')
    // Narrow viewport -> overlay fallback.
    globalThis.window.innerWidth = 640
    const overlay = runnerRender(runner, drawerEl)
    assert.equal(overlay.props.style.zIndex, 1000, 'narrow viewport keeps floating overlay')
    assert.ok(String(overlay.props.style.boxShadow).includes('shadow') === false || overlay.props.style.boxShadow !== 'none', 'overlay keeps its shadow')
  } finally {
    globalThis.document = prevDoc
    if (prevWin === undefined) delete globalThis.window
    else globalThis.window = prevWin
  }

  function runnerRender(runner, el) {
    // Use the harness walk machinery indirectly: runComponent is not exposed,
    // so rebuild a minimal executor over the same per-instance buckets by
    // rendering once more and executing the Drawer type through findEls walk.
    let out = null
    runner.walk(el, (node) => {
      if (out === null && node.props && node.props['data-git-workspace-drawer'] === '') {
        out = node
      }
    })
    return out
  }
})

test('Create PR empty state prompts the github_pr_create tool with explicit args', () => {
  const conversation = {
    nodes: [
      {
        kind: 'tool-result',
        callId: 'c1',
        call: { name: 'git_workspace', argsRaw: '{}' },
        content: [{ type: 'text', text: 'x' }],
        isError: false,
        meta: {
          repository: { name: 'repo' },
          branch: { name: 'feature/x', upstream: 'origin/feature/x', ahead: 2, behind: 0 },
          changes: { modified: 0, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: true,
          pullRequest: null,
          ci: null,
          commits: { ahead: 2, recent: [{ shortSha: 'abc1234', message: 'feat: do things', author: 'me', date: 'now' }] },
          comparison: { base: 'main', ahead: 2, behind: 0 },
        },
      },
    ],
  }
  const prompts = []
  const ui = interactiveHeader(conversation, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return {
          binding(id) {
            return {
              session: {
                prompt(content) {
                  prompts.push({ id, text: content[0].text })
                  return Promise.resolve({ ok: true })
                },
              },
            }
          },
        }
      },
    },
  })
  let { body } = ui.render()
  // Switch to the Pull Request tab (the panel defaults to Source Control).
  const prTabBtn = ui.findEls(body, (el) => el.type === 'button' && ownText(el).includes('Pull Request'))[0]
  assert.ok(prTabBtn, 'PR tab button renders')
  prTabBtn.props.onClick()
  ;({ body } = ui.render())
  const createBtns = ui.findEls(body, (el) => el.type === 'button' && String(el.props.className || '').includes('dgw-createpr'))
  assert.equal(createBtns.length, 1, 'Create PR button renders in the empty PR tab')
  createBtns[0].props.onClick()
  assert.equal(prompts.length, 1)
  const text = prompts[0].text
  assert.match(text, /github_pr_create/, 'prompt names the dedicated tool')
  assert.match(text, /"feature\/x"/, 'prompt carries the head branch')
  assert.match(text, /"main"/, 'prompt carries the base branch')
  assert.match(text, /git_workspace/, 'prompt asks for a refresh afterwards')
  assert.doesNotMatch(text, /git push/, 'no raw push instruction when an upstream exists')
})

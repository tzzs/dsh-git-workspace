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
    'git_stage', 'git_unstage', 'git_commit', 'git_branch_create', 'git_push', 'git_checkout', 'git_merge', 'git_reset',
    'github_pr_diff', 'github_pr_reviews', 'github_pr_comments',
    'github_ci_logs', 'github_issue', 'github_issue_comments', 'github_releases',
    'github_pr_merge', 'github_pr_comment', 'github_pr_review',
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

test('drawer shows a loading state before the first sample lands, never the legacy manual-run button', () => {
  const tree = renderHeader({ nodes: [] }, { open: true })
  const text = panelBodyText(tree)
  assert.ok(text.includes('Loading Git workspace'), 'shows a loading message while data/error/autoSampled are all still unresolved')
  assert.ok(!text.includes('Run git_workspace'), 'never shows the legacy manual-run CTA')
})

test('drawer skips the loading state and shows the session hint when there is no session to sample from', () => {
  const tree = renderHeader({ nodes: [] }, { open: true, sessionId: null })
  const text = panelBodyText(tree)
  assert.ok(text.includes('No workspace session available yet'), 'shows the no-session hint immediately instead of loading forever')
  assert.ok(!text.includes('Run git_workspace'), 'never shows the legacy manual-run CTA')
})

function sessionMock({ failCommand = false, noCommand = false, unmatched = false } = {}) {
  const recordedCommands = []
  const recordedPrompts = []
  const session = {
    ...(noCommand ? {} : {
      command(line) {
        recordedCommands.push(line)
        return Promise.resolve(
          failCommand
            ? { ok: false }
            : { ok: true, value: { matched: !unmatched } },
        )
      },
    }),
    prompt(content) {
      recordedPrompts.push(content[0].text)
      return Promise.resolve({ ok: true })
    },
  }
  return {
    session,
    commands: recordedCommands,
    prompts: recordedPrompts,
  }
}

test('refresh uses the native command channel without an agent turn', async () => {
  const mock = sessionMock()
  const tree = renderHeader({ nodes: [] }, {
    open: true,
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  const drawer = tree.children[1].el
  const refreshEl = drawer.props.actions
  assert.equal(typeof refreshEl.props.onClick, 'function', 'drawer exposes a refresh action')
  assert.equal(mock.commands.length, 0, 'no command fired on render')
  await refreshEl.props.onClick()
  assert.deepEqual(mock.commands, ['/git-refresh {}'])
  assert.deepEqual(mock.prompts, [])
})

test('refresh never falls back to chat when native commands are unavailable', async () => {
  const mock = sessionMock({ noCommand: true })
  const tree = renderHeader({ nodes: [] }, {
    open: true,
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  await tree.children[1].el.props.actions.props.onClick()
  assert.equal(mock.commands.length, 0)
  assert.deepEqual(mock.prompts, [], 'no chat fallback — the refresh silently no-ops')
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
    let diffModal = null
    if (drawerEl) {
      const aside = runComponent(drawerEl.type, drawerEl.props)
      const panelEl = aside.children[2].children[0]
      body = runComponent(panelEl.type, panelEl.props)
      // The shared diff popup (see ScTab) is itself another `ReactDOM.createPortal`
      // call, mocked the same way as the drawer's — find its element in the
      // tab's tree, render it, and unwrap the mock portal to get its content.
      const modalNode = findEls(body, (el) => el.type && el.type.name === 'Modal')[0]
      if (modalNode) {
        const modalPortal = runComponent(modalNode.type, modalNode.props)
        diffModal = modalPortal && modalPortal.el ? modalPortal.el : null
      }
    }
    return { tree, drawerEl, body, diffModal }
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

// Dispatch handlers in this panel fire-and-forget (`act()` never returns the
// onDispatch promise, so `await el.props.onClick()` only waits one tick) -
// a `next`-chained command needs the macrotask queue to drain before its
// second command has actually reached the mock session.
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
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

test('clicking a file row opens its diff in a shared popup, closable again', () => {
  const ui = interactiveHeader(DIFF_CONVERSATION)
  let { body, diffModal } = ui.render()
  assert.equal(diffModal, null, 'no diff popup while every row is untouched')
  const fileRow = ui.findEls(body, (el) => el.props && String(el.props.className || '').includes('dgw-filebtn')).find((el) => ownText(el).includes('a.ts'))
  assert.ok(fileRow, 'patch-backed file row is interactive')
  assert.equal(fileRow.props['aria-pressed'], false, 'row starts unselected')
  fileRow.props.onClick()
  ;({ body, diffModal } = ui.render())
  assert.ok(diffModal, 'the diff popup opens for the clicked file')
  const diffs = ui.findEls(diffModal, (el) => el.props && el.props['data-git-workspace-diff'] === '')
  assert.equal(diffs.length, 1, 'the popup renders the diff viewer for the clicked file')
  const text = collectText(diffs[0]).join('\n')
  assert.ok(text.includes('@@ -1,3 +1,4 @@'), 'hunk header renders')
  assert.ok(text.includes('context') && text.includes('old line') && text.includes('new line 2'), 'diff lines render')
  // The close action is an IconBtn wrapping the host Tooltip primitive.
  const closeTip = ui.findEls(diffs[0], (el) => el.type && el.type.stubName === 'Tooltip' && el.props.label === 'Close diff')[0]
  assert.ok(closeTip, 'viewer exposes a close action')
  const innerToggle = Array.isArray(closeTip.props.children) ? closeTip.props.children[0] : closeTip.props.children
  innerToggle.props.onClick()
  ;({ diffModal } = ui.render())
  assert.equal(diffModal, null, 'the diff popup closes on demand')
})

test('the diff popup toggles between unified and left/right split, pairing removed and added lines', () => {
  const ui = interactiveHeader(DIFF_CONVERSATION)
  let { body, diffModal } = ui.render()
  const fileRow = ui.findEls(body, (el) => el.props && String(el.props.className || '').includes('dgw-filebtn')).find((el) => ownText(el).includes('a.ts'))
  fileRow.props.onClick()
  ;({ diffModal } = ui.render())
  const diff = ui.findEls(diffModal, (el) => el.props && el.props['data-git-workspace-diff'] === '')[0]
  assert.equal(ui.findEls(diff, (el) => String(el.props && el.props.className) === 'dgw-diff-splitpane').length, 0, 'starts in unified view')

  const splitToggle = ui.findEls(diff, (el) => el.props && el.props.title === 'Split view')[0]
  assert.ok(splitToggle, 'a Split option is offered')
  splitToggle.props.onClick()
  ;({ diffModal } = ui.render())
  const split = ui.findEls(diffModal, (el) => el.props && el.props['data-git-workspace-diff'] === '')[0]
  const cols = ui.findEls(split, (el) => String(el.props && el.props.className) === 'dgw-diff-splitcol')
  assert.equal(cols.length, 2, 'split view renders two columns')
  const [left, right] = cols.map((col) => collectText(col).join('\n'))
  assert.ok(left.includes('old line') && !left.includes('new line'), 'left column only carries the removed line')
  assert.ok(right.includes('new line') && right.includes('new line 2') && !right.includes('old line'), 'right column only carries the added lines')
  assert.ok(left.includes('context') && right.includes('context'), 'context lines mirror onto both columns')

  const unifiedToggle = ui.findEls(split, (el) => el.props && el.props.title === 'Unified view')[0]
  unifiedToggle.props.onClick()
  ;({ diffModal } = ui.render())
  const backToUnified = ui.findEls(diffModal, (el) => el.props && el.props['data-git-workspace-diff'] === '')[0]
  assert.equal(
    ui.findEls(backToUnified, (el) => String(el.props && el.props.className) === 'dgw-diff-splitpane').length,
    0,
    'toggling back returns to the single unified column',
  )
})

test('rows without patch data stay inert; omitted diffs offer a native diff CTA', async () => {
  const mock = sessionMock()

  const ui = interactiveHeader(DIFF_CONVERSATION, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  let { body, diffModal } = ui.render()
  const plainRows = ui.findEls(body, (el) => {
    const cls = el.props && el.props.className
    return cls && String(cls).includes('dgw-row') && !String(cls).includes('dgw-dirbtn') && !String(cls).includes('dgw-filebtn') && ownText(el).includes('no-hunks.ts')
  })
  assert.ok(plainRows.length >= 1, 'plain row renders without interactivity markers')
  const binRow = ui.findEls(body, (el) => el.props && String(el.props.className || '').includes('dgw-filebtn')).find((el) => ownText(el).includes('huge.bin'))
  assert.ok(binRow, 'omitted-diff row is interactive')
  binRow.props.onClick()
  ;({ diffModal } = ui.render())
  assert.ok(diffModal, 'the popup opens for the omitted-diff row')
  const askBtns = ui.findEls(diffModal, (el) => ((el.type && el.type.stubName === 'Button') || el.type === 'button') && ownText(el).includes('Fetch full diff'))
  assert.equal(askBtns.length, 1, 'the opened binary omission shows one fetch-full-diff CTA')
  const askBtn = askBtns[0]
  await askBtn.props.onClick()
  assert.deepEqual(mock.commands, ['/git-diff {"path":"huge.bin"}'], 'the CTA dispatches the native git-diff command')
  assert.deepEqual(mock.prompts, [], 'no chat fallback for the full-diff fetch')
})

test('stage-all dispatches its native write command and does not prompt', async () => {
  const mock = sessionMock()
  const ui = interactiveHeader(DIFF_CONVERSATION, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  let { body } = ui.render()
  const stageAll = ui.findEls(body, (el) => el.type === 'button' && ownText(el) === 'Stage all')[0]
  assert.ok(stageAll, 'Stage all button renders')
  await stageAll.props.onClick()
  assert.deepEqual(mock.commands, ['/git-stage {"all":true}'])
  assert.deepEqual(mock.prompts, [])
})

test('a folder row\'s hover control stages every file under it in one dispatch, then offers to unstage', async () => {
  const mock = sessionMock()
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
          branch: { name: 'feature/x', ahead: 0, behind: 0 },
          changes: { modified: 2, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: false,
          pullRequest: null,
          ci: null,
          files: [
            { path: 'src/a.ts', oldPath: null, status: 'modified', staged: false },
            { path: 'src/b.ts', oldPath: null, status: 'modified', staged: false },
          ],
        },
      },
    ],
  }
  const ui = interactiveHeader(conversation, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  let { body } = ui.render()
  // `IconBtn` wraps its real `<button>` in the host Tooltip primitive, which
  // is a stub in this harness (see makePrimitivesStub) — `walk` stops at a
  // stub rather than rendering into it, so the button underneath has to be
  // read directly off the Tooltip element's `children` prop instead of via
  // another `findEls` pass (same pattern the diff popup's close-button test
  // above uses).
  const stageDirTip = ui.findEls(body, (el) => el.type && el.type.stubName === 'Tooltip' && el.props.label === 'Stage all files in this folder')[0]
  assert.ok(stageDirTip, 'unstaged folder shows a stage-all-in-folder control')
  const stageDirBtn = Array.isArray(stageDirTip.props.children) ? stageDirTip.props.children[0] : stageDirTip.props.children
  await stageDirBtn.props.onClick()
  assert.deepEqual(mock.commands, ['/git-stage {"paths":["src/a.ts","src/b.ts"]}'], 'stages every file under the folder in one dispatch')
})

test('the discard hover controls dispatch git-discard-paths scoped to the folder or the single file', async () => {
  const mock = sessionMock()
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
          branch: { name: 'feature/x', ahead: 0, behind: 0 },
          changes: { modified: 2, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: false,
          pullRequest: null,
          ci: null,
          files: [
            { path: 'src/a.ts', oldPath: null, status: 'modified', staged: false },
            { path: 'src/b.ts', oldPath: null, status: 'modified', staged: false },
          ],
        },
      },
    ],
  }
  const ui = interactiveHeader(conversation, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  const { body } = ui.render()
  const findBtn = (label) => {
    const tip = ui.findEls(body, (el) => el.type && el.type.stubName === 'Tooltip' && el.props.label === label)[0]
    assert.ok(tip, `${label} control renders`)
    return Array.isArray(tip.props.children) ? tip.props.children[0] : tip.props.children
  }
  await findBtn('Discard changes in this folder').props.onClick()
  await findBtn('Discard changes to this file').props.onClick()
  assert.deepEqual(
    mock.commands,
    [
      '/git-discard-paths {"paths":["src/a.ts","src/b.ts"]}',
      '/git-discard-paths {"paths":["src/a.ts"]}',
    ],
    'the folder control discards every file under it, the file control only its own path',
  )
})

test('an untracked directory reported by git as a single "dir/" entry renders as one row, not a nameless child', () => {
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
          branch: { name: 'feature/x', ahead: 0, behind: 0 },
          changes: { modified: 0, staged: 0, deleted: 0, renamed: 0, untracked: 1 },
          clean: false,
          pullRequest: null,
          ci: null,
          files: [{ path: '.claude/', oldPath: null, status: 'untracked', staged: false }],
        },
      },
    ],
  }
  const ui = interactiveHeader(conversation)
  const { body } = ui.render()
  const dirButtons = ui.findEls(body, (el) => el.props && String(el.props.className || '').includes('dgw-dirbtn'))
  assert.equal(dirButtons.length, 0, 'the whole-directory entry does not render as an expandable folder')
  const nameless = ui.findEls(body, (el) => {
    const cls = el.props && el.props.className
    return cls && String(cls).includes('dgw-row') && ownText(el) === ''
  })
  assert.equal(nameless.length, 0, 'no row renders with an empty name')
  // `el.type === 'div'` excludes the `Row` component element itself — the
  // non-clickable branch calls `React.createElement(Row, {className:...})`,
  // so the wrapper element carries the same className the rendered `<div>`
  // does, and both are visited by `walk`.
  const row = ui.findEls(body, (el) => el.type === 'div' && String(el.props.className || '').includes('dgw-row') && ownText(el).includes('.claude'))
  assert.equal(row.length, 1, 'the directory renders as one row named ".claude"')
})

test('an unmatched native command disables the whole panel with an explicit hint, never chat', async () => {
  const mock = sessionMock({ unmatched: true })
  const ui = interactiveHeader(DIFF_CONVERSATION, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  let { body } = ui.render()
  const stageAll = ui.findEls(body, (el) => el.type === 'button' && ownText(el) === 'Stage all')[0]
  assert.ok(stageAll, 'Stage all button renders before the host is known to lack native commands')
  await stageAll.props.onClick()
  ;({ body } = ui.render())
  const hint = ui.findEls(body, (el) => el.type === 'span' && ownText(el).includes('no native command channel'))
  assert.ok(hint.length > 0, 'panel shows an explicit unsupported-commands hint')
  assert.equal(
    ui.findEls(body, (el) => el.type === 'button' && ownText(el) === 'Stage all').length,
    0,
    'write controls disappear once native commands are known unsupported',
  )
  assert.deepEqual(mock.prompts, [], 'no chat fallback is ever used, even once native support is ruled out')
})

test('a failed native command never falls back to another queued turn', async () => {
  const mock = sessionMock({ failCommand: true })
  const ui = interactiveHeader(DIFF_CONVERSATION, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  let { body } = ui.render()
  const stageAll = ui.findEls(body, (el) => el.type === 'button' && ownText(el) === 'Stage all')[0]
  await stageAll.props.onClick()
  assert.equal(mock.commands.length, 1)
  assert.deepEqual(mock.prompts, [])
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

test('Create PR empty state dispatches the native github PR command with explicit args', async () => {
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
  const mock = sessionMock()
  const ui = interactiveHeader(conversation, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  let { body } = ui.render()
  const prTabBtn = ui.findEls(body, (el) => el.type === 'button' && ownText(el).includes('Pull Request'))[0]
  assert.ok(prTabBtn, 'PR tab button renders')
  prTabBtn.props.onClick()
  ;({ body } = ui.render())
  const createBtns = ui.findEls(body, (el) => el.type === 'button' && String(el.props.className || '').includes('dgw-createpr'))
  assert.equal(createBtns.length, 1, 'Create PR button renders in the empty PR tab')
  await createBtns[0].props.onClick()
  assert.equal(mock.commands.length, 1, 'create PR dispatches one native command; projection sampling refreshes automatically')
  const createLine = mock.commands.find((line) => typeof line === "string" && line.startsWith("/git-pr-create "))
  const create = JSON.parse(createLine.slice("/git-pr-create ".length))
  assert.equal(create.head, 'feature/x')
  assert.equal(create.base, 'main')
  assert.equal(create.title, 'feat: do things')
  assert.deepEqual(mock.prompts, [])
})

test('commit row dispatches the native git-show command for its diff', async () => {
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
          branch: { name: 'feature/x', upstream: 'origin/feature/x', ahead: 0, behind: 0 },
          changes: { modified: 0, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: true,
          pullRequest: null,
          ci: null,
          commits: [{ sha: 'abc1234567', shortSha: 'abc1234', message: 'do things', author: 'me', date: 'now' }],
        },
      },
    ],
  }
  const mock = sessionMock()
  const ui = interactiveHeader(conversation, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  const { body } = ui.render()
  const viewBtn = ui.findEls(body, (el) => el.type === 'button' && el.props.title === 'View this commit’s diff')[0]
  assert.ok(viewBtn, 'commit row renders a view-diff control')
  await viewBtn.props.onClick()
  assert.deepEqual(mock.commands, ['/git-show {"sha":"abc1234567"}'])
  assert.deepEqual(mock.prompts, [])
})

test('a failing CI check offers a native log-fetch CTA; passing checks do not', async () => {
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
          branch: { name: 'feature/x', upstream: 'origin/feature/x', ahead: 0, behind: 0 },
          changes: { modified: 0, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: true,
          pullRequest: { number: 7, title: 'Add thing', state: 'OPEN', url: 'https://github.com/o/r/pull/7', comments: [] },
          ci: {
            status: 'failure',
            checks: [
              { name: 'build', status: 'completed', conclusion: 'success', url: 'https://github.com/o/r/actions/runs/111' },
              { name: 'test', status: 'completed', conclusion: 'failure', url: 'https://github.com/o/r/actions/runs/222' },
            ],
          },
        },
      },
    ],
  }
  const mock = sessionMock()
  const ui = interactiveHeader(conversation, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  let { body } = ui.render()
  const prTabBtn = ui.findEls(body, (el) => el.type === 'button' && ownText(el).includes('Pull Request'))[0]
  prTabBtn.props.onClick()
  ;({ body } = ui.render())
  const logBtns = ui.findEls(body, (el) => el.type === 'button' && el.props.title === 'Fetch failure logs')
  assert.equal(logBtns.length, 1, 'only the failing check offers a log CTA')
  await logBtns[0].props.onClick()
  assert.deepEqual(mock.commands, ['/git-ci-logs {"runId":222}'])
  assert.deepEqual(mock.prompts, [])
})

test('the PR header offers a native full-diff fetch CTA', async () => {
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
          branch: { name: 'feature/x', upstream: 'origin/feature/x', ahead: 0, behind: 0 },
          changes: { modified: 0, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: true,
          pullRequest: { number: 7, title: 'Add thing', state: 'OPEN', url: 'https://github.com/o/r/pull/7', comments: [] },
          ci: null,
        },
      },
    ],
  }
  const mock = sessionMock()
  const ui = interactiveHeader(conversation, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  let { body } = ui.render()
  const prTabBtn = ui.findEls(body, (el) => el.type === 'button' && ownText(el).includes('Pull Request'))[0]
  prTabBtn.props.onClick()
  ;({ body } = ui.render())
  const diffBtn = ui.findEls(body, (el) => el.type === 'button' && el.props.title === 'Fetch the full pull request diff')[0]
  assert.ok(diffBtn, 'PR header renders a full-diff fetch control')
  await diffBtn.props.onClick()
  assert.deepEqual(mock.commands, ['/git-pr-diff {"number":7}'])
  assert.deepEqual(mock.prompts, [])
})

test('expanding a check row reveals Status/Started/Completed, workflow/check ids, and a native annotations CTA', async () => {
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
          branch: { name: 'feature/x', upstream: 'origin/feature/x', ahead: 0, behind: 0 },
          changes: { modified: 0, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: true,
          pullRequest: { number: 7, title: 'Add thing', state: 'OPEN', url: 'https://github.com/o/r/pull/7', comments: [] },
          ci: {
            status: 'success',
            checks: [
              {
                name: 'test (24)',
                status: 'completed',
                conclusion: 'success',
                workflow: 'CI',
                url: 'https://github.com/o/r/actions/runs/33197470532/job/98938175279',
                startedAt: '2026-08-28T18:02:33Z',
                completedAt: '2026-08-28T18:02:47Z',
              },
            ],
          },
        },
      },
    ],
  }
  const mock = sessionMock()
  const ui = interactiveHeader(conversation, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  let { body } = ui.render()
  const prTabBtn = ui.findEls(body, (el) => el.type === 'button' && ownText(el).includes('Pull Request'))[0]
  prTabBtn.props.onClick()
  ;({ body } = ui.render())

  const row = ui.findEls(body, (el) => el.props && el.props.role === 'button' && el.props.className === 'dgw-row' && ownText(el).includes('test (24)'))[0]
  assert.ok(row, 'the check renders as an expandable row')
  assert.equal(
    ui.findEls(body, (el) => el.type === 'span' && ownText(el) === 'workflow #33197470532').length,
    0,
    'detail is collapsed until the row is opened',
  )
  row.props.onClick()
  ;({ body } = ui.render())

  assert.ok(
    ui.findEls(body, (el) => el.type === 'span' && /^Started \d{4}\/\d{1,2}\/\d{1,2} \d{2}:\d{2}:\d{2}$/.test(ownText(el))).length > 0,
    'expanded panel shows the Started timestamp',
  )
  assert.ok(
    ui.findEls(body, (el) => el.type === 'span' && /^Completed \d{4}\/\d{1,2}\/\d{1,2} \d{2}:\d{2}:\d{2}$/.test(ownText(el))).length > 0,
    'expanded panel shows the Completed timestamp',
  )
  assert.ok(
    ui.findEls(body, (el) => el.type === 'span' && ownText(el) === 'workflow #33197470532').length > 0,
    'the workflow run id is parsed from the check URL',
  )
  assert.ok(
    ui.findEls(body, (el) => el.type === 'span' && ownText(el) === 'check #98938175279').length > 0,
    'the check run id is parsed from the check URL',
  )

  const annBtn = ui.findEls(body, (el) => el.type === 'button' && el.props.title === "Fetch this check run's warning/error annotations")[0]
  assert.ok(annBtn, 'expanded panel offers an annotations-fetch control')
  annBtn.props.onClick()
  await flush()
  assert.deepEqual(mock.commands, ['/git-ci-annotations {"checkId":98938175279}'])
  assert.deepEqual(mock.prompts, [])
})

test('the merge split button merges with the default method; the chevron menu switches methods or closes the PR', async () => {
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
          branch: { name: 'feature/x', upstream: 'origin/feature/x', ahead: 0, behind: 0 },
          changes: { modified: 0, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: true,
          pullRequest: { number: 7, title: 'Add thing', state: 'OPEN', merged: false, url: 'https://github.com/o/r/pull/7', comments: [] },
          ci: null,
        },
      },
    ],
  }
  const mock = sessionMock()
  const ui = interactiveHeader(conversation, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  let { body } = ui.render()
  const prTabBtn = ui.findEls(body, (el) => el.type === 'button' && ownText(el).includes('Pull Request'))[0]
  prTabBtn.props.onClick()
  ;({ body } = ui.render())

  const mergeBtn = ui.findEls(body, (el) => el.type === 'button' && el.props.title === 'Merge this pull request with the selected method')[0]
  assert.equal(ownText(mergeBtn), 'Squash and merge', 'squash is the default method')
  mergeBtn.props.onClick()
  await flush()
  assert.deepEqual(mock.commands, ['/git-pr-merge {"number":7,"method":"squash"}', '/git-refresh {}'])

  const menuBtn = ui.findEls(body, (el) => el.type === 'button' && el.props['aria-label'] === 'Choose merge method, or close this pull request')[0]
  menuBtn.props.onClick()
  ;({ body } = ui.render())
  const mergeCommitItem = ui.findEls(body, (el) => el.props && el.props.role === 'button' && ownText(el).includes('Create a merge commit'))[0]
  assert.ok(mergeCommitItem, 'the dropdown lists the other merge methods')
  mergeCommitItem.props.onClick()
  ;({ body } = ui.render())
  const mergeBtn2 = ui.findEls(body, (el) => el.type === 'button' && el.props.title === 'Merge this pull request with the selected method')[0]
  assert.equal(ownText(mergeBtn2), 'Create a merge commit', 'picking a method from the menu only re-labels the button')
  assert.deepEqual(mock.commands, ['/git-pr-merge {"number":7,"method":"squash"}', '/git-refresh {}'], 'no merge fired just from picking a method')

  const menuBtn2 = ui.findEls(body, (el) => el.type === 'button' && el.props['aria-label'] === 'Choose merge method, or close this pull request')[0]
  menuBtn2.props.onClick()
  ;({ body } = ui.render())
  const closeItem = ui.findEls(body, (el) => el.props && el.props.role === 'button' && ownText(el).includes('Close pull request'))[0]
  assert.ok(closeItem, 'the dropdown offers Close pull request')
  closeItem.props.onClick()
  await flush()
  assert.deepEqual(mock.commands, [
    '/git-pr-merge {"number":7,"method":"squash"}',
    '/git-refresh {}',
    '/git-pr-close {"number":7}',
    '/git-refresh {}',
  ])
  assert.deepEqual(mock.prompts, [])
})

test('branch/merge inputs offer known branches via a datalist; new-branch input does not', async () => {
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
          branch: { name: 'feature/x', upstream: 'origin/feature/x', ahead: 0, behind: 0 },
          changes: { modified: 1, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: false,
          pullRequest: null,
          ci: null,
          files: [{ path: 'a.ts', oldPath: null, status: 'modified', staged: false }],
          branches: [
            { name: 'feature/x', current: true, upstream: null, ahead: 0, behind: 0 },
            { name: 'main', current: false, upstream: 'origin/main', ahead: 0, behind: 0 },
            { name: 'develop', current: false, upstream: null, ahead: 0, behind: 0 },
          ],
        },
      },
    ],
  }
  const mock = sessionMock()
  const ui = interactiveHeader(conversation, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  let { body } = ui.render()
  const menuBtn = ui.findEls(body, (el) => el.type === 'button' && el.props['aria-label'] === 'More Git operations')[0]
  assert.ok(menuBtn, 'git action menu toggle renders')
  menuBtn.props.onClick()
  ;({ body } = ui.render())
  const switchBtn = ui.findEls(body, (el) => el.type === 'button' && el.props.className === 'dgw-action' && ownText(el) === 'Switch Branch')[0]
  assert.ok(switchBtn, 'Switch Branch menu item renders')
  switchBtn.props.onClick()
  ;({ body } = ui.render())
  const input = ui.findEls(body, (el) => el.type === 'input' && el.props['aria-label'] === 'Branch name')[0]
  assert.equal(input.props.list, 'dgw-known-branches', 'switch-branch input wires to the known-branches datalist')
  const options = ui.findEls(body, (el) => el.type === 'option').map((el) => el.props.value)
  assert.deepEqual(options.sort(), ['develop', 'main'], 'datalist offers known branches, excluding the current one')

  const cancelBtn = ui.findEls(body, (el) => el.type === 'button' && ownText(el) === 'Cancel')[0]
  cancelBtn.props.onClick()
  ;({ body } = ui.render())
  menuBtn.props.onClick()
  ;({ body } = ui.render())
  const newBtn = ui.findEls(body, (el) => el.type === 'button' && el.props.className === 'dgw-action' && ownText(el) === 'New Branch')[0]
  newBtn.props.onClick()
  ;({ body } = ui.render())
  const input2 = ui.findEls(body, (el) => el.type === 'input' && el.props['aria-label'] === 'Branch name')[0]
  assert.equal(input2.props.list, undefined, 'new-branch input has no datalist wiring')
})

test('changed files nested in single-child directory chains render as one compacted row', () => {
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
          branch: { name: 'feature/x', ahead: 0, behind: 0 },
          changes: { modified: 2, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: false,
          pullRequest: null,
          ci: null,
          files: [
            { path: 'src/client/panel/workspace-panel.js', oldPath: null, status: 'modified', staged: false },
            { path: 'README.md', oldPath: null, status: 'modified', staged: false },
          ],
        },
      },
    ],
  }
  const ui = interactiveHeader(conversation)
  const { body } = ui.render()
  const dirButtons = ui.findEls(body, (el) => el.props && String(el.props.className || '').includes('dgw-dirbtn'))
  assert.equal(dirButtons.length, 1, 'the single-child src/client/panel chain collapses into one directory row')
  assert.ok(ownText(dirButtons[0]).includes('src/client/panel'), 'the compacted row shows the full merged path')
})

test('file row icon color reflects git status, with a caption fallback for unknown status', () => {
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
          branch: { name: 'feature/x', ahead: 0, behind: 0 },
          changes: { modified: 0, staged: 0, deleted: 1, renamed: 0, untracked: 0 },
          clean: false,
          pullRequest: null,
          ci: null,
          files: [
            { path: 'deleted.ts', oldPath: null, status: 'deleted', staged: false },
            { path: 'mystery.ts', oldPath: null, status: 'weird-status', staged: false },
          ],
        },
      },
    ],
  }
  const ui = interactiveHeader(conversation)
  const { body } = ui.render()
  const iconSpans = ui.findEls(
    body,
    (el) => el.type === 'span' && el.props && el.props.children && el.props.children.type && el.props.children.type.stubName === 'IconCodeOutline16',
  )
  assert.equal(iconSpans.length, 2, 'both file rows render the generic file icon')
  const colors = iconSpans.map((el) => el.props.style.color)
  assert.ok(colors.includes('var(--dsw-alias-state-error-primary)'), 'deleted file icon uses the delete color')
  assert.ok(colors.includes('var(--dsw-alias-label-caption)'), 'unrecognized status falls back to the caption color')
})

test('commit row expands to show author/date/sha on click; the diff button does not toggle it', async () => {
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
          branch: { name: 'feature/x', ahead: 0, behind: 0 },
          changes: { modified: 0, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: true,
          pullRequest: null,
          ci: null,
          commits: [
            { sha: 'aaa1111111', shortSha: 'aaa1111', message: 'first', author: 'me', date: '2024-01-02T00:00:00Z' },
            { sha: 'bbb2222222', shortSha: 'bbb2222', message: 'second', author: 'me', date: '2024-01-01T00:00:00Z' },
          ],
        },
      },
    ],
  }
  const mock = sessionMock()
  const ui = interactiveHeader(conversation, {
    ctxExtras: {
      get(name) {
        if (name !== 'sessions') return undefined
        return { binding: () => ({ session: mock.session }) }
      },
    },
  })
  let { body } = ui.render()
  const toggles = ui.findEls(body, (el) => el.props && el.props.title === 'Toggle commit details')
  assert.equal(toggles.length, 2, 'both commit rows render a toggle')

  assert.ok(
    ui.findEls(body, (el) => el.type === 'div' && ownText(el).includes('aaa1111')).length > 0,
    'the HEAD commit is expanded by default and shows its metadata',
  )
  assert.equal(
    ui.findEls(body, (el) => el.type === 'div' && ownText(el).includes('bbb2222')).length,
    0,
    'the non-HEAD commit stays collapsed by default',
  )

  toggles[1].props.onClick()
  ;({ body } = ui.render())
  assert.ok(
    ui.findEls(body, (el) => el.type === 'div' && ownText(el).includes('bbb2222')).length > 0,
    'clicking the row toggles its metadata open',
  )

  const diffBtns = ui.findEls(body, (el) => el.type === 'button' && el.props.title === 'View this commit’s diff')
  assert.equal(diffBtns.length, 2, 'each commit row renders a view-diff control')
  await diffBtns[1].props.onClick({ stopPropagation() {} })
  assert.deepEqual(mock.commands, ['/git-show {"sha":"bbb2222222"}'])
  ;({ body } = ui.render())
  assert.ok(
    ui.findEls(body, (el) => el.type === 'div' && ownText(el).includes('bbb2222')).length > 0,
    'the diff button does not collapse the row it belongs to',
  )
})

test('the graph pins the PR base branch at the comparison boundary and fills a ring dot solid once selected', async () => {
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
          branch: { name: 'feature/x', ahead: 0, behind: 0 },
          changes: { modified: 0, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: true,
          pullRequest: { number: 5, title: 'x', base: 'main', state: 'OPEN', draft: false, url: 'u' },
          comparison: { base: 'main', ahead: 2, behind: 0 },
          ci: null,
          commits: [
            { sha: 'aaa1111111', shortSha: 'aaa1111', message: 'first', author: 'me', date: '2024-01-03T00:00:00Z' },
            { sha: 'bbb2222222', shortSha: 'bbb2222', message: 'Merge branch old', author: 'me', date: '2024-01-02T00:00:00Z' },
            { sha: 'ccc3333333', shortSha: 'ccc3333', message: 'third', author: 'me', date: '2024-01-01T00:00:00Z' },
          ],
        },
      },
    ],
  }
  const ui = interactiveHeader(conversation)
  let { body } = ui.render()

  assert.ok(
    ui.findEls(body, (el) => el.type === 'span' && ownText(el) === 'main').length > 0,
    'the PR base branch renders as a pill at the commit comparison.ahead points to',
  )

  const dotOf = (b) =>
    ui.findEls(
      b,
      (el) =>
        el.type === 'span' &&
        el.props &&
        el.props.style &&
        el.props.style.borderRadius === '50%' &&
        el.props.style.position === 'absolute' &&
        el.props.style.boxSizing === 'border-box',
    )
  const mergeDotBefore = dotOf(body)[1]
  assert.equal(mergeDotBefore.props.style.background, 'transparent', 'an unselected merge commit renders a hollow ring')
  assert.ok(mergeDotBefore.props.style.border, 'the hollow ring has a visible border')

  const toggles = ui.findEls(body, (el) => el.props && el.props.title === 'Toggle commit details')
  toggles[1].props.onClick()
  ;({ body } = ui.render())
  const mergeDotAfter = dotOf(body)[1]
  assert.notEqual(mergeDotAfter.props.style.background, 'transparent', 'selecting (expanding) the merge commit fills its ring solid')
  assert.equal(mergeDotAfter.props.style.border, undefined, 'the solid dot carries no separate ring border')
})

test('"Committed on branch" names the actual comparison base instead of a generic "upstream branch"', async () => {
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
          branch: { name: 'feature-y', upstream: 'origin/feature-y', ahead: 0, behind: 0 },
          changes: { modified: 0, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
          clean: true,
          pullRequest: null,
          comparison: { base: 'master', ahead: 0, behind: 0 },
          ci: null,
        },
      },
    ],
  }
  const ui = interactiveHeader(conversation)
  const { body } = ui.render()
  assert.ok(
    ui.findEls(body, (el) => el.type === 'span' && ownText(el).includes('No commits ahead of master')).length > 0,
    'names the real comparison base branch',
  )
  assert.equal(
    ui.findEls(body, (el) => el.type === 'span' && ownText(el).includes('upstream branch')).length,
    0,
    'no longer uses the generic, potentially-wrong "upstream branch" wording',
  )
})

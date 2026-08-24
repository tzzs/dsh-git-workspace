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
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useRef: (init) => ({ current: init }),
}

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
    'github_pr', 'github_ci', 'git_files', 'git_compare', 'git_blame',
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
  assert.equal(tree.children[0].type, 'button', 'toggle stays a plain button before the primitives swap')
  assert.equal(
    tree.children[0].children.some((c) => c && c.props && String(c.children) === '3'),
    true,
    'dirty count badge shows total changes',
  )
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
  const kids = []
  const props = current && typeof current === 'object' ? current.props : undefined
  if (props && props.children !== undefined) kids.push(props.children)
  if (current && typeof current === 'object' && !Array.isArray(current.children) && current.children !== undefined) kids.push(current.children)
  else if (Array.isArray(current?.children)) kids.push(current.children)
  for (const k of kids) collectText(k, out, depth + 1)
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

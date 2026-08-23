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
      if (!(key in t)) t[key] = () => null
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
  assert.equal(tree.children[0].type, 'button')
  assert.equal(
    tree.children[0].children.some((c) => c && c.props && String(c.children) === '3'),
    true,
    'dirty count badge shows total changes',
  )
})

function renderHeader(conversation, { open = false, pending = false, sessionId = 's1', ctxExtras = {} } = {}) {
  const reactMock = open
    ? {
        ...React,
        useState: (() => {
          const states = [true, pending]
          let call = 0
          return () => {
            const value = call < states.length ? states[call] : true
            call += 1
            return [value, () => {}]
          }
        })(),
      }
    : React
  const { plugin } = loadBundle(reactMock)
  const { registrations } = collectRegistrations(plugin, ctxExtras)
  const headerComp = registrations.find((r) => r.def.id === 'git-workspace').comp
  return headerComp({ useSession: (sel) => sel(conversation), sessionId })
}

// Execute the Drawer component against its element props so the rendered
// backdrop/aside structure can be asserted without a real React renderer.
function execDrawer(drawerEl) {
  assert.equal(typeof drawerEl.type, 'function', 'drawer is a component element')
  const fragment = drawerEl.type(drawerEl.props)
  const aside = fragment.children[1]
  const backdrop = fragment.children[0]
  return { fragment, backdrop, aside }
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
  const { backdrop, aside } = execDrawer(tree.children[1].el)
  assert.equal(typeof backdrop.props.onClick, 'function', 'backdrop closes on click')
  assert.equal(aside.props['data-git-workspace-drawer'], '', 'drawer aside is rendered')
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

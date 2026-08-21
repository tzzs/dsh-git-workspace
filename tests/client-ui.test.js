import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Mock React with a vdom builder so we can exercise the client components
// without pulling in a real React build in the test runner.
const React = {
  createElement: (type, props, ...children) => ({
    type,
    props,
    children,
  }),
  Fragment: Symbol('Fragment'),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
}

function loadBundle(reactMock = React) {
  const prev = globalThis.window
  const loaded = []
  globalThis.window = { __ModuleLoader__: { load: (x) => loaded.push(x) } }
  // Evaluate the bundle source directly to avoid module-cache reuse between tests.
  ;(0, eval)(readFileSync(require.resolve('../lib/client/client.js'), 'utf8'))
  if (prev === undefined) delete globalThis.window
  else globalThis.window = prev
  const entry = loaded[0]
  const plugin = entry.factory((spec) => {
    if (spec === 'react' || spec === 'react/jsx-runtime') return reactMock
    throw new Error('unexpected external: ' + spec)
  })
  return { plugin, React: reactMock }
}

function collectRegistrations(plugin) {
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
  }
  plugin.apply(ctx)
  return registrations
}

test('client bundle conforms to the DSH module-loader contract', () => {
  const { plugin } = loadBundle()
  assert.equal(typeof plugin.apply, 'function')
  assert.ok(Array.isArray(plugin.inject))
  assert.ok(plugin.inject.includes('slots'))
})

test('client registers a toolview for every Git/GitHub tool', () => {
  const { plugin } = loadBundle()
  const regs = collectRegistrations(plugin)
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

test('client registers the Git Workspace session header action', () => {
  const { plugin } = loadBundle()
  const regs = collectRegistrations(plugin)
  const header = regs.find((r) => r.def.name === 'conversation.session.header.actions')
  assert.ok(header, 'conversation.session.header.actions registered')
  assert.equal(header.def.id, 'git-workspace')
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
  const regs = collectRegistrations(plugin)
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
  const regs = collectRegistrations(plugin)
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
  const regs = collectRegistrations(plugin)
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
  const regs = collectRegistrations(plugin)
  const comp = regs.find((r) => r.def.key === 'git_workspace').comp
  const tree = comp({ block: settledBlock(null), openFile: () => {} })
  assert.ok(tree.type)
})

test('Git Workspace header action renders a closed toggle', () => {
  const { plugin } = loadBundle()
  const regs = collectRegistrations(plugin)
  const headerComp = regs.find((r) => r.def.id === 'git-workspace').comp
  const tree = headerComp({ useSession: () => null })
  assert.ok(tree.children, 'returns a fragment')
  assert.equal(tree.children.length, 1, 'only the toggle renders while closed')
  assert.equal(tree.children[0].type, 'button')
})

test('Git Workspace header action renders the panel open with conversation data', () => {
  const openReact = { ...React, useState: (init) => [true, () => {}] }
  const { plugin } = loadBundle(openReact)
  const regs = collectRegistrations(plugin)
  const headerComp = regs.find((r) => r.def.id === 'git-workspace').comp

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
        },
      },
    ],
  }
  const tree = headerComp({ useSession: (sel) => sel(conversation) })
  assert.ok(tree.children, 'returns a fragment')
  assert.equal(tree.children.length, 2, 'toggle + panel render while open')
  const panel = tree.children[1]
  assert.equal(panel.props.data.repository.name, 'repo')
  assert.equal(panel.props.data.branch.name, 'feature/x')
  assert.equal(panel.props.data.branch.ahead, 2)
})

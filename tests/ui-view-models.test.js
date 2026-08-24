import test from 'node:test'
import assert from 'node:assert/strict'
import {
  toGitFileVm,
  groupFiles,
  toCommitVm,
  toDiffHunkVm,
  toDiffFileVm,
  toPullRequestVm,
  toCheckVm,
  toReviewCommentVm,
  unresolvedComments,
  toIssueVm,
  toBranchVm,
  fromWorkspaceResult,
  truncatePath,
  checkIcon,
} from '../lib/ui/view-models.js'
import { toWorkspaceMeta, toDiffMeta } from '../lib/ui/meta.js'

test('toGitFileVm maps status to label and staged/unstaged', () => {
  const m = toGitFileVm({ path: 'a.ts', status: 'modified', staged: true })
  assert.equal(m.label, 'M')
  assert.equal(m.staged, true)
  assert.equal(m.unstaged, false)
})

test('groupFiles orders groups by git status', () => {
  const files = [
    toGitFileVm({ path: 'u.ts', status: 'untracked', staged: false }),
    toGitFileVm({ path: 'm.ts', status: 'modified', staged: false }),
    toGitFileVm({ path: 's.ts', status: 'added', staged: true }),
  ]
  const groups = groupFiles(files)
  assert.deepEqual(
    groups.map((g) => g.key),
    ['staged', 'modified', 'untracked'],
  )
  assert.equal(groups[0].title, 'STAGED')
})

test('toCommitVm carries file stats', () => {
  const c = toCommitVm({
    sha: 'abc',
    shortSha: 'abc123',
    message: 'hi',
    author: 'A',
    date: 'd',
    files: { count: 2, additions: 5, deletions: 3 },
  })
  assert.equal(c.fileCount, 2)
  assert.equal(c.additions, 5)
  assert.equal(c.deletions, 3)
})

test('toDiffHunkVm parses line types and numbers', () => {
  const h = toDiffHunkVm({
    oldStart: 10,
    oldLines: 2,
    newStart: 12,
    newLines: 3,
    lines: [' context', '+added', '-removed', ' after'],
  })
  assert.equal(h.header, '@@ -10,2 +12,3 @@')
  assert.deepEqual(
    h.lines.map((l) => l.type),
    ['context', 'add', 'del', 'context'],
  )
  assert.equal(h.lines[0].oldLine, 10)
  assert.equal(h.lines[0].newLine, 12)
  assert.equal(h.lines[1].newLine, 13)
  assert.equal(h.lines[1].oldLine, null)
  assert.equal(h.lines[2].oldLine, 11)
})

test('toDiffFileVm marks binary', () => {
  const f = toDiffFileVm({
    path: 'img.png',
    oldPath: null,
    status: 'added',
    binary: true,
    additions: 0,
    deletions: 0,
    hunks: [],
  })
  assert.equal(f.binary, true)
})

test('toPullRequestVm maps states', () => {
  const open = toPullRequestVm({
    number: 1,
    title: 't',
    body: null,
    state: 'open',
    draft: false,
    author: null,
    base: 'main',
    head: 'feat',
    url: 'u',
    createdAt: null,
    updatedAt: null,
    stats: { files: 0, additions: 0, deletions: 0 },
    reviewDecision: null,
    mergeable: null,
    merged: false,
  })
  assert.equal(open.state, 'OPEN')
  const draft = toPullRequestVm({ ...open, state: 'open', draft: true })
  assert.equal(draft.state, 'DRAFT')
  const merged = toPullRequestVm({ ...open, state: 'open', merged: true })
  assert.equal(merged.state, 'MERGED')
  const closed = toPullRequestVm({ ...open, state: 'closed' })
  assert.equal(closed.state, 'CLOSED')
})

test('toCheckVm and checkIcon', () => {
  assert.equal(toCheckVm({ name: 't', status: 'completed', conclusion: 'success' }).state, 'success')
  assert.equal(checkIcon('success'), 'check')
  assert.equal(checkIcon('failure'), 'error')
  assert.equal(checkIcon('in_progress'), 'warning')
})

test('unresolvedComments filters resolved', () => {
  const c1 = toReviewCommentVm({
    id: '1', author: 'a', body: 'b', path: 'x.ts', line: 3, side: null,
    commit: null, createdAt: null, updatedAt: null, resolved: false, url: null,
  })
  const c2 = toReviewCommentVm({ ...c1, id: '2', resolved: true })
  const u = unresolvedComments([c1, c2])
  assert.equal(u.length, 1)
  assert.equal(u[0].id, '1')
  assert.equal(u[0].key, 'x.ts:3')
})

test('toIssueVm and toBranchVm passthrough', () => {
  assert.equal(toIssueVm({ number: 1, title: 't', body: null, state: 'open', author: null, labels: [], assignees: [], createdAt: null, updatedAt: null, url: null }).title, 't')
  assert.deepEqual(toBranchVm({ name: 'm', upstream: 'origin/m', ahead: 1, behind: 2 }), { name: 'm', upstream: 'origin/m', ahead: 1, behind: 2 })
})

test('fromWorkspaceResult builds summary view model', () => {
  const s = fromWorkspaceResult({
    repository: { name: 'repo', root: '/r', remote: 'x' },
    branch: { name: 'feat', upstream: 'origin/feat', ahead: 2, behind: 0 },
    workspace: { clean: false, modified: 1, staged: 0, deleted: 0, renamed: 0, untracked: 2 },
    pullRequest: {
      number: 42, title: 'PR', body: null, state: 'open', draft: false, author: null,
      base: 'main', head: 'feat', url: 'u', createdAt: null, updatedAt: null,
      stats: { files: 1, additions: 3, deletions: 1 }, reviewDecision: null, mergeable: null, merged: false,
    },
    ci: { status: 'success', checks: [{ name: 't', status: 'completed', conclusion: 'success' }] },
  })
  assert.equal(s.branch.name, 'feat')
  assert.equal(s.clean, false)
  assert.equal(s.pullRequest.number, 42)
  assert.equal(s.pullRequest.state, 'OPEN')
  assert.equal(s.ci.checks[0].state, 'success')
})

test('truncatePath keeps the file name', () => {
  const p = truncatePath('src/github/comments/review.ts', 20)
  assert.ok(p.includes('review.ts'))
  assert.ok(p.length <= 20 || p.startsWith('…/'))
})

test('toWorkspaceMeta carries files, commits, branches, stash and comparison', () => {
  const m = toWorkspaceMeta({
    repository: { name: 'repo', root: '/r', remote: null },
    branch: { name: 'b', upstream: null, ahead: 0, behind: 0 },
    workspace: { clean: false, modified: 1, staged: 1, deleted: 0, renamed: 0, untracked: 1 },
    files: [
      { path: 'a.ts', oldPath: null, status: 'modified', staged: false },
      { path: 's.ts', oldPath: null, status: 'added', staged: true },
    ],
    filesTruncated: false,
    commits: {
      ahead: 2,
      recent: [{ sha: 'x', shortSha: 'x1', message: 'm', author: 'a', date: 'd', files: { count: 1, additions: 2, deletions: 3 } }],
    },
    branches: [{ name: 'b', current: true, upstream: null, ahead: 0, behind: 0 }],
    stashCount: 1,
    comparison: { base: 'main', ahead: 2, behind: 0 },
    pullRequest: null,
    ci: null,
  })
  assert.equal(m.files.length, 2)
  assert.equal(m.files[1].staged, true)
  assert.equal(m.commits.length, 1)
  assert.equal(m.commits[0].additions, 2)
  assert.deepEqual(m.branches, [{ name: 'b', current: true, upstream: null, ahead: 0, behind: 0 }])
  assert.equal(m.stashCount, 1)
  assert.deepEqual(m.comparison, { base: 'main', ahead: 2, behind: 0 })
  assert.ok(typeof m.sampledAt === 'string' && !Number.isNaN(Date.parse(m.sampledAt)), 'stamps an ISO sampledAt')
})

test('toWorkspaceMeta omits optional sections when absent', () => {
  const m = toWorkspaceMeta({
    repository: { name: 'r', root: '/r', remote: null },
    branch: { name: 'main', upstream: null, ahead: 0, behind: 0 },
    workspace: { clean: true, modified: 0, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
    pullRequest: null,
    ci: null,
  })
  assert.equal(m.files, undefined)
  assert.equal(m.commits, undefined)
  assert.equal(m.branches, undefined)
  assert.equal(m.stashCount, undefined)
  assert.equal(m.comparison, undefined)
})

test('toWorkspaceMeta merges sampled diff hunks into matching files by path', () => {
  const m = toWorkspaceMeta({
    repository: { name: 'r', root: '/r', remote: null },
    branch: { name: 'b', upstream: null, ahead: 0, behind: 0 },
    workspace: { clean: false, modified: 2, staged: 0, deleted: 0, renamed: 0, untracked: 0 },
    files: [
      { path: 'a.ts', oldPath: null, status: 'modified', staged: false, additions: 1, deletions: 1 },
      { path: 'plain.ts', oldPath: null, status: 'untracked', staged: false },
    ],
    diffs: [
      {
        path: 'a.ts',
        oldPath: null,
        status: 'modified',
        staged: false,
        additions: 1,
        deletions: 1,
        hunks: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, lines: ['-x', '+y'] }],
      },
    ],
    pullRequest: null,
    ci: null,
  })
  const a = m.files.find((f) => f.path === 'a.ts')
  const plain = m.files.find((f) => f.path === 'plain.ts')
  assert.equal(a.hunks.length, 1)
  assert.deepEqual(a.hunks[0].lines, ['-x', '+y'])
  assert.equal(a.staged, false, 'merge preserves the status-list metadata')
  assert.equal(plain.hunks, undefined, 'files without sampled hunks stay untouched')
})

test('toDiffMeta carries bounded hunks and marks binary omission', () => {
  const d = toDiffMeta({
    files: [
      { path: 'a.ts', oldPath: null, status: 'modified', additions: 1, deletions: 1, hunks: [{ oldStart: 3, oldLines: 2, newStart: 3, newLines: 2, lines: ['-a', '+b'] }] },
      { path: 'img.png', oldPath: null, status: 'added', binary: true, additions: 0, deletions: 0, hunks: [] },
    ],
  })
  const a = d.files.find((f) => f.path === 'a.ts')
  const img = d.files.find((f) => f.path === 'img.png')
  assert.deepEqual(a.hunks[0].lines, ['-a', '+b'])
  assert.equal(img.binary, true)
  assert.equal(img.diffOmitted, 'binary')
})

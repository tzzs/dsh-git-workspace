import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gitShow } from '../lib/git/show.js'
import { gitCompare } from '../lib/git/compare.js'
import { gitBlame } from '../lib/git/blame.js'
import { gitBranches } from '../lib/git/branches.js'
import { gitRemotes } from '../lib/git/remotes.js'
import { gitWorktrees } from '../lib/git/worktrees.js'
import { gitStash } from '../lib/git/stash.js'
import { gitTags } from '../lib/git/tags.js'
import { gitCommits } from '../lib/git/commits.js'
import { gitDiff } from '../lib/git/diff.js'
import { gitFiles } from '../lib/git/files.js'

const run = promisify(execFile)
async function git(cwd, args) {
  return run('git', args, { cwd, encoding: 'utf8' })
}

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-hist-'))
  await git(cwd, ['init', '-q'])
  await git(cwd, ['config', 'user.email', 'test@example.com'])
  await git(cwd, ['config', 'user.name', 'Test'])
  await writeFile(join(cwd, 'file.txt'), 'one\ntwo\nthree\n')
  await git(cwd, ['add', 'file.txt'])
  await git(cwd, ['commit', '-qm', 'initial'])
  return cwd
}

test('git_show returns commit metadata and structured files', async () => {
  const cwd = await fixture()
  try {
    await writeFile(join(cwd, 'file.txt'), 'one\ntwo\nthree\nfour\n')
    await git(cwd, ['add', 'file.txt'])
    await git(cwd, ['commit', '-qm', 'second'])
    const r = await gitShow({ sha: 'HEAD' }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.commit.message, 'second')
    assert.equal(r.commit.shortSha.length, 7)
    const f = r.files.find((x) => x.path === 'file.txt')
    assert.equal(f.status, 'modified')
    assert.equal(f.additions, 1)
    assert.ok(r.diff)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_show supports short sha and HEAD~1', async () => {
  const cwd = await fixture()
  try {
    await writeFile(join(cwd, 'file.txt'), 'one\ntwo\nthree\nx\n')
    await git(cwd, ['add', 'file.txt'])
    await git(cwd, ['commit', '-qm', 'second'])
    const short = (await git(cwd, ['rev-parse', '--short', 'HEAD'])).stdout.trim()
    const r = await gitShow({ sha: short }, cwd)
    assert.equal(r.commit.message, 'second')
    const r2 = await gitShow({ sha: 'HEAD~1' }, cwd)
    assert.equal(r2.commit.message, 'initial')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_show returns REVISION_NOT_FOUND for bad revision', async () => {
  const cwd = await fixture()
  try {
    const r = await gitShow({ sha: 'HEAD~999' }, cwd)
    assert.equal(r.error.code, 'REVISION_NOT_FOUND')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_show rejects dangerous revisions', async () => {
  const cwd = await fixture()
  try {
    const r = await gitShow({ sha: '--output=/tmp/x' }, cwd)
    assert.equal(r.error.code, 'INVALID_GIT_ARGUMENT')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_compare reports ahead/behind and stats', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cmp-'))
  const bare = join(root, 'origin.git')
  const a = join(root, 'a')
  try {
    await git(root, ['init', '--bare', '-q', bare])
    await git(root, ['clone', '-q', bare, a])
    await git(a, ['config', 'user.email', 'a@example.com'])
    await git(a, ['config', 'user.name', 'A'])
    await writeFile(join(a, 'a.txt'), 'a\n')
    await git(a, ['add', 'a.txt'])
    await git(a, ['commit', '-qm', 'a'])
    await git(a, ['push', '-qu', 'origin', 'master'])
    await git(a, ['checkout', '-q', '-b', 'feature'])
    await writeFile(join(a, 'b.txt'), 'b\nb2\n')
    await git(a, ['add', 'b.txt'])
    await git(a, ['commit', '-qm', 'feature work'])
    const r = await gitCompare({ base: 'master', head: 'feature' }, a)
    assert.equal(r.ahead, 1)
    assert.equal(r.behind, 0)
    assert.equal(r.stats.files, 1)
    assert.equal(r.stats.additions, 2)
    const f = r.files.find((x) => x.path === 'b.txt')
    assert.equal(f.status, 'added')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('git_compare supports path filter', async () => {
  const cwd = await fixture()
  try {
    await git(cwd, ['checkout', '-q', '-b', 'feature'])
    await writeFile(join(cwd, 'file.txt'), 'one\ntwo\nthree\n+added\n')
    await writeFile(join(cwd, 'other.txt'), 'x\n')
    await git(cwd, ['add', '.'])
    await git(cwd, ['commit', '-qm', 'work'])
    const r = await gitCompare({ base: 'master', head: 'feature', path: 'file.txt' }, cwd)
    assert.equal(r.stats.files, 1)
    assert.equal(r.files[0].path, 'file.txt')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_blame returns line metadata with author and content', async () => {
  const cwd = await fixture()
  try {
    const r = await gitBlame({ path: 'file.txt', revision: 'HEAD' }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.lines.length, 3)
    assert.equal(r.lines[0].line, 1)
    assert.equal(r.lines[0].content, 'one')
    assert.equal(r.lines[0].shortCommit.length, 7)
    assert.equal(typeof r.lines[0].date, 'string')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_blame supports line range', async () => {
  const cwd = await fixture()
  try {
    const r = await gitBlame({ path: 'file.txt', startLine: 2, endLine: 2 }, cwd)
    assert.equal(r.lines.length, 1)
    assert.equal(r.lines[0].line, 2)
    assert.equal(r.lines[0].content, 'two')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_blame returns INVALID_PATH for missing file', async () => {
  const cwd = await fixture()
  try {
    const r = await gitBlame({ path: 'nope.txt' }, cwd)
    assert.equal(r.error.code, 'INVALID_PATH')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_blame requires a path', async () => {
  const cwd = await fixture()
  try {
    const r = await gitBlame({}, cwd)
    assert.equal(r.error.code, 'INVALID_GIT_ARGUMENT')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_branches lists local branches with current flag', async () => {
  const cwd = await fixture()
  try {
    await git(cwd, ['checkout', '-q', '-b', 'feature'])
    const r = await gitBranches(cwd)
    const names = r.branches.map((b) => b.name)
    assert.ok(names.includes('master'))
    assert.ok(names.includes('feature'))
    assert.equal(r.branches.find((b) => b.name === 'feature').current, true)
    assert.equal(typeof r.branches[0].ahead, 'number')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_remotes parses remote URLs and GitHub metadata', async () => {
  const cwd = await fixture()
  try {
    await git(cwd, ['remote', 'add', 'origin', 'git@github.com:foo/bar.git'])
    const r = await gitRemotes(cwd)
    assert.equal(r.remotes.length, 1)
    assert.equal(r.origin, 'git@github.com:foo/bar.git')
    assert.deepEqual(r.remotes[0].github, { host: 'github.com', owner: 'foo', name: 'bar' })
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_worktrees lists the primary worktree', async () => {
  const cwd = await fixture()
  try {
    const r = await gitWorktrees(cwd)
    assert.equal(r.worktrees.length, 1)
    assert.equal(r.worktrees[0].bare, false)
    assert.equal(r.worktrees[0].detached, false)
    assert.ok(r.worktrees[0].commit)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_stash lists stash entries read-only', async () => {
  const cwd = await fixture()
  try {
    await writeFile(join(cwd, 'file.txt'), 'one\ntwo\nthree\nwip\n')
    await git(cwd, ['add', 'file.txt'])
    await git(cwd, ['stash', 'push', '-m', 'WIP message'])
    const r = await gitStash(cwd)
    assert.equal(r.stashes.length, 1)
    assert.equal(r.stashes[0].index, 0)
    assert.match(r.stashes[0].message, /WIP/)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_tags lists tags with commit', async () => {
  const cwd = await fixture()
  try {
    await git(cwd, ['tag', '-a', 'v1.0', '-m', 'release'])
    const r = await gitTags(cwd)
    assert.equal(r.tags.length, 1)
    assert.equal(r.tags[0].name, 'v1.0')
    assert.ok(r.tags[0].commit)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_commits supports base..head range and files summary', async () => {
  const cwd = await fixture()
  try {
    await writeFile(join(cwd, 'file.txt'), 'one\ntwo\nthree\nmore\n')
    await git(cwd, ['add', 'file.txt'])
    await git(cwd, ['commit', '-qm', 'second'])
    const r = await gitCommits({ base: 'HEAD~1', head: 'HEAD' }, cwd)
    assert.equal(r.commits.length, 1)
    assert.equal(r.commits[0].message, 'second')
    assert.equal(r.commits[0].files.count, 1)
    assert.equal(r.commits[0].files.additions, 1)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_commits filters by author', async () => {
  const cwd = await fixture()
  try {
    await git(cwd, ['config', 'user.name', 'Other'])
    await writeFile(join(cwd, 'file.txt'), 'one\ntwo\nthree\na\n')
    await git(cwd, ['add', 'file.txt'])
    await git(cwd, ['commit', '-qm', 'by other'])
    const r = await gitCommits({ author: 'Test' }, cwd)
    assert.ok(r.commits.every((c) => c.author === 'Test'))
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_files committed scope uses committed status', async () => {
  const cwd = await fixture()
  try {
    const r = await gitFiles('committed', cwd)
    assert.equal(r.files[0].status, 'committed')
    assert.equal(r.files[0].staged, false)
    const all = await gitFiles('all', cwd)
    const tracked = all.files.find((x) => x.path === 'file.txt')
    assert.equal(tracked.status, 'committed')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_diff detects added, deleted, renamed, and binary files', async () => {
  const cwd = await fixture()
  try {
    await writeFile(join(cwd, 'old.txt'), 'old\n')
    await git(cwd, ['add', 'old.txt'])
    await git(cwd, ['commit', '-qm', 'add old'])
    await git(cwd, ['checkout', '-q', '-b', 'feature'])
    await writeFile(join(cwd, 'new.txt'), 'brand new\n')
    await writeFile(join(cwd, 'data.bin'), Buffer.from([0x00, 0x01, 0x02, 0xff]))
    await git(cwd, ['add', 'new.txt', 'data.bin'])
    await git(cwd, ['mv', 'file.txt', 'renamed.txt'])
    await git(cwd, ['rm', '-q', 'old.txt'])
    await git(cwd, ['commit', '-qm', 'work'])
    const r = await gitDiff({ base: 'master', head: 'feature' }, cwd)
    const added = r.files.find((x) => x.path === 'new.txt')
    assert.equal(added.status, 'added')
    const deleted = r.files.find((x) => x.path === 'old.txt')
    assert.equal(deleted.status, 'deleted')
    const renamed = r.files.find((x) => x.path === 'renamed.txt')
    assert.equal(renamed.status, 'renamed')
    assert.equal(renamed.oldPath, 'file.txt')
    const binary = r.files.find((x) => x.path === 'data.bin')
    assert.equal(binary.binary, true)
    assert.equal(binary.hunks.length, 0)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

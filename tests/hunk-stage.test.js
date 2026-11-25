import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gitStageHunk, gitUnstageHunk, gitDiscardHunk } from '../lib/git/hunk.js'
import { gitWorkspace } from '../lib/tools/git-workspace.js'

const run = promisify(execFile)
async function git(cwd, args) {
  return run('git', args, { cwd, encoding: 'utf8' })
}

const LINES = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-hunk-'))
  await git(cwd, ['init', '-q'])
  await git(cwd, ['config', 'user.email', 'test@example.com'])
  await git(cwd, ['config', 'user.name', 'Test'])
  await writeFile(join(cwd, 'file.txt'), LINES.join('\n') + '\n')
  await git(cwd, ['add', 'file.txt'])
  await git(cwd, ['commit', '-qm', 'initial'])
  const changed = [...LINES]
  changed[1] = 'line 2 changed'
  changed[18] = 'line 19 changed'
  await writeFile(join(cwd, 'file.txt'), changed.join('\n') + '\n')
  return cwd
}

async function hunks(cwd, staged = false) {
  const out = (await git(cwd, ['diff', ...(staged ? ['--cached'] : []), '--unified=3', '--', 'file.txt'])).stdout
  const list = []
  for (const line of out.split('\n')) {
    const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (m) list.push({ oldStart: +m[1], oldLines: +(m[2] ?? 1), newStart: +m[3], newLines: +(m[4] ?? 1) })
  }
  return list
}

test('staging one hunk leaves the other hunk in the working tree', async () => {
  const cwd = await fixture()
  try {
    const all = await hunks(cwd)
    assert.equal(all.length, 2, 'fixture has two hunks')
    const r = await gitStageHunk({ path: 'file.txt', side: 'unstaged', hunk: all[0] }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.action, 'stage')
    assert.deepEqual(await hunks(cwd, true), [all[0]], 'index holds only the first hunk')
    const rest = await hunks(cwd)
    assert.equal(rest.length, 1, 'worktree still has the second hunk')
    assert.ok(!(await git(cwd, ['diff', '--cached'])).stdout.includes('line 19 changed'))
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('unstaging one hunk keeps its working-tree change', async () => {
  const cwd = await fixture()
  try {
    const all = await hunks(cwd)
    await gitStageHunk({ path: 'file.txt', hunk: all[0] }, cwd)
    const staged = await gitStageHunk({ path: 'file.txt', hunk: all[1] }, cwd)
    assert.equal(staged.error, undefined)
    assert.equal((await hunks(cwd, true)).length, 2)
    const r = await gitUnstageHunk({ path: 'file.txt', side: 'staged', hunk: all[0] }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.action, 'unstage')
    assert.deepEqual(await hunks(cwd, true), [all[1]], 'only the second hunk stays staged')
    const worktree = await hunks(cwd)
    assert.equal(worktree.length, 1, 'the unstaged change is back in the working tree')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('discarding a hunk requires confirm and reverts only that hunk', async () => {
  const cwd = await fixture()
  try {
    const all = await hunks(cwd)
    const refused = await gitDiscardHunk({ path: 'file.txt', hunk: all[1] }, cwd)
    assert.equal(refused.error.code, 'DISCARD_REQUIRES_CONFIRM')
    const r = await gitDiscardHunk({ path: 'file.txt', hunk: all[1], confirm: true }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.action, 'discard')
    const rest = await hunks(cwd)
    assert.equal(rest.length, 1, 'one hunk remains')
    const text = await readFile(join(cwd, 'file.txt'), 'utf8')
    assert.ok(text.includes('line 2 changed'), 'untouched hunk still carries its change')
    assert.ok(!text.includes('line 19 changed'), 'discarded hunk reverted')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('a stale hunk target fails with HUNK_NOT_FOUND', async () => {
  const cwd = await fixture()
  try {
    const r = await gitStageHunk({
      path: 'file.txt',
      hunk: { oldStart: 999, oldLines: 1, newStart: 999, newLines: 1 },
    }, cwd)
    assert.equal(r.error.code, 'HUNK_NOT_FOUND')
    const missing = await gitStageHunk({ path: 'missing.txt', hunk: { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1 } }, cwd)
    assert.equal(missing.error.code, 'HUNK_NOT_FOUND')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('workspace sample exposes staged and unstaged entries for the same path', async () => {
  const cwd = await fixture()
  try {
    const all = await hunks(cwd)
    await gitStageHunk({ path: 'file.txt', hunk: all[0] }, cwd)
    const r = await gitWorkspace(cwd)
    assert.equal(r.error, undefined)
    const entries = r.files.filter((f) => f.path === 'file.txt')
    assert.equal(entries.length, 2, 'one entry per index/worktree side')
    const staged = entries.find((f) => f.staged === true)
    const unstaged = entries.find((f) => f.staged === false)
    assert.ok(staged && unstaged)
    assert.equal(staged.unstaged, false)
    assert.equal(unstaged.unstaged, true)
    assert.equal(staged.hunks.length, 1, 'staged side carries its own hunk')
    assert.equal(unstaged.hunks.length, 1, 'worktree side carries its own hunk')
    assert.ok(staged.hunks[0].lines.some((l) => l.includes('line 2 changed')))
    assert.ok(unstaged.hunks[0].lines.some((l) => l.includes('line 19 changed')))
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gitStage } from '../lib/git/stage.js'
import { gitUnstage } from '../lib/git/unstage.js'
import { gitCommit } from '../lib/git/commit.js'
import { gitBranchCreate } from '../lib/git/branch_create.js'
import { gitPush } from '../lib/git/push.js'
import { gitCheckout } from '../lib/git/checkout.js'
import { gitMerge } from '../lib/git/merge.js'
import { gitReset } from '../lib/git/reset.js'
import { gitStatus } from '../lib/git/status.js'

const run = promisify(execFile)
async function git(cwd, args) {
  return run('git', args, { cwd, encoding: 'utf8' })
}

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-gitwrite-'))
  await git(cwd, ['init', '-q'])
  await git(cwd, ['config', 'user.email', 'test@example.com'])
  await git(cwd, ['config', 'user.name', 'Test'])
  await writeFile(join(cwd, 'file.txt'), 'one\n')
  await git(cwd, ['add', 'file.txt'])
  await git(cwd, ['commit', '-qm', 'initial'])
  return cwd
}

async function currentBranch(cwd) {
  return (await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
}

test('stage then unstage round-trip updates the porcelain status', async () => {
  const cwd = await fixture()
  try {
    await writeFile(join(cwd, 'file.txt'), 'one\ntwo\n')
    await writeFile(join(cwd, 'new.txt'), 'new\n')
    let r = await gitStage({ paths: ['file.txt'] }, cwd)
    assert.equal(r.error, undefined)
    assert.deepEqual(r.staged, ['file.txt'])
    assert.equal(r.all, false)
    let st = await gitStatus(cwd)
    assert.equal(st.files.find((x) => x.path === 'file.txt').staged, true)
    st.files
      .filter((x) => x.path !== 'file.txt')
      .forEach((x) => assert.notEqual(x.staged, true))
    r = await gitUnstage({ paths: ['file.txt'] }, cwd)
    assert.equal(r.error, undefined)
    assert.deepEqual(r.unstaged, ['file.txt'])
    st = await gitStatus(cwd)
    assert.equal(st.files.find((x) => x.path === 'file.txt').staged, false)
    r = await gitStage({ all: true }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.all, true)
    st = await gitStatus(cwd)
    assert.equal(st.files.find((x) => x.path === 'new.txt').staged, true)
    r = await gitUnstage({ all: true }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.all, true)
    st = await gitStatus(cwd)
    assert.notEqual(st.files.find((x) => x.path === 'new.txt').staged, true)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_commit returns sha fields and rejects nothing-to-commit and bad messages', async () => {
  const cwd = await fixture()
  try {
    let r = await gitCommit({ message: '' }, cwd)
    assert.equal(r.error.code, 'INVALID_GIT_ARGUMENT')
    r = await gitCommit({ message: 'bad\0msg' }, cwd)
    assert.equal(r.error.code, 'INVALID_GIT_ARGUMENT')
    r = await gitCommit({ message: 'nothing staged' }, cwd)
    assert.equal(r.error.code, 'NOTHING_TO_COMMIT')
    await writeFile(join(cwd, 'file.txt'), 'one\ntwo\n')
    await gitStage({ paths: ['file.txt'] }, cwd)
    r = await gitCommit({ message: 'feat: change' }, cwd)
    assert.equal(r.error, undefined)
    assert.match(r.sha, /^[0-9a-f]{40}$/)
    assert.ok(r.shortSha.length >= 7 && r.shortSha.length < 40)
    assert.equal(r.branch, await currentBranch(cwd))
    assert.equal(r.message, 'feat: change')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_branch_create creates and checks out, and rejects duplicates and invalid names', async () => {
  const cwd = await fixture()
  try {
    const base = await currentBranch(cwd)
    let r = await gitBranchCreate({ name: 'feature/x' }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.name, 'feature/x')
    assert.equal(r.startPoint, null)
    assert.equal(r.checkedOut, true)
    assert.equal(await currentBranch(cwd), 'feature/x')

    r = await gitBranchCreate({ name: 'feature/x', checkout: false }, cwd)
    assert.equal(r.error.code, 'BRANCH_ALREADY_EXISTS')

    for (const bad of ['-evil', 'bad\0name', 'has space']) {
      const rejected = await gitBranchCreate({ name: bad }, cwd)
      assert.equal(rejected.error.code, 'INVALID_GIT_ARGUMENT', bad)
    }
    const refs = (await git(cwd, ['for-each-ref', 'refs/heads', '--format=%(refname:short)']))
      .stdout.trim()
      .split('\n')
      .sort()
    assert.deepEqual(refs, [base, 'feature/x'].sort())
    assert.equal(await currentBranch(cwd), 'feature/x')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_checkout switches back and forth, creates branches, and reports missing or dirty states', async () => {
  const cwd = await fixture()
  try {
    const base = await currentBranch(cwd)
    await git(cwd, ['checkout', '-qb', 'other'])
    await writeFile(join(cwd, 'file.txt'), 'other\n')
    await git(cwd, ['add', '.'])
    await git(cwd, ['commit', '-qm', 'other'])
    let r = await gitCheckout({ branch: base }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.branch, base)
    assert.equal(r.created, false)
    assert.equal(r.previous, 'other')
    assert.equal(await currentBranch(cwd), base)

    r = await gitCheckout({ branch: 'brand-new', create: true }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.branch, 'brand-new')
    assert.equal(r.created, true)
    assert.equal(await currentBranch(cwd), 'brand-new')

    r = await gitCheckout({ branch: 'missing-branch' }, cwd)
    assert.equal(r.error.code, 'BRANCH_NOT_FOUND')
    assert.equal(await currentBranch(cwd), 'brand-new')

    await gitCheckout({ branch: base }, cwd)
    await writeFile(join(cwd, 'file.txt'), 'dirty\n')
    r = await gitCheckout({ branch: 'other' }, cwd)
    assert.equal(r.error.code, 'DIRTY_WORKTREE')
    assert.equal(await currentBranch(cwd), base)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_merge fast-forwards cleanly', async () => {
  const cwd = await fixture()
  try {
    const base = await currentBranch(cwd)
    await git(cwd, ['checkout', '-qb', 'feature'])
    await writeFile(join(cwd, 'f.txt'), 'f\n')
    await git(cwd, ['add', 'f.txt'])
    await git(cwd, ['commit', '-qm', 'feature'])
    await git(cwd, ['checkout', '-q', base])
    const r = await gitMerge({ branch: 'feature' }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.merged, true)
    assert.equal(r.branch, 'feature')
    assert.equal(r.squash, false)
    assert.deepEqual(r.conflictedFiles, [])
    assert.ok(r.sha)
    assert.match(await readFile(join(cwd, 'f.txt'), 'utf8'), /^f\n$/)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_merge reports conflicting files instead of failing', async () => {
  const cwd = await fixture()
  try {
    const base = await currentBranch(cwd)
    await git(cwd, ['checkout', '-qb', 'a'])
    await writeFile(join(cwd, 'file.txt'), 'from-a\n')
    await git(cwd, ['add', '.'])
    await git(cwd, ['commit', '-qm', 'a'])
    await git(cwd, ['checkout', '-q', base])
    await git(cwd, ['checkout', '-qb', 'b'])
    await writeFile(join(cwd, 'file.txt'), 'from-b\n')
    await git(cwd, ['add', '.'])
    await git(cwd, ['commit', '-qm', 'b'])
    const r = await gitMerge({ branch: 'a' }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.merged, false)
    assert.equal(r.branch, 'a')
    assert.deepEqual(r.conflictedFiles, ['file.txt'])
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_reset modes move HEAD with soft, mixed, and confirmed-hard semantics', async () => {
  const cwd = await fixture()
  try {
    const baseSha = (await git(cwd, ['rev-parse', 'HEAD'])).stdout.trim()
    await writeFile(join(cwd, 'b.txt'), 'b\n')
    await git(cwd, ['add', 'b.txt'])
    await git(cwd, ['commit', '-qm', 'second'])

    let r = await gitReset({ mode: 'soft', ref: 'HEAD~1' }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.mode, 'soft')
    assert.equal(r.ref, 'HEAD~1')
    assert.equal((await git(cwd, ['rev-parse', 'HEAD'])).stdout.trim(), baseSha)
    let st = await gitStatus(cwd)
    assert.equal(st.files.find((x) => x.path === 'b.txt').staged, true)

    await git(cwd, ['commit', '-qm', 'second again'])
    const secondSha = (await git(cwd, ['rev-parse', 'HEAD'])).stdout.trim()

    r = await gitReset({ ref: 'HEAD~1' }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.mode, 'mixed')
    assert.equal((await git(cwd, ['rev-parse', 'HEAD'])).stdout.trim(), baseSha)
    assert.equal(await readFile(join(cwd, 'b.txt'), 'utf8'), 'b\n')
    st = await gitStatus(cwd)
    assert.ok(st.files.length >= 1)
    assert.notEqual(st.files.find((x) => x.path === 'b.txt').staged, true)

    await git(cwd, ['reset', '-q', '--hard', secondSha])

    r = await gitReset({ mode: 'hard', ref: 'HEAD~1' }, cwd)
    assert.equal(r.error.code, 'HARD_RESET_REQUIRES_CONFIRM')
    assert.equal(
      (await git(cwd, ['rev-parse', 'HEAD'])).stdout.trim(),
      secondSha,
      'hard reset must not run without confirm',
    )

    await writeFile(join(cwd, 'file.txt'), 'changed\n')
    r = await gitReset({ mode: 'hard', ref: 'HEAD', confirm: true }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.mode, 'hard')
    assert.equal(r.ref, 'HEAD')
    assert.equal(await readFile(join(cwd, 'file.txt'), 'utf8'), 'one\n')
    await access(join(cwd, 'b.txt'))
    assert.equal((await git(cwd, ['rev-parse', 'HEAD'])).stdout.trim(), secondSha)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('git_push publishes to a bare origin, rejects divergence, and forces when asked', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-gitpush-'))
  const bare = join(root, 'origin.git')
  const work = join(root, 'work')
  try {
    await git(root, ['init', '--bare', '-q', bare])
    await run('git', ['clone', '-q', bare, work], { encoding: 'utf8' })
    await git(work, ['config', 'user.email', 'test@example.com'])
    await git(work, ['config', 'user.name', 'Test'])
    await writeFile(join(work, 'a.txt'), 'a\n')
    await git(work, ['add', 'a.txt'])
    await git(work, ['commit', '-qm', 'one'])
    const branch = await currentBranch(work)

    let r = await gitPush({}, work)
    assert.equal(r.error, undefined)
    assert.equal(r.remote, 'origin')
    assert.equal(r.branch, branch)
    assert.equal(r.upstream, `origin/${branch}`)
    assert.equal(r.forced, false)

    await git(work, ['commit', '-q', '--amend', '-m', 'one amended'])
    r = await gitPush({}, work)
    assert.equal(r.error.code, 'GIT_PUSH_REJECTED')

    r = await gitPush({ force: true }, work)
    assert.equal(r.error, undefined)
    assert.equal(r.forced, true)
    assert.equal(r.upstream, `origin/${branch}`)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('git_push without a configured remote returns a structured error instead of throwing', async () => {
  const cwd = await fixture()
  try {
    const r = await gitPush({}, cwd)
    assert.ok(r.error)
    assert.equal(r.error.code, 'GIT_PUSH_FAILED')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

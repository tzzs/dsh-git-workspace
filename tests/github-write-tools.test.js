import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, mkdir, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { githubPrMerge } from '../lib/github/pr_merge.js'
import { githubPrComment } from '../lib/github/pr_comment.js'
import { githubPrReview } from '../lib/github/pr_review.js'

const run = promisify(execFile)
async function git(cwd, args) {
  return run('git', args, { cwd, encoding: 'utf8' })
}

async function setupFixture(ghBody) {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-ghwrite-'))
  const bin = await mkdtemp(join(tmpdir(), 'dsh-ghwrite-bin-'))
  const gh = join(bin, 'gh')
  const log = join(bin, 'invocations.log')
  await git(cwd, ['init', '-q'])
  await git(cwd, ['config', 'user.email', 't@example.com'])
  await git(cwd, ['config', 'user.name', 'Test'])
  await writeFile(join(cwd, 'a.txt'), 'a\n')
  await git(cwd, ['add', 'a.txt'])
  await git(cwd, ['commit', '-qm', 'init'])
  await git(cwd, ['remote', 'add', 'origin', 'https://github.com/owner/repo.git'])
  await writeFile(gh, ghBody)
  await chmod(gh, 0o755)
  const old = process.env.PATH
  const oldLog = process.env.GH_LOG
  const restore = () => {
    process.env.PATH = old
    if (oldLog === undefined) delete process.env.GH_LOG
    else process.env.GH_LOG = oldLog
  }
  process.env.PATH = `${bin}:${old}`
  process.env.GH_LOG = log
  return {
    cwd,
    bin,
    log,
    restore,
    cleanup: async () => {
      restore()
      await rm(cwd, { recursive: true, force: true })
      await rm(bin, { recursive: true, force: true })
    },
  }
}

async function loggedLines(log) {
  try {
    const text = await readFile(log, 'utf8')
    return text.trim() ? text.trim().split('\n') : []
  } catch {
    return []
  }
}

const LOG_PREFIX = `#!/bin/sh
[ -n "\${GH_LOG:-}" ] && printf '%s\\n' "$*" >> "$GH_LOG"
`

const MERGE_DISPATCH = `${LOG_PREFIX}
if [ "$1" = "pr" ] && [ "$2" = "merge" ]; then
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  printf '%s' '{"url":"https://github.com/owner/repo/pull/7","merged":true}'
  exit 0
fi
exit 1
`

const MERGE_NOT_MERGEABLE_DISPATCH = `${LOG_PREFIX}
if [ "$1" = "pr" ] && [ "$2" = "merge" ]; then
  echo "Pull request is not mergeable" >&2
  exit 1
fi
exit 1
`

const COMMENT_DISPATCH = `${LOG_PREFIX}
if [ "$1" = "pr" ] && [ "$2" = "comment" ]; then
  echo "https://github.com/owner/repo/pull/7#issuecomment-1"
  exit 0
fi
exit 1
`

const REVIEW_DISPATCH = `${LOG_PREFIX}
if [ "$1" = "pr" ] && [ "$2" = "review" ]; then
  exit 0
fi
exit 1
`

test('github_pr_merge wires method and delete-branch flags and reports merged state', async () => {
  const fx = await setupFixture(MERGE_DISPATCH)
  try {
    const r = await githubPrMerge(
      { number: 7, method: 'squash', deleteBranch: true, subject: 's', body: 'b' },
      fx.cwd,
    )
    assert.equal(r.error, undefined)
    assert.equal(r.number, 7)
    assert.equal(r.merged, true)
    assert.equal(r.method, 'squash')
    assert.equal(r.branchDeleted, true)
    assert.equal(r.url, 'https://github.com/owner/repo/pull/7')
    const lines = await loggedLines(fx.log)
    assert.deepEqual(lines, [
      'pr merge --repo owner/repo 7 --squash --delete-branch --subject s --body b',
      'pr view --repo owner/repo 7 --json url,merged',
    ])
  } finally {
    await fx.cleanup()
  }
})

test('github_pr_merge defaults to the merge method without optional flags', async () => {
  const fx = await setupFixture(MERGE_DISPATCH)
  try {
    const r = await githubPrMerge({ number: 7 }, fx.cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.merged, true)
    assert.equal(r.method, 'merge')
    assert.equal(r.branchDeleted, false)
    const lines = await loggedLines(fx.log)
    assert.match(lines[0], /^pr merge --repo owner\/repo 7 --merge$/)
  } finally {
    await fx.cleanup()
  }
})

test('github_pr_merge maps a non-mergeable PR to GITHUB_PR_NOT_MERGEABLE', async () => {
  const fx = await setupFixture(MERGE_NOT_MERGEABLE_DISPATCH)
  try {
    const r = await githubPrMerge({ number: 7 }, fx.cwd)
    assert.equal(r.error.code, 'GITHUB_PR_NOT_MERGEABLE')
    assert.ok(r.error.hint)
    const lines = await loggedLines(fx.log)
    assert.equal(lines.length, 1)
    assert.match(lines[0], /^pr merge /)
  } finally {
    await fx.cleanup()
  }
})

test('github_pr_comment posts the body and echoes the resulting URL', async () => {
  const fx = await setupFixture(COMMENT_DISPATCH)
  try {
    const r = await githubPrComment({ number: 7, body: '  hello world  ' }, fx.cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.number, 7)
    assert.equal(r.url, 'https://github.com/owner/repo/pull/7#issuecomment-1')
    assert.equal(r.body, 'hello world')
    const lines = await loggedLines(fx.log)
    assert.deepEqual(lines, ['pr comment --repo owner/repo 7 --body hello world'])
  } finally {
    await fx.cleanup()
  }
})

test('github_pr_comment rejects missing or empty bodies before invoking gh', async () => {
  const fx = await setupFixture(COMMENT_DISPATCH)
  try {
    let r = await githubPrComment({ number: 7 }, fx.cwd)
    assert.equal(r.error.code, 'INVALID_GIT_ARGUMENT')
    r = await githubPrComment({ number: 7, body: '   ' }, fx.cwd)
    assert.equal(r.error.code, 'INVALID_GIT_ARGUMENT')
    assert.deepEqual(await loggedLines(fx.log), [])
  } finally {
    await fx.cleanup()
  }
})

test('github_pr_review refuses REQUEST_CHANGES without a body before invoking gh', async () => {
  const fx = await setupFixture(REVIEW_DISPATCH)
  try {
    const r = await githubPrReview({ number: 7, state: 'REQUEST_CHANGES' }, fx.cwd)
    assert.equal(r.error.code, 'INVALID_GIT_ARGUMENT')
    assert.deepEqual(await loggedLines(fx.log), [])
  } finally {
    await fx.cleanup()
  }
})

test('github_pr_review dispatches approve, request-changes, and comment flags', async () => {
  const fx = await setupFixture(REVIEW_DISPATCH)
  try {
    let r = await githubPrReview({ number: 7, state: 'APPROVE' }, fx.cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.number, 7)
    assert.equal(r.state, 'APPROVE')
    assert.equal(r.url, null)

    r = await githubPrReview(
      { number: 7, state: 'REQUEST_CHANGES', body: 'needs work' },
      fx.cwd,
    )
    assert.equal(r.error, undefined)
    assert.equal(r.state, 'REQUEST_CHANGES')

    r = await githubPrReview({ number: 7, body: 'noted' }, fx.cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.state, 'COMMENT')

    const lines = await loggedLines(fx.log)
    assert.deepEqual(lines, [
      'pr review --repo owner/repo 7 --approve',
      'pr review --repo owner/repo 7 --request-changes --body needs work',
      'pr review --repo owner/repo 7 --comment --body noted',
    ])
  } finally {
    await fx.cleanup()
  }
})

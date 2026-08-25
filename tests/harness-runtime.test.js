import test from 'node:test'
import assert from 'node:assert/strict'
import {Context} from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import {CallId} from '@deepseek-ai/dsh-llm'
import {mkdtemp, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import * as plugin from '../lib/index.js'

const READ_NAMES = [
  'git_workspace',
  'git_status',
  'git_files',
  'git_diff',
  'git_commits',
  'git_show',
  'git_compare',
  'git_blame',
  'git_branches',
  'git_remotes',
  'git_worktrees',
  'git_stash',
  'git_tags',
  'github_pr',
  'github_pr_create',
  'github_pr_diff',
  'github_pr_reviews',
  'github_pr_comments',
  'github_ci',
  'github_ci_logs',
  'github_issue',
  'github_issue_comments',
  'github_releases',
]

const WRITE_NAMES = [
  'git_stage',
  'git_unstage',
  'git_commit',
  'git_branch_create',
  'git_push',
  'git_checkout',
  'git_merge',
  'git_reset',
  'github_pr_merge',
  'github_pr_comment',
  'github_pr_review',
]

function argsFor(name) {
  switch (name) {
    case 'git_files':
      return { scope: 'all' }
    case 'git_commits':
      return { limit: 1 }
    case 'git_show':
      return { sha: 'HEAD', includeDiff: false, includeFiles: true }
    case 'git_compare':
      return { base: 'HEAD', head: 'HEAD' }
    case 'git_blame':
      return { path: 'src/index.ts', limit: 5 }
    case 'git_diff':
      return { limit: 5 }
    case 'github_pr_diff':
    case 'github_pr_reviews':
    case 'github_pr_comments':
    case 'github_issue':
    case 'github_issue_comments':
    case 'github_ci':
      return { number: 1 }
    case 'github_ci_logs':
      return { runId: 1 }
    default:
      return {}
  }
}

async function setup() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(plugin)
  return ctx
}
async function call(ctx, name, args = {}, tag = '') {
  return ctx.tools.execute({
    callId: CallId(`integration-${name}${tag}`),
    name,
    arguments: args,
    signal: new AbortController().signal,
  })
}

test('real Harness ToolRuntime discovers and executes all read tools', async () => {
  const ctx = await setup()
  const schemas = ctx.tools.schemas()
  assert.deepEqual(
    READ_NAMES.map((name) => schemas.find((x) => x.name === name)?.name),
    READ_NAMES,
  )
  for (const name of READ_NAMES) {
    const result = await call(ctx, name, argsFor(name))
    assert.equal(result.isError, false, `${name}: ${JSON.stringify(result)}`)
    assert.ok(result.value !== undefined, name)
  }
})

test('write tools are discovered with blast-radius descriptions and never executed here', async () => {
  const ctx = await setup()
  const schemas = ctx.tools.schemas()
  assert.deepEqual(
    WRITE_NAMES.map((name) => schemas.find((x) => x.name === name)?.name),
    WRITE_NAMES,
  )
  for (const name of WRITE_NAMES) {
    const schema = schemas.find((x) => x.name === name)
    assert.ok(schema, `${name} must be registered`)
    assert.match(
      schema.description,
      /^Write tool\./,
      `${name} description must start with "Write tool."`,
    )
  }
})

test('write tools run end-to-end through the runtime inside a throwaway repo', async (t) => {
  const run = promisify(execFile)
  const git = (args) => run('git', args, { cwd: tmpRepo, encoding: 'utf8' })
  const originalCwd = process.cwd()
  const tmpRepo = await mkdtemp(join(tmpdir(), 'dsh-write-e2e-'))
  t.after(() => {
    process.chdir(originalCwd)
    return rm(tmpRepo, { recursive: true, force: true })
  })
  await git(['init', '-q'])
  await git(['config', 'user.email', 'test@example.com'])
  await git(['config', 'user.name', 'Test'])
  await writeFile(join(tmpRepo, 'README.md'), '# fixture\n')
  await git(['add', 'README.md'])
  await git(['commit', '-qm', 'initial'])
  await git(['remote', 'add', 'origin', 'https://github.com/owner/repo.git'])
  const defaultBranch = (
    await run('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: tmpRepo, encoding: 'utf8' })
  ).stdout.trim()
  assert.ok(defaultBranch === 'main' || defaultBranch === 'master')
  await writeFile(join(tmpRepo, 'a.txt'), 'a\n')

  process.chdir(tmpRepo)
  const ctx = await setup()

  let r = await call(ctx, 'git_stage', { all: true }, ':stage-all')
  assert.equal(r.isError, false, JSON.stringify(r))
  assert.equal(r.value.all, true)
  assert.equal(r.value.error, undefined)

  r = await call(ctx, 'git_unstage', { all: true }, ':unstage-all')
  assert.equal(r.isError, false, JSON.stringify(r))
  assert.equal(r.value.all, true)

  r = await call(ctx, 'git_stage', { paths: ['a.txt'] }, ':stage-a')
  assert.equal(r.isError, false, JSON.stringify(r))
  assert.deepEqual(r.value.staged, ['a.txt'])

  r = await call(ctx, 'git_commit', { message: 'test commit' }, ':commit')
  assert.equal(r.isError, false, JSON.stringify(r))
  assert.match(r.value.sha, /^[0-9a-f]{40}$/)
  assert.ok(r.value.shortSha.length >= 7)
  assert.equal(r.value.branch, defaultBranch)
  assert.equal(r.value.message, 'test commit')
  const headAfterCommit = r.value.sha

  r = await call(ctx, 'git_branch_create', { name: 'feature/x', checkout: true }, ':branch')
  assert.equal(r.isError, false, JSON.stringify(r))
  assert.equal(r.value.name, 'feature/x')
  assert.equal(r.value.checkedOut, true)

  r = await call(ctx, 'git_checkout', { branch: defaultBranch }, ':checkout')
  assert.equal(r.isError, false, JSON.stringify(r))
  assert.equal(r.value.branch, defaultBranch)
  assert.equal(r.value.created, false)
  assert.equal(r.value.previous, 'feature/x')

  r = await call(ctx, 'git_merge', { branch: 'feature/x' }, ':merge')
  assert.equal(r.isError, false, JSON.stringify(r))
  assert.equal(r.value.merged, true)
  assert.deepEqual(r.value.conflictedFiles, [])
  assert.ok(r.value.sha)

  r = await call(ctx, 'git_reset', { ref: 'HEAD~1' }, ':reset-mixed')
  assert.equal(r.isError, false, JSON.stringify(r))
  assert.equal(r.value.mode, 'mixed')
  assert.equal(r.value.ref, 'HEAD~1')
  assert.ok(r.value.shortSha.length >= 7)
  const headAfterMixedReset = (
    await run('git', ['rev-parse', 'HEAD'], { cwd: tmpRepo, encoding: 'utf8' })
  ).stdout.trim()
  assert.notEqual(headAfterMixedReset, headAfterCommit)

  r = await call(ctx, 'git_reset', { mode: 'hard', ref: 'HEAD' }, ':reset-hard-noconfirm')
  assert.equal(r.value.error?.code, 'HARD_RESET_REQUIRES_CONFIRM')
  assert.equal(r.value.mode, undefined)
  const headUnmoved = (
    await run('git', ['rev-parse', 'HEAD'], { cwd: tmpRepo, encoding: 'utf8' })
  ).stdout.trim()
  assert.equal(headUnmoved, headAfterMixedReset)

  r = await call(ctx, 'git_reset', { mode: 'hard', ref: 'HEAD', confirm: true }, ':reset-hard')
  assert.equal(r.isError, false, JSON.stringify(r))
  assert.equal(r.value.mode, 'hard')
  assert.equal(r.value.ref, 'HEAD')
})

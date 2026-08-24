import test from 'node:test'
import assert from 'node:assert/strict'
import {Context} from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import {CallId} from '@deepseek-ai/dsh-llm'
import * as plugin from '../lib/index.js'

const names = [
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
async function call(ctx, name, args = {}) {
  return ctx.tools.execute({
    callId: CallId(`integration-${name}`),
    name,
    arguments: args,
    signal: new AbortController().signal,
  })
}

test('real Harness ToolRuntime discovers and executes all Git/GitHub tools', async () => {
  const ctx = await setup()
  const schemas = ctx.tools.schemas()
  assert.deepEqual(
    names.map((name) => schemas.find((x) => x.name === name)?.name),
    names,
  )
  for (const name of names) {
    const result = await call(ctx, name, argsFor(name))
    assert.equal(result.isError, false, `${name}: ${JSON.stringify(result)}`)
    assert.ok(result.value !== undefined, name)
  }
})

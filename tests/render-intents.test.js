import test from 'node:test'
import assert from 'node:assert/strict'
import {Context} from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
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
  'github_pr_diff',
  'github_pr_reviews',
  'github_pr_comments',
  'github_ci',
  'github_ci_logs',
  'github_issue',
  'github_issue_comments',
  'github_releases',
]

const cards = ['generic', 'terminal', 'diff', 'search', 'read', 'web']

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

function sampleFor(name) {
  switch (name) {
    case 'git_status':
      return { branch: { name: 'main', ahead: 1, behind: 0 }, files: [{ path: 'a.ts', status: 'modified' }] }
    case 'git_diff':
      return { files: [{ path: 'a.ts', status: 'M', additions: 2, deletions: 1 }], raw: '' }
    case 'git_commits':
      return { commits: [{ shortSha: 'abc', message: 'hi' }] }
    case 'git_show':
      return { commit: { shortSha: 'abc', message: 'hi', author: 'a', date: 'd' }, files: [] }
    case 'git_compare':
      return { base: 'main', head: 'feat', ahead: 1, behind: 0, stats: { files: 1, additions: 1, deletions: 1 } }
    case 'github_pr':
      return { pullRequests: [{ number: 1, title: 't', state: 'open', draft: false }] }
    case 'github_ci':
      return { status: 'success', checks: [] }
    case 'github_issue':
      return { issue: { number: 1, title: 't', state: 'open' } }
    case 'git_workspace':
      return { branch: { name: 'main' }, workspace: { clean: true }, changes: { modified: 0, untracked: 0 } }
    case 'git_files':
      return { files: [{ path: 'a.ts', status: 'M' }] }
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

test('all tools expose presentCall, presentResult, and render intents', async () => {
  const ctx = await setup()
  for (const name of names) {
    const def = ctx.tools.get(name)
    assert.ok(def, name)

    assert.equal(typeof def.presentCall, 'function', name)
    const callView = def.presentCall(argsFor(name))
    assert.ok(callView && typeof callView === 'object', name)
    assert.ok(callView.card, name)
    assert.ok(cards.includes(callView.card), `${name}: ${callView.card}`)

    assert.equal(typeof def.presentResult, 'function', name)
    const resultView = def.presentResult(argsFor(name), {
      content: [{ type: 'text', text: 'sample result' }],
      isError: false,
    })
    assert.ok(resultView && typeof resultView === 'object', name)
    assert.ok(resultView.card, name)
    assert.ok(cards.includes(resultView.card), `${name}: ${resultView.card}`)
    assert.equal(typeof resultView.title, 'string', name)

    assert.ok(def.output && typeof def.output.render === 'function', name)
    const blocks = def.output.render({}, sampleFor(name))
    assert.ok(Array.isArray(blocks), name)
    for (const block of blocks) {
      assert.equal(block.type, 'text', name)
      assert.equal(typeof block.text, 'string', name)
    }
  }
})

test('presentResult handles isError for a representative tool', async () => {
  const ctx = await setup()
  const def = ctx.tools.get('git_status')
  const view = def.presentResult({}, {
    content: [{ type: 'text', text: 'boom' }],
    isError: true,
  })
  assert.ok(view && typeof view === 'object')
  assert.ok(cards.includes(view.card), view.card)
  assert.equal(typeof view.title, 'string')
})

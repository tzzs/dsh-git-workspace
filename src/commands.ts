import type {Context} from '@deepseek-ai/cordis'
import type {Session} from '@deepseek-ai/dsh-session'
import type {ToolError} from './types.js'
import type {StageOptions} from './git/stage.js'
import type {UnstageOptions} from './git/unstage.js'
import type {CommitOptions} from './git/commit.js'
import type {PushOptions} from './git/push.js'
import type {BranchCreateOptions} from './git/branch_create.js'
import type {CheckoutOptions} from './git/checkout.js'
import type {MergeOptions} from './git/merge.js'
import type {ResetOptions} from './git/reset.js'
import type {PrCreateOptions} from './github/pr_create.js'
import type {PrMergeOptions} from './github/pr_merge.js'
import type {PrCommentOptions} from './github/pr_comment.js'
import type {PrReviewOptions} from './github/pr_review.js'
import type {Scope as FilesScope} from './git/files.js'
import type {DiffOptions} from './git/diff.js'
import type {CommitsOptions} from './git/commits.js'
import type {ShowOptions} from './git/show.js'
import type {CompareOptions} from './git/compare.js'
import type {BlameOptions} from './git/blame.js'
import type {PrDiffOptions} from './github/pr_diff.js'
import type {CiOptions} from './github/ci.js'
import type {CiLogsOptions} from './github/ci_logs.js'
import {
  gitStatus,
  gitFiles,
  gitDiff,
  gitCommits,
  gitShow,
  gitCompare,
  gitBlame,
  gitBranches,
  gitRemotes,
  gitWorktrees,
  gitStash,
  gitTags,
  gitStage,
  gitUnstage,
  gitCommit,
  gitPush,
  gitBranchCreate,
  gitCheckout,
  gitMerge,
  gitReset,
  githubPr,
  githubPrCreate,
  githubPrDiff,
  githubPrReviews,
  githubPrComments,
  githubCi,
  githubCiLogs,
  githubIssue,
  githubIssueComments,
  githubReleases,
  githubPrMerge,
  githubPrComment,
  githubPrReview,
  gitWorkspace,
} from './tools/index.js'
import {
  gitFetch,
  gitPull,
  gitFastForward,
  gitSync,
  gitRebase,
} from './git/syncops.js'
import {forceSample} from './projection.js'
import {
  formatStatus,
  formatFiles,
  formatDiff,
  formatCommits,
  formatShow,
  formatCompare,
  formatBlame,
  formatBranches,
  formatRemotes,
  formatWorktrees,
  formatStash,
  formatTags,
  formatWorkspace,
  formatPr,
  formatPrDiff,
  formatPrReviews,
  formatPrComments,
  formatCi,
  formatCiLogs,
  formatIssue,
  formatIssueComments,
  formatReleases,
} from './command_text.js'

type CommandDefinitionLike = {
  name: string
  description: string
  input?: {hint: string}
  recordInput?: boolean
  handler: (invocation: CommandInvocationLike) => unknown
}

type CommandInvocationLike = {
  commandId: string
  agent: {session: Session}
  rawInput: string
  signal: AbortSignal
}

type CommandsHost = {
  commands?: {
    register(definition: CommandDefinitionLike): unknown
  }
}


const jsonHint = 'A JSON object after the command name, for example {}.'

function cwd(session: Session | undefined): string | undefined {
  return session?.header?.cwd
}

function parseJson(raw: string): Record<string, unknown> | {invalid: true} {
  const text = raw.trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {invalid: true}
    }
    return parsed as Record<string, unknown>
  } catch {
    return {invalid: true}
  }
}

function message(result: unknown): string {
  const e = result as {error?: {code?: string; message?: string; hint?: string}}
  if (!e.error) return 'unknown command failure'
  return [e.error.code, e.error.message, e.error.hint ? `Hint: ${e.error.hint}` : '']
    .filter(Boolean)
    .join(': ')
}

function success(text: string) {
  return {kind: 'success' as const, text}
}

function failed(result: unknown) {
  return {kind: 'error' as const, text: message(result)}
}

function resultText(value: object): string {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined && v !== null)
  if (entries.length === 0) return 'done'
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join(', ')
}

export async function installGitCommands(ctx: Pick<Context, 'inject'>): Promise<void> {
  await ctx.inject(['commands'], (async (rawHost: Context) => {
    const host = rawHost as unknown as CommandsHost
    const commands = host.commands
    if (!commands || typeof commands.register !== 'function') return

    const define = (
      name: string,
      description: string,
      handler: (
        args: Record<string, unknown>,
        invocation: CommandInvocationLike,
      ) => Promise<unknown> | unknown,
    ) => {
      commands.register({
        name,
        description,
        input: {hint: jsonHint},
        handler: (invocation) => {
          const parsed = parseJson(invocation.rawInput)
          if ('invalid' in parsed) return failed({error: {code: 'INVALID_JSON', message: 'Arguments must be a JSON object.'}})
          return handler(parsed, invocation)
        },
      })
    }

    const toolCommand = <T>(
      fn: (input: T, cwd: string) => Promise<unknown>,
      name: string,
      description: string,
      format?: (value: object) => string,
    ) => {
      define(name, description, async (args, invocation) => {
        const dir = cwd(invocation.agent.session)
        if (!dir) {
          return failed({
            error: {code: 'WORKSPACE_UNAVAILABLE', message: 'This session has no workspace directory.'},
          })
        }
        const result = await fn(args as T, dir)
        if (
          typeof result === 'object' && result !== null && 'error' in result
        ) return failed(result)
        return success(format ? format(result as object) : resultText(result as object))
      })
    }

    define('git-refresh', 'Read-only command. Force-refresh the Git Workspace projection without changing files.', async (_args, invocation) => {
      const dir = cwd(invocation.agent.session)
      if (!dir) return failed({error: {code: 'WORKSPACE_UNAVAILABLE', message: 'This session has no workspace directory.'}})
      await forceSample(invocation.agent.session)
      return success(`refreshed: ${dir}`)
    })

    toolCommand<Record<string, never>>((_input, dir) => gitWorkspace(dir), 'git-workspace', 'Read-only command. Summarize the current Git workspace context (branch, changes, commits, PR, CI).', formatWorkspace)
    toolCommand<Record<string, never>>((_input, dir) => gitStatus(dir), 'git-status', 'Read-only command. Show porcelain branch and file status.', formatStatus)
    toolCommand<{scope?: FilesScope}>((input, dir) => gitFiles(input.scope ?? 'working-tree', dir), 'git-files', 'Read-only command. List Git files by scope (working-tree, staged, committed, all).', formatFiles)
    toolCommand<DiffOptions>(gitDiff, 'git-diff', 'Read-only command. Show the diff for a path (or all changes) with bounded hunks.', formatDiff)
    toolCommand<CommitsOptions>(gitCommits, 'git-commits', "Read-only command. List recent commits, optionally filtered by path/author/range.", formatCommits)
    toolCommand<ShowOptions>(gitShow, 'git-show', "Read-only command. Show a single commit's metadata, changed files, and diff.", formatShow)
    toolCommand<CompareOptions>(gitCompare, 'git-compare', 'Read-only command. Compare two refs: ahead/behind counts and diff stats.', formatCompare)
    toolCommand<BlameOptions>(gitBlame, 'git-blame', 'Read-only command. Show line-by-line blame for a file.', formatBlame)
    toolCommand<Record<string, never>>((_input, dir) => gitBranches(dir), 'git-branches', 'Read-only command. List local branches with upstream tracking and ahead/behind counts.', formatBranches)
    toolCommand<Record<string, never>>((_input, dir) => gitRemotes(dir), 'git-remotes', 'Read-only command. List configured remotes.', formatRemotes)
    toolCommand<Record<string, never>>((_input, dir) => gitWorktrees(dir), 'git-worktrees', 'Read-only command. List Git worktrees.', formatWorktrees)
    toolCommand<Record<string, never>>((_input, dir) => gitStash(dir), 'git-stash', 'Read-only command. List stash entries.', formatStash)
    toolCommand<Record<string, never>>((_input, dir) => gitTags(dir), 'git-tags', 'Read-only command. List tags.', formatTags)
    toolCommand<Record<string, never>>((_input, dir) => githubPr(dir), 'git-pr', 'Read-only GitHub command. Show pull request metadata for the current branch.', formatPr)
    toolCommand<PrDiffOptions>(githubPrDiff, 'git-pr-diff', 'Read-only GitHub command. Show the full diff for a pull request.', formatPrDiff)
    toolCommand<{number?: number}>(githubPrReviews, 'git-pr-reviews', 'Read-only GitHub command. List reviews for a pull request.', formatPrReviews)
    toolCommand<{number?: number}>(githubPrComments, 'git-pr-comments', 'Read-only GitHub command. List conversation and inline comments for a pull request.', formatPrComments)
    toolCommand<CiOptions>(githubCi, 'git-ci', 'Read-only GitHub command. Show CI check status for a pull request or branch.', formatCi)
    toolCommand<CiLogsOptions>(githubCiLogs, 'git-ci-logs', 'Read-only GitHub command. Fetch log lines for a CI run or job.', formatCiLogs)
    toolCommand<{number?: number}>(githubIssue, 'git-issue', 'Read-only GitHub command. Show issue metadata.', formatIssue)
    toolCommand<{number?: number}>(githubIssueComments, 'git-issue-comments', 'Read-only GitHub command. List comments for an issue.', formatIssueComments)
    toolCommand<{limit?: number}>(githubReleases, 'git-releases', 'Read-only GitHub command. List recent releases.', formatReleases)

    toolCommand<StageOptions>(gitStage, 'git-stage', 'Write command. Stage all changes or selected paths in the repository working tree/index.')
    toolCommand<UnstageOptions>(gitUnstage, 'git-unstage', 'Write command. Unstage all changes or selected paths; does not discard work-tree edits.')
    toolCommand<CommitOptions>(gitCommit, 'git-commit', 'Write command. Create a commit from already-staged changes.')
    toolCommand<CommitOptions>(async (input, dir) => {
      const staged = await gitStage({all: true}, dir)
      if ('error' in staged) return staged
      const committed = await gitCommit(input, dir)
      if ('error' in committed) return committed
      return await gitPush({}, dir)
    }, 'git-commit-push', 'Write command. Stage all changes, create one commit, then push the current branch to origin.')
    toolCommand<{message: string}>(async (input, dir) => {
      const committed = await gitCommit(input, dir)
      if ('error' in committed) return committed
      const fastForwarded = await gitFastForward(dir)
      if ('error' in fastForwarded) return fastForwarded
      return await gitPush({}, dir)
    }, 'git-commit-sync', 'Write command. Stage all changes, create one commit, fast-forward to upstream, then push.')
    toolCommand<PushOptions>(gitPush, 'git-push', 'Write command. Push the current branch to origin; force:true rewrites remote history.')
    toolCommand<BranchCreateOptions>(gitBranchCreate, 'git-branch-create', 'Write command. Create a local branch at startPoint or current HEAD.')
    toolCommand<CheckoutOptions>(gitCheckout, 'git-checkout', 'Write command. Switch branches; create:true creates and switches when allowed by the tool.')
    toolCommand<MergeOptions>(gitMerge, 'git-merge', 'Write command. Merge another branch into the current branch; may leave conflict markers on conflicts.')
    toolCommand<Record<string, never>>(async (_input, dir) => {
      const reset: ResetOptions = {mode: 'hard', ref: 'HEAD', confirm: true}
      return await gitReset(reset, dir)
    }, 'git-discard', 'Destructive write command. Discard all uncommitted index and work-tree changes by hard-resetting to HEAD.')
    toolCommand<Record<string, never>>((_, dir) => gitFetch(dir), 'git-fetch', 'Read-only network command. Fetch all configured remotes and prune stale remote-tracking refs.')
    toolCommand<Record<string, never>>((_, dir) => gitPull(dir), 'git-pull', 'Write command. Fetch and fast-forward the current branch to its configured upstream.')
    toolCommand<Record<string, never>>((_, dir) => gitFastForward(dir), 'git-fast-forward', 'Write command. Fast-forward the current branch to its configured upstream.')
    toolCommand<Record<string, never>>(async (_input, dir) => {
      const synced = await gitSync(dir)
      if ('error' in synced) return synced
      return await gitPush({}, dir)
    }, 'git-sync', 'Write command. Fast-forward the current branch to its upstream, then push it.')
    toolCommand<Record<string, never>>((_, dir) => gitRebase(dir), 'git-rebase', 'Write command. Rebase the current branch onto its upstream; may stop with conflict state.')
    toolCommand<PrCreateOptions>(githubPrCreate, 'git-pr-create', 'Write GitHub command. Open a pull request for the current/explicit head branch.')
    toolCommand<PrMergeOptions>(githubPrMerge, 'git-pr-merge', 'Write GitHub command. Merge a pull request and optionally delete its source branch.')
    toolCommand<PrCommentOptions>(githubPrComment, 'git-pr-comment', 'Write GitHub command. Add a comment to a pull request.')
    toolCommand<PrReviewOptions>(githubPrReview, 'git-pr-review', 'Write GitHub command. Submit an approval, request-changes review, or comment review.')
  }))
}

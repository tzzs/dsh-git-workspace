import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type {
  ToolCallView,
  ToolResult,
  ToolResultView,
} from '@deepseek-ai/dsh-tools'
import {
  gitWorkspace,
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
  gitBranchCreate,
  gitPush,
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
} from './tools/index.js'
import type { DiffFile } from './types.js'
import {
  toWorkspaceMeta,
  toStatusMeta,
  toDiffMeta,
  toCommitsMeta,
  toShowMeta,
  toCompareMeta,
  toPrMeta,
  toPrCreateMeta,
  toCiMeta,
  toIssueMeta,
} from './ui/meta.js'
import {
  text,
  genericCall,
  genericResult,
  errorTitle,
} from './presentation.js'
import { installWorkspaceSampler } from './projection.js'
import { installGitCommands } from './commands.js'

export const name = '@tzzs/dsh-git-workspace'
export const inject = ['tools']

const json = { type: 'object', additionalProperties: true } as const

type Presenters = {
  presentCall?: (args: Record<string, unknown>) => ToolCallView | undefined
  presentResult?: (
    args: Record<string, unknown>,
    result: ToolResult,
  ) => ToolResultView | undefined
}

function register(
  ctx: { tools: { register(tool: unknown): unknown } },
  tool: {
    name: string
    description: string
    parameters: Record<string, unknown>
    execute: (a: Record<string, unknown>) => Promise<unknown>
    render?: (args: Record<string, unknown>, value: unknown) => ContentBlock[]
    presentationMeta?: (args: Record<string, unknown>, value: unknown) => unknown
    presenters?: Presenters
  },
) {
  const {
    name,
    description,
    parameters,
    execute,
    render,
    presentationMeta,
    presenters,
  } = tool
  ctx.tools.register(
    defineTool({
      name,
      description,
      parameters: parameters as never,
      output: {
        schema: json,
        render:
          render ??
          ((_args: never, value: never) =>
            text(JSON.stringify(value, null, 2)) as ContentBlock[]),
        ...(presentationMeta
          ? {
              presentationMeta: ((_args: Record<string, unknown>, value: unknown) =>
                JSON.parse(
                  JSON.stringify(presentationMeta(_args, value)),
                )) as never,
            }
          : {}),
      },
      ...(presenters?.presentCall
        ? { presentCall: presenters.presentCall as never }
        : {}),
      ...(presenters?.presentResult
        ? { presentResult: presenters.presentResult as never }
        : {}),
      async execute(args: Record<string, unknown>) {
        const result = await execute(args as Record<string, unknown>)
        return JSON.parse(JSON.stringify(result)) as never
      },
    } as never),
  )
}

const str = { type: 'string' } as const
const int = { type: 'integer' } as const
const bool = { type: 'boolean' } as const

function isError(v: unknown): v is { error: unknown } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'error' in (v as Record<string, unknown>)
  )
}

function fileStats(files: DiffFile[]): string {
  const additions = files.reduce((s, f) => s + (f.additions || 0), 0)
  const deletions = files.reduce((s, f) => s + (f.deletions || 0), 0)
  return `${files.length} files +${additions} -${deletions}`
}

function changeSummary(value: { files?: { length: number } }) {
  return `changes: ${value.files?.length ?? 0}`
}

export function apply(ctx: {
  tools: { register(tool: unknown): unknown }
} & Pick<Context, 'inject'>) {
  installWorkspaceSampler(ctx)
  installGitCommands(ctx)
  // ---- git_workspace -----------------------------------------------------
  register(ctx, {
    name: 'git_workspace',
    description:
      'Summarize the current Git workspace context (branch, changes, commits, PR, CI). Read-only.',
    parameters: {},
    execute: () => gitWorkspace(),
    presentationMeta: (_a, value) =>
      toWorkspaceMeta(value as Parameters<typeof toWorkspaceMeta>[0]),
    render: (_a, value) =>
      text(
        (() => {
          const w = value as {
            branch?: { name?: string | null; ahead?: number; behind?: number }
            workspace?: { clean?: boolean }
            changes?: { modified?: number; untracked?: number }
            pullRequest?: { number?: number; state?: string } | null
          }
          const lines = [
            `branch: ${w.branch?.name ?? 'detached'}`,
            `clean: ${w.workspace?.clean ? 'yes' : 'no'}`,
            `changes: ${w.changes?.modified ?? 0} modified, ${w.changes?.untracked ?? 0} untracked`,
          ]
          if (w.pullRequest) {
            lines.push(`PR #${w.pullRequest.number} (${w.pullRequest.state})`)
          }
          return lines.join('\n')
        })(),
      ),
    presenters: {
      presentCall: () => genericCall('Read Git workspace'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Git workspace read failed') ?? 'Git workspace',
            result.content,
          )
        return genericResult('Git workspace', result.content)
      },
    },
  })

  // ---- git_status --------------------------------------------------------
  register(ctx, {
    name: 'git_status',
    description: 'Read structured Git branch and working-tree status.',
    parameters: {},
    execute: () => gitStatus(),
    presentationMeta: (_a, value) =>
      toStatusMeta(value as Parameters<typeof toStatusMeta>[0]),
    render: (_a, value) => {
      const v = value as {
        branch?: { name?: string | null; ahead?: number; behind?: number }
        files?: { length: number }
      }
      return text(
        `branch: ${v.branch?.name ?? 'detached'}` +
          `\n${changeSummary(v as { files?: { length: number } })}`,
      )
    },
    presenters: {
      presentCall: () => genericCall('Read Git status'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Git status failed') ?? 'Git status',
            result.content,
          )
        return genericResult('Git status', result.content)
      },
    },
  })

  // ---- git_files ---------------------------------------------------------
  register(ctx, {
    name: 'git_files',
    description: 'List Git files by scope.',
    parameters: { scope: { type: 'string', enum: ['working-tree', 'staged', 'committed', 'all'] } },
    execute: (a) =>
      gitFiles(
        (a.scope as 'working-tree' | 'staged' | 'committed' | 'all') ??
          'working-tree',
      ),
    presentationMeta: (_a, value) => {
      const v = value as { files?: Array<{ path: string; status?: string; staged?: boolean; oldPath?: string | null }> }
      return { files: (v.files ?? []).map((f) => ({ path: f.path, status: f.status, staged: f.staged, oldPath: f.oldPath })) }
    },
    render: (_a, value) => {
      const v = value as { files?: Array<{ path: string; status?: string }> }
      return text((v.files ?? []).map((f) => `${f.status ?? '?'} ${f.path}`).join('\n'))
    },
    presenters: {
      presentCall: (a) => genericCall('List Git files', { rawInput: a.scope }),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'List files failed') ?? 'Git files',
            result.content,
          )
        return genericResult('Git files', result.content)
      },
    },
  })

  // ---- git_diff ----------------------------------------------------------
  register(ctx, {
    name: 'git_diff',
    description:
      'Read a structured, bounded Git diff with file metadata and paged hunks.',
    parameters: {
      path: str,
      staged: bool,
      base: str,
      head: str,
      offset: int,
      limit: int,
    },
    execute: (a) => gitDiff(a as never),
    presentationMeta: (_a, value) => {
      if (isError(value)) return { error: (value as { error: unknown }).error }
      return toDiffMeta(value as Parameters<typeof toDiffMeta>[0])
    },
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string }
        return text(`diff failed: ${e.message ?? 'unknown error'}`)
      }
      const v = value as { files?: DiffFile[]; raw?: string }
      const files = v.files ?? []
      return text(
        files.length
          ? fileStats(files) +
              '\n' +
              files
                .map(
                  (f) =>
                    `${f.status ?? 'M'} ${f.path}${f.additions ? ' +' + f.additions : ''}${f.deletions ? ' -' + f.deletions : ''}`,
                )
                .join('\n')
          : 'no diff',
      )
    },
    presenters: {
      presentCall: () => genericCall('Read Git diff'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Diff failed') ?? 'Git diff',
            result.content,
          )
        const v = (result as unknown as { content: ContentBlock[] }).content
        let parsed: { files?: DiffFile[] } | null = null
        try {
          const raw = JSON.parse(result.content.map((c) => (c as { text?: string }).text ?? '').join(''))
          if (raw && typeof raw === 'object' && 'files' in raw) parsed = raw
        } catch {
          /* fall back to text */
        }
        const files = parsed?.files ?? []
        if (files.length === 0) {
          return genericResult(
            'Git diff',
            (result as unknown as { content: ContentBlock[] }).content,
          )
        }
        return genericResult(
          'Git diff',
          text(fileStats(files) + '\n' + files.map((f) => `${f.path} +${f.additions || 0} -${f.deletions || 0}`).join('\n')),
        )
      },
    },
  })

  // ---- git_commits -------------------------------------------------------
  register(ctx, {
    name: 'git_commits',
    description: 'Read recent Git commits with optional range, author, and path filters.',
    parameters: { limit: int, path: str, base: str, head: str, from: str, to: str, author: str },
    execute: (a) => gitCommits(a as never),
    presentationMeta: (_a, value) => {
      if (isError(value)) return { error: (value as { error: unknown }).error }
      return toCommitsMeta(value as Parameters<typeof toCommitsMeta>[0])
    },
    render: (_a, value) => {
      const v = value as { commits?: Array<{ shortSha?: string; message?: string }> }
      return text((v.commits ?? []).map((c) => `${c.shortSha ?? ''} ${c.message ?? ''}`).join('\n'))
    },
    presenters: {
      presentCall: () => genericCall('Read Git commits'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Commits failed') ?? 'Git commits',
            result.content,
          )
        return genericResult('Git commits', result.content)
      },
    },
  })

  // ---- git_show ----------------------------------------------------------
  register(ctx, {
    name: 'git_show',
    description: 'Read the full information of a single commit by SHA, short SHA, or revision.',
    parameters: { sha: str, includeDiff: bool, includeFiles: bool, offset: int, limit: int },
    execute: (a) => gitShow(a as never),
    presentationMeta: (_a, value) => {
      if (isError(value)) return { error: (value as { error: unknown }).error }
      return toShowMeta(value as Parameters<typeof toShowMeta>[0])
    },
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string }
        return text(`show failed: ${e.message ?? 'unknown error'}`)
      }
      const v = value as { commit?: { shortSha?: string; message?: string; author?: string; date?: string }; files?: Array<{ path?: string; status?: string; additions?: number; deletions?: number }> }
      const lines = [
        `${v.commit?.shortSha ?? ''} ${v.commit?.message ?? ''}`,
        `${v.commit?.author ?? ''} · ${v.commit?.date ?? ''}`,
      ]
      if (v.files) {
        lines.push('')
        lines.push(...v.files.map((f) => `${f.status ?? 'M'} ${f.path} +${f.additions ?? 0} -${f.deletions ?? 0}`))
      }
      return text(lines.join('\n'))
    },
    presenters: {
      presentCall: () => genericCall('Read commit'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Commit read failed') ?? 'Git show',
            result.content,
          )
        return genericResult('Commit', result.content)
      },
    },
  })

  // ---- git_compare -------------------------------------------------------
  register(ctx, {
    name: 'git_compare',
    description: 'Compare two Git revisions or branches, returning ahead/behind and file stats.',
    parameters: { base: str, head: str, path: str, offset: int, limit: int },
    execute: (a) => gitCompare(a as never),
    presentationMeta: (_a, value) => {
      if (isError(value)) return { error: (value as { error: unknown }).error }
      return toCompareMeta(value as Parameters<typeof toCompareMeta>[0])
    },
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string }
        return text(`compare failed: ${e.message ?? 'unknown error'}`)
      }
      const v = value as { base?: string; head?: string; ahead?: number; behind?: number; stats?: { files?: number; additions?: number; deletions?: number } }
      return text(
        `${v.base ?? ''}...${v.head ?? ''}: ${v.ahead ?? 0} ahead, ${v.behind ?? 0} behind\n` +
          `${v.stats?.files ?? 0} files, +${v.stats?.additions ?? 0} -${v.stats?.deletions ?? 0}`,
      )
    },
    presenters: {
      presentCall: () => genericCall('Compare Git revisions'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Compare failed') ?? 'Git compare',
            result.content,
          )
        return genericResult('Compare', result.content)
      },
    },
  })

  // ---- git_blame ---------------------------------------------------------
  register(ctx, {
    name: 'git_blame',
    description: 'Trace the commit history of each line of a file within an optional line range.',
    parameters: { path: str, startLine: int, endLine: int, revision: str, limit: int },
    execute: (a) => gitBlame(a as never),
    presenters: {
      presentCall: () => genericCall('Trace Git blame'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Blame failed') ?? 'Git blame',
            result.content,
          )
        return genericResult('Blame', result.content)
      },
    },
  })

  // ---- git_branches ------------------------------------------------------
  register(ctx, {
    name: 'git_branches',
    description: 'List local and remote branches with current, upstream, ahead, and behind.',
    parameters: {},
    execute: () => gitBranches(),
    presenters: {
      presentCall: () => genericCall('List Git branches'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Branches failed') ?? 'Git branches',
            result.content,
          )
        return genericResult('Branches', result.content)
      },
    },
  })

  // ---- git_remotes -------------------------------------------------------
  register(ctx, {
    name: 'git_remotes',
    description: 'List Git remotes with fetch/push URLs and parsed GitHub metadata.',
    parameters: {},
    execute: () => gitRemotes(),
    presenters: {
      presentCall: () => genericCall('List Git remotes'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Remotes failed') ?? 'Git remotes',
            result.content,
          )
        return genericResult('Remotes', result.content)
      },
    },
  })

  // ---- git_worktrees -----------------------------------------------------
  register(ctx, {
    name: 'git_worktrees',
    description: 'List all Git worktrees for the repository (read-only).',
    parameters: {},
    execute: () => gitWorktrees(),
    presenters: {
      presentCall: () => genericCall('List Git worktrees'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Worktrees failed') ?? 'Git worktrees',
            result.content,
          )
        return genericResult('Worktrees', result.content)
      },
    },
  })

  // ---- git_stash ---------------------------------------------------------
  register(ctx, {
    name: 'git_stash',
    description: 'List the Git stash entries (read-only).',
    parameters: {},
    execute: () => gitStash(),
    presenters: {
      presentCall: () => genericCall('List Git stash'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Stash failed') ?? 'Git stash',
            result.content,
          )
        return genericResult('Stash', result.content)
      },
    },
  })

  // ---- git_tags ----------------------------------------------------------
  register(ctx, {
    name: 'git_tags',
    description: 'List Git tags with their commit and tagger info.',
    parameters: {},
    execute: () => gitTags(),
    presenters: {
      presentCall: () => genericCall('List Git tags'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Tags failed') ?? 'Git tags',
            result.content,
          )
        return genericResult('Tags', result.content)
      },
    },
  })

  // ---- git_stage ---------------------------------------------------------
  register(ctx, {
    name: 'git_stage',
    description:
      'Write tool. Mutates the Git index by staging working-tree files (git add). Pass paths to stage specific files or all:true to stage everything.',
    parameters: { paths: { type: 'array', items: { type: 'string' } }, all: bool },
    execute: (a) => gitStage(a as never),
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string; hint?: string }
        const hint = e.hint ? `\n${e.hint}` : ''
        return text(`stage failed: ${e.message ?? 'unknown error'}${hint}`)
      }
      const v = value as { staged?: string[]; all?: boolean }
      if (v.all) return text('Staged all working-tree changes.')
      const staged = v.staged ?? []
      return text(
        staged.length
          ? `Staged ${staged.length} file(s):\n${staged.map((p) => `+ ${p}`).join('\n')}`
          : 'Nothing staged.',
      )
    },
    presenters: {
      presentCall: () => genericCall('Stage files'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Stage') ?? 'Stage',
            result.content,
          )
        return genericResult('Stage', result.content)
      },
    },
  })

  // ---- git_unstage -------------------------------------------------------
  register(ctx, {
    name: 'git_unstage',
    description:
      'Write tool. Mutates the Git index by unstaging files (keeps working-tree changes). Pass paths or all:true.',
    parameters: { paths: { type: 'array', items: { type: 'string' } }, all: bool },
    execute: (a) => gitUnstage(a as never),
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string; hint?: string }
        const hint = e.hint ? `\n${e.hint}` : ''
        return text(`unstage failed: ${e.message ?? 'unknown error'}${hint}`)
      }
      const v = value as { unstaged?: string[]; all?: boolean }
      if (v.all) return text('Unstaged all files.')
      const unstaged = v.unstaged ?? []
      return text(
        unstaged.length
          ? `Unstaged ${unstaged.length} file(s):\n${unstaged.map((p) => `- ${p}`).join('\n')}`
          : 'Nothing unstaged.',
      )
    },
    presenters: {
      presentCall: () => genericCall('Unstage files'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Unstage') ?? 'Unstage',
            result.content,
          )
        return genericResult('Unstage', result.content)
      },
    },
  })

  // ---- git_commit --------------------------------------------------------
  register(ctx, {
    name: 'git_commit',
    description:
      'Write tool. Creates a commit on the current branch from staged changes. Does not stage files itself - stage them first with git_stage.',
    parameters: { message: str, amend: bool, allowEmpty: bool },
    execute: (a) => gitCommit(a as never),
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string; hint?: string }
        const hint = e.hint ? `\n${e.hint}` : ''
        return text(`commit failed: ${e.message ?? 'unknown error'}${hint}`)
      }
      const v = value as {
        sha?: string
        shortSha?: string
        branch?: string | null
        message?: string
      }
      return text(
        `Committed ${v.shortSha ?? v.sha ?? ''}${v.branch ? ` on ${v.branch}` : ''}\n${v.message ?? ''}`,
      )
    },
    presenters: {
      presentCall: () => genericCall('Commit staged changes'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Commit') ?? 'Commit',
            result.content,
          )
        return genericResult('Commit', result.content)
      },
    },
  })

  // ---- git_branch_create -------------------------------------------------
  register(ctx, {
    name: 'git_branch_create',
    description:
      'Write tool. Creates a new local branch, optionally checking it out (checkout defaults to true).',
    parameters: { name: str, startPoint: str, checkout: bool },
    execute: (a) => gitBranchCreate(a as never),
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string; hint?: string }
        const hint = e.hint ? `\n${e.hint}` : ''
        return text(`branch creation failed: ${e.message ?? 'unknown error'}${hint}`)
      }
      const v = value as {
        name?: string
        startPoint?: string | null
        checkedOut?: boolean
      }
      return text(
        `Created branch ${v.name ?? ''}${v.startPoint ? ` from ${v.startPoint}` : ''}${v.checkedOut ? ' (checked out)' : ''}.`,
      )
    },
    presenters: {
      presentCall: () => genericCall('Create branch'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Create branch') ?? 'Create branch',
            result.content,
          )
        return genericResult('Branch created', result.content)
      },
    },
  })

  // ---- git_push ----------------------------------------------------------
  register(ctx, {
    name: 'git_push',
    description:
      'Write tool. Publishes local commits to a remote branch. force:true rewrites remote history - destructive on shared branches.',
    parameters: { remote: str, branch: str, force: bool, setUpstream: bool },
    execute: (a) => gitPush(a as never),
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string; hint?: string }
        const hint = e.hint ? `\n${e.hint}` : ''
        return text(`push failed: ${e.message ?? 'unknown error'}${hint}`)
      }
      const v = value as {
        remote?: string
        branch?: string
        upstream?: string | null
        forced?: boolean
      }
      return text(
        `Pushed ${v.branch ?? ''} to ${v.remote ?? ''}${v.forced ? ' (forced)' : ''}${v.upstream ? `\nupstream: ${v.upstream}` : ''}`,
      )
    },
    presenters: {
      presentCall: () => genericCall('Push commits'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Push') ?? 'Push',
            result.content,
          )
        return genericResult('Push', result.content)
      },
    },
  })

  // ---- git_checkout ------------------------------------------------------
  register(ctx, {
    name: 'git_checkout',
    description:
      'Write tool. Switches the working tree to another branch (or creates it with create:true). May fail when local changes would be overwritten.',
    parameters: { branch: str, create: bool },
    execute: (a) => gitCheckout(a as never),
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string; hint?: string }
        const hint = e.hint ? `\n${e.hint}` : ''
        return text(`checkout failed: ${e.message ?? 'unknown error'}${hint}`)
      }
      const v = value as {
        branch?: string
        created?: boolean
        previous?: string | null
      }
      return text(
        `${v.created ? 'Created and checked out' : 'Checked out'} ${v.branch ?? ''}${v.previous ? ` (from ${v.previous})` : ''}.`,
      )
    },
    presenters: {
      presentCall: () => genericCall('Checkout branch'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Checkout') ?? 'Checkout',
            result.content,
          )
        return genericResult('Checkout', result.content)
      },
    },
  })

  // ---- git_merge ---------------------------------------------------------
  register(ctx, {
    name: 'git_merge',
    description:
      'Write tool. Merges another branch into the current branch. On conflicts returns conflictedFiles without aborting - resolve manually.',
    parameters: { branch: str, message: str, squash: bool, noFastForward: bool },
    execute: (a) => gitMerge(a as never),
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string; hint?: string }
        const hint = e.hint ? `\n${e.hint}` : ''
        return text(`merge failed: ${e.message ?? 'unknown error'}${hint}`)
      }
      const v = value as {
        merged?: boolean
        branch?: string
        sha?: string | null
        squash?: boolean
        conflictedFiles?: string[]
      }
      const conflicts = v.conflictedFiles ?? []
      if (!v.merged && conflicts.length > 0) {
        return text(
          `Merge of ${v.branch ?? ''} stopped on conflicts in ${conflicts.length} file(s):\n${conflicts.join('\n')}`,
        )
      }
      return text(
        `Merged ${v.branch ?? ''}${v.squash ? ' (squash)' : ''}${v.sha ? ` at ${v.sha}` : ''}.`,
      )
    },
    presenters: {
      presentCall: () => genericCall('Merge branch'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Merge') ?? 'Merge',
            result.content,
          )
        return genericResult('Merge', result.content)
      },
    },
  })

  // ---- git_reset ---------------------------------------------------------
  register(ctx, {
    name: 'git_reset',
    description:
      'Write tool. Moves the current branch and optionally rewrites index/working tree. mode:\'hard\' DISCARDS all uncommitted changes and requires confirm:true.',
    parameters: {
      mode: { type: 'string', enum: ['soft', 'mixed', 'hard'] },
      ref: str,
      confirm: bool,
    },
    execute: (a) => gitReset(a as never),
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string; hint?: string }
        const hint = e.hint ? `\n${e.hint}` : ''
        return text(`reset failed: ${e.message ?? 'unknown error'}${hint}`)
      }
      const v = value as { mode?: string; ref?: string; shortSha?: string }
      return text(`Reset (${v.mode ?? 'mixed'}) to ${v.ref ?? 'HEAD'} (${v.shortSha ?? ''}).`)
    },
    presenters: {
      presentCall: () => genericCall('Reset branch'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Reset') ?? 'Reset',
            result.content,
          )
        return genericResult('Reset', result.content)
      },
    },
  })

  // ---- github_pr ---------------------------------------------------------
  register(ctx, {
    name: 'github_pr',
    description: 'Find all GitHub pull requests for the current branch using gh CLI.',
    parameters: {},
    execute: () => githubPr(),
    presentationMeta: (_a, value) => {
      if (isError(value)) return { error: (value as { error: unknown }).error }
      return toPrMeta(value as Parameters<typeof toPrMeta>[0])
    },
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string; code?: string }
        return text(`PR lookup failed: ${e.message ?? e.code ?? 'unknown error'}`)
      }
      const v = value as { pullRequests?: Array<{ number?: number; title?: string; state?: string; draft?: boolean }> }
      const prs = v.pullRequests ?? []
      if (prs.length === 0) return text('No pull request for this branch.')
      return text(
        prs
          .map(
            (p) =>
              `PR #${p.number} ${p.title ?? ''} (${p.state ?? ''}${p.draft ? ', draft' : ''})`,
          )
          .join('\n'),
      )
    },
    presenters: {
      presentCall: () => genericCall('Read pull request'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'PR lookup failed') ?? 'Pull request',
            result.content,
          )
        return genericResult('Pull request', result.content)
      },
    },
  })

  // ---- github_pr_create --------------------------------------------------
  register(ctx, {
    name: 'github_pr_create',
    description:
      'Create a GitHub pull request for a branch using the gh CLI. Fills title/body from commit history unless both are given.',
    parameters: { title: str, body: str, base: str, head: str, draft: bool },
    execute: (a) => githubPrCreate(a as never),
    presentationMeta: (_a, value) => {
      if (isError(value)) return { error: (value as { error: unknown }).error }
      const v = value as Parameters<typeof toPrCreateMeta>[0]
      return toPrCreateMeta(v)
    },
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string; code?: string; hint?: string }
        const hint = e.hint ? `\n${e.hint}` : ''
        return text(`PR creation failed: ${e.message ?? e.code ?? 'unknown error'}${hint}`)
      }
      const v = value as { number?: number; url?: string; title?: string | null; base?: string; head?: string }
      if (!v.number) return text('Pull request created.')
      return text(
        `Created PR #${v.number}: ${v.title ?? ''}\n${v.head ?? ''} → ${v.base ?? ''}${v.url ? `\n${v.url}` : ''}`,
      )
    },
    presenters: {
      presentCall: () => genericCall('Create pull request'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'PR creation failed') ?? 'Pull request',
            result.content,
          )
        return genericResult('Pull request created', result.content)
      },
    },
  })

  // ---- github_pr_diff ----------------------------------------------------
  register(ctx, {
    name: 'github_pr_diff',
    description: 'Read a structured, bounded diff for a GitHub pull request.',
    parameters: { number: int, path: str, offset: int, limit: int },
    execute: (a) => githubPrDiff(a as never),
    presenters: {
      presentCall: () => genericCall('Read PR diff'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'PR diff failed') ?? 'PR diff',
            result.content,
          )
        return genericResult('PR diff', result.content)
      },
    },
  })

  // ---- github_pr_reviews -------------------------------------------------
  register(ctx, {
    name: 'github_pr_reviews',
    description: 'Read the reviews submitted on a GitHub pull request.',
    parameters: { number: int },
    execute: (a) => githubPrReviews(a as never),
    presenters: {
      presentCall: () => genericCall('Read PR reviews'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Reviews failed') ?? 'PR reviews',
            result.content,
          )
        return genericResult('Reviews', result.content)
      },
    },
  })

  // ---- github_pr_comments -------------------------------------------------
  register(ctx, {
    name: 'github_pr_comments',
    description:
      'Read conversation and inline review comments for a PR, including resolved state.',
    parameters: { number: int },
    execute: (a) => githubPrComments(a as never),
    presenters: {
      presentCall: () => genericCall('Read PR comments'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Comments failed') ?? 'PR comments',
            result.content,
          )
        return genericResult('Comments', result.content)
      },
    },
  })

  // ---- github_ci ---------------------------------------------------------
  register(ctx, {
    name: 'github_ci',
    description: 'Read CI/check status for a pull request or the current branch.',
    parameters: { number: int, branch: str },
    execute: (a) => githubCi(a as never),
    presentationMeta: (_a, value) => {
      if (isError(value)) return { error: (value as { error: unknown }).error }
      return toCiMeta(value as Parameters<typeof toCiMeta>[0])
    },
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string }
        return text(`CI lookup failed: ${e.message ?? 'unknown error'}`)
      }
      const v = value as { status?: string; checks?: Array<{ name?: string; conclusion?: string | null }> }
      const checks = v.checks ?? []
      return text(
        `CI: ${v.status ?? 'unknown'}` +
          (checks.length
            ? '\n' + checks.map((c) => `${c.conclusion ?? 'queued'} ${c.name ?? ''}`).join('\n')
            : ''),
      )
    },
    presenters: {
      presentCall: () => genericCall('Read CI status'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'CI lookup failed') ?? 'CI status',
            result.content,
          )
        return genericResult('CI status', result.content)
      },
    },
  })

  // ---- github_ci_logs ----------------------------------------------------
  register(ctx, {
    name: 'github_ci_logs',
    description: 'Read paged CI logs for a run (optionally a job).',
    parameters: { runId: int, jobId: int, offset: int, limit: int },
    execute: (a) => githubCiLogs(a as never),
    presenters: {
      presentCall: () => genericCall('Read CI logs'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'CI logs failed') ?? 'CI logs',
            result.content,
          )
        return genericResult('CI logs', result.content)
      },
    },
  })

  // ---- github_issue ------------------------------------------------------
  register(ctx, {
    name: 'github_issue',
    description: 'Read a GitHub issue by number.',
    parameters: { number: int },
    execute: (a) => githubIssue(a as never),
    presentationMeta: (_a, value) => {
      if (isError(value)) return { error: (value as { error: unknown }).error }
      return toIssueMeta(value as Parameters<typeof toIssueMeta>[0])
    },
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string }
        return text(`Issue lookup failed: ${e.message ?? 'unknown error'}`)
      }
      const v = value as { issue?: { number?: number; title?: string; state?: string } }
      return text(
        v.issue
          ? `#${v.issue.number} ${v.issue.title ?? ''} (${v.issue.state ?? ''})`
          : 'Issue not found',
      )
    },
    presenters: {
      presentCall: () => genericCall('Read GitHub issue'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Issue lookup failed') ?? 'Issue',
            result.content,
          )
        return genericResult('Issue', result.content)
      },
    },
  })

  // ---- github_issue_comments ---------------------------------------------
  register(ctx, {
    name: 'github_issue_comments',
    description: 'Read the conversation comments on a GitHub issue.',
    parameters: { number: int },
    execute: (a) => githubIssueComments(a as never),
    presenters: {
      presentCall: () => genericCall('Read issue comments'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Comments failed') ?? 'Issue comments',
            result.content,
          )
        return genericResult('Issue comments', result.content)
      },
    },
  })

  // ---- github_releases ---------------------------------------------------
  register(ctx, {
    name: 'github_releases',
    description: 'List GitHub releases with tag, date, and URL.',
    parameters: { limit: int },
    execute: (a) => githubReleases(a as never),
    presenters: {
      presentCall: () => genericCall('List GitHub releases'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Releases failed') ?? 'Releases',
            result.content,
          )
        return genericResult('Releases', result.content)
      },
    },
  })

  // ---- github_pr_merge ---------------------------------------------------
  register(ctx, {
    name: 'github_pr_merge',
    description:
      'Write tool. Merges a GitHub pull request via the gh CLI - an irreversible remote mutation. Optionally deletes the head branch.',
    parameters: {
      number: int,
      method: { type: 'string', enum: ['merge', 'squash', 'rebase'] },
      deleteBranch: bool,
      subject: str,
      body: str,
    },
    execute: (a) => githubPrMerge(a as never),
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string; code?: string; hint?: string }
        const hint = e.hint ? `\n${e.hint}` : ''
        return text(`PR merge failed: ${e.message ?? e.code ?? 'unknown error'}${hint}`)
      }
      const v = value as {
        number?: number
        merged?: boolean
        method?: string
        branchDeleted?: boolean
        url?: string | null
      }
      return text(
        `Merged PR #${v.number} (${v.method ?? 'merge'})${v.branchDeleted ? ', head branch deleted' : ''}${v.url ? `\n${v.url}` : ''}`,
      )
    },
    presenters: {
      presentCall: () => genericCall('Merge pull request'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Merge pull request') ?? 'Merge pull request',
            result.content,
          )
        return genericResult('Pull request merged', result.content)
      },
    },
  })

  // ---- github_pr_comment -------------------------------------------------
  register(ctx, {
    name: 'github_pr_comment',
    description:
      'Write tool. Posts a comment on a GitHub pull request via the gh CLI.',
    parameters: { number: int, body: str },
    execute: (a) => githubPrComment(a as never),
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string; code?: string; hint?: string }
        const hint = e.hint ? `\n${e.hint}` : ''
        return text(`PR comment failed: ${e.message ?? e.code ?? 'unknown error'}${hint}`)
      }
      const v = value as { number?: number; url?: string | null }
      return text(`Commented on PR #${v.number}${v.url ? `\n${v.url}` : ''}`)
    },
    presenters: {
      presentCall: () => genericCall('Add PR comment'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Add PR comment') ?? 'Add PR comment',
            result.content,
          )
        return genericResult('PR comment added', result.content)
      },
    },
  })

  // ---- github_pr_review --------------------------------------------------
  register(ctx, {
    name: 'github_pr_review',
    description:
      'Write tool. Submits a review (APPROVE / REQUEST_CHANGES / COMMENT) on a GitHub pull request via the gh CLI.',
    parameters: {
      number: int,
      state: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'] },
      body: str,
    },
    execute: (a) => githubPrReview(a as never),
    render: (_a, value) => {
      if (isError(value)) {
        const e = value.error as { message?: string; code?: string; hint?: string }
        const hint = e.hint ? `\n${e.hint}` : ''
        return text(`review failed: ${e.message ?? e.code ?? 'unknown error'}${hint}`)
      }
      const v = value as { number?: number; state?: string; url?: string | null }
      return text(
        `Submitted review on PR #${v.number}: ${v.state ?? 'COMMENT'}${v.url ? `\n${v.url}` : ''}`,
      )
    },
    presenters: {
      presentCall: () => genericCall('Submit review'),
      presentResult: (_a, result) => {
        if (result.isError)
          return genericResult(
            errorTitle(result, 'Submit review') ?? 'Submit review',
            result.content,
          )
        return genericResult('Review submitted', result.content)
      },
    },
  })
}

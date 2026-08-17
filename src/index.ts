import { defineTool } from '@deepseek-ai/dsh-tools'
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
  githubPr,
  githubPrDiff,
  githubPrReviews,
  githubPrComments,
  githubCi,
  githubCiLogs,
  githubIssue,
  githubIssueComments,
  githubReleases,
} from './tools/index.js'

export const name = '@tzzs/dsh-git-workspace'
export const inject = ['tools']

const json = { type: 'object', additionalProperties: true } as const

export function apply(ctx: { tools: { register(tool: unknown): unknown } }) {
  const add = (
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    execute: (a: Record<string, unknown>) => Promise<unknown>,
  ) =>
    ctx.tools.register(
      defineTool({
        name,
        description,
        parameters: parameters as never,
        output: {
          schema: json,
          render: (_args: never, _value: never) => [
            { type: 'text', text: 'Git workspace result' },
          ],
        },
        async execute(args: Record<string, unknown>) {
          const result = await execute(args as Record<string, unknown>)
          return JSON.parse(JSON.stringify(result)) as never
        },
      } as never),
    )

  const str = { type: 'string' } as const
  const int = { type: 'integer' } as const
  const bool = { type: 'boolean' } as const

  add('git_workspace', 'Summarize the current read-only Git workspace context.', {}, () =>
    gitWorkspace(),
  )
  add(
    'git_status',
    'Read structured Git branch and working-tree status.',
    {},
    () => gitStatus(),
  )
  add(
    'git_files',
    'List Git files by scope.',
    {
      scope: {
        type: 'string',
        enum: ['working-tree', 'staged', 'committed', 'all'],
      },
    },
    (a) =>
      gitFiles(
        (a.scope as 'working-tree' | 'staged' | 'committed' | 'all') ??
          'working-tree',
      ),
  )
  add(
    'git_diff',
    'Read a structured, bounded Git diff with file metadata and paged hunks.',
    {
      path: str,
      staged: bool,
      base: str,
      head: str,
      offset: int,
      limit: int,
    },
    (a) => gitDiff(a as never),
  )
  add(
    'git_commits',
    'Read recent Git commits with optional range, author, and path filters.',
    {
      limit: int,
      path: str,
      base: str,
      head: str,
      from: str,
      to: str,
      author: str,
    },
    (a) => gitCommits(a as never),
  )
  add(
    'git_show',
    'Read the full information of a single commit by SHA, short SHA, or revision.',
    {
      sha: str,
      includeDiff: bool,
      includeFiles: bool,
      offset: int,
      limit: int,
    },
    (a) => gitShow(a as never),
  )
  add(
    'git_compare',
    'Compare two Git revisions or branches, returning ahead/behind and file stats.',
    {
      base: str,
      head: str,
      path: str,
      offset: int,
      limit: int,
    },
    (a) => gitCompare(a as never),
  )
  add(
    'git_blame',
    'Trace the commit history of each line of a file within an optional line range.',
    {
      path: str,
      startLine: int,
      endLine: int,
      revision: str,
      limit: int,
    },
    (a) => gitBlame(a as never),
  )
  add(
    'git_branches',
    'List local and remote branches with current, upstream, ahead, and behind.',
    {},
    () => gitBranches(),
  )
  add(
    'git_remotes',
    'List Git remotes with fetch/push URLs and parsed GitHub metadata.',
    {},
    () => gitRemotes(),
  )
  add(
    'git_worktrees',
    'List all Git worktrees for the repository (read-only).',
    {},
    () => gitWorktrees(),
  )
  add(
    'git_stash',
    'List the Git stash entries (read-only).',
    {},
    () => gitStash(),
  )
  add('git_tags', 'List Git tags with their commit and tagger info.', {}, () =>
    gitTags(),
  )
  add(
    'github_pr',
    'Find all GitHub pull requests for the current branch using gh CLI.',
    {},
    () => githubPr(),
  )
  add(
    'github_pr_diff',
    'Read a structured, bounded diff for a GitHub pull request.',
    { number: int, path: str, offset: int, limit: int },
    (a) => githubPrDiff(a as never),
  )
  add(
    'github_pr_reviews',
    'Read the reviews submitted on a GitHub pull request.',
    { number: int },
    (a) => githubPrReviews(a as never),
  )
  add(
    'github_pr_comments',
    'Read conversation and inline review comments for a PR, including resolved state.',
    { number: int },
    (a) => githubPrComments(a as never),
  )
  add(
    'github_ci',
    'Read CI/check status for a pull request or the current branch.',
    { number: int, branch: str },
    (a) => githubCi(a as never),
  )
  add(
    'github_ci_logs',
    'Read paged CI logs for a run (optionally a job).',
    { runId: int, jobId: int, offset: int, limit: int },
    (a) => githubCiLogs(a as never),
  )
  add(
    'github_issue',
    'Read a GitHub issue by number.',
    { number: int },
    (a) => githubIssue(a as never),
  )
  add(
    'github_issue_comments',
    'Read the conversation comments on a GitHub issue.',
    { number: int },
    (a) => githubIssueComments(a as never),
  )
  add(
    'github_releases',
    'List GitHub releases with tag, date, and URL.',
    { limit: int },
    (a) => githubReleases(a as never),
  )
}

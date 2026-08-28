import type {
  GitFile,
  CommitSummary,
  DiffFile,
  PullRequest,
  CheckRun,
  Review,
  ReviewComment,
  Issue,
  Branch,
} from '../types.js'

export type GitFileStatusVm =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'staged'
  | 'committed'
  | 'unknown'

export interface GitFileVm {
  path: string
  oldPath: string | null
  status: GitFileStatusVm
  staged: boolean
  unstaged: boolean
  label: string
}

export function statusLabel(status: GitFile['status']): GitFileStatusVm {
  if (status === 'committed' || status === 'untracked') return status
  return status
}

export function toGitFileVm(f: GitFile): GitFileVm {
  return {
    path: f.path,
    oldPath: f.oldPath ?? null,
    status: statusLabel(f.status),
    staged: f.staged,
    unstaged: f.unstaged ?? !f.staged,
    label: f.status.charAt(0).toUpperCase(),
  }
}

export function groupFiles(files: GitFileVm[]): {
  key: GitFileStatusVm
  title: string
  files: GitFileVm[]
}[] {
  const order: GitFileStatusVm[] = [
    'staged',
    'modified',
    'added',
    'deleted',
    'renamed',
    'untracked',
  ]
  const groups = new Map<GitFileStatusVm, GitFileVm[]>()
  for (const f of files) {
    const key = f.staged ? 'staged' : f.status
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(f)
  }
  return order
    .filter((k) => groups.has(k) && groups.get(k)!.length > 0)
    .map((k) => ({
      key: k,
      title: k.toUpperCase(),
      files: groups.get(k)!,
    }))
}

export interface CommitVm {
  sha: string
  shortSha: string
  message: string
  author: string
  date: string
  additions: number
  deletions: number
  fileCount: number
  files: Array<{ path: string; status: string; additions: number; deletions: number }>
}

export function toCommitVm(c: CommitSummary): CommitVm {
  return {
    sha: c.sha,
    shortSha: c.shortSha,
    message: c.message,
    author: c.author,
    date: c.date,
    additions: c.files?.additions ?? 0,
    deletions: c.files?.deletions ?? 0,
    fileCount: c.files?.count ?? 0,
    files: c.files?.list ?? [],
  }
}

export interface DiffHunkVm {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  header: string
  lines: DiffLineVm[]
}

export type DiffLineType = 'context' | 'add' | 'del' | 'hunk'

export interface DiffLineVm {
  type: DiffLineType
  oldLine: number | null
  newLine: number | null
  text: string
}

function toLines(
  oldStart: number,
  newStart: number,
  raw: string[],
): DiffLineVm[] {
  let o = oldStart
  let n = newStart
  return raw.map((l) => {
    if (l.startsWith('+')) {
      return { type: 'add', oldLine: null, newLine: n++, text: l.slice(1) }
    }
    if (l.startsWith('-')) {
      return { type: 'del', oldLine: o++, newLine: null, text: l.slice(1) }
    }
    return { type: 'context', oldLine: o++, newLine: n++, text: l }
  })
}

export function toDiffHunkVm(h: {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}): DiffHunkVm {
  return {
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    header: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
    lines: toLines(h.oldStart, h.newStart, h.lines),
  }
}

export interface DiffFileVm {
  path: string
  oldPath: string | null
  status: string
  binary: boolean
  additions: number
  deletions: number
  hunks: DiffHunkVm[]
}

export function toDiffFileVm(f: DiffFile): DiffFileVm {
  return {
    path: f.path,
    oldPath: f.oldPath,
    status: f.status,
    binary: f.binary ?? false,
    additions: f.additions,
    deletions: f.deletions,
    hunks: (f.hunks ?? []).map(toDiffHunkVm),
  }
}

export type PullRequestStateVm = 'OPEN' | 'DRAFT' | 'MERGED' | 'CLOSED'

export interface PullRequestVm {
  number: number
  title: string
  body: string | null
  state: PullRequestStateVm
  author: string | null
  base: string
  head: string
  url: string
  createdAt: string | null
  updatedAt: string | null
  stats: { files: number; additions: number; deletions: number }
  reviewDecision: string | null
  mergeable: string | null
}

export function toPullRequestVm(pr: PullRequest): PullRequestVm {
  let state: PullRequestStateVm = 'CLOSED'
  if (pr.merged) state = 'MERGED'
  else if (pr.state === 'open') state = pr.draft ? 'DRAFT' : 'OPEN'
  return {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state,
    author: pr.author,
    base: pr.base,
    head: pr.head,
    url: pr.url,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    stats: pr.stats,
    reviewDecision: pr.reviewDecision,
    mergeable: pr.mergeable,
  }
}

export type CheckStateVm =
  | 'queued'
  | 'in_progress'
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'skipped'

export interface CheckVm {
  name: string
  status: string
  conclusion: string | null
  workflow: string | null
  url: string | null
  state: CheckStateVm
}

export function toCheckVm(c: CheckRun): CheckVm {
  const state: CheckStateVm =
    c.conclusion === 'success'
      ? 'success'
      : c.conclusion === 'failure' || c.conclusion === 'cancelled'
        ? (c.conclusion as CheckStateVm)
        : c.status === 'in_progress'
          ? 'in_progress'
          : c.status === 'queued'
            ? 'queued'
            : c.conclusion === 'skipped'
              ? 'skipped'
              : 'queued'
  return {
    name: c.name,
    status: c.status,
    conclusion: c.conclusion,
    workflow: c.workflow,
    url: c.url,
    state,
  }
}

export function checkIcon(state: CheckStateVm): 'check' | 'warning' | 'error' {
  if (state === 'success') return 'check'
  if (state === 'failure' || state === 'cancelled') return 'error'
  return 'warning'
}

export interface ReviewVm {
  id: string
  author: string
  state: string
  body: string | null
  submittedAt: string | null
}

export function toReviewVm(r: Review): ReviewVm {
  return { ...r }
}

export interface ReviewCommentVm {
  id: string
  author: string
  body: string
  path: string | null
  line: number | null
  side: string | null
  commit: string | null
  createdAt: string | null
  resolved: boolean
  url: string | null
  key: string | null
}

export function toReviewCommentVm(c: ReviewComment): ReviewCommentVm {
  return {
    ...c,
    key: c.path && c.line != null ? `${c.path}:${c.line}` : null,
  }
}

export function unresolvedComments(
  comments: ReviewCommentVm[],
): ReviewCommentVm[] {
  return comments.filter((c) => !c.resolved)
}

export interface IssueVm {
  number: number
  title: string
  body: string | null
  state: string
  author: string | null
  labels: string[]
  assignees: string[]
  createdAt: string | null
  updatedAt: string | null
  url: string | null
}

export function toIssueVm(i: Issue): IssueVm {
  return { ...i }
}

export interface BranchVm {
  name: string | null
  upstream: string | null
  ahead: number
  behind: number
}

export function toBranchVm(b: Branch): BranchVm {
  return { ...b }
}

export interface WorkspaceSummaryVm {
  repository: { name: string; root: string; remote: string | null }
  branch: BranchVm | null
  changes: {
    modified: number
    staged: number
    deleted: number
    renamed: number
    untracked: number
  }
  clean: boolean
  pullRequest: PullRequestVm | null
  ci: { status: string; checks: CheckVm[] } | null
}

export function fromWorkspaceResult(
  w: Record<string, unknown>,
): WorkspaceSummaryVm | null {
  const repo = w.repository as {
    name?: string
    root?: string
    remote?: string | null
  }
  const branch = w.branch as Branch | undefined
  const changes = w.workspace as {
    modified?: number
    staged?: number
    deleted?: number
    renamed?: number
    untracked?: number
    clean?: boolean
  }
  const pr = w.pullRequest as PullRequest | null | undefined
  const ci = w.ci as { status?: string; checks?: CheckRun[] } | null | undefined
  if (!repo) return null
  return {
    repository: {
      name: repo.name ?? '',
      root: repo.root ?? '',
      remote: repo.remote ?? null,
    },
    branch: branch ? toBranchVm(branch) : null,
    changes: {
      modified: changes?.modified ?? 0,
      staged: changes?.staged ?? 0,
      deleted: changes?.deleted ?? 0,
      renamed: changes?.renamed ?? 0,
      untracked: changes?.untracked ?? 0,
    },
    clean: changes?.clean ?? true,
    pullRequest: pr ? toPullRequestVm(pr) : null,
    ci: ci
      ? { status: ci.status ?? 'unknown', checks: (ci.checks ?? []).map(toCheckVm) }
      : null,
  }
}

export function truncatePath(path: string, max = 48): string {
  if (path.length <= max) return path
  const segments = path.split('/')
  const file = segments.pop() ?? path
  const keep = Math.max(2, segments.length)
  const head = segments.slice(0, keep)
  return '…/' + head.join('/') + '/' + file
}

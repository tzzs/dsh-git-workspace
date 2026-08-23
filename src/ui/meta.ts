import type {
  GitFile,
  CommitSummary,
  DiffFile,
  PullRequest,
  CheckRun,
} from '../types.js'
import type { JsonValue } from '@deepseek-ai/dsh-session'

export interface WorkspaceCommentMeta {
  id: string
  author: string
  body: string
  path: string | null
  line: number | null
  resolved: boolean
  createdAt: string | null
  url: string | null
}

export interface WorkspaceMeta {
  repository: { name: string; root: string; remote: string | null }
  branch: { name: string | null; upstream: string | null; ahead: number; behind: number }
  changes: { modified: number; staged: number; deleted: number; renamed: number; untracked: number }
  clean: boolean
  files?: FileMeta[]
  filesTruncated?: boolean
  commits?: CommitMeta[]
  branches?: Array<{ name: string; current: boolean; upstream: string | null; ahead: number; behind: number }>
  stashCount?: number
  additionsTotal?: number
  deletionsTotal?: number
  comparison?: { base: string | null; ahead: number; behind: number } | null
  pullRequest: {
    number: number
    title: string
    state: string
    draft: boolean
    url: string
    comments?: WorkspaceCommentMeta[]
  } | null
  ci: { status: string; checks: CheckMeta[] } | null
}

export interface StatusMeta {
  branch: { name: string | null; upstream: string | null; ahead: number; behind: number }
  files: FileMeta[]
}

export interface FileMeta {
  path: string
  oldPath: string | null
  status: string
  staged: boolean
  additions?: number
  deletions?: number
}

export interface DiffFileMeta {
  path: string
  oldPath: string | null
  status: string
  binary: boolean
  additions: number
  deletions: number
}

export interface DiffMeta {
  stats: { files: number; additions: number; deletions: number }
  files: DiffFileMeta[]
}

export interface CommitMeta {
  shortSha: string
  message: string
  author: string
  date: string
  additions: number
  deletions: number
  fileCount: number
}

export interface CheckMeta {
  name: string
  status: string
  conclusion: string | null
  workflow: string | null
  url: string | null
}

export interface PrMeta {
  pullRequests: Array<{
    number: number
    title: string
    state: string
    draft: boolean
    url: string
  }>
}

export interface ShowMeta {
  commit: { sha: string; shortSha: string; message: string; author: string; date: string }
  files: Array<{
    path: string
    status: string
    additions: number
    deletions: number
  }>
}

export interface CompareMeta {
  base: string
  head: string
  ahead: number
  behind: number
  stats: { files: number; additions: number; deletions: number }
}

export interface IssueMeta {
  issue: { number: number; title: string; state: string } | null
}

export interface CiMeta {
  status: string
  checks: CheckMeta[]
}

function fileMeta(f: GitFile): FileMeta {
  const base: FileMeta = {
    path: f.path,
    oldPath: f.oldPath ?? null,
    status: f.status,
    staged: f.staged,
  }
  if (typeof (f as { additions?: unknown }).additions === 'number') {
    return {
      ...base,
      additions: (f as { additions?: number }).additions,
      deletions: (f as { deletions?: number }).deletions,
    }
  }
  return base
}

function diffFileMeta(f: DiffFile): DiffFileMeta {
  return {
    path: f.path,
    oldPath: f.oldPath,
    status: f.status,
    binary: f.binary ?? false,
    additions: f.additions,
    deletions: f.deletions,
  }
}

function commitMeta(c: CommitSummary): CommitMeta {
  return {
    shortSha: c.shortSha,
    message: c.message,
    author: c.author,
    date: c.date,
    additions: c.files?.additions ?? 0,
    deletions: c.files?.deletions ?? 0,
    fileCount: c.files?.count ?? 0,
  }
}

function checkMeta(c: CheckRun): CheckMeta {
  return {
    name: c.name,
    status: c.status,
    conclusion: c.conclusion,
    workflow: c.workflow,
    url: c.url,
  }
}

export function toWorkspaceMeta(w: {
  repository: { name: string; root: string; remote: string | null }
  branch: { name: string | null; upstream: string | null; ahead: number; behind: number }
  workspace: { clean: boolean; modified: number; staged: number; deleted: number; renamed: number; untracked: number }
  files?: Array<GitFile & { additions?: number; deletions?: number }>
  filesTruncated?: boolean
  commits?: { ahead: number; recent: CommitSummary[] }
  branches?: Array<{ name: string; current: boolean; upstream: string | null; ahead: number; behind: number }>
  stashCount?: number
  additionsTotal?: number
  deletionsTotal?: number
  comparison?: { base: string | null; ahead: number; behind: number } | null
  pullRequest: {
    number: number
    title: string
    state: string
    draft: boolean
    url: string
    comments?: WorkspaceCommentMeta[]
  } | null
  ci: { status: string; checks: CheckRun[] } | null
}): WorkspaceMeta {
  return {
    repository: w.repository,
    branch: w.branch,
    changes: {
      modified: w.workspace.modified,
      staged: w.workspace.staged,
      deleted: w.workspace.deleted,
      renamed: w.workspace.renamed,
      untracked: w.workspace.untracked,
    },
    clean: w.workspace.clean,
    ...(w.files ? { files: w.files.map(fileMeta), filesTruncated: w.filesTruncated === true } : {}),
    ...(w.commits ? { commits: w.commits.recent.map(commitMeta) } : {}),
    ...(w.branches && w.branches.length ? { branches: w.branches } : {}),
    ...(typeof w.stashCount === 'number' && w.stashCount > 0 ? { stashCount: w.stashCount } : {}),
    ...(typeof w.additionsTotal === 'number' ? { additionsTotal: w.additionsTotal } : {}),
    ...(typeof w.deletionsTotal === 'number' ? { deletionsTotal: w.deletionsTotal } : {}),
    ...(w.comparison ? { comparison: w.comparison } : {}),
    pullRequest: w.pullRequest,
    ci: w.ci ? { status: w.ci.status, checks: w.ci.checks.map(checkMeta) } : null,
  }
}

export function toStatusMeta(s: {
  branch: { name: string | null; upstream: string | null; ahead: number; behind: number }
  files: GitFile[]
}): StatusMeta {
  return {
    branch: s.branch,
    files: s.files.map(fileMeta),
  }
}

export function toDiffMeta(d: { files: DiffFile[] }): DiffMeta {
  const files = d.files.map(diffFileMeta)
  const additions = files.reduce((s, f) => s + f.additions, 0)
  const deletions = files.reduce((s, f) => s + f.deletions, 0)
  return { stats: { files: files.length, additions, deletions }, files }
}

export function toCommitsMeta(c: { commits: CommitSummary[] }): {
  commits: CommitMeta[]
} {
  return { commits: c.commits.map(commitMeta) }
}

export function toShowMeta(s: {
  commit: { sha: string; shortSha: string; message: string; author: string; date: string }
  files: Array<{
    path: string
    status: string
    additions: number
    deletions: number
  }>
}): ShowMeta {
  return {
    commit: s.commit,
    files: s.files.map((f) => ({
      path: f.path,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    })),
  }
}

export function toCompareMeta(c: {
  base: string
  head: string
  ahead: number
  behind: number
  stats: { files: number; additions: number; deletions: number }
}): CompareMeta {
  return {
    base: c.base,
    head: c.head,
    ahead: c.ahead,
    behind: c.behind,
    stats: c.stats,
  }
}

export function toPrMeta(p: { pullRequests: PullRequest[] }): PrMeta {
  return {
    pullRequests: p.pullRequests.map((x) => ({
      number: x.number,
      title: x.title,
      state: x.state,
      draft: x.draft,
      url: x.url,
    })),
  }
}

export function toCiMeta(c: { status: string; checks: CheckRun[] }): CiMeta {
  return { status: c.status, checks: c.checks.map(checkMeta) }
}

export function toIssueMeta(i: {
  issue?: { number: number; title: string; state: string } | null
}): IssueMeta {
  return { issue: i.issue ?? null }
}

export function stripError(v: Record<string, unknown>): JsonValue {
  if ('error' in v) return { error: v.error as JsonValue }
  return v as JsonValue
}
import type {
  GitFile,
  CommitSummary,
  DiffFile,
  Hunk,
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
  sampledAt?: string
  repository: { name: string; root: string; remote: string | null }
  branch: { name: string | null; upstream: string | null; ahead: number; behind: number }
  changes: { modified: number; staged: number; deleted: number; renamed: number; untracked: number }
  clean: boolean
  files?: FileMeta[]
  filesTruncated?: boolean
  commits?: CommitMeta[]
  commitsAhead?: number
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
    updatedAt?: string | null
    comments?: WorkspaceCommentMeta[]
  } | null
  ci: { status: string; checks: CheckMeta[] } | null
}

export interface StatusMeta {
  branch: { name: string | null; upstream: string | null; ahead: number; behind: number }
  files: FileMeta[]
}

export interface HunkMeta {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export type DiffOmittedReason = 'size' | 'binary'

export interface FileMeta {
  path: string
  oldPath: string | null
  status: string
  staged: boolean
  additions?: number
  deletions?: number
  hunks?: HunkMeta[]
  diffOmitted?: DiffOmittedReason
}

export interface DiffFileMeta {
  path: string
  oldPath: string | null
  status: string
  binary: boolean
  additions: number
  deletions: number
  hunks?: HunkMeta[]
  diffOmitted?: DiffOmittedReason | null
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

export interface PrCreateMeta {
  created: {
    number: number
    title: string | null
    url: string
    base: string
    head: string
    draft: boolean
  }
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

const MAX_META_HUNKS_PER_FILE = 30
const MAX_META_HUNK_LINES = 400

function hunksMeta(hunks: Hunk[] | undefined, binary: boolean): Pick<FileMeta, 'hunks' | 'diffOmitted'> {
  if (binary) return { diffOmitted: 'binary' }
  const list = Array.isArray(hunks) ? hunks : []
  const bounded = list.slice(0, MAX_META_HUNKS_PER_FILE).map((h) => ({
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    lines: h.lines.slice(0, MAX_META_HUNK_LINES),
  }))
  if (bounded.length === 0) return {}
  if (list.length > MAX_META_HUNKS_PER_FILE) return { hunks: bounded, diffOmitted: 'size' as const }
  return { hunks: bounded }
}

function fileMeta(f: GitFile): FileMeta {
  const base: FileMeta = {
    path: f.path,
    oldPath: f.oldPath ?? null,
    status: f.status,
    staged: f.staged,
  }
  const extra = f as { additions?: unknown; deletions?: unknown; hunks?: Hunk[]; diffOmitted?: DiffOmittedReason }
  if (typeof extra.additions === 'number') {
    return {
      ...base,
      additions: extra.additions,
      deletions: extra.deletions as number,
      ...(extra.hunks || extra.diffOmitted ? hunksMeta(extra.hunks, false) : {}),
      ...(extra.diffOmitted ? { diffOmitted: extra.diffOmitted } : {}),
    }
  }
  return base
}

function diffFileMeta(f: DiffFile): DiffFileMeta {
  const binary = f.binary ?? false
  return {
    path: f.path,
    oldPath: f.oldPath,
    status: f.status,
    binary,
    additions: f.additions,
    deletions: f.deletions,
    ...hunksMeta(f.hunks, binary),
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
  diffs?: Array<GitFile & { additions?: number; deletions?: number }>
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
    updatedAt?: string | null
    comments?: WorkspaceCommentMeta[]
  } | null
  ci: { status: string; checks: CheckRun[] } | null
}): WorkspaceMeta {
  const diffIndex = new Map<string, GitFile & { additions?: number; deletions?: number }>()
  if (Array.isArray(w.diffs)) {
    for (const d of w.diffs) diffIndex.set(d.path, d)
  }
  return {
    sampledAt: new Date().toISOString(),
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
    ...(w.files
      ? {
          files: w.files.map((f) => {
            const meta = fileMeta(f)
            const d = diffIndex.get(f.path) ?? (f.oldPath ? diffIndex.get(f.oldPath) : undefined)
            if (!d || meta.hunks || meta.diffOmitted) return meta
            const merged = fileMeta(d)
            return merged.hunks || merged.diffOmitted ? { ...meta, ...merged, staged: meta.staged } : meta
          }),
          filesTruncated: w.filesTruncated === true,
        }
      : {}),
    ...(w.commits ? { commits: w.commits.recent.map(commitMeta), commitsAhead: w.commits.ahead } : {}),
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

export function toPrCreateMeta(p: {
  number: number
  title: string | null
  url: string
  base: string
  head: string
  draft: boolean
}): PrCreateMeta {
  return {
    created: {
      number: p.number,
      title: p.title,
      url: p.url,
      base: p.base,
      head: p.head,
      draft: p.draft,
    },
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

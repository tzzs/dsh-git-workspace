import { repository, getGitHubRemote } from '../git/repository.js'
import { gitStatus } from '../git/status.js'
import { githubPr } from '../github/pr.js'
import { gitCommits } from '../git/commits.js'
import { gitCompare } from '../git/compare.js'
import { githubCi } from '../github/ci.js'
import { gitBranches } from '../git/branches.js'
import { gitStash } from '../git/stash.js'
import { githubPrComments } from '../github/pr_comments.js'
import { command } from '../git/exec.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Result, CommitSummary, GitFile, Hunk, DiffFile } from '../types.js'

export type WorkspaceFile = GitFile & {
  additions?: number
  deletions?: number
  hunks?: Hunk[]
  diffOmitted?: 'size' | 'binary'
}

const MAX_INLINE_DIFF_BYTES = 64 * 1024
const MAX_INLINE_HUNKS_PER_FILE = 30
const MAX_INLINE_LINES = 200
const MAX_UNTRACKED_PREVIEW_LINES = 200
const COMMITS_SAMPLE_LIMIT = 30
const MAX_COMPARISON_FILES = 200

function parseHunks(patch: string): Hunk[] {
  const lines = patch.split('\n')
  const hunks: Hunk[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (!m) continue
    const h: Hunk = {
      oldStart: +m[1],
      oldLines: +(m[2] ?? 1),
      newStart: +m[3],
      newLines: +(m[4] ?? 1),
      lines: [],
    }
    for (i++; i < lines.length && !lines[i].startsWith('@@ '); i++) {
      const l = lines[i]
      if (l[0] === ' ' || l[0] === '+' || l[0] === '-') h.lines.push(l)
    }
    hunks.push(h)
    i--
  }
  return hunks
}

function isBinaryPatch(chunk: string): boolean {
  return /^Binary files /m.test(chunk) || /^GIT binary patch/m.test(chunk)
}

async function collectDiffs(root: string): Promise<Map<string, DiffFile>> {
  const out = new Map<string, DiffFile>()
  try {
    const [unstaged, staged] = await Promise.all([
      command('git', ['-c', 'core.quotePath=false', 'diff', '--no-color', '--unified=3'], root).catch(() => null),
      command('git', ['-c', 'core.quotePath=false', 'diff', '--cached', '--no-color', '--unified=3'], root).catch(() => null),
    ])
    for (const run of [unstaged, staged]) {
      if (!run) continue
      for (const chunk of run.stdout.split(/^diff --git /m)) {
        if (!chunk) continue
        const header = chunk.split('\n')[0] || ''
        const ms = header.match(/a\/(.*?) b\/(.*)$/)
        if (!ms) continue
        const path = ms[2]
        const renamed = chunk.match(/^rename from (.+)$/m)
        const copied = chunk.match(/^copy from (.+)$/m)
        const newFile = /^new file mode/m.test(chunk)
        const deletedFile = /^deleted file mode/m.test(chunk)
        const binary = isBinaryPatch(chunk)
        let status = 'modified'
        let oldPath: string | null = ms[1]
        if (renamed) {
          status = 'renamed'
          oldPath = renamed[1].trim()
        } else if (copied) {
          status = 'copied'
          oldPath = copied[1].trim()
        } else if (newFile) {
          status = 'added'
          oldPath = null
        } else if (deletedFile) {
          status = 'deleted'
        }
        const additions = (chunk.match(/^\+(?!\+\+)/gm) || []).length
        const deletions = (chunk.match(/^-(?!--)/gm) || []).length
        const existing = out.get(path)
        const hunks = binary ? [] : parseHunks(chunk)
        if (existing) {
          existing.hunks.push(...hunks)
          existing.additions += additions
          existing.deletions += deletions
          if (!existing.oldPath && oldPath) existing.oldPath = oldPath
        } else {
          out.set(path, { path, oldPath, status, binary, additions, deletions, hunks })
        }
      }
    }
  } catch {
    return out
  }
  return out
}

async function synthesizeUntracked(root: string, paths: string[]): Promise<DiffFile[]> {
  const files: DiffFile[] = []
  for (const path of paths.slice(0, 20)) {
    try {
      const text = await readFile(join(root, ...path.split('/')), 'utf8')
      const lines = text.split('\n')
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
      if (lines.some((l) => l.includes('\0'))) continue
      const preview = lines.slice(0, MAX_UNTRACKED_PREVIEW_LINES)
      files.push({
        path,
        oldPath: null,
        status: 'added',
        binary: false,
        additions: lines.length,
        deletions: 0,
        hunks: [
          {
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: preview.length,
            lines: preview.map((l) => '+' + l),
          },
        ],
      })
    } catch {
      /* unreadable or too large — skip */
    }
  }
  return files
}

function budgetDiffs(files: Iterable<DiffFile>): WorkspaceFile[] {
  const out: WorkspaceFile[] = []
  let bytes = 0
  for (const f of files) {
    const base: WorkspaceFile = {
      path: f.path,
      oldPath: f.oldPath ?? null,
      status: f.status as GitFile['status'],
      staged: false,
      additions: f.additions,
      deletions: f.deletions,
    }
    if (f.binary) {
      base.diffOmitted = 'binary'
      out.push(base)
      continue
    }
    const hunks = (f.hunks ?? []).slice(0, MAX_INLINE_HUNKS_PER_FILE).map((h) => ({
      oldStart: h.oldStart,
      oldLines: h.oldLines,
      newStart: h.newStart,
      newLines: h.newLines,
      lines: h.lines.slice(0, MAX_INLINE_LINES),
    }))
    const size = hunks.reduce((n, h) => n + h.lines.join('').length + 40, 100)
    if (bytes + size > MAX_INLINE_DIFF_BYTES) continue
    bytes += size
    out.push({ ...base, hunks })
  }
  return out
}

export interface WorkspaceComment {
  id: string
  author: string
  body: string
  path: string | null
  line: number | null
  resolved: boolean
  createdAt: string | null
  url: string | null
}

export interface WorkspaceResult {
  repository: {
    root: string
    name: string
    remote: string | null
    github?: { host: string; owner: string; name: string } | null
  }
  branch: {
    name: string | null
    upstream: string | null
    ahead: number
    behind: number
  }
  changes: {
    modified: number
    staged: number
    deleted: number
    renamed: number
    untracked: number
  }
  workspace: {
    clean: boolean
    modified: number
    staged: number
    deleted: number
    renamed: number
    untracked: number
  }
  comparison: {
    base: string | null
    ahead: number
    behind: number
    files?: Array<{
      path: string
      oldPath: string | null
      status: GitFile['status']
      staged: boolean
      additions?: number
      deletions?: number
      diffOmitted?: 'binary'
    }>
    filesTruncated?: boolean
  }
  commits: {
    ahead: number
    recent: CommitSummary[]
  }
  files: WorkspaceFile[]
  diffs?: WorkspaceFile[]
  filesTruncated: boolean
  branches: Array<{ name: string; current: boolean; upstream: string | null; ahead: number; behind: number }>
  stashCount: number
  additionsTotal: number
  deletionsTotal: number
  pullRequest: {
    number: number
    title: string
    state: string
    draft: boolean
    merged: boolean
    url: string
    updatedAt?: string | null
    comments?: WorkspaceComment[]
  } | null
  ci?: {
    status: string
    checks: Array<{ name: string; status: string; conclusion: string | null }>
  } | null
}

function parseNumstat(stdout: string) {
  const map = new Map()
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const idx1 = line.indexOf('\t')
    const idx2 = line.indexOf('\t', idx1 + 1)
    if (idx1 === -1 || idx2 === -1) continue
    const path = line.slice(idx2 + 1).trim()
    const additions = line.slice(0, idx1)
    const deletions = line.slice(idx1 + 1, idx2)
    map.set(path, {
      additions: additions === '-' ? 0 : Number(additions) || 0,
      deletions: deletions === '-' ? 0 : Number(deletions) || 0,
    })
  }
  return map
}

async function fileNumstats(root: string) {
  const [unstagedOut, stagedOut] = await Promise.all([
    command('git', ['-c', 'core.quotePath=false', 'diff', '--no-renames', '--numstat'], root).catch(() => null),
    command('git', ['-c', 'core.quotePath=false', 'diff', '--cached', '--no-renames', '--numstat'], root).catch(() => null),
  ])
  return {
    unstaged: unstagedOut ? parseNumstat(unstagedOut.stdout) : new Map(),
    staged: stagedOut ? parseNumstat(stagedOut.stdout) : new Map(),
  }
}

export async function gitWorkspace(
  cwd = process.cwd(),
): Promise<Result<WorkspaceResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r

  const [s, commits, pr, ci, branches, stash] = await Promise.all([
    gitStatus(r.root),
    gitCommits({ limit: COMMITS_SAMPLE_LIMIT }, r.root),
    githubPr(r.root),
    githubCi({}, r.root),
    gitBranches(r.root),
    gitStash(r.root),
  ])

  if ('error' in s) return s

  const currentBranch = s.branch.name
  let comparison: WorkspaceResult['comparison'] = {
    base: null,
    ahead: s.branch.ahead,
    behind: s.branch.behind,
  }

  // Prefer the branch's own remote-tracking ref (already fetched, always
  // current) as the diff base; fall back to main/master only when the
  // branch has never been pushed.
  const compareBase =
    s.branch.upstream ??
    (currentBranch && currentBranch !== 'main' && currentBranch !== 'master' ? 'main' : null)

  if (compareBase && currentBranch && compareBase !== currentBranch) {
    const cmp = await gitCompare({ base: compareBase, head: currentBranch }, r.root)
    if (!('error' in cmp)) {
      comparison = {
        base: compareBase,
        ahead: s.branch.upstream === compareBase ? s.branch.ahead : cmp.ahead,
        behind: s.branch.upstream === compareBase ? s.branch.behind : cmp.behind,
        files: cmp.files.slice(0, MAX_COMPARISON_FILES).map((f) => ({
          path: f.path,
          oldPath: f.oldPath,
          status: f.status as GitFile['status'],
          staged: false,
          additions: f.additions,
          deletions: f.deletions,
          ...(f.binary ? { diffOmitted: 'binary' as const } : {}),
        })),
        ...(cmp.files.length > MAX_COMPARISON_FILES ? { filesTruncated: true } : {}),
      }
    }
  }

  const github = getGitHubRemote(r.remote)

  const pullRequest =
    !('error' in pr) && pr.pullRequests.length > 0
      ? {
          number: pr.pullRequests[0].number,
          title: pr.pullRequests[0].title,
          state: pr.pullRequests[0].state,
          draft: pr.pullRequests[0].draft,
          merged: pr.pullRequests[0].merged,
          url: pr.pullRequests[0].url,
          updatedAt: pr.pullRequests[0].updatedAt ?? null,
        }
      : null

  const [numstat, trackedDiffs] = await Promise.all([fileNumstats(r.root), collectDiffs(r.root)])
  const untrackedPaths = s.files
    .filter((f) => f.status === 'untracked' && !trackedDiffs.has(f.path))
    .map((f) => f.path)
  const synthesized = await synthesizeUntracked(r.root, untrackedPaths)
  for (const u of synthesized) trackedDiffs.set(u.path, u)
  const inline = budgetDiffs(trackedDiffs.values())
  const inlineByPath = new Map(inline.map((f) => [f.path, f]))
  const files: WorkspaceFile[] = s.files.slice(0, 200).map((f) => {
    const st = f.staged ? (numstat.staged.get(f.path) ?? numstat.unstaged.get(f.path)) : numstat.unstaged.get(f.path)
    const base: WorkspaceFile = st ? { ...f, additions: st.additions, deletions: st.deletions } : { ...f }
    const d =
      inlineByPath.get(f.path) ??
      (f.oldPath && inlineByPath.has(f.oldPath) ? inlineByPath.get(f.oldPath) : undefined)
    if (!d || base.hunks || base.diffOmitted) return base
    if (d.hunks || d.diffOmitted) return { ...base, hunks: d.hunks, diffOmitted: d.diffOmitted }
    return base
  })
  const additionsTotal = files.reduce((n, f) => n + (f.additions ?? 0), 0)
  const deletionsTotal = files.reduce((n, f) => n + (f.deletions ?? 0), 0)

  let pullRequestFull: WorkspaceResult['pullRequest'] = pullRequest
  if (pullRequest) {
    const comments = await githubPrComments({ number: pullRequest.number }, r.root)
    if (!('error' in comments)) {
      pullRequestFull = {
        ...pullRequest,
        comments: comments.comments.slice(0, 20).map((c) => ({
          id: c.id,
          author: c.author,
          body: c.body.length > 240 ? c.body.slice(0, 240) + '…' : c.body,
          path: c.path,
          line: c.line,
          resolved: c.resolved === true,
          createdAt: c.createdAt,
          url: c.url,
        })),
      }
    }
  }

  const workspaceCounts = {
    modified: s.files.filter((x) => x.status === 'modified').length,
    staged: s.files.filter((x) => x.staged).length,
    deleted: s.files.filter((x) => x.status === 'deleted').length,
    renamed: s.files.filter((x) => x.status === 'renamed').length,
    untracked: s.files.filter((x) => x.status === 'untracked').length,
  }

  return {
    repository: {
      root: r.root,
      name: r.name,
      remote: r.remote,
      ...(github ? { github } : {}),
    },
    branch: s.branch,
    changes: workspaceCounts,
    workspace: {
      clean: s.files.length === 0,
      ...workspaceCounts,
    },
    comparison,
    commits: {
      ahead: s.branch.ahead,
      recent: !('error' in commits) ? commits.commits : [],
    },
    files,
    ...(inline.length ? { diffs: inline } : {}),
    filesTruncated: s.files.length > 200,
    branches:
      !('error' in branches)
        ? branches.branches.map((b) => ({
            name: b.name,
            current: b.current,
            upstream: b.upstream,
            ahead: b.ahead,
            behind: b.behind,
          }))
        : [],
    stashCount: !('error' in stash) ? stash.stashes.length : 0,
    additionsTotal,
    deletionsTotal,
    pullRequest: pullRequestFull,
    ...(!('error' in ci)
      ? {
          ci: {
            status: ci.status,
            checks: ci.checks.map((c) => ({
              name: c.name,
              status: c.status,
              conclusion: c.conclusion,
            })),
          },
        }
      : {}),
  }
}

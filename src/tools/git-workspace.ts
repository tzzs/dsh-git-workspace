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
import type { Result, CommitSummary, GitFile } from '../types.js'

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
  }
  commits: {
    ahead: number
    recent: CommitSummary[]
  }
  files: Array<GitFile & { additions?: number; deletions?: number }>
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
    url: string
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
    command('git', ['diff', '--numstat'], root).catch(() => null),
    command('git', ['diff', '--cached', '--numstat'], root).catch(() => null),
  ])
  return {
    unstaged: unstagedOut ? parseNumstat(unstagedOut.stdout) : new Map(),
    staged: stagedOut ? parseNumstat(stagedOut.stdout) : new Map(),
  }
}

export async function gitWorkspace(
  cwd = process.cwd(),
): Promise<Result<WorkspaceResult>> {  const r = await repository(cwd)
  if ('error' in r) return r

  const [s, commits, pr, ci, branches, stash] = await Promise.all([
    gitStatus(r.root),
    gitCommits({ limit: 10 }, r.root),
    githubPr(r.root),
    githubCi({}, r.root),
    gitBranches(r.root),
    gitStash(r.root),
  ])

  if ('error' in s) return s

  const currentBranch = s.branch.name
  let comparison: { base: string | null; ahead: number; behind: number } = {
    base: null,
    ahead: s.branch.ahead,
    behind: s.branch.behind,
  }

  if (currentBranch && currentBranch !== 'main' && currentBranch !== 'master') {
    const cmp = await gitCompare({ base: 'main', head: currentBranch }, r.root)
    if (!('error' in cmp)) {
      comparison = { base: 'main', ahead: cmp.ahead, behind: cmp.behind }
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
          url: pr.pullRequests[0].url,
        }
      : null

  const numstat = await fileNumstats(r.root)
  const files: Array<GitFile & { additions?: number; deletions?: number }> = s.files.slice(0, 200).map((f) => {
    const st = f.staged ? (numstat.staged.get(f.path) ?? numstat.unstaged.get(f.path)) : numstat.unstaged.get(f.path)
    if (!st) return f
    return { ...f, additions: st.additions, deletions: st.deletions }
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

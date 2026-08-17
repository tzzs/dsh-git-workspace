import { repository, getGitHubRemote } from '../git/repository.js'
import { gitStatus } from '../git/status.js'
import { githubPr } from '../github/pr.js'
import { gitCommits } from '../git/commits.js'
import { gitCompare } from '../git/compare.js'
import { githubCi } from '../github/ci.js'
import type { Result, CommitSummary } from '../types.js'

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
  pullRequest: {
    number: number
    title: string
    state: string
    draft: boolean
    url: string
  } | null
  ci?: {
    status: string
    checks: Array<{ name: string; status: string; conclusion: string | null }>
  } | null
}

export async function gitWorkspace(
  cwd = process.cwd(),
): Promise<Result<WorkspaceResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r

  const [s, commits, pr, ci] = await Promise.all([
    gitStatus(r.root),
    gitCommits({ limit: 1 }, r.root),
    githubPr(r.root),
    githubCi({}, r.root),
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
    pullRequest,
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

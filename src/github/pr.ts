import { command } from '../git/exec.js'
import { error } from '../git/repository.js'
import { githubContext, ghJson, repoArg } from './client.js'
import type { Result, PullRequest } from '../types.js'

interface PrRow {
  number: number
  title: string
  body?: string | null
  state: string
  isDraft: boolean
  author?: { login: string } | null
  baseRefName: string
  headRefName: string
  url: string
  createdAt?: string | null
  updatedAt?: string | null
  files?: { totalCount: number } | null
  additions?: number | null
  deletions?: number | null
  reviewDecision?: string | null
  mergeable?: string | null
}

export interface PrResult {
  repository: { owner: string; name: string }
  branch: string | null
  pullRequests: PullRequest[]
}

function mapPr(x: PrRow): PullRequest {
  return {
    number: x.number,
    title: x.title,
    body: x.body ?? null,
    state: x.state,
    draft: x.isDraft,
    author: x.author?.login ?? null,
    base: x.baseRefName,
    head: x.headRefName,
    url: x.url,
    createdAt: x.createdAt ?? null,
    updatedAt: x.updatedAt ?? null,
    stats: {
      files: x.files?.totalCount ?? 0,
      additions: x.additions ?? 0,
      deletions: x.deletions ?? 0,
    },
    reviewDecision: x.reviewDecision ?? null,
    mergeable: x.mergeable ?? null,
    // `gh pr list --json` has no `merged` field (only `pr view`/`pr merge`
    // do) — asking for it makes gh reject the whole call. `state` is the
    // GraphQL PullRequestState enum (OPEN/CLOSED/MERGED), so it already
    // carries this.
    merged: x.state === 'MERGED',
  }
}

export async function githubPr(
  cwd = process.cwd(),
): Promise<Result<PrResult>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  let branch: string | null = null
  try {
    branch =
      (await command('git', ['branch', '--show-current'], ctx.root)).stdout
        .trim() || null
  } catch {
    branch = null
  }

  const repo = repoArg(ctx)
  const baseArgs = [
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'all',
    '--json',
    [
      'number',
      'title',
      'body',
      'state',
      'isDraft',
      'author',
      'baseRefName',
      'headRefName',
      'url',
      'createdAt',
      'updatedAt',
      'additions',
      'deletions',
      'reviewDecision',
      'mergeable',
    ].join(','),
  ]

  if (branch) {
    const r = await ghJson<PrRow[]>(
      ctx,
      [...baseArgs, '--head', branch],
      {
        code: 'GITHUB_QUERY_FAILED',
        message: 'Unable to query GitHub pull requests for the current branch.',
        hint: 'Verify gh authentication and that the branch has an open PR.',
      },
    )
    if ('error' in r) return r
    return {
      repository: { owner: ctx.owner, name: ctx.name },
      branch,
      pullRequests: r.map(mapPr),
    }
  }

  const r = await ghJson<PrRow[]>(ctx, baseArgs, {
    code: 'GITHUB_QUERY_FAILED',
    message: 'Unable to query GitHub pull requests.',
    hint: 'Verify gh authentication.',
  })
  if ('error' in r) return r
  return {
    repository: { owner: ctx.owner, name: ctx.name },
    branch: null,
    pullRequests: r.map(mapPr),
  }
}

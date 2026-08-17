import { githubContext, ghJson, repoArg } from './client.js'
import { error } from '../git/repository.js'
import { isInteger } from '../git/safety.js'
import type { Result, ReviewComment } from '../types.js'

interface Thread {
  id: string
  isResolved: boolean
  isOutdated: boolean
  comments: Array<{
    id: string
    author?: { login: string } | null
    body: string
    path?: string | null
    line?: number | null
    side?: string | null
    commit?: string | null
    createdAt?: string | null
    updatedAt?: string | null
    url?: string | null
  }>
}

interface IssueCommentRow {
  id: string
  author?: { login: string } | null
  body: string
  createdAt?: string | null
  updatedAt?: string | null
  url?: string | null
}

export interface PrCommentsResult {
  pullRequest: number
  comments: ReviewComment[]
}

export async function githubPrComments(
  input: { number?: number } = {},
  cwd = process.cwd(),
): Promise<Result<PrCommentsResult>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  if (input.number === undefined || !isInteger(input.number) || input.number <= 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'A positive integer pull request number is required.',
    )
  }

  const repo = repoArg(ctx)
  const view = await ghJson<{
    comments?: IssueCommentRow[]
    reviewThreads?: Thread[]
  }>(
    ctx,
    [
      'pr',
      'view',
      String(input.number),
      '--repo',
      repo,
      '--json',
      'comments,reviewThreads',
    ],
    {
      code: 'GITHUB_QUERY_FAILED',
      message: 'Unable to read pull request comments.',
      hint: 'Verify the PR number and gh authentication.',
    },
  )
  if ('error' in view) return view

  const comments: ReviewComment[] = []

  for (const row of view.comments ?? []) {
    comments.push({
      id: String(row.id),
      author: row.author?.login ?? '',
      body: row.body,
      path: null,
      line: null,
      side: null,
      commit: null,
      createdAt: row.createdAt ?? null,
      updatedAt: row.updatedAt ?? null,
      resolved: false,
      url: row.url ?? null,
    })
  }

  for (const thread of view.reviewThreads ?? []) {
    for (const c of thread.comments) {
      comments.push({
        id: String(c.id),
        author: c.author?.login ?? '',
        body: c.body,
        path: c.path ?? null,
        line: c.line ?? null,
        side: c.side ?? null,
        commit: c.commit ?? null,
        createdAt: c.createdAt ?? null,
        updatedAt: c.updatedAt ?? null,
        resolved: thread.isResolved,
        url: c.url ?? null,
      })
    }
  }

  comments.sort((a, b) => {
    const da = a.createdAt ?? ''
    const db = b.createdAt ?? ''
    return da.localeCompare(db)
  })

  return { pullRequest: input.number, comments }
}

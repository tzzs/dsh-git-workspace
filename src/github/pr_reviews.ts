import { githubContext, ghJson, repoArg } from './client.js'
import { error } from '../git/repository.js'
import { isInteger } from '../git/safety.js'
import type { Result, Review } from '../types.js'

interface ReviewRow {
  id: string
  author?: { login: string } | null
  state: string
  body?: string | null
  submittedAt?: string | null
}

export async function githubPrReviews(
  input: { number?: number } = {},
  cwd = process.cwd(),
): Promise<Result<{ pullRequest: number; reviews: Review[] }>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  if (input.number === undefined || !isInteger(input.number) || input.number <= 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'A positive integer pull request number is required.',
    )
  }

  const r = await ghJson<ReviewRow[]>(
    ctx,
    [
      'pr',
      'view',
      String(input.number),
      '--repo',
      repoArg(ctx),
      '--json',
      'reviews',
      '--jq',
      '.reviews',
    ],
    {
      code: 'GITHUB_QUERY_FAILED',
      message: 'Unable to read pull request reviews.',
      hint: 'Verify the PR number and gh authentication.',
    },
  )
  if ('error' in r) return r

  const reviews: Review[] = (r as unknown as ReviewRow[]).map((x) => ({
    id: String(x.id),
    author: x.author?.login ?? '',
    state: x.state ?? 'PENDING',
    body: x.body ?? null,
    submittedAt: x.submittedAt ?? null,
  }))

  return { pullRequest: input.number, reviews }
}

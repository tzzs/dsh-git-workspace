import { githubContext, ghJson, repoArg } from './client.js'
import { error } from '../git/repository.js'
import { isInteger } from '../git/safety.js'
import type { Result, IssueComment } from '../types.js'

interface IssueCommentRow {
  id: string
  author?: { login: string } | null
  body: string
  createdAt?: string | null
  updatedAt?: string | null
  url?: string | null
}

export async function githubIssueComments(
  input: { number?: number } = {},
  cwd = process.cwd(),
): Promise<Result<{ issue: number; comments: IssueComment[] }>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  if (input.number === undefined || !isInteger(input.number) || input.number <= 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'A positive integer issue number is required.',
    )
  }

  const r = await ghJson<IssueCommentRow[]>(
    ctx,
    [
      'issue',
      'view',
      String(input.number),
      '--repo',
      repoArg(ctx),
      '--json',
      'comments',
      '--jq',
      '.comments',
    ],
    {
      code: 'GITHUB_QUERY_FAILED',
      message: 'Unable to read issue comments.',
      hint: 'Verify the issue number and gh authentication.',
    },
  )
  if ('error' in r) return r

  const comments: IssueComment[] = (r as unknown as IssueCommentRow[]).map(
    (x) => ({
      id: String(x.id),
      author: x.author?.login ?? '',
      body: x.body,
      createdAt: x.createdAt ?? null,
      updatedAt: x.updatedAt ?? null,
      url: x.url ?? null,
    }),
  )

  comments.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))

  return { issue: input.number, comments }
}

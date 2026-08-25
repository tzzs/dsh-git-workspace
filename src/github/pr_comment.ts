import { githubContext, gh, repoArg } from './client.js'
import { error } from '../git/repository.js'
import { ghError, isInteger, hasNul } from '../git/safety.js'
import type { Result } from '../types.js'

export interface PrCommentOptions {
  number: number
  body: string
}

export interface PrCommentResult {
  number: number
  url: string | null
  body: string
}

export async function githubPrComment(
  input: PrCommentOptions,
  cwd = process.cwd(),
): Promise<Result<PrCommentResult>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  if (!isInteger(input.number) || input.number <= 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'A positive integer pull request number is required.',
    )
  }
  const body = typeof input.body === 'string' ? input.body : ''
  if (!body.trim() || hasNul(body)) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Body must be a non-empty string without NUL bytes.',
    )
  }

  try {
    const out = await gh(ctx, [
      'pr',
      'comment',
      '--repo',
      repoArg(ctx),
      String(input.number),
      '--body',
      body.trim(),
    ])
    const text = out.stdout.trim()
    const url = text.startsWith('http') ? text : null
    return { number: input.number, url, body: body.trim() }
  } catch (e) {
    return ghError(e, {
      code: 'GITHUB_PR_COMMENT_FAILED',
      message: 'Unable to add the pull request comment.',
      hint: 'Verify the PR exists and your account can comment on it.',
    })
  }
}

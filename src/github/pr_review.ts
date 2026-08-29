import { githubContext, gh, repoArg } from './client.js'
import { error } from '../git/repository.js'
import { ghError, isInteger, hasNul } from '../git/safety.js'
import type { Result } from '../types.js'

export interface PrReviewOptions {
  number: number
  state?: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'
  body?: string
}

export interface PrReviewResult {
  number: number
  state: string
  url: string | null
}

function stateFlag(state: string): string {
  if (state === 'APPROVE') return '--approve'
  if (state === 'REQUEST_CHANGES') return '--request-changes'
  return '--comment'
}

export async function githubPrReview(
  input: PrReviewOptions,
  cwd = process.cwd(),
): Promise<Result<PrReviewResult>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  if (!isInteger(input.number) || input.number <= 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'A positive integer pull request number is required.',
    )
  }
  const state = input.state === undefined ? 'COMMENT' : input.state
  if (state !== 'APPROVE' && state !== 'REQUEST_CHANGES' && state !== 'COMMENT') {
    return error(
      'INVALID_GIT_ARGUMENT',
      'state must be one of APPROVE, REQUEST_CHANGES, COMMENT.',
    )
  }
  const body = typeof input.body === 'string' ? input.body : undefined
  if (body !== undefined && hasNul(body)) {
    return error('INVALID_GIT_ARGUMENT', 'Body contains a NUL byte.')
  }
  const trimmedBody = body?.trim() ?? ''
  if (state === 'REQUEST_CHANGES' && !trimmedBody) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'A body is required when requesting changes on a pull request review.',
    )
  }

  try {
    await gh(ctx, [
      'pr',
      'review',
      '--repo',
      repoArg(ctx),
      String(input.number),
      stateFlag(state),
      ...(trimmedBody ? ['--body', trimmedBody] : []),
    ])
  } catch (e) {
    return ghError(e, {
      code: 'GITHUB_PR_REVIEW_FAILED',
      message: 'Unable to submit the pull request review.',
      hint: 'Verify the PR is open and you are eligible to review it.',
    })
  }
  return { number: input.number, state, url: null }
}

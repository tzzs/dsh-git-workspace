import { githubContext, gh, repoArg } from './client.js'
import { error } from '../git/repository.js'
import { ghError, isInteger } from '../git/safety.js'
import type { Result } from '../types.js'

export interface PrCloseOptions {
  number: number
}

export interface PrCloseResult {
  number: number
  state: string
  url: string | null
}

interface ClosedPrJson {
  url?: string | null
  state?: string | null
}

export async function githubPrClose(
  input: PrCloseOptions,
  cwd = process.cwd(),
): Promise<Result<PrCloseResult>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  if (!isInteger(input.number) || input.number <= 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'A positive integer pull request number is required.',
    )
  }
  const number = input.number

  try {
    await gh(ctx, ['pr', 'close', '--repo', repoArg(ctx), String(number)])
  } catch (e) {
    return ghError(e, {
      code: 'GITHUB_PR_CLOSE_FAILED',
      message: 'Unable to close the pull request.',
      hint: 'Verify the PR is open and you have push access.',
    })
  }

  try {
    const out = await gh(ctx, [
      'pr',
      'view',
      '--repo',
      repoArg(ctx),
      String(number),
      '--json',
      'url,state',
    ])
    const info = JSON.parse(out.stdout.trim()) as ClosedPrJson
    return {
      number,
      state: info.state ?? 'CLOSED',
      url: typeof info.url === 'string' && info.url ? info.url : null,
    }
  } catch {
    return { number, state: 'CLOSED', url: null }
  }
}

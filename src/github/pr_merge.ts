import { githubContext, gh, repoArg } from './client.js'
import { error } from '../git/repository.js'
import { ghError, isInteger, isDangerousLeadingDash, hasNul } from '../git/safety.js'
import type { Result } from '../types.js'

export interface PrMergeOptions {
  number: number
  method?: 'merge' | 'squash' | 'rebase'
  deleteBranch?: boolean
  subject?: string
  body?: string
}

export interface PrMergeResult {
  number: number
  merged: boolean
  method: string
  branchDeleted: boolean
  url: string | null
}

interface MergedPrJson {
  url?: string | null
  merged?: boolean | null
}

const MERGE_METHODS = ['merge', 'squash', 'rebase']

function methodFlag(method: string): string {
  if (method === 'squash') return '--squash'
  if (method === 'rebase') return '--rebase'
  return '--merge'
}

export async function githubPrMerge(
  input: PrMergeOptions,
  cwd = process.cwd(),
): Promise<Result<PrMergeResult>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  if (!isInteger(input.number) || input.number <= 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'A positive integer pull request number is required.',
    )
  }
  const method = input.method === undefined ? 'merge' : input.method
  if (!MERGE_METHODS.includes(method)) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'method must be one of merge, squash, rebase.',
    )
  }
  if (input.deleteBranch !== undefined && typeof input.deleteBranch !== 'boolean') {
    return error('INVALID_GIT_ARGUMENT', 'deleteBranch must be a boolean.')
  }
  const subject = typeof input.subject === 'string' ? input.subject : undefined
  if (subject !== undefined && hasNul(subject)) {
    return error('INVALID_GIT_ARGUMENT', 'Subject contains a NUL byte.')
  }
  if (subject !== undefined && isDangerousLeadingDash(subject)) {
    return error('INVALID_GIT_ARGUMENT', 'Subject must not begin with `-`.')
  }
  const body = typeof input.body === 'string' ? input.body : undefined
  if (body !== undefined && hasNul(body)) {
    return error('INVALID_GIT_ARGUMENT', 'Body contains a NUL byte.')
  }

  const number = input.number
  const args = ['pr', 'merge', '--repo', repoArg(ctx), String(number), methodFlag(method)]
  if (input.deleteBranch) args.push('--delete-branch')
  if (subject !== undefined && subject.trim()) args.push('--subject', subject.trim())
  if (body !== undefined && body.trim()) args.push('--body', body.trim())

  try {
    await gh(ctx, args)
  } catch (e) {
    const err = e as { message?: unknown; stderr?: unknown }
    const text = `${String(err.message ?? '')}\n${String(err.stderr ?? '')}`
    if (/not mergeable/i.test(text)) {
      return error(
        'GITHUB_PR_NOT_MERGEABLE',
        'The pull request is not mergeable.',
        'Check the github_ci and github_pr_reviews tools first to inspect failing checks and unresolved reviews.',
      )
    }
    return ghError(e, {
      code: 'GITHUB_PR_MERGE_FAILED',
      message: 'Unable to merge the pull request.',
      hint: 'Verify the PR is open, mergeable, and you have push access.',
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
      'url,merged',
    ])
    const info = JSON.parse(out.stdout.trim()) as MergedPrJson
    return {
      number,
      merged: info.merged === true,
      method,
      branchDeleted: input.deleteBranch === true,
      url: typeof info.url === 'string' && info.url ? info.url : null,
    }
  } catch {
    return {
      number,
      merged: true,
      method,
      branchDeleted: input.deleteBranch === true,
      url: null,
    }
  }
}

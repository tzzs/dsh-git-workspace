import { command } from './exec.js'
import { repository, error } from './repository.js'
import { hasNul, isDangerousLeadingDash } from './safety.js'
import type { Result } from '../types.js'

export interface MergeOptions {
  branch: string
  message?: string
  squash?: boolean
  noFastForward?: boolean
}

export interface MergeResult {
  merged: boolean
  branch: string
  sha: string | null
  squash: boolean
  conflictedFiles: string[]
}

export async function gitMerge(
  input?: MergeOptions,
  cwd = process.cwd(),
): Promise<Result<MergeResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  const branch = input?.branch
  if (
    typeof branch !== 'string' ||
    !branch ||
    hasNul(branch) ||
    isDangerousLeadingDash(branch)
  ) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Branch must be a non-empty string without NUL bytes and must not begin with `-`.',
    )
  }
  const message = input?.message
  if (message !== undefined && (typeof message !== 'string' || hasNul(message))) {
    return error('INVALID_GIT_ARGUMENT', 'Message must be a string without NUL bytes.')
  }
  const squash = input?.squash === true
  const noFastForward = input?.noFastForward === true
  const args = ['merge']
  if (squash) args.push('--squash')
  if (noFastForward) args.push('--no-ff')
  if (!squash && message) args.push('-m', message)
  args.push(branch)
  if (squash && message) args.push('-m', message)
  try {
    await command('git', args, r.root)
  } catch (e) {
    let conflictedFiles: string[] = []
    try {
      const out = await command(
        'git',
        ['diff', '--name-only', '--diff-filter=U'],
        r.root,
      )
      conflictedFiles = out.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    } catch {
      conflictedFiles = []
    }
    if (conflictedFiles.length > 0) {
      return { merged: false, branch, sha: null, squash, conflictedFiles }
    }
    const stderr = String((e as { stderr?: unknown }).stderr ?? '')
    if (/would be overwritten|local changes/i.test(stderr)) {
      return error(
        'DIRTY_WORKTREE',
        'Merge would overwrite uncommitted local changes.',
        'Commit your changes with git_commit or stash them manually before merging.',
      )
    }
    if (/not something we can merge|did not match|unknown revision|not found/i.test(stderr)) {
      return error(
        'BRANCH_NOT_FOUND',
        `Branch \`${branch}\` was not found.`,
        'Run the git_branches tool to list available branches.',
      )
    }
    return error(
      'GIT_COMMAND_FAILED',
      `Unable to merge \`${branch}\`: ${stderr.trim().split('\n')[0].slice(0, 300) || 'unknown error'}`,
    )
  }
  let sha: string | null = null
  try {
    sha =
      (await command('git', ['rev-parse', '--short', 'HEAD'], r.root)).stdout.trim() ||
      null
  } catch {
    sha = null
  }
  return { merged: true, branch, sha, squash, conflictedFiles: [] }
}

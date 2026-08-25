import { command } from './exec.js'
import { repository, error } from './repository.js'
import { hasNul, isDangerousLeadingDash } from './safety.js'
import type { Result } from '../types.js'

export interface CheckoutOptions {
  branch: string
  create?: boolean
}

export interface CheckoutResult {
  branch: string
  created: boolean
  previous: string | null
}

async function currentBranch(root: string): Promise<string | null> {
  try {
    return (
      (await command('git', ['branch', '--show-current'], root)).stdout.trim() ||
      null
    )
  } catch {
    return null
  }
}

async function localBranchExists(root: string, name: string): Promise<boolean> {
  try {
    await command('git', ['show-ref', '--verify', '--quiet', `refs/heads/${name}`], root)
    return true
  } catch {
    return false
  }
}

async function refFormatInvalid(root: string, name: string): Promise<boolean> {
  try {
    await command('git', ['check-ref-format', '--branch', name], root)
    return false
  } catch {
    return true
  }
}

export async function gitCheckout(
  input?: CheckoutOptions,
  cwd = process.cwd(),
): Promise<Result<CheckoutResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  const branch = input?.branch
  if (
    typeof branch !== 'string' ||
    !branch ||
    hasNul(branch) ||
    isDangerousLeadingDash(branch) ||
    /\s/.test(branch)
  ) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Branch must be a non-empty string without whitespace or NUL bytes and must not begin with `-`.',
    )
  }
  if (await refFormatInvalid(r.root, branch)) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Invalid branch name.',
      'Use a name accepted by `git check-ref-format --branch`, e.g. feature/my-change.',
    )
  }
  const create = input?.create === true
  const previous = await currentBranch(r.root)
  if (create && (await localBranchExists(r.root, branch))) {
    return error(
      'BRANCH_ALREADY_EXISTS',
      `Branch \`${branch}\` already exists.`,
      'Omit create:true to switch to it instead.',
    )
  }
  try {
    await command(
      'git',
      create ? ['checkout', '-b', branch] : ['checkout', branch],
      r.root,
    )
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? '')
    if (/would be overwritten|local changes/i.test(stderr)) {
      return error(
        'DIRTY_WORKTREE',
        'Checkout would overwrite uncommitted local changes.',
        'Commit your changes with git_commit or stash them manually before switching branches.',
      )
    }
    if (/already exists/i.test(stderr)) {
      return error(
        'BRANCH_ALREADY_EXISTS',
        `Branch \`${branch}\` already exists.`,
        'Omit create:true to switch to it instead.',
      )
    }
    if (/did not match|not found|unknown revision/i.test(stderr)) {
      return error(
        'BRANCH_NOT_FOUND',
        `Branch \`${branch}\` was not found locally or remotely.`,
        'Run the git_branches tool to list available branches.',
      )
    }
    return error('GIT_CHECKOUT_FAILED', `Unable to check out \`${branch}\`.`)
  }
  return { branch, created: create, previous }
}

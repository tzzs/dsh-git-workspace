import { command } from './exec.js'
import { repository, error } from './repository.js'
import { hasNul, isDangerousLeadingDash, validateRevision } from './safety.js'
import type { Result } from '../types.js'

export interface BranchCreateOptions {
  name: string
  startPoint?: string
  checkout?: boolean
}

export interface BranchCreateResult {
  name: string
  startPoint: string | null
  checkedOut: boolean
}

async function branchExists(root: string, name: string): Promise<boolean> {
  try {
    await command('git', ['show-ref', '--verify', '--quiet', `refs/heads/${name}`], root)
    return true
  } catch {
    return false
  }
}

export async function gitBranchCreate(
  input?: BranchCreateOptions,
  cwd = process.cwd(),
): Promise<Result<BranchCreateResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  const name = input?.name
  if (
    typeof name !== 'string' ||
    !name ||
    hasNul(name) ||
    isDangerousLeadingDash(name) ||
    /\s/.test(name)
  ) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Branch name must be a non-empty string without whitespace or NUL bytes and must not begin with `-`.',
    )
  }
  try {
    await command('git', ['check-ref-format', '--branch', name], r.root)
  } catch {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Invalid branch name.',
      'Use a name accepted by `git check-ref-format --branch`, e.g. feature/my-change.',
    )
  }
  const invalidStart = validateRevision(input?.startPoint)
  if (invalidStart) return invalidStart
  if (await branchExists(r.root, name)) {
    return error(
      'BRANCH_ALREADY_EXISTS',
      `Branch \`${name}\` already exists.`,
      'Use the git_checkout tool to switch to it instead.',
    )
  }
  const checkout = input?.checkout !== false
  const startPoint = input?.startPoint
  const args = checkout ? ['checkout', '-b', name] : ['branch', name]
  if (startPoint !== undefined) args.push(startPoint)
  try {
    await command('git', args, r.root)
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? '')
    if (/already exists/i.test(stderr)) {
      return error('BRANCH_ALREADY_EXISTS', `Branch \`${name}\` already exists.`)
    }
    return error(
      'GIT_COMMAND_FAILED',
      `Unable to create branch \`${name}\`${startPoint !== undefined ? ` from ${startPoint}` : ''}.`,
    )
  }
  return { name, startPoint: startPoint ?? null, checkedOut: checkout }
}

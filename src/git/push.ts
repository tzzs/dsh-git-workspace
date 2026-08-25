import { command } from './exec.js'
import { repository, error } from './repository.js'
import { hasNul, isDangerousLeadingDash } from './safety.js'
import type { Result } from '../types.js'

export interface PushOptions {
  remote?: string
  branch?: string
  force?: boolean
  setUpstream?: boolean
}

export interface PushResult {
  remote: string
  branch: string
  upstream: string | null
  forced: boolean
}

function excerpt(stderr: string): string {
  const text = stderr.trim()
  return text.length > 300 ? text.slice(-300) : text
}

export async function gitPush(
  input: PushOptions = {},
  cwd = process.cwd(),
): Promise<Result<PushResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  if (input.force !== undefined && typeof input.force !== 'boolean') {
    return error('INVALID_GIT_ARGUMENT', 'force must be a boolean.')
  }
  if (input.setUpstream !== undefined && typeof input.setUpstream !== 'boolean') {
    return error('INVALID_GIT_ARGUMENT', 'setUpstream must be a boolean.')
  }
  const remote = input.remote ?? 'origin'
  if (
    typeof remote !== 'string' ||
    !remote ||
    hasNul(remote) ||
    isDangerousLeadingDash(remote)
  ) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Remote must be a non-empty string without NUL bytes and must not begin with `-`.',
    )
  }
  const force = input.force === true
  const setUpstream = input.setUpstream !== false
  let branch = input.branch
  if (branch === undefined) {
    try {
      branch =
        (await command('git', ['branch', '--show-current'], r.root)).stdout.trim() ||
        undefined
    } catch {
      branch = undefined
    }
  }
  if (!branch) {
    return error(
      'NO_BRANCH',
      'Cannot determine the current branch.',
      'Check out a non-detached branch or pass an explicit branch to push.',
    )
  }
  if (hasNul(branch) || isDangerousLeadingDash(branch)) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Branch must not contain NUL bytes or begin with `-`.',
    )
  }
  const args = ['push']
  if (setUpstream) args.push('-u')
  if (force) args.push('--force')
  args.push(remote, branch)
  try {
    await command('git', args, r.root)
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? '')
    if (/rejected|non-fast-forward/i.test(stderr)) {
      return error(
        'GIT_PUSH_REJECTED',
        `Push of \`${branch}\` to ${remote} was rejected.`,
        'Fetch and pull/rebase to integrate remote changes first. force:true exists but rewrites remote history on the remote — use with care.',
      )
    }
    return error(
      'GIT_PUSH_FAILED',
      `Unable to push \`${branch}\` to ${remote}: ${excerpt(stderr) || 'unknown error'}`,
    )
  }
  let upstream: string | null = null
  try {
    upstream =
      (
        await command(
          'git',
          ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`],
          r.root,
        )
      ).stdout.trim() || null
  } catch {
    upstream = null
  }
  return { remote, branch, upstream, forced: force }
}

import { command } from './exec.js'
import { repository, error } from './repository.js'
import { hasNul } from './safety.js'
import type { Result } from '../types.js'

export interface CommitOptions {
  message: string
  amend?: boolean
  allowEmpty?: boolean
}

export interface CommitResult {
  sha: string
  shortSha: string
  branch: string | null
  message: string
}

export async function gitCommit(
  input?: CommitOptions,
  cwd = process.cwd(),
): Promise<Result<CommitResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  const message = input?.message
  if (typeof message !== 'string' || !message.trim() || hasNul(message)) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Message must be a non-empty string without NUL bytes.',
    )
  }
  const amend = input?.amend === true
  const allowEmpty = input?.allowEmpty === true
  if (!amend && !allowEmpty) {
    try {
      const st = await command('git', ['status', '--porcelain=v1'], r.root)
      if (!st.stdout.trim()) {
        return error(
          'NOTHING_TO_COMMIT',
          'There are no staged or unstaged changes to commit.',
          'Stage files first with the git_stage tool, or pass allowEmpty:true (or amend:true) to commit anyway.',
        )
      }
    } catch {
      return error('GIT_COMMAND_FAILED', 'Unable to read Git status.')
    }
  }
  const args = ['commit', '-m', message]
  if (amend) args.push('--amend')
  if (allowEmpty) args.push('--allow-empty')
  try {
    await command('git', args, r.root)
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? '').trim()
    return error(
      'GIT_COMMAND_FAILED',
      `Unable to create the commit${stderr ? `: ${stderr.split('\n')[0].slice(0, 300)}` : '.'}`,
    )
  }
  try {
    const sha = (await command('git', ['rev-parse', 'HEAD'], r.root)).stdout.trim()
    const shortSha = (
      await command('git', ['rev-parse', '--short', 'HEAD'], r.root)
    ).stdout.trim()
    const ref = (
      await command('git', ['rev-parse', '--abbrev-ref', 'HEAD'], r.root)
    ).stdout.trim()
    return { sha, shortSha, branch: ref === 'HEAD' ? null : ref, message }
  } catch {
    return error(
      'GIT_COMMAND_FAILED',
      'Commit was created but the resulting metadata could not be read.',
    )
  }
}

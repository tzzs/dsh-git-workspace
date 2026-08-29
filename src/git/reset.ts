import { command } from './exec.js'
import { repository, error } from './repository.js'
import { validateRevision } from './safety.js'
import type { Result } from '../types.js'

export interface ResetOptions {
  mode?: 'soft' | 'mixed' | 'hard'
  ref?: string
  confirm?: boolean
}

export interface ResetResult {
  mode: 'soft' | 'mixed' | 'hard'
  ref: string
  shortSha: string
}

const MODES: Array<'soft' | 'mixed' | 'hard'> = ['soft', 'mixed', 'hard']

export async function gitReset(
  input: ResetOptions = {},
  cwd = process.cwd(),
): Promise<Result<ResetResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  const mode = input.mode ?? 'mixed'
  if (!MODES.includes(mode)) {
    return error('INVALID_GIT_ARGUMENT', 'Mode must be one of soft, mixed, hard.')
  }
  if (input.ref !== undefined) {
    if (typeof input.ref !== 'string' || !input.ref) {
      return error('INVALID_GIT_ARGUMENT', 'Ref must be a non-empty string.')
    }
    const invalidRef = validateRevision(input.ref)
    if (invalidRef) return invalidRef
  }
  const ref = input.ref ?? 'HEAD'
  if (mode === 'hard' && input.confirm !== true) {
    return error(
      'HARD_RESET_REQUIRES_CONFIRM',
      'Hard reset requires explicit confirmation.',
      'Hard reset discards ALL uncommitted changes in the working tree and index. Re-run with confirm:true to proceed.',
    )
  }
  let shortSha: string
  try {
    shortSha = (
      await command('git', ['rev-parse', '--short', ref], r.root)
    ).stdout.trim()
  } catch {
    return error('GIT_RESET_FAILED', `Unable to resolve ${ref} to a commit.`)
  }
  try {
    await command('git', ['reset', `--${mode}`, ref], r.root)
  } catch {
    return error('GIT_RESET_FAILED', `Unable to reset (${mode}) to ${ref}.`)
  }
  return { mode, ref, shortSha }
}

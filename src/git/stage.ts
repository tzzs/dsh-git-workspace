import { command } from './exec.js'
import { repository, error } from './repository.js'
import { hasNul, isDangerousLeadingDash } from './safety.js'
import type { Result } from '../types.js'

export interface StageOptions {
  paths?: string[]
  all?: boolean
}

export interface StageResult {
  staged: string[]
  all: boolean
}

export async function gitStage(
  input: StageOptions = {},
  cwd = process.cwd(),
): Promise<Result<StageResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  const all = input.all === true
  const paths = Array.isArray(input.paths) ? input.paths : []
  if (!all && paths.length === 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Provide either all:true or a non-empty paths array.',
      'Pass paths:["file"] to stage specific files or all:true to stage everything.',
    )
  }
  for (const p of paths) {
    if (typeof p !== 'string' || !p || hasNul(p) || isDangerousLeadingDash(p)) {
      return error(
        'INVALID_GIT_ARGUMENT',
        'Each path must be a non-empty string without NUL bytes and must not begin with `-`.',
      )
    }
  }
  try {
    if (all) await command('git', ['add', '-A'], r.root)
    else await command('git', ['add', '--', ...paths], r.root)
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? '')
    return error(
      'GIT_COMMAND_FAILED',
      `Unable to stage files${stderr.trim() ? `: ${stderr.trim().split('\n')[0]}` : '.'}`,
    )
  }
  return { staged: all ? [] : [...paths], all }
}

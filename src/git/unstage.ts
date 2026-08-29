import { command } from './exec.js'
import { repository, error } from './repository.js'
import { hasNul, isDangerousLeadingDash } from './safety.js'
import type { Result } from '../types.js'

export interface UnstageOptions {
  paths?: string[]
  all?: boolean
}

export interface UnstageResult {
  unstaged: string[]
  all: boolean
}

export async function gitUnstage(
  input: UnstageOptions = {},
  cwd = process.cwd(),
): Promise<Result<UnstageResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  const all = input.all === true
  const paths = Array.isArray(input.paths) ? input.paths : []
  if (!all && paths.length === 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Provide either all:true or a non-empty paths array.',
      'Pass paths:["file"] to unstage specific files or all:true to unstage everything.',
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
    if (all) await command('git', ['reset'], r.root)
    else await command('git', ['restore', '--staged', '--', ...paths], r.root)
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? '')
    return error(
      'GIT_COMMAND_FAILED',
      `Unable to unstage files${stderr.trim() ? `: ${stderr.trim().split('\n')[0]}` : '.'}`,
    )
  }
  return { unstaged: all ? [] : [...paths], all }
}

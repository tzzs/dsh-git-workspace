import { command } from './exec.js'
import { repository, error } from './repository.js'
import { gitStatus } from './status.js'
import { hasNul, isDangerousLeadingDash } from './safety.js'
import type { Result } from '../types.js'

export interface DiscardPathsOptions {
  paths: string[]
  confirm?: boolean
}

export interface DiscardPathsResult {
  discarded: string[]
}

// Unlike git_reset's mode:'hard' (a whole-repo hard reset), this reverts and
// removes changes scoped to specific paths only — the blast radius a folder
// or file's own "Discard Changes" control needs. It's still destructive
// (permanently drops the listed paths' uncommitted state) and still gated
// behind confirm:true.
export async function gitDiscardPaths(
  input: DiscardPathsOptions,
  cwd = process.cwd(),
): Promise<Result<DiscardPathsResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  const paths = Array.isArray(input.paths) ? input.paths : []
  if (paths.length === 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Provide a non-empty paths array.',
      'Pass paths:["file"] naming what to discard.',
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
  if (input.confirm !== true) {
    return error(
      'DISCARD_REQUIRES_CONFIRM',
      'Discarding paths requires explicit confirmation.',
      'This permanently reverts tracked changes and removes untracked files under the given paths. Re-run with confirm:true to proceed.',
    )
  }
  // Classify against the current status rather than trusting the caller's
  // labels: tracked changes need `restore` (git errors on a pathspec with no
  // tracked history), untracked ones need `clean` (restore doesn't touch
  // them at all).
  const status = await gitStatus(cwd)
  if ('error' in status) return status
  const wanted = new Set(paths)
  const tracked = status.files.filter((f) => f.status !== 'untracked' && wanted.has(f.path)).map((f) => f.path)
  const untracked = status.files.filter((f) => f.status === 'untracked' && wanted.has(f.path)).map((f) => f.path)
  if (tracked.length === 0 && untracked.length === 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'None of the given paths have uncommitted changes.',
      'Refresh the workspace and try again.',
    )
  }
  try {
    if (tracked.length > 0) {
      await command('git', ['restore', '--staged', '--worktree', '--', ...tracked], r.root)
    }
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? '')
    return error(
      'GIT_COMMAND_FAILED',
      `Unable to discard tracked changes${stderr.trim() ? `: ${stderr.trim().split('\n')[0]}` : '.'}`,
    )
  }
  try {
    if (untracked.length > 0) {
      await command('git', ['clean', '-fd', '--', ...untracked], r.root)
    }
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? '')
    return error(
      'GIT_COMMAND_FAILED',
      `Unable to remove untracked paths${stderr.trim() ? `: ${stderr.trim().split('\n')[0]}` : '.'}`,
    )
  }
  return { discarded: [...tracked, ...untracked] }
}

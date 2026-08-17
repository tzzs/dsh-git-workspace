import { command } from './exec.js'
import { repository, error } from './repository.js'
import {
  validateRefs,
  validatePath,
  clampOffset,
  clampLimit,
  DEFAULT_DIFF_LIMIT,
  MAX_DIFF_LIMIT,
} from './safety.js'
import type { Result, DiffFile } from '../types.js'
import { gitDiff } from './diff.js'

export interface CompareOptions {
  base?: string
  head?: string
  path?: string
  offset?: number
  limit?: number
}

export interface CompareResult {
  base: string
  head: string
  ahead: number
  behind: number
  stats: {
    files: number
    additions: number
    deletions: number
  }
  files: Array<{
    path: string
    oldPath: string | null
    status: string
    binary?: boolean
    additions: number
    deletions: number
  }>
  diff?: {
    files: DiffFile[]
    raw: string
  }
}

export async function gitCompare(
  input: CompareOptions = {},
  cwd = process.cwd(),
): Promise<Result<CompareResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r

  const base = input.base ?? 'HEAD'
  const head = input.head ?? 'HEAD'
  const refErr = validateRefs([base, head], 'revision')
  if (refErr) return refErr
  const pathErr = validatePath(input.path)
  if (pathErr) return error('INVALID_GIT_ARGUMENT', pathErr)

  const offset = clampOffset(input.offset)
  const limit = clampLimit(input.limit, DEFAULT_DIFF_LIMIT, MAX_DIFF_LIMIT)

  try {
    let ahead = 0
    let behind = 0
    try {
      const aheadOut = await command(
        'git',
        ['rev-list', '--count', `${base}..${head}`],
        r.root,
      )
      ahead = Number(aheadOut.stdout.trim()) || 0
    } catch {
      ahead = 0
    }
    try {
      const behindOut = await command(
        'git',
        ['rev-list', '--count', `${head}..${base}`],
        r.root,
      )
      behind = Number(behindOut.stdout.trim()) || 0
    } catch {
      behind = 0
    }

    const d = await gitDiff(
      { base, head, path: input.path, offset, limit },
      r.root,
    )
    if ('error' in d) return d

    const stats = d.files.reduce(
      (acc, f) => {
        acc.files++
        acc.additions += f.additions
        acc.deletions += f.deletions
        return acc
      },
      { files: 0, additions: 0, deletions: 0 },
    )

    const files = d.files.map((f) => ({
      path: f.path,
      oldPath: f.oldPath,
      status: f.status,
      ...(f.binary ? { binary: true } : {}),
      additions: f.additions,
      deletions: f.deletions,
    }))

    return { base, head, ahead, behind, stats, files, diff: d }
  } catch {
    return error(
      'GIT_COMMAND_FAILED',
      'Unable to compare the given revisions.',
      'Ensure both base and head are valid revisions or branches.',
    )
  }
}

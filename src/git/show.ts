import { command } from './exec.js'
import { repository, error } from './repository.js'
import {
  validateRefs,
  clampOffset,
  clampLimit,
  DEFAULT_DIFF_LIMIT,
  MAX_DIFF_LIMIT,
} from './safety.js'
import type { Result, DiffFile } from '../types.js'
import { gitDiff } from './diff.js'

export interface ShowOptions {
  sha?: string
  includeDiff?: boolean
  includeFiles?: boolean
  offset?: number
  limit?: number
}

export interface ShowResult {
  commit: {
    sha: string
    shortSha: string
    message: string
    author: string
    date: string
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

export async function gitShow(
  input: ShowOptions = {},
  cwd = process.cwd(),
): Promise<Result<ShowResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r

  const sha = input.sha ?? 'HEAD'
  const refErr = validateRefs([sha], 'revision')
  if (refErr) return refErr

  const includeDiff = input.includeDiff ?? true
  const includeFiles = input.includeFiles ?? true
  const offset = clampOffset(input.offset)
  const limit = clampLimit(input.limit, DEFAULT_DIFF_LIMIT, MAX_DIFF_LIMIT)

  try {
    const commitOut = await command(
      'git',
      [
        'show',
        '-s',
        '--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e',
        sha,
        '--',
      ],
      r.root,
    )
    const cleaned = commitOut.stdout.replace(/[\x1e\n\r]+$/, '')
    const [sha2, shortSha, author, date, message] = cleaned.split('\x1f')
    if (!sha2) {
      return error(
        'REVISION_NOT_FOUND',
        `Git revision not found: ${sha}`,
        'Provide a valid commit SHA, branch, or revision such as HEAD or HEAD~1.',
      )
    }

    let files: ShowResult['files'] = []
    if (includeFiles) {
      const nameStatus = await command(
        'git',
        ['show', '--name-status', '--format=', sha, '--'],
        r.root,
      )
      const seen = new Set<string>()
      for (const line of nameStatus.stdout.split('\n')) {
        if (!line.trim()) continue
        const [statusRaw, ...rest] = line.split('\t')
        if (!rest.length) continue
        const status =
          statusRaw[0] === 'R' || statusRaw[0] === 'C'
            ? (statusRaw[0] === 'R' ? 'renamed' : 'copied')
            : statusRaw === 'A'
              ? 'added'
              : statusRaw === 'D'
                ? 'deleted'
                : 'modified'
        const path = rest[rest.length - 1]
        const oldPath = rest.length > 1 ? rest[rest.length - 2] : null
        const key = `${status}:${path}:${oldPath ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        files.push({ path, oldPath, status, additions: 0, deletions: 0 })
      }
    }

    let diff: ShowResult['diff'] | undefined
    if (includeDiff) {
      const d = await gitDiff(
        { base: `${sha}^`, head: sha, offset, limit },
        r.root,
      )
      if (!('error' in d)) diff = d
    }

    if (includeFiles) {
      const stats = diff?.files ?? []
      const statMap = new Map<string, { additions: number; deletions: number; binary?: boolean }>()
      for (const s of stats) {
        statMap.set(s.path, { additions: s.additions, deletions: s.deletions, binary: s.binary })
      }
      files = files.map((f) => {
        const st = statMap.get(f.path)
        return st ? { ...f, additions: st.additions, deletions: st.deletions, ...(st.binary ? { binary: true } : {}) } : f
      })
    }

    return {
      commit: { sha: sha2, shortSha, message, author, date },
      files,
      ...(diff ? { diff } : {}),
    }
  } catch {
    return error(
      'REVISION_NOT_FOUND',
      `Git revision not found: ${sha}`,
      'Provide a valid commit SHA, branch, or revision such as HEAD or HEAD~1.',
    )
  }
}

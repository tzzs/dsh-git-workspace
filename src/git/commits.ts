import { command } from './exec.js'
import { repository, error } from './repository.js'
import {
  validateRefs,
  validatePath,
  hasNul,
  clampLimit,
  DEFAULT_COMMIT_LIMIT,
  MAX_COMMIT_LIMIT,
} from './safety.js'
import type { Result, CommitSummary } from '../types.js'

export interface CommitsOptions {
  limit?: number
  path?: string
  base?: string
  head?: string
  from?: string
  to?: string
  author?: string
}

export async function gitCommits(
  input: CommitsOptions = {},
  cwd = process.cwd(),
): Promise<Result<{ commits: CommitSummary[] }>> {
  const r = await repository(cwd)
  if ('error' in r) return r

  const pathErr = validatePath(input.path)
  if (pathErr) return error('INVALID_GIT_ARGUMENT', pathErr)

  const refErr = validateRefs([input.base, input.head, input.from, input.to], 'revision')
  if (refErr) return refErr

  if (input.author !== undefined && hasNul(input.author)) {
    return error('INVALID_GIT_ARGUMENT', 'Author contains a NUL byte.')
  }
  if (input.author !== undefined && input.author.startsWith('-')) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Author must not begin with `-`.',
    )
  }

  const limit = clampLimit(input.limit, DEFAULT_COMMIT_LIMIT, MAX_COMMIT_LIMIT)

  try {
    const args = [
      'log',
      `-${limit}`,
      '--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e',
    ]
    if (input.author) args.push(`--author=${input.author}`)
    if (input.path) args.push('--', input.path)

    let range: string | null = null
    const base = input.base ?? input.from
    const head = input.head ?? input.to
    if (base && head) range = `${base}..${head}`
    else if (base) range = base
    else if (head) range = head
    if (range) args.splice(1, 0, range)

    const out = await command('git', args, r.root)
    const commits: CommitSummary[] = []
    for (const chunk of out.stdout.split('\x1e')) {
      const cleaned = chunk.replace(/[\x1f\n\r]/g, '').trim()
      if (!cleaned) continue
      const [sha, shortSha, author, date, message] = chunk
        .trim()
        .split('\x1f')
      if (!sha) continue
      commits.push({ sha, shortSha, author, date, message })
    }

    const summarized = await Promise.all(
      commits.map(async (c) => {
        if (input.path) {
          return c
        }
        const numstat = await command(
          'git',
          [
            'show',
            '--format=',
            '--numstat',
            '-z',
            c.sha,
            '--',
          ],
          r.root,
        ).catch(() => null)
        if (!numstat) return c
        let count = 0
        let additions = 0
        let deletions = 0
        for (const token of numstat.stdout.split('\0')) {
          if (!token) continue
          const firstTab = token.indexOf('\t')
          if (firstTab === -1) continue
          const secondTab = token.indexOf('\t', firstTab + 1)
          if (secondTab === -1) continue
          const a = token.slice(0, firstTab)
          const d = token.slice(firstTab + 1, secondTab)
          if (a === '-') continue
          count++
          additions += Number(a) || 0
          deletions += Number(d) || 0
        }
        return {
          ...c,
          files: { count, additions, deletions },
        }
      }),
    )

    return { commits: summarized }
  } catch {
    return error('GIT_COMMAND_FAILED', 'Unable to read commit history.')
  }
}

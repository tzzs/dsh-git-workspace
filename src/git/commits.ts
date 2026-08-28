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
import type { Result, CommitSummary, GitFileStatus } from '../types.js'

const MAX_COMMIT_FILES = 50

const RAW_STATUS: Record<string, GitFileStatus> = {
  A: 'added',
  D: 'deleted',
  M: 'modified',
  T: 'modified',
  U: 'modified',
}

function parseCommitFiles(stdout: string): {
  count: number
  additions: number
  deletions: number
  list: Array<{ path: string; status: GitFileStatus; additions: number; deletions: number }>
} {
  const tokens = stdout.split('\0')
  let i = 0
  const raw: Array<{ status: GitFileStatus; path: string }> = []
  while (i < tokens.length && tokens[i].startsWith(':')) {
    const header = tokens[i]
    i++
    const path = tokens[i]
    i++
    if (path === undefined) break
    const m = header.match(/\s([A-Z])\d*$/)
    raw.push({ status: (m && RAW_STATUS[m[1]]) || 'modified', path })
  }
  const stats = new Map<string, { additions: number; deletions: number }>()
  for (; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue
    const firstTab = token.indexOf('\t')
    if (firstTab === -1) continue
    const secondTab = token.indexOf('\t', firstTab + 1)
    if (secondTab === -1) continue
    const a = token.slice(0, firstTab)
    const d = token.slice(firstTab + 1, secondTab)
    const path = token.slice(secondTab + 1)
    if (a === '-') continue
    stats.set(path, { additions: Number(a) || 0, deletions: Number(d) || 0 })
  }
  let additions = 0
  let deletions = 0
  const list = raw.map((f) => {
    const st = stats.get(f.path) || { additions: 0, deletions: 0 }
    additions += st.additions
    deletions += st.deletions
    return { path: f.path, status: f.status, additions: st.additions, deletions: st.deletions }
  })
  return { count: list.length, additions, deletions, list: list.slice(0, MAX_COMMIT_FILES) }
}

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
        const shown = await command(
          'git',
          [
            'show',
            '--format=',
            '--raw',
            '--no-renames',
            '--numstat',
            '-z',
            c.sha,
            '--',
          ],
          r.root,
        ).catch(() => null)
        if (!shown) return c
        return {
          ...c,
          files: parseCommitFiles(shown.stdout),
        }
      }),
    )

    return { commits: summarized }
  } catch {
    return error('GIT_COMMAND_FAILED', 'Unable to read commit history.')
  }
}

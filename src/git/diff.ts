import { command } from './exec.js'
import { repository, error } from './repository.js'
import {
  validatePath,
  isDangerousLeadingDash,
  validateRefs,
  clampOffset,
  clampLimit,
  MAX_DIFF_LIMIT,
  DEFAULT_DIFF_LIMIT,
} from './safety.js'
import type { Result, DiffFile, Hunk } from '../types.js'

export interface DiffOptions {
  path?: string
  staged?: boolean
  base?: string
  head?: string
  offset?: number
  limit?: number
}

export interface DiffResult {
  files: DiffFile[]
  raw: string
}

function isBinary(chunk: string): boolean {
  return /^Binary files /m.test(chunk) || /^GIT binary patch/m.test(chunk)
}

function parseNumstatLine(line: string): {
  additions: number
  deletions: number
  binary: boolean
} | null {
  const parts = line.split('\t')
  if (parts.length < 2) return null
  const [a, d] = parts
  if (a === '-') {
    return { additions: 0, deletions: 0, binary: true }
  }
  const additions = Number(a)
  const deletions = Number(d)
  if (Number.isNaN(additions) || Number.isNaN(deletions)) return null
  return { additions, deletions, binary: false }
}

export async function gitDiff(
  input: DiffOptions = {},
  cwd = process.cwd(),
): Promise<Result<DiffResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r

  const pathErr = validatePath(input.path)
  if (pathErr) return error('INVALID_GIT_ARGUMENT', pathErr)
  if (input.path !== undefined && isDangerousLeadingDash(input.path)) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Path must not begin with `-`.',
      'Provide a normal repository-relative path.',
    )
  }
  const refErr = validateRefs([input.base, input.head], 'revision')
  if (refErr) return refErr

  const offset = clampOffset(input.offset)
  const limit = clampLimit(input.limit, DEFAULT_DIFF_LIMIT, MAX_DIFF_LIMIT)

  try {
    const args = ['diff', '--no-ext-diff', '--unified=3', '--no-color']
    if (input.staged) args.push('--cached')
    if (input.base) {
      args.push(input.base)
      if (input.head) args.push(input.head)
    }
    if (input.path) args.push('--', input.path)
    else args.push('--')

    const raw = (await command('git', args, r.root)).stdout

    const statsArgs = [
      'diff',
      '--no-ext-diff',
      '--numstat',
      '-z',
      ...(input.staged ? ['--cached'] : []),
      ...(input.base ? [input.base, ...(input.head ? [input.head] : [])] : []),
      ...(input.path ? ['--', input.path] : ['--']),
    ]
    const numstatRaw = (await command('git', statsArgs, r.root)).stdout

    const statsMap = new Map<
      string,
      { additions: number; deletions: number; binary: boolean; status: string; oldPath: string | null }
    >()
    const numstatTokens = numstatRaw.split('\0')
    for (const token of numstatTokens) {
      if (!token) continue
      const firstTab = token.indexOf('\t')
      if (firstTab === -1) continue
      const secondTab = token.indexOf('\t', firstTab + 1)
      if (secondTab === -1) continue
      const a = token.slice(0, firstTab)
      const d = token.slice(firstTab + 1, secondTab)
      const path = token.slice(secondTab + 1)
      const parsed = parseNumstatLine(`${a}\t${d}\t${path}`)
      if (!parsed) continue
      statsMap.set(path, { ...parsed, status: 'modified', oldPath: null })
    }

    const chunks = raw.split(/^diff --git /m).filter(Boolean)
    const files: DiffFile[] = chunks.map((c) => {
      const lines = c.split('\n')
      const header = lines[0]
      const ms = header.match(/a\/(.*?) b\/(.*)$/)
      const path = ms?.[2] ?? header
      const renamed = lines.find((l) => l.startsWith('rename from') || l.startsWith('rename to'))
      const copied = lines.find((l) => l.startsWith('copy from') || l.startsWith('copy to'))
      const newFile = lines.some((l) => l.startsWith('new file mode'))
      const deletedFile = lines.some((l) => l.startsWith('deleted file mode'))
      const binary = isBinary(c)

      let status: string = 'modified'
      let oldPath: string | null = ms?.[1] ?? null
      if (renamed) {
        status = 'renamed'
        const rm = lines.find((l) => l.startsWith('rename from'))
        oldPath = rm ? rm.slice('rename from '.length).trim() : (ms?.[1] ?? null)
      } else if (copied) {
        status = 'copied'
        const cm = lines.find((l) => l.startsWith('copy from'))
        oldPath = cm ? cm.slice('copy from '.length).trim() : (ms?.[1] ?? null)
      } else if (newFile) {
        status = 'added'
        oldPath = null
      } else if (deletedFile) {
        status = 'deleted'
        oldPath = ms?.[1] ?? null
      }

      const stat = statsMap.get(path)
      let additions = stat?.additions ?? 0
      let deletions = stat?.deletions ?? 0

      if (binary) {
        return {
          path,
          oldPath,
          status,
          binary: true,
          additions: 0,
          deletions: 0,
          hunks: [],
        }
      }

      if (!stat) {
        for (const l of lines) {
          if (l.startsWith('+') && !l.startsWith('+++')) additions++
          if (l.startsWith('-') && !l.startsWith('---')) deletions++
        }
      }

      const hunks: Hunk[] = []
      for (let i = 0; i < lines.length; i++) {
        const h = lines[i].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
        if (h) {
          const z: Hunk = {
            oldStart: +h[1],
            oldLines: +(h[2] ?? 1),
            newStart: +h[3],
            newLines: +(h[4] ?? 1),
            lines: [],
          }
          for (i++; i < lines.length && !lines[i].startsWith('@@ '); i++) {
            const l = lines[i]
            if (l[0] === ' ' || l[0] === '+' || l[0] === '-') z.lines.push(l)
          }
          hunks.push(z)
          i--
        }
      }

      return { path, oldPath, status, additions, deletions, hunks }
    })

    const all = files.flatMap((f) => f.hunks.flatMap((h) => h.lines))
    const paged = all.slice(offset, offset + limit)
    return { files, raw: paged.join('\n') }
  } catch {
    return error('GIT_COMMAND_FAILED', 'Unable to read Git diff.')
  }
}

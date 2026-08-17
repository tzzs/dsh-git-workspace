import { command } from './exec.js'
import { repository, error } from './repository.js'
import {
  validateRefs,
  validatePath,
  clampOffset,
  clampLimit,
  DEFAULT_BLAME_LINES,
  MAX_BLAME_LINES,
} from './safety.js'
import type { Result } from '../types.js'

export interface BlameOptions {
  path?: string
  startLine?: number
  endLine?: number
  revision?: string
  limit?: number
}

export interface BlameResult {
  path: string
  revision: string
  lines: Array<{
    line: number
    commit: string
    shortCommit: string
    author: string
    date: string
    content: string
  }>
}

export async function gitBlame(
  input: BlameOptions = {},
  cwd = process.cwd(),
): Promise<Result<BlameResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r

  if (!input.path) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'A path is required for git_blame.',
      'Provide the path to a file in the repository.',
    )
  }
  const pathErr = validatePath(input.path)
  if (pathErr) return error('INVALID_GIT_ARGUMENT', pathErr)

  const revision = input.revision ?? 'HEAD'
  const refErr = validateRefs([revision], 'revision')
  if (refErr) return refErr

  const startLine = clampOffset(input.startLine)
  const endLineRaw = input.endLine
  const endLine =
    typeof endLineRaw === 'number' && Number.isFinite(endLineRaw) && endLineRaw > 0
      ? Math.floor(endLineRaw)
      : undefined
  const maxLines = clampLimit(input.limit, DEFAULT_BLAME_LINES, MAX_BLAME_LINES)

  try {
    const range =
      startLine > 0
        ? endLine
          ? `${startLine},${endLine}`
          : `${startLine},`
        : endLine
          ? `1,${endLine}`
          : undefined

    const args = ['blame', '--line-porcelain']
    if (range) args.push('-L', range)
    if (revision !== 'HEAD') args.push(revision)
    args.push('--', input.path)

    const out = await command('git', args, r.root)
    const outLines = out.stdout.split('\n')

    const lines: BlameResult['lines'] = []
    let currentContent = ''
    let current: {
      commit: string
      author: string
      date: string
      line: number
    } | null = null

    const pushCurrent = () => {
      if (current && lines.length < maxLines) {
        lines.push({
          line: current.line,
          commit: current.commit,
          shortCommit: current.commit.slice(0, 7),
          author: current.author,
          date: current.date,
          content: currentContent,
        })
      }
      current = null
      currentContent = ''
    }

    for (const rawLine of outLines) {
      const header = rawLine.match(/^([0-9a-f]{40})\s(\d+)\s(\d+)/)
      if (header) {
        pushCurrent()
        current = {
          commit: header[1],
          line: Number(header[3]),
          author: '',
          date: '',
        }
        continue
      }
      if (current) {
        const author = rawLine.match(/^author (.+)$/)
        const date = rawLine.match(/^author-time (\d+)$/)
        if (author) current.author = author[1]
        if (date) current.date = new Date(Number(date[1]) * 1000).toISOString()
        if (rawLine.startsWith('\t')) {
          currentContent = rawLine.slice(1)
        }
      }
    }
    pushCurrent()

    return {
      path: input.path,
      revision,
      lines,
    }
  } catch {
    return error(
      'INVALID_PATH',
      'Unable to run git blame for the given path.',
      'Ensure the file exists at the given revision and that the revision is valid.',
    )
  }
}

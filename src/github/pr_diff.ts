import { githubContext, gh } from './client.js'
import { error } from '../git/repository.js'
import { ghError, isInteger } from '../git/safety.js'
import type { Result, DiffFile, Hunk } from '../types.js'

export interface PrDiffOptions {
  number?: number
  path?: string
  offset?: number
  limit?: number
}

export interface PrDiffResult {
  pullRequest: number
  files: DiffFile[]
  raw: string
}

function isBinary(chunk: string): boolean {
  return /^Binary files /m.test(chunk) || /^GIT binary patch/m.test(chunk)
}

export async function githubPrDiff(
  input: PrDiffOptions = {},
  cwd = process.cwd(),
): Promise<Result<PrDiffResult>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  if (input.number === undefined || !isInteger(input.number) || input.number <= 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'A positive integer pull request number is required.',
    )
  }
  if (input.path !== undefined && input.path.includes('\0')) {
    return error('INVALID_GIT_ARGUMENT', 'Path contains a NUL byte.')
  }

  const offset = Math.max(0, input.offset ?? 0)
  const limit = Math.min(
    typeof input.limit === 'number' && input.limit > 0
      ? Math.floor(input.limit)
      : 300,
    2000,
  )

  try {
    const args = ['pr', 'diff', String(input.number), '--repo', `${ctx.owner}/${ctx.name}`]
    const out = await gh(ctx, args)
    const raw = out.stdout
    const chunks = raw.split(/^diff --git /m).filter(Boolean)
    const files: DiffFile[] = chunks.map((c) => {
      const lines = c.split('\n')
      const header = lines[0]
      const ms = header.match(/a\/(.*?) b\/(.*)$/)
      const path = ms?.[2] ?? header
      const binary = isBinary(c)
      const newFile = lines.some((l) => l.startsWith('new file mode'))
      const deletedFile = lines.some((l) => l.startsWith('deleted file mode'))
      const renamed = lines.some((l) => l.startsWith('rename from'))
      const copied = lines.some((l) => l.startsWith('copy from'))

      let status = 'modified'
      let oldPath: string | null = ms?.[1] ?? null
      if (renamed) {
        status = 'renamed'
        const rm = lines.find((l) => l.startsWith('rename from'))
        oldPath = rm ? rm.slice('rename from '.length).trim() : oldPath
      } else if (copied) {
        status = 'copied'
        const cm = lines.find((l) => l.startsWith('copy from'))
        oldPath = cm ? cm.slice('copy from '.length).trim() : oldPath
      } else if (newFile) {
        status = 'added'
        oldPath = null
      } else if (deletedFile) {
        status = 'deleted'
      }

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

      let additions = 0
      let deletions = 0
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
            if (l.startsWith('+') && !l.startsWith('+++')) additions++
            if (l.startsWith('-') && !l.startsWith('---')) deletions++
            if (l[0] === ' ' || l[0] === '+' || l[0] === '-') z.lines.push(l)
          }
          hunks.push(z)
          i--
        }
      }
      return { path, oldPath, status, additions, deletions, hunks }
    })

    let selected = files
    if (input.path) {
      selected = files.filter((f) => f.path === input.path)
    }
    const all = selected.flatMap((f) => f.hunks.flatMap((h) => h.lines))
    const rawPaged = all.slice(offset, offset + limit).join('\n')
    return { pullRequest: input.number, files: selected, raw: rawPaged }
  } catch (e) {
    return ghError(e, {
      code: 'GITHUB_QUERY_FAILED',
      message: 'Unable to read pull request diff.',
      hint: 'Verify the PR number and gh authentication.',
    })
  }
}

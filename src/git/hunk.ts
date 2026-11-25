import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { command } from './exec.js'
import { repository, error } from './repository.js'
import { hasNul, isDangerousLeadingDash } from './safety.js'
import type { Hunk, Result } from '../types.js'

export type HunkSide = 'staged' | 'unstaged'

export interface HunkTarget {
  path: string
  side?: HunkSide
  hunk: Pick<Hunk, 'oldStart' | 'oldLines' | 'newStart' | 'newLines'>
  confirm?: boolean
}

export interface HunkResult {
  path: string
  side: HunkSide
  action: 'stage' | 'unstage' | 'discard'
}

interface ParsedHunk {
  meta: Pick<Hunk, 'oldStart' | 'oldLines' | 'newStart' | 'newLines'>
  body: string[]
}

interface ParsedChunk {
  path: string
  oldPath: string | null
  preamble: string[]
  hunks: ParsedHunk[]
}

function parseChunks(patch: string): ParsedChunk[] {
  const out: ParsedChunk[] = []
  for (const raw of patch.split(/^diff --git /m)) {
    if (!raw) continue
    const lines = raw.split('\n')
    const header = lines[0] || ''
    const ms = header.match(/a\/(.*?) b\/(.*)$/)
    if (!ms) continue
    const preamble = [`diff --git ${header}`]
    let i = 1
    while (i < lines.length && !lines[i].startsWith('@@')) {
      preamble.push(lines[i])
      i++
    }
    const hunks: ParsedHunk[] = []
    while (i < lines.length) {
      const m = lines[i].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (!m) {
        i++
        continue
      }
      const meta = {
        oldStart: +m[1],
        oldLines: +(m[2] ?? 1),
        newStart: +m[3],
        newLines: +(m[4] ?? 1),
      }
      const body = [lines[i]]
      for (i++; i < lines.length && !lines[i].startsWith('@@'); i++) {
        const l = lines[i]
        if (l[0] === ' ' || l[0] === '+' || l[0] === '-' || l[0] === '\\') body.push(l)
      }
      hunks.push({ meta, body })
    }
    out.push({ path: ms[2], oldPath: ms[1], preamble, hunks })
  }
  return out
}

function sameHunk(a: ParsedHunk['meta'], b: HunkTarget['hunk']): boolean {
  return (
    a.oldStart === b.oldStart &&
    a.oldLines === b.oldLines &&
    a.newStart === b.newStart &&
    a.newLines === b.newLines
  )
}

function validate(input: HunkTarget, side: HunkSide): string | null {
  if (!input || typeof input !== 'object') return 'Hunk target is required.'
  const path = input.path
  if (typeof path !== 'string' || !path) return 'Path must be a non-empty string.'
  if (hasNul(path) || isDangerousLeadingDash(path)) return 'Path must not contain NUL or begin with `-`.'
  if (input.side !== undefined && input.side !== side) return `This action only supports side "${side}".`
  const h = input.hunk
  if (
    !h ||
    !Number.isInteger(h.oldStart) ||
    !Number.isInteger(h.oldLines) ||
    !Number.isInteger(h.newStart) ||
    !Number.isInteger(h.newLines) ||
    h.oldStart < 0 ||
    h.newStart < 0 ||
    h.oldLines < 0 ||
    h.newLines < 0
  ) {
    return 'hunk must carry integer oldStart/oldLines/newStart/newLines.'
  }
  return null
}

async function applyPatch(
  root: string,
  patch: string,
  args: string[],
): Promise<Result<null>> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-hunk-'))
  try {
    const file = join(dir, 'patch.diff')
    await writeFile(file, patch, 'utf8')
    await command('git', ['apply', '--whitespace=nowarn', ...args, file], root)
    return null
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? '')
    return error(
      'GIT_COMMAND_FAILED',
      `Unable to apply hunk${stderr.trim() ? `: ${stderr.trim().split('\n')[0]}` : '.'}`,
      'Refresh the workspace and try again; the file may have changed since the diff was sampled.',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function runHunk(
  input: HunkTarget,
  cwd: string,
  action: HunkResult['action'],
): Promise<Result<HunkResult>> {
  const side: HunkSide = action === 'unstage' ? 'staged' : 'unstaged'
  const invalid = validate(input, side)
  if (invalid) return error('INVALID_GIT_ARGUMENT', invalid)
  const r = await repository(cwd)
  if ('error' in r) return r
  const args = ['-c', 'core.quotePath=false', 'diff', '--no-color', '--unified=3']
  if (side === 'staged') args.push('--cached')
  let patch = ''
  try {
    patch = (await command('git', [...args, '--', input.path], r.root)).stdout
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? '')
    return error('GIT_COMMAND_FAILED', `Unable to read the diff${stderr.trim() ? `: ${stderr.trim().split('\n')[0]}` : '.'}`)
  }
  const chunk = parseChunks(patch).find((c) => c.path === input.path || c.oldPath === input.path)
  const hunk = chunk && chunk.hunks.find((h) => sameHunk(h.meta, input.hunk))
  if (!chunk || !hunk) {
    return error(
      'HUNK_NOT_FOUND',
      `No matching hunk for ${input.path}.`,
      'Refresh the workspace and retry against the current diff.',
    )
  }
  const text = [...chunk.preamble, ...hunk.body].join('\n') + '\n'
  const applyArgs =
    action === 'stage'
      ? ['--cached']
      : action === 'unstage'
        ? ['--cached', '--reverse']
        : ['--reverse']
  const applied = await applyPatch(r.root, text, applyArgs)
  if (applied) return applied
  return { path: input.path, side, action }
}

export async function gitStageHunk(
  input: HunkTarget,
  cwd = process.cwd(),
): Promise<Result<HunkResult>> {
  return runHunk(input, cwd, 'stage')
}

export async function gitUnstageHunk(
  input: HunkTarget,
  cwd = process.cwd(),
): Promise<Result<HunkResult>> {
  return runHunk(input, cwd, 'unstage')
}

export async function gitDiscardHunk(
  input: HunkTarget,
  cwd = process.cwd(),
): Promise<Result<HunkResult>> {
  if (input.confirm !== true) {
    return error(
      'DISCARD_REQUIRES_CONFIRM',
      'Discarding a hunk requires explicit confirmation.',
      'This permanently reverts that hunk in the working tree. Re-run with confirm:true to proceed.',
    )
  }
  return runHunk(input, cwd, 'discard')
}

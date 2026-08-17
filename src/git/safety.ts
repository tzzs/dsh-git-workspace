import type { Result, ToolError } from '../types.js'
import { error } from './repository.js'

export const MAX_COMMIT_LIMIT = 100
export const DEFAULT_COMMIT_LIMIT = 20
export const MAX_DIFF_LIMIT = 2000
export const DEFAULT_DIFF_LIMIT = 300
export const MAX_BLAME_LINES = 1000
export const DEFAULT_BLAME_LINES = 200
export const MAX_LOG_BYTES = 2000
export const MAX_CI_LOG_BYTES = 2000

export function hasNul(value: string): boolean {
  return value.includes('\0')
}

export function isDangerousLeadingDash(value: string): boolean {
  return value.startsWith('-') && value !== '-'
}

export function validatePath(path: string | undefined): string | null {
  if (path === undefined) return null
  if (hasNul(path)) {
    return 'Path contains a NUL byte.'
  }
  return null
}

export function validateRevision(
  revision: string | undefined,
): Result<null> | null {
  if (revision === undefined || revision === null) return null
  if (hasNul(revision)) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Revision contains a NUL byte.',
      'Provide a valid revision such as HEAD, HEAD~1, a branch name, or a commit SHA.',
    )
  }
  if (isDangerousLeadingDash(revision)) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'Revision must not begin with `-`.',
      'Provide a valid revision such as HEAD, HEAD~1, a branch name, or a commit SHA.',
    )
  }
  return null
}

export function validateRefs(
  values: Array<string | undefined | null>,
  label = 'argument',
): Result<null> | null {
  for (const v of values) {
    if (v === undefined || v === null) continue
    const invalid = validateRevision(v)
    if (invalid) return invalid
  }
  return null
}

export function clampLimit(
  input: number | undefined,
  def: number,
  max: number,
): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0) {
    return def
  }
  return Math.min(Math.floor(input), max)
}

export function clampOffset(input: number | undefined): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0) {
    return 0
  }
  return Math.floor(input)
}

export function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

export function parseErrorCode(e: unknown): { code?: string; msg: string } {
  const err = e as { code?: unknown; message?: unknown; stderr?: unknown }
  const msg = String(err?.message ?? '')
  const stderr = String(err?.stderr ?? '')
  const code = String(err?.code ?? '')
  return { code, msg: msg || stderr || code }
}

export function isGhNotInstalled(e: unknown): boolean {
  const { code, msg } = parseErrorCode(e)
  return (
    code === 'ENOENT' ||
    msg.includes('ENOENT') ||
    msg.includes('not found') ||
    msg.includes('spawn gh') ||
    msg.includes('ENOENT') ||
    /no such file/i.test(msg)
  )
}

export function isGhNotAuthenticated(e: unknown): boolean {
  const { msg } = parseErrorCode(e)
  const stderr = String((e as { stderr?: unknown }).stderr ?? '')
  return (
    /auth|login|not logged|logged into/i.test(msg) ||
    /auth|login|not logged|logged into/i.test(stderr)
  )
}

export function isGhNotFound(e: unknown): boolean {
  const { msg } = parseErrorCode(e)
  const stderr = String((e as { stderr?: unknown }).stderr ?? '')
  return (
    /could not resolve to a pull request/i.test(msg) ||
    /could not resolve to a issue/i.test(msg) ||
    /not found/i.test(msg) ||
    /HTTP 404/i.test(msg + stderr) ||
    /graphql.*not found/i.test(msg + stderr)
  )
}

export function isGhForbidden(e: unknown): boolean {
  const { msg } = parseErrorCode(e)
  const stderr = String((e as { stderr?: unknown }).stderr ?? '')
  return /403|forbidden|must have push access/i.test(msg + stderr)
}

export function ghError(e: unknown, fallback: ToolError): Result<never> {
  if (isGhNotInstalled(e)) {
    return error(
      'GH_NOT_INSTALLED',
      'GitHub CLI (gh) is not installed.',
      'Install gh and try again.',
    )
  }
  if (isGhNotAuthenticated(e)) {
    return error(
      'GH_NOT_AUTHENTICATED',
      'GitHub CLI is not authenticated.',
      'Run `gh auth login` and try again.',
    )
  }
  if (isGhNotFound(e)) {
    return error(
      'GITHUB_RESOURCE_NOT_FOUND',
      fallback.message,
      fallback.hint,
    )
  }
  if (isGhForbidden(e)) {
    return error(
      'GITHUB_PERMISSION_DENIED',
      'Permission denied while querying GitHub.',
      'Check that your GitHub token has access to this repository.',
    )
  }
  return error(fallback.code, fallback.message, fallback.hint)
}

export function collectJson<T>(stdout: string): T[] {
  const trimmed = stdout.trim()
  if (!trimmed) return []
  return JSON.parse(trimmed) as T[]
}

import { githubContext, gh, repoArg } from './client.js'
import { error } from '../git/repository.js'
import { ghError, isInteger } from '../git/safety.js'
import type { Result } from '../types.js'

export interface CiAnnotationsOptions {
  checkId: number
}

export interface CheckAnnotation {
  path: string
  startLine: number | null
  endLine: number | null
  level: string
  title: string | null
  message: string
}

export interface CiAnnotationsResult {
  checkId: number
  annotations: CheckAnnotation[]
}

interface AnnotationRow {
  path: string
  start_line?: number | null
  end_line?: number | null
  annotation_level?: string | null
  title?: string | null
  message?: string | null
}

export async function githubCiAnnotations(
  input: CiAnnotationsOptions,
  cwd = process.cwd(),
): Promise<Result<CiAnnotationsResult>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  if (!isInteger(input.checkId) || input.checkId <= 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'A positive integer checkId is required.',
      'Use github_ci to find a check run URL, whose trailing /job/<id> segment is the checkId.',
    )
  }

  try {
    const out = await gh(ctx, [
      'api',
      `repos/${repoArg(ctx)}/check-runs/${input.checkId}/annotations`,
    ])
    const rows = JSON.parse(out.stdout || '[]') as AnnotationRow[]
    return {
      checkId: input.checkId,
      annotations: rows.map((r) => ({
        path: r.path,
        startLine: r.start_line ?? null,
        endLine: r.end_line ?? null,
        level: r.annotation_level ?? 'notice',
        title: r.title ?? null,
        message: r.message ?? '',
      })),
    }
  } catch (e) {
    return ghError(e, {
      code: 'GITHUB_QUERY_FAILED',
      message: 'Unable to read annotations for the given check run.',
      hint: 'Verify the checkId and gh authentication.',
    })
  }
}

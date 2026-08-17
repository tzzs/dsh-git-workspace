import { githubContext, gh } from './client.js'
import { error } from '../git/repository.js'
import { ghError, isInteger } from '../git/safety.js'
import type { Result } from '../types.js'

export interface CiLogsOptions {
  runId?: number
  jobId?: number
  offset?: number
  limit?: number
}

export interface CiLogsResult {
  runId: number | null
  jobId: number | null
  totalLines: number
  offset: number
  limit: number
  logs: string[]
}

export async function githubCiLogs(
  input: CiLogsOptions = {},
  cwd = process.cwd(),
): Promise<Result<CiLogsResult>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  if (input.runId === undefined || !isInteger(input.runId) || input.runId <= 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'A positive integer runId is required.',
      'Use github_ci to find a runId first.',
    )
  }
  if (input.jobId !== undefined && (!isInteger(input.jobId) || input.jobId <= 0)) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'jobId must be a positive integer.',
    )
  }

  const offset = Math.max(0, input.offset ?? 0)
  const limit = Math.min(
    typeof input.limit === 'number' && input.limit > 0
      ? Math.floor(input.limit)
      : 500,
    5000,
  )

  try {
    const args = [
      'run',
      'view',
      String(input.runId),
      '--repo',
      `${ctx.owner}/${ctx.name}`,
      '--log',
    ]
    if (input.jobId) args.push('--job', String(input.jobId))
    const out = await gh(ctx, args)
    const lines = out.stdout.split('\n').filter((l) => l.trim() !== '')
    const totalLines = lines.length
    const paged = lines.slice(offset, offset + limit)
    return {
      runId: input.runId,
      jobId: input.jobId ?? null,
      totalLines,
      offset,
      limit,
      logs: paged,
    }
  } catch (e) {
    return ghError(e, {
      code: 'GITHUB_QUERY_FAILED',
      message: 'Unable to read CI logs for the given run.',
      hint: 'Verify the runId/jobId and that logs are available.',
    })
  }
}

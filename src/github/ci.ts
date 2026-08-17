import { command } from '../git/exec.js'
import { githubContext, gh, ghJson, repoArg } from './client.js'
import { error } from '../git/repository.js'
import { ghError, isInteger } from '../git/safety.js'
import type { Result, CheckRun } from '../types.js'

export interface CiOptions {
  number?: number
  branch?: string
}

export interface CiResult {
  status: string
  pullRequest?: number | null
  branch: string | null
  checks: CheckRun[]
}

interface PrChecksRow {
  name: string
  state: string
  conclusion?: string | null
  workflow?: string | null
  url?: string | null
}

interface RunListRow {
  name: string
  status: string
  conclusion: string | null
  workflowName?: string | null
  url?: string | null
  headSha?: string | null
}

function mapState(rows: PrChecksRow[]): { status: string; checks: CheckRun[] } {
  const checks: CheckRun[] = rows.map((x) => ({
    name: x.name,
    status: x.state,
    conclusion: x.conclusion ?? null,
    workflow: x.workflow ?? null,
    url: x.url ?? null,
  }))
  let status = 'success'
  for (const c of checks) {
    const s = (c.status ?? '').toLowerCase()
    const concl = (c.conclusion ?? '').toLowerCase()
    if (s === 'in_progress' || s === 'queued' || s === 'pending') {
      if (status === 'success') status = 'pending'
    } else if (concl === 'failure' || concl === 'cancelled' || concl === 'timed_out') {
      status = 'failure'
    } else if (concl === 'neutral' || concl === 'skipped') {
      if (status === 'success') status = 'neutral'
    }
  }
  return { status, checks }
}

export async function githubCi(
  input: CiOptions = {},
  cwd = process.cwd(),
): Promise<Result<CiResult>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  let branch: string | null = input.branch ?? null
  if (!branch) {
    try {
      branch =
        (await command('git', ['branch', '--show-current'], ctx.root)).stdout
          .trim() || null
    } catch {
      branch = null
    }
  }

  if (input.number !== undefined) {
    if (!isInteger(input.number) || input.number <= 0) {
      return error(
        'INVALID_GIT_ARGUMENT',
        'A positive integer pull request number is required.',
      )
    }
    try {
      const out = await gh(
        ctx,
        [
          'pr',
          'checks',
          String(input.number),
          '--repo',
          repoArg(ctx),
          '--json',
          'name,state,conclusion,workflow,url',
        ],
      )
      const rows = JSON.parse(out.stdout) as PrChecksRow[]
      const mapped = mapState(rows)
      return {
        status: mapped.status,
        pullRequest: input.number,
        branch,
        checks: mapped.checks,
      }
    } catch (e) {
      if (isInteger(input.number)) {
        const noChecks = /no checks/i.test(String((e as Error).message))
        if (noChecks) {
          return {
            status: 'none',
            pullRequest: input.number,
            branch,
            checks: [],
          }
        }
      }
      return ghError(e, {
        code: 'GITHUB_QUERY_FAILED',
        message: 'Unable to read CI status for the pull request.',
        hint: 'Verify the PR number and gh authentication.',
      })
    }
  }

  try {
    const args = [
      'run',
      'list',
      '--repo',
      repoArg(ctx),
      '--json',
      'name,status,conclusion,workflowName,url,headSha',
    ]
    if (branch) args.push('--branch', branch)
    const out = await gh(ctx, args)
    const rows = JSON.parse(out.stdout) as RunListRow[]
    const checks: CheckRun[] = rows.map((x) => ({
      name: x.name,
      status: x.status,
      conclusion: x.conclusion,
      workflow: x.workflowName ?? null,
      url: x.url ?? null,
    }))
    let status = 'success'
    for (const c of checks) {
      const s = (c.status ?? '').toLowerCase()
      const concl = (c.conclusion ?? '').toLowerCase()
      if (s === 'in_progress' || s === 'queued') {
        if (status === 'success') status = 'pending'
      } else if (concl === 'failure' || concl === 'cancelled' || concl === 'timed_out') {
        status = 'failure'
      }
    }
    if (checks.length === 0) status = 'none'
    return { status, pullRequest: null, branch, checks }
  } catch (e) {
    return ghError(e, {
      code: 'GITHUB_QUERY_FAILED',
      message: 'Unable to read CI status for the branch.',
      hint: 'Verify gh authentication and that the branch has CI runs.',
    })
  }
}

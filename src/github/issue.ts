import { githubContext, ghJson, repoArg } from './client.js'
import { error } from '../git/repository.js'
import { isInteger } from '../git/safety.js'
import type { Result, Issue } from '../types.js'

interface IssueRow {
  number: number
  title: string
  body?: string | null
  state: string
  author?: { login: string } | null
  labels?: Array<{ name: string }>
  assignees?: Array<{ login: string }>
  milestone?: { title: string } | null
  createdAt?: string | null
  updatedAt?: string | null
  url?: string | null
}

export async function githubIssue(
  input: { number?: number } = {},
  cwd = process.cwd(),
): Promise<Result<Issue>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  if (input.number === undefined || !isInteger(input.number) || input.number <= 0) {
    return error(
      'INVALID_GIT_ARGUMENT',
      'A positive integer issue number is required.',
    )
  }

  const r = await ghJson<IssueRow>(
    ctx,
    [
      'issue',
      'view',
      String(input.number),
      '--repo',
      repoArg(ctx),
      '--json',
      [
        'number',
        'title',
        'body',
        'state',
        'author',
        'labels',
        'assignees',
        'milestone',
        'createdAt',
        'updatedAt',
        'url',
      ].join(','),
    ],
    {
      code: 'GITHUB_QUERY_FAILED',
      message: 'Unable to read the GitHub issue.',
      hint: 'Verify the issue number and gh authentication.',
    },
  )
  if ('error' in r) return r

  return {
    number: r.number,
    title: r.title,
    body: r.body ?? null,
    state: r.state,
    author: r.author?.login ?? null,
    labels: (r.labels ?? []).map((l) => l.name),
    assignees: (r.assignees ?? []).map((a) => a.login),
    milestone: r.milestone?.title ?? null,
    createdAt: r.createdAt ?? null,
    updatedAt: r.updatedAt ?? null,
    url: r.url ?? null,
  }
}

import { githubContext, ghJson, repoArg } from './client.js'
import { isInteger } from '../git/safety.js'
import type { Result, Release } from '../types.js'

interface ReleaseRow {
  name: string | null
  tagName: string
  url: string | null
  publishedAt: string | null
  author?: { login: string } | null
  body?: string | null
  targetCommitish?: string | null
}

export async function githubReleases(
  input: { limit?: number } = {},
  cwd = process.cwd(),
): Promise<Result<{ releases: Release[] }>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  const limit = Math.min(
    typeof input.limit === 'number' && isInteger(input.limit) && input.limit > 0
      ? input.limit
      : 20,
    50,
  )

  const r = await ghJson<ReleaseRow[]>(
    ctx,
    [
      'release',
      'list',
      '--repo',
      repoArg(ctx),
      `--limit=${limit}`,
      '--json',
      [
        'name',
        'tagName',
        'url',
        'publishedAt',
        'author',
        'body',
        'targetCommitish',
      ].join(','),
    ],
    {
      code: 'GITHUB_QUERY_FAILED',
      message: 'Unable to list GitHub releases.',
      hint: 'Verify gh authentication and repository access.',
    },
  )
  if ('error' in r) return r

  const releases: Release[] = r.map((x) => ({
    name: x.name ?? null,
    tagName: x.tagName,
    url: x.url ?? null,
    publishedAt: x.publishedAt ?? null,
    author: x.author?.login ?? null,
    body: x.body ?? null,
    commit: x.targetCommitish ?? null,
  }))

  return { releases }
}

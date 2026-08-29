import { command } from '../git/exec.js'
import { error } from '../git/repository.js'
import { githubContext, gh, repoArg } from './client.js'
import { ghError, isInteger, isDangerousLeadingDash, hasNul } from '../git/safety.js'
import type { Result } from '../types.js'

export interface PrCreateOptions {
  title?: string
  body?: string
  base?: string
  head?: string
  draft?: boolean
}

export interface PrCreateResult {
  repository: { owner: string; name: string }
  number: number
  title: string | null
  url: string
  base: string
  head: string
  draft: boolean
}

interface CreatedPrJson {
  number: number
  url?: string | null
  title?: string | null
  baseRefName?: string | null
  headRefName?: string | null
  isDraft?: boolean | null
}

function cleanBranch(value: string): string | null {
  if (!value || hasNul(value) || isDangerousLeadingDash(value)) return null
  return value
}

export async function githubPrCreate(
  input: PrCreateOptions = {},
  cwd = process.cwd(),
): Promise<Result<PrCreateResult>> {
  const ctx = await githubContext(cwd)
  if ('error' in ctx) return ctx

  const title = typeof input.title === 'string' ? input.title : undefined
  if (title !== undefined && (hasNul(title) || !title.trim())) {
    return error('INVALID_GIT_ARGUMENT', 'Title must be a non-empty string without NUL bytes.')
  }
  const body = typeof input.body === 'string' ? input.body : undefined
  if (body !== undefined && hasNul(body)) {
    return error('INVALID_GIT_ARGUMENT', 'Body contains a NUL byte.')
  }
  for (const [key, value] of [
    ['base', input.base],
    ['head', input.head],
  ] as const) {
    if (value === undefined) continue
    if (typeof value !== 'string' || hasNul(value) || isDangerousLeadingDash(value)) {
      return error('INVALID_GIT_ARGUMENT', `${key} must be a branch name and must not begin with \`-\`.`)
    }
  }
  if (input.draft !== undefined && typeof input.draft !== 'boolean') {
    return error('INVALID_GIT_ARGUMENT', 'draft must be a boolean.')
  }

  let current: string | null = null
  try {
    current =
      (await command('git', ['branch', '--show-current'], ctx.root)).stdout.trim() || null
  } catch {
    current = null
  }
  const head = input.head ?? current
  if (!head) {
    return error(
      'NO_BRANCH',
      'Cannot determine the head branch.',
      'Pass an explicit head branch or check out a non-detached branch first.',
    )
  }
  const args = ['pr', 'create', '--repo', repoArg(ctx), '--head', head]
  args.push('--base', input.base ?? 'main')
  if (title !== undefined && title.trim()) args.push('--title', title.trim())
  if (body !== undefined && body.trim()) args.push('--body', body.trim())
  else args.push('--fill')
  if (input.draft) args.push('--draft')

  try {
    await gh(ctx, args)
  } catch (e) {
    return ghError(e, {
      code: 'GITHUB_PR_CREATE_FAILED',
      message: 'Unable to create the pull request.',
      hint: 'Verify gh authentication, that the branch is pushed, and that no open PR exists for it.',
    })
  }

  try {
    const out = await gh(ctx, [
      'pr',
      'view',
      '--repo',
      repoArg(ctx),
      '--head',
      head,
      '--json',
      ['number', 'url', 'title', 'baseRefName', 'headRefName', 'isDraft'].join(','),
    ])
    const rows = JSON.parse(out.stdout.trim()) as CreatedPrJson
    const created = Array.isArray(rows) ? rows[0] : rows
    return {
      repository: { owner: ctx.owner, name: ctx.name },
      number: created.number,
      title: created.title ?? title?.trim() ?? null,
      url: created.url ?? '',
      base: cleanBranch(created.baseRefName ?? '') ?? input.base ?? 'main',
      head: cleanBranch(created.headRefName ?? '') ?? head,
      draft: created.isDraft === true,
    }
  } catch {
    // The PR was created but the follow-up read failed; report success with
    // what we know locally instead of masking a completed mutation.
    return {
      repository: { owner: ctx.owner, name: ctx.name },
      number: 0,
      title: title?.trim() ?? null,
      url: '',
      base: input.base ?? 'main',
      head,
      draft: input.draft === true,
    }
  }
}

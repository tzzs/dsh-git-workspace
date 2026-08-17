import { command } from '../git/exec.js'
import { repository, getGitHubRemote, error } from '../git/repository.js'
import {
  ghError,
  collectJson,
} from '../git/safety.js'
import type { Result } from '../types.js'

export interface GithubContext {
  owner: string
  name: string
  root: string
}

export async function githubContext(
  cwd = process.cwd(),
): Promise<Result<GithubContext>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  if (!r.remote) {
    return error(
      'NO_GITHUB_REMOTE',
      'No GitHub remote named origin was found.',
      'Add an origin remote pointing to a GitHub repository.',
    )
  }
  const remote = getGitHubRemote(r.remote)
  if (!remote) {
    return error(
      'NOT_GITHUB_REPOSITORY',
      'The origin remote is not a GitHub repository.',
    )
  }
  return { owner: remote.owner, name: remote.name, root: r.root }
}

export async function gh(
  ctx: GithubContext,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return command('gh', args, ctx.root)
}

export async function ghJson<T>(
  ctx: GithubContext,
  args: string[],
  fallback: { code: string; message: string; hint?: string },
): Promise<Result<T>> {
  try {
    const out = await gh(ctx, args)
    return collectJson<T>(out.stdout) as unknown as T
  } catch (e) {
    return ghError(e, fallback)
  }
}

export async function ghJsonMany<T>(
  ctx: GithubContext,
  args: string[],
  fallback: { code: string; message: string; hint?: string },
): Promise<Result<T[]>> {
  try {
    const out = await gh(ctx, args)
    return collectJson<T>(out.stdout)
  } catch (e) {
    return ghError(e, fallback)
  }
}

export function repoArg(ctx: GithubContext): string {
  return `${ctx.owner}/${ctx.name}`
}

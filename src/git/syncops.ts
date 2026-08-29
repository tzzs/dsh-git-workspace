import { command } from './exec.js'
import { repository, error } from './repository.js'
import type { Result, ToolError } from '../types.js'

export interface SyncOperationResult {
  operation: string
  upstream: string | null
  pushed: boolean
}

function stderrOf(e: unknown): string {
  return String((e as {stderr?: unknown}).stderr ?? '').trim()
}

async function upstream(root: string): Promise<Result<{upstream: string}>> {
  try {
    const out = await command(
      'git',
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
      root,
    )
    const value = out.stdout.trim()
    if (!value) return error('NO_UPSTREAM', 'The current branch has no upstream.')
    return {upstream: value}
  } catch {
    return error(
      'NO_UPSTREAM',
      'The current branch has no configured upstream.',
      'Publish the branch first or set an upstream with git push -u.',
    )
  }
}

async function fastForward(
  root: string,
  ref: string,
): Promise<{error: ToolError} | null> {
  try {
    await command('git', ['merge', '--ff-only', ref], root)
  } catch (e) {
    const text = stderrOf(e)
    if (/not possible to fast-forward|diverged/i.test(text)) {
      return error(
        'NOT_FAST_FORWARDABLE',
        'The local branch and its upstream have diverged.',
        'Use /git-rebase or resolve the divergence manually before syncing.',
      )
    }
    if (/conflict/i.test(text)) {
      return error(
        'GIT_CONFLICT',
        'Fast-forward stopped because of conflicts.',
        'Resolve the conflicted files before continuing.',
      )
    }
    return error(
      'GIT_COMMAND_FAILED',
      `Unable to fast-forward to ${ref}: ${text.split('\n')[0] || 'unknown error'}`,
    )
  }
  return null
}

export async function gitFetch(cwd = process.cwd()): Promise<Result<SyncOperationResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  try {
    await command('git', ['fetch', '--all', '--prune'], r.root)
  } catch (e) {
    const text = stderrOf(e)
    return error(
      'GIT_FETCH_FAILED',
      `Unable to fetch remotes${text ? `: ${text.split('\n')[0]}` : '.'}`,
    )
  }
  return {operation: 'fetch', upstream: null, pushed: false}
}

export async function gitPull(cwd = process.cwd()): Promise<Result<SyncOperationResult>> {
  const fetched = await gitFetch(cwd)
  if ('error' in fetched) return fetched
  const r = await repository(cwd)
  if ('error' in r) return r
  const u = await upstream(r.root)
  if ('error' in u) return u
  const conflict = await fastForward(r.root, u.upstream)
  if (conflict) return conflict
  return {operation: 'pull', upstream: u.upstream, pushed: false}
}

export async function gitFastForward(cwd = process.cwd()): Promise<Result<SyncOperationResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  const u = await upstream(r.root)
  if ('error' in u) return u
  try {
    await command('git', ['fetch'], r.root)
  } catch {}
  const conflict = await fastForward(r.root, u.upstream)
  if (conflict) return conflict
  return {operation: 'fast-forward', upstream: u.upstream, pushed: false}
}

export async function gitSync(cwd = process.cwd()): Promise<Result<SyncOperationResult>> {
  const pulled = await gitPull(cwd)
  if ('error' in pulled) return pulled
  return {operation: 'sync', upstream: pulled.upstream, pushed: true}
}

export async function gitRebase(cwd = process.cwd()): Promise<Result<SyncOperationResult>> {
  const fetched = await gitFetch(cwd)
  if ('error' in fetched) return fetched
  const r = await repository(cwd)
  if ('error' in r) return r
  const u = await upstream(r.root)
  if ('error' in u) return u
  try {
    await command('git', ['rebase', u.upstream], r.root)
  } catch (e) {
    const text = stderrOf(e)
    if (/conflict/i.test(text)) {
      return error(
        'REBASE_CONFLICT',
        'Rebase stopped because of conflicts.',
        'Resolve each conflict, run git rebase --continue, or abort with git rebase --abort.',
      )
    }
    return error(
      'GIT_REBASE_FAILED',
      `Unable to rebase onto ${u.upstream}: ${text.split('\n')[0] || 'unknown error'}`,
    )
  }
  return {operation: 'rebase', upstream: u.upstream, pushed: false}
}

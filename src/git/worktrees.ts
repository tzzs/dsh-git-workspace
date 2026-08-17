import { command } from './exec.js'
import { repository, error } from './repository.js'
import type { Result, Worktree } from '../types.js'

export async function gitWorktrees(
  cwd = process.cwd(),
): Promise<Result<{ worktrees: Worktree[] }>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  try {
    const out = await command(
      'git',
      [
        'worktree',
        'list',
        '--porcelain',
        '-z',
      ],
      r.root,
    )
    const tokens = out.stdout.split('\0')
    const worktrees: Worktree[] = []
    let current: Partial<Worktree> | null = null
    for (const token of tokens) {
      for (const line of token.split('\n')) {
        if (line.startsWith('worktree ')) {
          if (current && current.path) {
            worktrees.push({
              path: current.path,
              branch: current.branch ?? null,
              commit: current.commit ?? '',
              bare: current.bare ?? false,
              detached: current.detached ?? false,
            })
          }
          current = { path: line.slice('worktree '.length) }
        } else if (current) {
          if (line.startsWith('HEAD ')) {
            current.commit = line.slice('HEAD '.length)
          } else if (line.startsWith('branch refs/heads/')) {
            current.branch = line.slice('branch refs/heads/'.length)
            current.detached = false
          } else if (line.startsWith('detached')) {
            current.detached = true
            current.branch = null
          } else if (line.startsWith('bare')) {
            current.bare = true
          }
        }
      }
    }
    if (current && current.path) {
      worktrees.push({
        path: current.path,
        branch: current.branch ?? null,
        commit: current.commit ?? '',
        bare: current.bare ?? false,
        detached: current.detached ?? false,
      })
    }
    return { worktrees }
  } catch {
    return error('GIT_COMMAND_FAILED', 'Unable to list Git worktrees.')
  }
}

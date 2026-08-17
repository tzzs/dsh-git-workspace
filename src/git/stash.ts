import { command } from './exec.js'
import { repository, error } from './repository.js'
import type { Result, Stash } from '../types.js'

export async function gitStash(
  cwd = process.cwd(),
): Promise<Result<{ stashes: Stash[] }>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  try {
    const out = await command(
      'git',
      [
        'stash',
        'list',
        '--format=%gd%x1f%H%x1f%gs%x1f%b%x1e',
      ],
      r.root,
    )
    const stashes: Stash[] = []
    for (const chunk of out.stdout.split('\x1e')) {
      const cleaned = chunk.replace(/[\x1f\n\r]/g, ' ').trim()
      if (!cleaned) continue
      const [gd, sha, gs] = chunk.trim().split('\x1f')
      if (!gd || !gs) continue
      const indexMatch = gd.match(/^stash@\{(\d+)\}/)
      const index = indexMatch ? Number(indexMatch[1]) : stashes.length
      const branchMatch = gs.match(/^WIP on ([^:]+)/)
      stashes.push({
        index,
        message: gs.replace(/^WIP on .*?: /, ''),
        branch: branchMatch ? branchMatch[1] : null,
        sha: sha || gd,
      })
    }
    return { stashes }
  } catch {
    return error('GIT_COMMAND_FAILED', 'Unable to list Git stash.')
  }
}

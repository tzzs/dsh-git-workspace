import { gitStatus } from './status.js'
import { command } from './exec.js'
import { repository } from './repository.js'
import type { Result, GitFile } from '../types.js'

export type Scope = 'working-tree' | 'staged' | 'committed' | 'all'

async function listCommitted(
  root: string,
): Promise<Result<{ files: GitFile[] }>> {
  try {
    const text = (
      await command('git', ['ls-tree', '-r', '--name-only', '-z', 'HEAD'], root)
    ).stdout
    return {
      files: text
        .split('\0')
        .filter(Boolean)
        .map(
          (path): GitFile => ({
            path,
            status: 'committed',
            staged: false,
            unstaged: false,
          }),
        ),
    }
  } catch {
    return {
      error: {
        code: 'GIT_COMMAND_FAILED',
        message: 'Unable to list committed files.',
      },
    }
  }
}

export async function gitFiles(
  scope: Scope = 'working-tree',
  cwd = process.cwd(),
): Promise<Result<{ files: GitFile[] }>> {
  const r = await repository(cwd)
  if ('error' in r) return r

  if (scope === 'committed') {
    return listCommitted(r.root)
  }

  const s = await gitStatus(r.root)
  if ('error' in s) return s
  let f = s.files

  if (scope === 'staged') f = f.filter((x) => x.staged)

  if (scope === 'all') {
    const committed = await listCommitted(r.root)
    if ('error' in committed) return committed
    const changed = new Set(f.map((x) => x.path))
    f = [...committed.files.filter((x) => !changed.has(x.path)), ...f]
  }

  return { files: f }
}

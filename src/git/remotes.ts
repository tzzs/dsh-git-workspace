import { listRemotes } from './repository.js'
import type { Result, Remote } from '../types.js'

export interface RemotesResult {
  origin?: string | null
  upstream?: string | null
  remotes: Remote[]
}

export async function gitRemotes(
  cwd = process.cwd(),
): Promise<Result<RemotesResult>> {
  const r = await listRemotes(cwd)
  if ('error' in r) return r
  const origin = r.remotes.find((x) => x.name === 'origin')?.fetchUrl ?? null
  const upstream =
    r.remotes.find((x) => x.name === 'upstream')?.fetchUrl ?? null
  return { origin, upstream, remotes: r.remotes }
}

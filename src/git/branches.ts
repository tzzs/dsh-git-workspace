import { command } from './exec.js'
import { repository, error } from './repository.js'
import type { Result } from '../types.js'

export interface BranchInfo {
  name: string
  current: boolean
  remote: string | null
  upstream: string | null
  ahead: number
  behind: number
}

export interface BranchesResult {
  current: string | null
  branches: BranchInfo[]
}

export async function gitBranches(
  cwd = process.cwd(),
): Promise<Result<BranchesResult>> {
  const r = await repository(cwd)
  if ('error' in r) return r

  try {
    const currentOut = await command(
      'git',
      ['branch', '--show-current'],
      r.root,
    )
    const current = currentOut.stdout.trim() || null

    const localOut = await command(
      'git',
      [
        'for-each-ref',
        '--format=%(refname:short)%00%(upstream:short)%00%(upstream:track)',
        'refs/heads',
      ],
      r.root,
    ).catch(() => null)

    const localBranches = new Map<
      string,
      { upstream: string | null; ahead: number; behind: number }
    >()
    if (localOut) {
      for (const line of localOut.stdout.split('\n')) {
        if (!line.trim()) continue
        const [name, upstream, track] = line.split('\0')
        if (!name) continue
        let ahead = 0
        let behind = 0
        if (track) {
          const m = track.match(/\[ahead (\d+)\]/)
          if (m) ahead = Number(m[1])
          const m2 = track.match(/\[behind (\d+)\]/)
          if (m2) behind = Number(m2[1])
        }
        localBranches.set(name, { upstream: upstream || null, ahead, behind })
      }
    }

    const remoteOut = await command(
      'git',
      ['for-each-ref', '--format=%(refname:short)', 'refs/remotes'],
      r.root,
    ).catch(() => null)

    const remoteBranches = new Set<string>()
    if (remoteOut) {
      for (const line of remoteOut.stdout.split('\n')) {
        if (line.trim()) remoteBranches.add(line.trim())
      }
    }

    const branches: BranchInfo[] = []
    for (const [name, info] of localBranches) {
      branches.push({
        name,
        current: name === current,
        remote: remoteBranches.has(`origin/${name}`)
          ? `origin/${name}`
          : null,
        upstream: info.upstream,
        ahead: info.ahead,
        behind: info.behind,
      })
    }

    branches.sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return { current, branches }
  } catch {
    return error('GIT_COMMAND_FAILED', 'Unable to list Git branches.')
  }
}

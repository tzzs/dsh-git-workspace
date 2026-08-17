import { command } from './exec.js'
import type {
  Result,
  ToolError,
  RepositoryInfo,
  Remote,
} from '../types.js'

export interface Repository {
  root: string
  name: string
  remote: string | null
}

export function error(
  code: string,
  message: string,
  hint?: string,
): { error: ToolError } {
  return { error: { code, message, ...(hint ? { hint } : {}) } }
}

export async function repository(
  cwd = process.cwd(),
): Promise<Result<Repository>> {
  try {
    const root = (
      await command('git', ['rev-parse', '--show-toplevel'], cwd)
    ).stdout.trim()
    let remote: string | null = null
    try {
      remote =
        (await command('git', ['remote', 'get-url', 'origin'], root)).stdout
          .trim() || null
    } catch {
      remote = null
    }
    return {
      root,
      name: root.split(/[\\/]/).pop() || root,
      remote,
    }
  } catch {
    return error(
      'NOT_A_GIT_REPOSITORY',
      'Current directory is not a Git repository.',
      'Run this tool inside a Git repository.',
    )
  }
}

export async function gitRoot(
  cwd = process.cwd(),
): Promise<Result<Repository>> {
  try {
    const root = (await command('git', ['rev-parse', '--show-toplevel'], cwd))
      .stdout.trim()
    let remote: string | null = null
    try {
      remote =
        (await command('git', ['remote', 'get-url', 'origin'], root)).stdout
          .trim() || null
    } catch {
      remote = null
    }
    return {
      root,
      name: root.split(/[\\/]/).pop() || root,
      remote,
    }
  } catch {
    return error(
      'NOT_A_GIT_REPOSITORY',
      'Current directory is not a Git repository.',
      'Run this tool inside a Git repository.',
    )
  }
}

export function parseGitRemote(
  input: string,
): { host: string; owner: string; repository: string } | null {
  let s = input.trim().replace(/\.git$/, '')
  let m = s.match(/^(?:\w+@)?([^/:]+)[:/]([^/]+)\/([^/]+)$/)
  if (!m) {
    try {
      const u = new URL(s)
      m = [
        s,
        u.hostname,
        u.pathname.split('/')[1] ?? '',
        u.pathname.split('/')[2] ?? '',
      ] as unknown as RegExpMatchArray
    } catch {
      return null
    }
  }
  return m[1] && m[2] && m[3]
    ? { host: m[1], owner: m[2], repository: m[3] }
    : null
}

export function isGitHubRemote(url: string | null): boolean {
  if (!url) return false
  const parsed = parseGitRemote(url)
  return !!parsed && parsed.host.toLowerCase().includes('github')
}

export function getGitHubRemote(
  url: string | null,
): { host: string; owner: string; name: string } | null {
  if (!url) return null
  const parsed = parseGitRemote(url)
  if (!parsed || !parsed.host.toLowerCase().includes('github')) return null
  return { host: parsed.host, owner: parsed.owner, name: parsed.repository }
}

export async function listRemotes(
  cwd = process.cwd(),
): Promise<Result<{ remotes: Remote[] }>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  try {
    const out = await command(
      'git',
      ['remote', '--verbose'],
      r.root,
    )
    const map = new Map<string, { fetchUrl: string | null; pushUrl: string | null }>()
    for (const line of out.stdout.split('\n')) {
      const m = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/)
      if (!m) continue
      const [, name, url, kind] = m
      const entry = map.get(name) ?? { fetchUrl: null, pushUrl: null }
      if (kind === 'fetch') entry.fetchUrl = url
      else if (kind === 'push') entry.pushUrl = url
      map.set(name, entry)
    }
    const remotes: Remote[] = []
    for (const [name, urls] of map) {
      const github = getGitHubRemote(urls.fetchUrl ?? urls.pushUrl)
      remotes.push({ name, ...urls, github })
    }
    return { remotes }
  } catch {
    return error('GIT_COMMAND_FAILED', 'Unable to list Git remotes.')
  }
}

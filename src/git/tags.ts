import { command } from './exec.js'
import { repository, error } from './repository.js'
import type { Result, Tag } from '../types.js'

export async function gitTags(
  cwd = process.cwd(),
): Promise<Result<{ tags: Tag[] }>> {
  const r = await repository(cwd)
  if ('error' in r) return r
  try {
    const out = await command(
      'git',
      [
        'for-each-ref',
        '--format=%(refname:short)%00%(objectname)%00%(taggername)%00%(taggerdate:iso8601)%00%(creatordate:iso8601)%0a',
        'refs/tags',
      ],
      r.root,
    )
    const tags: Tag[] = []
    for (const line of out.stdout.split('\n')) {
      if (!line.trim()) continue
      const [name, commit, tagger, taggerDate, creatorDate] = line.split('\0')
      if (!name || !commit) continue
      tags.push({
        name,
        commit,
        tagger: tagger || null,
        date: taggerDate || creatorDate || null,
      })
    }
    tags.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    return { tags }
  } catch {
    return error('GIT_COMMAND_FAILED', 'Unable to list Git tags.')
  }
}

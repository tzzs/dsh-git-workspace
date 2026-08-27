// Text serialization for read-only native command results. Each formatter
// turns one tool success value into the concise summary the dispatching UI
// shows after `/git-…` runs. The command wrapper has already narrowed the
// `Result<T>` union to the success branch before these are invoked.

function firstLine(s: string | null | undefined): string {
  return String(s || '').split('\n')[0] ?? ''
}

function letter(status: string | undefined | null): string {
  if (!status) return '?'
  return status.charAt(0).toUpperCase()
}

type FileLike = {
  path?: string
  oldPath?: string | null
  status?: string
  additions?: number
  deletions?: number
  binary?: boolean
}

function fileLine(f: FileLike): string {
  const p = f.oldPath ? `${f.oldPath} -> ${f.path}` : f.path || ''
  const stats =
    f.binary ? ' (binary)'
    : f.additions != null || f.deletions != null ? ` (+${f.additions ?? 0}/-${f.deletions ?? 0})`
    : ''
  return `  ${letter(f.status)} ${p}${stats}`
}

function diffSummary(files: FileLike[]): string[] {
  if (files.length === 0) return ['no diff']
  const add = files.reduce((n, f) => n + (f.additions ?? 0), 0)
  const del = files.reduce((n, f) => n + (f.deletions ?? 0), 0)
  return [
    `${files.length} file(s) changed, ${add} insertions(+), ${del} deletions(-)`,
    ...files.map(fileLine),
  ]
}

export function formatStatus(value: {
  branch?: {name?: string | null; upstream?: string | null; ahead?: number; behind?: number}
  files?: FileLike[]
}): string {
  const b = value.branch || {}
  const up = b.upstream
    ? `${b.upstream}${b.ahead || b.behind ? ` (+${b.ahead ?? 0}/-${b.behind ?? 0})` : ''}`
    : 'no upstream'
  const files = value.files || []
  return [`branch: ${b.name || 'HEAD'} (${up})`, `files: ${files.length}`, ...files.map(fileLine)].join('\n')
}

export function formatFiles(value: {files?: FileLike[]}): string {
  const files = value.files || []
  if (files.length === 0) return 'files: 0'
  return [`files: ${files.length}`, ...files.map(fileLine)].join('\n')
}

export function formatDiff(value: {files?: FileLike[]; raw?: string}): string {
  const files = value.files || []
  return [...diffSummary(files), `raw: ${(value.raw || '').split('\n').length} line(s)`].join('\n')
}

export function formatCommits(value: {
  commits?: Array<{shortSha?: string; sha?: string; date?: string; author?: string; message?: string}>
}): string {
  const commits = value.commits || []
  if (commits.length === 0) return 'commits: 0'
  return [
    `commits: ${commits.length}`,
    ...commits.map((c) => `  ${c.shortSha || (c.sha || '').slice(0, 7)} ${c.date || ''} ${c.author || ''} ${firstLine(c.message)}`),
  ].join('\n')
}

export function formatShow(value: {
  commit?: {sha?: string; shortSha?: string; author?: string; date?: string; message?: string}
  files?: FileLike[]
}): string {
  const c = value.commit || {}
  const lines = [
    `${c.shortSha || (c.sha || '').slice(0, 7)} ${c.date || ''} ${c.author || ''}`,
    firstLine(c.message),
  ]
  const files = value.files || []
  if (files.length > 0) return [...lines, ...diffSummary(files)].join('\n')
  return lines.join('\n')
}

export function formatCompare(value: {
  base?: string
  head?: string
  ahead?: number
  behind?: number
  files?: FileLike[]
}): string {
  const lines = [`${value.base || 'base'}..${value.head || 'head'}: ${value.ahead ?? 0} ahead, ${value.behind ?? 0} behind`]
  const files = value.files || []
  if (files.length > 0) return [...lines, ...diffSummary(files)].join('\n')
  return lines.join('\n')
}

export function formatBlame(value: {
  path?: string
  revision?: string
  lines?: Array<{line?: number; shortCommit?: string; author?: string; date?: string; content?: string}>
}): string {
  const lines = value.lines || []
  return [
    `blame ${value.path || ''} @ ${value.revision || ''}: ${lines.length} line(s)`,
    ...lines.map((l) => `  ${l.line}: ${l.shortCommit || ''} ${l.author || ''} ${l.date || ''} ${firstLine(l.content)}`),
  ].join('\n')
}

export function formatBranches(value: {
  current?: string | null
  branches?: Array<{name?: string; current?: boolean; upstream?: string | null; ahead?: number; behind?: number}>
}): string {
  const bs = value.branches || []
  return [
    `current: ${value.current || 'HEAD'}`,
    `branches: ${bs.length}`,
    ...bs.map((b) => `  ${b.current ? '*' : ' '} ${b.name}${b.upstream ? ` -> ${b.upstream}` : ''}${b.ahead || b.behind ? ` (+${b.ahead ?? 0}/-${b.behind ?? 0})` : ''}`),
  ].join('\n')
}

export function formatRemotes(value: {
  origin?: string | null
  upstream?: string | null
  remotes?: Array<{name?: string; fetchUrl?: string | null; pushUrl?: string | null}>
}): string {
  const rs = value.remotes || []
  return [
    `origin: ${value.origin || '-'}`,
    `upstream: ${value.upstream || '-'}`,
    `remotes: ${rs.length}`,
    ...rs.map((r) => `  ${r.name} fetch=${r.fetchUrl || '-'} push=${r.pushUrl || '-'}`),
  ].join('\n')
}

export function formatWorktrees(value: {
  worktrees?: Array<{path?: string; branch?: string | null; commit?: string; bare?: boolean; detached?: boolean}>
}): string {
  const ws = value.worktrees || []
  return [
    `worktrees: ${ws.length}`,
    ...ws.map((w) => `  ${w.path} ${w.branch || '(detached)'} ${(w.commit || '').slice(0, 7)}${w.bare ? ' (bare)' : ''}`),
  ].join('\n')
}

export function formatStash(value: {
  stashes?: Array<{index?: number; message?: string; branch?: string | null; sha?: string}>
}): string {
  const ss = value.stashes || []
  return [
    `stash: ${ss.length} entry(ies)`,
    ...ss.map((s) => `  stash@{${s.index ?? 0}} ${s.branch ? `on ${s.branch}: ` : ''}${firstLine(s.message)} (${(s.sha || '').slice(0, 7)})`),
  ].join('\n')
}

export function formatTags(value: {
  tags?: Array<{name?: string; commit?: string; tagger?: string | null; date?: string | null}>
}): string {
  const ts = value.tags || []
  return [
    `tags: ${ts.length}`,
    ...ts.map((t) => `  ${t.name} ${(t.commit || '').slice(0, 7)}${t.tagger ? ` ${t.tagger}` : ''}${t.date ? ` (${t.date})` : ''}`),
  ].join('\n')
}

export function formatWorkspace(value: {
  repository?: {name?: string}
  branch?: {name?: string | null; ahead?: number; behind?: number}
  changes?: Record<string, number>
  clean?: boolean
  commits?: {ahead?: number}
  pullRequest?: {number?: number; title?: string; state?: string} | null
  ci?: {status?: string} | null
}): string {
  const c = value.changes || {}
  const counts = ['modified', 'staged', 'deleted', 'renamed', 'untracked']
    .map((k) => `${k.charAt(0)}${c[k] ?? 0}`)
    .join(' ')
  const ahead = value.commits?.ahead ?? value.branch?.ahead ?? 0
  const pr = value.pullRequest
    ? `, PR #${value.pullRequest.number} ${firstLine(value.pullRequest.title)} [${(value.pullRequest.state || '').toUpperCase()}]`
    : ', no PR'
  const ci = value.ci ? `, CI ${value.ci.status}` : ''
  return `workspace: ${value.repository?.name || 'repo'} @ ${value.branch?.name || 'HEAD'} ${value.clean ? 'clean' : `dirty (${counts})`}${ahead ? `, ${ahead} commit(s) ahead` : ''}${pr}${ci}`
}

export function formatPr(value: {
  branch?: string | null
  pullRequests?: Array<{
    number?: number
    title?: string
    state?: string
    draft?: boolean
    stats?: {additions?: number; deletions?: number}
    mergeable?: string | null
  }>
}): string {
  const prs = value.pullRequests || []
  if (prs.length === 0) return `branch ${value.branch || '(current)'}: 0 pull requests`
  return [
    `branch ${value.branch || '(current)'}: ${prs.length} pull request(s)`,
    ...prs.map((p) => `  #${p.number} [${p.draft ? 'DRAFT' : (p.state || '').toUpperCase()}] ${firstLine(p.title)} +${p.stats?.additions ?? 0}/-${p.stats?.deletions ?? 0}${p.mergeable ? ` mergeable=${p.mergeable}` : ''}`),
  ].join('\n')
}

export function formatPrDiff(value: {pullRequest?: number; files?: FileLike[]}): string {
  return [`PR #${value.pullRequest ?? '?'}`, ...diffSummary(value.files || [])].join('\n')
}

export function formatPrReviews(value: {
  pullRequest?: number
  reviews?: Array<{author?: string | null; state?: string; body?: string | null; submittedAt?: string | null}>
}): string {
  const rs = value.reviews || []
  return [
    `PR #${value.pullRequest ?? '?'}: ${rs.length} review(s)`,
    ...rs.map((r) => `  ${r.state || ''} by ${r.author || 'unknown'}${r.submittedAt ? ` (${r.submittedAt})` : ''}${r.body ? `: ${firstLine(r.body)}` : ''}`),
  ].join('\n')
}

export function formatPrComments(value: {
  pullRequest?: number
  comments?: Array<{author?: string | null; body?: string; path?: string | null; line?: number | null; resolved?: boolean}>
}): string {
  const cs = value.comments || []
  return [
    `PR #${value.pullRequest ?? '?'}: ${cs.length} comment(s)`,
    ...cs.map((c) => `  ${c.author || 'unknown'}${c.path ? ` ${c.path}${c.line != null ? `:${c.line}` : ''}` : ''}: ${firstLine(c.body)}${c.resolved ? ' [resolved]' : ''}`),
  ].join('\n')
}

export function formatCi(value: {
  status?: string
  branch?: string | null
  pullRequest?: number | null
  checks?: Array<{name?: string; status?: string; conclusion?: string | null; workflow?: string | null}>
}): string {
  const cs = value.checks || []
  const where = value.pullRequest ? `PR #${value.pullRequest}` : `branch ${value.branch || '(current)'}`
  return [
    `CI ${value.status || 'unknown'} (${where}), ${cs.length} check(s)`,
    ...cs.map((c) => `  ${c.name}: ${c.status}${c.conclusion ? ` / ${c.conclusion}` : ''}${c.workflow ? ` (${c.workflow})` : ''}`),
  ].join('\n')
}

export function formatCiLogs(value: {
  runId?: number | null
  jobId?: number | null
  totalLines?: number
  offset?: number
  limit?: number
  logs?: string[]
}): string {
  const logs = value.logs || []
  return [
    `run ${value.runId ?? '?'}${value.jobId ? ` job ${value.jobId}` : ''}: ${value.totalLines ?? 0} line(s), showing ${logs.length}${value.offset ? ` from ${value.offset}` : ''}`,
    ...logs.map((l) => `  ${l}`),
  ].join('\n')
}

export function formatIssue(value: {
  number?: number
  title?: string
  state?: string
  author?: string | null
  labels?: string[]
  milestone?: string | null
  body?: string | null
  url?: string | null
}): string {
  const lines = [
    `#${value.number ?? '?'} ${firstLine(value.title)} [${(value.state || '').toUpperCase()}] by ${value.author || 'unknown'}${value.milestone ? `, milestone ${value.milestone}` : ''}`,
  ]
  const labels = (value.labels || []).join(', ')
  if (labels) lines.push(`labels: ${labels}`)
  if (value.body) lines.push(firstLine(value.body))
  if (value.url) lines.push(value.url)
  return lines.join('\n')
}

export function formatIssueComments(value: {
  issue?: number
  comments?: Array<{author?: string | null; body?: string; createdAt?: string | null}>
}): string {
  const cs = value.comments || []
  return [
    `issue #${value.issue ?? '?'}: ${cs.length} comment(s)`,
    ...cs.map((c) => `  ${c.author || 'unknown'}${c.createdAt ? ` (${c.createdAt})` : ''}: ${firstLine(c.body)}`),
  ].join('\n')
}

export function formatReleases(value: {
  releases?: Array<{tagName?: string; name?: string | null; publishedAt?: string | null; author?: string | null; url?: string | null}>
}): string {
  const rs = value.releases || []
  return [
    `releases: ${rs.length}`,
    ...rs.map((r) => `  ${r.tagName}${r.name ? ` ${r.name}` : ''}${r.publishedAt ? ` (${r.publishedAt})` : ''}${r.author ? ` by ${r.author}` : ''}${r.url ? ` ${r.url}` : ''}`),
  ].join('\n')
}

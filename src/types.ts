export type GitFileStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'committed'
  | 'unknown'

export interface ToolError {
  code: string
  message: string
  hint?: string
}

export type Result<T> = T | { error: ToolError }

export interface Branch {
  name: string | null
  upstream: string | null
  ahead: number
  behind: number
}

export interface GitFile {
  path: string
  oldPath?: string | null
  status: GitFileStatus
  staged: boolean
  unstaged?: boolean
}

export interface CommitSummary {
  sha: string
  shortSha: string
  message: string
  author: string
  date: string
  files?: {
    count: number
    additions: number
    deletions: number
  }
}

export interface Hunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export interface DiffFile {
  path: string
  oldPath: string | null
  status: string
  binary?: boolean
  additions: number
  deletions: number
  hunks: Hunk[]
  raw?: string
}

export interface RepositoryInfo {
  root: string
  name: string
  remote: string | null
  github?: {
    host: string
    owner: string
    name: string
  } | null
}

export interface Remote {
  name: string
  fetchUrl: string | null
  pushUrl: string | null
  github?: {
    host: string
    owner: string
    name: string
  } | null
}

export interface Worktree {
  path: string
  branch: string | null
  commit: string
  bare: boolean
  detached: boolean
}

export interface Stash {
  index: number
  message: string
  branch: string | null
  sha: string
}

export interface Tag {
  name: string
  commit: string
  tagger?: string | null
  date?: string | null
}

export interface PullRequest {
  number: number
  title: string
  body: string | null
  state: string
  draft: boolean
  author: string | null
  base: string
  head: string
  url: string
  createdAt: string | null
  updatedAt: string | null
  stats: {
    files: number
    additions: number
    deletions: number
  }
  reviewDecision: string | null
  mergeable: string | null
  merged: boolean
}

export interface Review {
  id: string
  author: string
  state: string
  body: string | null
  submittedAt: string | null
}

export interface ReviewComment {
  id: string
  author: string
  body: string
  path: string | null
  line: number | null
  side: string | null
  commit: string | null
  createdAt: string | null
  updatedAt: string | null
  resolved: boolean
  url: string | null
}

export interface CheckRun {
  name: string
  status: string
  conclusion: string | null
  workflow: string | null
  url: string | null
}

export interface Issue {
  number: number
  title: string
  body: string | null
  state: string
  author: string | null
  labels: string[]
  assignees: string[]
  milestone: string | null
  createdAt: string | null
  updatedAt: string | null
  url: string | null
}

export interface IssueComment {
  id: string
  author: string
  body: string
  createdAt: string | null
  updatedAt: string | null
  url: string | null
}

export interface Release {
  name: string | null
  tagName: string
  url: string | null
  publishedAt: string | null
  author: string | null
  body: string | null
  commit: string | null
}

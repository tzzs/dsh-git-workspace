import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, mkdir, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { githubPr } from '../lib/github/pr.js'
import { githubPrDiff } from '../lib/github/pr_diff.js'
import { githubPrReviews } from '../lib/github/pr_reviews.js'
import { githubPrComments } from '../lib/github/pr_comments.js'
import { githubCi } from '../lib/github/ci.js'
import { githubCiLogs } from '../lib/github/ci_logs.js'
import { githubIssue } from '../lib/github/issue.js'
import { githubIssueComments } from '../lib/github/issue_comments.js'
import { githubReleases } from '../lib/github/releases.js'

const run = promisify(execFile)
async function git(cwd, args) {
  return run('git', args, { cwd, encoding: 'utf8' })
}

async function setupFixture(ghBody) {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-ghtools-'))
  const bin = await mkdtemp(join(tmpdir(), 'dsh-ghtools-bin-'))
  const gh = join(bin, 'gh')
  await git(cwd, ['init', '-q'])
  await git(cwd, ['config', 'user.email', 't@example.com'])
  await git(cwd, ['config', 'user.name', 'Test'])
  await writeFile(join(cwd, 'a.txt'), 'a\n')
  await git(cwd, ['add', 'a.txt'])
  await git(cwd, ['commit', '-qm', 'init'])
  await git(cwd, ['remote', 'add', 'origin', 'https://github.com/owner/repo.git'])
  await writeFile(gh, ghBody)
  await chmod(gh, 0o755)
  const old = process.env.PATH
  process.env.PATH = `${bin}:${old}`
  return { cwd, restore: () => (process.env.PATH = old) }
}

const DISPATCH = `#!/bin/sh
if [ "$1" = "pr" ]; then
  case "$2" in
    list)
      printf '%s' '[{"number":1,"title":"one","body":"b1","state":"OPEN","isDraft":false,"author":{"login":"alice"},"baseRefName":"main","headRefName":"feature","url":"https://github.com/owner/repo/pull/1","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z","additions":5,"deletions":2,"reviewDecision":"APPROVED","mergeable":"MERGEABLE","merged":false,"files":{"totalCount":2}}]'
      ;;
    view)
      if echo "$@" | grep -q -- '--jq .reviews'; then
        printf '%s' '[{"id":"r1","author":{"login":"alice"},"state":"APPROVED","body":"looks good","submittedAt":"2026-01-02T00:00:00Z"}]'
      else
        printf '%s' '{"comments":[{"id":"c1","author":{"login":"bob"},"body":"conversation comment","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z","url":"https://github.com/owner/repo/pull/1#c1"}],"reviewThreads":[{"id":"t1","isResolved":false,"isOutdated":false,"comments":[{"id":"ic1","author":{"login":"carol"},"body":"inline comment","path":"src/index.ts","line":3,"side":"RIGHT","commit":"abc123","createdAt":"2026-01-02T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z","url":"https://github.com/owner/repo/pull/1#ic1"}]}]}'
      fi
      ;;
    diff)
      printf '%s' 'diff --git a/src/index.ts b/src/index.ts
index 123..456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 line1
-line2
+line2 changed
+line3 new
diff --git a/README.md b/README.md
new file mode 100644
index 000..abc
--- /dev/null
+++ b/README.md
@@ -0,0 +1,2 @@
+hello
+world
'
      ;;
    checks)
      printf '%s' '[{"name":"test","state":"completed","conclusion":"failure","workflow":"CI","url":"https://github.com/owner/repo/actions/runs/1"}]'
      ;;
  esac
elif [ "$1" = "run" ]; then
  if [ "$2" = "list" ]; then
    printf '%s' '[{"name":"build","status":"completed","conclusion":"success","workflowName":"CI","url":"https://github.com/owner/repo/actions/runs/2","headSha":"abc"}]'
  else
    printf '%s\n' 'line1 of log'
    printf '%s\n' 'line2 of log'
    printf '%s\n' 'line3 of log'
  fi
elif [ "$1" = "issue" ]; then
  if echo "$@" | grep -q 'comments'; then
    printf '%s' '[{"id":"cc1","author":{"login":"dave"},"body":"issue comment","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z","url":"https://github.com/owner/repo/issues/9#cc1"}]'
  else
    printf '%s' '{"number":9,"title":"bug","body":"details","state":"OPEN","author":{"login":"alice"},"labels":[{"name":"bug"},{"name":"p1"}],"assignees":[{"login":"bob"}],"milestone":{"title":"v2"},"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z","url":"https://github.com/owner/repo/issues/9"}'
  fi
elif [ "$1" = "release" ]; then
  printf '%s' '[{"name":"v1.0","tagName":"v1.0","url":"https://github.com/owner/repo/releases/tag/v1.0","publishedAt":"2026-01-01T00:00:00Z","author":{"login":"alice"},"body":"notes","targetCommitish":"abc"}]'
fi
`

test('github_pr returns full PR metadata', async () => {
  const { cwd, restore } = await setupFixture(DISPATCH)
  try {
    const r = await githubPr(cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.pullRequests.length, 1)
    const pr = r.pullRequests[0]
    assert.equal(pr.title, 'one')
    assert.equal(pr.author, 'alice')
    assert.equal(pr.reviewDecision, 'APPROVED')
    assert.equal(pr.mergeable, 'MERGEABLE')
    assert.equal(pr.merged, false)
    assert.deepEqual(pr.stats, { files: 2, additions: 5, deletions: 2 })
  } finally {
    restore()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('github_pr_diff returns structured files and paged raw', async () => {
  const { cwd, restore } = await setupFixture(DISPATCH)
  try {
    const r = await githubPrDiff({ number: 1 }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.pullRequest, 1)
    assert.equal(r.files.length, 2)
    const added = r.files.find((x) => x.path === 'README.md')
    assert.equal(added.status, 'added')
    const modified = r.files.find((x) => x.path === 'src/index.ts')
    assert.equal(modified.status, 'modified')
    assert.equal(modified.additions, 2)
    assert.equal(modified.deletions, 1)
    assert.ok(modified.hunks.length >= 1)
  } finally {
    restore()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('github_pr_reviews returns structured reviews', async () => {
  const { cwd, restore } = await setupFixture(DISPATCH)
  try {
    const r = await githubPrReviews({ number: 1 }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.reviews.length, 1)
    assert.equal(r.reviews[0].state, 'APPROVED')
    assert.equal(r.reviews[0].author, 'alice')
  } finally {
    restore()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('github_pr_comments distinguishes conversation and inline comments with resolved state', async () => {
  const { cwd, restore } = await setupFixture(DISPATCH)
  try {
    const r = await githubPrComments({ number: 1 }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.comments.length, 2)
    const conv = r.comments.find((c) => c.author === 'bob')
    assert.equal(conv.path, null)
    const inline = r.comments.find((c) => c.author === 'carol')
    assert.equal(inline.path, 'src/index.ts')
    assert.equal(inline.line, 3)
    assert.equal(inline.resolved, false)
  } finally {
    restore()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('github_ci returns failure status for PR checks', async () => {
  const { cwd, restore } = await setupFixture(DISPATCH)
  try {
    const r = await githubCi({ number: 1 }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.status, 'failure')
    assert.equal(r.checks[0].name, 'test')
    assert.equal(r.checks[0].conclusion, 'failure')
  } finally {
    restore()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('github_ci returns branch runs without a PR number', async () => {
  const { cwd, restore } = await setupFixture(DISPATCH)
  try {
    const r = await githubCi({}, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.status, 'success')
    assert.equal(r.checks[0].name, 'build')
  } finally {
    restore()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('github_ci_logs returns paged logs', async () => {
  const { cwd, restore } = await setupFixture(DISPATCH)
  try {
    const r = await githubCiLogs({ runId: 2 }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.totalLines, 3)
    assert.equal(r.logs.length, 3)
    assert.equal(r.logs[0], 'line1 of log')
  } finally {
    restore()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('github_issue returns structured issue metadata', async () => {
  const { cwd, restore } = await setupFixture(DISPATCH)
  try {
    const r = await githubIssue({ number: 9 }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.title, 'bug')
    assert.deepEqual(r.labels, ['bug', 'p1'])
    assert.deepEqual(r.assignees, ['bob'])
    assert.equal(r.milestone, 'v2')
  } finally {
    restore()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('github_issue_comments returns issue conversation', async () => {
  const { cwd, restore } = await setupFixture(DISPATCH)
  try {
    const r = await githubIssueComments({ number: 9 }, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.comments.length, 1)
    assert.equal(r.comments[0].author, 'dave')
  } finally {
    restore()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('github_releases lists releases', async () => {
  const { cwd, restore } = await setupFixture(DISPATCH)
  try {
    const r = await githubReleases({}, cwd)
    assert.equal(r.error, undefined)
    assert.equal(r.releases.length, 1)
    assert.equal(r.releases[0].tagName, 'v1.0')
    assert.equal(r.releases[0].author, 'alice')
  } finally {
    restore()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('github tools reject invalid PR numbers', async () => {
  const { cwd, restore } = await setupFixture(DISPATCH)
  try {
    const r = await githubPrDiff({ number: 0 }, cwd)
    assert.equal(r.error.code, 'INVALID_GIT_ARGUMENT')
    const r2 = await githubCiLogs({}, cwd)
    assert.equal(r2.error.code, 'INVALID_GIT_ARGUMENT')
  } finally {
    restore()
    await rm(cwd, { recursive: true, force: true })
  }
})

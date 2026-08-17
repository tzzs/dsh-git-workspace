# @tzzs/dsh-git-workspace

> [中文](README.zh.md)

`@tzzs/dsh-git-workspace` is a read-only Git / GitHub Coding Workflow Workspace plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) agents. It uses the official `dsh.bundle`, profile, and Cordis plugin mechanisms and does not modify DeepSeek Harness itself.

Version 1 remains **read-only**. It does not commit, push, checkout, stage, merge, branch, create PRs, write comments/reviews, or modify source code automatically.

### Design goals

- **Agent-first**: every tool returns structured, typed data — not raw CLI stdout.
- **Bounded context**: diffs, commits, and logs are summarized and paged to protect Agent context.
- **Safe execution**: all Git/`gh` commands run through `execFile(command, argv)`. User input is never interpolated into a shell command.
- **Backward compatible**: the original six tools keep their names, parameters, and return shapes.

### Tools

The plugin provides 22 Agent Tools, organized by category.

#### Workspace

| Tool | Description |
| --- | --- |
| `git_workspace` | Aggregated read-only workspace context: repository, branch, changes, comparison, recent commit, PR summary, CI summary |
| `git_status` | Structured branch, upstream, ahead/behind, and working-tree status |
| `git_files` | Lists files by scope: `working-tree`, `staged`, `committed`, `all` |
| `git_diff` | Structured, bounded diff with file metadata (added/deleted/renamed/copied/binary) and paged hunks |

#### History

| Tool | Description |
| --- | --- |
| `git_commits` | Recent commits with optional range (`base..head`), author, and path filters; per-commit file summary |
| `git_show` | Full information for a single commit by SHA, short SHA, or revision (e.g. `HEAD`, `HEAD~1`) |
| `git_compare` | Compare two revisions/branches, returning ahead/behind, stats, and file list |
| `git_blame` | Trace the commit history of each line of a file, with optional line range |

#### Repository

| Tool | Description |
| --- | --- |
| `git_branches` | Local and remote branches with current, upstream, ahead, and behind |
| `git_remotes` | Remotes with fetch/push URLs and parsed GitHub metadata (supports `origin` fork + `upstream`) |
| `git_worktrees` | List all worktrees (read-only) |
| `git_stash` | List stash entries (read-only) |
| `git_tags` | List tags with commit and tagger info |

#### GitHub

| Tool | Description |
| --- | --- |
| `github_pr` | All PRs for the current branch, with full metadata, stats, review decision, and mergeability |
| `github_pr_diff` | Structured, bounded diff for a specific PR |
| `github_pr_reviews` | Reviews submitted on a PR (`APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`, `PENDING`) |
| `github_pr_comments` | Conversation and inline review comments, including `resolved` state for review threads |
| `github_ci` | CI/check status for a PR or the current branch/commit |
| `github_ci_logs` | Paged CI logs for a run (optionally a job) |
| `github_issue` | A GitHub issue by number |
| `github_issue_comments` | The conversation comments on an issue |
| `github_releases` | GitHub releases with tag, date, and URL |

### Installation

Install the published npm package:

```bash
dsh plugin --profile default add @tzzs/dsh-git-workspace
dsh --profile default
```

Install a local development package:

```bash
dsh plugin --profile dev add ./path/to/dsh-git-workspace
dsh --profile dev
```

The package declares the official bundle manifest:

```json
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

### GitHub CLI setup

The `github_*` tools require the local `gh` CLI. They do not implement OAuth or GitHub API authentication:

```bash
gh auth login
gh auth status
```

Missing or unauthenticated CLI access is returned as structured errors:

- `GH_NOT_INSTALLED`
- `GH_NOT_AUTHENTICATED`
- `NO_GITHUB_REMOTE`
- `NOT_GITHUB_REPOSITORY`
- `GITHUB_QUERY_FAILED`
- `GITHUB_RESOURCE_NOT_FOUND`
- `GITHUB_PERMISSION_DENIED`

### Tool arguments

```ts
git_workspace()

git_status()

git_files({ scope: "working-tree" | "staged" | "committed" | "all" })

git_diff({ path?, staged?, base?, head?, offset?, limit? })

git_commits({ limit?, path?, base?, head?, from?, to?, author? })

git_show({ sha?, includeDiff?, includeFiles?, offset?, limit? })

git_compare({ base?, head?, path?, offset?, limit? })

git_blame({ path, startLine?, endLine?, revision?, limit? })

git_branches()

git_remotes()

git_worktrees()

git_stash()

git_tags()

github_pr()

github_pr_diff({ number, path?, offset?, limit? })

github_pr_reviews({ number })

github_pr_comments({ number })

github_ci({ number?, branch? })

github_ci_logs({ runId, jobId?, offset?, limit? })

github_issue({ number })

github_issue_comments({ number })

github_releases({ limit? })
```

### Return values

`git_workspace` returns an aggregated summary:

```json
{
  "repository": {
    "root": "/workspace/project",
    "name": "project",
    "remote": "git@github.com:owner/project.git",
    "github": { "host": "github.com", "owner": "owner", "name": "project" }
  },
  "branch": { "name": "feature/x", "upstream": "origin/feature/x", "ahead": 2, "behind": 0 },
  "changes": { "modified": 2, "staged": 1, "deleted": 0, "renamed": 0, "untracked": 3 },
  "workspace": { "clean": false, "modified": 2, "staged": 1, "deleted": 0, "renamed": 0, "untracked": 3 },
  "comparison": { "base": "main", "ahead": 3, "behind": 0 },
  "commits": { "ahead": 3, "recent": [{ "sha": "...", "shortSha": "...", "message": "...", "author": "...", "date": "..." }] },
  "pullRequest": { "number": 3, "title": "...", "state": "OPEN", "draft": false, "url": "..." },
  "ci": { "status": "success", "checks": [{ "name": "test", "status": "completed", "conclusion": "success" }] }
}
```

`github_pr` returns `pullRequests[]` (a branch may have multiple PRs) with full metadata:

```json
{
  "repository": { "owner": "owner", "name": "project" },
  "branch": "feature/x",
  "pullRequests": [{
    "number": 3,
    "title": "feat: ...",
    "body": "...",
    "state": "OPEN",
    "draft": false,
    "author": "alice",
    "base": "main",
    "head": "feature/x",
    "url": "https://github.com/owner/project/pull/3",
    "createdAt": "...",
    "updatedAt": "...",
    "stats": { "files": 4, "additions": 120, "deletions": 40 },
    "reviewDecision": "APPROVED",
    "mergeable": "MERGEABLE",
    "merged": false
  }]
}
```

### Error handling

All tools return a unified `Result`. Success returns the data shape; failure returns:

```json
{
  "error": { "code": "...", "message": "...", "hint": "..." }
}
```

Stable error codes include:

- Git: `NOT_A_GIT_REPOSITORY`, `GIT_COMMAND_FAILED`, `INVALID_GIT_ARGUMENT`, `INVALID_PATH`, `REVISION_NOT_FOUND`
- GitHub: `NO_GITHUB_REMOTE`, `NOT_GITHUB_REPOSITORY`, `GH_NOT_INSTALLED`, `GH_NOT_AUTHENTICATED`, `GITHUB_QUERY_FAILED`, `GITHUB_RESOURCE_NOT_FOUND`, `GITHUB_PERMISSION_DENIED`

Underlying exception stack traces are never exposed to the Agent.

### Security

- All Git and `gh` commands run through `execFile(command, argv)`.
- User input is never interpolated into a shell command.
- Revisions, paths, branches, PR numbers, issue numbers, and queries are validated: NUL bytes are rejected, and arguments that begin with `-` are rejected for revisions and paths.
- Paths are always placed after `--` (e.g. `git diff revision -- path`), never as bare trailing arguments.
- There is no universal `git_execute` / `github_execute` tool.
- Diff, commit, blame, and CI-log results are bounded and paged by default.
- The plugin performs no destructive Git operations.

### Development

Requirements: Node.js, npm, and `pnpm` or `corepack` for Harness profile management.

```bash
npm install
npm run build
npm test
npm run check
```

Equivalent Make targets:

```bash
make install
make build
make test
make check
```

Build output is written to `lib/`. To validate the Agent Loop integration:

```bash
npm run build
node scripts/agent-loop-integration.mjs
```

This uses the real Harness Agent Loop and ToolRuntime with a scripted LLM adapter, verifying discovery, invocation, and results for all 22 Tools without a real LLM account.

### Official profile verification

```bash
dsh plugin --profile test add ./path/to/dsh-git-workspace
dsh --profile test --dump-config
```

The composed configuration should contain:

```yaml
- id: dsh-git-workspace
  name: '@tzzs/dsh-git-workspace'
```

### Publishing

`prepack` builds TypeScript automatically:

```bash
npm pack
npm publish --access public
```

Before publishing:

```bash
make check
make pack
```

### Roadmap

- Phase 2 mutation (currently not implemented): `git_branch_create`, `git_stage`, `git_unstage`, `git_commit`, `git_push`, `git_checkout`, `git_merge`, `github_pr_create`, `github_pr_merge`, `github_pr_comment`, `github_pr_review`
- Git Diff Viewer UI
- PR and commit relationship views

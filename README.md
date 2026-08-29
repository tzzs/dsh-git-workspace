# @tzzs/dsh-git-workspace

> [中文](README.zh.md)

`@tzzs/dsh-git-workspace` is a Git / GitHub Coding Workflow Workspace plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) agents. It uses the official `dsh.bundle`, profile, and Cordis plugin mechanisms and does not modify DeepSeek Harness itself.

The plugin started fully **read-only** and is growing mutation support incrementally. It now ships 22 read-only tools plus 12 write tools. Read tools remain side-effect-free and are the foundation; every write tool states its blast radius in its description (`Write tool. ...`), validates all arguments before touching Git/`gh`, and is triggered only by an explicit user action or agent turn — never by automatic sampling or refresh paths. Destructive operations are gated: hard reset refuses to run without an explicit `confirm:true`, and force-push only happens when explicitly requested (`force:true`), never automatically.

### Design goals

- **Agent-first**: every tool returns structured, typed data — not raw CLI stdout.
- **Bounded context**: diffs, commits, and logs are summarized and paged to protect Agent context.
- **Safe execution**: all Git/`gh` commands run through `execFile(command, argv)`. User input is never interpolated into a shell command.
- **Blast-radius discipline**: write tools describe what they can destroy in their descriptions; hard resets require `confirm:true`; force-push is opt-in only.
- **Backward compatible**: the original six tools keep their names, parameters, and return shapes.

### Tools

The plugin provides 34 Agent Tools — 22 read-only discovery tools plus 12 write tools — organized by category.

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

#### Write (Git)

Mutation tools over the local repository. Each one returns a structured result and never shells out; invalid input (leading `-`, NUL bytes) is rejected before Git runs.

| Tool | Description |
| --- | --- |
| `git_stage` | Stage working-tree files into the index (`paths` or `all:true`) |
| `git_unstage` | Unstage files while keeping the working-tree changes (`paths` or `all:true`) |
| `git_commit` | Create a commit on the current branch from staged changes (message required; `amend`/`allowEmpty` optional) |
| `git_branch_create` | Create a local branch from an optional start point, checked out by default |
| `git_checkout` | Switch to another branch, or create it first with `create:true`; refuses when local changes would be overwritten |
| `git_merge` | Merge another branch into the current one; conflicts come back as `conflictedFiles` instead of being resolved automatically |
| `git_push` | Push a branch to a remote (sets upstream by default); `force:true` rewrites remote history and is never applied automatically |
| `git_reset` | Move the current branch (`soft`/`mixed`/`hard`); `hard` discards all uncommitted changes and requires explicit `confirm:true` |

#### Write (GitHub)

Mutation tools over GitHub via the `gh` CLI. They require an authenticated `gh` and mutate only what their arguments name.

| Tool | Description |
| --- | --- |
| `github_pr_create` | Open a PR for a branch via `gh pr create`; fills title/body from commit history unless both are given |
| `github_pr_merge` | Merge a PR (`merge`/`squash`/`rebase`), optionally deleting the head branch — irreversible on the remote |
| `github_pr_comment` | Post a comment on a PR |
| `github_pr_review` | Submit a review (`APPROVE`, `REQUEST_CHANGES`, or `COMMENT`; requesting changes requires a body) |

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

## Git Workspace UI

> See [docs/ui.md](docs/ui.md) for the UI architecture and [docs/dsh-ui-api.md](docs/dsh-ui-api.md) for the DSH Web UI extension API.

The plugin also ships a browser half that turns the backend tools into a
compact, persistent **Git Workspace** inside the DeepSeek Harness Web UI.

### What it does

- **Compact tool cards** — every `git_*` / `github_*` call the Agent makes
  renders as a Git Workspace card in the conversation (branch, ahead/behind,
  changes, commits, PR, CI) instead of raw JSON.
- **Persistent Git Workspace panel** — a button in the session header's action
  row ("Git Workspace") opens a floating panel showing the live workspace
  summary: current branch, upstream, changes grouped by status, commits, PR,
  and CI checks.
- **Shared context** — the Agent and the UI consume the same `git_*` tools, so
  both see the same Git state. There is no separate frontend data pipeline.

### How it is enabled

The web profile loads the client half automatically when the package declares
`dsh.client` and `exports["./client"]`. Install and run the web profile under
**one** `DSH_HOME`. When `DSH_HOME` is unset the `dsh` CLI silently uses
`~/.dsh`, so a profile installed under a different home boots without the
client bundle (the boot manifest simply has no `@tzzs` entry — no error, no UI):

```bash
export DSH_HOME="$HOME/.dsh-git-workspace"
dsh plugin --profile web add ./path/to/dsh-git-workspace
dsh --profile web
```

Confirm the client made it into the boot manifest before opening the browser:

```bash
curl -s http://127.0.0.1:PORT/ | grep -o '"id":"@tzzs[^}]*}'
# "id":"@tzzs/dsh-git-workspace","url":"/plugins/@tzzs/dsh-git-workspace/client.js?rev=..."
```

### Read-first, with explicit write controls

The UI mirrors the backend's evolution. It still inspects, searches, diffs,
browses, opens, and refreshes, and now also surfaces write controls that are
wired to the new write tools: per-file Stage/Unstage buttons, Stage All /
Unstage All, a commit box (commit, push, branch actions), a PR merge control
with merge-method choice and delete-branch checkbox, Approve / Request-changes
review buttons, and a comment composer. Every control dispatches a native
`/git-…` command through `session.command()` (registered in
`src/commands.ts`), and each command wraps the exact `git_*`/`github_*` write
tool and JSON arguments — no shell splicing, no agent turn, and no sampler /
auto-refresh path that can fire a write. There is no chat fallback anywhere
in the panel: when native commands are unavailable, the panel disables
itself with an explicit banner instead of ever queuing a prompt. Some
read-only fetches (**status, show, PR/CI/issue/release detail views**) have
no panel control yet at all — not a chat fallback, just an absent feature —
while `git_diff` already ships as a native `/git-diff` command. See
[docs/ui.md](docs/ui.md) for details.

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

git_stage({ paths?, all? })

git_unstage({ paths?, all? })

git_commit({ message, amend?, allowEmpty? })

git_branch_create({ name, startPoint?, checkout? })

git_push({ remote?, branch?, force?, setUpstream? })

git_checkout({ branch, create? })

git_merge({ branch, message?, squash?, noFastForward? })

git_reset({ mode?, ref?, confirm? })

github_pr()

github_pr_create({ title?, body?, base?, head?, draft? })

github_pr_merge({ number, method?, deleteBranch?, subject?, body? })

github_pr_comment({ number, body })

github_pr_review({ number, state?, body? })

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
- Write tools: `NOTHING_TO_COMMIT`, `BRANCH_ALREADY_EXISTS`, `BRANCH_NOT_FOUND`, `DIRTY_WORKTREE`, `HARD_RESET_REQUIRES_CONFIRM`, `GIT_PUSH_REJECTED`, `GITHUB_PR_NOT_MERGEABLE`

Underlying exception stack traces are never exposed to the Agent.

### Security

- All Git and `gh` commands run through `execFile(command, argv)`.
- User input is never interpolated into a shell command.
- Revisions, paths, branches, PR numbers, issue numbers, and queries are validated: NUL bytes are rejected, and arguments that begin with `-` are rejected for revisions, paths, branch names, and remotes.
- Paths are always placed after `--` (e.g. `git diff revision -- path`), never as bare trailing arguments.
- There is no universal `git_execute` / `github_execute` tool.
- Diff, commit, blame, and CI-log results are bounded and paged by default.
- Destructive operations are gated: `git_reset` in `hard` mode refuses to run without `confirm:true`, and remote history is rewritten only when a caller explicitly passes `force:true`.
- Write tools run only from an explicit user action or agent turn — never from automatic sampling or refresh paths.

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
make integration   # or: make agent-loop
```

This uses the real Harness Agent Loop and ToolRuntime with a scripted LLM adapter, verifying discovery, invocation, and results for all 34 Tools without a real LLM account. It requires `@deepseek-ai/dsh` installed globally (`npm i -g @deepseek-ai/dsh`); the script resolves the package at runtime, or set `DSH_GLOBAL_ROOT` to its directory explicitly. Tests import compiled output from `lib/`, so always run tests through `npm test`/`make test` — running `node --test` directly against a stale `lib/` fails fast with a clear message thanks to the freshness guard in `tests/lib-fresh.test.js`.

To verify the plugin in the browser UI, serve it through an isolated local `web` profile:

```bash
make local-web
```

This installs the checkout into `$DSH_HOME/profiles/web` (default `~/.dsh-git-workspace`), serves the DeepSeek Harness browser UI on a free port, and prints a line like `dsh web: http://127.0.0.1:PORT`. The server takes several seconds to settle before the URL appears. Use `make local-run` instead for the headless (non-web) local profile.

Note: `$DSH_HOME` must live on a real ext4 filesystem (e.g. under `$HOME`), not on a WSL 9p/drvfs mount like `/mnt/*`. dsh enforces owner-only permissions on its credentials file, which cannot be set on NTFS-backed mounts. Plugin source can stay anywhere; only profile data needs the native filesystem.

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

- ✅ Git Workspace UI (read-only): compact tool cards + persistent workspace panel
- ✅ Phase 2 mutation tools: `git_branch_create`, `git_stage`, `git_unstage`, `git_commit`, `git_push`, `git_checkout`, `git_merge`, `git_reset`, `github_pr_create`, `github_pr_merge`, `github_pr_comment`, `github_pr_review`
- ✅ Write controls wired into the Git Workspace panel: per-file stage/unstage, commit box with Git action menu, PR merge method choice + delete-branch checkbox, Approve/Request-changes buttons, comment composer
- Later: further risky operations (e.g. `github_pr_close`) behind the same blast-radius rules — description states what can be destroyed, explicit user/agent trigger only

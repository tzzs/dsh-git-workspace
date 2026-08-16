# @tzzs/dsh-git-workspace

> [中文](README.zh.md)

`@tzzs/dsh-git-workspace` is a read-only Git/GitHub Workspace plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) agents. It uses the official `dsh.bundle`, profile, and Cordis plugin mechanisms and does not modify DeepSeek Harness itself.

### Features

The plugin provides six Agent Tools:

| Tool | Description |
| --- | --- |
| `git_workspace` | Summarizes the repository, branch, change counts, recent commit, and PR summary |
| `git_status` | Returns structured branch, upstream, ahead/behind, and worktree status |
| `git_files` | Lists working-tree, staged, committed, or all files |
| `git_diff` | Returns structured diffs, file statistics, and hunks with paging and staged/base/head support |
| `git_commits` | Lists recent commits, optionally filtered by path; defaults to 20 and caps at 100 |
| `github_pr` | Uses GitHub CLI to list all pull requests for the current branch |

Version one is read-only. It does not commit, push, checkout, stage, merge, modify PRs, or modify source code automatically.

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

`github_pr` requires the local `gh` CLI. It does not implement OAuth or GitHub API authentication:

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

### Tool arguments

```ts
git_workspace()
git_status()
git_files({
  scope: "working-tree" | "staged" | "committed" | "all"
})
git_diff({
  path?: string,
  staged?: boolean,
  base?: string,
  head?: string,
  offset?: number,
  limit?: number
})
git_commits({
  limit?: number,
  path?: string
})
github_pr()
```

Examples:

```json
{"path":"src/index.ts","limit":300}
```

```json
{"staged":true}
```

```json
{"base":"HEAD~3","head":"HEAD"}
```

### Return values

`git_status` returns branch and file information:

```json
{
  "branch": {
    "name": "feature/git-plugin",
    "upstream": "origin/feature/git-plugin",
    "ahead": 2,
    "behind": 0
  },
  "files": [
    {"path":"src/index.ts","status":"modified","staged":false},
    {"path":"src/new.ts","status":"untracked","staged":false}
  ]
}
```

`git_diff` returns structured files and hunks. `github_pr` returns `pullRequests[]` because one branch may have multiple PRs. See the examples in this document; the schemas are identical to the Chinese documentation.

### Security

- Git and `gh` commands use `execFile(command, argv)`.
- User input is never interpolated into a shell command.
- Paths, base revisions, and head revisions cannot escape the Git argument boundary.
- Git tools return structured errors outside Git repositories.
- Diff and commit results are bounded by default to protect Agent context.
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

This uses the real Harness Agent Loop and ToolRuntime with a scripted LLM adapter, so it verifies discovery, invocation, and results for all six Tools without a real LLM account.

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

- Git Diff Viewer UI
- PR reviews and comments
- CI status
- Richer committed-file metadata
- PR and commit relationship views

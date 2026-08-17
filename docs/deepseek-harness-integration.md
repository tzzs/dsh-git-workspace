# DeepSeek Harness integration research

The current master uses npm bundle packages with `dsh.bundle.patch`, installed into profiles by `dsh plugin --profile NAME add PACKAGE`. The patch is a YAML layer containing Cordis plugin rows; rows reference the published package name. Plugins export `apply(ctx)` and register model tools through `ctx.tools.register(defineTool(...))` from `@deepseek-ai/dsh-tools`. Tool definitions use `name`, `description`, `parameters`, `output.schema`, and async `execute(args, exec)`. This package follows that mechanism and does not modify Harness source.

## Architecture

The plugin separates concerns into three layers to prepare for a future Phase-2 mutation surface:

- **Git service** (`src/git/*`): safe `execFile`-based Git command execution, repository/remote resolution, and structured parsers.
- **GitHub service** (`src/github/*`): `gh` CLI execution through a shared client, structured parsers, and consistent error mapping.
- **Tool layer** (`src/tools/*` and `src/index.ts`): thin registrations that map parameters to service calls and return `Result<T>`.

Shared primitives live in `src/git/exec.ts` (the `command()` abstraction), `src/git/repository.ts` (repository/remote/GitHub parsing), and `src/git/safety.ts` (argument validation, limits, and error classification). All execution uses `execFile(command, argv)`; user input never reaches a shell string.

## Tool registration

`src/index.ts` registers each tool with `defineTool`, providing `name`, `description`, `parameters` (JSON schema), a permissive `output.schema`, and an async `execute`. The `render` callback emits a plain-text result. Every tool returns `JSON.parse(JSON.stringify(result))` to guarantee a serializable value for the Harness runtime.

## Phase 1 scope

Version 1 is read-only and exposes 22 tools: Workspace (`git_workspace`, `git_status`, `git_files`, `git_diff`), History (`git_commits`, `git_show`, `git_compare`, `git_blame`), Repository (`git_branches`, `git_remotes`, `git_worktrees`, `git_stash`, `git_tags`), and GitHub (`github_pr`, `github_pr_diff`, `github_pr_reviews`, `github_pr_comments`, `github_ci`, `github_ci_logs`, `github_issue`, `github_issue_comments`, `github_releases`).

## Phase 2 (mutation) roadmap

The service/tool layering is designed so future write tools slot in without rewiring: `git_branch_create`, `git_stage`, `git_unstage`, `git_commit`, `git_push`, `git_checkout`, `git_merge`, `github_pr_create`, `github_pr_merge`, `github_pr_comment`, `github_pr_review`. Phase 2 is intentionally not implemented in Version 1, which remains strictly read-only.

# DeepSeek Harness integration research

The current master uses npm bundle packages with `dsh.bundle.patch`, installed into profiles by `dsh plugin --profile NAME add PACKAGE`. The patch is a YAML layer containing Cordis plugin rows; rows reference the published package name. Plugins export `apply(ctx)` and register model tools through `ctx.tools.register(defineTool(...))` from `@deepseek-ai/dsh-tools`. Tool definitions use `name`, `description`, `parameters`, `output.schema`, and async `execute(args, exec)`. This package follows that mechanism and does not modify Harness source.

## Architecture

The plugin separates concerns into three layers shared by both the read-only and mutation tool surfaces:

- **Git service** (`src/git/*`): safe `execFile`-based Git command execution, repository/remote resolution, and structured parsers.
- **GitHub service** (`src/github/*`): `gh` CLI execution through a shared client, structured parsers, and consistent error mapping.
- **Tool layer** (`src/tools/*` and `src/index.ts`): thin registrations that map parameters to service calls and return `Result<T>`.

Shared primitives live in `src/git/exec.ts` (the `command()` abstraction), `src/git/repository.ts` (repository/remote/GitHub parsing), and `src/git/safety.ts` (argument validation, limits, and error classification). All execution uses `execFile(command, argv)`; user input never reaches a shell string.

## Tool registration

`src/index.ts` registers each tool with `defineTool`, providing `name`, `description`, `parameters` (JSON schema), a permissive `output.schema`, and an async `execute`. The `render` callback emits a plain-text result. Every tool returns `JSON.parse(JSON.stringify(result))` to guarantee a serializable value for the Harness runtime.

## Phase 1 scope

Version 1 was read-only with 22 tools: Workspace (`git_workspace`, `git_status`, `git_files`, `git_diff`), History (`git_commits`, `git_show`, `git_compare`, `git_blame`), Repository (`git_branches`, `git_remotes`, `git_worktrees`, `git_stash`, `git_tags`), and GitHub (`github_pr`, `github_pr_diff`, `github_pr_reviews`, `github_pr_comments`, `github_ci`, `github_ci_logs`, `github_issue`, `github_issue_comments`, `github_releases`). Read tools remain the plugin's foundation and stay side-effect-free.

## Phase 2 (mutation) status

The service/tool layering let write tools slot in without rewiring. The mutation phase is now implemented across twelve tools: local Git writes (`git_branch_create`, `git_stage`, `git_unstage`, `git_commit`, `git_push`, `git_checkout`, `git_merge`, `git_reset`) and GitHub writes via `gh` (`github_pr_create`, `github_pr_merge`, `github_pr_comment`, `github_pr_review`). Each landed as its own tool with its blast radius stated in a `Write tool.` description, argument validation (NUL bytes, leading dashes, branch-name rules), structured errors, and safety rails appropriate to what it can destroy — e.g. `git_reset --hard` refuses to run without an explicit `confirm:true`, force-push only happens when a caller passes `force:true`, and merges surface `conflictedFiles` instead of resolving anything. No mutation is ever fired by automatic sampling or refresh paths; all writes ride an explicit user action or agent turn. Later candidates (e.g. `github_pr_close`) follow the same pattern.

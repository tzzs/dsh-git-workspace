# AGENTS.md

Read/write Git/GitHub tool plugin (`@tzzs/dsh-git-workspace`) for DeepSeek Harness. Thirty-four tools in two groups: 22 read-only discovery tools (including the original six: `git_workspace`, `git_status`, `git_files`, `git_diff`, `git_commits`, `github_pr`) and 12 write tools (`github_pr_create`, `github_pr_merge`, `github_pr_comment`, `github_pr_review`, `git_stage`, `git_unstage`, `git_commit`, `git_branch_create`, `git_push`, `git_checkout`, `git_merge`, `git_reset`). Entry point is `src/index.ts` (`apply(ctx)` registers tools via `ctx.tools.register`).

## Build & verify

- The only verification command is `npm run check` (= `npm test` = `npm run build && node --test tests/*.test.js`). There is **no separate lint or typecheck** — the `tsc -p tsconfig.json` build in strict mode is the typecheck.
- Tests import from compiled `lib/`, never from `src/` (e.g. `../lib/git/status.js`). `npm run build` must run before any test run; `npm test` does this for you, but direct `node --test` does not.
- Build output `lib/` and local profiles `.dsh-local/` (legacy), `.dsh-bin/` are gitignored. `make clean` removes `lib/`, `$DSH_HOME`, and `.dsh-bin/`.

## Conventions & gotchas

- Source files are hand-minified single-line style with **no comments**; match this when editing (e.g. `src/git/diff.ts` is one dense line).
- ESM + NodeNext: TS imports must use explicit `.js` extensions (`import {gitStatus} from '../git/status.js'`).
- All tool functions take an optional trailing `cwd` param (default `process.cwd()`) and resolve the real repo root via `git rev-parse --show-toplevel`.
- Git/gh are invoked with `execFile` (no shell). Paths, bases, and heads are validated (reject leading `-` and NUL) and returned as structured errors `{error:{code,message,hint?}}`; the result union type is `Result<T> = T | {error}` in `src/types.ts`. The plugin evolves from read-only to full mutation support: read tools are the foundation and stay side-effect-free; write tools (`github_pr_create` today, destructive operations like force-push/reset later) land incrementally. Every write tool states its blast radius in its description, returns a structured result, and is triggered only by an explicit user action or agent turn — never by automatic sampling/refresh paths.
- `tests/harness-runtime.test.js` runs the real Cordis ToolRuntime against compiled `lib/`. It imports `@deepseek-ai/dsh-system-prompt` and `@deepseek-ai/dsh-llm`, which are **not** declared devDependencies — they resolve only through transitive hoisting from `@deepseek-ai/dsh-tools`. Don't remove those transitive packages.

## Integration verification (author-machine only)

- `make integration` / `make agent-loop` runs `scripts/agent-loop-integration.mjs`, which **hardcodes absolute import paths** under `/home/tanzz/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/...`. It only works on the author's machine. Use `tests/harness-runtime.test.js` as the portable substitute.
- `make local-install` / `local-config` / `local-run` verify the plugin inside an isolated dsh profile using a corepack pnpm shim (`.dsh-bin/pnpm`). Requires the `dsh` CLI on `PATH`. In the Makefile, `$DSH_HOME` defaults to `~/.dsh-git-workspace`, but the `dsh` CLI itself defaults to `~/.dsh` when `DSH_HOME` is unset — a profile installed under one home is invisible under the other (the boot manifest silently drops the plugin, no error, no UI). It **must** stay on a real ext4 filesystem (not a WSL 9p/drvfs `/mnt/*` mount): dsh's `dsh-credentials-local` enforces `chmod 600` on its credentials file, which is impossible on NTFS-backed mounts. `make local-run` is **headless** (bundle is only `@deepseek-ai/dsh-base`, so it prints no port — that's expected, not a hang). To verify in the browser UI, use `make local-web` (creates `$DSH_HOME/profiles/web` with `dsh-web-app` and serves on a free port); the URL banner appears only after the loader settles (~10–15s).

## Packaging

- Plugin registration lives in `cordis.patch.yml` (an `insert` row for the bundle patch) declared via `dsh.bundle.patch` in `package.json`. `prepack` builds automatically; publish happens on GitHub release via `.github/workflows/release.yml`. Run `make check && make pack` before publishing.
- `base.md` is the original Chinese task spec — historical reference, not an instruction file; leave it untouched.
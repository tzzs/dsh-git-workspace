# Git Workspace UI

`@tzzs/dsh-git-workspace` ships a browser (client) half that turns the
Git/GitHub backend tools into a compact, persistent Git Workspace inside the
DeepSeek Harness Web UI.

## Backend vs UI vs DSH integration

| Layer | Location | Role |
| --- | --- | --- |
| **Backend** | `src/git/*`, `src/github/*` | Read-only Git/`gh` domain model (`Result<T>`). |
| **Render intents** | `src/index.ts`, `src/presentation.ts` | `presentCall` / `presentResult` / `presentationMeta` per tool. |
| **UI view models** | `src/ui/view-models.ts` | Pure adapters from backend types to UI shapes (decouples UI from backend schema). |
| **Wire meta** | `src/ui/meta.ts` | JSON-safe projections attached to each tool result as `presentationMeta`. |
| **Client plugin** | `src/client/**` (plain ESM) | React components registered into DSH slots. |
| **Client build** | `scripts/build-client.mjs` | Bundles `src/client/**` into the DSH `window.__ModuleLoader__` contract at `lib/client/client.js`. |
| **DSH wiring** | `package.json` (`exports["./client"]`, `dsh.client`) | Lets the DSH web shell discover, serve, and mount the browser half. |

## How it plugs into DSH

DSH's web shell scans loaded packages for a `dsh.client` declaration and an
`exports["./client"]` bundle. Our bundle is a Cordis plugin:

```js
window.__ModuleLoader__.load({
  id: '@tzzs/dsh-git-workspace',
  factory: (require) => { /* ... */ exports.apply = apply; exports.inject = inject; },
})
```

`apply(ctx)` registers React components into two official extension seats:

1. **`tool.call.toolview`** (keyed, session scope) — one compact card per wire
   tool. Every `git_*` / `github_*` call the Agent makes renders as a compact
   Git Workspace card instead of raw JSON:
   - `git_workspace` → branch / ahead-behind / changes / PR / CI summary
   - `git_status` → branch + grouped change list
   - `git_diff` → file stats with per-file `+adds/-dels`
   - `git_commits` / `git_show` → commit list / commit detail
   - `github_pr` → PR state + link
   - `github_ci` → check states
   - all others → a generic compact text card

2. **`conversation.input.left`** (list, session scope) — a compact, always
   visible "Git" chip in the composer card's tool row (beside the access-mode
   control). It renders on the blank new-session screen and in every session.
   The chip shows a dirty-change count badge plus an overall state dot; it
   toggles a right-side Git Workspace sidebar (persisted: it reopens with the
   session until dismissed). The panel renders through a React portal into
   `document.body`, so composer transforms cannot offset it. On wide viewports
   the sidebar docks: it probes the host main column and reserves real layout
   space by animating its `margin-right`; on narrow viewports (<760px) it falls
   back to a floating overlay. `Ctrl/Cmd+Shift+G` toggles it from anywhere.

   The drawer body has two tabs:

   - **Source Control** — overview card (branch, upstream, total `+adds/-dels`
     from per-file numstat, CI dot, comparison vs base, stash count), a commit
     box with a Git action menu, collapsible cards for Changes and Untracked
     files (directory-tree grouping, per-file stats and status letters,
     inline diff viewer, per-file Stage/Unstage buttons), and Recent commits.
   - **Pull Request** — PR state pill + link, a Merge & review card (merge
     method choice, delete-branch checkbox, Approve / Request-changes buttons),
     CI status card (per-check rows), comments grouped into Unresolved /
     Resolved sections, and a comment composer. Comments are aggregated by the
     backend: `git_workspace` fetches the current branch's PR review threads
     when a pull request exists.

## Component structure

```
src/client/
├── index.js                  # plugin entry: { inject, apply } + slot registrations
├── services.js               # host-context capture; session.command() bridge (native refresh/dispatch)
├── common.js                 # block/meta helpers shared by all cards
├── components.js             # design system: DSH primitives (StateDot/DisclosureRow/Tooltip/
│                             #   icons/writeClipboard) + token-based card/row/pill atoms,
│                             #   hover styles + drawer keyframes (injected stylesheet)
├── toolview/                 # per-tool compact cards (tool.call.toolview)
│   ├── workspace-row.js
│   ├── status-row.js
│   ├── diff-row.js
│   ├── commits-row.js
│   ├── show-row.js
│   ├── pr-row.js
│   ├── ci-row.js
│   └── generic-row.js
└── panel/                    # persistent Git Workspace explorer (composer chip)
    ├── container.js          # session-scoped "Git" chip (dirty badge + state dot)
    │                         #   + portal-mounted right-side drawer + native-command refresh
    ├── drawer.js             # reusable side drawer: backdrop, ESC close, drag-resize,
    │                         #   width persistence, slide-in animation
    └── workspace-panel.js    # collapsible sections: changes (grouped staged/unstaged/
                              #   untracked with copy-path + stage controls), commits,
                              #   PR merge/review, plus the commit box and action menu
```

## Data flow

```
Agent calls git_workspace
        │
        ▼
backend  gitWorkspace() → canonical Result
        │
        ▼
render   output.render() → ContentBlock[]  (model-facing text)
presentationMeta() → JSON-safe view model (branch/changes/PR/CI)
presentResult()  → ToolResultView (generic card title + content)
        │
        ▼
session  tool-result node carries { content, meta }
        │
        ▼
client   tool.call.toolview card reads block.meta and renders compact UI
composer chip drawer reads the same meta via useSession (ConversationSnapshot)
```

The **Agent and the UI share one Git context**: the Agent consumes the same
`git_*` tools, and the UI renders those same tool results. There is no
separate frontend data pipeline.

## Local auto-sampling (no model call)

Since the drawer's data used to appear only after the Agent happened to run
`git_workspace`, the backend also samples Git state **locally** and ships it
to the browser through the DSH session-projection subsystem:

- On `session/created` and after every `turn/end`, the plugin runs
  `gitWorkspace()` in the session's `cwd` (plain local git/gh subprocesses —
  no LLM, no conversation message) and appends a log-only
  `tzzs.git-workspace/sample` event carrying the whole `WorkspaceMeta`
  payload, stamped with an ISO `sampledAt`. Identical payloads are
  deduplicated per session.
- A session projection unit registered under the key `tzzs.git-workspace`
  folds those events; the host pushes schema-validated values over the wire
  as `session/projection` frames.
- The composer chip reads the key via `useProjection('tzzs.git-workspace')`.
  Because the payload carries the full `WorkspaceMeta`, the **Pull Request**
  tab (PR pill, CI checks, review comments) is populated by the same
  local sample — no agent turn is needed.
- Client-side merge: the panel combines the projection with tool-result meta
  from the conversation. The snapshot with the newer `sampledAt` wins
  conflicts; fields missing from the primary (e.g. a `git_status` result has
  no `pullRequest`) are gap-filled from the other, so neither source can
  blank out the other's sections. Usable data always beats error payloads;
  a projection error surfaces only when nothing else is available.

Because the sample event type is not surface-eligible, it never enters
model-visible history: auto-loading costs zero tokens and does not pollute
the conversation.

## UI state

State is intentionally lightweight:

- Each toolview card is a pure function of its frozen `block` (`RunningToolCall`
  or `ToolResultNode`). No store needed.
- The sidebar keeps only `open` + `width` (both persisted in localStorage);
  all workspace data is read from the session conversation snapshot via the
  framework's `useSession` hook.

## Real refresh

The composer chip shows a dirty-change count badge plus an overall `StateDot`
(CI failing → red, running → blue ring, dirty tree → amber, clean → green).
With the projection registry present, data refreshes automatically after each
turn and the panel never prompts the agent on its own. Whether sampling is
alive is decided by a latch: the first projection payload (value or
structured error) flips `autoSampled`, and from then on the panel trusts the
sampler — the PR tab's old "auto-ask the agent when no pull request is
loaded" behavior stays disabled even when the branch genuinely has no PR.

There is no chat/agent-turn fallback anywhere in the panel, not even as a
degraded path. Every action — refresh included — goes through
`session.command('/git-… {…}')` only (see [`sessionCommand`](../src/client/services.js)).
Firing `/git-refresh {}` remains for:

- sessions where no projection payload ever arrived (headless CLI, or a host
  without the projection subsystem): opening the drawer with no data
  force-refreshes once per open, and the PR tab does the same once per
  repo/branch when it has no pull request data yet. Both wait out a short
  2 s grace first, so a slow first sample never triggers a pointless
  request.

The empty-state CTA dispatches the same `/git-refresh {}` command.

If `session.command` is missing, or a dispatched command comes back
unmatched (the host has no `dsh-commands` runtime, or `installGitCommands`
never registered), the panel does **not** retry through chat — it flips to a
disabled state: `onDispatch` becomes `null` (every write control already
hides itself when `onDispatch` is falsy) and a banner
("This host has no native command channel — Git write actions are
disabled.") explains why. This is a one-way, session-scoped latch
(`commandsSupported` in [`container.js`](../src/client/panel/container.js)) —
once a dispatch is confirmed unmatched/unavailable it never re-attempts a
prompt for that session.

The drawer's **refresh button** always goes through `/git-refresh {}`
(forces a fresh local sample; see `forceSample`) — never a chat fallback. A
dispatched write command does **not** by itself bump the projection until
the next `turn/end` sample, so the panel pairs mutation commands with a
following `/git-refresh` (or relies on the turn-end sampler) to surface the
new state.

The local auto-sampler is throttled: before every full sample it takes a cheap
local fingerprint (`git rev-parse HEAD` + `git status --porcelain`), skips the
sample entirely when that fingerprint is unchanged within a 15 s window (this
bounds staleness of remote-only changes such as a newly opened PR or CI state
flips), and collapses overlapping samples per session into one in-flight run.
Git/gh subprocesses carry a hard 20 s timeout so a hung `gh` can never leave a
dangling sample.

## Loading / empty / error states

- **Loading**: the panel shows "Loading Git workspace…"; cards show a running
  title while the call is pending.
- **Empty**: `git_workspace` with no data → "Run git_workspace to populate the
  workspace."; no PR → "No pull request for this branch."; no checks → "No
  checks."; clean tree → "✓ Clean".
- **Error**: error tools render their structured `{error}` message as the card
  title/body (from `errorTitle`), never a raw stack trace.

## Theming & accessibility

- All colors use DSH semantic tokens (`--dsw-alias-*`), so the UI adapts to
  light and dark themes automatically (`body[data-ds-dark-theme]`).
- Git status is conveyed by a letter (M/A/D/R/U), not color alone.
- Interactive elements are real `<button>`/`<a>` with `aria-label`s and titles.

## Read-first, then writes

Read tools are the foundation: the UI inspects, searches, diffs, browses,
opens, and refreshes, and the panel's refresh re-reads the existing session
snapshot without invoking any mutation. Write operations run only through the
dedicated backend write tools (`github_pr_create`, `git_stage`, `git_unstage`,
`git_commit`, `git_branch_create`, `git_push`, `git_checkout`, `git_merge`,
`git_reset`, `github_pr_merge`, `github_pr_comment`, `github_pr_review`) and
are always explicit user actions — a button press dispatching a native
`/git-…` command — never fired by automatic sampling or refresh paths, and
never routed through chat.

## Write controls in the panel

The panel exposes the write tools as compact controls. Controls dispatch
exclusively through DSH's **native slash-command channel**: the client calls
`session.command('/git-… {…}')` (see [`sessionCommand`](../src/client/services.js)),
which the host routes to a **`dsh-commands` `CommandRuntime`** handler
registered by [src/commands.ts](../src/commands.ts). The handler runs the
same backend tools directly — no model turn, no LLM tokens, no queued
prompt — while still going through every backend validation and blast-radius
guard. There is no chat fallback: `session.prompt(...)` is never called from
the panel. When native commands are unavailable, the panel disables itself
(see "Real refresh" above) instead of degrading to a queued turn.

Source Control tab:

- **Per-file Stage/Unstage** — every row in the Changes and Untracked cards
  carries a `Stage`/`Unstage` button that dispatches `git-stage`/`git-unstage`
  for that exact path.
- **Stage All / Unstage All** — header buttons that dispatch the same
  commands with `all:true`.
- **Commit box** — a message textarea (Ctrl/Cmd+Enter submits) plus a primary
  button: it reads `Commit` when a message is typed and falls back to
  `Stage All` when empty.
- **Git action menu** — an overflow menu next to the commit box with Commit,
  Commit & Push, Commit & Sync (`git-stage` → `git-commit` → `git-push`
  command chains), Push, Force Push (framed as force-with-lease semantics),
  New Branch / Switch Branch / Merge Branch (each opens a small name input,
  then dispatches `git-branch-create` / `git-checkout` / `git-merge`; Switch
  and Merge Branch attach a `<datalist>` of known branches sourced from the
  already-sampled `data.branches` — autocomplete only, still free text, and
  New Branch gets no datalist since it names a branch that doesn't exist
  yet), Create PR / Push before PR (`git-pr-create`; disabled with a note
  while a pull request already exists), read-only sync entries (Pull,
  Fast-forward, Sync, Rebase from upstream, Fetch, Publish), and Discard
  Changes (`git-discard`, the hard-reset command with confirm:true built in).
- **Commit diff** — each row in the "Committed on branch" / "Commits" cards
  carries a small icon button that dispatches `/git-show {sha}` for that
  commit.

Pull Request tab:

- **Merge & review card** — a Merge/Squash/Rebase segmented choice (defaults
  to Squash) and a "Delete source branch" checkbox feed one big merge button
  that dispatches `github_pr_merge` (`/git-pr-merge`) with `method` and, when
  checked, `deleteBranch:true`. Below it, Approve and Request changes buttons
  dispatch `github_pr_review` (`/git-pr-review`; `REQUEST_CHANGES` notes that a
  review body is required). Both sections disable themselves once the PR is
  merged or closed.
- **Full diff** — an icon button next to the PR stat line dispatches
  `/git-pr-diff {number}`.
- **CI logs** — a failing check row in the Checks card carries a "Fetch
  failure logs" icon button that dispatches `/git-ci-logs {runId}`. `runId`
  is parsed from the check's URL (`/actions/runs/(\d+)`); checks without a
  GitHub Actions-shaped URL (or that aren't failing) don't show the button.
- **Comment composer** — a textarea + Comment button that dispatches
  `/git-pr-comment` with the PR number and body.

Because each control rides a native command, every mutation still flows
through the backend's validation, structured errors, and blast-radius guards
(such as the hard-reset confirmation gate) — the UI adds no bypass path.

## Tool-to-command coverage

Every backend tool now has a native `/git-…` command (checked against
`src/index.ts` tool registrations and `src/commands.ts` registrations — see
[`tests/commands.test.js`](../tests/commands.test.js), which registers all of
them against a throwaway repo and exercises the trickier adapters). What
differs is whether a panel control dispatches it yet.

Write commands (the mutation paths the panel exposes):

| Tool | Command | Notes |
| --- | --- | --- |
| `git_stage` | `git-stage` | |
| `git_unstage` | `git-unstage` | |
| `git_commit` | `git-commit` | |
| `git_push` | `git-push` | |
| `git_branch_create` | `git-branch-create` | |
| `git_checkout` | `git-checkout` | |
| `git_merge` | `git-merge` | |
| `git_reset` | `git-discard` | Partial — hard-reset to HEAD only, `confirm:true` baked in; no `mode`/`ref` surface |
| `github_pr_create` | `git-pr-create` | |
| `github_pr_merge` | `git-pr-merge` | |
| `github_pr_comment` | `git-pr-comment` | |
| `github_pr_review` | `git-pr-review` | |
| — (composite) | `git-commit-push`, `git-commit-sync`, `git-sync` | stage→commit→push / commit→ff→push chains |
| — (sync helpers) | `git-fetch`, `git-pull`, `git-fast-forward`, `git-rebase` | implemented in `src/git/syncops.ts` |
| — (projection) | `git-refresh` | `forceSample()`; no tool equivalent |

Read-only commands, with their panel entry point (or "—" where the command
exists but no control calls it yet — extending coverage there is just adding
a button, `toolCommand` already wraps the tool):

| Tool | Command | Panel entry point |
| --- | --- | --- |
| `git_workspace` | `git-workspace` | — (only reachable via `/git-refresh`, which re-samples the projection) |
| `git_status` | `git-status` | — |
| `git_files` | `git-files` | — (scope is a positional arg, wrapped: `gitFiles(input.scope ?? 'working-tree', dir)`) |
| `git_diff` | `git-diff` | Diff viewer's "Fetch full diff" CTA for binary/oversized files |
| `git_commits` | `git-commits` | — (the panel renders commit history from the sampled meta) |
| `git_show` | `git-show` | Each commit row's "View this commit's diff" icon button (SC tab) |
| `git_compare` | `git-compare` | — |
| `git_blame` | `git-blame` | — |
| `git_branches` | `git-branches` | Feeds the Switch/Merge Branch input's `<datalist>` from the already-sampled `data.branches` (no extra round trip) |
| `git_remotes` | `git-remotes` | — |
| `git_worktrees` | `git-worktrees` | — |
| `git_stash` | `git-stash` | — (the panel renders the stash count from the sampled meta) |
| `git_tags` | `git-tags` | — |
| `github_pr` | `git-pr` | — (the panel renders PR summary from the sampled meta) |
| `github_pr_diff` | `git-pr-diff` | PR header's "Fetch the full pull request diff" icon button |
| `github_pr_reviews` | `git-pr-reviews` | — |
| `github_pr_comments` | `git-pr-comments` | — (the panel renders comments from the sampled meta) |
| `github_ci` | `git-ci` | — (the panel renders check status from the sampled meta) |
| `github_ci_logs` | `git-ci-logs` | Failing check rows' "Fetch failure logs" icon button (PR tab); `runId` is parsed from the check's `/actions/runs/(\d+)` URL, so only checks with a GitHub Actions URL show the button |
| `github_issue` | `git-issue` | — |
| `github_issue_comments` | `git-issue-comments` | — |
| `github_releases` | `git-releases` | — |

The panel has **zero chat/agent-turn entry points** — every control either
dispatches a native `/git-…` command or does nothing (hidden or disabled
when `onDispatch` is `null`). The "—" rows above are commands with no panel
button yet, not gaps in native-command coverage; wiring one up is adding a
control that calls the existing `/git-…` command.

## Building the client

```bash
npm run build        # tsc (backend) + scripts/build-client.mjs (client bundle)
```

The client sources are plain ES modules (no JSX compiler, no bundler
dependency). `scripts/build-client.mjs` transforms them into the single
classic script DSH serves at `/plugins/@tzzs/dsh-git-workspace/client.js`.

## Future mutation

The write tools above shipped through the native command architecture: each
backend tool gets a `/git-…` command in [src/commands.ts](../src/commands.ts)
(`toolCommand` wraps the tool function and parses JSON args — no shell, no
model turn), and the panel control dispatches that command via
`session.command()`. Further risky operations (such as `github_pr_close`)
slot in the same way: register the tool in `src/index.ts` with a blast-radius
description, wrap it as a native command, then add a panel control that
dispatches the command. Rules that hold no matter how risky a command is: its
description states what it can destroy; it runs only from an explicit user
action (never automatic sampling/refresh); and the UI pairs destructive
buttons with confirmation before dispatching.

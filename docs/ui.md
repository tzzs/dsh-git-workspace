# Git Workspace UI

`@tzzs/dsh-git-workspace` ships a browser (client) half that turns the read-only
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
   toggles a right-side drawer with the live workspace summary. The drawer
   renders through a React portal into `document.body`, so composer transforms
   cannot offset it.

   The drawer body has two tabs:

   - **Source Control** — overview card (branch, upstream, total `+adds/-dels`
     from per-file numstat, CI dot, comparison vs base, stash count) plus
     collapsible cards for Changes and Untracked files (directory-tree grouping,
     per-file stats and status letters), Recent commits, and Branches.
   - **Pull Request** — PR state pill + link, CI status card (per-check rows),
     and comments grouped into Unresolved / Resolved sections. Comments are
     aggregated by the backend: `git_workspace` fetches the current branch's PR
     review threads when a pull request exists.

## Component structure

```
src/client/
├── index.js                  # plugin entry: { inject, apply } + slot registrations
├── services.js               # host-context capture; session prompt bridge (real refresh)
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
    │                         #   + portal-mounted right-side drawer + agent-prompt refresh
    ├── drawer.js             # reusable side drawer: backdrop, ESC close, drag-resize,
    │                         #   width persistence, slide-in animation
    └── workspace-panel.js    # collapsible sections: changes (grouped staged/unstaged/
                              #   untracked with copy-path), commits, branches, PR, CI
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
`git_workspace`, the backend now also samples Git state **locally** and ships
it to the browser through the DSH session-projection subsystem:

- On `session/created` and after every `turn/end`, the plugin runs
  `gitWorkspace()` in the session's `cwd` (plain local git/gh subprocesses —
  no LLM, no conversation message) and appends a log-only
  `tzzs.git-workspace/sample` event carrying the whole `WorkspaceMeta`
  payload. Identical payloads are deduplicated per session.
- A session projection unit registered under the key `tzzs.git-workspace`
  folds those events; the host pushes schema-validated values over the wire
  as `session/projection` frames.
- The composer chip reads the key via `useProjection('tzzs.git-workspace')`
  and falls back to scanning tool-result meta for sessions or deployments
  without the projection registry (headless CLI). Structured error payloads
  (e.g. `NOT_A_GIT_REPOSITORY`) surface in the drawer empty state.

Because the sample event type is not surface-eligible, it never enters
model-visible history: auto-loading costs zero tokens and does not pollute
the conversation.

## UI state

State is intentionally lightweight:

- Each toolview card is a pure function of its frozen `block` (`RunningToolCall`
  or `ToolResultNode`). No store needed.
- The drawer keeps only `open` + `width` (persisted in localStorage) locally;
  all workspace data is read from the session conversation snapshot via the
  framework's `useSession` hook.

## Real refresh

The header toggle shows a dirty-change count badge plus an overall `StateDot`
(CI failing → red, running → blue ring, dirty tree → amber, clean → green).
The drawer's refresh button routes through the sessions service
(`binding(sessionId).session.prompt(...)`) and asks the agent to run
`git_workspace` again — there is no client-side tool RPC, so this is the one
legitimate way to pull fresh data. The empty-state CTA uses the same path.

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

## Read-only principle

The UI is **read-only**, mirroring the backend. It inspects, searches, diffs,
browses, opens, and refreshes — it never stages, commits, pushes, or merges.
The panel's refresh re-reads the existing session snapshot; it does not invoke
any mutation.

## Building the client

```bash
npm run build        # tsc (backend) + scripts/build-client.mjs (client bundle)
```

The client sources are plain ES modules (no JSX compiler, no bundler
dependency). `scripts/build-client.mjs` transforms them into the single
classic script DSH serves at `/plugins/@tzzs/dsh-git-workspace/client.js`.

## Future mutation

The toolview + panel architecture is ready for a mutation phase without
structural change. The panel is the natural home for stage/commit/push/PR
controls; they are deliberately omitted from this read-only version.

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

2. **`conversation.session.header.actions`** (list, session scope) — a
   persistent Git Workspace explorer. A button in the session header's action
   row ("Git Workspace") toggles a floating panel that shows the live workspace
   summary (branch, changes, commits, PR, CI). The header action is
   session-scoped, so it reads the current session's conversation directly via
   the framework `useSession` hook — the same snapshot the tool cards render
   from.

## Component structure

```
src/client/
├── index.js                  # plugin entry: { inject, apply } + slot registrations
├── common.js                 # block/meta helpers shared by all cards
├── components.js             # primitive card/row/pill/stat/icon pieces (DSH theme tokens)
├── toolview/                 # per-tool compact cards (tool.call.toolview)
│   ├── workspace-row.js
│   ├── status-row.js
│   ├── diff-row.js
│   ├── commits-row.js
│   ├── show-row.js
│   ├── pr-row.js
│   ├── ci-row.js
│   └── generic-row.js
└── panel/                    # persistent Git Workspace explorer (header action)
    ├── container.js          # session-scoped header action + floating panel
    └── workspace-panel.js    # floating panel UI
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
header action panel reads the same meta via useSession (ConversationSnapshot)
```

The **Agent and the UI share one Git context**: the Agent consumes the same
`git_*` tools, and the UI renders those same tool results. There is no
separate frontend data pipeline.

## UI state

State is intentionally lightweight:

- Each toolview card is a pure function of its frozen `block` (`RunningToolCall`
  or `ToolResultNode`). No store needed.
- The panel keeps only `open` (local React state) and a `refresh` tick. All
  data is read from the session conversation snapshot via the framework's
  `useSession` hook.

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

# DSH Web UI Extension API (research)

Reference for how a plugin provides a browser (React) UI in DeepSeek Harness.
Verified against the installed DSH packages under
`node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`.

## 1. Client plugin = dual-face npm package

A "client plugin" is one npm package with:

- a **Node half** (package root) that registers backend tools / services, and
- a **browser half** (`exports["./client"]`) that is a Cordis plugin registering
  React components into slots.

The DSH web shell scans loaded loader entries for a `dsh.client` declaration,
resolves each `exports["./client"]`, hashes the built bundle into a
`window.__DSH_BOOT__` manifest, and serves each bundle under `/plugins`.

## 2. Declaring a client package (`package.json`)

```json
{
  "exports": {
    ".": { "default": "./lib/index.js" },
    "./client": { "default": "./lib/client/client.js" },
    "./package.json": "./package.json"
  },
  "dsh": {
    "client": {
      "inject": ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-locale"],
      "platform": "web"
    }
  }
}
```

- `dsh.client.platform` must be `"web"` for the host scan to pick it up.
- `dsh.client.inject` lists package-name dependency edges (activation ordering).
- `exports["./client"]` is mandatory for a `dsh.client` package.

## 3. Browser bundle contract

Each client bundle is a single classic script:

```js
window.__ModuleLoader__.load({
  id: "@scope/pkg",
  factory: (require) => {
    var module = { exports: {} };
    // ... module bodies ...
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
```

`inject` is an array of **Cordis service names**. `apply(ctx)` is the plugin
body. Platform externals (`react`, `@deepseek-ai/cordis`, …) are resolved
through `require` and are NOT bundled.

## 4. Registering a tool-call view (`tool.call.toolview`)

Keyed slot dispatched by the wire tool name:

```js
ctx.slots.inject('tool.call.toolview', () =>
  ctx.slots.register(
    { name: 'tool.call.toolview', key: 'git_workspace', locale: 'ns' },
    GitWorkspaceRow,
  ),
);
```

Registered components receive `ToolCallOwnerProps`:

```ts
interface ToolCallOwnerProps {
  callId: string;
  toolName: string;
  block: ToolCallBlock;        // RunningToolCall | ToolResultNode
  cwd?: string;
  openFile: (path: string) => void;
  inspect?: () => void;
}
```

`ToolCallBlock` is `RunningToolCall` (has `callId`, `name`, `argsRaw`,
`callView`) or `ToolResultNode` (has `kind: 'tool-result'`, `content`,
`isError`, `meta`). Distinguish settled vs running with `'kind' in block`.
Session-scope slots also receive `useSession`, `sessionId`, `useProjection`.

## 5. Reusable UI primitives

- `@deepseek-ai/dsh-client-ui-primitives`: `Button`, `Pill`, `Menu`,
  `Tooltip`, `DisclosureRow`, `StateDot`, `Modal`, `Toast`, `Input`, plus
  content blocks `TerminalBlock`, `ReadBlock`, `DiffBlock`, `SearchBlock`,
  `WebBlock`, and a large icon set (`IconBranchOutline16`,
  `IconSearchOutline16`, `IconRefreshOutline16`, …).
- `@deepseek-ai/dsh-client-ui-tool`: `ToolRow`, `toolRowModel`,
  `diffCardModel`, `readCardModel`, `terminalCardModel`, `searchCardModel`,
  `VARIANT_TITLES`.

`DiffBlockProps`:

```ts
interface DiffHunk { path: string; oldText: string | null; newText: string }
interface DiffBlockProps { diffs: DiffHunk[]; maxLines?: number; className?: string }
```

## 6. Backend render intents

`ToolDefinition` (from `@deepseek-ai/dsh-tools`) declares how a call renders:

```ts
output: {
  schema: JsonSchemaNode;
  render(args, value): ContentBlock[];
  presentationMeta?(args, value): JsonValue;   // JSON-safe, threaded to block.meta
}
presentCall?(args): ToolCallView | undefined;
presentResult?(args, result): ToolResultView | undefined;
```

- `ToolCallView` = `GenericCallView | TerminalCallView | DiffCallView`
- `ToolResultView` = `Generic | Terminal | Diff | Search | Read | Web`

`DiffResultView` is `{ card: 'diff', title?, diffs: FileDiff[] }` with
`FileDiff { path, oldText: string|null, newText: string }`. `ReadResultView`
is `{ card: 'read', path, offset, lines, totalLines, lang?, content? }`.
`SearchResultView` is `{ card: 'search', shape: 'matches'|'paths', ... }`.

`presentationMeta` travels to the client as `block.meta` on the settled
`ToolResultNode` — this is the primary client↔backend data channel for this
plugin (see `src/ui/meta.ts`).

## 7. Other extension seats

Slot inventory (declared in `@deepseek-ai/dsh-client-ui-slots`):

| Slot | Kind | Scope | Notes |
| --- | --- | --- | --- |
| `root` | single | root | App shell seed |
| `sidebar` | single | root | Occupied; replacing removes inner seats |
| `sidebar.workspaces` | single | root | Occupied by ui-workspace |
| `sidebar.settings` | single | root | Occupied by ui-settings |
| `sidebar.footer.action` | **list** | root | **Additive** — this plugin's "Git Workspace" foot action |
| `shell.overlay` | **list** | root | **Additive** — this plugin's Git Workspace panel |
| `details` | single | session | Occupied by ui-conversation |
| `conversation.*`, `settings.*` | various | — | Conversation / settings internals |

`ctx.layout` exposes `toggleSidebar()`, `openDetails()`, `closeDetails()`.

## 8. Client → backend communication

**There is no generic "call any tool by name" RPC from client code.** The
client↔backend surface is a fixed typed map (`IApiClient`): `sessions`,
`workspace`, `host`, `skills`, `settings`, `credentials`, `llm`, `events`.

To have the **Agent** execute a tool, a client sends a `prompt` (or slash
`command`) via `ctx.sessions.binding(id)?.session.prompt(...)`. Tool **results**
are read from the conversation snapshot (`useSession` selector) as `block`
objects — exactly what the `tool.call.toolview` cards consume.

## 9. Platform externals / build

Externals that must stay unbundled (resolved by the module table):

```
react, react/jsx-runtime, react-dom, react-dom/client,
@deepseek-ai/cordis, @deepseek-ai/dsh-client-ui-slots,
@deepseek-ai/dsh-client-web-react, @deepseek-ai/dsh-client-ui-primitives,
@deepseek-ai/dsh-client-ui-attachment, @deepseek-ai/dsh-client-schema-form
```

Cross-plugin value imports must be declared in `dsh.client.inject`. DSH builds
its own client packages with `tsdown`, but the only hard contract is the
`window.__ModuleLoader__.load({ id, factory })` classic-script format.
This project bundles with `scripts/build-client.mjs` (see `docs/ui.md`).

## 10. Theme tokens

- `--dsw-static-*` — raw palette (e.g. `--dsw-static-red-600`).
- `--dsw-alias-*` — semantic tokens that flip with `body[data-ds-dark-theme]`:
  `--dsw-alias-bg-base`, `--dsw-alias-bg-layer-1/2/3`,
  `--dsw-alias-label-primary/secondary/tertiary/caption`,
  `--dsw-alias-border-l1..l4`, `--dsw-alias-state-error-primary`,
  `--dsw-alias-state-success-primary`, `--dsw-alias-state-warn-primary`,
  `--dsw-alias-brand-primary`.
- `--dsw-font-family`, `--dsw-font-family-code` for typography.

Source: `@deepseek-ai/dsh-client-ui-theme/lib/styles/design-platform.css`.

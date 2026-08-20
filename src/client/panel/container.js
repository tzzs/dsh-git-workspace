import * as React from 'react'
import { GitWorkspacePanel } from './workspace-panel.js'
import { isOpen, subscribe, toggle } from './panel-store.js'
// Scan a ConversationSnapshot's nodes for the latest tool-result node carrying
// presentation meta for the given tool name.
function findToolResult(snapshot, toolName) {
  if (!snapshot || !Array.isArray(snapshot.nodes)) return null
  let found = null
  for (const node of snapshot.nodes) {
    if (
      node &&
      node.kind === 'tool-result' &&
      node.call &&
      node.call.name === toolName &&
      node.meta
    ) {
      found = node.meta
    }
  }
  return found
}

function extractWorkspaceData(meta) {
  if (!meta) return null
  return {
    repository: meta.repository || null,
    branch: meta.branch || null,
    changes: meta.changes || null,
    clean: meta.clean === true,
    files: meta.files || null,
    commits: meta.commits || null,
    pullRequest: meta.pullRequest || null,
    ci: meta.ci || null,
  }
}

export function GitWorkspaceContainer({ useSession, useSessions, sessions }) {
  const [open, setOpenState] = React.useState(isOpen())
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => subscribe(setOpenState), [])

  // Root-scope slot: read the current session id via useSessions. If a
  // session-scope useSession hook is ever provided, fall back to its id.
  const current = useSessions
    ? useSessions((s) => s.current)
    : useSession
      ? useSession((s) => s.sessionId)
      : undefined

  // Subscribe to the current session's conversation so the panel reflects new
  // tool results as the Agent works.
  React.useEffect(() => {
    if (!sessions || !current) return
    const face = sessions.binding(current)?.session
    if (!face) return
    return face.subscribe(() => setTick((n) => n + 1))
  }, [sessions, current])

  const snapshot = React.useMemo(() => {
    if (!sessions || !current) return null
    try {
      return sessions.binding(current)?.session?.getSnapshot() ?? null
    } catch {
      return null
    }
  }, [sessions, current, tick])

  const meta = React.useMemo(
    () => findToolResult(snapshot, 'git_workspace') || findToolResult(snapshot, 'git_status'),
    [snapshot],
  )

  const data = React.useMemo(() => extractWorkspaceData(meta), [meta])

  const onRefresh = React.useCallback(() => setTick((n) => n + 1), [])

  if (!open) return null
  return React.createElement(GitWorkspacePanel, {
    data,
    loading: false,
    onRefresh,
    onClose: () => setOpenState(false),
  })
}

export function GitWorkspaceHeaderAction() {
  const [open, setOpenState] = React.useState(isOpen())
  React.useEffect(() => subscribe(setOpenState), [])
  return React.createElement(
    'button',
    {
      type: 'button',
      onClick: toggle,
      title: 'Git Workspace',
      'aria-label': 'Git Workspace',
      'aria-pressed': open,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: '24px',
        padding: '0 10px',
        borderRadius: '999px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: open ? 'var(--dsw-alias-interactive-bg-hover-solid)' : 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        fontFamily: 'var(--dsw-font-family)',
        fontSize: '12px',
        lineHeight: '24px',
      },
    },
    React.createElement('span', null, '⑃'),
    React.createElement('span', null, 'Git'),
  )
}

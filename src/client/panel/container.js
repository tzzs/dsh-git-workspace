import * as React from 'react'
import { GitWorkspacePanel } from './workspace-panel.js'
import { isOpen, subscribe, toggle } from './panel-store.js'

// Scan a conversation snapshot's nodes for tool-result blocks carrying
// presentation meta, and return the latest one for the given tool name.
function findToolResult(snapshot, toolName) {
  if (!snapshot) return null
  const root = snapshot
  const nodes = root.nodes || root.chat || null
  if (!nodes) return null
  const found = []
  for (const key of Object.keys(nodes)) {
    const node = nodes[key]
    if (!node) continue
    const kind = node.kind || (node.call ? 'tool-result' : node.type)
    if (node.kind === 'tool-result' || kind === 'tool-result') {
      const call = node.call || node.toolCall || null
      const name = call && (call.name || call.toolName)
      if (name === toolName && node.meta) found.push(node.meta)
    }
  }
  return found.length ? found[found.length - 1] : null
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

// Adapt to whichever standard hook the slot scope provides. Root-scope slots
// (shell.overlay) receive useSessions (SessionListState); session-scope slots
// receive useSession (ConversationSnapshot). Both are walked for tool-result
// nodes carrying presentation meta.
export function GitWorkspaceContainer({ useSession, useSessions }) {
  const [open, setOpenState] = React.useState(isOpen())
  const [refreshing, setRefreshing] = React.useState(false)
  const [bump, setBump] = React.useState(0)

  React.useEffect(() => subscribe(setOpenState), [])

  const snapshot = useSession
    ? useSession((s) => s)
    : useSessions
      ? useSessions((s) => (s && s.sessions ? s.sessions : null))
      : null

  const meta = React.useMemo(() => {
    if (!snapshot) return null
    try {
      return findToolResult(snapshot, 'git_workspace') || findToolResult(snapshot, 'git_status')
    } catch {
      return null
    }
  }, [snapshot, bump])

  const data = React.useMemo(() => extractWorkspaceData(meta), [meta])

  const onRefresh = React.useCallback(() => {
    setRefreshing(true)
    // Re-read the snapshot on the next tick; the panel reflects the session.
    setBump((n) => n + 1)
    setTimeout(() => setRefreshing(false), 400)
  }, [])

  if (!open) return null
  return React.createElement(GitWorkspacePanel, {
    data,
    loading: refreshing,
    onRefresh,
    onClose: () => setOpenState(false),
  })
}

export function GitWorkspaceFooterAction({ wide }) {
  const label = wide ? 'Git Workspace' : 'Git'
  return React.createElement(
    'button',
    {
      type: 'button',
      onClick: toggle,
      title: 'Open Git Workspace',
      'aria-label': 'Open Git Workspace',
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: wide ? '6px 12px' : '6px 0',
        justifyContent: wide ? 'flex-start' : 'center',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'var(--dsw-font-family)',
        fontSize: '13px',
      },
    },
    React.createElement('span', null, '⑃'),
    wide ? React.createElement('span', null, label) : null,
  )
}

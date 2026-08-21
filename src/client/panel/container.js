import * as React from 'react'
import { GitWorkspacePanel } from './workspace-panel.js'

// Find the latest tool-result node in a ConversationSnapshot carrying
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

// One session-scoped component: the header "Git Workspace" toggle plus, when
// open, a floating panel. Session scope provides `useSession`, which reads the
// live ConversationSnapshot — the same source the tool cards render from.
export function GitWorkspaceHeaderAction({ useSession }) {
  const [open, setOpen] = React.useState(false)
  const [tick, setTick] = React.useState(0)

  const snapshot = useSession ? useSession((s) => s) : null

  const meta = React.useMemo(
    () =>
      findToolResult(snapshot, 'git_workspace') ||
      findToolResult(snapshot, 'git_status'),
    [snapshot, tick],
  )
  const data = React.useMemo(() => extractWorkspaceData(meta), [meta])

  const toggle = React.useCallback(() => setOpen((v) => !v), [])
  const refresh = React.useCallback(() => setTick((n) => n + 1), [])

  const button = React.createElement(
    'button',
    {
      type: 'button',
      onClick: toggle,
      title: 'Git Workspace',
      'aria-label': 'Git Workspace',
      'aria-haspopup': 'dialog',
      'aria-expanded': open,
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
        whiteSpace: 'nowrap',
      },
    },
    React.createElement('span', null, '⑃'),
    React.createElement('span', null, 'Git'),
  )

  const children = open
    ? [
        button,
        React.createElement(GitWorkspacePanel, {
          data,
          loading: false,
          onRefresh: refresh,
          onClose: () => setOpen(false),
        }),
      ]
    : [button]

  return React.createElement(React.Fragment, null, ...children)
}

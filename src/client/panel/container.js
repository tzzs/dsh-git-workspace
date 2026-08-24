import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { IconBranchOutline16, IconRefreshOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { GitWorkspacePanel } from './workspace-panel.js'
import { Drawer } from './drawer.js'
import { sessionPrompt } from '../services.js'
import {
  Dot,
  IconBtn,
  ensureStyles,
  workspaceOverallState,
} from '../components.js'

const REFRESH_PROMPT =
  'Run the git_workspace tool now and report the refreshed workspace summary.'

const PROJECTION_KEY = 'tzzs.git-workspace'

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
    filesTruncated: meta.filesTruncated === true,
    commits: meta.commits || null,
    commitsAhead: typeof meta.commitsAhead === 'number' ? meta.commitsAhead : 0,
    branches: meta.branches || null,
    stashCount: typeof meta.stashCount === 'number' ? meta.stashCount : 0,
    comparison: meta.comparison || null,
    additionsTotal: typeof meta.additionsTotal === 'number' ? meta.additionsTotal : 0,
    deletionsTotal: typeof meta.deletionsTotal === 'number' ? meta.deletionsTotal : 0,
    pullRequest: meta.pullRequest || null,
    ci: meta.ci || null,
  }
}

function dirtyCount(data) {
  if (!data) return 0
  const c = data.changes
  if (c && typeof c === 'object') {
    return (
      (c.modified || 0) + (c.staged || 0) + (c.deleted || 0) + (c.renamed || 0) + (c.untracked || 0)
    )
  }
  return Array.isArray(data.files) ? data.files.length : 0
}

function extractProjected(value) {
  if (!value || typeof value !== 'object' || !('error' in value)) {
    return { data: extractWorkspaceData(value), errorText: null }
  }
  const e = value.error && typeof value.error === 'object' ? value.error : {}
  return { data: null, errorText: e.message || e.code || 'workspace unavailable' }
}

export function GitWorkspaceControl({ useSession, sessionId, useProjection }) {
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  ensureStyles()
  const projected =
    typeof useProjection === 'function' ? useProjection(PROJECTION_KEY) : undefined
  const snapshot = useSession ? useSession((s) => s) : null

  const source = React.useMemo(() => {
    const toolResult = findToolResult(snapshot, 'git_workspace') || findToolResult(snapshot, 'git_status')
    return toolResult || projected
  }, [projected, snapshot])
  const { data, errorText } = React.useMemo(() => extractProjected(source), [source])

  const toggle = React.useCallback(() => setOpen((v) => !v), [])
  const close = React.useCallback(() => setOpen(false), [])

  const refresh = React.useCallback(() => {
    if (pending || !sessionId) return Promise.resolve(false)
    setPending(true)
    return sessionPrompt(sessionId, REFRESH_PROMPT).finally(() => setPending(false))
  }, [pending, sessionId])

  const sendPrompt = React.useCallback(
    (text) => (sessionId ? sessionPrompt(sessionId, text) : Promise.resolve(false)),
    [sessionId],
  )

  // Auto-sample once per open when the session has no workspace data yet.
  const autoOpenRef = React.useRef(false)
  React.useEffect(() => {
    if (!open) {
      autoOpenRef.current = false
      return
    }
    if (autoOpenRef.current || pending || !sessionId) return
    if (data !== null || errorText) return
    autoOpenRef.current = true
    refresh()
  }, [open, data, errorText, pending, sessionId, refresh])

  const dirty = dirtyCount(data)
  const overall = workspaceOverallState(data)

  const button = React.createElement(
    'button',
    {
      type: 'button',
      className: 'dgw-chip',
      onClick: toggle,
      title: 'Git Workspace',
      'aria-label': 'Git Workspace',
      'aria-haspopup': 'dialog',
      'aria-expanded': open,
    },
    React.createElement(IconBranchOutline16, { size: 14 }),
    React.createElement('span', null, 'Git'),
    dirty > 0
      ? React.createElement(
          'span',
          {
            style: {
              minWidth: '16px',
              height: '16px',
              padding: '0 4px',
              borderRadius: '999px',
              background: 'var(--dsw-alias-state-warn-primary)',
              color: 'var(--dsw-alias-bg-base)',
              fontSize: '10px',
              fontWeight: 600,
              lineHeight: '16px',
              textAlign: 'center',
            },
          },
          dirty > 99 ? '99+' : String(dirty),
        )
      : null,
    overall ? React.createElement(Dot, { state: overall, size: 8 }) : null,
  )

  const subtitle = data
    ? [data.repository && data.repository.name, data.branch && data.branch.name]
        .filter(Boolean)
        .join(' · ') || null
    : null

  const drawer =
    open && typeof document !== 'undefined'
      ? ReactDOM.createPortal(
          React.createElement(
            Drawer,
            {
              open,
              onClose: close,
              title: 'Git Workspace',
              subtitle,
              actions: React.createElement(
                IconBtn,
                {
                  label: pending ? 'Refresh requested…' : 'Refresh via agent (runs git_workspace)',
                  onClick: refresh,
                },
                React.createElement(IconRefreshOutline14, { size: 14 }),
              ),
            },
            React.createElement(GitWorkspacePanel, {
              data,
              errorText,
              loading: false,
              refreshing: pending,
              canRefresh: Boolean(sessionId),
              onRefresh: refresh,
              onPrompt: sessionId ? sendPrompt : null,
            }),
          ),
          document.body,
        )
      : null

  return React.createElement(React.Fragment, null, ...(drawer ? [button, drawer] : [button]))
}

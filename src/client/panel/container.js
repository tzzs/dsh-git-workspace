import * as React from 'react'
import * as ReactDOM from 'react-dom'
import {
  IconBranchOutline16,
  IconRefreshOutline14,
  Pill,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { GitWorkspacePanel } from './workspace-panel.js'
import { Drawer } from './drawer.js'
import { sessionCommand } from '../services.js'
import {
  Dot,
  IconBtn,
  ensureStyles,
  workspaceOverallState,
} from '../components.js'

const PROJECTION_KEY = 'tzzs.git-workspace'
const OPEN_KEY = 'dsh-git-workspace.open'

function readOpenPref() {
  try {
    return localStorage.getItem(OPEN_KEY) === '1'
  } catch {}
  return false
}

function writeOpenPref(open) {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0')
  } catch {}
}

function sampleTime(meta) {
  const t = meta && typeof meta.sampledAt === 'string' ? Date.parse(meta.sampledAt) : NaN
  return Number.isNaN(t) ? 0 : t
}

// Field-level union of two snapshots: `primary` wins conflicts, `fallback`
// fills fields the primary lacks (e.g. git_status meta has no pullRequest/ci).
function mergeMeta(primary, fallback) {
  if (!primary) return fallback || null
  if (!fallback) return primary
  const out = { ...fallback }
  for (const [key, value] of Object.entries(primary)) {
    if (value !== undefined && value !== null) out[key] = value
  }
  return out
}

// The projection is sampled locally on session/created + turn/end, so it is
// the conversation-independent source; tool-result meta may be fresher when
// the agent ran a tool mid-turn. Pick the newer snapshot as primary and
// gap-fill from the other, preferring usable data over error payloads.
function resolveSource(projected, toolResult) {
  const projErr = Boolean(projected && typeof projected === 'object' && 'error' in projected)
  const toolErr = Boolean(toolResult && typeof toolResult === 'object' && 'error' in toolResult)
  const projData = projErr ? null : projected
  const toolData = toolErr ? null : toolResult
  if (projData && toolData) {
    const primary = sampleTime(projData) >= sampleTime(toolData) ? projData : toolData
    return mergeMeta(primary, primary === projData ? toolData : projData)
  }
  if (toolData) return toolData
  if (projData) return projData
  return projErr ? projected : toolResult || projected
}

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
  const [open, setOpen] = React.useState(readOpenPref)
  const [pending, setPending] = React.useState(false)

  ensureStyles()
  const projected =
    typeof useProjection === 'function' ? useProjection(PROJECTION_KEY) : undefined
  const snapshot = useSession ? useSession((s) => s) : null

  // Latch: the first payload (value or structured error) proves local
  // sampling is alive — from then on the panel never auto-prompts the agent.
  // A missing face yields undefined forever, so only the absence of any
  // payload keeps the conversation fallback alive.
  const [autoSampled, setAutoSampled] = React.useState(false)
  React.useEffect(() => {
    if (projected !== undefined && projected !== null) setAutoSampled(true)
  }, [projected])

  const source = React.useMemo(() => {
    const toolResult =
      findToolResult(snapshot, 'git_workspace') || findToolResult(snapshot, 'git_status')
    return resolveSource(projected ?? null, toolResult)
  }, [projected, snapshot])
  const { data, errorText } = React.useMemo(() => extractProjected(source), [source])

  const toggle = React.useCallback(() => setOpen((v) => !v), [])
  const close = React.useCallback(() => setOpen(false), [])

  // Sidebar persistence + global toggle shortcut (Ctrl/Cmd+Shift+G).
  React.useEffect(() => {
    writeOpenPref(open)
  }, [open])
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && String(e.key).toLowerCase() === 'g') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A session either has the native `dsh-commands` channel or it doesn't;
  // once a dispatch comes back unmatched/unavailable we know it never will
  // for this session, so the whole panel switches to a disabled, labeled
  // state instead of ever falling back to a queued chat prompt.
  const [commandsSupported, setCommandsSupported] = React.useState(true)
  const markUnsupported = React.useCallback(() => setCommandsSupported(false), [])

  const refresh = React.useCallback(() => {
    if (pending || !sessionId) return Promise.resolve(false)
    setPending(true)
    return sessionCommand(sessionId, '/git-refresh {}')
      .then((state) => {
        if (state === 'executed') return true
        if (state === 'unmatched' || state === 'unavailable') markUnsupported()
        return false
      })
      .finally(() => setPending(false))
  }, [pending, sessionId, markUnsupported])

  const sendDispatch = React.useCallback(
    (action) => {
      if (!sessionId || !action || !action.name) return Promise.resolve(false)
      const run = (current) => {
        const line = `/${current.name} ${JSON.stringify(current.args || {})}`
        return sessionCommand(sessionId, line).then((state) => {
          if (state === 'executed') return current.next ? run(current.next) : true
          if (state === 'unmatched' || state === 'unavailable') markUnsupported()
          return false
        })
      }
      return run(action)
    },
    [sessionId, markUnsupported],
  )

  // Fallback-only auto-sample: when no projection payload exists at all
  // (headless CLI or broken sampling), force one native /git-refresh per
  // open after a short grace so a slow first sample never triggers a
  // pointless request.
  const autoOpenRef = React.useRef(false)
  React.useEffect(() => {
    if (!open) {
      autoOpenRef.current = false
      return
    }
    if (autoSampled || autoOpenRef.current || pending || !sessionId) return
    if (data !== null || errorText) return
    const t = setTimeout(() => {
      autoOpenRef.current = true
      refresh()
    }, 2000)
    return () => clearTimeout(t)
  }, [open, autoSampled, data, errorText, pending, sessionId, refresh])

  const dirty = dirtyCount(data)
  const overall = workspaceOverallState(data)

  const button = React.createElement(
    Tooltip,
    { label: 'Git Workspace (Ctrl/Cmd+Shift+G)', side: 'bottom', delayMs: 250 },
    React.createElement(
      Pill,
      {
        active: open,
        onClick: toggle,
        style: { height: '28px', borderRadius: '14px', fontSize: '13px' },
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
    ),
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
                  label: pending ? 'Refreshing…' : 'Refresh workspace',
                  onClick: refresh,
                },
                React.createElement(IconRefreshOutline14, { size: 14 }),
              ),
            },
            React.createElement(GitWorkspacePanel, {
              data,
              errorText,
              // Only "loading" while a session exists to sample from and
              // neither data, an error, nor the autoSampled latch has
              // resolved yet — otherwise this would spin forever.
              loading: Boolean(sessionId) && data === null && !errorText && !autoSampled,
              refreshing: pending,
              canRefresh: Boolean(sessionId),
              autoSampled,
              onRefresh: refresh,
              onDispatch: sessionId && commandsSupported ? sendDispatch : null,
              commandsUnsupported: Boolean(sessionId) && !commandsSupported,
            }),
          ),
          document.body,
        )
      : null

  return React.createElement(React.Fragment, null, ...(drawer ? [button, drawer] : [button]))
}

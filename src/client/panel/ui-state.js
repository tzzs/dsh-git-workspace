import * as React from 'react'

const KEY_PREFIX = 'dsh-git-workspace.ui:'

export const PANEL_UI_DEFAULTS = {
  diffMode: 'unified',
  selectedKey: null,
  groupOpen: { staged: true, unstaged: true, untracked: true },
  treeMode: 'tree',
  commitDraft: '',
  dirOpen: {},
}

export function uiScope(data) {
  const repo = (data && data.repository && (data.repository.root || data.repository.name)) || 'repo'
  const branch = (data && data.branch && data.branch.name) || 'detached'
  return `${repo}:${branch}`
}

function read(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

function merge(defaults, stored) {
  const out = { ...defaults, ...stored }
  for (const key of ['groupOpen', 'dirOpen']) {
    out[key] = { ...(defaults[key] || {}), ...((stored && stored[key]) || {}) }
  }
  return out
}

export function usePanelUi(scope, defaults = PANEL_UI_DEFAULTS) {
  const key = KEY_PREFIX + scope
  const [state, setState] = React.useState(() => merge(defaults, read(key)))
  const update = React.useCallback((patch) => {
    setState((prev) => {
      const next = typeof patch === 'function' ? { ...prev, ...patch(prev) } : { ...prev, ...patch }
      write(key, next)
      return next
    })
  }, [key])
  React.useEffect(() => {
    write(key, state)
  }, [key, state])
  return [state, update]
}

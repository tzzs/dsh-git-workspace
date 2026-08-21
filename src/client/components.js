import * as React from 'react'

const S = {
  card: {
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: '10px',
    background: 'var(--dsw-alias-bg-base)',
    overflow: 'hidden',
    margin: '4px 0',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    fontSize: '13px',
    lineHeight: '16px',
  },
  title: {
    color: 'var(--dsw-alias-label-primary)',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sub: {
    color: 'var(--dsw-alias-label-secondary)',
  },
  caption: {
    color: 'var(--dsw-alias-label-caption)',
  },
  body: {
    padding: '2px 10px 8px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    gap: '6px',
    padding: '2px 0',
    fontSize: '13px',
    lineHeight: '18px',
    cursor: 'default',
  },
  monospace: {
    fontFamily: 'var(--dsw-font-family-code)',
    fontSize: '12px',
  },
  pill: {
    borderRadius: '999px',
    padding: '0 8px',
    fontSize: '11px',
    lineHeight: '16px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    flex: 'none',
  },
  add: { color: 'var(--dsw-alias-state-success-primary)' },
  del: { color: 'var(--dsw-alias-state-error-primary)' },
  warn: { color: 'var(--dsw-alias-state-warn-primary)' },
  muted: { color: 'var(--dsw-alias-label-tertiary)' },
}

export function Card({ header, children }) {
  return React.createElement(
    'div',
    { style: S.card, 'data-git-workspace-card': '' },
    React.createElement(
      'div',
      { style: S.header },
      header,
    ),
    children ? React.createElement('div', { style: S.body }, children) : null,
  )
}

export function Text({ children, style }) {
  return React.createElement('div', { style: { ...S.sub, ...(style || {}) } }, children)
}

export function Row({ children, style }) {
  return React.createElement('div', { style: { ...S.row, ...(style || {}) } }, children)
}

export function Code({ children, style }) {
  return React.createElement(
    'span',
    { style: { ...S.monospace, color: 'var(--dsw-alias-label-primary)', ...(style || {}) } },
    children,
  )
}

export function Add({ children }) {
  return React.createElement('span', { style: { ...S.monospace, ...S.add } }, children)
}
export function Del({ children }) {
  return React.createElement('span', { style: { ...S.monospace, ...S.del } }, children)
}
export function Warn({ children }) {
  return React.createElement('span', { style: { ...S.monospace, ...S.warn } }, children)
}
export function Muted({ children }) {
  return React.createElement('span', { style: S.muted }, children)
}

const STATE_COLORS = {
  OPEN: 'var(--dsw-alias-state-success-primary)',
  DRAFT: 'var(--dsw-alias-state-warn-primary)',
  MERGED: 'var(--dsw-alias-label-secondary)',
  CLOSED: 'var(--dsw-alias-label-secondary)',
  success: 'var(--dsw-alias-state-success-primary)',
  failure: 'var(--dsw-alias-state-error-primary)',
  cancelled: 'var(--dsw-alias-state-error-primary)',
  in_progress: 'var(--dsw-alias-state-warn-primary)',
  queued: 'var(--dsw-alias-state-warn-primary)',
  skipped: 'var(--dsw-alias-label-secondary)',
}

export function Pill({ text, color }) {
  const resolved = color || STATE_COLORS[text] || 'var(--dsw-alias-label-secondary)'
  return React.createElement(
    'span',
    {
      style: {
        ...S.pill,
        color: resolved,
        border: `1px solid ${resolved}`,
        background: 'transparent',
      },
    },
    text,
  )
}

export function Stat({ text, color }) {
  const resolved = color || STATE_COLORS[text]
  return React.createElement(
    'span',
    {
      style: {
        fontFamily: 'var(--dsw-font-family-code)',
        fontSize: '12px',
        color: resolved || 'var(--dsw-alias-label-secondary)',
        whiteSpace: 'nowrap',
      },
    },
    text,
  )
}

export function truncatePath(path, max = 44) {
  if (!path || path.length <= max) return path
  const seg = path.split('/')
  const file = seg.pop() || path
  const keep = Math.max(1, seg.length - 1)
  const head = seg.slice(Math.max(0, seg.length - keep))
  return '…/' + head.join('/') + '/' + file
}

export function Path({ path, openFile }) {
  return React.createElement(
    'button',
    {
      type: 'button',
      title: path,
      onClick: openFile ? () => openFile(path) : undefined,
      style: {
        ...S.monospace,
        background: 'none',
        border: 'none',
        padding: 0,
        textAlign: 'left',
        color: openFile
          ? 'var(--dsw-alias-label-primary)'
          : 'var(--dsw-alias-label-secondary)',
        cursor: openFile ? 'pointer' : 'default',
        textDecoration: openFile ? 'underline' : 'none',
        textDecorationColor: 'var(--dsw-alias-label-caption)',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
    },
    truncatePath(path),
  )
}

export const styles = S

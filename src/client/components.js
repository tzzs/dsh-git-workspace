import * as React from 'react'
import * as ReactDOM from 'react-dom'
import {
  Tooltip,
  StateDot,
  writeClipboard,
  IconCheckOutline14,
  IconCopyOutline16,
  IconChevronRightOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'

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
    fontSize: '12px',
    lineHeight: '16px',
  },
  title: {
    fontSize: '12px',
    lineHeight: '16px',
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
    fontSize: '12px',
    lineHeight: '17px',
    cursor: 'default',
  },
  monospace: {
    fontFamily: 'var(--dsw-font-family-code)',
    fontSize: '11px',
  },
  pill: {
    borderRadius: '999px',
    padding: '0 7px',
    fontSize: '10px',
    lineHeight: '15px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    flex: 'none',
  },
  add: { color: 'var(--dsw-alias-state-success-primary)' },
  del: { color: 'var(--dsw-alias-state-error-primary)' },
  warn: { color: 'var(--dsw-alias-state-warn-primary)' },
  muted: { color: 'var(--dsw-alias-label-tertiary)' },
}

export const STYLE_SHEET = [
  '.dgw-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:none;background:none;border-radius:6px;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none;transition:background .12s ease,color .12s ease}',
  '.dgw-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}',
  '.dgw-row{position:relative;border-radius:6px;margin:0 -6px;padding:2px 6px;transition:background .1s ease}',
  '.dgw-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dgw-row[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover-solid)}',
  '.dgw-copy{opacity:0;transition:opacity .12s ease}',
  '.dgw-row:hover .dgw-copy,.dgw-copy:focus-within{opacity:1}',
  // The copy-path button sits in nearly every tree row; the shared 24px
  // .dgw-iconbtn footprint was setting each row's min-height regardless of
  // its 12-13px text, which read as excess space between files. Only shrink
  // it where it's paired with .dgw-copy (i.e. CopyBtn), not other icon
  // buttons (refresh, close) that still want the full touch target.
  '.dgw-copy.dgw-iconbtn{width:20px;height:20px}',
  '.dgw-link{text-decoration:none}.dgw-link:hover{text-decoration:underline}',
  '.dgw-chevron{transition:transform .15s ease;flex:none;display:inline-flex;color:var(--dsw-alias-label-caption)}',
  '.dgw-chevron[data-open="true"]{transform:rotate(90deg)}',
  '.dgw-textarea{width:100%;box-sizing:border-box;min-height:30px;padding:6px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:12px;line-height:17px;resize:vertical;outline:none;transition:border-color .12s ease}',
  '.dgw-textarea:focus{border-color:var(--dsw-alias-brand-primary)}',
  '.dgw-textarea::placeholder{color:var(--dsw-alias-label-caption)}',
  '.dgw-stagebtn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:12px;font-weight:500;cursor:pointer;transition:background .12s ease}',
  '.dgw-stagebtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
  '.dgw-stagebtn:disabled{opacity:.45;cursor:default}',
  '.dgw-mergebtn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;height:30px;padding:0 10px;border:none;border-radius:8px;background:var(--dsw-alias-state-success-primary);color:#fff;font-family:var(--dsw-font-family);font-size:12px;font-weight:600;cursor:pointer;transition:filter .12s ease}',
  '.dgw-mergebtn:hover:not(:disabled){filter:brightness(1.08)}',
  '.dgw-mergebtn:disabled{opacity:.5;cursor:default}',
  '.dgw-linkicon{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;color:var(--dsw-alias-label-caption);text-decoration:none;flex:none;transition:background .12s ease,color .12s ease}',
  '.dgw-linkicon:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}',
  '.dgw-dirbtn{display:flex;align-items:center;gap:5px;border:none;background:none;cursor:pointer;font-family:var(--dsw-font-family);text-align:left}',
  '.dgw-actionmenu{position:absolute;right:0;top:calc(100% + 8px);width:240px;max-height:calc(100vh - 180px);overflow-y:auto;padding:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-2);box-shadow:-8px 12px 30px rgba(0,0,0,.16);z-index:5}',
  '.dgw-action{display:block;width:100%;padding:7px 12px;border:0;border-radius:7px;background:none;color:var(--dsw-alias-label-primary);font:12px var(--dsw-font-family);text-align:left;cursor:pointer}',
  '.dgw-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dgw-action:disabled{color:var(--dsw-alias-label-caption);cursor:default}',
  '.dgw-actionsep{height:1px;margin:4px 0;background:var(--dsw-alias-border-l1)}',
  '.dgw-createpr{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 12px;border:none;border-radius:8px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);font-family:var(--dsw-font-family);font-size:12px;font-weight:600;cursor:pointer;flex:none;transition:opacity .12s ease}',
  '.dgw-createpr:hover{opacity:.88}',
  '.dgw-createpr:active{opacity:.78}',
  '.dgw-createpr:disabled{opacity:.45;cursor:default}',
  '.dgw-dock-open [data-git-workspace-drawer]{border-right:1px solid var(--dsw-alias-border-l2)}',
  '.dgw-filebtn{display:flex;align-items:center;gap:5px;cursor:pointer;font-family:var(--dsw-font-family)}',
  '.dgw-filebtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
  '.dgw-diff{display:flex;flex-direction:column;min-height:0;flex:1 1 auto;background:var(--dsw-alias-bg-base)}',
  '.dgw-diff-head{display:flex;align-items:center;gap:6px;padding:8px 10px;flex:none;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}',
  '.dgw-diff-body{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain}',
  '.dgw-diff-hunkhead{position:sticky;top:0;padding:1px 8px;font-family:var(--dsw-font-family-code);font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);white-space:nowrap}',
  '.dgw-diff-line{display:flex;align-items:flex-start;font-family:var(--dsw-font-family-code);font-size:11.5px;line-height:17px;min-width:max-content}',
  '.dgw-diff-gutter{flex:none;width:34px;padding-right:7px;box-sizing:border-box;text-align:right;color:var(--dsw-alias-label-caption);user-select:none}',
  '.dgw-diff-text{font-family:inherit;font-size:inherit;color:var(--dsw-alias-label-primary);white-space:pre;tab-size:4}',
  '.dgw-diff-splitpane{display:flex;align-items:stretch}',
  '.dgw-diff-splitcol{flex:1 1 0;min-width:0;overflow-x:auto}',
  '.dgw-diff-splitcol+.dgw-diff-splitcol{border-left:1px solid var(--dsw-alias-border-l1)}',
  '.dgw-diff-split-empty{background:var(--dsw-alias-bg-layer-2)}',
  '.dgw-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:24px;z-index:1200}',
  '.dgw-modal{width:100%;max-width:860px;max-height:calc(100vh - 48px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden}',
].join('\n')

let stylesInjected = false

export function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return
  stylesInjected = true
  try {
    const el = document.createElement('style')
    el.setAttribute('data-dgw-styles', '')
    el.textContent = STYLE_SHEET
    document.head.appendChild(el)
  } catch {}
}

// A centered popup, portaled to `document.body` so it floats above the
// drawer instead of fighting the tree's own scroll/clip context. Closes on
// Escape or a backdrop click; a click inside the modal body is stopped from
// bubbling to the backdrop.
export function Modal({ onClose, maxWidth, children }) {
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (typeof document === 'undefined') return null
  return ReactDOM.createPortal(
    React.createElement(
      'div',
      { className: 'dgw-modal-backdrop', role: 'presentation', 'data-git-workspace-modal-backdrop': '', onClick: onClose },
      React.createElement(
        'div',
        {
          className: 'dgw-modal',
          role: 'dialog',
          'aria-modal': 'true',
          onClick: (e) => e.stopPropagation(),
          style: maxWidth ? { maxWidth } : undefined,
        },
        children,
      ),
    ),
    document.body,
  )
}

// A `.dgw-actionmenu` portaled to `document.body` and positioned from the
// trigger's own `getBoundingClientRect()` (`position:fixed`, not the CSS
// class's default `position:absolute;right:0`) instead of relying on a CSS
// ancestor being the right positioning context — a small header nested
// inside another positioned/scrolling ancestor (e.g. a Section header) can't
// reliably provide that, and got the menu rendered in the wrong place.
// Closes on Escape, a click outside, or scroll (rather than tracking scroll
// to reposition, which risks the menu drifting from its trigger).
export function DropdownMenu({ anchorRef, onClose, align = 'end', style, children }) {
  const [rect, setRect] = React.useState(null)
  React.useEffect(() => {
    const el = anchorRef && anchorRef.current
    if (el && typeof el.getBoundingClientRect === 'function') setRect(el.getBoundingClientRect())
  }, [anchorRef])
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])
  if (typeof document === 'undefined') return null
  // Falls back to a 0,0 anchor (rather than bailing out) when there's no
  // real DOM to measure — keeps this testable without a browser, and still
  // renders *something* sane if a ref somehow never attaches in production.
  const r = rect || { top: 0, bottom: 0, left: 0, right: 0 }
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0
  return ReactDOM.createPortal(
    React.createElement(
      React.Fragment,
      null,
      React.createElement('div', {
        style: { position: 'fixed', inset: 0, zIndex: 1199 },
        'data-git-workspace-dropdown-backdrop': '',
        onClick: onClose,
      }),
      React.createElement(
        'div',
        {
          className: 'dgw-actionmenu',
          style: {
            position: 'fixed',
            top: `${r.bottom + 8}px`,
            zIndex: 1200,
            ...(align === 'end'
              ? { right: `${Math.max(0, viewportWidth - r.right)}px` }
              : { left: `${r.left}px` }),
            ...(style || {}),
          },
          onClick: (e) => e.stopPropagation(),
        },
        children,
      ),
    ),
    document.body,
  )
}

export function Card({ header, children }) {
  return React.createElement(
    'div',
    { style: S.card, 'data-git-workspace-card': '' },
    React.createElement('div', { style: { ...S.header, borderBottom: '1px solid var(--dsw-alias-border-l1)' } }, header),
    children ? React.createElement('div', { style: S.body }, children) : null,
  )
}

export function Text({ children, style }) {
  return React.createElement('div', { style: { ...S.sub, ...(style || {}) } }, children)
}

export function Row({ children, style, className }) {
  return React.createElement(
    'div',
    { style: { ...S.row, ...(style || {}) }, className },
    children,
  )
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
        fontSize: '11px',
        color: resolved || 'var(--dsw-alias-label-secondary)',
        whiteSpace: 'nowrap',
      },
    },
    text,
  )
}

export function Dot({ state, size }) {
  return React.createElement(StateDot, { state, size })
}

export function IconBtn({ label, onClick, side = 'bottom', children }) {
  return React.createElement(
    Tooltip,
    { label, side, delayMs: 250 },
    React.createElement(
      'button',
      { type: 'button', className: 'dgw-iconbtn', onClick, 'aria-label': label },
      children,
    ),
  )
}

export function CopyBtn({ text, label = 'Copy' }) {
  const [copied, setCopied] = React.useState(false)
  return React.createElement(
    Tooltip,
    { label: copied ? 'Copied' : label, side: 'bottom', delayMs: 150 },
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dgw-iconbtn dgw-copy',
        'aria-label': label,
        onClick: () => {
          Promise.resolve(writeClipboard(text)).catch(() => {})
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        },
      },
      React.createElement(copied ? IconCheckOutline14 : IconCopyOutline16),
    ),
  )
}

export function Section({ icon, title, count, defaultOpen = true, right, plain = false, children }) {
  const [open, setOpen] = React.useState(defaultOpen)
  return React.createElement(
    'section',
    {
      'data-dgw-section': open ? 'open' : 'closed',
      style: {
        borderTop: '1px solid var(--dsw-alias-border-l1)',
        flex: 'none',
      },
    },
    React.createElement(
      'button',
      {
        type: 'button',
        // Same `.dgw-row` class (and the same 2px left padding a depth-0
        // DirNode uses) as the tree rows in the body below, so the header's
        // own chevron lines up with the tree's instead of drifting off by
        // the row class's -6px hover-bleed margin, which only the body's
        // rows were otherwise absorbing (see the body wrapper's padding).
        className: 'dgw-row',
        onClick: () => setOpen((v) => !v),
        'aria-expanded': open,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          padding: '8px 2px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'var(--dsw-font-family)',
        },
      },
      React.createElement(
        'span',
        { className: 'dgw-chevron', 'data-open': String(open) },
        React.createElement(IconChevronRightOutline14, { size: 13 }),
      ),
      icon || null,
      React.createElement(
        'span',
        {
          style: plain
            ? {
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--dsw-alias-label-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }
            : {
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--dsw-alias-label-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              },
        },
        title,
      ),
      count != null
        ? React.createElement(
            'span',
            { style: { fontSize: '11px', fontWeight: 600, color: 'var(--dsw-alias-label-caption)' } },
            String(count),
          )
        : null,
      React.createElement('span', { style: { flex: '1 1 auto' } }),
      right,
    ),
    // No horizontal padding here — the header button above and every tree
    // row below share the same `.dgw-row` class (and hence its -6px margin),
    // so they only stay aligned if this wrapper doesn't add its own offset
    // on top of theirs.
    open && children != null
      ? React.createElement('div', { style: { padding: '0 0 10px' } }, children)
      : null,
  )
}

export function TintPill({ text, color }) {
  const resolved = color || STATE_COLORS[text] || 'var(--dsw-alias-label-secondary)'
  return React.createElement(
    'span',
    {
      style: {
        borderRadius: '6px',
        padding: '0 6px',
        fontSize: '10px',
        lineHeight: '15px',
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        flex: 'none',
        color: resolved,
        background: `color-mix(in srgb, ${resolved} 14%, transparent)`,
      },
    },
    text,
  )
}

const CIRCLE_TONES = {
  success: 'var(--dsw-alias-state-success-primary)',
  error: 'var(--dsw-alias-state-error-primary)',
  warn: 'var(--dsw-alias-state-warn-primary)',
}

export function CircleIcon({ tone, size = 16, children }) {
  return React.createElement(
    'span',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: CIRCLE_TONES[tone] || 'var(--dsw-alias-label-caption)',
        color: '#fff',
        flex: 'none',
      },
    },
    children,
  )
}

export function checkDotState(check) {
  const c = check.conclusion
  if (c === 'success' || c === 'skipped' || c === 'neutral') return 'done'
  if (c === 'failure' || c === 'cancelled' || c === 'timed_out' || c === 'startup_failure') return 'error'
  const s = check.status
  if (s === 'in_progress' || s === 'queued' || s === 'pending' || s === 'waiting') return 'ongoing'
  return 'warning'
}

export function ciOverallState(checks) {
  if (!checks || checks.length === 0) return null
  let ongoing = false
  for (const c of checks) {
    const s = checkDotState(c)
    if (s === 'error') return 'error'
    if (s === 'ongoing') ongoing = true
  }
  if (ongoing) return 'ongoing'
  return 'done'
}

export function workspaceOverallState(data) {
  if (!data) return null
  const failing =
    data.ci &&
    ((data.ci.status === 'failure' || data.ci.status === 'cancelled') ||
      ciOverallState(data.ci.checks) === 'error')
  if (failing) return 'error'
  if (data.ci && ciOverallState(data.ci.checks) === 'ongoing') return 'ongoing'
  if (!data.clean) return 'warning'
  if (data.branch && data.branch.behind > 0) return 'warning'
  return 'done'
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

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import {
  StateDot,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  ensureIconSprite,
  IconCheckOutline14,
  IconCopyOutline16,
  IconChevronRightOutline14,
} from './icons.js'

const S = {
  card: {
    border: '1px solid var(--dgw-border)',
    borderRadius: 'var(--dgw-radius-lg,10px)',
    background: 'var(--dgw-bg)',
    overflow: 'hidden',
    margin: 'var(--dgw-space-1,4px) 0',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--dgw-space-1,4px)',
    padding: 'var(--dgw-space-1,4px) var(--dgw-space-3,12px)',
    fontSize: 'var(--dgw-font-md,12px)',
    lineHeight: 'var(--dgw-line-tight,16px)',
  },
  title: {
    fontSize: 'var(--dgw-font-md,12px)',
    lineHeight: 'var(--dgw-line-tight,16px)',
    color: 'var(--dgw-text)',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sub: {
    color: 'var(--dgw-text-2)',
  },
  caption: {
    color: 'var(--dgw-text-3)',
  },
  body: {
    padding: 'var(--dgw-space-1,4px) var(--dgw-space-3,12px) var(--dgw-space-2,8px)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    gap: 'var(--dgw-space-1,4px)',
    padding: '2px 0',
    fontSize: 'var(--dgw-font-md,12px)',
    lineHeight: '17px',
    cursor: 'default',
  },
  monospace: {
    fontFamily: 'var(--dsw-font-family-code)',
    fontSize: 'var(--dgw-font-sm,11px)',
  },
  pill: {
    borderRadius: '999px',
    padding: '0 7px',
    fontSize: 'var(--dgw-font-xs,10px)',
    lineHeight: '15px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    flex: 'none',
  },
  add: { color: 'var(--dgw-success-strong)' },
  del: { color: 'var(--dgw-error-strong)' },
  warn: { color: 'var(--dgw-warn-strong)' },
  muted: { color: 'var(--dgw-text-3)' },
}

import { STYLE_SHEET as STYLE_SHEET_SOURCE } from './styles.js'
export const STYLE_SHEET = STYLE_SHEET_SOURCE

let stylesInjected = false

export function ensureStyles() {
  ensureIconSprite()
  if (stylesInjected || typeof document === 'undefined') return
  stylesInjected = true
  try {
    const el = document.createElement('style')
    el.setAttribute('data-dgw-styles', '')
    el.textContent = STYLE_SHEET
    document.head.appendChild(el)
  } catch {}
}

let tooltipSeq = 0

export function Tooltip({ label, side = 'bottom', delayMs = 250, children }) {
  const wrapRef = React.useRef(null)
  const tipRef = React.useRef(null)
  const timerRef = React.useRef(null)
  const idRef = React.useRef(null)
  if (idRef.current === null) idRef.current = `dgw-tip-${++tooltipSeq}`
  const anchorName = `--dgw-anchor-${idRef.current}`

  const hide = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    const tip = tipRef.current
    if (tip && typeof tip.hidePopover === 'function') {
      try {
        tip.hidePopover()
      } catch {}
    }
  }, [])

  const show = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const tip = tipRef.current
      if (!tip) return
      const trigger = wrapRef.current
      const canAnchor =
        typeof window !== 'undefined' &&
        window.CSS &&
        typeof window.CSS.supports === 'function' &&
        window.CSS.supports('position-area: block-end')
      if (!canAnchor && trigger && typeof trigger.getBoundingClientRect === 'function') {
        const r = trigger.getBoundingClientRect()
        const maxWidth = 248
        const left = Math.max(8, Math.min(r.left, (window.innerWidth || 1024) - maxWidth))
        tip.style.position = 'fixed'
        tip.style.left = `${left}px`
        tip.style.top = `${side === 'top' ? r.top - 8 : r.bottom + 8}px`
        tip.style.translate = side === 'top' ? '0 -100%' : '0 0'
      }
      if (typeof tip.showPopover === 'function') {
        try {
          tip.showPopover()
        } catch {}
      }
    }, Math.max(0, delayMs || 0))
  }, [delayMs, side])

  React.useEffect(() => {
    const trigger = wrapRef.current
    if (trigger && trigger.style && typeof trigger.style.setProperty === 'function') {
      trigger.style.setProperty('anchor-name', anchorName)
    }
    const tip = tipRef.current
    if (tip && tip.style && typeof tip.style.setProperty === 'function') {
      tip.style.setProperty('position-anchor', anchorName)
    }
  }, [anchorName])

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  return React.createElement(
    'span',
    {
      ref: wrapRef,
      className: 'dgw-tip-wrap',
      'data-tooltip': label,
      onPointerEnter: show,
      onPointerLeave: hide,
      onFocus: show,
      onBlur: hide,
    },
    children,
    React.createElement(
      'div',
      {
        ref: tipRef,
        id: idRef.current,
        popover: 'manual',
        role: 'tooltip',
        className: 'dgw-tooltip',
        'data-dgw-tooltip': '',
        'data-side': side,
        onPointerEnter: show,
        onPointerLeave: hide,
      },
      label,
    ),
  )
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
          className: 'dgw-root dgw-modal',
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

export function DropdownMenu({ anchorRef, onClose, align = 'end', placement = 'bottom', style, children }) {
  const [rect, setRect] = React.useState(null)
  const menuRef = React.useRef(null)

  React.useEffect(() => {
    const trigger = anchorRef && anchorRef.current
    if (trigger && typeof trigger.getBoundingClientRect === 'function') {
      setRect(trigger.getBoundingClientRect())
    }
    const menu = menuRef.current
    if (menu && typeof menu.showPopover === 'function') {
      try {
        menu.showPopover()
      } catch {}
    }
    const timer = setTimeout(() => {
      const first = menu && menu.querySelector && menu.querySelector('[role="button"],button')
      if (first && typeof first.focus === 'function') first.focus()
    }, 0)
    return () => {
      clearTimeout(timer)
      if (menu && typeof menu.hidePopover === 'function') {
        try {
          menu.hidePopover()
        } catch {}
      }
    }
  }, [anchorRef])

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const menu = menuRef.current
      if (!menu || typeof menu.querySelectorAll !== 'function') return
      const items = Array.from(menu.querySelectorAll('[role="button"], button')).filter(
        (el) => !el.disabled,
      )
      if (items.length === 0) return
      e.preventDefault()
      const index = items.indexOf(document.activeElement)
      const next = e.key === 'ArrowDown'
        ? items[(index + 1 + items.length) % items.length]
        : items[(index - 1 + items.length) % items.length]
      if (next && typeof next.focus === 'function') next.focus()
    }
    const onPointerDown = (e) => {
      const menu = menuRef.current
      const trigger = anchorRef && anchorRef.current
      if (menu && menu.contains && menu.contains(e.target)) return
      if (trigger && trigger.contains && trigger.contains(e.target)) return
      onClose()
    }
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', onKey)
      window.addEventListener('scroll', onClose, true)
      window.addEventListener('resize', onClose)
    }
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('pointerdown', onPointerDown, true)
    }
    return () => {
      if (typeof window.removeEventListener === 'function') {
        window.removeEventListener('keydown', onKey)
        window.removeEventListener('scroll', onClose, true)
        window.removeEventListener('resize', onClose)
      }
      if (typeof document.removeEventListener === 'function') {
        document.removeEventListener('pointerdown', onPointerDown, true)
      }
    }
  }, [onClose, anchorRef])

  if (typeof document === 'undefined') return null
  const anchorEl = anchorRef && anchorRef.current
  const portalHost =
    anchorEl && typeof anchorEl.closest === 'function'
      ? anchorEl.closest('[data-git-workspace-drawer]') || document.body
      : document.body
  const r = rect || { top: 0, bottom: 0, left: 0, right: 0 }
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0
  const menuStyle = {
    position: 'fixed',
    inset: 'auto',
    margin: 0,
    top: `${placement === 'top' ? r.top - 8 : r.bottom + 8}px`,
    translate: placement === 'top' ? '0 -100%' : '0 0',
    zIndex: 1200,
    ...(align === 'end'
      ? { right: `${Math.max(0, viewportWidth - r.right)}px` }
      : { left: `${r.left}px` }),
    ...(style || {}),
  }
  return ReactDOM.createPortal(
    React.createElement(
      'div',
      {
        ref: menuRef,
        className: 'dgw-root dgw-actionmenu',
        popover: 'manual',
        'data-placement': placement,
        style: menuStyle,
        onClick: (e) => e.stopPropagation(),
      },
      children,
    ),
    portalHost,
  )
}

export function Card({ header, children }) {
  return React.createElement(
    'div',
    { className: 'dgw-root', style: S.card, 'data-git-workspace-card': '' },
    React.createElement('div', { style: { ...S.header, borderBottom: '1px solid var(--dgw-border)' } }, header),
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
    { style: { ...S.monospace, color: 'var(--dgw-text)', ...(style || {}) } },
    children,
  )
}

export function PathLabel({ path, prefix = '' }) {
  const value = String(path || '')
  const cut = value.lastIndexOf('/')
  const dir = cut >= 0 ? value.slice(0, cut + 1) : ''
  const base = cut >= 0 ? value.slice(cut + 1) : value
  return React.createElement(
    'span',
    { className: 'dgw-path', title: prefix + value },
    prefix ? React.createElement('span', { className: 'dgw-path__dir' }, prefix) : null,
    dir ? React.createElement('span', { className: 'dgw-path__dir' }, dir) : null,
    React.createElement('span', { className: 'dgw-path__base' }, base),
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
  OPEN: 'var(--dgw-success-strong)',
  DRAFT: 'var(--dgw-warn-strong)',
  MERGED: 'var(--dgw-text-2)',
  CLOSED: 'var(--dgw-text-2)',
  success: 'var(--dgw-success-strong)',
  failure: 'var(--dgw-error-strong)',
  cancelled: 'var(--dgw-error-strong)',
  in_progress: 'var(--dgw-warn-strong)',
  queued: 'var(--dgw-warn-strong)',
  skipped: 'var(--dgw-text-2)',
}

export function Pill({ text, color }) {
  const resolved = color || STATE_COLORS[text] || 'var(--dgw-text-2)'
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
        fontSize: 'var(--dgw-font-sm)',
        color: resolved || 'var(--dgw-text-2)',
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

export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className = 'dgw-stagebtn',
  style,
  children,
  confirmChildren,
}) {
  const armedRef = React.useRef(false)
  const [armed, setArmed] = React.useState(false)
  const title = armed ? confirmLabel : label
  return React.createElement(
    'button',
    {
      type: 'button',
      className: `${className}${armed ? ' dgw-confirm-armed' : ''}`,
      title,
      'aria-label': title,
      style,
      onClick: (e) => {
        if (e) e.stopPropagation()
        if (armedRef.current) {
          armedRef.current = false
          setArmed(false)
          onConfirm()
        } else {
          armedRef.current = true
          setArmed(true)
        }
      },
      onBlur: () => {
        armedRef.current = false
        setArmed(false)
      },
    },
    armed
      ? confirmChildren !== undefined
        ? confirmChildren
        : confirmLabel
      : children !== undefined
        ? children
        : label,
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
    { className: 'dgw-section', 'data-dgw-section': open ? 'open' : 'closed' },
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dgw-section__hd',
        onClick: () => setOpen((v) => !v),
        'aria-expanded': open,
      },
      React.createElement(
        'span',
        { className: 'dgw-chevron', 'data-open': String(open) },
        React.createElement(IconChevronRightOutline14, { size: 14 }),
      ),
      icon || null,
      React.createElement(
        'span',
        { className: plain ? 'dgw-section__plain' : undefined, style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
        title,
      ),
      count != null
        ? React.createElement('span', { className: 'dgw-grouphd__count' }, String(count))
        : null,
      React.createElement('span', { className: 'dgw-spacer' }),
      right,
    ),
    open && children != null
      ? React.createElement('div', { className: 'dgw-section__body' }, children)
      : null,
  )
}

export function TintPill({ text, color }) {
  const resolved = color || STATE_COLORS[text] || 'var(--dgw-text-2)'
  return React.createElement(
    'span',
    {
      style: {
        borderRadius: 'var(--dgw-radius-sm)',
        padding: '0 6px',
        fontSize: 'var(--dgw-font-xs)',
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
  success: 'var(--dgw-success-strong)',
  error: 'var(--dgw-error-strong)',
  warn: 'var(--dgw-warn-strong)',
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
        background: CIRCLE_TONES[tone] || 'var(--dgw-text-3)',
        color: 'var(--dgw-on-accent,var(--dsw-alias-label-primary-inverted))',
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
          ? 'var(--dgw-text)'
          : 'var(--dgw-text-2)',
        cursor: openFile ? 'pointer' : 'default',
        textDecoration: openFile ? 'underline' : 'none',
        textDecorationColor: 'var(--dgw-text-3)',
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

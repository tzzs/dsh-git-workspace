import * as React from 'react'
import { IconCloseFill14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconBtn } from '../components.js'

const WIDTH_KEY = 'dsh-git-workspace.width'
const MIN_W = 320
const MAX_W = 760

function clampWidth(w) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  return Math.min(Math.max(w, MIN_W), Math.min(MAX_W, Math.floor(vw * 0.92)))
}

function initialWidth() {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY))
    if (Number.isFinite(saved) && saved > 0) return clampWidth(saved)
  } catch {}
  return 400
}

export function Drawer({ open, onClose, title, subtitle, actions, children }) {
  const [width, setWidth] = React.useState(initialWidth)
  const widthRef = React.useRef(width)
  widthRef.current = width
  const asideRef = React.useRef(null)

  React.useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const startDrag = (e) => {
    e.preventDefault()
    if (typeof e.currentTarget.setPointerCapture === 'function') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {}
    }
    const startX = e.clientX
    const startW = widthRef.current
    const move = (ev) => setWidth(clampWidth(startW + (startX - ev.clientX)))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      try {
        localStorage.setItem(WIDTH_KEY, String(widthRef.current))
      } catch {}
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return React.createElement(
    'aside',
    {
      className: 'dgw-drawer',
      role: 'complementary',
      'aria-label': title,
      'data-git-workspace-drawer': '',
      ref: asideRef,
      style: {
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: `${width}px`,
        maxWidth: '92vw',
        background: 'var(--dsw-alias-bg-layer-2)',
        borderLeft: '1px solid var(--dsw-alias-border-l2)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--dsw-font-family)',
        color: 'var(--dsw-alias-label-primary)',
      },
    },
      React.createElement(
        'div',
        {
          onPointerDown: startDrag,
          role: 'separator',
          'aria-orientation': 'vertical',
          style: {
            position: 'absolute',
            left: -3,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: 'col-resize',
            touchAction: 'none',
            zIndex: 2,
          },
        },
      ),
      React.createElement(
        'header',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 14px',
            borderBottom: '1px solid var(--dsw-alias-border-l1)',
            flex: 'none',
          },
        },
        React.createElement(
          'div',
          { style: { minWidth: 0, flex: '1 1 auto' } },
          React.createElement(
            'div',
            { style: { fontSize: '14px', fontWeight: 600, lineHeight: '18px' } },
            title,
          ),
          subtitle
            ? React.createElement(
                'div',
                { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                subtitle,
              )
            : null,
        ),
        actions,
        onClose
          ? React.createElement(
              IconBtn,
              { label: 'Close Git workspace (Esc)', onClick: onClose },
              React.createElement(IconCloseFill14, null),
            )
          : null,
      ),
      React.createElement(
        'div',
        { style: { flex: '1 1 auto', overflowY: 'auto', overscrollBehavior: 'contain' } },
        children,
      ),
  )
}

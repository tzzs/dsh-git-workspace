import * as React from 'react'
import { IconCloseFill14, Icon } from '../icons.js'
import { IconBtn, ConfirmButton, PathLabel, ensureStyles } from '../components.js'

const STATUS_LETTER = {
  modified: { text: 'M', color: 'var(--dgw-warn-strong)' },
  added: { text: 'A', color: 'var(--dgw-success-strong)' },
  deleted: { text: 'D', color: 'var(--dgw-error-strong)' },
  renamed: { text: 'R', color: 'var(--dgw-text-2)' },
  copied: { text: 'C', color: 'var(--dgw-success-strong)' },
  untracked: { text: 'U', color: 'var(--dgw-text-2)' },
}

const ROW_H = 24
const OVERSCAN = 10
const MAX_BODY_H = 360

function fmtNum(n) {
  return n >= 1000 ? n.toLocaleString('en-US') : String(n)
}

function withNumbers(hunk) {
  let o = hunk.oldStart
  let n = hunk.newStart
  const out = []
  for (const raw of hunk.lines || []) {
    const t = raw[0]
    if (t === '+') out.push({ type: 'add', old: null, new: n++, text: raw.slice(1) })
    else if (t === '-') out.push({ type: 'del', old: o++, new: null, text: raw.slice(1) })
    else if (t === '\\') out.push({ type: 'meta', old: null, new: null, text: raw })
    else out.push({ type: 'context', old: o++, new: n++, text: raw.startsWith(' ') ? raw.slice(1) : raw })
  }
  return out
}

function lineClass(type) {
  if (type === 'add') return ' dgw-diff-line--add'
  if (type === 'del') return ' dgw-diff-line--del'
  if (type === 'meta') return ' dgw-diff-line--meta'
  return ''
}

function diffSign(type) {
  return type === 'add' ? '+' : type === 'del' ? '-' : ' '
}

function DiffLine({ line }) {
  return React.createElement(
    'div',
    { className: `dgw-diff-line${lineClass(line.type)}` },
    React.createElement('span', { className: 'dgw-diff-gutter' }, line.old != null ? String(line.old) : ''),
    React.createElement('span', { className: 'dgw-diff-gutter' }, line.new != null ? String(line.new) : ''),
    React.createElement('span', { className: 'dgw-diff-sign' }, diffSign(line.type)),
    React.createElement('code', { className: 'dgw-diff-text' }, line.text),
  )
}

// Pairs a hunk's flat line list into left/right rows for the split layout:
// context (and `\ No newline` meta) lines mirror onto both sides at once,
// while a run of deletions is zipped against the run of additions that
// follows it, so a pure replace lines up side by side.
function pairHunkRows(lines) {
  const rows = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (l.type !== 'del' && l.type !== 'add') {
      rows.push({ left: l, right: l })
      i++
      continue
    }
    const dels = []
    while (i < lines.length && lines[i].type === 'del') {
      dels.push(lines[i])
      i++
    }
    const adds = []
    while (i < lines.length && lines[i].type === 'add') {
      adds.push(lines[i])
      i++
    }
    const max = Math.max(dels.length, adds.length)
    for (let k = 0; k < max; k++) rows.push({ left: dels[k] || null, right: adds[k] || null })
  }
  return rows
}

function SplitDiffLine({ line, side }) {
  if (!line) {
    return React.createElement(
      'div',
      { className: 'dgw-diff-line dgw-diff-split-empty' },
      React.createElement('span', { className: 'dgw-diff-gutter' }),
      React.createElement('span', { className: 'dgw-diff-sign' }),
      React.createElement('code', { className: 'dgw-diff-text' }),
    )
  }
  const num = side === 'left' ? line.old : line.new
  return React.createElement(
    'div',
    { className: `dgw-diff-line${lineClass(line.type)}` },
    React.createElement('span', { className: 'dgw-diff-gutter' }, num != null ? String(num) : ''),
    React.createElement('span', { className: 'dgw-diff-sign' }, diffSign(line.type)),
    React.createElement('code', { className: 'dgw-diff-text' }, line.text),
  )
}

function hunkTarget(hunk) {
  return {
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
  }
}

function HunkActions({ file, hunk, onHunkAction }) {
  if (typeof onHunkAction !== 'function' || !file) return null
  if (file.status === 'untracked' || file.status === 'renamed' || file.status === 'copied') return null
  const target = hunkTarget(hunk)
  const staged = file.staged === true
  const button = (label, title, action) =>
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dgw-hunkbtn',
        title,
        onClick: (e) => {
          if (e) e.stopPropagation()
          onHunkAction(file, action, target)
        },
      },
      label,
    )
  if (staged) {
    return React.createElement(
      'span',
      { className: 'dgw-hunkactions' },
      button('Unstage hunk', 'Unstage this hunk', 'unstage'),
    )
  }
  return React.createElement(
    'span',
    { className: 'dgw-hunkactions' },
    button('Stage hunk', 'Stage this hunk', 'stage'),
    React.createElement(ConfirmButton, {
      className: 'dgw-hunkbtn',
      label: 'Discard hunk',
      confirmLabel: 'Confirm discard',
      onConfirm: () => onHunkAction(file, 'discard', target),
    }),
  )
}

function HunkHeader({ file, hunk, onHunkAction }) {
  return React.createElement(
    'div',
    { className: 'dgw-diff-hunkhead' },
    React.createElement('span', null, `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`),
    React.createElement(HunkActions, { file, hunk, onHunkAction }),
  )
}

function buildRows(mode, hunks) {
  const rows = []
  for (const hunk of hunks) {
    rows.push({ kind: 'hunk', hunk, key: `h:${hunk.oldStart}:${hunk.newStart}` })
    if (mode === 'split') {
      const pairs = pairHunkRows(withNumbers(hunk))
      pairs.forEach((pair, i) => rows.push({ kind: 'split', pair, key: `s:${hunk.oldStart}:${i}` }))
    } else {
      withNumbers(hunk).forEach((line, i) => rows.push({ kind: 'line', line, key: `l:${hunk.oldStart}:${i}` }))
    }
  }
  return rows
}

function DiffBody({ file, hunks, mode, onHunkAction }) {
  const bodyRef = React.useRef(null)
  const [scrollTop, setScrollTop] = React.useState(0)
  const [viewportH, setViewportH] = React.useState(MAX_BODY_H)
  const rows = React.useMemo(() => buildRows(mode, hunks), [mode, hunks])
  const totalH = rows.length * ROW_H
  const height = Math.min(MAX_BODY_H, Math.max(ROW_H, totalH))

  React.useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = 0
    setScrollTop(0)
  }, [mode, file.path])

  React.useEffect(() => {
    const el = bodyRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver((entries) => {
      const next = entries[0] && entries[0].contentRect ? entries[0].contentRect.height : 0
      if (next > 0) setViewportH(next)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN)
  const visible = rows.slice(start, end)
  return React.createElement(
    'div',
    {
      ref: bodyRef,
      className: 'dgw-diff-body',
      style: { height: `${height}px` },
      onScroll: (e) => setScrollTop(e.currentTarget.scrollTop),
    },
    React.createElement('div', {
      className: 'dgw-diff-spacer',
      style: { height: `${start * ROW_H}px` },
      'aria-hidden': 'true',
    }),
    visible.map((row) => {
      if (row.kind === 'hunk') {
        return React.createElement(HunkHeader, { key: row.key, file, hunk: row.hunk, onHunkAction })
      }
      if (row.kind === 'split') {
        return React.createElement(
          'div',
          { key: row.key, className: 'dgw-diff-splitpane' },
          React.createElement(
            'div',
            { className: 'dgw-diff-splitcol' },
            React.createElement(SplitDiffLine, { line: row.pair.left, side: 'left' }),
          ),
          React.createElement(
            'div',
            { className: 'dgw-diff-splitcol' },
            React.createElement(SplitDiffLine, { line: row.pair.right, side: 'right' }),
          ),
        )
      }
      return React.createElement(DiffLine, { key: row.key, line: row.line })
    }),
    React.createElement('div', {
      className: 'dgw-diff-spacer',
      style: { height: `${(rows.length - end) * ROW_H}px` },
      'aria-hidden': 'true',
    }),
  )
}

function StatSpan({ additions, deletions }) {
  return React.createElement(
    'span',
    { className: 'dgw-stats' },
    React.createElement('span', { className: 'dgw-stats__add' }, `+${fmtNum(additions || 0)}`),
    React.createElement('span', { className: 'dgw-stats__del' }, `-${fmtNum(deletions || 0)}`),
  )
}

function DiffModeToggle({ mode, onChange }) {
  const btn = (id, label) =>
    React.createElement(
      'span',
      {
        key: id,
        role: 'button',
        tabIndex: 0,
        'aria-pressed': mode === id,
        title: `${label} view`,
        className: 'dgw-segmented__btn',
        'data-active': String(mode === id),
        onClick: () => onChange(id),
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onChange(id)
          }
        },
      },
      label,
    )
  return React.createElement(
    'span',
    { className: 'dgw-segmented', role: 'group', 'aria-label': 'Diff layout' },
    btn('unified', 'Unified'),
    btn('split', 'Split'),
  )
}

function DiffNotice({ icon, title, hint, action }) {
  return React.createElement(
    'div',
    { className: 'dgw-empty dgw-empty--compact' },
    React.createElement(
      'span',
      { className: 'dgw-empty__icon' },
      React.createElement(Icon, { name: icon, size: 18 }),
    ),
    React.createElement('span', { className: 'dgw-empty__title' }, title),
    hint ? React.createElement('span', { className: 'dgw-empty__hint' }, hint) : null,
    action || null,
  )
}

export function DiffViewer({
  file,
  onClose,
  onAskFull,
  mode: controlledMode,
  onModeChange,
  onHunkAction,
  inline = false,
}) {
  ensureStyles()
  const [innerMode, setInnerMode] = React.useState('unified')
  const mode = controlledMode || innerMode
  const setMode = onModeChange || setInnerMode
  const c = STATUS_LETTER[file.status] || STATUS_LETTER.modified
  const binary = file.diffOmitted === 'binary'
  const oversize = file.diffOmitted === 'size'
  const hunks = Array.isArray(file.hunks) ? file.hunks : []
  const askFull = () => onAskFull && onAskFull()
  return React.createElement(
    'div',
    {
      className: inline ? 'dgw-diff dgw-diff-inline' : 'dgw-diff',
      'data-git-workspace-diff': '',
      role: 'region',
      'aria-label': `Diff of ${file.path}`,
    },
    React.createElement(
      'div',
      { className: 'dgw-diff-head' },
      React.createElement('span', { className: 'dgw-statuschip', style: { color: c.color }, title: file.status }, c.text),
      React.createElement(
        'div',
        { className: 'dgw-diff-head__path' },
        React.createElement(PathLabel, { path: file.path, prefix: file.oldPath ? `${file.oldPath} → ` : '' }),
      ),
      React.createElement(StatSpan, { additions: file.additions, deletions: file.deletions }),
      hunks.length > 0 ? React.createElement(DiffModeToggle, { mode, onChange: setMode }) : null,
      onClose
        ? React.createElement(
            IconBtn,
            { label: 'Close diff', side: 'bottom', onClick: onClose },
            React.createElement(IconCloseFill14, { size: 14 }),
          )
        : null,
    ),
    binary
      ? React.createElement(DiffNotice, {
          icon: 'file',
          title: 'Binary file',
          hint: 'No textual diff to render.',
          action: onAskFull
            ? React.createElement('button', { type: 'button', className: 'dgw-stagebtn dgw-empty__action', onClick: askFull, style: { width: 'auto' } }, 'Fetch full diff')
            : null,
        })
      : oversize
        ? React.createElement(DiffNotice, {
            icon: 'warning',
            title: 'Diff too large',
            hint: 'The inline preview is limited for this file.',
            action: onAskFull
              ? React.createElement('button', { type: 'button', className: 'dgw-stagebtn dgw-empty__action', onClick: askFull, style: { width: 'auto' } }, 'Fetch full diff')
              : null,
          })
        : hunks.length === 0
          ? React.createElement(DiffNotice, {
              icon: 'file',
              title: 'No textual changes',
              hint: 'This file has no renderable hunks.',
            })
          : React.createElement(DiffBody, { file, hunks, mode, onHunkAction }),
  )
}

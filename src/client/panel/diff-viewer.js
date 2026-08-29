import * as React from 'react'
import { Button, IconCloseFill14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { Code, Muted, IconBtn, ensureStyles } from '../components.js'

const STATUS_LETTER = {
  modified: { text: 'M', color: 'var(--dsw-alias-state-warn-primary)' },
  added: { text: 'A', color: 'var(--dsw-alias-state-success-primary)' },
  deleted: { text: 'D', color: 'var(--dsw-alias-state-error-primary)' },
  renamed: { text: 'R', color: 'var(--dsw-alias-label-secondary)' },
  copied: { text: 'C', color: 'var(--dsw-alias-state-success-primary)' },
  untracked: { text: 'U', color: 'var(--dsw-alias-label-secondary)' },
}

const MAX_RENDERED_LINES = 1500

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

function diffLineBg(type) {
  return type === 'add'
    ? 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 13%, transparent)'
    : type === 'del'
      ? 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 11%, transparent)'
      : undefined
}

function diffSignColor(type) {
  return type === 'add'
    ? 'var(--dsw-alias-state-success-primary)'
    : type === 'del'
      ? 'var(--dsw-alias-state-error-primary)'
      : 'transparent'
}

function DiffLine({ line }) {
  return React.createElement(
    'div',
    { className: 'dgw-diff-line', style: diffLineBg(line.type) ? { background: diffLineBg(line.type) } : undefined },
    React.createElement('span', { className: 'dgw-diff-gutter' }, line.old != null ? String(line.old) : ''),
    React.createElement('span', { className: 'dgw-diff-gutter' }, line.new != null ? String(line.new) : ''),
    React.createElement(
      'span',
      { className: 'dgw-diff-sign', style: { flex: 'none', width: '10px', color: diffSignColor(line.type) } },
      line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ',
    ),
    React.createElement('code', { className: 'dgw-diff-text' }, line.text),
  )
}

function DiffHunksUnified({ hunks }) {
  let rendered = 0
  const blocks = []
  for (const hunk of hunks) {
    const lines = withNumbers(hunk)
    blocks.push(
      React.createElement(
        'div',
        { key: `${hunk.oldStart}:${hunk.newStart}`, className: 'dgw-diff-hunk' },
        React.createElement('div', { className: 'dgw-diff-hunkhead' }, `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`),
        lines.map((l, i) => {
          rendered++
          return rendered <= MAX_RENDERED_LINES ? React.createElement(DiffLine, { key: i, line: l }) : null
        }),
      ),
    )
  }
  return React.createElement(
    React.Fragment,
    null,
    blocks,
    rendered > MAX_RENDERED_LINES
      ? React.createElement('div', { style: { padding: '4px 8px' } }, React.createElement(Muted, null, `+${rendered - MAX_RENDERED_LINES} more lines not shown.`))
      : null,
  )
}

// Pairs a hunk's flat line list into left/right rows for the split layout:
// context (and `\ No newline` meta) lines mirror onto both sides at once,
// while a run of deletions is zipped against the run of additions that
// follows it — same as GitHub/most diff tools — so a pure replace lines up
// side by side instead of stacking all removals above all additions.
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
    { className: 'dgw-diff-line', style: diffLineBg(line.type) ? { background: diffLineBg(line.type) } : undefined },
    React.createElement('span', { className: 'dgw-diff-gutter' }, num != null ? String(num) : ''),
    React.createElement(
      'span',
      { className: 'dgw-diff-sign', style: { flex: 'none', width: '10px', color: diffSignColor(line.type) } },
      line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ',
    ),
    React.createElement('code', { className: 'dgw-diff-text' }, line.text),
  )
}

function DiffHunksSplit({ hunks }) {
  let renderedRows = 0
  const blocks = []
  for (const hunk of hunks) {
    const rows = pairHunkRows(withNumbers(hunk))
    const visible = rows.slice(0, Math.max(0, MAX_RENDERED_LINES - renderedRows))
    renderedRows += rows.length
    blocks.push(
      React.createElement(
        'div',
        { key: `${hunk.oldStart}:${hunk.newStart}`, className: 'dgw-diff-hunk' },
        React.createElement('div', { className: 'dgw-diff-hunkhead' }, `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`),
        React.createElement(
          'div',
          { className: 'dgw-diff-splitpane' },
          React.createElement(
            'div',
            { className: 'dgw-diff-splitcol' },
            visible.map((r, i) => React.createElement(SplitDiffLine, { key: i, line: r.left, side: 'left' })),
          ),
          React.createElement(
            'div',
            { className: 'dgw-diff-splitcol' },
            visible.map((r, i) => React.createElement(SplitDiffLine, { key: i, line: r.right, side: 'right' })),
          ),
        ),
      ),
    )
  }
  return React.createElement(
    React.Fragment,
    null,
    blocks,
    renderedRows > MAX_RENDERED_LINES
      ? React.createElement('div', { style: { padding: '4px 8px' } }, React.createElement(Muted, null, `+${renderedRows - MAX_RENDERED_LINES} more lines not shown.`))
      : null,
  )
}

function StatSpan({ additions, deletions }) {
  return React.createElement(
    'span',
    { style: { display: 'inline-flex', gap: '6px', flex: 'none', fontFamily: 'var(--dsw-font-family-code)', fontSize: '11px' } },
    React.createElement('span', { style: { color: 'var(--dsw-alias-state-success-primary)' } }, `+${fmtNum(additions || 0)}`),
    React.createElement('span', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, `-${fmtNum(deletions || 0)}`),
  )
}

// A two-option pill, same visual language as the tree's Tree/List toggle —
// switches the hunk body between one unified column and a left/right split.
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
        onClick: () => onChange(id),
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onChange(id)
          }
        },
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          borderRadius: '5px',
          fontSize: '10px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'var(--dsw-font-family)',
          background: mode === id ? 'var(--dsw-alias-interactive-bg-hover-solid)' : 'none',
          color: mode === id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-caption)',
        },
      },
      label,
    )
  return React.createElement('span', { style: { display: 'inline-flex', gap: '2px', flex: 'none' } }, btn('unified', 'Unified'), btn('split', 'Split'))
}

export function DiffViewer({ file, onClose, onAskFull }) {
  ensureStyles()
  const [mode, setMode] = React.useState('unified')
  const c = STATUS_LETTER[file.status] || STATUS_LETTER.modified
  const binary = file.diffOmitted === 'binary'
  const oversize = file.diffOmitted === 'size'
  const hunks = Array.isArray(file.hunks) ? file.hunks : []
  const askFull = () => onAskFull && onAskFull()
  return React.createElement(
    'div',
    {
      className: 'dgw-diff',
      'data-git-workspace-diff': '',
      role: 'region',
      'aria-label': `Diff of ${file.path}`,
    },
    React.createElement(
      'div',
      { className: 'dgw-diff-head' },
      React.createElement(
        'span',
        { style: { fontFamily: 'var(--dsw-font-family-code)', fontSize: '12px', fontWeight: 600, color: c.color, flex: 'none' } },
        c.text,
      ),
      React.createElement(
        Code,
        { style: { fontSize: '11.5px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } },
        file.oldPath ? `${file.oldPath} → ${file.path}` : file.path,
      ),
      React.createElement(StatSpan, { additions: file.additions, deletions: file.deletions }),
      hunks.length > 0 ? React.createElement(DiffModeToggle, { mode, onChange: setMode }) : null,
      onClose
        ? React.createElement(
            IconBtn,
            { label: 'Close diff', side: 'bottom', onClick: onClose },
            React.createElement(IconCloseFill14, { size: 12 }),
          )
        : null,
    ),
    binary
      ? React.createElement(
          'div',
          { style: { padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' } },
          React.createElement(Muted, null, 'Binary file — no textual diff.'),
          onAskFull ? React.createElement(Button, { variant: 'outline', size: 'sm', onClick: askFull }, 'Fetch full diff') : null,
        )
      : oversize
        ? React.createElement(
            'div',
            { style: { padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' } },
            React.createElement(Muted, null, 'Diff too large for inline preview.'),
            onAskFull ? React.createElement(Button, { variant: 'outline', size: 'sm', onClick: askFull }, 'Fetch full diff') : null,
          )
        : hunks.length === 0
          ? React.createElement('div', { style: { padding: '8px' } }, React.createElement(Muted, null, 'No textual changes.'))
          : React.createElement(
              'div',
              { className: 'dgw-diff-body' },
              mode === 'split' ? React.createElement(DiffHunksSplit, { hunks }) : React.createElement(DiffHunksUnified, { hunks }),
            ),
  )
}

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

function DiffLine({ line }) {
  const bg =
    line.type === 'add'
      ? 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 13%, transparent)'
      : line.type === 'del'
        ? 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 11%, transparent)'
        : undefined
  return React.createElement(
    'div',
    { className: 'dgw-diff-line', style: bg ? { background: bg } : undefined },
    React.createElement('span', { className: 'dgw-diff-gutter' }, line.old != null ? String(line.old) : ''),
    React.createElement('span', { className: 'dgw-diff-gutter' }, line.new != null ? String(line.new) : ''),
    React.createElement(
      'span',
      {
        className: 'dgw-diff-sign',
        style: {
          flex: 'none',
          width: '10px',
          color:
            line.type === 'add'
              ? 'var(--dsw-alias-state-success-primary)'
              : line.type === 'del'
                ? 'var(--dsw-alias-state-error-primary)'
                : 'transparent',
        },
      },
      line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ',
    ),
    React.createElement('code', { className: 'dgw-diff-text' }, line.text),
  )
}

function DiffHunks({ hunks }) {
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

function StatSpan({ additions, deletions }) {
  return React.createElement(
    'span',
    { style: { display: 'inline-flex', gap: '6px', flex: 'none', fontFamily: 'var(--dsw-font-family-code)', fontSize: '11px' } },
    React.createElement('span', { style: { color: 'var(--dsw-alias-state-success-primary)' } }, `+${fmtNum(additions || 0)}`),
    React.createElement('span', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, `-${fmtNum(deletions || 0)}`),
  )
}

export function DiffViewer({ file, onClose, onAskFull }) {
  ensureStyles()
  const c = STATUS_LETTER[file.status] || STATUS_LETTER.modified
  const binary = file.diffOmitted === 'binary'
  const oversize = file.diffOmitted === 'size'
  const hunks = Array.isArray(file.hunks) ? file.hunks : []
  const askFull = () =>
    onAskFull && onAskFull(`Run the git_diff tool for the file "${file.path}" and report its full diff.`)
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
          onAskFull ? React.createElement(Button, { variant: 'outline', size: 'sm', onClick: askFull }, 'Ask agent') : null,
        )
      : oversize
        ? React.createElement(
            'div',
            { style: { padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' } },
            React.createElement(Muted, null, 'Diff too large for inline preview.'),
            onAskFull ? React.createElement(Button, { variant: 'outline', size: 'sm', onClick: askFull }, 'Ask agent for full diff') : null,
          )
        : hunks.length === 0
          ? React.createElement('div', { style: { padding: '8px' } }, React.createElement(Muted, null, 'No textual changes.'))
          : React.createElement('div', { className: 'dgw-diff-body' }, React.createElement(DiffHunks, { hunks })),
  )
}

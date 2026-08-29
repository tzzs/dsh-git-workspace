import * as React from 'react'
import { Card, Row, Code, Muted, CopyBtn } from '../components.js'
import { blockMeta } from '../common.js'

const LETTER = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: 'U',
}

function statusLetter(status) {
  return LETTER[status] || (status ? status.charAt(0).toUpperCase() : '?')
}

export function StatusRow({ block }) {
  const meta = blockMeta(block)
  if (!meta) {
    return React.createElement(Card, { header: React.createElement('span', null, 'Git Status') })
  }
  const files = meta.files || []
  const header = React.createElement(
    React.Fragment,
    null,
    React.createElement('span', { style: { fontWeight: 500 } }, 'Git Status'),
    meta.branch?.name ? React.createElement(Code, null, meta.branch.name) : null,
    React.createElement(Muted, null, `${files.length} change${files.length === 1 ? '' : 's'}`),
  )
  const body = React.createElement(
    React.Fragment,
    null,
    files.slice(0, 12).map((f, i) =>
      React.createElement(
        Row,
        { key: f.path + i, className: 'dgw-row' },
        React.createElement(
          'span',
          { style: { width: '14px', flex: 'none', fontFamily: 'var(--dsw-font-family-code)', fontSize: '12px', color: f.staged ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-secondary)', textAlign: 'center' } },
          statusLetter(f.status),
        ),
        React.createElement('span', { title: f.path, style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', fontFamily: 'var(--dsw-font-family-code)', fontSize: '12px', color: 'var(--dsw-alias-label-primary)' } }, f.path),
        React.createElement(CopyBtn, { text: f.path, label: 'Copy path' }),
      ),
    ),
    files.length > 12 ? React.createElement(Muted, null, `+${files.length - 12} more`) : null,
  )
  return React.createElement(Card, { header, children: body })
}

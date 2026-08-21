import * as React from 'react'
import { Card, Row, Code, Stat, Text, Muted, Pill, truncatePath } from '../components.js'
import { blockMeta, firstLine } from '../common.js'

export function StatusRow({ block, openFile }) {
  const meta = blockMeta(block)
  if (!meta) {
    return React.createElement(Card, { header: React.createElement('span', null, 'Git Status') })
  }
  const files = meta.files || []
  const header = React.createElement(
    React.Fragment,
    null,
    React.createElement('span', { style: { fontWeight: 500 } }, 'Git Status'),
    meta.branch?.name ? React.createElement(Code, null, truncatePath(meta.branch.name, 24)) : null,
  )
  const body = React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Text,
      { style: { marginBottom: '4px' } },
      `${files.length} change${files.length === 1 ? '' : 's'}`,
    ),
    files.slice(0, 12).map((f, i) =>
      React.createElement(
        Row,
        { key: f.path + i },
        React.createElement(
          'span',
          { style: { width: '16px', flex: 'none', fontFamily: 'var(--dsw-font-family-code)', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } },
          f.status.charAt(0).toUpperCase(),
        ),
        React.createElement('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--dsw-font-family-code)', fontSize: '12px' } }, truncatePath(f.path)),
      ),
    ),
    files.length > 12 ? React.createElement(Muted, null, `+${files.length - 12} more`) : null,
  )
  return React.createElement(Card, { header, children: body })
}

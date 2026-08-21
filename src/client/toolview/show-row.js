import * as React from 'react'
import { Card, Row, Code, Muted, Add, Del } from '../components.js'
import { blockMeta, firstLine } from '../common.js'

export function ShowRow({ block, openFile }) {
  const meta = blockMeta(block)
  const commit = meta && meta.commit
  const files = (meta && meta.files) || []
  if (!commit) {
    return React.createElement(Card, { header: React.createElement('span', null, 'Commit') })
  }
  const header = React.createElement(
    React.Fragment,
    null,
    React.createElement(Code, null, commit.shortSha),
    React.createElement('span', { style: { fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, firstLine(commit.message)),
  )
  const body = React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Muted,
      { style: { display: 'block', marginBottom: '4px' } },
      `${commit.author} · ${commit.date}`,
    ),
    files.map((f, i) =>
      React.createElement(
        Row,
        { key: f.path + i },
        React.createElement(
          'span',
          { style: { width: '18px', flex: 'none', fontFamily: 'var(--dsw-font-family-code)', fontSize: '12px', fontWeight: 600 } },
          (f.status || 'M').toUpperCase(),
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            title: f.path,
            onClick: openFile ? () => openFile(f.path) : undefined,
            style: {
              background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: openFile ? 'pointer' : 'default',
              fontFamily: 'var(--dsw-font-family-code)', fontSize: '12px', color: 'var(--dsw-alias-label-primary)',
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto',
            },
          },
          f.path,
        ),
        React.createElement(
          'span',
          { style: { display: 'flex', gap: '6px', flex: 'none' } },
          f.additions ? React.createElement(Add, null, `+${f.additions}`) : null,
          f.deletions ? React.createElement(Del, null, `-${f.deletions}`) : null,
        ),
      ),
    ),
  )
  return React.createElement(Card, { header, children: body })
}

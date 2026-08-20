import * as React from 'react'
import { Card, Row, Code, Muted, Stat, Add, Del } from '../components.js'
import { blockMeta, firstLine } from '../common.js'

function CommitRow({ c }) {
  return React.createElement(
    Row,
    null,
    React.createElement(Code, null, c.shortSha),
    React.createElement(
      'span',
      { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } },
      firstLine(c.message),
    ),
    React.createElement(
      'span',
      { style: { display: 'flex', gap: '6px', flex: 'none' } },
      c.additions ? React.createElement(Add, null, `+${c.additions}`) : null,
      c.deletions ? React.createElement(Del, null, `-${c.deletions}`) : null,
    ),
  )
}

export function CommitsRow({ block }) {
  const meta = blockMeta(block)
  const commits = (meta && meta.commits) || []
  const header = React.createElement(
    React.Fragment,
    null,
    React.createElement('span', { style: { fontWeight: 500 } }, 'Commits'),
    React.createElement(Muted, null, `${commits.length}`),
  )
  const body = React.createElement(
    React.Fragment,
    null,
    commits.map((c) => React.createElement(CommitRow, { key: c.sha || c.shortSha, c })),
    commits.length === 0 ? React.createElement(Muted, null, 'no commits') : null,
  )
  return React.createElement(Card, { header, children: body })
}

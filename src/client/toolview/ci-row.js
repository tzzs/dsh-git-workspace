import * as React from 'react'
import { Card, Row, Pill, Muted, truncatePath } from '../components.js'
import { blockMeta, firstLine } from '../common.js'

function stateText(c) {
  if (c.conclusion) return c.conclusion
  if (c.status === 'in_progress') return 'in_progress'
  if (c.status === 'queued') return 'queued'
  return c.status || 'queued'
}

export function CiRow({ block }) {
  const meta = blockMeta(block)
  const checks = (meta && meta.checks) || []
  const status = meta && meta.status
  const header = React.createElement(
    React.Fragment,
    null,
    React.createElement('span', { style: { fontWeight: 500 } }, 'CI'),
    status ? React.createElement(Muted, null, status) : null,
  )
  const body = React.createElement(
    React.Fragment,
    null,
    checks.map((c) =>
      React.createElement(
        Row,
        { key: c.name },
        React.createElement(Pill, { text: stateText(c) }),
        React.createElement(
          'span',
          { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } },
          truncatePath(c.name, 40),
        ),
      ),
    ),
    checks.length === 0 ? React.createElement(Muted, null, 'No checks.') : null,
  )
  return React.createElement(Card, { header, children: body })
}

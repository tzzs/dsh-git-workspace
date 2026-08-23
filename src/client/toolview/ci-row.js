import * as React from 'react'
import { Card, Row, Muted, Dot, checkDotState, ciOverallState } from '../components.js'
import { blockMeta } from '../common.js'

export function CiRow({ block }) {
  const meta = blockMeta(block)
  const checks = (meta && meta.checks) || []
  const overall = ciOverallState(checks)
  const header = React.createElement(
    React.Fragment,
    null,
    React.createElement('span', { style: { fontWeight: 500 } }, 'CI'),
    overall ? React.createElement(Dot, { state: overall, size: 10 }) : null,
    checks.length ? React.createElement(Muted, null, `${checks.length} check${checks.length === 1 ? '' : 's'}`) : null,
  )
  const body = React.createElement(
    React.Fragment,
    null,
    checks.slice(0, 10).map((c) =>
      React.createElement(
        Row,
        { key: c.name, className: 'dgw-row' },
        React.createElement(Dot, { state: checkDotState(c), size: 8 }),
        React.createElement(
          'span',
          { title: c.name, style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } },
          c.name,
        ),
        c.url
          ? React.createElement(
              'a',
              { href: c.url, target: '_blank', rel: 'noreferrer', 'aria-label': 'Open check run', style: { color: 'var(--dsw-alias-label-caption)', fontSize: '12px', textDecoration: 'none' } },
              '↗',
            )
          : null,
      ),
    ),
    checks.length > 10 ? React.createElement(Muted, null, `+${checks.length - 10} more`) : null,
    checks.length === 0 ? React.createElement(Muted, null, 'No checks.') : null,
  )
  return React.createElement(Card, { header, children: body })
}

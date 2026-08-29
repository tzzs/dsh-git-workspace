import * as React from 'react'
import { IconRightUpOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
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
    checks.slice(0, 10).map((c, i) =>
      React.createElement(
        Row,
        { key: `${c.name}:${i}`, className: 'dgw-row' },
        React.createElement(Dot, { state: checkDotState(c), size: 8 }),
        React.createElement(
          'span',
          { title: c.name, style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } },
          c.name,
        ),
        c.url
          ? React.createElement(
              Tooltip,
              { label: 'Open check run', side: 'top', delayMs: 250 },
              React.createElement(
                'a',
                { href: c.url, target: '_blank', rel: 'noreferrer', className: 'dgw-linkicon', 'aria-label': 'Open check run' },
                React.createElement(IconRightUpOutline16, { size: 13 }),
              ),
            )
          : null,
      ),
    ),
    checks.length > 10 ? React.createElement(Muted, null, `+${checks.length - 10} more`) : null,
    checks.length === 0 ? React.createElement(Muted, null, 'No checks.') : null,
  )
  return React.createElement(Card, { header, children: body })
}

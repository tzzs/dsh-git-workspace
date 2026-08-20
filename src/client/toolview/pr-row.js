import * as React from 'react'
import { Card, Row, Pill, Muted } from '../components.js'
import { blockMeta, firstLine } from '../common.js'

export function PrRow({ block }) {
  const meta = blockMeta(block)
  const prs = (meta && meta.pullRequests) || []
  if (prs.length === 0) {
    return React.createElement(
      Card,
      { header: React.createElement('span', { style: { fontWeight: 500 } }, 'Pull Request') },
      React.createElement(Muted, null, 'No pull request for this branch.'),
    )
  }
  return React.createElement(
    Card,
    { header: React.createElement('span', { style: { fontWeight: 500 } }, `Pull Request${prs.length > 1 ? 's' : ''}`) },
    prs.map((pr) =>
      React.createElement(
        Row,
        { key: pr.number },
        React.createElement(Pill, { text: (pr.state || 'open').toUpperCase() }),
        React.createElement(
          'a',
          { href: pr.url, target: '_blank', rel: 'noreferrer', style: { color: 'var(--dsw-alias-brand-primary)', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          `#${pr.number} ${firstLine(pr.title)}`,
        ),
      ),
    ),
  )
}

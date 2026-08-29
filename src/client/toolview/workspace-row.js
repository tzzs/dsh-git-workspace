import * as React from 'react'
import {
  Card,
  Row,
  Code,
  Pill,
  Stat,
  Text,
  Muted,
  Dot,
  Path,
  checkDotState,
  ciOverallState,
} from '../components.js'
import { blockMeta } from '../common.js'

function BranchLine({ branch }) {
  if (!branch) return null
  const parts = []
  parts.push(
    React.createElement(
      'span',
      { key: 'name', style: { fontWeight: 500, color: 'var(--dsw-alias-label-primary)', fontFamily: 'var(--dsw-font-family-code)', fontSize: '13px' } },
      branch.name || 'detached',
    ),
  )
  const aheadBehind = []
  if (branch.ahead > 0) aheadBehind.push(React.createElement(Stat, { key: 'a', text: `↑${branch.ahead}`, color: 'var(--dsw-alias-state-success-primary)' }))
  if (branch.behind > 0) aheadBehind.push(React.createElement(Stat, { key: 'b', text: `↓${branch.behind}`, color: 'var(--dsw-alias-state-error-primary)' }))
  if (aheadBehind.length) parts.push(React.createElement('span', { key: 'ab', style: { display: 'inline-flex', gap: '6px' } }, aheadBehind))
  if (branch.upstream) parts.push(React.createElement(Muted, { key: 'up' }, '→ ' + branch.upstream))
  return React.createElement(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 } },
    parts,
  )
}

function ChangesLine({ changes, clean }) {
  if (clean) {
    return React.createElement(
      Text,
      { style: { color: 'var(--dsw-alias-state-success-primary)' } },
      '✓ Clean — working tree is clean',
    )
  }
  const chips = []
  if (changes.modified) chips.push(React.createElement(Stat, { key: 'm', text: `${changes.modified} modified` }))
  if (changes.staged) chips.push(React.createElement(Stat, { key: 's', text: `${changes.staged} staged`, color: 'var(--dsw-alias-state-success-primary)' }))
  if (changes.untracked) chips.push(React.createElement(Stat, { key: 'u', text: `${changes.untracked} untracked` }))
  if (changes.deleted) chips.push(React.createElement(Stat, { key: 'd', text: `${changes.deleted} deleted`, color: 'var(--dsw-alias-state-error-primary)' }))
  if (!chips.length && !clean) chips.push(React.createElement(Muted, { key: 'n' }, 'working tree has changes'))
  return React.createElement('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, chips)
}

function PrLine({ pr }) {
  if (!pr) return null
  return React.createElement(
    Row,
    null,
    React.createElement(Pill, { text: (pr.state || 'OPEN').toUpperCase() + (pr.draft ? ' · DRAFT' : '') }),
    React.createElement(
      'a',
      { href: pr.url, target: '_blank', rel: 'noreferrer', className: 'dgw-link', style: { color: 'var(--dsw-alias-brand-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
      `PR #${pr.number} · ${pr.title}`,
    ),
  )
}

function CiLine({ ci }) {
  if (!ci || !ci.checks || !ci.checks.length) return null
  const overall = ciOverallState(ci.checks)
  return React.createElement(
    Row,
    null,
    overall ? React.createElement(Dot, { state: overall, size: 10 }) : null,
    React.createElement(
      Muted,
      null,
      `${ci.checks.length} checks · ${
        ci.checks.filter((c) => checkDotState(c) === 'error').length > 0
          ? 'failing'
          : overall === 'ongoing'
            ? 'running'
            : 'passing'
      }`,
    ),
  )
}

export function GitWorkspaceRow({ block }) {
  const meta = blockMeta(block)
  if (!meta) {
    return React.createElement(Card, { header: React.createElement(React.Fragment, null, React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, 'Git Workspace'), React.createElement(Muted, null, '—')), children: null })
  }
  const header = React.createElement(
    React.Fragment,
    null,
    React.createElement('span', { style: { fontWeight: 500 } }, 'Git Workspace'),
    meta.branch?.name ? React.createElement(Code, null, meta.branch.name) : null,
  )
  const body = React.createElement(
    React.Fragment,
    null,
    React.createElement(BranchLine, { branch: meta.branch }),
    React.createElement(ChangesLine, { changes: meta.changes, clean: meta.clean }),
    React.createElement(PrLine, { pr: meta.pullRequest }),
    React.createElement(CiLine, { ci: meta.ci }),
  )
  return React.createElement(Card, { header, children: body })
}

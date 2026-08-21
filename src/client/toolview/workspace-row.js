import * as React from 'react'
import {
  Card,
  Row,
  Code,
  Pill,
  Stat,
  Text,
  Muted,
  Path,
  truncatePath,
  styles as S,
} from '../components.js'
import { blockMeta, blockText, isSettled, firstLine } from '../common.js'

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
  if (branch.upstream) {
    parts.push(React.createElement(Muted, { key: 'up' }, '→ ' + branch.upstream))
  }
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
  return React.createElement('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, chips)
}

function PrLine({ pr }) {
  if (!pr) return null
  return React.createElement(
    Row,
    null,
    React.createElement(Pill, { text: pr.state.toUpperCase() }),
    React.createElement(
      'a',
      { href: pr.url, target: '_blank', rel: 'noreferrer', style: { color: 'var(--dsw-alias-brand-primary)', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
      `PR #${pr.number} · ${pr.title}`,
    ),
  )
}

function CiLine({ ci }) {
  if (!ci) return null
  const failing = ci.checks.some((c) => c.conclusion === 'failure' || c.conclusion === 'cancelled')
  const running = ci.checks.some((c) => c.status === 'in_progress' || c.status === 'queued')
  let pill
  if (failing) pill = React.createElement(Pill, { text: 'CI failing', color: 'var(--dsw-alias-state-error-primary)' })
  else if (running) pill = React.createElement(Pill, { text: 'CI running', color: 'var(--dsw-alias-state-warn-primary)' })
  else pill = React.createElement(Pill, { text: 'CI passing', color: 'var(--dsw-alias-state-success-primary)' })
  return React.createElement(Row, null, pill, React.createElement(Muted, null, `${ci.checks.length} checks`))
}

export function GitWorkspaceRow({ block, cwd, openFile }) {
  const meta = blockMeta(block)
  if (!meta) {
    const settled = isSettled(block)
    const title = settled ? firstLine(blockText(block)) || 'Git workspace' : 'Git workspace…'
    return React.createElement(Card, { header: React.createElement(React.Fragment, null, React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, 'Git Workspace'), React.createElement(Muted, null, '—')), children: null })
  }
  const header = React.createElement(
    React.Fragment,
    null,
    React.createElement('span', { style: { fontWeight: 500 } }, 'Git Workspace'),
    meta.branch?.name
      ? React.createElement(Code, null, truncatePath(meta.branch.name, 24))
      : null,
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

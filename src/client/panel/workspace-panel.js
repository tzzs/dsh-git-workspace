import * as React from 'react'
import { styles as S, Card, Row, Code, Pill, Stat, Muted, Path } from '../components.js'

const overlayStyle = {
  position: 'fixed',
  top: '12px',
  right: '12px',
  width: 'min(380px, calc(100vw - 24px))',
  maxHeight: 'calc(100vh - 24px)',
  overflowY: 'auto',
  background: 'var(--dsw-alias-bg-layer-2)',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: '12px',
  boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
  zIndex: 1000,
  pointerEvents: 'auto',
  padding: '0 0 8px',
  fontFamily: 'var(--dsw-font-family)',
}

function BranchLine({ branch }) {
  if (!branch) return null
  const aheadBehind = []
  if (branch.ahead > 0) aheadBehind.push(React.createElement(Stat, { key: 'a', text: `↑${branch.ahead}`, color: 'var(--dsw-alias-state-success-primary)' }))
  if (branch.behind > 0) aheadBehind.push(React.createElement(Stat, { key: 'b', text: `↓${branch.behind}`, color: 'var(--dsw-alias-state-error-primary)' }))
  return React.createElement(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 } },
    React.createElement(Code, null, branch.name || 'detached'),
    aheadBehind.length ? React.createElement('span', { style: { display: 'inline-flex', gap: '6px' } }, aheadBehind) : null,
    branch.upstream ? React.createElement(Muted, null, '→ ' + branch.upstream) : null,
  )
}

function ChangesSection({ changes, clean }) {
  if (clean) {
    return React.createElement(Row, null, React.createElement(Stat, { text: '✓ clean', color: 'var(--dsw-alias-state-success-primary)' }))
  }
  if (!changes) {
    return React.createElement(Row, null, React.createElement(Muted, null, 'No change summary'))
  }
  const chips = []
  if (changes.modified) chips.push(React.createElement(Stat, { key: 'm', text: `${changes.modified} modified` }))
  if (changes.staged) chips.push(React.createElement(Stat, { key: 's', text: `${changes.staged} staged`, color: 'var(--dsw-alias-state-success-primary)' }))
  if (changes.untracked) chips.push(React.createElement(Stat, { key: 'u', text: `${changes.untracked} untracked` }))
  if (changes.deleted) chips.push(React.createElement(Stat, { key: 'd', text: `${changes.deleted} deleted`, color: 'var(--dsw-alias-state-error-primary)' }))
  return React.createElement(Row, null, chips)
}

function Section({ title, children, action }) {
  return React.createElement(
    'div',
    { style: { borderTop: '1px solid var(--dsw-alias-border-l1)', padding: '8px 10px' } },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' } },
      React.createElement(
        'span',
        { style: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--dsw-alias-label-caption)' } },
        title,
      ),
      action || null,
    ),
    children,
  )
}

function StatusChip({ status }) {
  const map = {
    modified: { text: 'M', color: 'var(--dsw-alias-state-warn-primary)' },
    added: { text: 'A', color: 'var(--dsw-alias-state-success-primary)' },
    deleted: { text: 'D', color: 'var(--dsw-alias-state-error-primary)' },
    renamed: { text: 'R', color: 'var(--dsw-alias-label-secondary)' },
    untracked: { text: 'U', color: 'var(--dsw-alias-label-secondary)' },
  }
  const c = map[status] || { text: '?', color: 'var(--dsw-alias-label-secondary)' }
  return React.createElement(
    'span',
    { style: { fontFamily: 'var(--dsw-font-family-code)', fontSize: '12px', fontWeight: 600, color: c.color, width: '16px', flex: 'none' } },
    c.text,
  )
}

function FileRow({ file }) {
  return React.createElement(
    Row,
    null,
    React.createElement(StatusChip, { status: file.status }),
    React.createElement(
      'span',
      { title: file.path, style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', fontFamily: 'var(--dsw-font-family-code)', fontSize: '12px' } },
      file.path,
    ),
    file.additions ? React.createElement(Stat, { text: `+${file.additions}`, color: 'var(--dsw-alias-state-success-primary)' }) : null,
    file.deletions ? React.createElement(Stat, { text: `-${file.deletions}`, color: 'var(--dsw-alias-state-error-primary)' }) : null,
  )
}

function CommitRow({ c }) {
  return React.createElement(
    Row,
    null,
    React.createElement(Code, null, c.shortSha),
    React.createElement(
      'span',
      { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } },
      (c.message || '').split('\n')[0],
    ),
    React.createElement(Muted, null, c.author),
  )
}

export function GitWorkspacePanel({ data, loading, onRefresh, onClose }) {
  const header = React.createElement(
    'div',
    {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px', borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
    },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px' } },
      React.createElement('span', null, 'Git Workspace'),
      data && data.repository ? React.createElement(Muted, null, data.repository.name) : null,
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '2px' } },
      onRefresh
        ? React.createElement(
            'button',
            {
              type: 'button',
              onClick: onRefresh,
              'aria-label': 'Refresh Git workspace',
              style: {
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)',
                padding: '4px', fontSize: '12px',
              },
            },
            '↻',
          )
        : null,
      onClose
        ? React.createElement(
            'button',
            {
              type: 'button',
              onClick: onClose,
              'aria-label': 'Close Git workspace',
              style: {
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)',
                padding: '4px', fontSize: '14px',
              },
            },
            '×',
          )
        : null,
    ),
  )

  let body
  if (loading) {
    body = React.createElement(Row, { style: { padding: '10px' } }, React.createElement(Muted, null, 'Loading Git workspace…'))
  } else if (!data) {
    body = React.createElement(Row, { style: { padding: '10px' } }, React.createElement(Muted, null, 'Run git_workspace to populate the workspace.'))
  } else {
    body = React.createElement(
      React.Fragment,
      null,
      React.createElement(
        Section,
        { title: 'Branch' },
        React.createElement(BranchLine, { branch: data.branch }),
      ),
      React.createElement(
        Section,
        { title: 'Changes' },
        React.createElement(ChangesSection, { changes: data.changes, clean: data.clean }),
        data.files && data.files.length
          ? data.files.map((f, i) => React.createElement(FileRow, { key: f.path + i, file: f }))
          : null,
      ),
      data.commits && data.commits.length
        ? React.createElement(
            Section,
            { title: 'Commits' },
            data.commits.map((c) => React.createElement(CommitRow, { key: c.shortSha || c.sha, c })),
          )
        : null,
      data.pullRequest
        ? React.createElement(
            Section,
            { title: 'Pull Request' },
            React.createElement(
              Row,
              null,
              React.createElement(Pill, { text: data.pullRequest.state }),
              React.createElement(
                'a',
                { href: data.pullRequest.url, target: '_blank', rel: 'noreferrer', style: { color: 'var(--dsw-alias-brand-primary)', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                `#${data.pullRequest.number} ${data.pullRequest.title}`,
              ),
            ),
          )
        : null,
      data.ci && data.ci.checks && data.ci.checks.length
        ? React.createElement(
            Section,
            { title: 'CI' },
            data.ci.checks.map((c) =>
              React.createElement(Row, { key: c.name }, React.createElement(StatusChip, { status: c.conclusion === 'success' ? 'added' : c.conclusion === 'failure' ? 'deleted' : 'modified' }), React.createElement('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } }, c.name), React.createElement(Muted, null, c.conclusion || c.status)),
            ),
          )
        : null,
    )
  }

  return React.createElement('div', { style: overlayStyle, 'data-git-workspace-panel': '', role: 'dialog', 'aria-label': 'Git Workspace' }, header, body)
}

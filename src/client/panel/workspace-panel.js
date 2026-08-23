import * as React from 'react'
import {
  Button,
  IconBranchOutline16,
  IconChecklistOutline14,
  IconCodeOutline16,
  IconFolderOpenOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  Row,
  Code,
  Pill,
  Stat,
  Muted,
  Dot,
  CopyBtn,
  Section,
  checkDotState,
  ciOverallState,
} from '../components.js'

const REFRESH_HINT = 'Ask the agent to run git_workspace to populate the workspace.'

const STATUS_LETTER = {
  modified: { text: 'M', color: 'var(--dsw-alias-state-warn-primary)' },
  added: { text: 'A', color: 'var(--dsw-alias-state-success-primary)' },
  deleted: { text: 'D', color: 'var(--dsw-alias-state-error-primary)' },
  renamed: { text: 'R', color: 'var(--dsw-alias-label-secondary)' },
  copied: { text: 'C', color: 'var(--dsw-alias-state-success-primary)' },
  untracked: { text: 'U', color: 'var(--dsw-alias-label-secondary)' },
}

function StatusChip({ status }) {
  const c = STATUS_LETTER[status] || { text: '?', color: 'var(--dsw-alias-label-secondary)' }
  return React.createElement(
    'span',
    {
      style: {
        fontFamily: 'var(--dsw-font-family-code)',
        fontSize: '12px',
        fontWeight: 600,
        color: c.color,
        width: '14px',
        flex: 'none',
        textAlign: 'center',
      },
    },
    c.text,
  )
}

function fmtNum(n) {
  return n >= 1000 ? n.toLocaleString('en-US') : String(n)
}

function FileStats({ additions, deletions }) {
  if (!additions && !deletions) return null
  return React.createElement(
    'span',
    { style: { display: 'inline-flex', gap: '6px', flex: 'none', fontFamily: 'var(--dsw-font-family-code)', fontSize: '11px' } },
    React.createElement('span', { style: { color: 'var(--dsw-alias-state-success-primary)', minWidth: '24px', textAlign: 'right' } }, `+${fmtNum(additions || 0)}`),
    React.createElement('span', { style: { color: 'var(--dsw-alias-state-error-primary)', minWidth: '24px', textAlign: 'right' } }, `-${fmtNum(deletions || 0)}`),
  )
}

function buildTree(files) {
  const root = { dirs: new Map(), files: [] }
  for (const f of files) {
    const segs = f.path.split('/')
    let node = root
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i]
      if (!node.dirs.has(seg)) node.dirs.set(seg, { name: seg, dirs: new Map(), files: [] })
      node = node.dirs.get(seg)
    }
    node.files.push({ ...f, name: segs[segs.length - 1] })
  }
  return root
}

function treeSize(node) {
  let n = node.files.length
  for (const d of node.dirs.values()) n += treeSize(d)
  return n
}

function DirRow({ name, count, depth }) {
  return React.createElement(
    Row,
    { className: 'dgw-row', style: { padding: `2px 6px 2px ${depth * 12 + 6}px` } },
    React.createElement(IconFolderOpenOutline16, { size: 14 }),
    React.createElement(
      'span',
      { style: { fontSize: '12px', color: 'var(--dsw-alias-label-primary)', flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
      name,
    ),
    React.createElement(Muted, null, String(count)),
  )
}

function TreeNodeRows({ node, depth }) {
  const rows = []
  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name))
  for (const dir of dirs) {
    rows.push(React.createElement(DirRow, { key: 'd/' + dir.name, name: dir.name, count: treeSize(dir), depth }))
    rows.push(React.createElement(TreeNodeRows, { key: 'r/' + dir.name, node: dir, depth: depth + 1 }))
  }
  for (const f of files) {
    rows.push(React.createElement(FileTreeRow, { key: f.path + f.staged, file: f, depth }))
  }
  return rows
}

function FileTreeRow({ file, depth }) {
  return React.createElement(
    Row,
    { className: 'dgw-row', style: { padding: `2px 6px 2px ${depth * 12 + 20}px` } },
    React.createElement(Code, { style: { fontSize: '12px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } }, file.name),
    React.createElement(FileStats, { additions: file.additions, deletions: file.deletions }),
    React.createElement(StatusChip, { status: file.status }),
    React.createElement(CopyBtn, { text: file.path, label: 'Copy path' }),
  )
}

function TreeSection({ icon, title, files, defaultOpen }) {
  if (!files || files.length === 0) return null
  const tree = buildTree(files)
  return React.createElement(
    Section,
    {
      icon,
      title,
      count: files.length,
      defaultOpen,
    },
    React.createElement(TreeNodeRows, { node: tree, depth: 0 }),
  )
}

function OverviewCard({ data, refreshing }) {
  const branch = data.branch
  const totalA = typeof data.additionsTotal === 'number' ? data.additionsTotal : null
  const totalD = typeof data.deletionsTotal === 'number' ? data.deletionsTotal : null
  const ciState = data.ci && data.ci.checks ? ciOverallState(data.ci.checks) : null
  return React.createElement(
    'div',
    {
      style: {
        background: 'var(--dsw-alias-bg-base)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '10px',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        flex: 'none',
      },
    },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'flex-start', gap: '8px' } },
      React.createElement(
        'div',
        { style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' } },
        React.createElement(Code, { style: { fontSize: '13px', fontWeight: 600 } }, (branch && branch.name) || 'detached'),
        branch && branch.upstream
          ? React.createElement(Muted, { style: { fontSize: '12px' } }, '→ ' + branch.upstream)
          : null,
      ),
      React.createElement('span', { style: { flex: '1 1 auto' } }),
      React.createElement(
        'span',
        { style: { display: 'inline-flex', gap: '8px', alignItems: 'center', flex: 'none', fontFamily: 'var(--dsw-font-family-code)', fontSize: '12px', paddingTop: '1px' } },
        totalA != null && (totalA > 0 || totalD > 0)
          ? React.createElement('span', { style: { color: 'var(--dsw-alias-state-success-primary)' } }, `+${fmtNum(totalA)}`)
          : null,
        totalD != null && (totalA > 0 || totalD > 0)
          ? React.createElement('span', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, `-${fmtNum(totalD)}`)
          : null,
        ciState ? React.createElement(Dot, { state: ciState, size: 8 }) : null,
      ),
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
      data.clean
        ? React.createElement(Stat, { text: '✓ clean', color: 'var(--dsw-alias-state-success-primary)' })
        : React.createElement(
            Stat,
            { text: `${countDirty(data)} changed` },
          ),
      data.comparison && data.comparison.base
        ? React.createElement(Muted, null, `vs ${data.comparison.base} ↑${data.comparison.ahead} ↓${data.comparison.behind}`)
        : branch && branch.upstream && (branch.ahead > 0 || branch.behind > 0)
          ? React.createElement(Muted, null, `↑${branch.ahead} ↓${branch.behind}`)
          : null,
      data.stashCount > 0 ? React.createElement(Muted, null, `${data.stashCount} stashed`) : null,
      refreshing
        ? React.createElement(
            'span',
            { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } },
            React.createElement(Dot, { state: 'ongoing', size: 7 }),
            React.createElement(Muted, null, 'refreshing…'),
          )
        : null,
    ),
  )
}

function countDirty(data) {
  const c = data.changes
  if (c && typeof c === 'object') {
    return (c.modified || 0) + (c.staged || 0) + (c.deleted || 0) + (c.renamed || 0) + (c.untracked || 0)
  }
  return Array.isArray(data.files) ? data.files.length : 0
}

function ChangesBody({ data }) {
  const all = Array.isArray(data.files) ? data.files : []
  if (all.length > 0) {
    const tracked = all.filter((f) => f.status !== 'untracked')
    const untracked = all.filter((f) => f.status === 'untracked')
    return React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' } },
      tracked.length > 0
        ? React.createElement(TreeSection, {
            icon: React.createElement(IconCodeOutline16, { size: 14 }),
            title: 'Changes',
            files: tracked,
            defaultOpen: true,
          })
        : null,
      untracked.length > 0
        ? React.createElement(TreeSection, {
            icon: React.createElement(IconCodeOutline16, { size: 14 }),
            title: 'Untracked files',
            files: untracked,
            defaultOpen: true,
          })
        : null,
    )
  }
  const chips = []
  const c = data.changes
  if (c && typeof c === 'object') {
    if (c.modified) chips.push(React.createElement(Stat, { key: 'm', text: `${c.modified} modified` }))
    if (c.staged) chips.push(React.createElement(Stat, { key: 's', text: `${c.staged} staged`, color: 'var(--dsw-alias-state-success-primary)' }))
    if (c.untracked) chips.push(React.createElement(Stat, { key: 'u', text: `${c.untracked} untracked` }))
    if (c.deleted) chips.push(React.createElement(Stat, { key: 'd', text: `${c.deleted} deleted`, color: 'var(--dsw-alias-state-error-primary)' }))
  }
  return React.createElement(
    'div',
    { style: { marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' } },
    chips.length ? React.createElement(Row, null, chips) : null,
    !data.clean ? React.createElement(Muted, null, 'File list unavailable in this session\u2019s data — refresh to fetch it.') : null,
    data.clean && !chips.length ? React.createElement(Stat, { text: '✓ clean', color: 'var(--dsw-alias-state-success-primary)' }) : null,
  )
}

function CommitRow({ c }) {
  return React.createElement(
    Row,
    { className: 'dgw-row' },
    React.createElement(Code, { style: { flex: 'none' } }, c.shortSha),
    React.createElement(
      'span',
      { title: c.message, style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } },
      (c.message || '').split('\n')[0],
    ),
    React.createElement(Muted, null, c.author),
    React.createElement(FileStats, { additions: c.additions, deletions: c.deletions }),
  )
}

function CheckRow({ check }) {
  return React.createElement(
    Row,
    { className: 'dgw-row' },
    React.createElement(Dot, { state: checkDotState(check), size: 8 }),
    React.createElement(
      'span',
      { title: check.name, style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } },
      check.name,
    ),
    React.createElement(Muted, null, check.conclusion || check.status),
    check.url
      ? React.createElement(
          'a',
          { href: check.url, target: '_blank', rel: 'noreferrer', 'aria-label': 'Open check run', style: { color: 'var(--dsw-alias-label-caption)', fontSize: '12px', textDecoration: 'none' } },
          '↗',
        )
      : null,
  )
}

function CiSection({ ci }) {
  if (!ci || !ci.checks || ci.checks.length === 0) return null
  const overall = ciOverallState(ci.checks)
  return React.createElement(
    Section,
    {
      icon: React.createElement(IconChecklistOutline14, { size: 14 }),
      title: 'CI status',
      count: ci.checks.length,
      defaultOpen: overall !== 'done',
      right: overall ? React.createElement(Dot, { state: overall, size: 8 }) : null,
    },
    ci.checks.slice(0, 15).map((c) => React.createElement(CheckRow, { key: c.name, check: c })),
  )
}

function CommentItem({ comment }) {
  return React.createElement(
    'div',
    { style: { padding: '8px 0', borderTop: '1px solid var(--dsw-alias-border-l1)' } },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' } },
      React.createElement('span', { style: { fontSize: '12px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, comment.author || 'anonymous'),
      comment.createdAt
        ? React.createElement(Muted, null, String(comment.createdAt).slice(0, 10))
        : null,
      React.createElement('span', { style: { flex: '1 1 auto' } }),
      comment.url
        ? React.createElement(
            'a',
            { href: comment.url, target: '_blank', rel: 'noreferrer', 'aria-label': 'Open on GitHub', style: { color: 'var(--dsw-alias-label-caption)', fontSize: '12px', textDecoration: 'none' } },
            '↗',
          )
        : null,
    ),
    comment.path
      ? React.createElement(
          'div',
          { style: { fontFamily: 'var(--dsw-font-family-code)', fontSize: '11px', color: 'var(--dsw-alias-label-caption)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          comment.path + (comment.line ? ':' + comment.line : ''),
        )
      : null,
    React.createElement(
      'div',
      {
        title: comment.body,
        style: {
          fontSize: '12px',
          lineHeight: '17px',
          color: 'var(--dsw-alias-label-secondary)',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        },
      },
      comment.body,
    ),
  )
}

function PrTab({ data, canRefresh, onRefresh }) {
  const pr = data.pullRequest
  if (!pr) {
    return React.createElement(
      'div',
      {
        style: {
          background: 'var(--dsw-alias-bg-base)',
          border: '1px solid var(--dsw-alias-border-l1)',
          borderRadius: '10px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          alignItems: 'flex-start',
          flex: 'none',
        },
      },
      React.createElement(Muted, null, 'No pull request for this branch.'),
      canRefresh !== false && onRefresh
        ? React.createElement(Button, { variant: 'outline', size: 'sm', onClick: onRefresh }, 'Run git_workspace')
        : null,
    )
  }
  const comments = Array.isArray(pr.comments) ? pr.comments : []
  const unresolved = comments.filter((c) => !c.resolved)
  const resolved = comments.filter((c) => c.resolved)
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      {
        style: {
          background: 'var(--dsw-alias-bg-base)',
          border: '1px solid var(--dsw-alias-border-l1)',
          borderRadius: '10px',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          flex: 'none',
        },
      },
      React.createElement(
        Row,
        null,
        React.createElement(Pill, { text: (pr.state || 'OPEN').toUpperCase() + (pr.draft ? ' · DRAFT' : '') }),
        React.createElement(
          'a',
          {
            href: pr.url,
            target: '_blank',
            rel: 'noreferrer',
            className: 'dgw-link',
            style: { color: 'var(--dsw-alias-brand-primary)', fontSize: '13px', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' },
          },
          `#${pr.number} ${pr.title}`,
        ),
      ),
      React.createElement(
        Muted,
        { style: { fontSize: '12px' } },
        comments.length > 0
          ? `${comments.length} comment${comments.length === 1 ? '' : 's'}${unresolved.length ? ` · ${unresolved.length} unresolved` : ''}`
          : 'No comments yet.',
      ),
    ),
    React.createElement(CiSection, { ci: data.ci }),
    unresolved.length > 0
      ? React.createElement(
          Section,
          { icon: React.createElement(IconBranchOutline16, { size: 14 }), title: 'Unresolved comments', count: unresolved.length, defaultOpen: true },
          unresolved.map((c) => React.createElement(CommentItem, { key: c.id, comment: c })),
        )
      : null,
    resolved.length > 0
      ? React.createElement(
          Section,
          { icon: React.createElement(IconChecklistOutline14, { size: 14 }), title: 'Resolved comments', count: resolved.length, defaultOpen: false },
          resolved.map((c) => React.createElement(CommentItem, { key: c.id, comment: c })),
        )
      : null,
  )
}

function ScTab({ data, refreshing }) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(OverviewCard, { data, refreshing }),
    React.createElement(
      Section,
      {
        icon: React.createElement(IconCodeOutline16, { size: 14 }),
        title: 'Changes',
        count: countDirty(data) || null,
        defaultOpen: true,
      },
      React.createElement(ChangesBody, { data }),
    ),
    data.commits && data.commits.length > 0
      ? React.createElement(
          Section,
          {
            icon: React.createElement(IconCodeOutline16, { size: 14 }),
            title: 'Recent commits',
            count: data.commits.length,
            defaultOpen: true,
          },
          data.commits.map((c) => React.createElement(CommitRow, { key: c.shortSha || c.sha, c })),
        )
      : null,
    data.branches && data.branches.length > 1
      ? React.createElement(
          Section,
          {
            icon: React.createElement(IconBranchOutline16, { size: 14 }),
            title: 'Branches',
            count: data.branches.length,
            defaultOpen: false,
          },
          data.branches.slice(0, 12).map((b) =>
            React.createElement(
              Row,
              { key: b.name, className: 'dgw-row' },
              b.current ? React.createElement(Dot, { state: 'done', size: 6 }) : React.createElement('span', { style: { width: '6px', flex: 'none' } }),
              React.createElement(Code, null, b.name),
              b.ahead > 0 ? React.createElement(Stat, { text: `↑${b.ahead}`, color: 'var(--dsw-alias-state-success-primary)' }) : null,
              b.behind > 0 ? React.createElement(Stat, { text: `↓${b.behind}`, color: 'var(--dsw-alias-state-error-primary)' }) : null,
              React.createElement('span', { style: { flex: '1 1 auto' } }),
              React.createElement(CopyBtn, { text: b.name, label: 'Copy branch name' }),
            ),
          ),
        )
      : null,
  )
}

function TabBar({ tab, setTab, prHint }) {
  const mk = (id, label, badge) =>
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => setTab(id),
        role: 'tab',
        'aria-selected': tab === id,
        style: {
          flex: '1 1 50%',
          padding: '9px 0 8px',
          background: 'none',
          border: 'none',
          borderBottom: tab === id ? '2px solid var(--dsw-alias-brand-primary)' : '2px solid transparent',
          color: tab === id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
          fontWeight: tab === id ? 600 : 400,
          cursor: 'pointer',
          fontFamily: 'var(--dsw-font-family)',
          fontSize: '11px',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
      },
      label,
      badge != null ? React.createElement('span', { style: { marginLeft: '5px', color: 'var(--dsw-alias-label-caption)' } }, badge) : null,
    )
  return React.createElement(
    'div',
    {
      style: {
        position: 'sticky',
        top: 0,
        zIndex: 2,
        display: 'flex',
        margin: '-12px -14px 12px',
        padding: '0 14px',
        background: 'var(--dsw-alias-bg-layer-2)',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
    },
    mk('sc', 'Source Control'),
    mk('pr', 'Pull Request', prHint),
  )
}

export function GitWorkspacePanel({ data, errorText, loading, refreshing, canRefresh, onRefresh }) {
  const [tab, setTab] = React.useState('sc')

  let body
  if (loading) {
    body = React.createElement(Row, { style: { padding: '10px' } }, React.createElement(Muted, null, 'Loading Git workspace…'))
  } else if (!data) {
    body = React.createElement(
      'div',
      { style: { padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' } },
      React.createElement(
        Muted,
        null,
        errorText
          ? `Git workspace: ${errorText}`
          : canRefresh === false
            ? REFRESH_HINT
            : 'No workspace data in this session yet.',
      ),
      onRefresh && canRefresh !== false
        ? React.createElement(Button, { variant: 'outline', size: 'sm', onClick: onRefresh }, 'Run git_workspace')
        : null,
    )
  } else {
    const prComments = data.pullRequest && Array.isArray(data.pullRequest.comments) ? data.pullRequest.comments : []
    const prUnresolved = prComments.filter((c) => !c.resolved).length
    body = React.createElement(
      React.Fragment,
      null,
      React.createElement(TabBar, { tab, setTab, prHint: data.pullRequest ? (prUnresolved || null) : null }),
      tab === 'pr' ? PrTab({ data, canRefresh, onRefresh }) : ScTab({ data, refreshing }),
    )
  }

  return React.createElement(
    'div',
    { 'data-git-workspace-panel': '', style: { padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: '8px' } },
    body,
  )
}

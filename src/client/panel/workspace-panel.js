import * as React from 'react'
import {
  Button,
  IconBranchOutline16,
  IconCheckOutline14,
  IconChevronRightOutline14,
  IconCloseFill14,
  IconCodeOutline16,
  IconFolderOpenOutline16,
  IconPlusOutline16,
  IconRightUpOutline16,
  IconWarningOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  Row,
  Code,
  Pill,
  TintPill,
  CircleIcon,
  Stat,
  Muted,
  Dot,
  CopyBtn,
  Section,
  checkDotState,
} from '../components.js'
import { DiffViewer } from './diff-viewer.js'

const REFRESH_HINT = 'No workspace session available yet.'

const COMMANDS_UNSUPPORTED_HINT =
  'This host has no native command channel — Git write actions are disabled.'

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
        fontSize: '11px',
        fontWeight: 600,
        color: c.color,
        width: '12px',
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

function fmtTime(s) {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return String(s)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function repoWebUrl(remote) {
  if (!remote) return null
  if (remote.startsWith('http')) return remote.replace(/\.git$/, '')
  const m = remote.match(/^git@([^:]+):(.+)$/)
  return m ? `https://${m[1]}/${m[2].replace(/\.git$/, '')}` : null
}

function FileStats({ additions, deletions }) {
  if (!additions && !deletions) return null
  return React.createElement(
    'span',
    { style: { display: 'inline-flex', gap: '6px', flex: 'none', fontFamily: 'var(--dsw-font-family-code)', fontSize: '11px' } },
    React.createElement('span', { style: { color: 'var(--dsw-alias-state-success-primary)', minWidth: '22px', textAlign: 'right' } }, `+${fmtNum(additions || 0)}`),
    React.createElement('span', { style: { color: 'var(--dsw-alias-state-error-primary)', minWidth: '22px', textAlign: 'right' } }, `-${fmtNum(deletions || 0)}`),
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

function DirNode({ dir, depth, onDispatch }) {
  const [open, setOpen] = React.useState(true)
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dgw-row dgw-dirbtn',
        onClick: () => setOpen((v) => !v),
        'aria-expanded': open,
        style: { padding: `2px 6px 2px ${depth * 12 + 2}px` },
      },
      React.createElement(
        'span',
        { className: 'dgw-chevron', 'data-open': String(open) },
        React.createElement(IconChevronRightOutline14, { size: 12 }),
      ),
      React.createElement(
        'span',
        { style: { display: 'inline-flex', color: 'var(--dsw-alias-label-caption)', flex: 'none' } },
        React.createElement(IconFolderOpenOutline16, { size: 13 }),
      ),
      React.createElement(
        'span',
        { style: { fontSize: '12px', color: 'var(--dsw-alias-label-primary)', flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' } },
        dir.name,
      ),
      React.createElement(Muted, null, String(treeSize(dir))),
    ),
    open ? React.createElement(TreeNodeRows, { node: dir, depth: depth + 1, onDispatch }) : null,
  )
}

function TreeNodeRows({ node, depth, onDispatch }) {
  const rows = []
  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name))
  for (const dir of dirs) {
    rows.push(React.createElement(DirNode, { key: 'd/' + dir.name, dir, depth, onDispatch }))
  }
  for (const f of files) {
    rows.push(React.createElement(FileTreeRow, { key: f.path + f.staged, file: f, depth, onDispatch }))
  }
  return rows
}

function hasPatch(file) {
  return (
    (Array.isArray(file.hunks) && file.hunks.length > 0) ||
    file.diffOmitted === 'size' ||
    file.diffOmitted === 'binary'
  )
}

function fileStageControl(file, onDispatch) {
  if (!onDispatch) return null
  const staged = file.staged === true
  const action = staged
    ? {name: 'git-unstage', args: {paths: [file.path]}}
    : {name: 'git-stage', args: {paths: [file.path]}}
  return React.createElement(
    'span',
    { onClick: (e) => e.stopPropagation(), style: { display: 'inline-flex', flex: 'none' } },
    React.createElement(
      'button',
      {
        type: 'button',
        title: staged ? 'Unstage this file' : 'Stage this file',
        onClick: () => onDispatch(action),
        style: {
          border: 'none',
          background: 'none',
          padding: '0 2px',
          cursor: 'pointer',
          fontFamily: 'var(--dsw-font-family)',
          fontSize: '10px',
          lineHeight: '15px',
          fontWeight: 600,
          color: staged ? 'var(--dsw-alias-label-caption)' : 'var(--dsw-alias-state-success-primary)',
          whiteSpace: 'nowrap',
        },
      },
      staged ? 'Unstage' : 'Stage',
    ),
  )
}

function FileTreeRow({ file, depth, onDispatch }) {
  const [open, setOpen] = React.useState(false)
  const rowStyle = { padding: `2px 6px 2px ${depth * 12 + 22}px`, gap: '5px' }
  if (!hasPatch(file)) {
    return React.createElement(
      Row,
      { className: 'dgw-row', style: rowStyle },
      React.createElement(
        'span',
        { style: { display: 'inline-flex', color: 'var(--dsw-alias-label-caption)', flex: 'none' } },
        React.createElement(IconCodeOutline16, { size: 13 }),
      ),
      React.createElement(Code, { style: { fontSize: '11.5px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } }, file.name),
      React.createElement(FileStats, { additions: file.additions, deletions: file.deletions }),
      React.createElement(StatusChip, { status: file.status }),
      fileStageControl(file, onDispatch),
      React.createElement(CopyBtn, { text: file.path, label: 'Copy path' }),
    )
  }
  const toggle = () => setOpen((v) => !v)
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      {
        className: 'dgw-row dgw-filebtn',
        role: 'button',
        tabIndex: 0,
        title: 'Toggle diff',
        onClick: toggle,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        },
        'aria-expanded': open,
        style: rowStyle,
      },
      React.createElement(
        'span',
        { className: 'dgw-chevron', 'data-open': String(open) },
        React.createElement(IconChevronRightOutline14, { size: 12 }),
      ),
      React.createElement(
        'span',
        { style: { display: 'inline-flex', color: 'var(--dsw-alias-label-caption)', flex: 'none' } },
        React.createElement(IconCodeOutline16, { size: 13 }),
      ),
      React.createElement(Code, { style: { fontSize: '11.5px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } }, file.name),
      React.createElement(FileStats, { additions: file.additions, deletions: file.deletions }),
      React.createElement(StatusChip, { status: file.status }),
      fileStageControl(file, onDispatch),
      React.createElement(
        'span',
        { className: 'dgw-copy', onClick: (e) => e.stopPropagation(), style: { display: 'inline-flex', flex: 'none' } },
        React.createElement(CopyBtn, { text: file.path, label: 'Copy path' }),
      ),
    ),
    open
      ? React.createElement(
          'div',
          { style: { margin: `0 -6px 0 ${depth * 12 + 28}px` } },
          React.createElement(
            DiffViewer,
            {
              file,
              onClose: () => setOpen(false),
              onAskFull: onDispatch ? () => onDispatch({name: 'git-diff', args: {path: file.path}}) : null,
            },
          ),
        )
      : null,
  )
}

function countDirty(data) {
  const c = data.changes
  if (c && typeof c === 'object') {
    return (c.modified || 0) + (c.staged || 0) + (c.deleted || 0) + (c.renamed || 0) + (c.untracked || 0)
  }
  return Array.isArray(data.files) ? data.files.length : 0
}

function BranchHeader({ data, refreshing, onOpenPr }) {
  const branch = data.branch || {}
  const pr = data.pullRequest
  const totalA = typeof data.additionsTotal === 'number' ? data.additionsTotal : null
  const totalD = typeof data.deletionsTotal === 'number' ? data.deletionsTotal : null
  const link = (pr && pr.url) || repoWebUrl(data.repository && data.repository.remote)
  return React.createElement(
    'div',
    { style: { padding: '10px 2px 8px', display: 'flex', flexDirection: 'column', gap: '1px', flex: 'none' } },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '8px', minHeight: '16px' } },
      pr
        ? React.createElement(
            'a',
            {
              href: '#pr',
              onClick: (e) => { e.preventDefault(); onOpenPr && onOpenPr() },
              className: 'dgw-link',
              style: { display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--dsw-alias-label-primary)', minWidth: 0 },
            },
            React.createElement(
              'span',
              { style: { display: 'inline-flex', color: 'var(--dsw-alias-state-success-primary)', flex: 'none' } },
              React.createElement(IconBranchOutline16, { size: 12 }),
            ),
            React.createElement('span', { style: { fontSize: '11px', fontWeight: 600 } }, `PR #${pr.number}`),
          )
        : React.createElement(
            'span',
            { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', fontWeight: 500 } },
            (data.repository && data.repository.name) || 'Working tree',
          ),
      React.createElement('span', { style: { flex: '1 1 auto' } }),
      totalA != null && (totalA > 0 || totalD > 0)
        ? React.createElement(
            'span',
            { style: { display: 'inline-flex', gap: '6px', flex: 'none', fontFamily: 'var(--dsw-font-family-code)', fontSize: '11px' } },
            React.createElement('span', { style: { color: 'var(--dsw-alias-state-success-primary)' } }, `+${fmtNum(totalA)}`),
            React.createElement('span', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, `-${fmtNum(totalD)}`),
          )
        : null,
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '8px', minHeight: '18px' } },
      React.createElement(Code, { style: { fontSize: '13px', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, branch.name || 'detached'),
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '8px', minHeight: '18px' } },
      React.createElement(
        'span',
        { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
        branch.upstream
          ? `→ ${branch.upstream}`
          : data.comparison && data.comparison.base
            ? `→ ${data.comparison.base} ↑${data.comparison.ahead} ↓${data.comparison.behind}`
            : 'no upstream',
      ),
      React.createElement('span', { style: { flex: '1 1 auto' } }),
      branch.ahead > 0
        ? React.createElement('span', { style: { fontFamily: 'var(--dsw-font-family-code)', fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', flex: 'none' } }, `↑${branch.ahead}`)
        : null,
      branch.behind > 0
        ? React.createElement('span', { style: { fontFamily: 'var(--dsw-font-family-code)', fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', flex: 'none' } }, `↓${branch.behind}`)
        : null,
      data.stashCount > 0 ? React.createElement(Muted, null, `${data.stashCount} stashed`) : null,
      refreshing
        ? React.createElement(
            'span',
            { style: { display: 'inline-flex', alignItems: 'center', gap: '5px', flex: 'none' } },
            React.createElement(Dot, { state: 'ongoing', size: 7 }),
            React.createElement(Muted, null, 'refreshing…'),
          )
        : null,
      link
        ? React.createElement(
            'a',
            { href: link, target: '_blank', rel: 'noreferrer', className: 'dgw-linkicon', 'aria-label': 'Open on GitHub', title: 'Open on GitHub' },
            React.createElement(IconRightUpOutline16, { size: 13 }),
          )
        : null,
    ),
  )
}

function actionCommand(action, message, data, branch) {
  const base = (data.comparison && data.comparison.base) || 'main'
  const head = data.branch && data.branch.name
  const firstCommit =
    Array.isArray(data.commits && data.commits.recent) && data.commits.recent.length > 0
      ? String(data.commits.recent[0].message || '').split('\n')[0].trim()
      : ''
  const title = firstCommit || `Merge ${head || 'branch'} into ${base}`
  const body = `${data.repository && data.repository.name ? `Pull request for \`${data.repository.name}\`.\n\n` : ''}Created from the Git Workspace panel.`
  switch (action) {
    case 'stage-all': return {name: 'git-stage', args: {all: true}}
    case 'unstage-all': return {name: 'git-unstage', args: {all: true}}
    case 'commit': return {name: 'git-commit', args: {message}}
    case 'commit-push': return {name: 'git-commit-push', args: {message}}
    case 'commit-sync':
      return {
        name: 'git-commit-sync',
        args: {message},
        next: {name: 'git-refresh', args: {}},
      }
    case 'push': return {name: 'git-push', args: {}}
    case 'force-push': return {name: 'git-push', args: {force: true}}
    case 'new-branch': return {name: 'git-branch-create', args: {name: branch}}
    case 'switch-branch': return {name: 'git-checkout', args: {branch}}
    case 'merge-branch': return {name: 'git-merge', args: {branch}}
    case 'create-pr':
      return {
        name: 'git-pr-create',
        args: {base, ...(head ? {head} : {}), title, body},
      }
    case 'push-before-pr': return {name: 'git-push', args: {}}
    case 'pull': return {name: 'git-pull', args: {}}
    case 'fast-forward': return {name: 'git-fast-forward', args: {}}
    case 'sync': return {name: 'git-sync', args: {}}
    case 'rebase': return {name: 'git-rebase', args: {}}
    case 'fetch': return {name: 'git-fetch', args: {}}
    case 'publish': return {name: 'git-push', args: {}}
    case 'discard': return {name: 'git-discard', args: {confirm: true}}
    default: return null
  }
}

const GIT_ACTIONS = [
  ['commit', 'Commit'], ['commit-push', 'Commit & Push'], ['commit-sync', 'Commit & Sync'],
  ['stage-all', 'Stage All'], ['unstage-all', 'Unstage All'],
  ['push', 'Push'], ['force-push', 'Force Push'],
  ['new-branch', 'New Branch'], ['switch-branch', 'Switch Branch'], ['merge-branch', 'Merge Branch'],
  ['create-pr', 'Create PR'], ['push-before-pr', 'Push before PR'],
  ['pull', 'Pull'], ['fast-forward', 'Fast-forward'],
  ['sync', 'Sync'], ['rebase', 'Rebase from upstream'], ['fetch', 'Fetch'], ['publish', 'Publish Branch'],
  ['discard', 'Discard Changes'],
]

const BRANCH_ACTION_VERBS = { 'new-branch': 'Create', 'switch-branch': 'Switch', 'merge-branch': 'Merge' }

function CommitBox({ onDispatch, data }) {
  const [msg, setMsg] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [menu, setMenu] = React.useState(false)
  const [branchAction, setBranchAction] = React.useState(null)
  const [branchName, setBranchName] = React.useState('')
  const run = (action, extra) => {
    if (busy || !onDispatch) return
    const message = msg.trim()
    setBusy(true)
    setMenu(false)
    Promise.resolve(onDispatch(actionCommand(action, message, data, extra))).finally(() => {
      setBusy(false)
      if (action === 'commit' || action === 'commit-push' || action === 'commit-sync') setMsg('')
    })
  }
  const startBranchAction = (id) => {
    setMenu(false)
    setBranchAction(id)
    setBranchName('')
  }
  const confirmBranch = () => {
    const name = branchName.trim()
    if (!name || !branchAction || busy) return
    const action = branchAction
    setBranchAction(null)
    run(action, name)
  }
  return React.createElement(
    'div',
    { style: { padding: '0 2px 10px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 'none' } },
    React.createElement('textarea', {
      className: 'dgw-textarea',
      placeholder: 'Message',
      rows: 1,
      value: msg,
      'aria-label': 'Commit message',
      onChange: (e) => setMsg(e.target.value),
      onKeyDown: (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault()
           run('commit')
        }
      },
    }),
    React.createElement(
      'div',
      { style: { position: 'relative', display: 'flex', flex: 'none' } },
      React.createElement('button', { type: 'button', className: 'dgw-stagebtn', disabled: busy, onClick: () => run(msg.trim() ? 'commit' : 'stage-all'), title: 'Run Git operation', style: { borderRadius: '8px 0 0 8px' } }, React.createElement(IconPlusOutline16, { size: 14 }), busy ? 'Working…' : msg.trim() ? 'Commit' : 'Stage All'),
      React.createElement('button', { type: 'button', className: 'dgw-stagebtn', 'aria-label': 'More Git operations', onClick: () => setMenu((v) => !v), style: { width: '38px', borderLeft: '1px solid var(--dsw-alias-border-l1)', borderRadius: '0 8px 8px 0' } }, React.createElement(IconChevronRightOutline14, { size: 14, style: { transform: 'rotate(90deg)' } })),
      menu ? React.createElement('div', { className: 'dgw-actionmenu' }, GIT_ACTIONS.map(([id, label], i) => React.createElement(React.Fragment, { key: id }, i === 3 || i === 7 || i === 10 || i === 18 ? React.createElement('div', { className: 'dgw-actionsep' }) : null, React.createElement('button', { type: 'button', className: 'dgw-action', onClick: () => (BRANCH_ACTION_VERBS[id] ? startBranchAction(id) : run(id)), disabled: (id === 'create-pr' || id === 'push-before-pr') && Boolean(data.pullRequest) }, label), (id === 'create-pr' || id === 'push-before-pr') && data.pullRequest ? React.createElement('div', { style: { padding: '0 12px 5px', fontSize: '11px', color: 'var(--dsw-alias-label-caption)' } }, 'A pull request already exists') : null))) : null,
    ),
    branchAction
      ? React.createElement(
          'div',
          { style: { display: 'flex', gap: '6px', flex: 'none' } },
          React.createElement('input', {
            className: 'dgw-textarea',
            style: { minHeight: '28px', height: '28px', flex: '1 1 auto' },
            placeholder: 'Branch name',
            'aria-label': 'Branch name',
            autoFocus: true,
            value: branchName,
            onChange: (e) => setBranchName(e.target.value),
            onKeyDown: (e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                confirmBranch()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setBranchAction(null)
              }
            },
          }),
          React.createElement('button', { type: 'button', className: 'dgw-stagebtn', disabled: busy || !branchName.trim(), onClick: confirmBranch, title: `${BRANCH_ACTION_VERBS[branchAction]} this branch`, style: { width: 'auto', padding: '0 12px', flex: 'none' } }, BRANCH_ACTION_VERBS[branchAction]),
          React.createElement('button', { type: 'button', className: 'dgw-stagebtn', disabled: busy, onClick: () => setBranchAction(null), style: { width: 'auto', padding: '0 10px', flex: 'none' } }, 'Cancel'),
        )
      : null,
  )
}

function ChangesBody({ data, onDispatch }) {
  const all = Array.isArray(data.files) ? data.files : []
  const bulk = onDispatch && !data.clean
    ? React.createElement(
        Row,
        { style: { gap: '6px', paddingBottom: '6px', flex: 'none', flexWrap: 'wrap' } },
        React.createElement('button', { type: 'button', className: 'dgw-stagebtn', style: { width: 'auto', padding: '0 10px', flex: 'none' }, title: 'Stage every change', onClick: () => onDispatch(actionCommand('stage-all', '', data)) }, 'Stage all'),
        React.createElement('button', { type: 'button', className: 'dgw-stagebtn', style: { width: 'auto', padding: '0 10px', flex: 'none' }, title: 'Unstage everything', onClick: () => onDispatch(actionCommand('unstage-all', '', data)) }, 'Unstage all'),
      )
    : null
  if (all.length > 0) {
    const tree = buildTree(all)
    return React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column' } },
      bulk,
      React.createElement(TreeNodeRows, { node: tree, depth: 0, onDispatch }),
      data.filesTruncated
        ? React.createElement(
            'div',
            { style: { paddingTop: '6px' } },
            React.createElement(Muted, null, `File list truncated — showing the first ${all.length} changed files.`),
          )
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
    { style: { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' } },
    bulk,
    chips.length ? React.createElement(Row, null, chips) : null,
    !data.clean ? React.createElement(Muted, null, 'File list unavailable in this session’s data — refresh to fetch it.') : null,
    data.clean && !chips.length ? React.createElement(Stat, { text: '✓ clean', color: 'var(--dsw-alias-state-success-primary)' }) : null,
  )
}

const GRAPH_LINE = 'var(--dsw-alias-border-l2)'

function CommitGraphRow({ c, i, total, branchName, ahead, upstream }) {
  const isHead = i === 0
  const isLocal = i < ahead
  const isBoundary = Boolean(upstream) && i === ahead
  const isMerge = /^Merge\b/.test(c.message || '')
  const color = isLocal
    ? 'var(--dsw-alias-brand-primary)'
    : upstream
      ? 'var(--dsw-alias-state-warn-primary)'
      : 'var(--dsw-alias-label-caption)'
  const dot = {
    position: 'absolute',
    left: '4px',
    top: '50%',
    marginTop: '-4.5px',
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    boxSizing: 'border-box',
  }
  if (isMerge && !isHead) {
    dot.background = 'transparent'
    dot.border = `2px solid ${color}`
  } else {
    dot.background = color
  }
  if (isHead) dot.boxShadow = `0 0 0 2px var(--dsw-alias-bg-layer-2), 0 0 0 3.5px ${color}`
  return React.createElement(
    'div',
    { className: 'dgw-row', style: { display: 'flex', alignItems: 'stretch', gap: '8px', minHeight: '26px', padding: '0 6px 0 0' } },
    React.createElement(
      'span',
      { style: { position: 'relative', width: '16px', flex: 'none' } },
      i > 0
        ? React.createElement('span', { style: { position: 'absolute', left: '7.5px', top: 0, height: '50%', width: '2px', background: GRAPH_LINE } })
        : null,
      i < total - 1
        ? React.createElement('span', { style: { position: 'absolute', left: '7.5px', top: '50%', bottom: 0, width: '2px', background: GRAPH_LINE } })
        : null,
      React.createElement('span', { style: dot }),
    ),
    React.createElement(
      'div',
      { style: { flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0' } },
      React.createElement(
        'span',
        {
          title: `${c.shortSha} · ${c.author}`,
          style: { fontSize: '12px', color: 'var(--dsw-alias-label-primary)', flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        },
        (c.message || '').split('\n')[0],
      ),
      isHead && branchName ? React.createElement(Pill, { text: branchName, color: 'var(--dsw-alias-brand-primary)' }) : null,
      isBoundary ? React.createElement(Pill, { text: upstream, color: 'var(--dsw-alias-state-warn-primary)' }) : null,
    ),
  )
}

function CommitGraph({ commits, branch }) {
  const ahead = branch && typeof branch.ahead === 'number' ? branch.ahead : 0
  const upstream = branch && branch.upstream ? branch.upstream : null
  const branchName = branch && branch.name ? branch.name : null
  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column' } },
    commits.map((c, i) =>
      React.createElement(CommitGraphRow, {
        key: c.shortSha || i,
        c,
        i,
        total: commits.length,
        branchName,
        ahead,
        upstream,
      }),
    ),
  )
}

function checkLabel(check) {
  const s = checkDotState(check)
  if (s === 'done') return check.conclusion === 'skipped' ? 'Skipped' : 'Successful'
  if (s === 'error') return 'Failed'
  if (s === 'ongoing') return check.status === 'queued' ? 'Queued' : 'In progress'
  return 'Attention'
}

function CheckIcon({ check }) {
  const s = checkDotState(check)
  if (s === 'done')
    return React.createElement(CircleIcon, { tone: 'success', size: 15 }, React.createElement(IconCheckOutline14, { size: 10 }))
  if (s === 'error')
    return React.createElement(CircleIcon, { tone: 'error', size: 15 }, React.createElement(IconCloseFill14, { size: 10 }))
  if (s === 'ongoing')
    return React.createElement(
      'span',
      { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '15px', height: '15px' } },
      React.createElement(Dot, { state: 'ongoing', size: 10 }),
    )
  return React.createElement(CircleIcon, { tone: 'warn', size: 15 }, React.createElement(IconWarningOutline16, { size: 10 }))
}

function CheckRow({ check }) {
  const s = checkDotState(check)
  return React.createElement(
    Row,
    { className: 'dgw-row', style: { gap: '8px', padding: '3px 6px' } },
    React.createElement(
      'span',
      { className: 'dgw-chevron', style: { visibility: 'hidden' } },
      React.createElement(IconChevronRightOutline14, { size: 13 }),
    ),
    React.createElement(CheckIcon, { check }),
    React.createElement(
      'span',
      { title: check.name, style: { fontSize: '12px', color: 'var(--dsw-alias-label-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } },
      check.name,
    ),
    React.createElement(
      'span',
      { style: { fontSize: '11px', color: s === 'error' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)', flex: 'none' } },
      checkLabel(check),
    ),
    check.url
      ? React.createElement(
          'a',
          { href: check.url, target: '_blank', rel: 'noreferrer', className: 'dgw-linkicon', 'aria-label': 'Open check run', title: 'Open check run' },
          React.createElement(IconRightUpOutline16, { size: 13 }),
        )
      : null,
  )
}

function ChecksSection({ ci }) {
  if (!ci || !ci.checks || ci.checks.length === 0) return null
  const checks = ci.checks
  let passing = 0
  let failing = 0
  let running = 0
  for (const c of checks) {
    const s = checkDotState(c)
    if (s === 'done') passing++
    else if (s === 'error') failing++
    else if (s === 'ongoing') running++
    else failing++
  }
  const summary = failing > 0 ? `${failing} failing` : running > 0 ? `${running} in progress` : `${passing} passing`
  const icon =
    failing > 0
      ? React.createElement(CircleIcon, { tone: 'error', size: 15 }, React.createElement(IconCloseFill14, { size: 10 }))
      : running > 0
        ? React.createElement(Dot, { state: 'ongoing', size: 10 })
        : React.createElement(CircleIcon, { tone: 'success', size: 15 }, React.createElement(IconCheckOutline14, { size: 10 }))
  return React.createElement(
    Section,
    { icon, title: summary, plain: true, defaultOpen: true },
    checks.slice(0, 15).map((c, i) => React.createElement(CheckRow, { key: `${c.name}:${i}`, check: c })),
    checks.length > 15
      ? React.createElement('div', { key: 'more', style: { padding: '2px 6px' } }, React.createElement(Muted, null, `+${checks.length - 15} more`))
      : null,
  )
}

function CommentItem({ comment, dimmed }) {
  return React.createElement(
    'div',
    { style: { padding: '7px 0', borderTop: '1px solid var(--dsw-alias-border-l1)', opacity: dimmed ? 0.6 : 1 } },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' } },
      React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, comment.author || 'anonymous'),
      comment.createdAt ? React.createElement(Muted, null, String(comment.createdAt).slice(0, 10)) : null,
      comment.resolved ? React.createElement(TintPill, { text: 'Resolved', color: 'var(--dsw-alias-label-secondary)' }) : null,
      React.createElement('span', { style: { flex: '1 1 auto' } }),
      comment.url
        ? React.createElement(
            'a',
            { href: comment.url, target: '_blank', rel: 'noreferrer', className: 'dgw-linkicon', 'aria-label': 'Open on GitHub', title: 'Open on GitHub' },
            React.createElement(IconRightUpOutline16, { size: 13 }),
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
          fontSize: '11.5px',
          lineHeight: '16px',
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

function CommentsSection({ pr, comments, onDispatch, canComment }) {
  const unresolved = comments.filter((c) => !c.resolved)
  const resolved = comments.filter((c) => c.resolved)
  return React.createElement(
    Section,
    {
      title: 'Comments',
      count: comments.length || null,
      defaultOpen: true,
      right: React.createElement(
        'a',
        { href: pr.url, target: '_blank', rel: 'noreferrer', className: 'dgw-linkicon', 'aria-label': 'Comment on GitHub', title: 'Comment on GitHub' },
        React.createElement(IconPlusOutline16, { size: 14 }),
      ),
    },
    comments.length === 0 ? React.createElement(Muted, null, 'No comments yet.') : null,
    unresolved.map((c) => React.createElement(CommentItem, { key: c.id, comment: c })),
    resolved.map((c) => React.createElement(CommentItem, { key: c.id, comment: c, dimmed: true })),
    onDispatch ? React.createElement(CommentComposer, { pr, disabled: !canComment, onDispatch }) : null,
  )
}

const MERGE_METHODS = [['merge', 'Merge'], ['squash', 'Squash'], ['rebase', 'Rebase']]

function MergeReviewControls({ pr, state, onDispatch }) {
  const open = state === 'OPEN' && pr.merged !== true
  const [method, setMethod] = React.useState('squash')
  const [delBranch, setDelBranch] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const act = (action) => {
    if (busy || !open || !onDispatch) return
    setBusy(true)
    Promise.resolve(onDispatch(action)).finally(() => setBusy(false))
  }
  const reviewAction = (reviewState) => ({
    name: 'git-pr-review',
    args: {
      number: pr.number,
      state: reviewState,
      ...(reviewState === 'REQUEST_CHANGES' ? {body: 'Please address the requested changes.'} : {}),
    },
  })
  const mergeLabel =
    method === 'merge' ? 'Merge' : method === 'squash' ? 'Squash and merge' : 'Rebase and merge'
  return React.createElement(
    Section,
    { title: 'Merge & review', defaultOpen: true },
    React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch' } },
      React.createElement(
        'div',
        { role: 'group', 'aria-label': 'Merge method', style: { display: 'flex', flex: 'none' } },
        MERGE_METHODS.map(([id, label]) =>
          React.createElement(
            'button',
            {
              key: id,
              type: 'button',
              disabled: !open,
              'aria-pressed': method === id,
              onClick: () => setMethod(id),
              style: {
                flex: '1 1 0',
                height: '26px',
                border: `1px solid ${method === id ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l1)'}`,
                background: method === id ? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)' : 'transparent',
                color: method === id ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
                fontFamily: 'var(--dsw-font-family)',
                fontSize: '11px',
                fontWeight: method === id ? 600 : 400,
                cursor: open ? 'pointer' : 'default',
              },
            },
            label,
          ),
        ),
      ),
      React.createElement(
        'label',
        { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', cursor: open ? 'pointer' : 'default', flex: 'none' } },
        React.createElement('input', { type: 'checkbox', checked: delBranch, disabled: !open, onChange: (e) => setDelBranch(e.target.checked) }),
        'Delete source branch',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dgw-mergebtn',
          disabled: !open || busy,
          title: 'Merge this pull request with the selected method',
          onClick: () =>
            act({
              name: 'git-pr-merge',
              args: {number: pr.number, method, ...(delBranch ? {deleteBranch: true} : {})},
              next: {name: 'git-refresh', args: {}},
            }),
        },
        React.createElement(IconBranchOutline16, { size: 14 }),
        busy ? 'Working…' : mergeLabel,
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', gap: '6px', flex: 'none' } },
        React.createElement('button', { type: 'button', className: 'dgw-stagebtn', disabled: !open || busy, title: 'Approve this pull request', style: { flex: '1 1 0', width: 'auto' }, onClick: () => act(reviewAction('APPROVE')) }, 'Approve'),
        React.createElement('button', { type: 'button', className: 'dgw-stagebtn', disabled: !open || busy, title: 'Request changes on this pull request', style: { flex: '1 1 0', width: 'auto', color: 'var(--dsw-alias-state-warn-primary)' }, onClick: () => act(reviewAction('REQUEST_CHANGES')) }, 'Request changes'),
      ),
      !open
        ? React.createElement(Muted, null, state === 'MERGED' ? 'Pull request is already merged.' : 'Merging and reviews are available while the pull request is open.')
        : null,
    ),
  )
}

function CommentComposer({ pr, disabled, onDispatch }) {
  const [text, setText] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const submit = () => {
    const body = text.trim()
    if (!body || busy || disabled || !onDispatch) return
    setBusy(true)
    Promise.resolve(
      onDispatch({
        name: 'git-pr-comment',
        args: {number: pr.number, body},
        next: {name: 'git-refresh', args: {}},
      }),
    ).finally(() => {
      setBusy(false)
      setText('')
    })
  }
  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '8px', marginTop: '4px', borderTop: '1px solid var(--dsw-alias-border-l1)' } },
    React.createElement('textarea', {
      className: 'dgw-textarea',
      placeholder: 'Post a comment…',
      rows: 2,
      value: text,
      'aria-label': 'Comment text',
      disabled: disabled || busy,
      onChange: (e) => setText(e.target.value),
      onKeyDown: (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault()
          submit()
        }
      },
    }),
    React.createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'flex-end' } },
      React.createElement('button', { type: 'button', className: 'dgw-stagebtn', disabled: disabled || busy || !text.trim(), onClick: submit, title: 'Post this comment', style: { width: 'auto', padding: '0 14px', flex: 'none' } }, busy ? 'Working…' : 'Comment'),
    ),
  )
}

function PrTab({ data, refreshing, canRefresh, onRefresh, onDispatch, autoSampled }) {
  const pr = data.pullRequest
  if (!pr) {
    const upstream = data.branch && data.branch.upstream
    const target = upstream || (data.comparison && data.comparison.base)
    return React.createElement(
      'div',
      { style: { padding: '12px 2px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start', flex: 'none' } },
      onDispatch
        ? React.createElement(
            'button',
            {
              type: 'button',
              className: 'dgw-createpr',
              title: 'Open a pull request for this branch',
              onClick: () =>
                onDispatch(actionCommand('create-pr', '', data)),
            },
            React.createElement(IconBranchOutline16, { size: 14 }),
            'Create PR',
          )
        : null,
      React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } },
        React.createElement(
          'span',
          { style: { fontSize: '12px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } },
          (data.repository && data.repository.name) || 'Working tree',
        ),
        React.createElement(
          'span',
          { style: { fontFamily: 'var(--dsw-font-family-code)', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          target ? `→ ${target}` : 'no upstream',
        ),
      ),
      refreshing
        ? React.createElement(Muted, null, 'Loading pull request…')
        : autoSampled
          ? null
          : canRefresh !== false && onRefresh
            ? React.createElement(Button, { variant: 'outline', size: 'sm', onClick: onRefresh }, 'Run git_workspace')
            : null,
    )
  }
  const state = (pr.state || 'open').toUpperCase()
  const stateText = pr.draft ? 'DRAFT' : state
  const stateColor = pr.draft
    ? 'var(--dsw-alias-state-warn-primary)'
    : state === 'OPEN'
      ? 'var(--dsw-alias-state-success-primary)'
      : 'var(--dsw-alias-label-secondary)'
  const comments = Array.isArray(pr.comments) ? pr.comments : []
  const additions = typeof data.additionsTotal === 'number' ? data.additionsTotal : 0
  const deletions = typeof data.deletionsTotal === 'number' ? data.deletionsTotal : 0
  const upstream = data.branch && data.branch.upstream
  const pending = typeof data.commitsAhead === 'number' ? data.commitsAhead : (data.branch && data.branch.ahead) || 0
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      { style: { padding: '10px 2px 8px', display: 'flex', flexDirection: 'column', gap: '5px', flex: 'none' } },
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        React.createElement(
          'span',
          { style: { display: 'inline-flex', color: 'var(--dsw-alias-state-success-primary)', flex: 'none' } },
          React.createElement(IconBranchOutline16, { size: 13 }),
        ),
        React.createElement('span', { style: { fontSize: '13px', fontWeight: 700 } }, `#${pr.number}`),
        React.createElement(TintPill, { text: stateText, color: stateColor }),
        React.createElement('span', { style: { flex: '1 1 auto' } }),
        React.createElement(
          'a',
          { href: pr.url, target: '_blank', rel: 'noreferrer', className: 'dgw-linkicon', 'aria-label': 'Open on GitHub', title: 'Open on GitHub' },
          React.createElement(IconRightUpOutline16, { size: 13 }),
        ),
      ),
      React.createElement(
        'div',
        { style: { fontSize: '13px', lineHeight: '18px', color: 'var(--dsw-alias-label-primary)' } },
        pr.title,
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '2px', fontFamily: 'var(--dsw-font-family-code)', fontSize: '11px' } },
        React.createElement('span', { style: { color: 'var(--dsw-alias-state-success-primary)' } }, `+${fmtNum(additions)}`),
        React.createElement('span', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, `-${fmtNum(deletions)}`),
        upstream ? React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, `remote ${upstream}`) : null,
        React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, `${pending} pending commit${pending === 1 ? '' : 's'}`),
      ),
      pr.updatedAt
        ? React.createElement(
            'div',
            { style: { fontSize: '11px', color: 'var(--dsw-alias-label-caption)' } },
            `PR updated ${fmtTime(pr.updatedAt)}`,
          )
        : null,
    ),
    onDispatch
      ? React.createElement(MergeReviewControls, { pr, state, onDispatch })
      : null,
    React.createElement(ChecksSection, { ci: data.ci }),
    React.createElement(CommentsSection, { pr, comments, onDispatch, canComment: state === 'OPEN' && pr.merged !== true }),
  )
}

function ScTab({ data, refreshing, onDispatch, onOpenPr }) {
  const dirty = countDirty(data)
  const ahead = typeof data.commitsAhead === 'number' ? data.commitsAhead : (data.branch && data.branch.ahead) || 0
  const branchCommits = Array.isArray(data.commits) ? data.commits.slice(0, ahead) : []
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(BranchHeader, { data, refreshing, onOpenPr }),
    !data.clean && onDispatch ? React.createElement(CommitBox, { onDispatch, data }) : null,
    React.createElement(
      Section,
      { title: 'Changes', count: dirty || null, defaultOpen: true },
      React.createElement(ChangesBody, { data, onDispatch }),
    ),
    React.createElement(
      Section,
      { title: 'Committed on branch', count: ahead || null, defaultOpen: true },
      branchCommits.length > 0
        ? React.createElement(CommitGraph, { commits: branchCommits, branch: data.branch })
        : React.createElement(Muted, null, ahead > 0 ? 'Commit details are unavailable.' : 'No commits ahead of the upstream branch.'),
    ),
    data.commits && data.commits.length > 0
      ? React.createElement(
          Section,
          { title: 'Commits', count: data.commits.length, defaultOpen: true },
          React.createElement(CommitGraph, { commits: data.commits, branch: data.branch }),
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
        margin: '0 -14px',
        padding: '0 14px',
        background: 'var(--dsw-alias-bg-layer-2)',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
    },
    mk('sc', 'Source Control'),
    mk('pr', 'Pull Request', prHint),
  )
}

export function GitWorkspacePanel({ data, errorText, loading, refreshing, canRefresh, autoSampled, onRefresh, onDispatch, commandsUnsupported }) {
  const [tab, setTab] = React.useState('sc')

  // Fallback-only: when no projection payload exists at all, the PR tab
  // forces one native /git-refresh per repo/branch after a short grace.
  // Once local sampling is proven alive (autoSampled), pullRequest/ci
  // arrive on their own.
  const prAutoRef = React.useRef(null)
  React.useEffect(() => {
    if (autoSampled || tab !== 'pr' || !data || data.pullRequest) return
    if (canRefresh === false || !onRefresh) return
    const repo = (data.repository && data.repository.name) || ''
    const branch = (data.branch && data.branch.name) || ''
    const key = `${repo}:${branch}`
    if (prAutoRef.current === key) return
    const t = setTimeout(() => {
      prAutoRef.current = key
      if (!refreshing) onRefresh()
    }, 2000)
    return () => clearTimeout(t)
  }, [autoSampled, tab, data, refreshing, canRefresh, onRefresh])

  let body
  if (loading) {
    body = React.createElement(Row, { style: { padding: '10px' } }, React.createElement(Muted, null, 'Loading Git workspace…'))
  } else if (!data) {
    body = React.createElement(
      'div',
      { style: { padding: '14px 2px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' } },
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
      commandsUnsupported
        ? React.createElement(
            Row,
            { style: { padding: '6px 8px', marginBottom: '8px', flex: 'none', borderRadius: '6px', background: 'var(--dsw-alias-state-warn-secondary, transparent)', border: '1px solid var(--dsw-alias-border-l1)' } },
            React.createElement(IconWarningOutline16, { size: 14 }),
            React.createElement(Muted, null, COMMANDS_UNSUPPORTED_HINT),
          )
        : null,
      React.createElement(TabBar, { tab, setTab, prHint: data.pullRequest ? (prUnresolved || null) : null }),
      tab === 'pr' ? PrTab({ data, refreshing, canRefresh, onRefresh, onDispatch, autoSampled }) : ScTab({ data, refreshing, onDispatch, onOpenPr: () => setTab('pr') }),
    )
  }

  return React.createElement(
    'div',
    { 'data-git-workspace-panel': '', style: { padding: '0 14px 12px', display: 'flex', flexDirection: 'column' } },
    body,
  )
}

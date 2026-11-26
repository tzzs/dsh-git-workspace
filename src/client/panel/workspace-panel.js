import * as React from 'react'
import {
  Icon,
  IconBranchOutline16,
  IconCheckOutline14,
  IconChevronRightOutline14,
  IconCloseFill14,
  IconCodeOutline16,
  IconFolderOpenOutline16,
  IconPlusOutline16,
  IconRefreshOutline14,
  IconRightUpOutline16,
  IconWarningOutline16,
} from '../icons.js'
import {
  Row,
  Code,
  TintPill,
  CircleIcon,
  Stat,
  Muted,
  Dot,
  IconBtn,
  Section,
  DropdownMenu,
  ConfirmButton,
  Tooltip,
  PathLabel,
  checkDotState,
} from '../components.js'
import { DiffViewer } from './diff-viewer.js'
import { usePanelUi } from './ui-state.js'

const REFRESH_HINT = 'No workspace session available yet.'

const COMMANDS_UNSUPPORTED_HINT =
  'This host has no native command channel — Git write actions are disabled.'

const STATUS_LETTER = {
  modified: { text: 'M', color: 'var(--dgw-warn-strong)' },
  added: { text: 'A', color: 'var(--dgw-success-strong)' },
  deleted: { text: 'D', color: 'var(--dgw-error-strong)' },
  renamed: { text: 'R', color: 'var(--dgw-text-2)' },
  copied: { text: 'C', color: 'var(--dgw-success-strong)' },
  untracked: { text: 'U', color: 'var(--dgw-text-2)' },
}

function StatusChip({ status }) {
  const c = STATUS_LETTER[status] || { text: '?', color: 'var(--dgw-text-2)' }
  return React.createElement(
    'span',
    {
      className: 'dgw-statuschip',
      style: { color: c.color },
      title: status,
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

function fmtDate(s) {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return String(s)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

function repoWebUrl(remote) {
  if (!remote) return null
  if (remote.startsWith('http')) return remote.replace(/\.git$/, '')
  const m = remote.match(/^git@([^:]+):(.+)$/)
  return m ? `https://${m[1]}/${m[2].replace(/\.git$/, '')}` : null
}

// Small directional glyph used by branch/upstream rows.
function ArrowIcon({ size = 10 }) {
  return React.createElement(Icon, { name: 'arrowRight', size, style: { transform: 'scale(.72)' } })
}

function SearchIcon({ size = 14 }) {
  return React.createElement(Icon, { name: 'search', size })
}

// A button-shaped control that is safe to nest inside `Section`'s header
// <button> (a real <button> there gets reparented out by the HTML parser).
function IconActionBtn({ title, onClick, tone, elRef, children }) {
  return React.createElement(
    'span',
    {
      ref: elRef,
      role: 'button',
      tabIndex: 0,
      className: 'dgw-linkicon',
      title,
      'aria-label': title,
      style: { cursor: 'pointer', color: tone },
      onClick: (e) => {
        e.stopPropagation()
        onClick()
      },
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onClick()
        }
      },
    },
    children,
  )
}

function prStateColor(pr) {
  if (!pr) return 'var(--dgw-text-2)'
  if (pr.draft) return 'var(--dgw-warn-strong)'
  if (pr.merged) return 'var(--dgw-text-2)'
  const s = String(pr.state || '').toLowerCase()
  if (s === 'open') return 'var(--dgw-success-strong)'
  if (s === 'closed') return 'var(--dgw-error-strong)'
  return 'var(--dgw-text-2)'
}

function prStateLabel(pr) {
  if (pr.draft) return 'DRAFT'
  if (pr.merged) return 'MERGED'
  return String(pr.state || 'open').toUpperCase()
}

function FileStats({ additions, deletions }) {
  if (!additions && !deletions) return null
  return React.createElement(
    'span',
    { className: 'dgw-stats', 'aria-label': `${additions || 0} additions, ${deletions || 0} deletions` },
    React.createElement('span', { className: 'dgw-stats__add' }, `+${fmtNum(additions || 0)}`),
    React.createElement('span', { className: 'dgw-stats__del' }, `-${fmtNum(deletions || 0)}`),
  )
}

function buildTree(files) {
  const root = { path: '', dirs: new Map(), files: [] }
  for (const f of files) {
    // `git status` reports a directory that's untracked *in full* as one
    // entry ending in "/" (e.g. ".claude/") rather than listing its
    // contents — splitting that as-is leaves a trailing empty segment,
    // which rendered as a file row with no name. Strip it so the path is
    // treated as one opaque leaf (staging it stages the whole directory,
    // same as `git add .claude/` would).
    const path = f.path.endsWith('/') ? f.path.slice(0, -1) : f.path
    const segs = path.split('/')
    let node = root
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i]
      if (!node.dirs.has(seg)) {
        node.dirs.set(seg, {
          name: seg,
          path: segs.slice(0, i + 1).join('/'),
          dirs: new Map(),
          files: [],
        })
      }
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

function collectDirFiles(dir, out) {
  out = out || []
  for (const f of dir.files) out.push(f)
  for (const d of dir.dirs.values()) collectDirFiles(d, out)
  return out
}

// Merge a chain of directories that each hold nothing but a single
// child directory into one row (e.g. "client" + "panel" -> "client/panel"),
// mirroring VS Code/GitLens folder compaction.
function compactDir(dir) {
  while (dir.files.length === 0 && dir.dirs.size === 1) {
    const child = dir.dirs.values().next().value
    dir.name = `${dir.name}/${child.name}`
    dir.path = child.path
    dir.dirs = child.dirs
    dir.files = child.files
  }
  for (const child of dir.dirs.values()) compactDir(child)
}

function DirNode({ dir, depth, open, onToggle, treeProps }) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      // A real `<button>` can't nest another real `<button>` (the hover
      // stage/unstage control below) without breaking click handling and
      // a11y semantics, so this row — like FileTreeRow's clickable variant —
      // is a `role="button"` div instead.
      'div',
      {
        role: 'button',
        tabIndex: 0,
        className: 'dgw-row dgw-dirbtn',
        onClick: onToggle,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        },
        'aria-expanded': open,
        style: { '--dgw-depth': depth },
      },
      React.createElement(
        'span',
        { className: 'dgw-chevron', 'data-open': String(open) },
        React.createElement(IconChevronRightOutline14, { size: 14 }),
      ),
      React.createElement(
        'span',
        { style: { display: 'inline-flex', color: 'var(--dgw-text-3)', flex: 'none' } },
        React.createElement(IconFolderOpenOutline16, { size: 14 }),
      ),
      React.createElement(
        'span',
        { className: 'dgw-treelabel' },
        dir.name,
      ),
      React.createElement('span', { className: 'dgw-treecount' }, String(treeSize(dir))),
      React.createElement('span', { className: 'dgw-spacer' }),
      treeProps.onDispatch ? stageDiscardActions(collectDirFiles(dir), treeProps.onDispatch, DIR_STAGE_LABELS) : null,
    ),
    open ? React.createElement(TreeNodeRows, { node: dir, depth: depth + 1, treeProps }) : null,
  )
}

function filterFiles(files, search) {
  const q = (search || '').trim().toLowerCase()
  if (!q) return files
  return files.filter((f) => f.path.toLowerCase().includes(q))
}

// Shared by the "Changes" tree and the read-only "Committed on branch"
// tree — pass `onDispatch: null` for the latter to hide stage controls.
// `onOpenDiff(file, onDispatch)` opens the shared diff modal (see ScTab);
// `activePath` is the path currently shown there, used to highlight the row.
function FileTree({ files, group = 'changes', onDispatch, viewMode = 'tree', selectedKey, onSelect, dirOpen, onToggleDir, diffMode, onDiffMode, onHunkAction, onCloseDiff }) {
  if (files.length === 0) return null
  const treeProps = { group, onDispatch, selectedKey, onSelect, dirOpen, onToggleDir, diffMode, onDiffMode, onHunkAction, onCloseDiff }
  if (viewMode === 'list') {
    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
    return React.createElement(
      'div',
      { className: 'dgw-tree' },
      sorted.map((f) =>
        React.createElement(FileTreeRow, {
          key: fileKey(group, f),
          file: { ...f, name: f.path },
          depth: 0,
          treeProps,
        }),
      ),
    )
  }
  const tree = buildTree(files)
  for (const child of tree.dirs.values()) compactDir(child)
  return React.createElement(
    'div',
    { className: 'dgw-tree' },
    React.createElement(TreeNodeRows, { node: tree, depth: 0, treeProps }),
  )
}

function ViewModeToggle({ mode, onChange }) {
  const btn = (id, label, icon) =>
    React.createElement(
      'span',
      {
        key: id,
        role: 'button',
        tabIndex: 0,
        'aria-pressed': mode === id,
        title: `${label} view`,
        'data-active': String(mode === id),
        className: 'dgw-segmented__btn',
        onClick: (e) => {
          e.stopPropagation()
          onChange(id)
        },
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            onChange(id)
          }
        },
      },
      React.createElement(Icon, { name: icon, size: 14 }),
      React.createElement('span', { className: 'dgw-segmented__label' }, label),
    )
  return React.createElement(
    'span',
    { className: 'dgw-segmented', role: 'group', 'aria-label': 'File view mode' },
    btn('tree', 'Tree', 'tree'),
    btn('list', 'List', 'list'),
  )
}

// A "…" overflow menu for the Graph section: lets a commit's expanded file
// list render grouped by directory (Tree) or flat (List). Menu items use
// A generic `.dgw-actionmenu` row: an optional trailing checkmark for the
// active choice in a picker (e.g. GraphViewMenu), or a plain/`color`-tinted
// action (e.g. the merge split-button's method choices and its destructive
// Close PR entry). `<span role="button">`, not `<button>` — some callers
// (GraphViewMenu) mount this inside Section's own header `<button>`, and a
// nested real `<button>` gets reparented out by the HTML parser (see
// IconActionBtn above); every caller uses the same element for consistency.
function MenuItem({ label, active, color, onClick }) {
  return React.createElement(
    'span',
    {
      role: 'button',
      tabIndex: 0,
      className: 'dgw-action',
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', cursor: 'pointer', ...(color ? { color } : {}) },
      onClick: (e) => {
        if (e) e.stopPropagation()
        onClick()
      },
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onClick()
        }
      },
    },
    React.createElement('span', null, label),
    active ? React.createElement(IconCheckOutline14, { size: 12 }) : null,
  )
}

// Was two always-both-visible "View as Tree" / "View as List" rows (plus a
// separate icon button elsewhere for refresh); the reference design is one
// toggle row that reads as the *other* mode (what clicking it switches to)
// plus refresh folded into the same menu, so this now takes onRefresh too
// and the Graph section header no longer renders its own refresh icon.
function GraphViewMenu({ mode, onChange, onRefresh, refreshing }) {
  const [open, setOpen] = React.useState(false)
  const anchorRef = React.useRef(null)
  const close = () => setOpen(false)
  const otherMode = mode === 'tree' ? 'list' : 'tree'
  return React.createElement(
    'span',
    { style: { display: 'inline-flex' } },
    React.createElement(
      IconActionBtn,
      { title: 'Commit file view options', onClick: () => setOpen((v) => !v), elRef: anchorRef },
      React.createElement(IconChevronRightOutline14, { size: 13, style: { transform: 'rotate(90deg)' } }),
    ),
    open
      ? React.createElement(
          DropdownMenu,
          {
            anchorRef,
            onClose: close,
            // `.dgw-actionmenu`'s own width (240px, sized for the longer Git
            // action labels) is both too wide and, combined with its
            // overflow-y:auto implicitly making overflow-x:auto too (a CSS
            // rule when only one axis is non-visible), any *narrower* fixed
            // guess risks clipping this menu's own text with a scrollbar.
            // Size to content instead, with a sane min/max.
            style: { width: 'max-content', minWidth: '150px', maxWidth: '220px', whiteSpace: 'nowrap', boxSizing: 'border-box' },
          },
          React.createElement(MenuItem, {
            label: otherMode === 'list' ? 'View as List' : 'View as Tree',
            onClick: () => {
              onChange(otherMode)
              close()
            },
          }),
          onRefresh
            ? React.createElement(MenuItem, {
                label: refreshing ? 'Refreshing…' : 'Refresh branch compare',
                onClick: () => {
                  onRefresh()
                  close()
                },
              })
            : null,
        )
      : null,
  )
}

function TreeNodeRows({ node, depth, treeProps }) {
  const rows = []
  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name))
  for (const dir of dirs) {
    const key = `${treeProps.group}:${dir.path}`
    const open = !treeProps.dirOpen || treeProps.dirOpen[key] !== false
    rows.push(
      React.createElement(DirNode, {
        key: 'd/' + dir.path,
        dir,
        depth,
        open,
        onToggle: () => treeProps.onToggleDir && treeProps.onToggleDir(key, !open),
        treeProps,
      }),
    )
  }
  for (const f of files) {
    rows.push(React.createElement(FileTreeRow, { key: fileKey(treeProps.group, f), file: f, depth, treeProps }))
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

const refreshAction = () => ({ name: 'git-refresh', args: {} })

function fileSide(group, file) {
  if (group === 'untracked' || file.status === 'untracked') return 'untracked'
  return file.staged ? 'staged' : 'unstaged'
}

function fileKey(group, file) {
  return `${group}:${fileSide(group, file)}:${file.path}`
}

function hoverActionBtn(label, onClick, Icon) {
  return React.createElement(
    'span',
    { className: 'dgw-copy', onClick: (e) => e.stopPropagation(), style: { display: 'inline-flex', flex: 'none' } },
    React.createElement(IconBtn, { label, onClick }, React.createElement(Icon, { size: 13 })),
  )
}

function hoverConfirmBtn(label, confirmLabel, onConfirm, Icon) {
  return React.createElement(
    'span',
    { className: 'dgw-copy', onClick: (e) => e.stopPropagation(), style: { display: 'inline-flex', flex: 'none' } },
    React.createElement(
      Tooltip,
      { label, side: 'bottom', delayMs: 250 },
      React.createElement(
        ConfirmButton,
        {
          className: 'dgw-iconbtn',
          label,
          confirmLabel,
          onConfirm,
          confirmChildren: React.createElement(
            'span',
            { style: { fontSize: 'var(--dgw-font-sm)', fontWeight: 700, color: 'var(--dgw-error)' } },
            '!',
          ),
        },
        React.createElement(Icon, { size: 13 }),
      ),
    ),
  )
}

function stageDiscardActions(files, onDispatch, labels) {
  if (!onDispatch || files.length === 0) return null
  const paths = files.map((f) => f.path)
  if (files.every((f) => f.staged === true)) {
    return hoverActionBtn(
      labels.unstage,
      () => onDispatch({ name: 'git-unstage', args: { paths }, next: refreshAction() }),
      IconCheckOutline14,
    )
  }
  return React.createElement(
    React.Fragment,
    null,
    hoverConfirmBtn(
      labels.discard,
      `Confirm ${labels.discard.toLowerCase()}`,
      () => onDispatch({ name: 'git-discard-paths', args: { paths }, next: refreshAction() }),
      IconRefreshOutline14,
    ),
    hoverActionBtn(
      labels.stage,
      () => onDispatch({ name: 'git-stage', args: { paths }, next: refreshAction() }),
      IconPlusOutline16,
    ),
  )
}

const FILE_STAGE_LABELS = { discard: 'Discard changes to this file', stage: 'Stage this file', unstage: 'Unstage this file' }
const DIR_STAGE_LABELS = { discard: 'Discard folder', stage: 'Stage folder', unstage: 'Unstage folder' }

function fileIconColor(status) {
  return (STATUS_LETTER[status] && STATUS_LETTER[status].color) || 'var(--dgw-text-3)'
}

// File rows have no chevron: clicking a patch-backed row opens its diff
// inline under the row instead of expanding a folder. DIR_ICON_INSET is
// DirNode's own chevron(12) + gap(5), so a file's icon lands under a sibling
// folder's icon at the same tree depth.
const DIR_ICON_INSET = 17
function FileTreeRow({ file, depth, treeProps }) {
  const { group, onDispatch, selectedKey, onSelect, diffMode, onDiffMode, onHunkAction, onCloseDiff } = treeProps
  const key = fileKey(group, file)
  const clickable = hasPatch(file) && typeof onSelect === 'function'
  const isActive = clickable && selectedKey === key
  const rowStyle = { '--dgw-depth': depth }
  const rowChildren = [
    React.createElement(
      'span',
      { key: 'icon', className: 'dgw-fileicon', style: { color: fileIconColor(file.status) } },
      React.createElement(IconCodeOutline16, { size: 14 }),
    ),
    React.createElement(
      'span',
      { key: 'name', className: 'dgw-treelabel', title: file.path },
      file.name.includes('/') ? React.createElement(PathLabel, { path: file.name }) : file.name,
    ),
    React.createElement(FileStats, { key: 'stats', additions: file.additions, deletions: file.deletions }),
    React.createElement(StatusChip, { key: 'status', status: file.status }),
    React.createElement('span', { key: 'stage-actions' }, stageDiscardActions([file], onDispatch, FILE_STAGE_LABELS)),
  ]
  let row
  if (!clickable) {
    row = React.createElement('div', { className: 'dgw-row dgw-filebtn dgw-static', style: rowStyle }, ...rowChildren)
  } else {
    const open = () => onSelect(key)
    row = React.createElement(
      'div',
      {
        className: 'dgw-row dgw-filebtn',
        role: 'button',
        tabIndex: 0,
        title: `View diff of ${file.path}`,
        onClick: open,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            open()
          }
        },
        'aria-pressed': isActive,
        'data-active': String(isActive),
        style: rowStyle,
      },
      ...rowChildren,
    )
  }
  if (!isActive) return row
  return React.createElement(
    React.Fragment,
    null,
    row,
    React.createElement(
      'div',
      { className: 'dgw-inline-diff' },
      React.createElement(DiffViewer, {
        file,
        inline: true,
        mode: diffMode,
        onModeChange: onDiffMode,
        onHunkAction,
        onAskFull: onDispatch ? () => onDispatch({ name: 'git-diff', args: { path: file.path } }) : null,
        onClose: onCloseDiff || (() => onSelect(null)),
      }),
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

function BranchHeader({ data, refreshing, onOpenPr, searchOpen, onToggleSearch, search, onSearchChange }) {
  const branch = data.branch || {}
  const pr = data.pullRequest
  const totalA = typeof data.additionsTotal === 'number' ? data.additionsTotal : null
  const totalD = typeof data.deletionsTotal === 'number' ? data.deletionsTotal : null
  const link = (pr && pr.url) || repoWebUrl(data.repository && data.repository.remote)
  const compareTarget = (data.comparison && data.comparison.base) || branch.upstream || null
  return React.createElement(
    'div',
    { style: { padding: '10px 2px 8px', display: 'flex', flexDirection: 'column', gap: '1px', flex: 'none' } },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '8px', minHeight: '18px' } },
      pr
        ? React.createElement(
            'a',
            {
              href: '#pr',
              onClick: (e) => { e.preventDefault(); onOpenPr && onOpenPr() },
              className: 'dgw-link',
              style: { display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--dgw-text)', minWidth: 0 },
            },
            React.createElement(
              'span',
              { style: { display: 'inline-flex', color: prStateColor(pr), flex: 'none' }, title: prStateLabel(pr) },
              React.createElement(IconBranchOutline16, { size: 12 }),
            ),
            React.createElement('span', { style: { fontSize: 'var(--dgw-font-sm)', fontWeight: 600 } }, `PR #${pr.number}`),
          )
        : null,
      React.createElement('span', { style: { flex: '1 1 auto' } }),
      onToggleSearch
        ? React.createElement(
            IconActionBtn,
            { title: searchOpen ? 'Close search' : 'Search files', onClick: onToggleSearch, tone: searchOpen ? 'var(--dgw-accent)' : undefined },
            React.createElement(SearchIcon, { size: 13 }),
          )
        : null,
    ),
    searchOpen
      ? React.createElement('div', { style: { padding: '4px 0 2px' } },
          React.createElement('input', {
            className: 'dgw-textarea',
            style: { minHeight: '26px', height: '26px', width: '100%' },
            placeholder: 'Search files by name…',
            'aria-label': 'Search files by name',
            autoFocus: true,
            value: search || '',
            onChange: (e) => onSearchChange && onSearchChange(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Escape') { e.preventDefault(); onToggleSearch && onToggleSearch() } },
          }),
        )
      : null,
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '8px', minHeight: '18px' } },
      React.createElement(Code, { style: { fontSize: 'var(--dgw-font-lg)', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, branch.name || 'detached'),
      branch.upstream
        ? React.createElement(
            'span',
            { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 'var(--dgw-font-sm)', color: 'var(--dgw-text-3)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            React.createElement(ArrowIcon, { size: 9 }),
            branch.upstream,
          )
        : null,
      React.createElement('span', { style: { flex: '1 1 auto' } }),
      totalA != null && (totalA > 0 || totalD > 0)
        ? React.createElement(
            'span',
            { style: { display: 'inline-flex', gap: '6px', flex: 'none', fontFamily: 'var(--dsw-font-family-code)', fontSize: 'var(--dgw-font-sm)' } },
            React.createElement('span', { style: { color: 'var(--dgw-success)' } }, `+${fmtNum(totalA)}`),
            React.createElement('span', { style: { color: 'var(--dgw-error)' } }, `-${fmtNum(totalD)}`),
          )
        : null,
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '8px', minHeight: '18px' } },
      compareTarget
        ? React.createElement(
            'span',
            { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 'var(--dgw-font-sm)', color: 'var(--dgw-text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            React.createElement(ArrowIcon, { size: 9 }),
            compareTarget,
          )
        : React.createElement('span', { style: { fontSize: 'var(--dgw-font-sm)', color: 'var(--dgw-text-2)' } }, 'no upstream'),
      React.createElement('span', { style: { flex: '1 1 auto' } }),
      branch.ahead > 0
        ? React.createElement('span', { style: { fontFamily: 'var(--dsw-font-family-code)', fontSize: 'var(--dgw-font-sm)', color: 'var(--dgw-text-2)', flex: 'none' } }, `↑${branch.ahead}`)
        : null,
      branch.behind > 0
        ? React.createElement('span', { style: { fontFamily: 'var(--dsw-font-family-code)', fontSize: 'var(--dgw-font-sm)', color: 'var(--dgw-text-2)', flex: 'none' } }, `↓${branch.behind}`)
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
  const commits = Array.isArray(data.commits)
    ? data.commits
    : Array.isArray(data.commits && data.commits.recent)
      ? data.commits.recent
      : []
  const firstCommit = commits.length > 0 ? String(commits[0].message || '').split('\n')[0].trim() : ''
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
        next: {name: 'git-refresh', args: {}},
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

function stagedCount(data) {
  const files = Array.isArray(data.files) ? data.files : []
  if (files.length > 0) return files.filter((f) => f.staged === true && f.status !== 'untracked').length
  return (data.changes && data.changes.staged) || 0
}

function StatusBar({ data, onDispatch, refreshing }) {
  const branch = data.branch || {}
  const dirty = countDirty(data)
  const [busy, setBusy] = React.useState(null)
  const sync = (name) => {
    if (!onDispatch || busy) return
    setBusy(name)
    Promise.resolve(onDispatch({ name, args: {}, next: refreshAction() })).finally(() => setBusy(null))
  }
  const syncBtn = (name, label, icon, title, disabled) =>
    React.createElement(
      Tooltip,
      { label: title, side: 'bottom', delayMs: 250 },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dgw-syncbtn',
          disabled: disabled || busy !== null,
          'aria-label': title,
          onClick: () => sync(name),
        },
        busy === name
          ? React.createElement('progress', { className: 'dgw-spinner', 'aria-label': `${label} in progress` })
          : React.createElement(Icon, { name: icon, size: 14 }),
        React.createElement('span', { className: 'dgw-syncbtn__label' }, label),
      ),
    )
  return React.createElement(
    'div',
    { className: 'dgw-statusbar' },
    React.createElement(
      'div',
      { className: 'dgw-statusbar__row' },
      React.createElement(
        'span',
        { className: 'dgw-statusbar__branch' },
        React.createElement(Icon, { name: 'branch', size: 14, style: { color: 'var(--dgw-text-3)' } }),
        React.createElement('span', { className: 'dgw-statusbar__name', title: branch.name || 'detached' }, branch.name || 'detached'),
        branch.upstream
          ? React.createElement(
              'span',
              { className: 'dgw-statusbar__upstream', title: `Tracks ${branch.upstream}` },
              React.createElement(ArrowIcon, { size: 10 }),
              branch.upstream,
            )
          : null,
        branch.ahead > 0 || branch.behind > 0
          ? React.createElement(
              'span',
              { className: 'dgw-statusbar__counts' },
              branch.ahead > 0 ? React.createElement('span', { title: `${branch.ahead} commit(s) ahead` }, `↑${branch.ahead}`) : null,
              branch.behind > 0 ? React.createElement('span', { title: `${branch.behind} commit(s) behind` }, `↓${branch.behind}`) : null,
            )
          : null,
      ),
      onDispatch
        ? React.createElement(
            'span',
            { className: 'dgw-sync', role: 'group', 'aria-label': 'Remote sync actions' },
            syncBtn('git-fetch', 'Fetch', 'refresh', 'Fetch from remote', false),
            syncBtn('git-pull', 'Pull', 'arrowDown', 'Pull (fast-forward only)', !branch.upstream),
            syncBtn('git-push', 'Push', 'cloudUpload', branch.upstream ? 'Push to remote' : 'Publish this branch to origin', false),
          )
        : null,
    ),
    React.createElement(
      'div',
      { className: 'dgw-statusbar__row' },
      React.createElement(
        'span',
        { className: 'dgw-statusbar__state' },
        React.createElement(Dot, { state: data.clean ? 'done' : 'warning', size: 7 }),
        data.clean ? 'Working tree clean' : `${dirty} change${dirty === 1 ? '' : 's'}`,
        refreshing
          ? React.createElement('progress', { className: 'dgw-spinner', 'aria-label': 'Refreshing workspace' })
          : null,
      ),
      React.createElement('span', { className: 'dgw-spacer' }),
      data.repository && repoWebUrl(data.repository.remote)
        ? React.createElement(
            'a',
            { href: repoWebUrl(data.repository.remote), target: '_blank', rel: 'noreferrer', className: 'dgw-linkicon', title: 'Open repository on GitHub', 'aria-label': 'Open repository on GitHub' },
            React.createElement(IconRightUpOutline16, { size: 14 }),
          )
        : null,
    ),
  )
}

function CommitBar({ data, onDispatch, onRefresh, ui, setUi }) {
  const msg = ui.commitDraft || ''
  const setMsg = (value) => setUi({ commitDraft: value })
  const [busy, setBusy] = React.useState(false)
  const [menu, setMenu] = React.useState(false)
  const [branchAction, setBranchAction] = React.useState(null)
  const [branchName, setBranchName] = React.useState('')
  const [success, setSuccess] = React.useState(false)
  const menuAnchorRef = React.useRef(null)
  const successTimer = React.useRef(null)
  const staged = stagedCount(data)
  const canCommit = Boolean(onDispatch) && staged > 0 && Boolean(msg.trim()) && !busy
  const flashSuccess = () => {
    setSuccess(true)
    if (successTimer.current) clearTimeout(successTimer.current)
    successTimer.current = setTimeout(() => setSuccess(false), 2400)
  }
  const after = (action, ok) => {
    if (!ok) return
    if (action === 'commit' || action === 'commit-push' || action === 'commit-sync') {
      setMsg('')
      flashSuccess()
    }
    if (action !== 'create-pr' && onRefresh) onRefresh()
  }
  React.useEffect(
    () => () => {
      if (successTimer.current) clearTimeout(successTimer.current)
    },
    [],
  )
  const commit = () => {
    if (!canCommit) return
    setBusy(true)
    Promise.resolve(onDispatch({ name: 'git-commit', args: { message: msg.trim() } }))
      .then((ok) => after('commit', ok))
      .finally(() => setBusy(false))
  }
  const run = (action, extra) => {
    if (busy || !onDispatch) return
    setBusy(true)
    setMenu(false)
    Promise.resolve(onDispatch(actionCommand(action, msg.trim(), data, extra)))
      .then((ok) => after(action, ok))
      .finally(() => setBusy(false))
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
  const menuItem = (id, label, i) =>
    React.createElement(
      React.Fragment,
      { key: id },
      i === 3 || i === 7 || i === 10 || i === 18 ? React.createElement('div', { className: 'dgw-actionsep' }) : null,
      id === 'force-push' || id === 'discard'
        ? React.createElement(ConfirmButton, {
            className: 'dgw-action',
            label,
            confirmLabel: `Confirm ${label.toLowerCase()}`,
            style: { color: 'var(--dgw-error)', textAlign: 'left' },
            onConfirm: () => run(id),
          })
        : React.createElement(
            'button',
            {
              type: 'button',
              className: 'dgw-action',
              onClick: () => (BRANCH_ACTION_VERBS[id] ? startBranchAction(id) : run(id)),
              disabled: (id === 'create-pr' || id === 'push-before-pr') && Boolean(data.pullRequest),
            },
            label,
          ),
      (id === 'create-pr' || id === 'push-before-pr') && data.pullRequest
        ? React.createElement('div', { className: 'dgw-actionnote' }, 'A pull request already exists')
        : null,
    )
  return React.createElement(
    'div',
    { className: 'dgw-commitbar' },
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
          commit()
        }
      },
    }),
    React.createElement(
      'div',
      { className: 'dgw-commitbar__row' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dgw-stagebtn dgw-primarybtn',
          disabled: !canCommit,
          onClick: commit,
          title: staged === 0 ? 'Stage something first' : !msg.trim() ? 'Write a commit message' : 'Commit staged changes',
          style: { flex: '1 1 auto' },
        },
        React.createElement(Icon, { name: 'gitCommit', size: 16 }),
        busy ? 'Committing…' : staged > 0 ? `Commit ${staged} staged` : 'Commit',
      ),
      React.createElement(
        'button',
        {
          ref: menuAnchorRef,
          type: 'button',
          className: 'dgw-stagebtn',
          'aria-label': 'More Git operations',
          'aria-expanded': menu,
          title: 'More Git operations',
          disabled: busy,
          onClick: () => setMenu((v) => !v),
          style: { width: '34px', flex: 'none', padding: 0 },
        },
        React.createElement(Icon, { name: 'ellipsis', size: 16 }),
      ),
      menu
        ? React.createElement(
            DropdownMenu,
            { anchorRef: menuAnchorRef, onClose: () => setMenu(false), placement: 'top' },
            GIT_ACTIONS.map(([id, label], i) => menuItem(id, label, i)),
          )
        : null,
    ),
    React.createElement(
      'div',
      { className: 'dgw-commitbar__hint', role: 'status', 'aria-live': 'polite' },
      success
        ? React.createElement(
            'span',
            { className: 'dgw-commitbar__success' },
            React.createElement(Icon, { name: 'circleCheck', size: 14 }),
            'Committed',
          )
        : staged > 0
          ? `${staged} staged file${staged === 1 ? '' : 's'}`
          : onDispatch
            ? 'Nothing staged'
            : 'Native commands unavailable',
    ),
    branchAction
      ? React.createElement(
          'div',
          { className: 'dgw-commitbar__row' },
          React.createElement('input', {
            className: 'dgw-textarea dgw-input',
            style: { flex: '1 1 auto' },
            placeholder: branchAction === 'new-branch' ? 'New branch name' : 'Branch name',
            'aria-label': 'Branch name',
            autoFocus: true,
            value: branchName,
            list: branchAction !== 'new-branch' ? 'dgw-known-branches' : undefined,
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
          React.createElement('button', { type: 'button', className: 'dgw-stagebtn', disabled: busy || !branchName.trim(), onClick: confirmBranch, title: `${BRANCH_ACTION_VERBS[branchAction]} this branch`, style: { width: 'auto', flex: 'none' } }, BRANCH_ACTION_VERBS[branchAction]),
          React.createElement('button', { type: 'button', className: 'dgw-stagebtn', disabled: busy, onClick: () => setBranchAction(null), style: { width: 'auto', flex: 'none' } }, 'Cancel'),
        )
      : null,
    branchAction && branchAction !== 'new-branch' && Array.isArray(data.branches)
      ? React.createElement(
          'datalist',
          { id: 'dgw-known-branches' },
          data.branches
            .filter((b) => b && b.name && !b.current)
            .map((b) => React.createElement('option', { key: b.name, value: b.name })),
        )
      : null,
  )
}

function EmptyState({ icon = 'circleCheck', title, hint, action }) {
  return React.createElement(
    'div',
    { className: 'dgw-empty' },
    React.createElement(
      'span',
      { className: 'dgw-empty__icon' },
      React.createElement(Icon, { name: icon, size: 20 }),
    ),
    React.createElement('span', { className: 'dgw-empty__title' }, title),
    hint ? React.createElement('span', { className: 'dgw-empty__hint' }, hint) : null,
    action ? React.createElement('span', { className: 'dgw-empty__action' }, action) : null,
  )
}

function groupChanges(files) {
  const groups = { staged: [], unstaged: [], untracked: [] }
  for (const f of files) {
    if (f.status === 'untracked') groups.untracked.push(f)
    else if (f.staged === true) groups.staged.push(f)
    else groups.unstaged.push(f)
  }
  return groups
}

function ChangeGroup({ id, title, files, open, onToggle, bulk, treeProps, onDispatch, viewMode }) {
  if (files.length === 0) return null
  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column' } },
    React.createElement(
      'div',
      {
        className: 'dgw-grouphd',
        role: 'button',
        tabIndex: 0,
        'aria-expanded': open,
        onClick: onToggle,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        },
      },
      React.createElement(
        'span',
        { className: 'dgw-chevron', 'data-open': String(open) },
        React.createElement(IconChevronRightOutline14, { size: 14 }),
      ),
      React.createElement('span', { className: 'dgw-grouphd__title' }, title),
      React.createElement('span', { className: 'dgw-grouphd__count' }, String(files.length)),
      React.createElement('span', { className: 'dgw-spacer' }),
      bulk
        ? React.createElement(
            'button',
            {
              type: 'button',
              className: 'dgw-minibtn',
              onClick: (e) => {
                e.stopPropagation()
                bulk.onClick()
              },
            },
            bulk.label,
          )
        : null,
    ),
    open
      ? React.createElement(
          'div',
          { className: 'dgw-groupbody' },
          React.createElement(FileTree, { files, group: id, onDispatch, viewMode, ...treeProps }),
        )
      : null,
  )
}

function ChangesView({ data, onDispatch, search, searchOpen, onToggleSearch, viewMode, onViewMode, ui, setUi, treeProps }) {
  const [searchValue, setSearchValue] = React.useState('')
  const all = Array.isArray(data.files) ? data.files : []
  const filtered = filterFiles(all, searchOpen ? searchValue : '')
  const groups = groupChanges(filtered)
  const total = groups.staged.length + groups.unstaged.length + groups.untracked.length
  const groupOpen = (id) => !(ui.groupOpen && ui.groupOpen[id] === false)
  const toggleGroup = (id) =>
    setUi((prev) => ({
      groupOpen: { ...(prev.groupOpen || {}), [id]: !(prev.groupOpen && prev.groupOpen[id] !== false) },
    }))
  const bulkAction = (label, action) =>
    onDispatch
      ? {
          label,
          onClick: () => onDispatch({ ...action, next: refreshAction() }),
        }
      : null
  const header = React.createElement(
    'div',
    { className: 'dgw-changeshead' },
    React.createElement('span', { className: 'dgw-changeshead__title' }, 'Changes'),
    React.createElement('span', { className: 'dgw-changeshead__count' }, String(countDirty(data))),
    React.createElement('span', { className: 'dgw-spacer' }),
    onDispatch && !data.clean
      ? React.createElement(
          React.Fragment,
          null,
          React.createElement('button', { type: 'button', className: 'dgw-minibtn', title: 'Stage every change', onClick: () => onDispatch({ name: 'git-stage', args: { all: true }, next: refreshAction() }) }, 'Stage all'),
          React.createElement('button', { type: 'button', className: 'dgw-minibtn', title: 'Unstage everything', onClick: () => onDispatch({ name: 'git-unstage', args: { all: true }, next: refreshAction() }) }, 'Unstage all'),
        )
      : null,
    React.createElement(
      IconActionBtn,
      { title: searchOpen ? 'Close search' : 'Search files', onClick: onToggleSearch, tone: searchOpen ? 'var(--dgw-accent)' : undefined },
      React.createElement(SearchIcon, { size: 14 }),
    ),
    all.length > 0 ? React.createElement(ViewModeToggle, { mode: viewMode, onChange: onViewMode }) : null,
  )
  const searchBar = searchOpen
    ? React.createElement(
        'div',
        { className: 'dgw-searchbar' },
        React.createElement('input', {
          className: 'dgw-textarea dgw-input',
          placeholder: 'Search files by name…',
          'aria-label': 'Search files by name',
          autoFocus: true,
          value: searchValue,
          onChange: (e) => setSearchValue(e.target.value),
          onKeyDown: (e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onToggleSearch()
            }
          },
        }),
      )
    : null
  const body =
    all.length === 0
      ? data.clean
        ? React.createElement(EmptyState, {
            title: 'Working tree clean',
            hint: 'No changes to stage or commit.',
          })
        : React.createElement(EmptyState, {
            icon: 'warning',
            title: 'File list unavailable',
            hint: 'Refresh the workspace to load the changed files.',
          })
      : total === 0
        ? React.createElement(EmptyState, {
            icon: 'search',
            title: 'No matching files',
            hint: `Nothing matches “${searchValue}”.`,
          })
        : React.createElement(
            React.Fragment,
            null,
            React.createElement(ChangeGroup, {
              id: 'staged',
              title: 'Staged',
              files: groups.staged,
              open: groupOpen('staged'),
              onToggle: () => toggleGroup('staged'),
              bulk: bulkAction('Unstage', { name: 'git-unstage', args: { all: true } }),
              treeProps,
              onDispatch,
              viewMode,
            }),
            React.createElement(ChangeGroup, {
              id: 'unstaged',
              title: 'Unstaged',
              files: groups.unstaged,
              open: groupOpen('unstaged'),
              onToggle: () => toggleGroup('unstaged'),
              bulk: bulkAction('Stage', { name: 'git-stage', args: { all: true } }),
              treeProps,
              onDispatch,
              viewMode,
            }),
            React.createElement(ChangeGroup, {
              id: 'untracked',
              title: 'Untracked',
              files: groups.untracked,
              open: groupOpen('untracked'),
              onToggle: () => toggleGroup('untracked'),
              bulk: bulkAction('Stage', { name: 'git-stage', args: { all: true } }),
              treeProps,
              onDispatch,
              viewMode,
            }),
          )
  return React.createElement(
    'div',
    { className: 'dgw-changes' },
    header,
    searchBar,
    body,
    data.filesTruncated
      ? React.createElement('div', { className: 'dgw-note' }, `File list truncated, showing the first ${all.length} changed files.`)
      : null,
  )
}

const GRAPH_LINE = 'var(--dgw-border-2)'

function CommitGraphRow({ c, i, total, branchName, ahead, upstream, targetBranch, filesViewMode, onDispatch, treeProps }) {
  const isHead = i === 0
  const [open, setOpen] = React.useState(isHead)
  const isLocal = i < ahead
  const isBoundary = Boolean(upstream) && i === ahead
  const isTargetBoundary = Boolean(targetBranch) && i === targetBranch.ahead
  const isMerge = /^Merge\b/.test(c.message || '')
  const color = isLocal
    ? 'var(--dgw-accent)'
    : upstream
      ? 'var(--dgw-warn)'
      : 'var(--dgw-text-3)'
  // HEAD and merge commits render as hollow rings ("graph nodes"); selecting
  // (expanding) a row fills it solid so the selected commit stands out.
  const isRing = isHead || isMerge
  const solid = !isRing || open
  const size = isHead ? 11 : 9
  const dot = {
    position: 'absolute',
    left: isHead ? '3px' : '4px',
    top: '50%',
    marginTop: `${-size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    boxSizing: 'border-box',
  }
  if (solid) {
    dot.background = color
  } else {
    dot.background = 'transparent'
    dot.border = `${isHead ? 2.5 : 2}px solid ${color}`
  }
  const toggle = () => setOpen((v) => !v)
  const meta = [c.author, c.date ? fmtDate(c.date) : null, c.shortSha].filter(Boolean).join(' · ')
  const pills = []
  if (isHead && branchName) pills.push(React.createElement(TintPill, { key: 'head', text: branchName, color: 'var(--dgw-accent)' }))
  if (isBoundary) pills.push(React.createElement(TintPill, { key: 'upstream', text: upstream, color: 'var(--dgw-warn)' }))
  if (isTargetBoundary) pills.push(React.createElement(TintPill, { key: 'target', text: targetBranch.name, color: 'var(--dgw-warn)' }))
  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column' } },
    React.createElement(
      'div',
      {
        className: 'dgw-row',
        role: 'button',
        tabIndex: 0,
        title: 'Toggle commit details',
        'aria-expanded': open,
        onClick: toggle,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        },
        style: {
          display: 'flex',
          alignItems: 'stretch',
          gap: '8px',
          minHeight: '26px',
          padding: '0 6px 0 0',
          cursor: 'pointer',
          ...(open ? { background: 'var(--dgw-hover)' } : {}),
        },
      },
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
            style: { fontSize: 'var(--dgw-font-md)', color: 'var(--dgw-text)', flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          },
          (c.message || '').split('\n')[0],
        ),
        pills.length > 0 ? pills : null,
        pills.length === 0 && c.author
          ? React.createElement(
              'span',
              {
                title: c.author,
                style: {
                  fontSize: 'var(--dgw-font-sm)',
                  color: 'var(--dgw-text-3)',
                  flex: 'none',
                  maxWidth: '92px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
              c.author,
            )
          : null,
      ),
      onDispatch && c.sha
        ? React.createElement(
            'button',
            {
              type: 'button',
              className: 'dgw-linkicon dgw-copy',
              title: 'View this commit’s diff',
              'aria-label': 'View this commit’s diff',
              style: {
                flex: 'none',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                color: 'var(--dgw-text-3)',
                ...(open ? { opacity: 1 } : {}),
              },
              onClick: (e) => {
                if (e) e.stopPropagation()
                onDispatch({ name: 'git-show', args: { sha: c.sha } })
              },
            },
            React.createElement(IconCodeOutline16, { size: 13 }),
          )
        : null,
    ),
    open
      ? React.createElement(
          React.Fragment,
          null,
          meta
            ? React.createElement(
                'div',
                {
                  style: {
                    fontFamily: 'var(--dsw-font-family-code)',
                    fontSize: 'var(--dgw-font-sm)',
                    color: 'var(--dgw-text-3)',
                    padding: '0 6px 4px 24px',
                  },
                },
                meta,
              )
            : null,
          Array.isArray(c.files) && c.files.length > 0
            ? React.createElement(
                'div',
                // 40px lands a depth-0 DirNode's chevron one indent step past
                // the 24px the message and meta lines above use, so the files
                // read as nested under the commit instead of flush with the
                // graph line. (`.dgw-row`'s own -6px hover-bleed margin eats
                // into whatever padding wraps it — see the matching note on
                // Section's body wrapper in components.js — so this must be
                // 6px more than the visual 34px target, not 34px itself.)
                { style: { padding: '0 0 4px', paddingLeft: '40px' } },
                React.createElement(FileTree, { files: c.files, group: 'commit', onDispatch: null, viewMode: filesViewMode, ...treeProps, onHunkAction: null }),
              )
            : null,
        )
      : null,
  )
}

function CommitGraph({ commits, branch, targetBranch, filesViewMode, onDispatch, treeProps }) {
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
        targetBranch,
        filesViewMode,
        onDispatch,
        treeProps,
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

function ciRunId(check) {
  const m = /\/actions\/runs\/(\d+)/.exec(String(check.url || ''))
  return m ? Number(m[1]) : null
}

function ciCheckId(check) {
  const m = /\/actions\/runs\/\d+\/job\/(\d+)/.exec(String(check.url || ''))
  return m ? Number(m[1]) : null
}

// Expanded detail for one check run: Status/Started/Completed, the
// workflow-run and check-run ids parsed out of its GitHub Actions URL, and
// Annotations/Jobs sub-sections. Annotations aren't part of the sampled
// payload (fetching them for every check on every sample would multiply
// GitHub API calls), so — like the row's own "Fetch failure logs" button —
// the button here just dispatches the native command; the result lands as a
// tool card in the conversation rather than rendering inline.
function CheckDetailPanel({ check, onDispatch }) {
  const runId = ciRunId(check)
  const checkId = ciCheckId(check)
  const fieldStyle = { fontSize: 'var(--dgw-font-sm)', color: 'var(--dgw-text-2)' }
  const labelStyle = { fontSize: 'var(--dgw-font-xs)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--dgw-text-3)' }
  return React.createElement(
    'div',
    {
      style: {
        margin: '2px 6px 8px 33px',
        padding: '8px 10px',
        borderRadius: 'var(--dgw-radius-md)',
        background: 'var(--dgw-surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      },
    },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      React.createElement(
        Code,
        { style: { fontSize: 'var(--dgw-font-sm)', flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
        check.name,
      ),
      check.url
        ? React.createElement(
            'a',
            {
              href: check.url,
              target: '_blank',
              rel: 'noreferrer',
              style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 'var(--dgw-font-sm)', color: 'var(--dgw-text-2)', textDecoration: 'none', flex: 'none' },
              onClick: (e) => { if (e) e.stopPropagation() },
            },
            'View full details',
            React.createElement(IconRightUpOutline16, { size: 12 }),
          )
        : null,
    ),
    React.createElement(
      'div',
      { style: { ...fieldStyle, display: 'flex', flexWrap: 'wrap', columnGap: '14px', rowGap: '2px' } },
      React.createElement('span', null, 'Status: ', React.createElement('span', { style: { color: 'var(--dgw-text)' } }, checkLabel(check))),
      check.startedAt ? React.createElement('span', null, `Started ${fmtTime(check.startedAt)}`) : null,
      check.completedAt ? React.createElement('span', null, `Completed ${fmtTime(check.completedAt)}`) : null,
    ),
    runId || checkId
      ? React.createElement(
          'div',
          { style: { ...fieldStyle, fontFamily: 'var(--dsw-font-family-code)', display: 'flex', gap: '16px' } },
          runId ? React.createElement('span', null, `workflow #${runId}`) : null,
          checkId ? React.createElement('span', null, `check #${checkId}`) : null,
        )
      : null,
    React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
      React.createElement('span', { style: labelStyle }, 'Annotations'),
      onDispatch && checkId
        ? React.createElement(
            'button',
            {
              type: 'button',
              className: 'dgw-linkicon',
              style: { width: 'auto', gap: '5px', padding: '0 4px', fontSize: 'var(--dgw-font-sm)', color: 'var(--dgw-text-2)' },
              title: "Fetch this check run's warning/error annotations",
              onClick: (e) => {
                if (e) e.stopPropagation()
                onDispatch({ name: 'git-ci-annotations', args: { checkId } })
              },
            },
            React.createElement(IconWarningOutline16, { size: 12 }),
            'Fetch annotations',
          )
        : React.createElement(Muted, null, 'Not available for this check.'),
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
      React.createElement('span', { style: labelStyle }, 'Jobs'),
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--dgw-font-sm)' } },
        React.createElement(
          'span',
          { style: { color: 'var(--dgw-text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          check.name,
        ),
        React.createElement('span', { style: { color: 'var(--dgw-text-2)', flex: 'none' } }, check.conclusion || check.status || ''),
      ),
    ),
  )
}

function CheckRow({ check, onDispatch }) {
  const [open, setOpen] = React.useState(false)
  const s = checkDotState(check)
  const runId = s === 'error' ? ciRunId(check) : null
  const toggle = () => setOpen((v) => !v)
  return React.createElement(
    'div',
    null,
    React.createElement(
      'div',
      {
        className: 'dgw-row',
        role: 'button',
        tabIndex: 0,
        onClick: toggle,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        },
        style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 6px', cursor: 'pointer' },
      },
      React.createElement(
        'span',
        { className: 'dgw-chevron', 'data-open': String(open) },
        React.createElement(IconChevronRightOutline14, { size: 13 }),
      ),
      React.createElement(CheckIcon, { check }),
      React.createElement(
        'span',
        { title: check.name, style: { fontSize: 'var(--dgw-font-md)', color: 'var(--dgw-text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } },
        check.name,
      ),
      React.createElement(
        'span',
        { style: { fontSize: 'var(--dgw-font-sm)', color: s === 'error' ? 'var(--dgw-error)' : 'var(--dgw-text-2)', flex: 'none' } },
        checkLabel(check),
      ),
      onDispatch && runId
        ? React.createElement(
            'button',
            {
              type: 'button',
              className: 'dgw-linkicon',
              title: 'Fetch failure logs',
              'aria-label': 'Fetch failure logs',
              style: { flex: 'none', border: 'none', background: 'none', cursor: 'pointer', display: 'inline-flex', color: 'var(--dgw-error)' },
              onClick: (e) => {
                if (e) e.stopPropagation()
                onDispatch({ name: 'git-ci-logs', args: { runId } })
              },
            },
            React.createElement(IconCodeOutline16, { size: 13 }),
          )
        : null,
      check.url
        ? React.createElement(
            'a',
            {
              href: check.url,
              target: '_blank',
              rel: 'noreferrer',
              className: 'dgw-linkicon',
              'aria-label': 'Open check run',
              title: 'Open check run',
              onClick: (e) => { if (e) e.stopPropagation() },
            },
            React.createElement(IconRightUpOutline16, { size: 13 }),
          )
        : null,
    ),
    open ? React.createElement(CheckDetailPanel, { check, onDispatch }) : null,
  )
}

function ChecksSection({ ci, onDispatch }) {
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
    checks.slice(0, 15).map((c, i) => React.createElement(CheckRow, { key: `${c.name}:${i}`, check: c, onDispatch })),
    checks.length > 15
      ? React.createElement('div', { key: 'more', style: { padding: '2px 6px' } }, React.createElement(Muted, null, `+${checks.length - 15} more`))
      : null,
  )
}

function CommentItem({ comment, dimmed }) {
  return React.createElement(
    'div',
    { style: { padding: '7px 0', borderTop: '1px solid var(--dgw-border)', opacity: dimmed ? 0.6 : 1 } },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' } },
      React.createElement('span', { style: { fontSize: 'var(--dgw-font-sm)', fontWeight: 600, color: 'var(--dgw-text)' } }, comment.author || 'anonymous'),
      comment.createdAt ? React.createElement(Muted, null, String(comment.createdAt).slice(0, 10)) : null,
      comment.resolved ? React.createElement(TintPill, { text: 'Resolved', color: 'var(--dgw-text-2)' }) : null,
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
          { style: { fontFamily: 'var(--dsw-font-family-code)', fontSize: 'var(--dgw-font-sm)', color: 'var(--dgw-text-3)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          comment.path + (comment.line ? ':' + comment.line : ''),
        )
      : null,
    React.createElement(
      'div',
      {
        title: comment.body,
        style: {
          fontSize: 'var(--dgw-font-sm)',
          lineHeight: '16px',
          color: 'var(--dgw-text-2)',
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

const MERGE_METHODS = [
  ['squash', 'Squash and merge'],
  ['merge', 'Create a merge commit'],
  ['rebase', 'Rebase and merge'],
]

// A prominent, un-sectioned merge CTA (mirroring GitHub's own PR page,
// rather than tucking it inside a collapsible card): a split button whose
// left half merges with the selected method and whose chevron half opens a
// method picker plus a destructive Close PR entry. Approve/Request changes
// and the delete-branch option stay underneath as secondary controls.
function MergeReviewControls({ pr, state, onDispatch }) {
  const open = state === 'OPEN' && pr.merged !== true
  const [method, setMethod] = React.useState('squash')
  const [delBranch, setDelBranch] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const mergeMenuRef = React.useRef(null)
  const act = (action) => {
    if (busy || !open || !onDispatch) return
    setBusy(true)
    setMenuOpen(false)
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
  const mergeLabel = (MERGE_METHODS.find(([id]) => id === method) || [null, 'Merge'])[1]
  const merge = () =>
    act({
      name: 'git-pr-merge',
      args: {number: pr.number, method, ...(delBranch ? {deleteBranch: true} : {})},
      next: {name: 'git-refresh', args: {}},
    })
  const closePr = () =>
    act({
      name: 'git-pr-close',
      args: {number: pr.number},
      next: {name: 'git-refresh', args: {}},
    })
  return React.createElement(
    'div',
    { className: 'dgw-pr__controls' },
    React.createElement(
      'div',
      { className: 'dgw-mergegroup' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dgw-mergebtn',
          disabled: !open || busy,
          title: 'Merge this pull request with the selected method',
          onClick: merge,
        },
        React.createElement(Icon, { name: 'gitCommit', size: 16 }),
        busy ? 'Working…' : mergeLabel,
      ),
      React.createElement(
        'button',
        {
          ref: mergeMenuRef,
          type: 'button',
          className: 'dgw-mergebtn dgw-mergebtn--chev',
          disabled: !open || busy,
          'aria-label': 'Choose merge method, or close this pull request',
          'aria-expanded': menuOpen,
          title: 'Choose merge method, or close this pull request',
          onClick: () => setMenuOpen((v) => !v),
        },
        React.createElement(Icon, { name: 'chevronRight', size: 16, style: { transform: 'rotate(90deg)' } }),
      ),
      menuOpen
        ? React.createElement(
            DropdownMenu,
            { anchorRef: mergeMenuRef, onClose: () => setMenuOpen(false), style: { width: '210px' } },
            MERGE_METHODS.map(([id, label]) =>
              React.createElement(MenuItem, {
                key: id,
                label,
                active: method === id,
                onClick: () => {
                  setMethod(id)
                  setMenuOpen(false)
                },
              }),
            ),
            React.createElement('div', { className: 'dgw-actionsep' }),
            React.createElement(ConfirmButton, {
              className: 'dgw-action',
              label: 'Close pull request',
              confirmLabel: 'Confirm close pull request',
              style: { color: 'var(--dgw-error)', textAlign: 'left' },
              onConfirm: closePr,
            }),
          )
        : null,
    ),
    React.createElement(
      'div',
      { className: 'dgw-pr__actions' },
      React.createElement(
        'label',
        { className: 'dgw-checkbox' },
        React.createElement('input', { type: 'checkbox', checked: delBranch, disabled: !open, onChange: (e) => setDelBranch(e.target.checked) }),
        'Delete source branch',
      ),
      React.createElement(
        'div',
        { className: 'dgw-pr__review' },
        React.createElement('button', { type: 'button', className: 'dgw-stagebtn', disabled: !open || busy, title: 'Approve this pull request', onClick: () => act(reviewAction('APPROVE')) }, 'Approve'),
        React.createElement('button', { type: 'button', className: 'dgw-stagebtn', disabled: !open || busy, title: 'Request changes on this pull request', style: { color: 'var(--dgw-warn)' }, onClick: () => act(reviewAction('REQUEST_CHANGES')) }, 'Request changes'),
      ),
    ),
    !open
      ? React.createElement('div', { className: 'dgw-note' }, state === 'MERGED' ? 'Pull request is already merged.' : 'Merging and reviews are available while the pull request is open.')
      : null,
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
    { style: { display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '8px', marginTop: '4px', borderTop: '1px solid var(--dgw-border)' } },
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

function PrTab({ data, refreshing, onDispatch }) {
  const pr = data.pullRequest
  if (!pr) {
    const upstream = data.branch && data.branch.upstream
    const target = (data.comparison && data.comparison.base) || upstream
    return React.createElement(
      'div',
      { className: 'dgw-pr' },
      React.createElement(EmptyState, {
        icon: 'pullRequest',
        title: 'No pull request yet',
        hint: `${(data.repository && data.repository.name) || 'This branch'}${target ? ` → ${target}` : ''}`,
        action: onDispatch
          ? React.createElement(
              'button',
              {
                type: 'button',
                className: 'dgw-createpr',
                title: 'Open a pull request for this branch',
                onClick: () => onDispatch(actionCommand('create-pr', '', data)),
              },
              React.createElement(Icon, { name: 'gitCommit', size: 16 }),
              'Create PR',
            )
          : null,
      }),
      refreshing ? React.createElement('div', { className: 'dgw-note' }, 'Loading pull request…') : null,
    )
  }
  const state = (pr.state || 'open').toUpperCase()
  const stateText = prStateLabel(pr)
  const stateColor = prStateColor(pr)
  const comments = Array.isArray(pr.comments) ? pr.comments : []
  const additions = typeof data.additionsTotal === 'number' ? data.additionsTotal : 0
  const deletions = typeof data.deletionsTotal === 'number' ? data.deletionsTotal : 0
  const pending = typeof data.commitsAhead === 'number' ? data.commitsAhead : (data.branch && data.branch.ahead) || 0
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      { className: 'dgw-pr__head' },
      React.createElement(
        'div',
        { className: 'dgw-pr__headline' },
        React.createElement(
          'span',
          { className: 'dgw-pr__stateicon', style: { color: stateColor }, title: stateText },
          React.createElement(Icon, { name: pr.merged ? 'circleCheck' : 'pullRequest', size: 16 }),
        ),
        React.createElement('span', { className: 'dgw-pr__number' }, `#${pr.number}`),
        React.createElement(TintPill, { text: stateText, color: stateColor }),
        React.createElement('span', { className: 'dgw-spacer' }),
        React.createElement(
          'a',
          { href: pr.url, target: '_blank', rel: 'noreferrer', className: 'dgw-linkicon', 'aria-label': 'Open on GitHub', title: 'Open on GitHub' },
          React.createElement(IconRightUpOutline16, { size: 14 }),
        ),
      ),
      React.createElement('div', { className: 'dgw-pr__title' }, pr.title),
      React.createElement(
        'div',
        { className: 'dgw-pr__meta' },
        additions || deletions
          ? React.createElement(
              React.Fragment,
              null,
              React.createElement('span', { className: 'dgw-stats__add' }, `+${fmtNum(additions)}`),
              React.createElement('span', { className: 'dgw-stats__del' }, `-${fmtNum(deletions)}`),
            )
          : null,
        pr.base
          ? React.createElement(PathLabel, {
              path: pr.base,
              prefix: `${(data.branch && data.branch.name) || pr.base} → `,
            })
          : null,
        pending > 0
          ? React.createElement('span', { className: 'dgw-pr__pending' }, `${pending} pending commit${pending === 1 ? '' : 's'}`)
          : null,
        onDispatch
          ? React.createElement(
              'button',
              {
                type: 'button',
                className: 'dgw-linkicon',
                title: 'Fetch the full pull request diff',
                'aria-label': 'Fetch the full pull request diff',
                onClick: () => onDispatch({ name: 'git-pr-diff', args: { number: pr.number } }),
              },
              React.createElement(IconCodeOutline16, { size: 14 }),
            )
          : null,
      ),
      pr.updatedAt
        ? React.createElement('div', { className: 'dgw-pr__time' }, `PR updated ${fmtTime(pr.updatedAt)}`)
        : null,
    ),
    onDispatch
      ? React.createElement(MergeReviewControls, { pr, state, onDispatch })
      : null,
    React.createElement(ChecksSection, { ci: data.ci, onDispatch }),
    React.createElement(CommentsSection, { pr, comments, onDispatch, canComment: state === 'OPEN' && pr.merged !== true }),
  )
}

function PrSection({ data, refreshing, onDispatch }) {
  return React.createElement(
    Section,
    {
      key: 'pr',
      title: 'Pull Request',
      defaultOpen: true,
      count: data.pullRequest ? `PR #${data.pullRequest.number}` : null,
    },
    React.createElement(PrTab, { data, refreshing, onDispatch }),
  )
}

function CommittedSection({ data, treeProps }) {
  const cmpBase = data.comparison && data.comparison.base ? data.comparison.base : null
  const cmpAhead = data.comparison && typeof data.comparison.ahead === 'number' ? data.comparison.ahead : 0
  const cmpFiles = Array.isArray(data.comparison && data.comparison.files) ? data.comparison.files : []
  return React.createElement(
    Section,
    { key: 'committed', title: 'Committed on branch', count: cmpFiles.length || null, defaultOpen: false },
    cmpFiles.length > 0
      ? React.createElement(FileTree, { files: cmpFiles, group: 'commit', onDispatch: null, viewMode: 'tree', ...treeProps, onHunkAction: null })
      : React.createElement(
          Muted,
          null,
          cmpBase
            ? cmpAhead > 0
              ? 'Commit details are unavailable.'
              : `No commits ahead of ${cmpBase}.`
            : 'No base branch to compare against.',
        ),
  )
}

function GraphSection({ data, treeProps, commitFilesView, onCommitFilesView, onRefresh, refreshing, canRefresh, onDispatch }) {
  const commits = Array.isArray(data.commits) ? data.commits : []
  if (commits.length === 0) return null
  const prBase = data.pullRequest && data.pullRequest.base ? data.pullRequest.base : null
  const targetBranch =
    prBase && data.comparison && data.comparison.base === prBase && typeof data.comparison.ahead === 'number'
      ? { name: prBase, ahead: data.comparison.ahead }
      : null
  return React.createElement(
    Section,
    {
      key: 'graph',
      title: 'Graph',
      count: commits.length,
      defaultOpen: false,
      right: React.createElement(GraphViewMenu, {
        mode: commitFilesView,
        onChange: onCommitFilesView,
        onRefresh: canRefresh !== false ? onRefresh : null,
        refreshing,
      }),
    },
    React.createElement(CommitGraph, {
      commits,
      branch: data.branch,
      targetBranch,
      filesViewMode: commitFilesView,
      onDispatch,
      treeProps: { ...treeProps, onHunkAction: null },
    }),
  )
}

function LoadingSkeleton() {
  return React.createElement(
    'div',
    { className: 'dgw-loading', 'aria-busy': 'true' },
    React.createElement(
      'div',
      { className: 'dgw-loading__label' },
      React.createElement('progress', { className: 'dgw-spinner', 'aria-label': 'Loading Git workspace' }),
      React.createElement('span', null, 'Loading Git workspace…'),
    ),
    React.createElement(
      'div',
      { className: 'dgw-skeleton', 'aria-hidden': 'true' },
      React.createElement('span', { className: 'dgw-skeleton__bar' }),
      React.createElement('span', { className: 'dgw-skeleton__bar' }),
      React.createElement('span', { className: 'dgw-skeleton__bar' }),
      React.createElement('span', { className: 'dgw-skeleton__bar' }),
      React.createElement('span', { className: 'dgw-skeleton__bar' }),
      React.createElement('span', { className: 'dgw-skeleton__bar' }),
    ),
  )
}

export function GitWorkspacePanel({ data, errorText, loading, refreshing, canRefresh, autoSampled, onRefresh, onDispatch, commandsUnsupported, uiKey }) {
  const scope = uiKey || uiScope(data)
  const [ui, setUi] = usePanelUi(scope)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [commitFilesView, setCommitFilesView] = React.useState('tree')
  const hunkAction = (file, action, hunk) => {
    if (!onDispatch) return
    const name = action === 'stage' ? 'git-stage-hunk' : action === 'unstage' ? 'git-unstage-hunk' : 'git-discard-hunk'
    const side = action === 'unstage' ? 'staged' : 'unstaged'
    return onDispatch({
      name,
      args: { path: file.path, side, hunk, ...(action === 'discard' ? { confirm: true } : {}) },
      next: refreshAction(),
    })
  }
  const treeProps = {
    selectedKey: ui.selectedKey,
    onSelect: (key) => setUi((prev) => ({ selectedKey: prev.selectedKey === key ? null : key })),
    dirOpen: ui.dirOpen,
    onToggleDir: (key, open) => setUi((prev) => ({ dirOpen: { ...(prev.dirOpen || {}), [key]: open } })),
    diffMode: ui.diffMode,
    onDiffMode: (mode) => setUi({ diffMode: mode }),
    onHunkAction: onDispatch ? hunkAction : null,
    onCloseDiff: () => setUi({ selectedKey: null }),
  }

  let body
  if (loading) {
    body = React.createElement(LoadingSkeleton)
  } else if (!data) {
    body = React.createElement(
      'div',
      { className: 'dgw-nodata' },
      React.createElement(EmptyState, {
        icon: 'warning',
        title: 'No workspace data',
        hint: errorText
          ? `Git workspace: ${errorText}`
          : canRefresh === false
            ? REFRESH_HINT
            : 'No workspace data in this session yet.',
        action:
          canRefresh !== false && onRefresh
            ? React.createElement(
                'button',
                { type: 'button', className: 'dgw-stagebtn', onClick: onRefresh, style: { width: 'auto' } },
                React.createElement(IconRefreshOutline14, { size: 14 }),
                'Refresh workspace',
              )
            : null,
      }),
    )
  } else {
    body = React.createElement(
      React.Fragment,
      null,
      commandsUnsupported
        ? React.createElement(
            'div',
            { className: 'dgw-banner', role: 'status' },
            React.createElement(IconWarningOutline16, { size: 16 }),
            React.createElement('span', null, COMMANDS_UNSUPPORTED_HINT),
          )
        : null,
      React.createElement(StatusBar, { data, onDispatch, refreshing }),
      React.createElement(
        'div',
        { className: 'dgw-scroll' },
        React.createElement(ChangesView, {
          data,
          onDispatch,
          searchOpen,
          onToggleSearch: () => setSearchOpen((v) => !v),
          viewMode: ui.treeMode,
          onViewMode: (mode) => setUi({ treeMode: mode }),
          ui,
          setUi,
          treeProps,
        }),
        React.createElement(PrSection, { data, refreshing, onDispatch }),
        React.createElement(CommittedSection, { data, treeProps }),
        React.createElement(GraphSection, {
          data,
          treeProps,
          commitFilesView,
          onCommitFilesView: setCommitFilesView,
          onRefresh,
          refreshing,
          canRefresh,
          onDispatch,
        }),
      ),
      React.createElement(CommitBar, { data, onDispatch, onRefresh, ui, setUi }),
    )
  }

  return React.createElement(
    'div',
    {
      'data-git-workspace-panel': '',
      className: 'dgw-root dgw-panel-shell',
    },
    body,
  )
}

import * as React from 'react'
import { Card, Row, Stat, Muted, Add, Del, Path, CopyBtn } from '../components.js'
import { blockMeta } from '../common.js'

function FileRow({ file, openFile }) {
  const status = (file.status || 'M').toUpperCase()
  return React.createElement(
    Row,
    { className: 'dgw-row' },
    React.createElement(
      'span',
      { style: { width: '16px', flex: 'none', fontFamily: 'var(--dsw-font-family-code)', fontSize: '12px', fontWeight: 600, textAlign: 'center' } },
      status,
    ),
    React.createElement(
      'span',
      { style: { minWidth: 0, flex: '1 1 auto', overflow: 'hidden' } },
      React.createElement(Path, { path: file.path, openFile }),
    ),
    React.createElement(
      'span',
      { style: { display: 'flex', gap: '6px', flex: 'none', marginLeft: 'auto' } },
      file.additions ? React.createElement(Add, null, `+${file.additions}`) : null,
      file.deletions ? React.createElement(Del, null, `-${file.deletions}`) : null,
      file.binary ? React.createElement(Muted, null, 'binary') : null,
      React.createElement(CopyBtn, { text: file.path, label: 'Copy path' }),
    ),
  )
}

export function DiffRow({ block, openFile }) {
  const meta = blockMeta(block)
  const files = (meta && meta.files) || []
  const stats = meta && meta.stats
  const header = React.createElement(
    React.Fragment,
    null,
    React.createElement('span', { style: { fontWeight: 500 } }, 'Diff'),
    stats
      ? React.createElement(
          Stat,
          null,
          `${stats.files} files`,
        )
      : null,
    stats ? React.createElement(Add, null, `+${stats.additions}`) : null,
    stats ? React.createElement(Del, null, `-${stats.deletions}`) : null,
  )
  const body = React.createElement(
    React.Fragment,
    null,
    files.map((f) => React.createElement(FileRow, { key: f.path + f.oldPath, file: f, openFile })),
    files.length === 0 ? React.createElement(Muted, null, 'no diff') : null,
  )
  return React.createElement(Card, { header, children: body })
}

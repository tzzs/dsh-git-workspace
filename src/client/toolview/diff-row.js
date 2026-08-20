import * as React from 'react'
import { Card, Row, Code, Stat, Muted, Add, Del, Path } from '../components.js'
import { blockMeta, firstLine } from '../common.js'

function FileRow({ file, openFile }) {
  const status = (file.status || 'M').toUpperCase()
  return React.createElement(
    Row,
    null,
    React.createElement(
      'span',
      { style: { width: '18px', flex: 'none', fontFamily: 'var(--dsw-font-family-code)', fontSize: '12px', fontWeight: 600 } },
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
          Muted,
          null,
          `${stats.files} files +${stats.additions} -${stats.deletions}`,
        )
      : null,
  )
  const body = React.createElement(
    React.Fragment,
    null,
    files.map((f) => React.createElement(FileRow, { key: f.path + f.oldPath, file: f, openFile })),
    files.length === 0 ? React.createElement(Muted, null, 'no diff') : null,
  )
  return React.createElement(Card, { header, children: body })
}

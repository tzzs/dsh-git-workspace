import * as React from 'react'
import { Card, Text, CopyBtn } from '../components.js'
import { blockText, isSettled, firstLine } from '../common.js'

export function GenericRow({ toolName, block }) {
  const settled = isSettled(block)
  const text = settled ? blockText(block) : ''
  const title = settled ? firstLine(text) || toolName : toolName
  const header = React.createElement(
    React.Fragment,
    null,
    React.createElement('span', { style: { fontWeight: 500 } }, title),
    text ? React.createElement(CopyBtn, { text, label: 'Copy output' }) : null,
  )
  const body = text
    ? React.createElement(
        'pre',
        {
          style: {
            margin: 0,
            fontFamily: 'var(--dsw-font-family-code)',
            fontSize: 'var(--dgw-font-md)',
            lineHeight: '18px',
            color: 'var(--dgw-text-2)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          },
        },
        text,
      )
    : null
  return React.createElement(Card, { header, children: body })
}

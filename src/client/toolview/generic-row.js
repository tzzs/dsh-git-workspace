import * as React from 'react'
import { Card, Text } from '../components.js'
import { blockText, isSettled, firstLine } from '../common.js'

export function GenericRow({ toolName, block }) {
  const settled = isSettled(block)
  const text = settled ? blockText(block) : ''
  const title = settled ? firstLine(text) || toolName : toolName
  const header = React.createElement(
    'span',
    { style: { fontWeight: 500 } },
    title,
  )
  const body = text ? React.createElement(Text, null, text) : null
  return React.createElement(Card, { header, children: body })
}

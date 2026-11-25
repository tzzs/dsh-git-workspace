import * as React from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'

function fallbackIcon(props) {
  const size = (props && props.size) || 12
  return React.createElement('span', { 'aria-hidden': 'true', style: { display: 'inline-block', width: `${size}px`, height: `${size}px` } })
}

function icon(legacy, ...current) {
  for (const name of [legacy, ...current]) {
    if (typeof primitives[name] === 'function') return primitives[name]
  }
  return fallbackIcon
}

export const IconBranchOutline16 = icon('IconBranchOutline16', 'IconBranchOutlineRegular', 'IconBranchOutlineMedium')
export const IconCheckOutline14 = icon('IconCheckOutline14', 'IconCheckOutlineRegular', 'IconCheckOutlineMedium')
export const IconChevronRightOutline14 = icon('IconChevronRightOutline14', 'IconChevronRightOutlineRegular', 'IconChevronRightOutlineMedium')
export const IconCloseFill14 = icon('IconCloseFill14', 'IconCloseFillRegular', 'IconCloseFillMedium')
export const IconCodeOutline16 = icon('IconCodeOutline16', 'IconCodeOutlineRegular', 'IconCodeOutlineMedium')
export const IconCopyOutline16 = icon('IconCopyOutline16', 'IconCopyOutlineRegular', 'IconCopyOutlineMedium')
export const IconFolderOpenOutline16 = icon('IconFolderOpenOutline16', 'IconFolderOpenOutlineRegular', 'IconFolderOpenOutlineMedium')
export const IconPlusOutline16 = icon('IconPlusOutline16', 'IconPlusOutlineRegular', 'IconPlusOutlineMedium')
export const IconRefreshOutline14 = icon('IconRefreshOutline14', 'IconRefreshOutlineRegular', 'IconRefreshOutlineMedium')
export const IconRightUpOutline16 = icon('IconRightUpOutline16', 'IconRightUpOutlineRegular', 'IconRightUpOutlineMedium')
export const IconWarningOutline16 = icon('IconWarningOutline16', 'IconWarningOutlineRegular', 'IconWarningOutlineMedium')

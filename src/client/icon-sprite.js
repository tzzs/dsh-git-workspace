import * as React from 'react'

const PATHS = {
  branch: ['M6 3v12', 'M18 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M18 9a9 9 0 0 1-9 9'],
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  chevronRight: ['m9 18 6-6-6-6'],
  check: ['M20 6 9 17l-5-5'],
  plus: ['M5 12h14', 'M12 5v14'],
  fileCode: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'm10 13-2 2 2 2', 'm14 17 2-2-2-2'],
  folderOpen: ['m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2'],
  externalLink: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
  warning: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  copy: ['M8 8h12v12H8z', 'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.3-4.3'],
  arrowUp: ['m5 12 7-7 7 7', 'M12 19V5'],
  arrowDown: ['M12 5v14', 'm19 12-7 7-7-7'],
  arrowRight: ['M5 12h14', 'm12 5 7 7-7 7'],
  ellipsis: ['M12 12h.01', 'M19 12h.01', 'M5 12h.01'],
  gitCommit: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M3 12h6', 'M15 12h6'],
  cloudUpload: ['M12 13v8', 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242', 'm8 17 4-4 4 4'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  message: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  file: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4'],
  circleCheck: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'm9 11 3 3L22 4'],
  circleAlert: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 8v4', 'M12 16h.01'],
  loader: ['M12 2v4', 'M12 18v4', 'm4.93 4.93 2.83 2.83', 'm16.24 16.24 2.83 2.83', 'M2 12h4', 'M18 12h4', 'm4.93 19.07 2.83-2.83', 'm16.24 7.76 2.83-2.83'],
  pullRequest: ['M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M13 6h3a2 2 0 0 1 2 2v7', 'M6 9v12'],
  arrowDownUp: ['m21 16-4 4-4-4', 'M17 20V4', 'm3 8 4-4 4 4', 'M7 4v16'],
  wrench: ['M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-3.2-3.2 2.3-2.1Z'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  tree: ['M8 3v4', 'M8 11v4', 'M8 19v2', 'M16 7h-4a2 2 0 0 0-2 2v2', 'M16 15h-4a2 2 0 0 1-2-2v-2'],
}

const iconNames = Object.keys(PATHS)

const SPRITE = `<svg data-dgw-icon-sprite aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">${iconNames
  .map(
    (name) =>
      `<symbol id="dgw-ic-${name}" viewBox="0 0 24 24">${PATHS[name].map((d) => `<path d="${d}"/>`).join('')}</symbol>`,
  )
  .join('')}</svg>`

let spriteInjected = false

export function ensureIconSprite() {
  if (spriteInjected || typeof document === 'undefined' || !document.body || typeof document.body.appendChild !== 'function') return
  spriteInjected = true
  try {
    const host = document.createElement('div')
    host.setAttribute('data-dgw-icon-sprite-host', '')
    host.innerHTML = SPRITE
    document.body.appendChild(host)
  } catch {}
}

export function Icon({ name, size = 16, strokeWidth = 1.75, className, style, title }) {
  const paths = PATHS[name]
  if (!paths) return null
  const px = Number(size) >= 15 ? 16 : 14
  return React.createElement(
    'svg',
    {
      className,
      width: px,
      height: px,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': title ? undefined : 'true',
      role: title ? 'img' : undefined,
      focusable: 'false',
      'data-icon': name,
      style: { flex: 'none', display: 'inline-block', ...(style || {}) },
    },
    title ? React.createElement('title', null, title) : null,
    React.createElement('use', { href: `#dgw-ic-${name}` }),
  )
}

function named(name, defaultSize) {
  const C = (props) => React.createElement(Icon, { ...props, name, size: (props && props.size) || defaultSize })
  C.displayName = `Icon(${name})`
  return C
}

export const IconBranchOutline16 = named('branch', 16)
export const IconCheckOutline14 = named('check', 14)
export const IconChevronRightOutline14 = named('chevronRight', 14)
export const IconCloseFill14 = named('close', 14)
export const IconCodeOutline16 = named('fileCode', 16)
export const IconCopyOutline16 = named('copy', 16)
export const IconFolderOpenOutline16 = named('folderOpen', 16)
export const IconPlusOutline16 = named('plus', 16)
export const IconRefreshOutline14 = named('refresh', 14)
export const IconRightUpOutline16 = named('externalLink', 16)
export const IconWarningOutline16 = named('warning', 16)

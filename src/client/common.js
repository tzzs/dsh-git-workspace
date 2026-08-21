export function isSettled(block) {
  return block != null && typeof block === 'object' && 'kind' in block
}

export function blockText(block) {
  if (!isSettled(block)) return ''
  const content = block.content
  if (!Array.isArray(content)) return ''
  return content
    .map((c) => (c && c.type === 'text' ? c.text : ''))
    .join('')
    .trim()
}

export function blockMeta(block) {
  if (!isSettled(block)) return null
  const meta = block.meta
  if (!meta || typeof meta !== 'object') return null
  return meta
}

export function metaValue(block, field) {
  const meta = blockMeta(block)
  if (!meta) return null
  return meta[field] ?? null
}

export function isErrorResult(block) {
  return isSettled(block) && block.isError === true
}

export function firstLine(text) {
  if (!text) return ''
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(0, nl)
}

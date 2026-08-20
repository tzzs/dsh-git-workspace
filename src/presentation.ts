import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type {
  GenericCallView,
  GenericResultView,
  ToolCallView,
  ToolResultView,
} from '@deepseek-ai/dsh-tools'

export function text(content: string): ContentBlock[] {
  return [{ type: 'text', text: content }]
}

export function joinText(parts: string[]): string {
  return parts.filter(Boolean).join('\n')
}

export function genericCall(
  title: string,
  opts: { kind?: GenericCallView['kind']; rawInput?: unknown } = {},
): ToolCallView {
  return {
    card: 'generic',
    title,
    kind: opts.kind,
    ...(opts.rawInput !== undefined ? { rawInput: opts.rawInput } : {}),
  }
}

export function genericResult(
  title: string,
  content?: ContentBlock[],
): ToolResultView {
  return {
    card: 'generic',
    title,
    ...(content ? { content } : {}),
  }
}

function isErrorResult(result: {
  isError: boolean
  content: ContentBlock[]
}): boolean {
  return result.isError
}

export function firstTextLine(content: ContentBlock[]): string {
  const block = content.find((c) => c.type === 'text')
  if (!block) return ''
  const newline = block.text.indexOf('\n')
  return newline === -1 ? block.text : block.text.slice(0, newline)
}

export function errorTitle(
  result: { isError: boolean; content: ContentBlock[] },
  fallback: string,
): string | undefined {
  if (!isErrorResult(result)) return undefined
  const line = firstTextLine(result.content)
  return line ? line.slice(0, 120) : fallback
}

export { isErrorResult }

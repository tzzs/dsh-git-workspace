let hostCtx = null

export function bindHostContext(ctx) {
  hostCtx = ctx
}

export function resolveSessions() {
  try {
    return hostCtx && typeof hostCtx.get === 'function' ? hostCtx.get('sessions') : null
  } catch {
    return null
  }
}

export async function sessionCommand(sessionId, line) {
  try {
    const sessions = resolveSessions()
    if (!sessions || !sessionId) return 'unavailable'
    const binding = sessions.binding(sessionId)
    const session = binding && binding.session
    if (!session || typeof session.command !== 'function') return 'unavailable'
    const result = await session.command(line)
    if (!result || typeof result !== 'object' || result.ok !== true) {
      if (typeof console !== 'undefined') console.warn('[dsh-git-workspace] native command request failed:', line)
      return 'failed'
    }
    const matched = Boolean(result.value && result.value.matched)
    if (!matched && typeof console !== 'undefined') {
      console.warn('[dsh-git-workspace] native command is unavailable:', line)
    }
    return matched ? 'executed' : 'unmatched'
  } catch (error) {
    if (typeof console !== 'undefined') {
      console.warn('[dsh-git-workspace] native command failed:', line, error)
    }
    return 'failed'
  }
}

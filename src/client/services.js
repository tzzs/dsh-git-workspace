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

export function sessionPrompt(sessionId, text) {
  try {
    const sessions = resolveSessions()
    if (!sessions || !sessionId) return Promise.resolve(false)
    const binding = sessions.binding(sessionId)
    const session = binding && binding.session
    if (!session || typeof session.prompt !== 'function') return Promise.resolve(false)
    return Promise.resolve(
      session.prompt([{ type: 'text', text }], 'queue'),
    )
      .then(() => true)
      .catch(() => false)
  } catch {
    return Promise.resolve(false)
  }
}

import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { command } from './git/exec.js'
import { gitWorkspace } from './tools/git-workspace.js'
import { toWorkspaceMeta } from './ui/meta.js'
import type { WorkspaceMeta } from './ui/meta.js'

export const WORKSPACE_EVENT = 'tzzs.git-workspace/sample'

export const WORKSPACE_PROJECTION_KEY = 'tzzs.git-workspace'

export type WorkspaceSample = WorkspaceMeta | { error: unknown }

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    'tzzs.git-workspace/sample': WorkspaceSample
  }
}

interface ProjectionUnit {
  key: string
  schema: { parse(value: unknown): unknown }
  init(): unknown
  apply(state: unknown, event: { type: string; data?: unknown }): unknown
  view(state: unknown): unknown
  stateVersion: number
}

type RegistryLike = { register(unit: ProjectionUnit): unknown }

function isWorkspaceSample(v: unknown): v is WorkspaceSample {
  return typeof v === 'object' && v !== null
}

const unit: ProjectionUnit = {
  key: WORKSPACE_PROJECTION_KEY,
  schema: {
    parse(value) {
      if (value === null || value === undefined) return null
      if (!isWorkspaceSample(value)) throw new Error('invalid git workspace projection value')
      return value
    },
  },
  init: () => null,
  apply: (state, event) =>
    event.type === WORKSPACE_EVENT && isWorkspaceSample(event.data) ? event.data : state,
  view: (state) => state,
  stateVersion: 1,
}

type SamplerHost = Pick<Context, 'inject'>

const REMOTE_TTL_MS = 15_000

const lastFingerprints = new WeakMap<Session, string>()
const lastSamples = new WeakMap<Session, { local: string; at: number }>()
const inFlight = new WeakMap<Session, Promise<void>>()
const attached = new WeakSet<Context>()

async function localFingerprint(cwd: string): Promise<string | null> {
  try {
    const [head, status] = await Promise.all([
      command('git', ['rev-parse', 'HEAD'], cwd),
      command('git', ['-c', 'core.quotePath=false', 'status', '--porcelain'], cwd),
    ])
    return head.stdout.trim() + '\n' + status.stdout
  } catch {
    return null
  }
}

async function runSample(session: Session): Promise<void> {
  try {
    const cwd = session.header?.cwd
    if (!cwd || session.header?.origin === 'subagent') return
    const local = await localFingerprint(cwd)
    const key = local ?? ''
    const prev = lastSamples.get(session)
    if (prev && prev.local === key && Date.now() - prev.at < REMOTE_TTL_MS) return
    const result = await gitWorkspace(cwd)
    const payload: WorkspaceSample =
      'error' in result
        ? { error: result.error }
        : toWorkspaceMeta({
            ...result,
            ci: result.ci
              ? {
                  status: result.ci.status,
                  checks: result.ci.checks.map((c) => ({ ...c, workflow: null, url: null })),
                }
              : null,
          })
    lastSamples.set(session, { local: key, at: Date.now() })
    const fingerprint = JSON.stringify(payload)
    if (lastFingerprints.get(session) === fingerprint) return
    lastFingerprints.set(session, fingerprint)
    session.append(WORKSPACE_EVENT, payload)
  } catch {
    return
  }
}

function sampleSession(session: Session): Promise<void> {
  const running = inFlight.get(session)
  if (running) return running
  const task = runSample(session).finally(() => {
    if (inFlight.get(session) === task) inFlight.delete(session)
  })
  inFlight.set(session, task)
  return task
}

export function installWorkspaceSampler(ctx: SamplerHost): void {
  ctx.inject(['sessionProjections'], (host) => {
    const registry = (host as unknown as { sessionProjections?: RegistryLike })
      .sessionProjections
    if (!registry) return
    registry.register(unit)
    if (attached.has(host)) return
    attached.add(host)
    host.on('session/created', (session) => {
      void sampleSession(session)
    })
    host.on('session/event', (session, event) => {
      if (event.type === 'turn/end') void sampleSession(session)
    })
  })
}

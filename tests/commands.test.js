import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { installGitCommands } from '../lib/commands.js'

const run = promisify(execFile)
async function git(cwd, args) {
  return run('git', args, { cwd, encoding: 'utf8' })
}

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-commands-'))
  await git(cwd, ['init', '-q'])
  await git(cwd, ['config', 'user.email', 'test@example.com'])
  await git(cwd, ['config', 'user.name', 'Test'])
  await writeFile(join(cwd, 'file.txt'), 'one\n')
  await git(cwd, ['add', 'file.txt'])
  await git(cwd, ['commit', '-qm', 'initial'])
  return cwd
}

async function registerAll() {
  const registered = new Map()
  const ctx = {
    inject: async (_deps, callback) => {
      const host = { commands: { register: (def) => registered.set(def.name, def) } }
      await callback(host)
    },
  }
  await installGitCommands(ctx)
  return registered
}

function invocation(cwd, args = {}) {
  return {
    commandId: 'test',
    rawInput: JSON.stringify(args),
    signal: new AbortController().signal,
    agent: { session: { header: { cwd } } },
  }
}

test('installGitCommands registers every read-only command with a working handler', async () => {
  const cwd = await fixture()
  const registered = await registerAll()

  const readOnly = [
    ['git-workspace', {}],
    ['git-status', {}],
    ['git-files', { scope: 'working-tree' }],
    ['git-diff', {}],
    ['git-commits', {}],
    ['git-show', {}],
    ['git-compare', { base: 'HEAD', head: 'HEAD' }],
    ['git-branches', {}],
    ['git-remotes', {}],
    ['git-worktrees', {}],
    ['git-stash', {}],
    ['git-tags', {}],
  ]

  for (const [name, args] of readOnly) {
    const def = registered.get(name)
    assert.ok(def, `${name} is registered`)
    const result = await def.handler(invocation(cwd, args))
    assert.equal(result.kind, 'success', `${name} succeeds against a real repo: ${result.kind === 'error' ? result.text : ''}`)
  }
})

test('git-files forwards its scope argument positionally to gitFiles', async () => {
  const cwd = await fixture()
  await writeFile(join(cwd, 'staged.txt'), 'x\n')
  await git(cwd, ['add', 'staged.txt'])
  const registered = await registerAll()
  const def = registered.get('git-files')

  const staged = await def.handler(invocation(cwd, { scope: 'staged' }))
  assert.equal(staged.kind, 'success')
  assert.match(staged.text, /staged\.txt/)

  const workingTree = await def.handler(invocation(cwd, {}))
  assert.equal(workingTree.kind, 'success')
  assert.match(workingTree.text, /staged\.txt/, 'default scope still lists the file')
})

test('git-show without a sha defaults to HEAD', async () => {
  const cwd = await fixture()
  const registered = await registerAll()
  const def = registered.get('git-show')
  const result = await def.handler(invocation(cwd, {}))
  assert.equal(result.kind, 'success')
  assert.match(result.text, /initial/)
})

test('git-diff rejects a malformed JSON body without touching git', async () => {
  const cwd = await fixture()
  const registered = await registerAll()
  const def = registered.get('git-diff')
  const result = await def.handler({ ...invocation(cwd), rawInput: '{not json' })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /INVALID_JSON/)
})

test('github read commands are registered (network calls not exercised here)', async () => {
  const registered = await registerAll()
  for (const name of ['git-pr', 'git-pr-diff', 'git-pr-reviews', 'git-pr-comments', 'git-ci', 'git-ci-logs', 'git-issue', 'git-issue-comments', 'git-releases']) {
    assert.ok(registered.has(name), `${name} is registered`)
  }
})

test('a session with no workspace directory fails every command instead of throwing', async () => {
  const registered = await registerAll()
  for (const name of ['git-workspace', 'git-status', 'git-branches', 'git-stash']) {
    const def = registered.get(name)
    const result = await def.handler({
      commandId: 'test',
      rawInput: '{}',
      signal: new AbortController().signal,
      agent: { session: { header: {} } },
    })
    assert.equal(result.kind, 'error')
    assert.match(result.text, /WORKSPACE_UNAVAILABLE/)
  }
})

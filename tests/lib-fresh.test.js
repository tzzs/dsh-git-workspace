import test from 'node:test'
import assert from 'node:assert/strict'
import {stat, readdir, stat as statFn} from 'node:fs/promises'
import {join} from 'node:path'

// Guard against running `node --test tests/*.test.js` directly without a prior
// build (npm test does this automatically). Stale or missing lib/ otherwise
// produces confusing failures deep inside unrelated tests.
const libDir = join(import.meta.dirname, '../lib')
const srcDir = join(import.meta.dirname, '../src')

async function newestMtime(dir) {
  let newest = 0
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    for (const entry of await readdir(cur, {withFileTypes: true})) {
      const p = join(cur, entry.name)
      if (entry.isDirectory()) stack.push(p)
      else {
        const {mtimeMs} = await statFn(p)
        if (mtimeMs > newest) newest = mtimeMs
      }
    }
  }
  return newest
}

test('lib/ exists and is not older than src/ (run npm run build first)', async () => {
  let libStat
  try {
    libStat = await stat(libDir)
  } catch {
    assert.fail('lib/ does not exist. Run "npm run build" (or "npm test") before testing.')
  }
  assert.ok(libStat.isDirectory(), 'lib/ is not a directory; run "npm run build" first.')
  const srcNewest = await newestMtime(srcDir)
  const libNewest = await newestMtime(libDir)
  assert.ok(
    libNewest >= srcNewest,
    `lib/ is stale (built ${new Date(libNewest).toISOString()} < newest src change ${new Date(srcNewest).toISOString()}). Run "npm run build" (or "npm test") before testing.`,
  )
})

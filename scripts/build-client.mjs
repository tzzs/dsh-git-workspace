import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, relative, sep } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const SRC_CLIENT = join(root, 'src', 'client')
const OUT_DIR = join(root, 'lib', 'client')
const OUT_FILE = join(OUT_DIR, 'client.js')
const PKG_NAME = '@tzzs/dsh-git-workspace'

// Platform externals are resolved by the DSH client module table at runtime.
const EXTERNALS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
])

function listFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...listFiles(p))
    else if (name.endsWith('.js')) out.push(p)
  }
  return out.sort()
}

// Transform a single ESM module into a CommonJS factory body.
// Returns { body, deps, externalDeps, exported } where deps are raw source
// specifiers (resolved later) and body uses __internal__(index) placeholders.
function transformModule(src) {
  const deps = []
  const externalDeps = []
  let body = src
  let internalIndex = 0
  let externalIndex = 0

  const internalRef = (spec) => {
    const i = deps.indexOf(spec)
    if (i !== -1) return `__internal__(${i})`
    deps.push(spec)
    return `__internal__(${internalIndex++})`
  }
  const externalRef = (spec) => {
    const i = externalDeps.indexOf(spec)
    if (i !== -1) return `__external__(${i})`
    externalDeps.push(spec)
    return `__external__(${externalIndex++})`
  }

  // import * as X from 'spec'
  body = body.replace(
    /import\s*\*\s*as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
    (_m, name, spec) => {
      if (EXTERNALS.has(spec)) return `const ${name} = ${externalRef(spec)}`
      return `const ${name} = ${internalRef(spec)}`
    },
  )

  // import { a, b as c } from 'spec'
  body = body.replace(
    /import\s*\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]/g,
    (_m, names, spec) => {
      const bindings = names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => {
          const parts = n.split(/\s+as\s+/)
          const imported = parts[0].trim()
          const local = (parts[1] || imported).trim()
          return `${imported}: ${local}`
        })
        .join(', ')
      if (EXTERNALS.has(spec)) {
        return `const { ${bindings} } = ${externalRef(spec)}`
      }
      return `const { ${bindings} } = ${internalRef(spec)}`
    },
  )

  // export function name(...) {...}
  body = body.replace(
    /export\s+function\s+(\w+)/g,
    (_m, name) => `function ${name}`,
  )
  // export const name = ...
  body = body.replace(/export\s+const\s+/g, 'const ')
  // export default ...
  body = body.replace(/export\s+default\s+/g, 'module.exports.default = ')

  // collect exports: functions and consts declared at top level
  const exported = []
  const fnRe = /^function\s+(\w+)/gm
  let m
  while ((m = fnRe.exec(body))) exported.push(m[1])
  const constRe = /^const\s+(\w+)/gm
  while ((m = constRe.exec(body))) exported.push(m[1])

  return { body, deps, externalDeps, exported }
}

// Build an internal module table keyed by normalized specifier.
function buildTable(entryAbs, fileToSpec, mods) {
  const table = new Map()
  const visited = new Set()
  function walk(abs, spec) {
    if (visited.has(abs)) return
    visited.add(abs)
    const mod = mods.get(abs)
    table.set(spec, {
      // dep[ i ] = normalized internal spec at internal index i (or null)
      deps: mod.deps.map((d) => {
        const abs2 = resolve(dirname(abs), d)
        const spec2 = fileToSpec.get(abs2)
        if (!spec2) throw new Error(`Cannot resolve internal module ${d} from ${abs}`)
        return spec2
      }),
      externalDeps: mod.externalDeps,
      body: mod.body,
      exported: mod.exported,
    })
    for (const d of mod.deps) {
      const abs2 = resolve(dirname(abs), d)
      const spec2 = fileToSpec.get(abs2)
      if (spec2) walk(abs2, spec2)
    }
  }
  walk(entryAbs, 'index')
  return table
}

function build() {
  const files = listFiles(SRC_CLIENT)
  const mods = new Map()
  const fileToSpec = new Map()
  for (const abs of files) {
    const rel = relative(SRC_CLIENT, abs).split(sep).join('/')
    const spec = rel.replace(/\.js$/, '')
    fileToSpec.set(abs, spec)
  }
  const entryAbs = join(SRC_CLIENT, 'index.js')
  if (!fileToSpec.has(entryAbs)) throw new Error('Missing src/client/index.js')
  for (const abs of files) {
    mods.set(abs, transformModule(readFileSync(abs, 'utf8')))
  }
  const table = buildTable(entryAbs, fileToSpec, mods)

  const entries = [...table.entries()].map(([spec, mod]) => {
    const exports = mod.exported
      .map((e) => `module.exports.${e} = ${e};`)
      .join('\n')
    const resolver = `const __internal__ = (i) => __load__(__deps__[i]);`
    const externalResolver = `const __external__ = (i) => __exts__[i];`
    const depArr = `const __deps__ = [${mod.deps.map((d) => JSON.stringify(d)).join(', ')}];`
    const extArr = `const __exts__ = [${mod.externalDeps.map((d) => `__external_spec__(${JSON.stringify(d)})`).join(', ')}];`
    return `  ${JSON.stringify(spec)}: (module, exports, __load__, __external_spec__) => {
${indent(depArr, 4)}
${indent(extArr, 4)}
${indent(resolver, 4)}
${indent(externalResolver, 4)}
${indent(mod.body, 4)}
${indent(exports, 4)}
  },`
  })

  const bundle = `window.__ModuleLoader__.load({
	id: ${JSON.stringify(PKG_NAME)},
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const __modules__ = {
${entries.join('\n')}
		};
		const __cache__ = new Map();
		const __load__ = (spec) => {
			if (__cache__.has(spec)) return __cache__.get(spec).exports;
			const m = { exports: {} };
			__cache__.set(spec, m);
			__modules__[spec](m, m.exports, __load__, require);
			return m.exports;
		};
		const __index__ = __load__("index");
		Object.assign(module.exports, __index__);
		return module.exports;
	}
});
`

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT_FILE, bundle)
  const typesSrc = join(SRC_CLIENT, 'index.d.ts')
  if (existsSync(typesSrc)) {
    copyFileSync(typesSrc, join(OUT_DIR, 'index.d.ts'))
  }
  console.log(`Wrote ${OUT_FILE} (${bundle.length} bytes, ${table.size} modules)`)
}


function indent(text, n) {
  const pad = ' '.repeat(n)
  return text
    .split('\n')
    .map((l) => (l.trim() ? pad + l : l))
    .join('\n')
}

build()

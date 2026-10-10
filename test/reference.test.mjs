/**
 * Checks the spec against its reference implementation, the engine's
 * contracts package:
 *
 * 1. Every schema the generator knows, and every reference (twin) schema,
 *    names a schema file that exists.
 * 2. On every example, the reference schema gives the same verdict as the
 *    JSON Schema. A disagreement fails: it is the finding.
 * 3. The generated schemas on disk equal what the generator produces now.
 *
 * These checks need the contracts package. Where it is not installed (the
 * spec on its own), they are skipped and conformance.test.mjs still runs.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

let reference = null
let missing = ''
try {
  const gen = await import('../scripts/generate-schemas.mjs')
  const src = await import('../scripts/sources.mjs')
  reference = { ...gen, ...src }
} catch (err) {
  missing = String(err?.message ?? err).split('\n')[0]
}

const title = reference ? 'reference implementation' : `reference implementation (skipped: ${missing})`

describe.skipIf(!reference)(title, () => {
  const { buildSchemas, serialize, schemaPath, SPEC_ROOT, GENERATED, TWINS } = reference ?? {}
  const schemaDir = join(SPEC_ROOT ?? '.', 'schemas')
  const exampleDir = join(SPEC_ROOT ?? '.', 'examples')
  const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
  const schemaNames = reference
    ? readdirSync(schemaDir)
        .filter((f) => f.endsWith('.schema.json'))
        .map((f) => f.slice(0, -'.schema.json'.length))
    : []

  it('names only schemas that exist', () => {
    for (const name of Object.keys(GENERATED)) expect(schemaNames).toContain(name)
    for (const name of Object.keys(TWINS)) expect(schemaNames).toContain(name)
  })

  for (const [name, twin] of Object.entries(TWINS ?? {})) {
    for (const expectation of ['valid', 'invalid']) {
      const dir = join(exampleDir, name, expectation)
      if (!existsSync(dir)) continue
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
        it(`${name} ${expectation}: ${f} — reference schema agrees`, () => {
          expect(twin(readJson(join(dir, f)))).toBe(expectation === 'valid')
        })
      }
    }
  }

  if (reference) {
    for (const [name, schema] of Object.entries(buildSchemas())) {
      it(`${name}.schema.json is what the generator produces (run "pnpm generate")`, () => {
        const onDisk = readFileSync(schemaPath(name), 'utf8').replace(/\r\n/g, '\n')
        expect(onDisk).toBe(serialize(schema))
      })
    }
  }
})

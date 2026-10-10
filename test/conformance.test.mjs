/**
 * The spec's own conformance test.
 *
 * 1. Every schema compiles (JSON Schema 2020-12).
 * 2. Every example under examples/<schema>/valid is accepted and every one
 *    under examples/<schema>/invalid is refused by the JSON Schema.
 * 3. Every schema has at least one valid and one invalid example.
 * 4. Every format document exists and states its status and format version.
 *
 * This file needs nothing but the spec itself, so the spec stands alone. The
 * checks against the reference implementation (its schemas agree on every
 * example; generated schemas have not drifted) live in reference.test.mjs and
 * run only where that implementation is installed.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const SPEC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const DOCUMENTS = {
  'pwpack-format': 'stable',
  'pwapp-format': 'draft',
  'block-manifest': 'stable',
  'capability-manifest': 'stable',
  'connector-manifest': 'draft',
  appearance: 'stable',
  receipt: 'draft',
  plan: 'draft',
  definitions: 'draft',
  envelope: 'stable',
  'session-protocol': 'draft',
  'data-protocol': 'draft',
  'hosting-security': 'draft',
}

const schemaDir = join(SPEC_ROOT, 'schemas')
const exampleDir = join(SPEC_ROOT, 'examples')
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const schemaNames = readdirSync(schemaDir)
  .filter((f) => f.endsWith('.schema.json'))
  .map((f) => f.slice(0, -'.schema.json'.length))
  .sort()

const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
for (const name of schemaNames) ajv.addSchema(readJson(join(schemaDir, `${name}.schema.json`)))

const validatorOf = (name) => ajv.getSchema(`https://pwfabric.com/spec/schemas/${name}.schema.json`)

function examplesOf(name, expectation) {
  const dir = join(exampleDir, name, expectation)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: `${name}/${expectation}/${f}`, doc: readJson(join(dir, f)) }))
}

describe('schemas', () => {
  it('has schemas', () => {
    expect(schemaNames.length).toBeGreaterThan(0)
  })

  for (const name of schemaNames) {
    describe(name, () => {
      it('compiles', () => {
        expect(validatorOf(name)).toBeTypeOf('function')
      })

      it('has valid and invalid examples', () => {
        expect(examplesOf(name, 'valid').length).toBeGreaterThan(0)
        expect(examplesOf(name, 'invalid').length).toBeGreaterThan(0)
      })

      for (const expectation of ['valid', 'invalid']) {
        for (const { file, doc } of examplesOf(name, expectation)) {
          it(`${expectation}: ${file}`, () => {
            const validate = validatorOf(name)
            const bySchema = validate(doc)
            const want = expectation === 'valid'
            expect(bySchema, `JSON Schema: ${JSON.stringify(validate.errors)}`).toBe(want)
          })
        }
      }
    })
  }
})

describe('documents', () => {
  for (const [name, status] of Object.entries(DOCUMENTS)) {
    it(`${name}.md states status ${status} and formatVersion 1.0`, () => {
      const text = readFileSync(join(SPEC_ROOT, `${name}.md`), 'utf8').replace(/\r\n/g, '\n')
      const front = /^---\n([\s\S]*?)\n---\n/.exec(text)
      expect(front, 'front matter').not.toBeNull()
      expect(front[1]).toMatch(new RegExp(`^status: ${status}$`, 'm'))
      expect(front[1]).toMatch(/^formatVersion: "1\.0"$/m)
      for (const heading of ['## Conformance']) expect(text).toContain(heading)
    })
  }
})

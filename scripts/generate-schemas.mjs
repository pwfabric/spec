/**
 * Generate the JSON Schemas that have a zod source in
 * `@pwfabric/contracts`.
 *
 *   node scripts/generate-schemas.mjs          write schemas/<name>.schema.json
 *   node scripts/generate-schemas.mjs --check  exit 1 if a committed file differs
 *
 * The generated files are committed. The conformance test regenerates them in
 * memory and fails when the result differs from what is on disk, so a change
 * to the reference schema cannot reach a release without its JSON Schema.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { z } from 'zod'
import { GENERATED } from './sources.mjs'

export const SPEC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema'
export const SCHEMA_BASE = 'https://pwfabric.com/spec/schemas/'

/** Every generated schema, as `{ [name]: schemaObject }`. Pure; writes nothing. */
export function buildSchemas() {
  const out = {}
  for (const [name, source] of Object.entries(GENERATED)) {
    const raw = z.toJSONSchema(source.zod, {
      target: 'draft-2020-12',
      // A document is what a writer hands a reader: the INPUT side of the
      // schema (a field with a default is optional, not required).
      io: 'input',
      reused: 'inline',
      cycles: 'throw',
    })
    delete raw.$schema
    normalize(raw)
    const patched = source.patch ? source.patch(raw) : raw
    out[name] = {
      $schema: SCHEMA_DIALECT,
      $id: `${SCHEMA_BASE}${name}.schema.json`,
      title: source.title,
      description: `${source.description} Generated from the reference schema ${source.from}; do not edit by hand.`,
      ...patched,
    }
  }
  return out
}

/**
 * Write zod 4's output in the form the committed schemas have used since the
 * first release, where the two forms mean the same thing:
 *
 * - an object that lists `properties` and does not refuse unknown keys says
 *   `additionalProperties: true` (zod 4 omits it, or writes `{}` for a loose
 *   object);
 * - `propertyNames: { type: "string" }` is dropped (every JSON key is a
 *   string), and a key enum keeps only its `enum`;
 * - a discriminated union is `anyOf` (zod 4 writes `oneOf`; its branches have
 *   distinct `const` discriminators, so at most one can match either way).
 *
 * Anything that changes which documents a schema accepts is NOT rewritten
 * here: such a difference is the reference schema's, and is reviewed as one.
 */
function normalize(node) {
  if (Array.isArray(node)) {
    for (const item of node) normalize(item)
    return
  }
  if (!node || typeof node !== 'object') return
  if (node.propertyNames && node.propertyNames.type === 'string') {
    delete node.propertyNames.type
    if (Object.keys(node.propertyNames).length === 0) delete node.propertyNames
  }
  if (Array.isArray(node.oneOf) && node.anyOf === undefined) {
    node.anyOf = node.oneOf
    delete node.oneOf
  }
  if (node.properties) {
    const extra = node.additionalProperties
    if (extra === undefined || (typeof extra === 'object' && extra && Object.keys(extra).length === 0)) {
      node.additionalProperties = true
    }
  }
  for (const value of Object.values(node)) normalize(value)
}

/** The bytes a schema is written as: two-space JSON and a trailing newline. */
export function serialize(schema) {
  return `${JSON.stringify(schema, null, 2)}\n`
}

export function schemaPath(name) {
  return join(SPEC_ROOT, 'schemas', `${name}.schema.json`)
}

function main() {
  const check = process.argv.includes('--check')
  let drift = 0
  for (const [name, schema] of Object.entries(buildSchemas())) {
    const path = schemaPath(name)
    const next = serialize(schema)
    if (check) {
      let current = ''
      try {
        current = readFileSync(path, 'utf8')
      } catch {
        // missing counts as drift
      }
      if (current.replace(/\r\n/g, '\n') !== next) {
        console.error(`drift: schemas/${name}.schema.json`)
        drift++
      }
    } else {
      writeFileSync(path, next)
      console.log(`wrote schemas/${name}.schema.json`)
    }
  }
  if (drift > 0) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

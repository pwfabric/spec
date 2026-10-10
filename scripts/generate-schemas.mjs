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
import { zodToJsonSchema } from 'zod-to-json-schema'
import { GENERATED } from './sources.mjs'

export const SPEC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema'
export const SCHEMA_BASE = 'https://pwfabric.com/spec/schemas/'

/** Every generated schema, as `{ [name]: schemaObject }`. Pure; writes nothing. */
export function buildSchemas() {
  const out = {}
  for (const [name, source] of Object.entries(GENERATED)) {
    const raw = zodToJsonSchema(source.zod, {
      target: 'jsonSchema7',
      $refStrategy: 'none',
      // zod's default object mode ("strip") ACCEPTS unknown keys and drops
      // them; `.strict()` refuses them. 'strict' here maps exactly that:
      // additionalProperties is false only where zod refuses.
      removeAdditionalStrategy: 'strict',
    })
    delete raw.$schema
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

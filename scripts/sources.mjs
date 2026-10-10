/**
 * Where each schema comes from, and the reference schema it must agree with.
 *
 * GENERATED entries are derived from a zod schema in
 * `@pwfabric/contracts`. A zod schema can carry rules a
 * JSON Schema cannot (a refinement is a function), and some rules a refinement
 * states CAN be written declaratively; `patch` adds exactly those, so the
 * published JSON Schema and the reference schema accept and refuse the same
 * documents. Rules neither form can express are listed in the format's
 * document under "Rules beyond the schema".
 *
 * TWINS are the reference check the conformance test runs next to the JSON
 * Schema: every example must be accepted (valid/) or refused (invalid/) by
 * BOTH. A schema with no twin is hand-written from the format's behaviour and
 * is checked by the JSON Schema alone; its document says so.
 */
import {
  AppearanceConfigSchema,
  AtomFileManifestSchema,
  MediaDeclarationSchema,
  ProjectIdentitySchema,
  PwpackIdentitySchema,
  persistenceCapabilityConfigSchema,
  surfaceThemeSchema,
} from '@pwfabric/contracts'

/** The atom manifest, narrowed to the kinds one document covers. */
function atomManifestOfKinds(kinds) {
  return (doc) => {
    const parsed = AtomFileManifestSchema.safeParse(doc)
    return parsed.success && kinds.includes(parsed.data.kind)
  }
}

/** The kind discriminator a per-kind atom manifest document adds. */
function kindPatch(kinds) {
  return (schema) => {
    schema.properties.kind = kinds.length === 1 ? { const: kinds[0] } : { enum: [...kinds] }
    return schema
  }
}

/**
 * `app/definitions/auth.json` may carry `access` beside the identity; a reader
 * splits it off before parsing the identity (which is strict).
 */
function identityWithoutAccess(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false
  const { access: _access, ...identity } = doc
  return ProjectIdentitySchema.safeParse(identity).success
}

/** Topology rules the identity's refinement states, written declaratively. */
function identityPatch(schema) {
  schema.properties.access = {
    description:
      'Optional roles and row rules that travel beside the identity. Not part of the identity itself; a reader removes it before validating the identity.',
    type: 'object',
    properties: {
      roles: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 120 } },
      rules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            subject: { type: 'string', minLength: 1, maxLength: 120 },
            model: { type: 'string', minLength: 1, maxLength: 120 },
            rule: { type: 'string', minLength: 1, maxLength: 500 },
          },
          required: ['subject', 'model', 'rule'],
        },
      },
    },
  }
  schema.allOf = [
    {
      if: { properties: { topology: { const: 'external' } }, required: ['topology'] },
      then: {
        required: ['issuer'],
        properties: {
          methods: { maxItems: 0 },
          connections: { maxProperties: 0 },
        },
      },
      else: { not: { required: ['issuer'] } },
    },
  ]
  return schema
}

const safe = (zod) => (doc) => zod.safeParse(doc).success

/**
 * The declaration's `file` is checked by a refinement; the same rule as a
 * pattern: `media/<name>`, one name with no `/`, backslash or NUL, not `.`,
 * `..` or `provenance.json`.
 */
function mediaFilePatch(schema) {
  schema.properties.file = {
    type: 'string',
    description: 'Path of the bytes from the pack root: media/<name>, the form of media/provenance.json items[].path.',
    pattern: '^media/(?!\\.{1,2}$)(?!provenance\\.json$)[^/\\\\\\u0000]+$',
  }
  return schema
}

/** Schemas derived from contracts. Key = schema name (file `schemas/<name>.schema.json`). */
export const GENERATED = {
  'pwpack-format': {
    title: 'pwpack.json',
    description: 'The identity file at the root of a pwpack folder.',
    zod: PwpackIdentitySchema,
    from: 'PwpackIdentitySchema',
  },
  'block-manifest': {
    title: 'Block atom manifest',
    description: 'The manifest.json beside a block atom (atoms/blocks/<category>/<name>/manifest.json).',
    zod: AtomFileManifestSchema,
    from: 'AtomFileManifestSchema (kind "block")',
    patch: kindPatch(['block']),
  },
  'capability-manifest': {
    title: 'Capability atom manifest',
    description: 'The manifest.json beside a capability atom (atoms/capabilities/<name>/manifest.json).',
    zod: AtomFileManifestSchema,
    from: 'AtomFileManifestSchema (kind "capability")',
    patch: kindPatch(['capability']),
  },
  'connector-manifest': {
    title: 'Connector atom manifest',
    description: 'The manifest of a connector or provider atom: its connection name, configuration fields, delegated scopes and engine declaration.',
    zod: AtomFileManifestSchema,
    from: 'AtomFileManifestSchema (kind "connector" or "provider")',
    patch: kindPatch(['connector', 'provider']),
  },
  appearance: {
    title: 'Appearance configuration',
    description: "An app's or a page's appearance: token set, dark variant, mode policy and brand assets.",
    zod: AppearanceConfigSchema,
    from: 'AppearanceConfigSchema',
  },
  'definitions.auth': {
    title: 'app/definitions/auth.json',
    description: 'Who may enter the app: the identity declaration, optionally with access roles and rules.',
    zod: ProjectIdentitySchema,
    from: 'ProjectIdentitySchema (+ topology rules, + access)',
    patch: identityPatch,
  },
  'pwpack-format.media-declaration': {
    title: 'app/media/<key>.json',
    description: 'One media declaration: which image or file an app needs and which page slots its address goes into. No bytes; `file` names media/<name>.',
    zod: MediaDeclarationSchema,
    from: 'MediaDeclarationSchema',
    patch: mediaFilePatch,
  },
  'data-protocol': {
    title: 'Persistence capability configuration',
    description: "The data a page declares: its data sources, initial state and behaviours (the platform/persistence capability's config).",
    zod: persistenceCapabilityConfigSchema,
    from: 'persistenceCapabilityConfigSchema',
  },
}

/** The reference check per schema name. Absent = no reference schema exists. */
export const TWINS = {
  'pwpack-format': safe(PwpackIdentitySchema),
  'pwpack-format.media-declaration': safe(MediaDeclarationSchema),
  'block-manifest': atomManifestOfKinds(['block']),
  'capability-manifest': atomManifestOfKinds(['capability']),
  'connector-manifest': atomManifestOfKinds(['connector', 'provider']),
  appearance: safe(AppearanceConfigSchema),
  // Hand-written from the full token vocabulary; the reference schema is the
  // narrower legacy one. See appearance.md, "Differences".
  'appearance.theme': safe(surfaceThemeSchema),
  'definitions.auth': identityWithoutAccess,
  'data-protocol': safe(persistenceCapabilityConfigSchema),
}

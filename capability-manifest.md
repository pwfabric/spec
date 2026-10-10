---
status: stable
formatVersion: "1.0"
---

# The capability manifest

A **capability** is a runtime service a page binds to — data and state
(`platform/persistence`), entity records (`platform/entities`), interaction,
navigation. Its atom is `atoms/capabilities/<name>/handler.ts` with a
`manifest.json` beside it. The manifest tells a host what the capability is and,
in `config`, which settings a page may give it — as data, so a host can draw a
settings form and validate a page's binding without loading the handler.

Schema: [`schemas/capability-manifest.schema.json`](schemas/capability-manifest.schema.json)
(generated from the reference schema `AtomFileManifestSchema`, narrowed to
`kind: "capability"`).

**Why stable.** The shape is the same closed manifest blocks use, with one
kind-specific member (`config`) whose schema is closed as well; every
first-party capability manifest validates against it.

## Example

```json
{
  "id": "platform/persistence",
  "kind": "capability",
  "version": "1.0.0",
  "name": "Data & State Persistence",
  "state": "stable",
  "knowledge": {
    "purpose": "Data fetch, mutation and cache layer that backs surface bindings",
    "useCases": ["List backed by an entity collection"],
    "composesWith": ["platform/entities", "form.form"],
    "antiPatterns": ["Client-only ephemeral UI state"]
  },
  "config": {
    "fields": [
      { "key": "defaultCacheTtl", "type": "number", "required": false, "defaultValue": 300,
        "label": "Default Cache TTL", "constraints": { "min": 0, "max": 86400 } }
    ]
  }
}
```

## Members

All members of the [block manifest](block-manifest.md#members) apply, with:

- `id` is `platform/<name>`, where `<name>` is the folder below
  `atoms/capabilities/`.
- `kind` is `"capability"`.
- `category` and `definition` are absent.
- `config` (OPTIONAL) — the capability's settings, `{ fields: ConfigField[] }`.

### `config.fields[]`

| Member | Type | Required | Meaning |
|---|---|---|---|
| `key` | non-empty string | yes | The setting's key in the page's binding `config`. |
| `type` | `string` · `number` · `boolean` · `select` · `multi-select` · `url` · `email` · `json` | yes | Value type. |
| `required` | boolean | yes | Whether a binding must set it. |
| `label` | non-empty string | yes | Form label. |
| `defaultValue` | any | no | Applied when a binding leaves it unset. |
| `description`, `group` | string | no | Help text; form section. |
| `order` | number | no | Position within the group. |
| `sensitive` | boolean | no | A host MUST NOT echo the value back to a client that did not write it. |
| `options` | `{ value, label, description? }[]` | no | Choices for `select` / `multi-select`. |
| `constraints` | `{ min?, max?, pattern?, patternMessage? }` | no | `min`/`max` bound numbers (and lengths for strings); `pattern` is a regular expression a string value must match. |

Every object in `config` is closed.

## Capability ids

A page binds a capability by id (see [receipt](receipt.md)). The canonical
spelling is the long form, `platform/<name>`. Readers MUST also accept the
short form (`persistence` for `platform/persistence`) and treat both as the
same capability: both spellings are in circulation.

The capabilities the reference engine implements are `platform/persistence`
(data sources, state, behaviours — see [data-protocol](data-protocol.md)),
`platform/entities` (record CRUD and form bindings), `platform/interaction` and
`platform/navigation`.

## Rules beyond the schema

- `id` MUST equal `platform/<folder name>`.
- Keys in `config.fields` MUST be unique.
- `defaultValue`, when present, MUST be a valid value of `type` and satisfy
  `constraints`.
- The validation and default-application *logic* of a capability lives in its
  handler; the manifest carries only the data projection. A host MAY validate a
  binding against `config` alone, and MUST NOT require the handler to do so.

## Conformance

- `examples/capability-manifest/{valid,invalid}/*.json`, checked against the
  JSON Schema and the reference schema.

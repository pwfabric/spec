---
status: stable
formatVersion: "1.0"
---

# The block manifest

Every block atom carries a `manifest.json` beside its source
(`atoms/blocks/<category>/<name>/manifest.json`, next to `component.tsx` or a
precompiled `bundle.mjs`). The manifest says what the block is, how stable it
is, what a composer — human or model — needs to know to choose it without
loading its code (`knowledge`), and the authoring metadata a host needs to
place it (`definition`). It is the whole of a block's catalogue entry: a host
that lists, searches or composes blocks reads manifests, never bundles.

Schema: [`schemas/block-manifest.schema.json`](schemas/block-manifest.schema.json)
(generated from the reference schema `AtomFileManifestSchema`, narrowed to
`kind: "block"`). The same manifest shape serves every atom kind; the fields
that belong to other kinds are specified in
[capability-manifest](capability-manifest.md),
[connector-manifest](connector-manifest.md) and [appearance](appearance.md).

## Example

```json
{
  "id": "control.badge",
  "kind": "block",
  "version": "1.0.0",
  "category": "control",
  "name": "badge",
  "state": "stable",
  "knowledge": {
    "purpose": "Compact label that highlights status, count, or category next to other content",
    "useCases": ["Unread count on a tab or icon", "Status pill (Active / Pending / Archived)"],
    "composesWith": ["control.button", "container.card"],
    "antiPatterns": ["Long text labels — use text.text"]
  },
  "definition": {
    "props": [{ "name": "text", "type": "string", "required": false, "default": "" }],
    "defaultProps": { "text": "" },
    "canHaveChildren": false,
    "traits": ["status-indicator"]
  }
}
```

## Members

| Member | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | The atom id. For a block it is the path below `atoms/blocks/` joined with `.` — `control.badge`. |
| `kind` | `"block"` | yes | The atom kind. |
| `version` | string | yes | The block's own version (semver). |
| `name` | string | yes | Display name. |
| `state` | `stable` · `beta` · `alpha` · `deprecated` · `experimental` | yes | Maturity. A composer SHOULD prefer `stable` and MUST NOT newly place a `deprecated` block. |
| `category` | string | for blocks | The block's category (`control`, `container`, `data`, `form`, `feedback`, …). An open set; it SHOULD equal the first path segment below `blocks/`. |
| `description` | string | no | Human-readable summary for listings. |
| `tags` | string[] | no | Search labels for listings. |
| `knowledge` | object | yes | What a composer reads to choose the block (below). |
| `definition` | object | no | Authoring metadata (below). Present once the block has been built. |
| `forkedFrom` | `{ pack, version, atomId, hash }` | no | Where a forked block came from. Absent means an original block. |

The manifest is **closed**: a member not listed here, or in the other kinds'
documents, makes the manifest invalid. The reference reader refuses it; a
producer MUST NOT add members.

### `knowledge`

| Member | Type | Required | Meaning |
|---|---|---|---|
| `purpose` | non-empty string | yes | One sentence: what the block does. |
| `useCases` | non-empty string[] (≥ 1) | yes | Situations that should reach for it. |
| `composesWith` | string[] | yes | Atom ids that pair well with it (`<category>.<name>` for blocks, `platform/<name>` for capabilities). May be empty. |
| `antiPatterns` | non-empty string[] (≥ 1) | yes | When not to use it. |
| `implementation` | string | no | Build detail for people and repair tools. A composer SHOULD NOT send it on every composition call; it is not catalogue text. |

`knowledge` is closed too. An atom without complete knowledge MUST NOT be
published.

### `definition`

| Member | Type | Required | Meaning |
|---|---|---|---|
| `props` | object[] | yes | One descriptor per prop ([below](#prop-descriptor)). Descriptor members are open. |
| `defaultProps` | object | yes | Values a composer uses when it places the block. |
| `canHaveChildren` | boolean | yes | Container (`true`) or leaf. |
| `allowedParents` | string[] | no | Block ids that may host this block. Absent: any container. |
| `icon` | string | no | Palette glyph. |
| `traits` | kebab-case string[] | no | Traits the block carries (`form-field`, …). |
| `allowedChildTraits` | kebab-case string[] | no | A child passes if it carries any of these. Meaningful only when `canHaveChildren`. Absent: any child. |

Traits are an open vocabulary: a third-party block joins a container's slot by
declaring the trait, without a central list.

#### Prop descriptor

Each entry of `definition.props` describes one prop. The members are open; these
are the ones readers use:

| Member | Type | Required | Meaning |
|---|---|---|---|
| `name` | string | yes | The prop's key in a block node's `props`. A runtime MAY warn about a prop the descriptors do not name. |
| `type` | string | SHOULD | The value's type as people read it (`string`, `number`, `"sm" \| "md" \| "lg"`). Display only; machines read `jsonSchema`. |
| `required` | boolean | no | Whether a placed block must carry the prop. |
| `default` | any | no | The value the block uses when the prop is absent. |
| `jsonSchema` | object | SHOULD | The value's JSON Schema. A runtime that validates props builds its check from it. |
| `bindable` | boolean | no | `false`: the prop takes a literal only; a `{{…}}` expression in it is not resolved, and a runtime MAY warn about one. Absent means bindable. |
| `description` | string | SHOULD | When and how to set the prop: what it changes on screen, and which value to pick when. A composer reads it to choose a value. One or two sentences, not a restatement of `type`. |

A prop whose meaning is clear from its name and `type` (`text`, `disabled`)
MAY omit `description`. A prop whose values a composer cannot tell apart
without explanation (variants, modes, how it combines with another prop) SHOULD
carry one.

#### `stateKey`

`stateKey` is a reserved prop name. A block that can write its value to page
state (see [data-protocol §1.1](data-protocol.md#11-page-state)) declares a
prop named `stateKey`: `type: "string"`, `bindable: false`, and a description
that says which value is written. When a placed block sets `stateKey`, the
block writes its value to `state.<stateKey>` on every change. It does so by
emitting an event whose `payload.action` is
`{ "type": "setState", "key": <stateKey>, "value": <value> }`
([data-protocol §1.2](data-protocol.md#12-actions)).

A block that writes a second value names that prop `<part>StateKey`, for
example the reference navbar's `searchStateKey` for its search box. A block
MUST NOT use a prop named `stateKey`, or one ending in `StateKey`, for
anything else. A composer finds every state-writing block by these prop names
alone; there is no other marker.
A block that writes a typed value (a number, a boolean) SHOULD write it typed,
not as a string.

### `forkedFrom`

`pack` and `version` name the upstream pack build, `atomId` the upstream atom,
and `hash` the upstream source hash at fork time. A fork MUST carry a new id; a
fork that keeps the upstream id is refused by hosts that enforce provenance.

## Rules beyond the schema

- `id` MUST equal the id derived from the manifest's path
  ([pwpack-format §1.1](pwpack-format.md#11-how-a-path-becomes-an-atom)). A
  mismatch registers an atom no consumer can resolve.
- `category` SHOULD equal the first path segment below `blocks/`.
- `definition` belongs to blocks only; `config`, `theme`, `connection`,
  `configSchema`, `scopes` and `engine` MUST NOT appear on a block manifest
  (the schema permits them because the shape is shared; the kind forbids them).
- `composesWith` entries SHOULD name atoms that exist in the pack or its
  dependencies.

## Not this format

A file named `pwfabric.manifest.json` (`manifestVersion: 1`, with `type`,
`provides`, `requires`, `entryPoints`) belongs to an earlier, pack-level
marketplace format. It is not a block manifest, and a pwpack folder does not
contain one: the list of a pack's atoms is derived from its paths.

## Conformance

- `examples/block-manifest/{valid,invalid}/*.json`, checked against the JSON
  Schema and the reference schema. Every first-party block manifest the
  reference packs ship validates.

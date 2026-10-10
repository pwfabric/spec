---
status: draft
formatVersion: "1.0"
---

# The receipt

A **receipt** is one page, whole: its block tree, its appearance, and the
capabilities it binds, in a single self-contained JSON document. An app keeps
one per page at `app/surfaces/<key>.receipt.json`; a pack may ship reusable
page recipes at `atoms/surfaces/<group>/<name>.receipt.json`; a delivered app
serves them under its envelope's `surfaces/`. A receipt has no references
outside itself except block types (resolved through the block manifest) and
capability ids.

Schema: [`schemas/receipt.schema.json`](schemas/receipt.schema.json)
(hand-written; see "Differences").

**Why draft.** Two spellings of a capability entry are in circulation (§3),
and the block node has no single reference schema that names every member
producers write (§2). The status moves to stable when one block-node schema and
one capability-entry shape are settled.

## 1. Document

```json
{
  "title": "Products",
  "blocks": [
    { "id": "list", "type": "repeater", "repeat": "{{Product}}", "props": {},
      "loadingWhen": "{{__loading.Product}}",
      "children": [{ "id": "name", "type": "text", "props": { "text": "{{item.name}}" } }] }
  ],
  "appearance": { "config": { "theme": { "colors": { "primary": "#0f766e" } } } },
  "capabilities": [
    { "capability": "platform/persistence",
      "config": { "dataSources": [{ "id": "Product", "kind": "rest", "endpoint": "https://api.example.com/v1/records/Product", "returns": "data" }] } }
  ]
}
```

| Member | Type | Required | Meaning |
|---|---|---|---|
| `blocks` | block node[] | yes | The page's top-level blocks, in order. |
| `title` | string | no | Page title. A runner composes the document title as `<app title> — <page title>` unless the page title already starts with the app title. |
| `appearance` | `{ config }` | no | The page's [appearance](appearance.md) configuration. |
| `capabilities` | capability entry[] | no | Capabilities the page binds, each with its configuration. |
| `description`, `tags`, `readme`, `intent`, … | | no | Catalogue metadata. A renderer MUST ignore members it does not use; a producer MAY write them. |

## 2. Block node

| Member | Type | Required | Meaning |
|---|---|---|---|
| `type` | non-empty string | yes | Block type — the join key into the block manifest (`blockType`). |
| `id` | non-empty string | SHOULD | Unique within the page. Behaviours, media slots and selections address blocks by id. |
| `props` | object | no | The block's props. String values may contain binding expressions `{{…}}`. |
| `children` | block node[] | no | Child blocks; only for blocks whose definition says `canHaveChildren`. |
| `style` | object | no | Per-block style overrides: CSS property → value, or → `{ xs, sm, md, lg, xl, 2xl }` responsive values. |
| `visibleWhen` / `if` | string | no | Expression; the block renders only when it is truthy. |
| `repeat` | string | no | Expression bound to an array; the block's `children` are a template the renderer draws once per item, with `{{item.…}}` and `{{index}}` bound to that item. |
| `loadingWhen`, `errorWhen` | string | no | Expressions selecting the loading and error presentations. |
| `states`, `conditionalStates`, `layout`, `groupRoot`, `groupStates` | | no | Interaction states and layout hints. |

A reader MUST carry members of a block node it does not know unchanged: a
receipt passed through a reader must come back with every member it had.

### 2.1 Links

Link-valued props — `href` and every prop whose name ends in `Href`
(`ctaHref`, `linkHref`) — are written **root-relative to the app**: `/menu`,
`/menu/`, or `/` for the entry page, optionally followed by `?query` and
`#anchor`. A runner rewrites them into its router's form (see
[envelope §3](envelope.md#3-routing-and-links)). Absolute URLs with a scheme
(`https:`, `mailto:`), protocol-relative URLs (`//…`) and fragment-only links
(`#…`) are left as written. Assets are addressed by `src`, never by an
`…Href` prop.

### 2.2 Binding expressions

`{{name}}` binds a data source by id, `{{state.key}}` page state,
`{{item.field}}` the current item inside a repeat, `{{__loading.<id>}}` and
`{{__errors.<id>}}` a source's loading and error flags. The expression language
beyond these forms is defined by the renderer and is not part of this version.

## 3. Capability entry

```json
{ "capability": "platform/persistence", "config": { … } }
```

| Member | Type | Required | Meaning |
|---|---|---|---|
| `capability` | non-empty string | yes | The capability id, long (`platform/persistence`) or short (`persistence`) form; readers MUST treat both as the same capability. |
| `config` | object | no | The binding's configuration, validated against the capability manifest's `config`. |
| `required` | boolean | no | Whether the page cannot work without it. |

The `platform/persistence` configuration (data sources, initial state,
behaviours) is specified in [data-protocol](data-protocol.md). The
`platform/entities` configuration carries `formBindings`
(`{ formId, sourceId, statusKeys? }[]`).

## Differences

- The reference schema for a stored surface document requires `required` on
  every capability entry, and its block-node schema drops members it does not
  name (`loadingWhen`, `errorWhen` among them). Receipts written by producers
  omit `required`, and renderers read the dropped members. This document
  follows the receipts: `required` is optional and block nodes are open. The
  two are therefore not paired in the conformance test.
- A persisted receipt record on a hosting platform may spell a capability
  entry `{ id, config }` instead of `{ capability, config }`. A receipt file
  conforming to this document uses `capability`.

## Conformance

- `examples/receipt/{valid,invalid}/*.json`, against the hand-written schema.
- Round-trip fixtures (a receipt read and written back unchanged) are
  reserved for `fixtures/roundtrip/`.

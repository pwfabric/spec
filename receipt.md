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
    { "id": "list", "type": "repeater", "repeat": "{{Product}}",
      "props": { "loadingWhen": "{{__loading.Product}}" },
      "children": [{ "id": "name", "type": "text", "props": { "content": "{{item.name}}" } }] }
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
| `title` | string | no | Page title. A runner composes the document title from it (§1.1). It may carry expressions, evaluated in the page scope ([expressions §2](expressions.md#2-names-in-the-page-scope)), so a record's page is titled by its record: `"{{dish.0.name}}"`. Until it resolves to text (the record has not loaded, or is not found) the document title is the app title alone. |
| `titleTemplate` | boolean | no | `false`: the page's `title` is the whole document title, not composed with the app's (§1.1) — an entry page that names the app in its own title (`"Acme Bakery — bread before sunrise"`) does not name it twice. Absent or `true`: composed. |
| `appearance` | `{ config }`, or the shapes of `appearance.json` | no | The page's own [appearance](appearance.md#11-a-pages-own-appearance): a page that names a theme (`"use": "theme-ink"`) wears it instead of the app's. Absent, the page wears the app's. |
| `capabilities` | capability entry[] | no | Capabilities the page binds, each with its configuration. |
| `description` | string | no | The page in a sentence: the document's `<meta name="description">` while it is shown ([envelope §4](envelope.md#4-per-page)). It may carry expressions like `title`; until it resolves to text the app's description stands in, never the template. |
| `layout` | boolean | no | `false`: the page is drawn without the app's layout (§4) — a full-bleed landing page, a sign-in screen. Absent or `true`: the layout wraps it. |
| `knowledge` | object | no | Authoring information: what the page is for, the patterns it exercises (`patternsExercised`), … It stays in the app's source: a producer MUST NOT serve it (the receipts of a delivered app, [envelope](envelope.md) `surfaces/`, carry no `knowledge`), and no runner reads it. |
| `tags`, `readme`, `intent`, … | | no | Catalogue metadata. A renderer MUST ignore members it does not use; a producer MAY write them. |

### 1.1 The document title

The document title is composed from the page's `title` (resolved to text) and
`project.json` `title` and `titleTemplate` ([envelope §2](envelope.md#2-projectjson)):

| The page | The app | Document title |
|---|---|---|
| `titleTemplate: false` | any | the page's title as it is |
| a title | `titleTemplate` | the template, its `%s` replaced by the page's title and each `%%` by `%` |
| a title | `title`, no `titleTemplate` | `<app title> — <page title>`, or the page's title alone when it already starts with the app title |
| a title | neither | the page's title |
| no title, or one not yet resolved to text | any | the app's `title`; with none, empty |

The template is never written with its `%s` empty: a page without a title is
titled by the app's `title`, not by `" · Acme Bakery"`. A `titleTemplate`
MUST hold exactly one `%s`, and a `%` that is not part of `%s` or `%%` is not
allowed; the schemas refuse any other. The same title is the document's
`<title>` and `og:title` at build ([pwapp-format §2.4](pwapp-format.md#24-search-engines))
and the one the runner sets on every page it draws
([envelope §4](envelope.md#4-per-page)).

## 2. Block node

| Member | Type | Required | Meaning |
|---|---|---|---|
| `type` | non-empty string | yes | Block type — the join key into the block manifest (`blockType`). |
| `id` | non-empty string | SHOULD | MUST be unique within the page, nested `children` included; a validator reports a repeated id as an error. Behaviours, media slots and selections address blocks by id. |
| `props` | object | no | The block's props. String values may contain [expressions](expressions.md) `{{…}}`. |
| `children` | block node[] | no | Child blocks; only for blocks whose definition says `canHaveChildren`. |
| `style` | object | no | Per-block style overrides: CSS property → value, or → `{ xs, sm, md, lg, xl, 2xl }` responsive values. The layout keys — every `margin*` (physical and logical: `marginInline`, `marginBlock` …), `maxWidth`, `minWidth`, the flex item keys and grid placement — apply to the block's place in its parent. A block with `maxWidth` fills up to it and is **not centred** unless its style says so (`margin: "0 auto"` or `marginInline: "auto"`). |
| `visibleWhen` / `if` | string | no | Expression; the block renders only when it is truthy. When a render hides the element that had focus, a live runtime moves focus to the first block that render shows that was not shown before — its first focusable control, else its first heading (made focusable with `tabindex="-1"`); when nothing new is shown, focus is left where the browser put it. |
| `repeat` | string | no | Expression bound to an array; the block's `children` are a template the renderer draws once per item, with `{{item.…}}` and `{{index}}` bound to that item. Repeats nest; inside an inner repeat `item` is the inner element and the outer one is not reachable ([expressions §5](expressions.md#5-repeat)). |
| `loadingWhen`, `errorWhen` | string | no | Carried, not read. The reference renderer reads neither on a block node; a block that shows loading and error presentations declares them as **props** in its manifest (the repeater does: `"props": { "loadingWhen": "{{__loading.Product}}" }`). |
| `states`, `conditionalStates`, `groupRoot`, `groupStates` | | no | Styling by interaction state (§2.3). |
| `layout` | object | no | Layout hints: grid placement and per-breakpoint visibility. |

A reader MUST carry members of a block node it does not know unchanged: a
receipt passed through a reader must come back with every member it had.

### 2.1 Links

Link-valued props — `href` and every prop whose name ends in `Href`
(`ctaHref`, `linkHref`) — are written **root-relative to the app**: `/menu`,
`/menu/`, or `/` for the entry page, optionally followed by `?query` and
`#anchor`. A runner rewrites them into its router's form (see
[envelope §3](envelope.md#3-routing-and-links)). Absolute URLs with a scheme
(`https:`, `mailto:`), protocol-relative URLs (`//…`) and fragment-only links
(`#…`) are left as written. Assets are addressed by `src`. A link that opens
one of the app's own media files — an export's CSV, a receipt's PDF — is
written `pwpack/media/<file>` and stays a file link: it is never rewritten into
a route. A link to one of the app's public files
([pwpack-format §1.4](pwpack-format.md#14-public-files)) is written root-relative,
`/docs/guide.pdf`, and stays a file link too ([envelope §3](envelope.md#3-routing-and-links)).

### 2.2 Binding expressions

`{{name}}` binds a data source by id, `{{state.key}}` page state,
`{{item.field}}` the current item inside a repeat, `{{__loading.<id>}}` and
`{{__errors.<id>}}` a source's loading and error flags. Where expressions are
read, the names they see, their grammar, helpers and failure rules are
specified in [expressions](expressions.md). Which row fields a source's rows
have, and the `FIELD_UNKNOWN` warning for a read of one they lack, are in
[data-protocol §2.4](data-protocol.md#24-row-fields).

### 2.3 Interaction states

`style` is written inline and cannot say "on hover". Four members style a
block by state; a renderer emits them as CSS rules scoped to the block (its
copies inside a repeat included). Keys are CSS properties in camelCase, values
are CSS values (`var(--pw-…)` tokens or literals), taken as written — no
expressions.

| Member | Shape | Applies |
|---|---|---|
| `states` | `{ hover?, active?, focus? }`, each a style record | while the block is hovered, pressed, or has keyboard focus (`:focus-visible`) |
| `conditionalStates` | `{ selector, style }[]` | while the block matches `selector`, a CSS suffix appended to the block: it MUST start with `:`, `[`, `>`, `+`, `~` or a space (`:disabled`, `[aria-expanded="true"]`, `:has(> img)`); an entry with any other selector is ignored |
| `groupRoot` | boolean | marks the block as a hover source for its descendants |
| `groupStates` | `{ hover? }` | while the nearest ancestor with `groupRoot: true` is hovered; without such an ancestor it has no effect |

`conditionalStates` and `groupStates` win over a block component's own inline
styles (the reference renderer emits them `!important`); `states` do not.

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
(`{ formId, sourceId, method?, statusKeys?, successRedirect? }[]`; see
[data-protocol §4](data-protocol.md#4-writes)).

## 4. The layout

An app MAY have one **layout**: a receipt that wraps every page, so the
blocks every page shares — a navbar, a language bar, a footer, a docs
sidebar — are written once instead of on each page. It lives at
`app/layout.receipt.json` ([pwpack-format §1](pwpack-format.md#1-folder-layout));
a delivered app serves it in its envelope, named by `project.json`
`layoutReceiptFile` ([envelope §2](envelope.md#2-projectjson)).

Schema: [`schemas/receipt.layout.schema.json`](schemas/receipt.layout.schema.json)
(hand-written).

```json
{
  "blocks": [
    { "id": "nav", "type": "navbar", "props": { "links": [] } },
    { "id": "main", "type": "section", "children": [{ "type": "pw:page" }] },
    { "id": "foot", "type": "footer", "props": { "text": "© Acme Bakery" } }
  ]
}
```

**The page slot.** A layout holds exactly one block node of type `pw:page`,
at any depth (beside a sidebar, inside a section). It carries `type` and at
most an `id`: no props, no children, no `repeat`, `visibleWhen` or `if`, and
it is not inside a block that repeats. The `pw:` prefix of a block type is
reserved for the format: no block manifest names a type that starts with it
([block-manifest](block-manifest.md#rules-beyond-the-schema)).

**What a layout carries.** `blocks`, and `capabilities` — the data and state
its blocks read (a navbar's links from a source). A layout has no `title`,
`titleTemplate`, `description`, `appearance` or `layout` of its own: those
belong to the page (the layout's blocks wear the page's appearance), and the
schema refuses them. `knowledge` stays in the source, as on a page.

**Assembling a page.** A runner and a producer assemble every page the same
way ([envelope §4](envelope.md#4-per-page)), before anything else reads it:

1. A page whose receipt says `layout: false`, and every page of an app with
   no layout, is drawn as it is.
2. Otherwise the page's top-level `blocks` replace the page slot, in order:
   the slot node itself is not drawn, so the page's blocks are children of
   the slot's parent (or top-level blocks, for a slot at the top level).
3. The layout's `capabilities` join the page's: `platform/persistence`
   `dataSources` and `behaviors` are concatenated (the layout's first),
   `initialState` is merged with the page's value winning for a key both
   seed, and every other capability entry is added unless the page binds the
   same capability, whose configuration then wins.
4. Block ids and data source ids are unique in the assembled page: a page
   that repeats a block id of the layout is an error a validator reports
   (§2), and a source id both declare is refused, never shared.

The assembled page is what the rest of the format sees: query seeding and
link rewriting (envelope §3–§4), the navbar filled from `navigation.json`
and the footer band (a layout's `footer` block stands in for it, as a
page's would), the account control, the first frame, the page hints'
modules and the frame stylesheet ([pwapp-format §2](pwapp-format.md#2-the-shell)).
The layout applies to every route, to the not-found page and to the sign-in
page, unless the page opts out.

**The current page.** A block of the layout that marks the current page
(`activeHref`, [envelope §3](envelope.md#3-routing-and-links)) and does not
set `activeHref` is given the page's root-relative address (`/<key>`, `/`
for the entry page) by the runner; on the not-found page it is given `""`,
which marks no item. An `activeHref` the layout writes is kept.

**From page to page.** The layout's blocks are the same nodes on every page
(same ids, same place), so a runner SHOULD keep them mounted when the route
changes and redraw only what the page puts in the slot: a sidebar keeps its
scroll and an open menu its state. Under the static first paint every
page's frame holds the layout's blocks too, painted from the assembled page,
so hydration adopts them like any other node.

## Differences

- The reference schema for a stored surface document requires `required` on
  every capability entry, and its block-node schema drops members it does not
  name (`loadingWhen`, `errorWhen` among them). Receipts written by producers
  omit `required`, and the members it drops are carried by readers. This document
  follows the receipts: `required` is optional and block nodes are open. The
  two are therefore not paired in the conformance test.
- A persisted receipt record on a hosting platform may spell a capability
  entry `{ id, config }` instead of `{ capability, config }`. A receipt file
  conforming to this document uses `capability`.

## Conformance

- `examples/receipt/{valid,invalid}/*.json`, against the hand-written schema.
- `examples/receipt.layout/{valid,invalid}/*.json`, against the layout schema
  and the page-slot rules of §4 (`scripts/app-rules.mjs`).
- Round-trip fixtures (a receipt read and written back unchanged) are
  reserved for `fixtures/roundtrip/`.

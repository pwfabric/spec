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
| `origins` | object | no | The origins the block's own code reaches, by policy directive ([below](#origins)). Absent: none beyond what its props name. |

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
| `bindable` | boolean | no | `false`: the prop takes a literal only; a `{{…}}` expression in it, at any depth, is not resolved and renders as written, and a validator MAY warn about one ([below](#checking-placed-props)). Absent means bindable. |
| `copy` | boolean | no | `true`: the prop is words a visitor reads — a label, a heading, an accessible name. They are the app's to write, in its language ([below](#words-a-block-draws)). A copy prop SHOULD have no `default`, or `""`; a validator MAY warn when a placed block shows a non-empty default of one (`BLOCK_DEFAULT_COPY`). |
| `description` | string | SHOULD | When and how to set the prop: what it changes on screen, and which value to pick when. A composer reads it to choose a value. One or two sentences, not a restatement of `type`. |

A prop whose meaning is clear from its name and `type` (`text`, `disabled`)
MAY omit `description`. A prop whose values a composer cannot tell apart
without explanation (variants, modes, how it combines with another prop) SHOULD
carry one.

#### Checking placed props

A validator MAY check the props a receipt gives a block
([receipt §2](receipt.md#2-block-node)) against these descriptors. The checks,
and the codes the reference CLI (`pwf validate`) reports them with, are:

| Code | Finding |
|---|---|
| `BLOCK_PROP_UNKNOWN` | The prop is not named by any descriptor. |
| `BLOCK_PROP_ENUM` | The value is not in the prop's `jsonSchema` `enum` (or equal to its `const`). |
| `BLOCK_PROP_TYPE` | The value's JSON type is not one the prop's `jsonSchema` `type` accepts. |
| `BLOCK_PROP_NOT_BINDABLE` | The prop's descriptor says `bindable: false`, and a string in its value — the value itself or one nested at any depth in a list or object — carries a `{{…}}` expression. It is not resolved: the block shows the braces as written. |
| `BLOCK_DEFAULT_COPY` | The prop's descriptor says `copy: true` and gives a non-empty string `default` (or `jsonSchema.default`), and the placed block does not set the prop: the visitor reads a word the app never wrote. |

Each is a **warning**: a runtime still renders the block, ignoring an
unknown prop, typically falling back to the default for a value it does
not accept, and showing a literal prop as written. On a bindable prop, a
string carrying a `{{…}}` expression, whole or interpolated
([expressions §3.1](expressions.md#31-whole-value-and-interpolation)), is not
checked against the schema; it resolves at runtime. On a `bindable: false`
prop it does not resolve: it is reported as `BLOCK_PROP_NOT_BINDABLE`, and the
value is checked as the literal it is. A value fits `anyOf` or `oneOf` when it
fits any branch, and `allOf` when it fits every branch; nothing below the top
level of an object or array value is checked. A block whose manifest has no
`definition.props` is not checked.

#### Words a block draws

**The engine gives states and actions; the app writes every word**
([envelope §2.1](envelope.md#21-messages)). A block draws words in two ways:

- **A copy prop** (`copy: true`) — the app sets it on each placed block.
- **A word of the block's own**, which no prop carries — typically the
  accessible name of a control (a close button, a pager's "Next page", a
  carousel's "Previous slide"). The block reads it through the renderer's
  `useAppMessage(id, fallback, vars?)`, exported by `@pwfabric/runtime`
  ([pwapp-format §3](pwapp-format.md#3-the-import-map-and-shared-modules)):
  it answers the app's message for `id` (`project.json` `messages`) when the
  app sets one, else `fallback`, with `{name}`, `{code}`, `{n}` filled from
  `vars`. Outside a renderer that provides messages every id reads its
  fallback.

A prop the block already has for the same word wins over the message: a block
that offers `closeLabel` uses it when set, else `useAppMessage('ui.close',
'Close')`. A block's ids are namespaced `ui.` and named for what the word
does, shared across blocks where the word is the same: `ui.close`,
`ui.dismiss`, `ui.remove`, `ui.loading`, `ui.menu.open`, `ui.menu.close`,
`ui.pagination.first`, `ui.pagination.previous`, `ui.pagination.next`,
`ui.pagination.last`, `ui.pagination.page` (`{n}`), `ui.carousel.previous`,
`ui.carousel.next`, `ui.carousel.slide` (`{n}`). The fallback is neutral and
short. A block SHOULD say in its prop descriptors' or `knowledge`'s text which
`ui.*` ids it reads, so an app knows what to set.



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

#### `origins`

A published app's Content Security Policy allows only what the app declares
([pwapp-format §2.1](pwapp-format.md#21-content-security-policy)). An address
a block reads from a prop is in the receipt, so the policy finds it there. An
address the block's code builds itself (a map embed made from a latitude and a
zoom, a tile server, an API the block calls) is in no prop, and the policy
blocks it. The block declares it:

```json
"definition": {
  "props": [],
  "defaultProps": {},
  "canHaveChildren": false,
  "origins": { "frame": ["https://www.openstreetmap.org"] }
}
```

Each member names a directive, and its value lists the origins that directive
gains:

| Member | Directive |
|---|---|
| `connect` | `connect-src` (fetch, WebSocket, EventSource) |
| `frame` | `frame-src` |
| `img` | `img-src` |
| `media` | `media-src` |
| `font` | `font-src` |
| `style` | `style-src` |

No other member is allowed. There is no `script`: block code is verified and
loaded by the runtime ([pwapp-format §5](pwapp-format.md#5-integrity)); a block does not
fetch code.

Each entry is an **exact origin**: `http` or `https`, the host in lower case,
an optional port, and nothing after it. It must equal its own URL origin, so
`https://www.openstreetmap.org` is valid and
`https://www.openstreetmap.org/`, `https://www.openstreetmap.org/export`,
`https://*.openstreetmap.org` and `https://example.com:443` are not. A reader
refuses a manifest whose `origins` breaks this rule. The reference reader
reports it with the code `BLOCK_ORIGIN_INVALID`.

A producer adds the declared origins of every block type a page of the app
places. Blocks that a pinned pack only installs add nothing.

### `forkedFrom`

`pack` and `version` name the upstream pack build, `atomId` the upstream atom,
and `hash` the upstream source hash at fork time. A fork MUST carry a new id; a
fork that keeps the upstream id is refused by hosts that enforce provenance.

## Rules beyond the schema

**A block renders the same everywhere.** A producer renders each page's first
frame at build, outside a browser, and the browser hydrates it
([pwapp-format §2.5](pwapp-format.md#25-static-first-paint)). So a block's
render is pure: browser APIs, "now" and random values only in effects and
event handlers; the app's locale from `context.locale`, never from the
document; no layout that changes from a measurement right after it mounts. A
block that breaks the rule still works — the browser draws it — but the page
moves when it appears.

- `id` MUST equal the id derived from the manifest's path
  ([pwpack-format §1.1](pwpack-format.md#11-how-a-path-becomes-an-atom)). A
  mismatch registers an atom no consumer can resolve.
- `category` SHOULD equal the first path segment below `blocks/`.
- `definition` belongs to blocks only; `config`, `theme`, `connection`,
  `configSchema`, `scopes` and `engine` MUST NOT appear on a block manifest
  (the schema permits them because the shape is shared; the kind forbids them).
- `composesWith` entries SHOULD name atoms that exist in the pack or its
  dependencies.
- Each `definition.origins` entry MUST equal its own URL origin
  ([`origins`](#origins)). The JSON Schema checks the form with a pattern. It
  cannot catch a default port (`https://example.com:443`), which the URL
  origin drops, so the reference reader refuses that one.

## Not this format

A file named `pwfabric.manifest.json` (`manifestVersion: 1`, with `type`,
`provides`, `requires`, `entryPoints`) belongs to an earlier, pack-level
marketplace format. It is not a block manifest, and a pwpack folder does not
contain one: the list of a pack's atoms is derived from its paths.

## Conformance

- `examples/block-manifest/{valid,invalid}/*.json`, checked against the JSON
  Schema and the reference schema. Every first-party block manifest the
  reference packs ship validates.

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
| `props` | object[] | yes | One descriptor per prop ([below](#prop-descriptor)): the **only** definition of what the block takes. Descriptor members are open. |
| `defaultProps` | object | yes | Values a composer uses when it places the block — a new instance's starting props. Not a second definition of the defaults: an absent prop takes its descriptor's `default`. |
| `canHaveChildren` | boolean | yes | Container (`true`) or leaf. |
| `allowedParents` | string[] | no | Block ids that may host this block. Absent: any container. |
| `icon` | string | no | Palette glyph. |
| `traits` | kebab-case string[] | no | Traits the block carries (`form-field`, …). |
| `allowedChildTraits` | kebab-case string[] | no | A child passes if it carries any of these. Meaningful only when `canHaveChildren`. Absent: any child. |
| `origins` | object | no | The origins the block's own code reaches, by policy directive ([below](#origins)). Absent: none beyond what its props name. |

Traits are an open vocabulary: a third-party block joins a container's slot by
declaring the trait, without a central list.

#### Prop descriptor

Each entry of `definition.props` describes one prop. **The descriptors are the
single source of a block's props**: a block's code carries no schema of its
own, and a runtime reads no other definition (it applies them, [below](#applying-props)).
The members are open; these are the ones readers use:

| Member | Type | Required | Meaning |
|---|---|---|---|
| `name` | string | yes | The prop's key in a block node's `props`. A runtime MAY warn about a prop the descriptors do not name. |
| `type` | string | SHOULD | The value's type as people read it (`string`, `number`, `"sm" \| "md" \| "lg"`). Display only; machines read `jsonSchema`. |
| `required` | boolean | no | `true`: a placed block must carry the prop (it has no `default` to fall back on). |
| `default` | any | no | The value the block gets when the prop is absent. Wins over `jsonSchema.default`; SHOULD fit `jsonSchema`. |
| `jsonSchema` | object | SHOULD | The value's **shape**, in the subset below. A runtime applies it before the block renders; a validator checks receipts against it. |
| `bindable` | boolean | no | `false`: the prop takes a literal only; a `{{…}}` expression in it, at any depth, is not resolved and renders as written, and a validator MAY warn about one ([below](#checking-placed-props)). Absent means bindable. |
| `copy` | boolean | no | `true`: the prop is words a visitor reads — a label, a heading, an accessible name. They are the app's to write, in its language ([below](#words-a-block-draws)). A copy prop SHOULD have no `default`, or `""`; a validator MAY warn when a placed block shows a non-empty default of one (`BLOCK_DEFAULT_COPY`). |
| `description` | string | SHOULD | When and how to set the prop: what it changes on screen, and which value to pick when. A composer reads it to choose a value. One or two sentences, not a restatement of `type`. |

A prop whose meaning is clear from its name and `type` (`text`, `disabled`)
MAY omit `description`. A prop whose values a composer cannot tell apart
without explanation (variants, modes, how it combines with another prop) SHOULD
carry one.

#### Prop shape

`jsonSchema` is written in this subset of JSON Schema. A reader reads these
keywords and ignores any other (a validator SHOULD warn about one:
`BLOCK_PROP_DECLARATION`, below):

| Keyword | Applies to | Meaning |
|---|---|---|
| `type` | any | A JSON type, or a list of them (a union of primitives): `string`, `number`, `integer` (a number with no fraction), `boolean`, `object`, `array`, `null`. |
| `enum` / `const` | any | The allowed values. |
| `default` | any | The value of a missing member of an object prop, or of an array item's object (at the top level the descriptor's `default` is read first). |
| `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum` | number | Bounds. |
| `minLength`, `maxLength` | string | Length in code points. |
| `pattern` | string | An ECMAScript regular expression with the `u` flag; the value must match it somewhere. |
| `format` | string | `email`, `uri`, `url`, `uuid`, `date`, `date-time` or `color`. Another format is not checked. |
| `items`, `minItems`, `maxItems` | array | The shape of every item; the item count. |
| `properties`, `required`, `additionalProperties` | object | Member shapes; members that must be present (unless they have a `default`); `false` (no other member), or the shape of every other member (a record). Absent: other members are allowed and unchecked. |
| `anyOf` / `oneOf` | any | A union of shapes: the value fits when it fits one branch. |
| `description`, `title`, `examples` | any | For people and tools; not checked. A host MAY leave them out of what it serves a visitor. |

A descriptor without `jsonSchema` takes any value, unchecked.

#### Applying props

Before a block renders, the runtime applies its descriptors to the props the
receipt gives it (after expressions resolve, [expressions §3](expressions.md)):

1. A prop the receipt leaves out (or sets to `null` where the shape takes no
   `null`) gets its `default`; with none it stays absent.
2. A value of the wrong JSON type is **coerced** where that loses nothing: a
   numeric string to a `number` (an `integer` only when it has no fraction),
   `"true"` / `"false"` to a `boolean`, a number or boolean to a `string`.
   Inside an object or an array item, a missing member with a `default` gets
   it.
3. A value that still does not fit its shape is left as coerced. It is never
   replaced by the `default`: a bound value (rows read through a field
   mapping, an item missing a member) belongs to the app, and swapping it
   would draw something the app did not write.
4. Props no descriptor names pass through untouched.

So a block **reads a declared default, but MUST NOT assume a bound value's
type**. A missing prop arrives as its `default`; a present one arrives as
the receipt or the data gave it, coerced where that loses nothing, and may
still be of the wrong JSON type (a field mapping that reads a string where
the shape says `array`). A block MUST tolerate a wrong JSON type without
throwing — a list prop that is not an array draws as empty, a text prop that
is not a string draws as its string form or nothing — rather than call
`.map` on a string or read members of a number. A runtime SHOULD isolate a
block that throws anyway, so the rest of the page still draws; the reference
engine's block boundary does, and under `pwf dev` it names the props that did
not fit their shape when the block it isolates threw.

Applying props **never fails**: a value that does not fit is a developer
warning — a runtime SHOULD report it where a developer looks (the reference
engine prints it to the console under `pwf dev`, and says nothing to a
visitor) — never an error that stops the block. The step is pure (the same
props and descriptors give the same result on a server and in a browser), so
a pre-rendered page hydrates without a mismatch. A block reads its props as
applied: `props.size` is `"md"` when the receipt leaves it out and the
descriptor's default is `"md"`.

Receipts are judged **before they ship**, not in a visitor's browser: a
validator checks them against the descriptors ([below](#checking-placed-props)),
and the reference CLI does so at `pwf validate` and at `pwf build`. A visitor's
page carries no validation library: the reference engine's renderer does not
include zod, and zod is not a module a block may import
([pwapp-format §3](pwapp-format.md#3-the-import-map-and-shared-modules)). A
block that imports it is refused (reference: `BLOCK_IMPORTS_ZOD` at
`pwf validate`, `ZOD_IMPORT` when it compiles); `pwf migrate blocks` moves a
block's zod schema into its descriptors. No page applied that schema before
(a block got its props as written, and drew its own in-code fallbacks), so
the move reports where the schema disagrees with the manifest and with those
fallbacks, and writes no constraint a page never enforced unless the
manifest already had it.

#### Checking placed props

A validator MAY check the props a receipt gives a block
([receipt §2](receipt.md#2-block-node)) against these descriptors. The checks,
and the codes the reference CLI (`pwf validate`) reports them with, are:

| Code | Finding |
|---|---|
| `BLOCK_PROP_UNKNOWN` | The prop is not named by any descriptor — or a member of an array item or a nested object is not named by the prop's `jsonSchema` (`items.properties`, `properties`), where that object is closed: it names `properties` and has no `patternProperties` and no `additionalProperties` other than `false`. The finding gives the member's path (`blocks[2].props.columns[0].label`) and, when the name looks misspelled, the nearest declared one. |
| `BLOCK_PROP_ENUM` | The value is not in the prop's `jsonSchema` `enum` (or equal to its `const`). |
| `BLOCK_PROP_TYPE` | The value's JSON type is not one the prop's `jsonSchema` `type` accepts. |
| `BLOCK_PROP_SHAPE` | The value's JSON type fits, and the rest of its shape does not, as [applying props](#applying-props) reads it: a bound, a length, a pattern, a format, or a member of a nested object or array item. The runtime keeps the value as written ([applying props](#applying-props)). |
| `BLOCK_PROP_DECLARATION` | On the manifest: a descriptor's `jsonSchema` uses a keyword the [prop shape](#prop-shape) does not read, a `type` that is not a JSON type or a `pattern` that is not a regular expression, or its `default` does not fit it. |
| `BLOCK_PROP_NOT_BINDABLE` | The prop's descriptor says `bindable: false`, and a string in its value — the value itself or one nested at any depth in a list or object — carries a `{{…}}` expression. It is not resolved: the block shows the braces as written. |
| `BLOCK_DEFAULT_COPY` | The prop's descriptor says `copy: true` and gives a non-empty string `default` (or `jsonSchema.default`), and the placed block does not set the prop: the visitor reads a word the app never wrote. |

Each is a **warning**: a runtime still renders the block, ignoring an
unknown prop, passing a value it does not accept to the block as written
([applying props](#applying-props)), and showing a literal prop as written. On a bindable prop, a
string carrying a `{{…}}` expression, whole or interpolated
([expressions §3.1](expressions.md#31-whole-value-and-interpolation)), is not
checked against the schema; it resolves at runtime. On a `bindable: false`
prop it does not resolve: it is reported as `BLOCK_PROP_NOT_BINDABLE`, and the
value is checked as the literal it is; a binding anywhere inside an object or
array value leaves the whole value's shape to the runtime, but not its member
names: a template member value is skipped, and the names beside it are still
checked (`BLOCK_PROP_UNKNOWN`). A value fits `anyOf` or
`oneOf` when it fits any branch, and `allOf` when it fits every branch.
`BLOCK_PROP_TYPE` and `BLOCK_PROP_ENUM` judge the top level; `BLOCK_PROP_SHAPE`
judges the rest, nested members included, on the value as the runtime would
coerce it. A block whose manifest has no `definition.props` is not checked.

#### Words a block draws

**The engine gives states and actions; the app writes every word**
([envelope §2.1](envelope.md#21-messages)). A block draws words in two ways:

- **A copy prop** (`copy: true`) — the app sets it on each placed block.
- **A word of the block's own**, which no prop carries — typically the
  accessible name of a control (a close button, a pager's "Next page", a
  carousel's "Previous slide"). The block reads it through the renderer's
  `useAppMessage(id, fallback?, vars?)`, exported by `@pwfabric/runtime`
  ([pwapp-format §3](pwapp-format.md#3-the-import-map-and-shared-modules)):
  it answers the app's message for `id` (`project.json` `messages`) when the
  app sets one, else the block's `fallback` when it passes one, else nothing
  (`''`) — the engine writes no word of its own — with `{name}`, `{code}`,
  `{n}` filled from `vars`.

A prop the block already has for the same word wins over the message: a block
that offers `closeLabel` uses it when set, else `useAppMessage('ui.close',
'Close')`. A block's ids are namespaced `ui.` and named for what the word
does, shared across blocks where the word is the same: `ui.close`,
`ui.dismiss`, `ui.remove`, `ui.loading`, `ui.menu.open`, `ui.menu.close`,
`ui.pagination.first`, `ui.pagination.previous`, `ui.pagination.next`,
`ui.pagination.last`, `ui.pagination.page` (`{n}`), `ui.carousel.previous`,
`ui.carousel.next`, `ui.carousel.slide` (`{n}`). A fallback is the block's
own word, neutral and short. A block SHOULD say in its prop descriptors' or `knowledge`'s text which
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
| `script` | `script-src` |

No other member is allowed. A block's own module is verified and loaded by
the runtime ([pwapp-format §5](pwapp-format.md#5-integrity)) and needs no
entry. `script` is for code the block loads itself from another origin — a
vendor's map or player library — which the runtime does not verify: the
block trusts that origin with the page's full authority
([hosting-security §3](hosting-security.md#3-the-session-and-block-code)).
A block SHOULD NOT declare `script` when it can ship the code in its own
module, and a host MAY refuse or flag a block that declares it. `script`
never allows inline script or `eval`: only `<script src>` and module
imports from the listed origins.

Each entry is an **exact origin**: `http` or `https`, the host in lower case,
an optional port, and nothing after it. It must equal its own URL origin, so
`https://www.openstreetmap.org` is valid and
`https://www.openstreetmap.org/`, `https://www.openstreetmap.org/export`,
`https://*.openstreetmap.org`, `https://example.com:443` and `*` are not — in
`script` as in every other member. A reader
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

**A link a block makes is written for the router.** A runtime hands every
block `context.appHref(path)`: an app page's root-relative path
(`/webhooks?x=1`) in the host's router form ([envelope §3](envelope.md#3-routing-and-links)).
A block that builds a link itself — from markdown in a prose prop, from a
template and a row — MUST write an in-app link through it; a `href`/`*Href`
prop needs nothing, the host has rewritten it already. `appHref` returns an
absolute URL, a fragment, a media link and `""` as given, and without a
router the path as given. It does not make data safe: a link built from a row
is still checked as a link from data ([receipt §2.1](receipt.md#21-links)).

- `id` MUST equal the id derived from the manifest's path
  ([pwpack-format §1.1](pwpack-format.md#11-how-a-path-becomes-an-atom)). A
  mismatch registers an atom no consumer can resolve.
- `category` SHOULD equal the first path segment below `blocks/`.
- A block type that starts with `pw:` is the format's (the layout's page slot,
  [receipt §4](receipt.md#4-the-layout)); a block's id MUST NOT yield one.
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

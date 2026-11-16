---
status: draft
formatVersion: "1.0"
---

# The pattern atom

A **pattern** is a proven block composition: a block tree with **slots** a
caller fills, the data, page state and behaviour that tree needs, and a
knowledge brief a composer — human or model — reads to choose it. A pack ships
each one as `atoms/patterns/<name>.json`
([pwpack-format §1.1](pwpack-format.md#11-how-a-path-becomes-an-atom)). Blocks
are raw material and receipts are whole pages; a pattern is what a page is
made of.

The engine carries a pattern as an opaque JSON atom (kind `pattern`, no entry
point, payload `json-payload`): it neither expands nor validates one. Expanding
a pattern into a page is the job of a **host** that composes pages — an editor,
a studio, an app builder, a gallery. This document is the contract between the
pack that ships a pattern and every such host, so that the same file means the
same page everywhere.

Schema: [`schemas/pattern-format.schema.json`](schemas/pattern-format.schema.json)
(hand-written: the reference engine has no schema for a pattern). The rules no
JSON Schema can state are listed under [Rules beyond the schema](#5-rules-beyond-the-schema).

**Why draft.** Typed slot declarations (§3.2) are new: the first-party packs
declare every slot with a description string today, and the `field` type and
the rules about the shape of fallback rows are being adopted. The status moves
to stable when the first-party patterns use typed slots and a host expands them
by this document.

## 1. Example

```json
{
  "name": "record-list",
  "role": "band",
  "body": "dense",
  "description": "A list of the app's own records, one line each.",
  "provenPattern": "Lists of records in measured requests.",
  "knowledge": {
    "purpose": "Show a set of records one line each",
    "useCases": ["Open tickets", "Recent orders"],
    "composesWith": ["page-header"],
    "antiPatterns": ["Inventing sample records to fill the fallback"]
  },
  "mobileCollapse": "Already one column.",
  "placeholders": {
    "{{TITLE}}": "heading.text — e.g. Tickets",
    "{{ENTITY}}": "the app's entity type whose records fill the list (e.g. Ticket)",
    "{{TITLE_FIELD}}": { "description": "the row field shown as each line's text", "type": "field" },
    "{{ROWS}}": "rows shown when the app has no records yet, in the shape of the live rows; [] for none"
  },
  "usesBlocks": ["section", "heading", "repeater", "text"],
  "dataSources": [
    { "id": "records", "kind": "entity", "entityType": "{{ENTITY}}", "fallback": "{{ROWS}}" }
  ],
  "snippet": {
    "id": "{{ID}}", "type": "section", "props": {},
    "children": [
      { "id": "{{ID}}-h", "type": "heading", "props": { "text": "{{TITLE}}", "level": "h2" } },
      { "id": "{{ID}}-list", "type": "repeater", "repeat": "{{records}}", "props": {},
        "children": [{ "id": "{{ID}}-line", "type": "text", "props": { "content": "{{item.{{TITLE_FIELD}}}}" } }] }
    ]
  }
}
```

Applied with `ID = "tickets"`, `TITLE = "Open tickets"`, `ENTITY = "Ticket"`,
`TITLE_FIELD = "subject"` and `ROWS = []`, it becomes a `section` with the ids
`tickets`, `tickets-h`, `tickets-list`, `tickets-line`, a text reading
`{{item.subject}}`, and the source
`{ "id": "records", "kind": "entity", "entityType": "Ticket", "fallback": [] }`
in the page's `platform/persistence` configuration (§4).

More examples: [`examples/pattern-format/`](examples/pattern-format/) — a
layout-only band, a data-bound list, a shell with a main slot, a form with a
form binding.

## 2. Members

A host MUST understand the members marked **normative**: they change the page
a pattern expands to, or whether it can be expanded. The **informative**
members are for the people and models who choose a pattern; a host MAY show
them and MUST NOT change the expansion because of them. A reader MUST carry
members it does not know unchanged.

| Member | Type | Required | | Meaning |
|---|---|---|---|---|
| `name` | string, `[a-z0-9-]` | yes | normative | The pattern's name. It MUST equal the file stem, which is the atom id. |
| `role` | `shell` · `weave` · `band` · `part` | yes | normative | Where the pattern sits in a page (§2.1). |
| `placeholders` | object | yes | normative | Every slot the pattern carries (§3). |
| `snippet` | block node, or block node[] | yes | normative | The block tree, in [receipt](receipt.md#2-block-node) block-node form, before slots are filled (§3.3). |
| `usesBlocks` | string[] | yes | normative | Every block type the snippet places, no more, no less. A host resolves them before expanding; a type it cannot resolve makes the pattern unusable. |
| `layoutOnly` | `true` | §2.2 | normative | Arrangement and copy by intent; the pattern carries no wiring (§2.2). |
| `dataSources` | data source[] | §2.2 | normative | The pattern's sources ([data-protocol §2](data-protocol.md#2-data-sources)), slots unfilled (§2.3). |
| `initialState` | object | §2.2 | normative | Every page-state key the pattern reads or writes, seeded ([data-protocol §1.1](data-protocol.md#11-page-state)). |
| `behaviors` | behavior[] | §2.2 | normative | `{ id, event, targetBlockId?, actions[] }` ([data-protocol §1](data-protocol.md#1-declaring-data)). |
| `formBindings` | form binding[] | §2.2 | normative | `{ formId, sourceId, method?, statusKeys?, successRedirect? }` ([data-protocol §4](data-protocol.md#4-writes)). |
| `requires` | `{ connectors?: string[] }` | no | normative | Every connection name the pattern's sources name (§4, step 8). |
| `body` | `flow` · `grid` · `dense` · `split` · `any` | bands, shells | normative | The body arrangement a band belongs to, or a shell's own (§2.1). |
| `chrome` | `topbar` · `rail` · `bottombar` · `composite` · `none` | shells | normative | A shell's persistent navigation (§2.1). |
| `detail` | `doc` · `stream` | split shells | normative | A split shell's detail sub-mode (§2.1). |
| `description` | string | yes | informative | One line for people. |
| `knowledge` | object | yes | informative | `{ purpose, useCases[≥1], composesWith[], antiPatterns[≥1] }`, the same four fields as a block's brief ([block-manifest](block-manifest.md#knowledge)). `composesWith` names patterns or blocks. |
| `provenPattern` | string | SHOULD | informative | Where the composition was observed or measured. A pattern is observed, not invented. |
| `mobileCollapse` | string | bands, weaves, shells | informative | What the arrangement turns into on a narrow screen — not "it shrinks". |
| `bodies` | body[] | no | informative | The bodies a weave is legal on. |

"§2.2": a pattern carries `layoutOnly: true` or at least one of the four
wiring members, never both and never neither.

### 2.1 Role, body, chrome

`role` is structural, not a matter of naming:

| Role | Snippet | Notes |
|---|---|---|
| `band` | one node of type `section` | A full-width page slab. A section-rooted pattern is a band, and a band is section-rooted. A band declares its `body`. |
| `part` | not rooted in `section` | Goes inside a band: a card, a container, a repeater row. |
| `shell` | carries a main slot (§3.4) | The frame the bands sit in. Declares `chrome` and a `body` other than `any`; `chrome: "none"` allows only `body: "flow"`. A shell whose body is `split` declares `detail`; no other pattern does. |
| `weave` | carries a main slot (§3.4) | A body arrangement the bands of a page are laid out in. |

`body` is the axis a band shares with a shell: a band whose body is `dense`
belongs on a dense page, whatever the chrome. `any` is for bands that fit every
body (a notice). A composer SHOULD offer a band only on a page whose body it
names. A shell's `chrome` and `body` SHOULD match what its snippet builds (a
navbar at the top is a top bar, a rail block is a rail, both is a composite; a
`grid` block makes a grid body, a `split-view` a split body).

### 2.2 Wired or layout-only

The four **wiring members** — `dataSources`, `initialState`, `behaviors`,
`formBindings` — are what a pattern moves into the page besides its blocks
(§4). Most patterns carry none. So that a composer can tell a band that is
layout by intent from a list waiting for its data, every pattern says which it
is:

- **wired** — it carries at least one wiring member (even an empty one), and no
  `layoutOnly`;
- **layout-only** — `"layoutOnly": true` and no wiring member. The marker is
  the literal `true`; `false` is not a value.

A host MUST NOT expect data from a layout-only pattern. The wiring is the
pattern's constant: source ids, state keys, actions and form names are fixed
in the file. Slots carry only what differs per app — an endpoint, a path, a
field name, a page size, copy.

### 2.3 Data sources

Each source is a data source of [data-protocol §2](data-protocol.md#2-data-sources),
with slots not yet filled, and these additions:

- `id` is a lower-case identifier (`^[a-z][A-Za-z0-9]*$`): it becomes the
  binding name `{{<id>}}`, which a slot never is.
- An `entity` source names its `entityType`. Without `connector` it is the
  app's own records of that type ([data-protocol §2.2](data-protocol.md#22-entity)),
  and it MUST carry a `fallback`: a host without the app's records would
  otherwise render nothing.
- `fallback` is a list of **rows in the shape of the live rows** — objects with
  the field names the source returns, so the snippet's `{{item.<field>}}` and
  field-mapping props read the stand-in exactly as they read live data — or a
  whole-value slot (`"{{ROWS}}"`) the caller fills with such a list. A
  producer MUST NOT put invented records in a fallback slot it fills for a real
  app; `[]` is the honest value when there are none.
- A source with a `connector` SHOULD carry a `fallback`: a preview or a pack
  gallery has no connection and shows nothing without one.

## 3. Slots

### 3.1 Tokens

A **slot** is an upper-case token `{{NAME}}`, `NAME` matching `[A-Z0-9_]+`. It
is filled when the pattern is applied and is gone from the page. Lower-case
`{{…}}` are run-time [expressions](expressions.md) (`{{records}}`,
`{{state.offset}}`, `{{item.title}}`, `{{__loading.records}}`,
`{{length(rows)}}`); they are not slots and pass through expansion unchanged.

A slot MAY sit inside an expression, to put a filled name where the expression
reads one: `{{item.{{TITLE_FIELD}}}}` filled with `name` becomes
`{{item.name}}`. Where a filled field name may contain characters a path cannot
(a space, a `-` between spaces), write the bracket form:
`{{item['{{TITLE_FIELD}}']}}` becomes `{{item['Display name']}}`
([expressions §4.2](expressions.md#42-paths)).

`{{ID}}` is not a slot. It is the **id prefix** the caller supplies on every
application (§4, step 1); node ids are written on it (`{{ID}}`, `{{ID}}-h`) so
that the same pattern applied twice on one page gives unique ids. Declaring
`{{ID}}` in `placeholders` is allowed and changes nothing.

### 3.2 Declarations

`placeholders` maps each slot token (the key is written with its braces,
`"{{TITLE}}"`) to its declaration:

- a **string** — a description of a `text` slot;
- an **object** `{ description, type, optional? }` — a typed slot.
  `description` is a non-empty string; `type` is one of the slot types below
  (default `text`); `optional: true` tells the filler it may give the empty
  string. An optional slot is still substituted (§4, step 3).

| Type | Fill with |
|---|---|
| `text` | Copy: a heading, a label, a sentence. |
| `url` | A URL — an absolute `https:` URL (a REST collection) or a root-relative app link ([receipt §2.1](receipt.md#21-links)). |
| `url-template` | A URL that may carry run-time expressions (`…?offset={{state.offset}}`), left for the runtime to resolve. |
| `json-path` | A dotted path into an answer, as a source's `returns` (`data`, `payload.rows`). |
| `field` | A field name of the bound source's rows. Used in a field position — a block's field-mapping prop, `columns[].key`, or inside `{{item.…}}`. |
| `state-key` | The name of a page-state key. |

The type tells whoever fills the slot what to put there, and a composer MAY
print it beside the slot (`TITLE_FIELD (field)`). It changes nothing about
substitution. A reader that wants a slot's description reads the string, or
`description` of the object.

### 3.3 Where slots are

Slots MAY appear in any string of the `snippet` (props, style, `id`,
`repeat`, `visibleWhen`, …) and of the four wiring members (an endpoint,
`"{{COLLECTION}}?limit={{PAGE_SIZE}}"`; an `entityType`; a whole `fallback`).
Every slot that appears there MUST be declared; a declared slot SHOULD appear
there (the main slot of §3.4 excepted). Slots in `description`, `knowledge`,
`provenPattern`, `mobileCollapse` and in the declarations themselves are text,
not slots.

A snippet's node `children` is always a list of nodes, never a slot: a pattern
gives concrete children.

### 3.4 The main slot

A shell or a weave declares a **main slot** — `{{MAIN}}` in a shell,
`{{BANDS}}` in a weave — where the caller's blocks land. It is not a token in
the snippet: it is the **first node, depth first in document order, whose
`children` is an empty list**. A pattern that declares `{{MAIN}}` or
`{{BANDS}}` MUST have such a node. Other names a shell declares for further
regions (`{{RAIL}}`, `{{ASIDE}}`) are documented the same way; a host that
fills only one region fills the main slot.

## 4. Applying a pattern

A host that expands a pattern into a page MUST do the following, in order.

1. **Choose the id prefix** `ID`: a string not used as an id, or as the start
   of one, on the page. It replaces `{{ID}}` everywhere.
2. **Collect a value for every declared slot.** A slot without a value is an
   **error**: the host MUST NOT expand the pattern (its token would otherwise
   reach the page as raw text, or the wire as part of a URL). The empty string
   is a value.
3. **Substitute** in every string of `snippet` and of the four wiring members:
   - a string that is **exactly one** slot (`"{{COLUMNS}}"`, `"{{ROWS}}"`) is
     replaced by the filled value **with its JSON type** — a list stays a list,
     a number a number;
   - a slot inside a longer string is replaced by the filled value as text; the
     filled value MUST then be a string, a number or a boolean;
   - nothing else is touched: lower-case expressions, and text outside the
     tokens, are kept byte for byte.
4. **Check** that no slot token (`{{[A-Z0-9_]+}}`) is left in the expanded
   snippet or wiring. One left is an error, as in step 2.
5. **Place the caller's blocks**, for a shell or weave, as the `children` of
   the main-slot node (§3.4).
6. **Insert the blocks**: the expanded snippet (a node, or each node of a
   list) goes into the page's block tree where the caller placed it.
7. **Move the wiring into the page**: `dataSources`, `initialState` and
   `behaviors` into the page's `platform/persistence` configuration
   ([data-protocol §1](data-protocol.md#1-declaring-data)), `formBindings`
   into its `platform/entities` configuration
   ([data-protocol §4](data-protocol.md#4-writes)). A source id already
   declared on the page MUST NOT be silently shared: the host either renames
   the pattern's source and every reference to it inside the expanded pattern
   (`{{<id>}}`, `__loading.<id>` and the other condition names, `refresh`
   actions, `formBindings[].sourceId`) or refuses. State keys are merged; a key
   the page already seeds is state the two share.
8. **Check the connections**: every name in `requires.connectors` SHOULD be a
   connection of the app ([definitions](definitions.md)). A missing one is
   reported to the author; the page still renders, and the source draws its
   `fallback`.

A host that shows a pattern without applying it (a catalogue entry, a
thumbnail) MAY skip all of this and render its `knowledge` instead.

*Informative.* The retired reference expander did steps 1–4 on the JSON text:
`/\{\{([A-Z0-9_]+)\}\}/g`, with a whole-value match replaced by the JSON of
the filled value. Any implementation that gives the same result conforms.

## 5. Rules beyond the schema

The JSON Schema checks each member's shape, the role rules of §2.1, wired ⊕
layout-only, the slot types and the entity-source fallback. These rules
compare one part of a pattern with another; they are checked by
[`scripts/pattern-rules.mjs`](scripts/pattern-rules.mjs), which the
conformance test runs beside the schema:

- Every slot carried in the snippet or a wiring member is declared in
  `placeholders` (`{{ID}}` excepted) — §3.3.
- A declared `{{MAIN}}` or `{{BANDS}}` has its main-slot node — §3.4.
- `usesBlocks` names exactly the block types the snippet places (walking
  `children` only; a prop named `type` is not a block).
- Node ids in the snippet are unique, compared as written (`{{ID}}-c` twice is
  a duplicate on every page).
- Source ids are unique. A behavior's `targetBlockId`, and a `showBlock` /
  `hideBlock` action's `blockId`, are node ids of the snippet; a `refresh`
  action's `sourceId` and a form binding's `sourceId` are ids of the pattern's
  own sources; a form binding's `formId` is a node id of the snippet. The
  comparison is textual, before expansion: `{{ID}}` is substituted in both
  places alike.
- Every page-state key the pattern reads (`{{state.<key>}}` in the snippet, a
  source or a behavior) or writes (a block's literal `stateKey` prop, a
  `setState` action's `key`, a form binding's `statusKeys` values) is seeded in
  `initialState`. A state key is a pattern constant; a `stateKey` prop SHOULD
  NOT be a slot, since the key could not be seeded by name.
- Every `connector` a source names is listed in `requires.connectors`.

And these, which need the block catalogue, are the pack's to check:

- every prop the snippet sets is one the block reads, and `children` are given
  only to blocks that can have them ([block-manifest](block-manifest.md#definition));
- `{{item.…}}` is read only below a node that carries `repeat`
  ([expressions §5](expressions.md#5-repeat));
- a `field` slot is used only in a field position (§3.2), and a fallback's rows
  carry the fields the snippet reads from the source.

## Conformance

- `examples/pattern-format/{valid,invalid}/*.json`, checked against the JSON
  Schema and the rules of §5: every valid example passes both; every invalid
  one is refused by one of them.
- Every first-party pattern the reference packs ship validates against the
  JSON Schema and passes the rules of §5.
- A host conforms when, for a pattern and a set of slot values, it produces the
  blocks and the configuration §4 describes, and refuses a pattern with an
  unfilled slot.

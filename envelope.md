---
status: stable
formatVersion: "1.0"
---

# The envelope

The **envelope** is an app as a runner reads it: plain JSON files fetched at
load time from a folder path or an absolute URL — never compiled in. It is what
a host serves under `pwpack/` in a published app (see
[pwapp-format](pwapp-format.md)), and what a self-hosted app is made of. This
document specifies which files a runner reads, `project.json`, how routes and
links work, what a runner does to each page before handing it to the
renderer, and the two module manifests.

Schemas: [`envelope`](schemas/envelope.schema.json) (`project.json`),
[`envelope.auth`](schemas/envelope.auth.schema.json),
[`envelope.blocks-manifest`](schemas/envelope.blocks-manifest.schema.json),
[`envelope.engines-manifest`](schemas/envelope.engines-manifest.schema.json) —
all hand-written; the engine types these documents but has no reference schema
for them. `navigation.json`, `appearance.json` and `connections.json` use the
[definitions](definitions.md) schemas.

## 1. Files

Relative to the envelope location `source`:

| File | Required | Specified in |
|---|---|---|
| `project.json` | yes | §2 |
| `surfaces/<key>.receipt.json` (or as mapped by `surfaceReceiptFiles`) | one per page | [receipt](receipt.md) |
| `navigation.json` | no | [definitions](definitions.md#navigationjson) |
| `appearance.json` | no | [definitions](definitions.md#appearancejson) |
| `connections.json` | no | [definitions](definitions.md#connectionsjson) |
| `auth.json` | no — present only when the app has a way in | [session-protocol](session-protocol.md#2-authjson) |
| `media/<file>` | no | media copied into the app |

Relative to the shell (the `blocks` and `engines` locations):

| File | Required | Specified in |
|---|---|---|
| `blocks/manifest.json` | yes | §5 |
| `engines/manifest.json` | no | §6 |

A runner MUST fetch `project.json` and `blocks/manifest.json` and fail if
either is missing. Each optional file that is absent or unreadable MUST be
treated as not declared, never as an error. Paths in the envelope are relative
and base-independent: an envelope MUST NOT contain a host's own publishing
paths.

## 2. `project.json`

```json
{
  "schemaVersion": "1.0.0",
  "id": "example-analytics",
  "title": "Example Analytics",
  "entrySurfaceId": "home",
  "surfaceOrder": ["home", "people"],
  "surfaceReceiptFiles": { "home": "surfaces/home.receipt.json", "people": "surfaces/people.receipt.json" },
  "identity": { "required": false, "topology": "app", "methods": [] }
}
```

| Member | Type | Required | Meaning |
|---|---|---|---|
| `entrySurfaceId` | string | yes | Page key of the entry page. Despite the name it is a page **key** (`home`), not a storage id. |
| `surfaceOrder` | string[] (≥ 1) | yes | Every page key, in order. This is the route table. |
| `surfaceReceiptFiles` | `{ key: path }` | no | Page key → receipt path relative to `source`. Absent: `surfaces/<key>.receipt.json` for every key. |
| `notFoundSurfaceId` | string | no | Key of the app's own not-found page (§3). Its receipt is in `surfaceReceiptFiles`; it is not in `surfaceOrder`, because it is not a route. |
| `id` | string | no | The app's id; keys per-app browser storage (§4). |
| `title` | string | no | Document title and prefix of every page title. |
| `description` | string | no | The app in a sentence, for a search result or a link preview: the document's `<meta name="description">` on every page that states none of its own (§4). |
| `locale` | string | no | The app's locale, a BCP 47 tag (`en-GB`) — from `app/plan.json` `locale`. Dates and numbers on its pages are written in it ([expressions §6](expressions.md#6-helpers)); absent, in the visitor's. |
| `schemaVersion` | string or number | no | Producers write `"1.0.0"`. A runner MUST NOT branch on it. |
| `identity` | `{ required, topology?, methods?, door? }` | no | Who may see the pages, frozen at publish: `required` gates rendering; `topology` is `app` or `external`; `methods` lists the app door's ways in; `door: false` says the envelope has no `auth.json` (no way in — a build no host serves), so a runner MUST NOT ask for it. Absent `door`: the app has one. |

Members a runner does not read MUST be ignored (producers write, for example,
the hosting platform's own ids).

## 3. Routing and links

A page is a key in `surfaceOrder`. Routing is one rule in both modes: the
location names a key, or it names nothing and the runner renders its not-found
page. A runner MUST NOT fall back to the entry page for an unknown location.

**The not-found page.** When `project.json` declares `notFoundSurfaceId`, the
not-found page is that receipt, rendered at the address that named nothing
exactly as a page is (§4): inside the app's shell, with its navigation filled
and its account control placed, so the reader is still in the app. Only
without one, or when it cannot be fetched, does the runner draw its own page.

**A page whose record is not there.** A detail page names its record in its
address (`#/dish?id=9`). A data source that declares `notFoundWhenEmpty`
([data-protocol §2](data-protocol.md#2-data-sources)) is that record: when it
settles with no record — a 404, no row, or idle because the value it needs is
empty — the runtime tells the host, and the runner renders the not-found page
in place of the page, at the same address. A refused read or a server error is
not "not found"; the page shows its error state.

- **Hash mode** (default; works on every static host): `#/<key>`. `#/` and no
  fragment mean the entry page. A fragment without the slash (`#section`) is an
  in-page anchor, not a route. A route may carry a query and an anchor, in that
  order: `#/product?id=12#reviews`.
- **Path mode**: `<base>/<key>`, where `<base>` is the shell's `<base href>`.
  Needs the host's SPA fallback (see [pwapp-format](pwapp-format.md#1-the-served-folder)).

Following an in-page anchor (`#section`, by a link, a block or a `navigate`
action) MUST keep the page: the runner scrolls to the element with that id and
the address goes on naming the page, so a reload lands on it at the anchor. In
hash mode the runner writes the anchor onto the current route, query kept
(`#/product?id=12` → `#/product?id=12#reviews`); in path mode it stays on the
current path and query, although `<base href>` would resolve `#section` against
the entry page. `#` alone names the top of the page. Such a jump SHOULD scroll
smoothly and MUST NOT animate when the reader prefers reduced motion.

Before rendering, a runner rewrites every link of the page — `href` and every
prop whose name ends in `Href`, a `navigate` action's `url` (in a block's
`action` or a behavior) and a form binding's `successRedirect` — from the root-relative form
of [receipt §2.1](receipt.md#21-links) into its router's form. An internal link
to an unknown key is still rewritten, so it lands on the in-app not-found page.
A link to the app's own media — `pwpack/media/<file>`, also written
`/pwpack/media/<file>` or `./pwpack/media/<file>` — is a file, not a page: the
runner writes it as the relative path `pwpack/media/<file>`, against the
shell's base, in both modes, and never as a route.

A link whose value **starts with an expression** (`"href": "{{item.url}}"`)
names a page only once its data is in, so it is not rewritten before
rendering: the runner rewrites it, by the same rule, when the expression has
been resolved. A link that starts with a literal path and carries expressions
after it (`/session?id={{item.id}}`) is rewritten before rendering, as written.

## 4. Per page

For each route, a runner:

1. stops if the app is gated — `identity.required` and no session (see
   [session-protocol](session-protocol.md#5-the-gate));
2. fetches the page's receipt, presenting the visitor's credential as
   specified in [session-protocol §7](session-protocol.md#7-credentials-on-requests);
3. seeds page state from the address query (below);
4. rewrites links (§3);
5. fills empty navbars from `navigation.json` and sets a navbar's empty
   `logoHref` to the entry page;
6. places the account control (see session-protocol);
7. sets the document title (see [receipt §1](receipt.md#1-document)) and the
   document's `<meta name="description">`: the page's `description` (its
   expressions resolved like the title's), else the project's; until a
   template resolves to text the project's is used, never the template, and
   with neither the element is removed;
8. renders the receipt with the renderer, passing the block manifest, the
   app-wide appearance (when `appearance.json` declares one, it overrides the
   page's own), and the data configuration of [data-protocol](data-protocol.md).

**Query seeding.** A query parameter seeds `state.<key>` only if the page reads
`state.<key>` somewhere in its receipt, or declares `<key>` in `urlState`. Never seeded: the reserved keys
`auth_error`, `code`, `state`, `error`, `error_description`, `error_uri`,
`session_state`, `iss`, `returnTo`; keys starting with `__`; `constructor` and
`prototype`; a form binding's status keys; and
keys read in a data source endpoint's scheme or host part, or in an endpoint
that is a single expression. Values stay strings, the first of a repeated key
wins, values are cut at 512 characters, and `.` or `..` become `''`. Seeds are
merged into the `platform/persistence` `initialState` (the capability is added
when the page has none). A change that only touches the query re-renders only
if it changes the seed.

**The page's address.** A page's query is its route's query: `location.search`
in path mode and the query inside the fragment (`#/<key>?<query>`) in hash
mode. Two things a page keeps there are written back by the runtime through
the runner, keeping the page and the anchor and firing no navigation:

- the keys the page declares in `urlState`
  ([data-protocol §1](data-protocol.md#1-declaring-data)): seeded like any read
  key (they are seeded even when no expression names them), and written back
  whenever they change, **replacing** the history entry; `''` or `null`
  removes the key;
- a split shell's selection, under its `selectionKey`: written back, **pushing**
  a history entry, so Back undoes a selection. The selection is page state
  too, `{{state.<selectionKey>}}`, and a selection naming an item the shell does
  not have is no selection (`null`).

A runner MUST NOT write the selection or `urlState` to `location.search` in
hash mode: there it sits beside the route, where the page cannot read it.

**Per-app storage.** A runner keys browser storage by `appId` = `project.id`,
else `project.title`, else `"app"`. Two apps on one origin SHOULD therefore
carry distinct ids.

## 5. `blocks/manifest.json`

```json
[{ "blockType": "navbar", "moduleUrl": "blocks/navbar.a3f1c2d4.mjs",
   "integrity": "a3f1c2d4…", "publisher": "example", "publisherVerified": true,
   "definition": { "name": "navbar",
                   "props": [{ "name": "links" }, { "name": "stateKey", "bindable": false }] } }]
```

One entry per block type the pages use. `blockType` is the join key with a
block node's `type`; `moduleUrl` is relative to the shell; `integrity` is the
module's SHA-256 as lower-case hex or SRI `sha256-<base64>`. A renderer MUST
verify `integrity` before evaluating a module and MUST fail that block on a
missing or mismatching hash. How a renderer presents a block type a page uses
but the manifest does not list is not specified by this version; a publisher
SHOULD list every type its pages use.

`definition.props` lists the props the block's manifest declares
([block-manifest, prop descriptor](block-manifest.md#prop-descriptor)), each
reduced to its `name` and, when the manifest gives one, `bindable`. A renderer
reads it before the module loads: a prop whose entry says `bindable: false` is
passed to the block exactly as written — a `{{…}}` in it, or anywhere inside
an object or list value, is not resolved. A prop the list does not name, or a
block without `definition.props`, is bindable. A publisher SHOULD carry
`definition.props` for every block whose manifest declares props.

## 6. `engines/manifest.json`

One entry per connector or provider engine the app ships:
`{ connection, atomId, kind: "connector" | "provider" }` plus **either**
`moduleUrl` + `integrity` (a compiled engine, verified like a block module)
**or** `engine` (a [declaration](connector-manifest.md#3-the-engine-declaration))
— never both, never neither. `connection` names the entry of `connections.json`
the engine serves; a runner carries a declared engine onto that connection
unless the connection already carries its own. An entry naming a connection
`connections.json` does not declare MUST NOT create one.

## 7. Versioning

The envelope has no engine-version field. Compatibility is carried by the
runtime files served beside it (the runner and renderer the publisher
included) and by block modules pinned by hash. The only compatibility rule in
the format itself is the `surfaceReceiptFiles` fallback of §2.

## Conformance

- `examples/envelope/`, `examples/envelope.auth/`,
  `examples/envelope.blocks-manifest/`, `examples/envelope.engines-manifest/`,
  against the hand-written schemas.
- A served envelope with expected routes, rewritten links and seeded state is
  reserved for `fixtures/roundtrip/`.

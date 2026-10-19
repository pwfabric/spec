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
  "id": "cadence",
  "title": "Cadence",
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
| `id` | string | no | The app's id; keys per-app browser storage (§4). |
| `title` | string | no | Document title and prefix of every page title. |
| `schemaVersion` | string or number | no | Producers write `"1.0.0"`. A runner MUST NOT branch on it. |
| `identity` | `{ required, topology?, methods? }` | no | Who may see the pages, frozen at publish: `required` gates rendering; `topology` is `app` or `external`; `methods` lists the app door's ways in. |

Members a runner does not read MUST be ignored (producers write, for example,
the hosting platform's own ids).

## 3. Routing and links

A page is a key in `surfaceOrder`. Routing is one rule in both modes: the
location names a key, or it names nothing and the runner renders its not-found
page. A runner MUST NOT fall back to the entry page for an unknown location.

- **Hash mode** (default; works on every static host): `#/<key>`. `#/` and no
  fragment mean the entry page. A fragment without the slash (`#section`) is an
  in-page anchor, not a route. A route may carry a query and an anchor, in that
  order: `#/product?id=12#reviews`.
- **Path mode**: `<base>/<key>`, where `<base>` is the shell's `<base href>`.
  Needs the host's SPA fallback (see [pwapp-format](pwapp-format.md#1-the-served-folder)).

Before rendering, a runner rewrites every link of the page — `href` and every
prop whose name ends in `Href`, a `navigate` action's `url` (in a block's
`action` or a behavior) and a form binding's `successRedirect` — from the root-relative form
of [receipt §2.1](receipt.md#21-links) into its router's form. An internal link
to an unknown key is still rewritten, so it lands on the in-app not-found page.

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
7. sets the document title (see [receipt §1](receipt.md#1-document));
8. renders the receipt with the renderer, passing the block manifest, the
   app-wide appearance (when `appearance.json` declares one, it overrides the
   page's own), and the data configuration of [data-protocol](data-protocol.md).

**Query seeding.** A query parameter seeds `state.<key>` only if the page reads
`state.<key>` somewhere in its receipt. Never seeded: the reserved keys
`auth_error`, `code`, `state`, `error`, `error_description`, `error_uri`,
`session_state`, `iss`, `returnTo`; keys starting with `__`; `constructor` and
`prototype`; a split view's selection key; a form binding's status keys; and
keys read in a data source endpoint's scheme or host part, or in an endpoint
that is a single expression. Values stay strings, the first of a repeated key
wins, values are cut at 512 characters, and `.` or `..` become `''`. Seeds are
merged into the `platform/persistence` `initialState` (the capability is added
when the page has none). A change that only touches the query re-renders only
if it changes the seed.

**Per-app storage.** A runner keys browser storage by `appId` = `project.id`,
else `project.title`, else `"app"`. Two apps on one origin SHOULD therefore
carry distinct ids.

## 5. `blocks/manifest.json`

```json
[{ "blockType": "navbar", "moduleUrl": "blocks/navbar.a3f1c2d4.mjs",
   "integrity": "a3f1c2d4…", "publisher": "acme", "publisherVerified": true,
   "definition": { "name": "navbar" } }]
```

One entry per block type the pages use. `blockType` is the join key with a
block node's `type`; `moduleUrl` is relative to the shell; `integrity` is the
module's SHA-256 as lower-case hex or SRI `sha256-<base64>`. A renderer MUST
verify `integrity` before evaluating a module and MUST fail that block on a
missing or mismatching hash. How a renderer presents a block type a page uses
but the manifest does not list is not specified by this version; a publisher
SHOULD list every type its pages use.

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

---
status: draft
formatVersion: "1.0"
---

# The connector manifest

A **connector** is a data engine: what turns "the `Product` collection of the
connection called `shop`" into HTTP requests against somebody's API. A
**provider** is the same thing for one entity of a vendor that serves many
(`providers/<vendor>/entities/<entity>`). Both are atoms whose manifest is a
knowledge file — `atoms/connectors/<Name>.knowledge.json` and
`atoms/providers/<vendor>/entities/<entity>.knowledge.json` — that says which
connection name the engine answers to, which settings that connection takes,
which delegated permissions it needs, and, increasingly, the engine itself as a
**declaration**: seven facts about the API, and no code.

Schema: [`schemas/connector-manifest.schema.json`](schemas/connector-manifest.schema.json)
(generated from the reference schema `AtomFileManifestSchema`, narrowed to
`kind` `connector` or `provider`).

**Why draft.** Three parts are still moving. (1) The knowledge files packs
ship today predate this shape: they carry no `id`, `version` or `state` and add
catalogue-only members, so none of them validates (see
`examples/connector-manifest/invalid/knowledge-file-without-identity.json`).
Whether a reader derives the missing identity from the path and the pack, or
the files are brought up to the shape, is open. (2) A declared engine does not
yet support updates. (3) The set of named value transforms (§3.4) is closed and
will grow.

## 1. Members

All members of the [block manifest](block-manifest.md#members) apply (the
manifest is closed), with:

- `kind` is `connector` or `provider`.
- `id` is `<Name>` for a connector and `<vendor>.<entity>` for a provider
  (derived from the path, see [pwpack-format §1.1](pwpack-format.md#11-how-a-path-becomes-an-atom)).
- `category` and `definition` are absent.

and four kind-specific members, all OPTIONAL:

| Member | Type | Meaning |
|---|---|---|
| `connection` | non-empty string | The connection name this engine answers to — the value a connection's `connector` (or a data source's `connector`) is matched against. |
| `configSchema` | `{ fields: ConfigField[] }` | The settings a connection of this engine takes (where the source is — never who we are). Same shape as a capability's [`config`](capability-manifest.md#configfields). |
| `scopes` | `{ name, adminConsent?, reason? }[]` | Delegated permissions the engine needs. Absent means **needs none** — a positive statement. `adminConsent` absent means "not stated", which is not `false`. |
| `engine` | engine declaration | The engine as data (§3). Absent: the engine is compiled from the sibling source file (`<Name>.ts`). |

A declaration is not a grant. `scopes` says what an engine needs; consent
stays with the user and the identity provider.

## 2. Two ways to ship an engine

- **Compiled.** The engine's source travels as inert cargo beside the
  knowledge file (`connectors/<Name>.ts`; for providers also the vendor's shared
  `providers/<vendor>/index.ts`). A publisher compiles it into an ES module; a
  delivered app lists it in `engines/manifest.json` with `moduleUrl` and
  `integrity` (see [envelope](envelope.md#enginesmanifestjson)). A failure to
  compile a connector or provider MUST NOT fail the publish; the atom ships
  knowledge-only and the publisher reports a warning.
- **Declared.** The manifest's `engine` member is the engine. Nothing is
  compiled; a delivered app lists the declaration in `engines/manifest.json`
  under `engine`, and the runtime builds the engine from it.

## 3. The engine declaration

```json
{
  "host": "{baseUrl}",
  "path": "/{entityType}",
  "params": { "format": "json" },
  "auth": { "type": "none" },
  "read": { "items": "{itemsPath}", "id": "{idField}", "flatten": "*" },
  "write": { "bodyWrap": "data" },
  "transforms": [{ "field": "price", "use": "numeric-string" }]
}
```

| Member | Required | Meaning |
|---|---|---|
| `host` | yes | Origin and path prefix, as a template (`graph.example.com/v1.0`, `{baseUrl}`). |
| `resolve` | no | Pre-flight `{ path, field, as }`: request `path`, read `field` from the answer, bind it as `{as}` for `path`. |
| `path` | yes | Collection path template; `{entityType}` plus any `resolve.as` binding. |
| `params` | no | Fixed query parameters the API requires. |
| `auth` | yes | `{ type: "bearer" \| "api-key" \| "basic" \| "none" }` — the **kind** of credential, never a credential. |
| `read` | yes | `{ items, id, flatten?, lift? }`: where the rows are, which field is the id, which nested object to spread into the row (`"*"` = the row is the item itself), and which top-level fields to keep beside it. |
| `write` | no | `{ bodyWrap? }`: the member a created row is wrapped in. |
| `transforms` | no | `{ field, use }[]`: named value transforms applied to row fields. |

The declaration is closed at every level. **Nothing executable may appear in
it**: no functions, expressions or template language beyond `{name}`
substitution.

### 3.1 Templates

`{name}` in `host`, `path`, `resolve.path`, `read.items`, `read.id` and
`read.flatten` is replaced by the connection's `config` value of that name
(string values only); `{entityType}` by the collection being addressed; and
`{as}` by the pre-flight's result. A placeholder with no value is left as
written (visible), not blanked. After substitution the host's scheme, if any, is
removed and `https://` is prepended: a reader MUST NOT send a declared engine's
requests over plain HTTP, with one exception for development. A host that
states `http://` explicitly is kept as `http://` when its name is loopback —
`localhost`, `127.0.0.1`, `[::1]` or a name ending in `.localhost` — so an
engine can reach a development server. An explicit `http://` on any other host
is treated like no scheme: the request goes to `https://`. A reader MUST NOT
send it over plain HTTP. The
`https://` in the request rows below reads `http://` for an allowed loopback
host.

### 3.2 Requests

| Operation | Request |
|---|---|
| list | `GET https://<host><path>?<params>` — no other query parameters. Rows are read from `read.items` (a dotted path) and mapped: `{ id: item[read.id], …lift, …flatten }`, then transformed. The page's filter, sort and pagination are applied by the reader to the mapped rows. |
| read one | the list, then the row whose `id` matches. |
| create | `POST https://<host><path>` with the row (after transforms), wrapped as `{ [bodyWrap]: row }` when `write.bodyWrap` is set. The answer is mapped like a list item. |
| delete | `DELETE https://<host><path>/<id>`. |
| update | not supported by a declared engine; a reader MUST report it as unsupported, not silently drop it. |

The pre-flight result is cached per resolved request URL; a failed pre-flight
is not cached.

### 3.3 Credentials

- `bearer`: the reader attaches `Authorization: Bearer <token>` with the
  visitor's live token for this app (see
  [session-protocol](session-protocol.md)); with no token, the request goes
  without the header and the API's refusal is reported.
- `none`: the reader MUST NOT attach any credential.
- `api-key`, `basic`: the declaration states only the kind; where the value
  comes from is the host's business and is not part of this format.

### 3.4 Transforms

`use` names a transform from a closed list. A reader MUST refuse a declaration
naming a transform it does not know, rather than pass values through: a
silently skipped transform looks exactly like a field the source never sent.

| Name | Effect |
|---|---|
| `numeric-string` | A non-empty string that parses as a number becomes that number. |
| `hosted-file-url` | A JSON string `{ serverUrl, serverRelativeUrl }` becomes the absolute URL `serverUrl + serverRelativeUrl`. |

## Rules beyond the schema

- `id` MUST equal the path-derived id.
- `configSchema` field keys MUST be unique; every `{name}` a template uses
  (other than `entityType` and `resolve.as`) SHOULD be a `configSchema` key.
- A manifest whose prose (`knowledge`, `description`) names a permission that
  is missing from `scopes` SHOULD be refused at publish: the list, not the
  prose, is the statement.

## Differences from the reference engine

- The reference runtime currently builds a declared engine's transport with
  bearer authentication even when the declaration says `none`, so a visitor's
  token, when one exists, can be attached to a `none` host. §3.3 forbids that;
  the runtime is the one to change.

## Conformance

- `examples/connector-manifest/{valid,invalid}/*.json`, checked against the
  JSON Schema and the reference schema.
- `examples/envelope.engines-manifest/` — how a delivered app lists compiled
  and declared engines.

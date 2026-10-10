---
status: draft
formatVersion: "1.0"
---

# The data protocol

A page that shows or collects data declares **data sources** in its receipt,
and the runtime fetches over HTTP. This document specifies the declaration (the
`platform/persistence` capability's configuration), how each kind of source is
served, the query language the runtime applies, how forms write, and the
record endpoints a session server exposes for an app's own records — so that a
host can implement the server side, and another runtime the client side.

Schemas: [`schemas/data-protocol.schema.json`](schemas/data-protocol.schema.json)
(the persistence configuration; generated from the reference schema
`persistenceCapabilityConfigSchema`) and
[`schemas/data-protocol.records.schema.json`](schemas/data-protocol.records.schema.json)
(the record list answer; hand-written).

**Why draft.** The record endpoints (§5) are restated from one session server,
aggregate sources (§2.3) are new, and the write path has two vocabularies
(a source's `method` cannot say `PATCH`, while record updates use it; §4). The
status moves to stable when a second server implements §5 and the write
vocabulary is settled.

## 1. Declaring data

A receipt binds `platform/persistence` with:

```json
{
  "dataSources": [
    { "id": "Product", "kind": "rest", "method": "GET",
      "endpoint": "https://api.example.com/v1/records/Product",
      "authProviderRef": "https://api.example.com/v1", "returns": "data",
      "query": { "sort": [{ "field": "name", "direction": "asc" }] } }
  ],
  "initialState": { "selected": null },
  "behaviors": [{ "id": "reload", "event": "block:click", "targetBlockId": "refresh", "actions": [{ "type": "refreshAll" }] }]
}
```

| Member | Meaning |
|---|---|
| `dataSources` | The page's sources (§2). |
| `initialState` | Initial page state, read as `{{state.<key>}}`. A runner may seed it from the address (see [envelope §4](envelope.md#4-per-page)). |
| `behaviors` | `{ id, event, targetBlockId?, actions[] }` — when `event` fires (optionally only from that block), run the actions: `setState { key, value }`, `refresh { sourceId }`, `refreshAll`, `showBlock { blockId }`, `hideBlock { blockId }`, `navigate { url }` (http(s) or relative only). Events are written `block:click` (colon form). |
| `defaultCacheTtl`, `maxRetries`, `timeout`, `persistenceEnabled`, `storageKey` | Runtime tuning. |

Unknown members are carried. The `platform/entities` capability binds form
writes: `formBindings: { formId, sourceId, statusKeys? }[]` — the form named by
`formId` submits through the source named by `sourceId`.

## 2. Data sources

| Member | Meaning |
|---|---|
| `id` | The source's key; `{{<id>}}` binds its data, `{{__loading.<id>}}` and `{{__errors.<id>}}` its state. |
| `kind` | `rest` · `static` · `state` · `entity` |
| `endpoint`, `method` | `rest`: the collection URL (expressions `{{state.x}}` are resolved first) and verb (`GET` unless stated; `POST`, `PUT`, `DELETE`). |
| `returns` | `rest`: dotted path to the rows in the answer (`data`, `payload.rows`); absent when the answer **is** the array. A named path that is missing is an error. |
| `authProviderRef` | A **name** the host answers with a live token (see [session-protocol §7](session-protocol.md#7-credentials-on-requests)); never a credential. |
| `query` | `{ filter?, sort?, pagination? }` (§3). |
| `entityType`, `connector` | `entity`: which collection, and which connection serves it. |
| `aggregate` | `entity`: `{ fn: count \| sum \| avg, field?, filter? }` — ask for one number instead of rows (§2.3). |
| `staticData` | `static`: the data itself. |
| `refreshInterval` | Re-fetch period. |
| `fallback` | Bound as the data when the source cannot be served; the error flag stays set, so a page can say it shows sample data. |

### 2.1 `rest`

A runtime sends `<method> <endpoint>` with `Content-Type: application/json`,
the source's own `headers`, and `Authorization: Bearer <token>` only when
`authProviderRef` resolves to a token. It MUST send `credentials: "omit"`
unless the endpoint's origin is one the host explicitly configured as its own
cookie-authenticated API. It plucks `returns` from the answer and then applies
`query` (§3) to the rows. A non-2xx answer is an error carrying the status and,
when the body is `{ error: { code, message } }`, that code and message.

### 2.2 `entity`

An `entity` source is served by an **entity facade**: `connector` names a
connection of `connections.json`, whose engine (compiled or
[declared](connector-manifest.md#3-the-engine-declaration)) performs the
request. Without `connector` the reference runner uses the connection named
`graph-lists`. A runner builds the facade only when there is a live sign-in
or some declared engine says `auth.type: "none"`; otherwise entity sources draw
their `fallback`. A page whose receipt binds `platform/entities` with no facade
MAY be served by an in-memory facade that forgets everything on reload.

A publisher that hosts the app's records MAY rewrite an `entity` source with no
`connector` into a `rest` source against its record endpoints (§5):
`{ kind: "rest", endpoint: "<base>/records/<entityType>", method: "GET",
authProviderRef: "<base>", returns: "data" }`.

### 2.3 Aggregates

An `entity` source with `aggregate` binds `{ fn, field?, value, count }`, so
`{{<id>.value}}` is the number. `count` needs no field; `sum` and `avg` reduce
`field`; `filter` uses the `query.filter` shape. Over HTTP it is
`GET <collection>/count` (plain count) or
`GET <collection>/aggregate?fn=<fn>&field=<field>&filter=<json>`, answered
`{ data: { fn, field?, value, count } }` (or the bare object).

## 3. Query language

```json
{ "filter": { "field": "status", "operator": "eq", "value": "open",
              "and": [ … ], "or": [ … ] },
  "sort": [{ "field": "updatedAt", "direction": "desc" }],
  "pagination": { "offset": 0, "limit": 20 } }
```

Operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`,
`startsWith`. The runtime applies the query to the rows it received. A server
therefore need not implement filtering, sorting or paging to be correct; it
needs to return the rows.

For `rest` sources and declared engines the query is never sent. An engine
built on the reference HTTP connector without a declaration — which is how a
runtime reads the record endpoints of §5 — sends it as the list query
parameters of §5.1.

## 4. Writes

A form bound to a source submits its values **as they are** as the JSON body
(`POST` to the source's collection for a create), then refreshes every source.
A write to one record addresses `<collection>/<id>`. A server SHOULD accept the
record itself as the body and MAY also accept a lone `{ data: { … } }` wrapper.
Over a declared engine, creates `POST` (wrapped in `write.bodyWrap` when set),
deletes `DELETE <collection>/<id>`, and updates are unsupported.

## 5. Record endpoints of a session server

Under the app's own API base `<base>` (see
[session-protocol §2](session-protocol.md#2-authjson)); every route accepts the
visitor's credential on `x-app-session` or `Authorization: Bearer`.

| Method | Path | Body | 2xx answer |
|---|---|---|---|
| `GET` | `/records/<entityType>?limit&offset&sort&filter&include` | — | `{ data: Record[], meta: { total, scope, timestamp } }` |
| `GET` | `/records/<entityType>/<id>` | — | `{ data: Record }` |
| `POST` | `/records/<entityType>` | the record | `201 { data: Record }` |
| `PATCH` | `/records/<entityType>/<id>` | partial record | `{ data: Record }` |
| `DELETE` | `/records/<entityType>/<id>` | — | `{ data: { id, deleted: true } }` |
| `GET` | `/records/<entityType>/count` and `/aggregate` | — | §2.3 |

`Record` is `{ id, …fields }`; a server MAY add `entityType`, `createdAt` and
`updatedAt`, and spreads the stored fields at the top level.
Errors are `{ error: { code, message } }`. A gated app's request without a
session is `401` with code `SIGN_IN_REQUIRED`. Informative, how a server typically
behaves: `limit` is clamped to 1–500 (default 100), rows come newest
`updatedAt` first, and `scope` is `project` or, for a per-visitor collection,
`owner` (see [definitions, `entities.json`](definitions.md#entitiesjson)).

### 5.1 List parameters

A runtime reading a collection sends its query (§3) as query parameters:

| Parameter | Value | Server |
|---|---|---|
| `limit` | rows per page, an integer | SHOULD honour (it MAY clamp it) |
| `offset` | rows to skip, an integer | SHOULD honour |
| `sort` | `<field>:<asc\|desc>` pairs, comma-separated, first is primary — `sort=price:asc,name:desc` | SHOULD honour |
| `filter` | the §3 filter object as JSON text, URL-encoded — `filter={"field":"status","operator":"eq","value":"open"}` | SHOULD honour |
| `include` | related collections to embed, comma-separated | MAY ignore |

A server applies `filter`, then `sort`, then cuts the page with `offset` and
`limit`; a page cut before filtering is not the page the runtime asked for.

### 5.2 `meta.total`

`meta.total` is the number of records **matching** the request — after
`filter`, before `offset` and `limit` — not the number of rows in this answer.
A runtime computes "there is more" as `total > offset + data.length`, so a
server that answers with the page size makes every list look complete. A
server that cannot count SHOULD omit `meta.total`; the runtime then takes the
page size and shows no further pages.

### 5.3 Single-record answers

Create, read and update answer `{ data: Record }` — the record wrapped in
`data`, never bare. A client MUST read the new record's id from `data.id`
(a create's `201` answer carries the id the server assigned), not from the top
level of the answer. A client MAY accept a bare record from a server that does
not wrap, but a server MUST wrap.

A server answering requests from apps on other origins MUST allow
`Authorization`, `Content-Type` and `X-App-Session` in CORS preflight for those
origins.

## 6. Seed data for development hosts (optional)

A **development host** — one that serves a pwpack folder for local work, such
as the reference `pwf dev` — MAY seed each collection from
`app/data/<entityType>.json` on first use. The file is shaped like a record
list answer:

```json
{ "data": [ { "id": "p1", "name": "Pear", "price": 4.5 }, { "name": "Fig" } ] }
```

- `<entityType>` is the `typeId` of an entity in
  [`entities.json`](definitions.md#entitiesjson); a file naming no declared
  entity is ignored.
- A record MAY carry its own `id`; the host assigns one when absent and fills
  `createdAt` and `updatedAt` when absent.
- A file that is not `{ "data": [ … ] }` is an error the host reports; it does
  not guess.
- A host MAY also read `app/data/<entityType>.jsonl` (one JSON object per line)
  when no `.json` file exists.

This is a **development-only convention**. A publisher MUST NOT treat these
files as the production records of an app, and a production session server
does not read them. Records an app ships for every visitor belong in a `static`
source (§2) or in the session server's own store.

## Conformance

- `examples/data-protocol/{valid,invalid}/*.json` — persistence
  configurations, checked against the JSON Schema and the reference schema.
- `examples/data-protocol.records/{valid,invalid}/*.json` — record list
  answers.
- A recorded exchange fixture (a page's sources, the requests a runtime makes,
  the answers, the bound data) is reserved for `fixtures/`.

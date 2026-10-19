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
| `behaviors` | `{ id, event, targetBlockId?, actions[] }` — when `event` fires (optionally only from that block), run the actions (§1.2) in order. Events are written `block:click` (colon form); a runtime also accepts the dotted form `block.click`. A behavior's action values are used as written, not resolved as expressions. |
| `defaultCacheTtl`, `maxRetries`, `timeout`, `persistenceEnabled`, `storageKey` | Runtime tuning. |

Unknown members are carried. The `platform/entities` capability binds form
writes: `formBindings: { formId, sourceId, method?, statusKeys?, successRedirect? }[]` —
the form named by `formId` submits through the source named by `sourceId` (§4).

### 1.1 Page state

Page state is one flat object per page, read as `{{state.<key>}}` anywhere an
expression is allowed: props, `visibleWhen`, a source's `endpoint` and `query`.

**Who writes it.**

1. `initialState` — the starting values.
2. The runner, from the address, before the first render (see
   [envelope §4](envelope.md#4-per-page)): only keys the page reads, as strings.
3. A block that carries a `stateKey` prop writes its current value under that
   key whenever the value changes (see
   [block-manifest, `stateKey`](block-manifest.md#statekey)). A block MAY also
   write the value it shows on mount, so that state matches the screen before
   the visitor touches the control.
4. A `setState` action (§1.2).
5. A form binding's `statusKeys` (§4).

Keys starting with `__` are reserved for the runtime. `__show:<blockId>` is
written by `showBlock` / `hideBlock`: `true` shows the block and `false` hides
it, whatever its `visibleWhen` says. Once either action has run, the block's
`visibleWhen` no longer applies.

**A `state` source.** A source of kind `state` binds `state[<id>]`: its id
**is** the state key. It is never fetched, never loading and never in error.
It lets a block that reads a source by id read a value a control wrote.

**When a source is fetched again.** A runtime resolves each source's request
against the current state: a `rest` source's endpoint and query, an `entity`
source's query and aggregate, a `static` source's query, a `state` source's
value. It fetches a source again — or re-applies a `static` source's query —
only when that resolved request changes. Writing a state key that no source
reads changes no request and fetches nothing. A runtime MUST NOT refetch every
source on every state write.

**Empty values.** A state value that is `''` or `null` is **no constraint**:

- In a `query`, a string that is exactly one expression (`"{{state.status}}"`)
  and resolves to `''` or `null` drops its key. A filter node left without a
  `value` matches every row (§3), so an "All" choice or an empty search box
  widens the list instead of emptying it. Such a string that resolves to a
  value keeps its type: `"{{state.page}}"` is a number when the state holds a
  number.
- In a `rest` endpoint, an expression in the **path** that resolves to nothing
  (`''`, `null`, absent or unevaluable) makes the source **idle**: it is not
  fetched, binds no data, is neither loading nor in error, and
  `{{__idle.<id>}}` is `true`. An empty value in the endpoint's query string
  (after `?`) does not idle the source.

### 1.2 Actions

An action is one of:

| Action | Effect |
|---|---|
| `{ "type": "setState", "key": k, "value": v }` | Writes `v` to `state.<k>`. |
| `{ "type": "refresh", "sourceId": id }` | Fetches that source again. |
| `{ "type": "refreshAll" }` | Fetches every source again. |
| `{ "type": "showBlock", "blockId": id }` | Shows that block (§1.1, `__show:`). |
| `{ "type": "hideBlock", "blockId": id }` | Hides that block. |
| `{ "type": "navigate", "url": u }` | Goes to `u`. Only a relative URL or an `http(s)` URL is followed; any other scheme is refused. A root-relative `u` is an app link: a runner rewrites it into its router's form ([envelope §3](envelope.md#3-routing-and-links)). A host MAY handle the navigation in place first. |

A runtime ignores an object whose `type` is not one of these.

Actions reach the runtime in three ways:

1. **A behavior** (§1): the actions run when its event fires.
2. **A block's `action` prop**: one action or a list of actions. It runs, in
   order, when that block emits `block:click`, and on no other event. The prop
   is resolved like the block's other props, so inside a repeat
   `{ "type": "setState", "key": "selected", "value": "{{item.id}}" }` carries
   that row's id.
3. **An event payload**: a block MAY emit an event whose `payload.action` is an
   action. The runtime runs it, whatever the event. This is how a control with
   `stateKey` writes its value.

A block runs its `action` only through `block:click`. A block that navigates
itself when clicked — the reference button with an `href` — does not emit
`block:click`, so its `action` does not run. A producer MUST NOT give one
block both an `href` and an `action`.

In a non-interactive render (an editor or preview canvas), a runtime does not
run actions. It still reports the events to its host.

## 2. Data sources

| Member | Meaning |
|---|---|
| `id` | The source's key; `{{<id>}}` binds its data. Its condition is bound as: `{{__loading.<id>}}` (fetching); `{{__errors.<id>}}` (the error message, or `null`); `{{__status.<id>}}` (HTTP status of the last answer, or `null`); `{{__notFound.<id>}}` (that status was 404); `{{__idle.<id>}}` (not fetched, §1.1); `{{__meta.<id>}}` (the envelope `returns` unwrapped the rows from, or `null`). |
| `kind` | `rest` · `static` · `state` (binds `state[<id>]`, §1.1) · `entity` |
| `endpoint`, `method` | `rest`: the collection URL (expressions `{{state.x}}` are resolved first) and verb (`GET` unless stated; `POST`, `PUT`, `DELETE`). |
| `returns` | `rest`: dotted path to the rows in the answer (`data`, `payload.rows`); absent when the answer **is** the array. A named path that is missing is an error. |
| `authProviderRef` | A **name** the host answers with a live token (see [session-protocol §7](session-protocol.md#7-credentials-on-requests)); never a credential. |
| `query` | `{ filter?, sort?, pagination? }` (§3). |
| `entityType`, `connector` | `entity`: which collection, and which connection serves it. |
| `aggregate` | `entity`: `{ fn: count \| sum \| avg, field?, filter? }` — ask for one number instead of rows (§2.3). |
| `staticData` | `static`: the data itself. When it is an array and the source has a `query`, the query is applied to it like to fetched rows (§3). Any other value is bound as written. |
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
`startsWith`. The runtime applies the query to a source's rows — the rows a
`rest` source received and the array of a `static` source alike. It filters,
then sorts, then cuts the page. A server therefore need not implement
filtering, sorting or paging to be correct; it needs to return the rows.

A filter node with no `value` sets no constraint and matches every row. Its
`and` and `or` children still apply. This is what an emptied state value
leaves behind (§1.1).

For `rest` sources and declared engines the query is never sent. An engine
built on the reference HTTP connector without a declaration — which is how a
runtime reads the record endpoints of §5 — sends it as the list query
parameters of §5.1.

## 4. Writes

A form writes through a **form binding** of the `platform/entities` capability:

```json
{ "capability": "platform/entities",
  "config": { "formBindings": [
    { "formId": "contact-form", "sourceId": "messages",
      "statusKeys": { "loading": "sending", "success": "sent", "error": "failed", "message": "failReason" },
      "successRedirect": "/thanks" } ] } }
```

| Member | Meaning |
|---|---|
| `formId` | The id of the form block whose submit this binding handles. |
| `sourceId` | The data source the record is written to; it MUST be declared on the same page (§2). |
| `method` | `POST` (default), `PUT` or `PATCH` — the write verb, whatever the source's own `method` says (§4.3). |
| `statusKeys` | Optional page-state keys the write drives (§4.2). |
| `successRedirect` | Optional address the page goes to after a successful write. Written root-relative like a link ([receipt §2.1](receipt.md#21-links)); a runner rewrites it into its router's form ([envelope §3](envelope.md#3-routing-and-links)). |

### 4.1 What is sent

The values are what the form gathered from its fields, by field `name`. A
control inside the form that has no native field but declares both a `name`
and a `stateKey` contributes `state.<stateKey>` under its name, unless the
form already gathered a value under that name or the control is disabled; a
control the visitor never touched contributes nothing. The values are sent
**as they are**, as the JSON body. Gathered like an HTML form's, they are
strings; the server reads them by field type (see
[definitions, field types](definitions.md#field-types)).

Where the record goes:

- An `entity` source writes through its entity facade (create, or update of the
  record named below).
- Any other source writes over HTTP through the data layer: `POST <endpoint>`
  for a create, `<method> <endpoint>/<id>` for an update, with the source's
  headers and credential (§2.1).
- A form whose `sourceId` names no declared source does not write; the write
  fails with a message naming the source.

A server SHOULD accept the record itself as the body and MAY also accept a lone
`{ data: { … } }` wrapper. Over a declared engine, creates `POST` (wrapped in
`write.bodyWrap` when set), deletes `DELETE <collection>/<id>`, and updates are
unsupported.

### 4.2 `statusKeys`

Each named key is written into page state (§1.1) as the write proceeds, so the
page reflects the server's real answer rather than an optimistic guess:

| When | `loading` | `success` | `error` | `message` |
|---|---|---|---|---|
| The submit starts | `true` | `false` | `false` | `""` |
| The write succeeded | `false` | `true` | unchanged (`false`) | unchanged (`""`) |
| The write failed | `false` | unchanged (`false`) | `true` | the failure's message |

Every key is optional; a key the binding does not name is not written. A page
binds them with `visibleWhen` — a confirmation on `{{state.<success>}}`, an
error box on `{{state.<error>}}` showing `{{state.<message>}}`. The message is
the server's own words: for a `400` whose code is `VALIDATION_FAILED` or
`INVALID_BODY` (or carries no code) it is a validation message naming the
fields, read from `<field>: <reason>` parts separated by `;` in the server's
message; for any other status it states the status and the server's message;
when the server was not reached, it says so.

### 4.3 Create or update

`POST` always creates. `PUT` and `PATCH` update **the record the source has
loaded**: the first row when the source binds a list, the object when it binds
one record. The write addresses `<collection>/<id>` with that record's `id`.
When the source has loaded no record with an `id`, the write is a create
(`POST`) instead — there is nothing to update, and the collection address
alone would name no record. A profile or settings page therefore reads the one
record it edits through the same source the form writes to.

The binding's `method` is the write verb; the source's `method` is how the
source is **read**. A runtime reads a source with the source's `method`, so a
source declared `method: "POST"` that the page also reads sends a body-less
`POST` on every load and every refresh. A producer SHOULD declare a form's
target source with `GET` (or no `method`) and put the write verb on the
binding.

### 4.4 After a write

After a successful write the runtime fetches every source again (the
`refreshAll` action, §1.2), so a list on the page shows the new record; then,
when `successRedirect` is set, it navigates. A failed write refreshes nothing.

**Write-only sources.** A source that is only ever written to is never
fetched — not on load and not in the refresh after a write — though it stays
declared as the write target. A source is write-only when:

1. at least one form binding targets it, and every binding that does writes
   with `POST` (an update needs a loaded record, §4.3); and
2. nothing else on the page names it: no block (props, expressions, actions,
   `repeat`), no behavior, no other data source and no other capability
   configuration. A runtime looks for the id as a whole word in every string,
   so a stray word equal to the id makes the source read.

This lets a visitor submit to a collection they may create in but not list —
an enquiry, an RSVP — without the page asking for rows the server would
refuse.

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
Errors are `{ error: { code, message } }`. Who may call which endpoint is the
app's access rules ([definitions, `access`](definitions.md#access)): a refused
caller without a session gets `401` with code `SIGN_IN_REQUIRED`, one with a
session `403` with code `FORBIDDEN`. `meta.scope` is `owner` when the list holds
only the caller's own records (an `own` grant), else `project`. Informative,
how a server typically behaves: `limit` is clamped to 1–500 (default 100) and
rows come newest `updatedAt` first.

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

## 6. Shipped content and development data

An app's records come from two folders, in one shape — a record list answer:

```json
{ "data": [ { "id": "0b7d1c56-3f7e-4a52-9a0c-1f2e3d4c5b6a", "name": "Pear", "price": 4.5 } ] }
```

| Folder | What it holds | Published |
|---|---|---|
| `app/content/<entityType>.json` | **Content**: the records the app ships for every visitor — a catalogue, announcements, a team. The person edits them afterwards. | yes, as below |
| `app/data/<entityType>.json` | **Development data**: records to try the app with — test orders, sample bookings. | never |

`<entityType>` is the `typeId` of an entity in
[`entities.json`](definitions.md#entitiesjson). A file that is not
`{ "data": [ … ] }` is an error; a reader reports it and does not guess.

Which kind a record is decides where it lives, not how it is shown: a list the
person will keep changing is content in a collection that every page reads, not
a `static` source copied into each page. A `static` source (§2) is for small
fixed lists that belong to one page's structure (a select's options, a
stepper's steps). Records visitors create (orders, bookings, messages) are
neither: they start empty.

### 6.1 Content

- Every content record MUST carry an `id` that is a UUID, unique in its file.
  It stays the record's id once published, and relation fields
  ([definitions, field types](definitions.md#entitiesjson)) point at it.
- Content is for collections someone may read whole. A content record has no
  creator, so a collection the access rules let visitors read only `own`
  records of shows it to nobody (`APP_CONTENT_UNREADABLE`).
- **Publishing** inserts each content record whose `id` the session server's
  store does not hold, and nothing else: it never updates or deletes a stored
  record. The person's edits survive every later publish; a record a new
  version adds is inserted; a record the person deleted is inserted again only
  if the person publishes content that still carries it.
- `createdAt` and `updatedAt` are filled when absent.

Validation codes ([pwpack-format](pwpack-format.md)): `APP_CONTENT_UNDECLARED`,
`APP_CONTENT_UNREADABLE`, `APP_CONTENT_INVALID`, `APP_CONTENT_ID`.

### 6.2 Development data (optional)

A **development host** — one that serves a pwpack folder for local work, such
as the reference `pwf dev` — seeds each collection on first use from
`app/content/<entityType>.json`, then MAY add `app/data/<entityType>.json`. A
development record with the `id` of a content record replaces it on that host
only.

- A development record MAY carry its own `id`; the host assigns one when absent.
- A host MAY also read `<folder>/<entityType>.jsonl` (one JSON object per line)
  when no `.json` file exists.

A publisher MUST NOT publish `app/data/`, and a production session server does
not read it.

## Conformance

- `examples/data-protocol/{valid,invalid}/*.json` — persistence
  configurations, checked against the JSON Schema and the reference schema.
- `examples/data-protocol.records/{valid,invalid}/*.json` — record list
  answers.
- A recorded exchange fixture (a page's sources, the requests a runtime makes,
  the answers, the bound data) is reserved for `fixtures/`.

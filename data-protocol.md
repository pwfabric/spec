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
| `urlState` | `string[]` — the state keys that live in the page's address. Each is seeded from the address and, whenever it changes, written back there replacing the history entry, so a reload or a shared link keeps it ([envelope §4](envelope.md#4-per-page)). A value that is `''` or `null` removes the key; a list or an object is not written. Keys not listed are never written to the address. |
| `behaviors` | `{ id, event, targetBlockId?, actions[] }` — when `event` fires (optionally only from that block), run the actions (§1.2) in order. A `targetBlockId` that names a template block inside a `repeat` hears every copy of it (`<id>--<index>`, see [expressions §5](expressions.md#5-repeat)); a copy's id names that copy only. Events are written `block:click` (colon form); a runtime also accepts the dotted form `block.click`. A behavior's actions are resolved as expressions when the event fires, against the page scope at that moment ([expressions §1](expressions.md#1-where-expressions-are-read)): `{ "type": "navigate", "url": "/dish?id={{state.dish}}" }` goes to that dish. |
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
6. A split shell writes its selection under its `selectionKey`: the selected
   item's id, or `null` when the address names an item it does not have.
   The selection lives in the page's address (see
   [envelope §4](envelope.md#4-per-page)).

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
| `{ "type": "navigate", "url": u }` | Goes to `u`. Only a relative URL or an `http(s)` URL is followed; any other scheme is refused. A root-relative `u` is an app link: a runner rewrites it into its router's form ([envelope §3](envelope.md#3-routing-and-links)). A `u` whose page is an expression (`{{item.url}}`) is checked like a link from data ([receipt §2.1](receipt.md#21-links)) once resolved. A host MAY handle the navigation in place first. |
| `{ "type": "write", "sourceId": id, "op": o, "id"?: r, "values"?: {…}, "statusKeys"?: {…} }` | Creates, updates or deletes one record of that source (§1.3). |

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

### 1.3 The `write` action

```json
{ "type": "write", "sourceId": "likes", "op": "create",
  "values": { "post": "{{item.id}}" },
  "statusKeys": { "loading": "liking", "success": "liked", "error": "likeFailed", "reason": "likeReason", "detail": "likeDetail" } }
```

| Member | Meaning |
|---|---|
| `sourceId` | The data source the record belongs to; it MUST be declared on the same page (§2). |
| `op` | `create`, `update` or `delete`. |
| `id` | The record an `update` or a `delete` names (a string, or a number written as one). REQUIRED for those two; ignored by `create`. |
| `values` | The fields a `create` or an `update` sends, as the JSON body. An `update` sends only these (a partial record). |
| `statusKeys` | Optional page-state keys the write drives, exactly as a form binding's (§4.2). |

The action is resolved like the rest of its block's props (a block's `action`)
or when its event fires (a behavior's), so `id` and `values` may be expressions:
inside a repeat `"id": "{{item.id}}"` names that row.

Where the record goes is decided as for a form (§4.1): an `entity` source writes
through its entity facade, any other source over HTTP — `POST <endpoint>` to
create, `PATCH <endpoint>/<id>` to update, `DELETE <endpoint>/<id>` to delete —
with the source's headers and credential (§2.1).

**Who may write is the server's.** The runtime sends the request; the session
server applies the app's access rules ([definitions, `access`](definitions.md#access))
and the record write rules ([definitions, server-owned fields](definitions.md#server-owned-fields)).
A refusal is a failed write.

**After the write.** A successful write fetches every source again (the
`refreshAll` action), so a like count, a saved reply or a removed row shows what
the server now holds. A failed write fetches nothing. An `update` or a `delete`
without an `id` does not write; it fails at once.

A `write` action names its source to write it, not to read it: it does not make
a write-only source read (§4.4).

## 2. Data sources

| Member | Meaning |
|---|---|
| `id` | The source's key; `{{<id>}}` binds its data. Its condition is bound as: `{{__loading.<id>}}` (fetching); `{{__errors.<id>}}` (why it failed, as a code, or `null`; §2.5); `{{__errorCodes.<id>}}` (the HTTP status of the failure, or `null`; §2.5); `{{__status.<id>}}` (HTTP status of the last answer, or `null`); `{{__notFound.<id>}}` (that status was 404); `{{__idle.<id>}}` (not fetched, §1.1); `{{__meta.<id>}}` (the envelope `returns` unwrapped the rows from, or `null`). |
| `kind` | `rest` · `static` · `state` (binds `state[<id>]`, §1.1) · `entity` |
| `endpoint`, `method` | `rest`: the collection URL (expressions `{{state.x}}` are resolved first) and verb (`GET` unless stated; `POST`, `PUT`, `DELETE`). |
| `returns` | `rest`: dotted path to the rows in the answer (`data`, `payload.rows`); absent when the answer **is** the array. A named path that is missing is an error. |
| `authProviderRef` | A **name** the host answers with a live token (see [session-protocol §7](session-protocol.md#7-credentials-on-requests)); never a credential. |
| `query` | `{ filter?, sort?, pagination? }` (§3). |
| `entityType`, `connector` | `entity`: which collection, and which connection serves it. |
| `aggregate` | `entity`: `{ fn: count \| sum \| avg, field?, filter? }` — ask for one number instead of rows (§2.3). |
| `staticData` | `static`: the data itself. When it is an array and the source has a `query`, the query is applied to it like to fetched rows (§3). Any other value is bound as written. It is bound from the page's first frame — it is in the receipt, so nothing waits for it and nothing under it moves when it arrives. |
| `refreshInterval` | Re-fetch period. |
| `fallback` | Sample data, bound only when **nothing is connected** to serve the source — the source's `query` is applied to it (§2.5). Never bound for a real failure. |
| `notFoundWhenEmpty` | `true`: the source is the record the page shows (a detail page's `?id=`). When it settles with no record — status 404, no row (`null`, absent or `[]`), or idle (§1.1) — the page is not found and its host renders the app's not-found page at the same address ([envelope §3](envelope.md#3-routing-and-links)). Any other error is not "not found". A runtime tells its host once per page, and never in a non-interactive render. |

### 2.1 `rest`

A runtime sends `<method> <endpoint>` with `Content-Type: application/json`,
the source's own `headers`, and `Authorization: Bearer <token>` only when
`authProviderRef` resolves to a token. It MUST send `credentials: "omit"`
unless the endpoint's origin is one the host explicitly configured as its own
cookie-authenticated API. It plucks `returns` from the answer and then applies
`query` (§3) to the rows. A non-2xx answer is an error carrying the status and,
when the body is `{ error: { code, message } }`, that code and message.

### 2.2 `entity`

An `entity` source names a collection by `entityType`. Who serves it depends
on `connector`:

- **With `connector`** it is served by an **entity facade**: `connector` names
  a connection of `connections.json`, whose engine (compiled or
  [declared](connector-manifest.md#3-the-engine-declaration)) performs the
  request. A runner builds the facade only when there is a live sign-in or
  some declared engine says `auth.type: "none"`; otherwise these sources draw
  their `fallback`.
- **Without `connector`** it is **the app's own records** of `entityType`. No
  connection is implied: a runtime MUST NOT serve it through a connection the
  source does not name. A runtime that knows the app's own API base `<base>`
  ([session-protocol §2](session-protocol.md#2-authjson)) serves it from the
  record endpoints (§5) as the `rest` source
  `{ kind: "rest", method: "GET", endpoint: "<base>/records/<entityType>",
  authProviderRef: "<base>", returns: "data" }`, keeping its `id`, `query`
  and `fallback`; with `aggregate` (§2.3) the endpoint is
  `<base>/records/<entityType>/count` or
  `<base>/records/<entityType>/aggregate?fn=&field=&filter=`. A publisher that
  hosts the app's records MAY write that same rewrite into the receipt. With
  no base the source is not served and draws its `fallback`.

A page whose receipt binds `platform/entities` with no facade MAY be served by
an in-memory facade that forgets everything on reload.

### 2.3 Aggregates

An `entity` source with `aggregate` binds `{ fn, field?, value, count }`, so
`{{<id>.value}}` is the number. `count` needs no field; `sum` and `avg` reduce
`field`; `filter` uses the `query.filter` shape. Over HTTP it is
`GET <collection>/count` (plain count) or
`GET <collection>/aggregate?fn=<fn>&field=<field>&filter=<json>`, answered
`{ data: { fn, field?, value, count } }` (or the bare object).

### 2.4 Row fields

A source binds a list of row objects, and a page reads a field of a row by
name in three places:

- `{{item.<field>}}` (or `{{item['<field>']}}`) inside the template of a block
  whose `repeat` binds the source ([expressions §5](expressions.md#5-repeat)).
  Only that block's descendants see the row, not its own props; inside an
  inner repeat, `item` is the inner row.
- A block's field-mapping prop, when another prop of the block receives the
  rows whole (`"items": "{{<id>}}"`): a prop whose value is a field name, such
  as a repeater's `headingField` or a select's `labelKey`. A dotted value
  (`data.name`) reads its first segment.
- `{{<id>.<n>.<field>}}` or `{{<id>[<n>].<field>}}` anywhere on the page, and
  `{{<id>.<field>}}`, which reads a list of one through
  ([expressions §4.2](expressions.md#42-paths)).

A field the rows do not have is `undefined` (expressions §4.2), not an error,
so a misspelt name renders empty. A validator MAY report such a read as
**`FIELD_UNKNOWN`**, a **warning**: the page still renders. It reports one only
when the source's row fields are **known**:

| Source | Known fields |
|---|---|
| `entity` with `entityType` and no `connector` | the fields the type declares in [`entities.json`](definitions.md#entitiesjson), the keys of its records in `app/content/` and `app/data/` (§6), and the record envelope `id`, `entityType`, `createdAt`, `updatedAt` (§5) |
| `static` whose `staticData` is a list of objects | the keys of those objects |
| any source whose `fallback` is a list of objects | the keys of those objects, added to the above |

Any other source — a `rest` source or a connector-served `entity` source
without a `fallback`, an aggregate (§2.3), a `state` source — has no known
fields and is not checked. Neither is a string that carries an unresolved
pattern slot (`{{UPPER}}` that names no source). The block manifest marks no
prop as a field name, so which props are field-mapping props is a naming
convention, and a validator is free to choose its own. The reference CLI
(`pwf validate`) treats as field names the props ending in `Field` or `Key`,
except `stateKey`, `selectionKey` and those ending in `StateKey`, plus a
`columns[]` entry's `key` and `*Key` members.

### 2.5 Failure

**Failure is a state, not sample data.** A source that cannot be served for a
real reason binds **no rows** — whatever its `fallback` says — and exposes the
failure, so the page shows its own state (an error panel, a sign-in prompt, a
retry). A real failure is any of:

- a refused read (`401`, `403`);
- a not-found (`404`);
- a server error (`5xx`, or any other non-2xx answer);
- a network failure (no answer, or a timeout);
- a connected engine that fails (it could not be loaded, or its request failed).

A failed source binds:

| Name | Value |
|---|---|
| `{{<id>}}` | No rows: `null`, or the data of the **same** request's last good answer when a refresh of it fails (data from another request is cleared). |
| `{{__errors.<id>}}` | Why, as a **code** — `"unauthenticated"` (401), `"forbidden"` (403), `"not_found"` (404), `"server"` (5xx), `"network"` (no answer), `"unconnected"` (below) or `"error"` (anything else). Always truthy, so a condition on it tells "failed" from "fetched, empty". `null` while the source is healthy. A runtime MUST NOT bind a sentence here — neither the server's or its own internal words ("HTTP 500: Internal Server Error", "No entity facade available"), which it MAY report to its developer console, nor words of its own: the app writes the words for each code ([envelope §2.1](envelope.md#21-messages)). |
| `{{__errorCodes.<id>}}` | The HTTP status as a number (`401`, `403`, `404`, `500` …) when the server answered; `"network"` when no answer arrived; `"error"` for any other failure; `"unconnected"` (below). `null` while the source is healthy. |
| `{{__status.<id>}}` | The HTTP status, or `null`, as before. |

A page branches on the code and writes its own words — `visibleWhen:
"{{__errors.orders == 'forbidden'}}"` over "Only members see orders." — and
does not show the code as text (the reference CLI warns:
`ERROR_BOUND_AS_TEXT`).

**Not connected.** A source that has **nothing to serve it at all** — demo
mode — is not a failure of the source:

- an `entity` source whose `connector` names a connection the host did not
  register;
- an `entity` source with no entity facade and no records base (§2.2).

Such a source binds its `fallback`, when it declares one, with the source's
`query` applied to it like to fetched rows (filter, sort, then the page; §3),
so a detail page filtering `id eq {{state.id}}` shows that sample record or
none — never another one. `{{__errorCodes.<id>}}` and `{{__errors.<id>}}`
are `"unconnected"`, so a page can say that sample data is shown. Without a `fallback` such a source binds an empty list
and no error, as before.

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
      "statusKeys": { "loading": "sending", "success": "sent", "error": "failed", "reason": "failReason", "fields": "failFields" },
      "successRedirect": "/thanks" } ] } }
```

| Member | Meaning |
|---|---|
| `formId` | The id of the form block whose submit this binding handles. |
| `sourceId` | The data source the record is written to; it MUST be declared on the same page (§2). |
| `method` | `POST` (default), `PUT` or `PATCH` — the write verb, whatever the source's own `method` says (§4.3). |
| `statusKeys` | Optional page-state keys the write drives (§4.2). |
| `successRedirect` | Optional address the page goes to after a successful write. Written root-relative like a link ([receipt §2.1](receipt.md#21-links)); a runner rewrites it into its router's form ([envelope §3](envelope.md#3-routing-and-links)). It may carry expressions, resolved after the write against the page scope plus `result` — the record the write returned, with its `id`: `"/confirmation?id={{result.id}}"`. An address whose page is an expression is checked like a link from data once resolved; one that does not resolve is not followed. |

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

| When | `loading` | `success` | `error` | `reason` | `fields` | `detail` |
|---|---|---|---|---|---|---|
| The submit starts | `true` | `false` | `false` | `""` | `[]` | `""` |
| The write succeeded | `false` | `true` | unchanged (`false`) | unchanged (`""`) | unchanged (`[]`) | unchanged (`""`) |
| The write failed | `false` | unchanged (`false`) | `true` | the reason code | the refused field names | the failure's own words |

Every key is optional; a key the binding does not name is not written. A page
binds them with `visibleWhen` — a confirmation on `{{state.<success>}}`, an
error box on `{{state.<error>}}` — and writes its own words for each
`reason`.

**`reason` is a code**, never a sentence:

| `reason` | When |
|---|---|
| `validation` | A `400` whose code is `VALIDATION_FAILED` or `INVALID_BODY`, or that carries no code. |
| `unauthenticated` | A `401`. |
| `forbidden` | A `403`, or a refusal the writer reports as unauthorized. |
| `server` | A `5xx`. |
| `network` | No answer arrived. |
| `error` | Anything else (a `404`, a `409`, a write that could not be sent). |

**`fields` lists the fields a `validation` refusal names**, read from
`<field>: <reason>` parts separated by `;` in the server's message
(`["email", "name"]`), so a form can mark them; `[]` otherwise.

**`detail` is the failure's own words** — the status, the server's code and its
message (`403 FORBIDDEN: You may not create Order records.`), or the runtime's
reason the write could not be sent — for the developer. A page does not show
it to a visitor (`ERROR_BOUND_AS_TEXT`); it is in the server's language, not
the app's.

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
when `successRedirect` is set, it resolves it (§4) and navigates. A failed
write refreshes nothing.

**Write-only sources.** A source that is only ever written to is never
fetched — not on load and not in the refresh after a write — though it stays
declared as the write target. A source is write-only when:

1. at least one form binding targets it, and every binding that does writes
   with `POST` (an update needs a loaded record, §4.3); and
2. nothing else on the page **reads** it: no block (props, expressions,
   actions, `repeat`), no behavior, no other data source and no other
   capability configuration. A string reads the source when it **is** the id
   (`{ "type": "refresh", "sourceId": "orders" }`), or when one of its
   `{{ … }}` expressions names the id as a whole word (`{{orders}}`,
   `{{__errors.orders}}`, `{{length(orders)}}`). Plain text does not: a nav
   link `/orders` or a label "Orders" does not read the source `orders`. The
   `sourceId` of a `write` action (§1.3) does not read it either. Inside an
   expression a stray word equal to the id still makes the source read.

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
`updatedAt`, and spreads the stored fields at the top level. A `POST` and a
`PATCH` follow the record write rules of
[definitions, server-owned fields](definitions.md#server-owned-fields): a field
the entity does not declare is refused, declared types are checked, and the
fields declared `server` are set by the server — each refused with `400`
`VALIDATION_FAILED`, the message listing `<field>: <reason>` parts separated by
`; `.
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

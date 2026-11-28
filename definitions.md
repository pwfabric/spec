---
status: draft
formatVersion: "1.0"
---

# Definitions

`app/definitions/` holds what an app **runs on** beyond its pages: its shell
navigation, its app-wide appearance, the data connections and models it
declares, and who may enter. Each is one JSON file, written only when the app
declares something there (absent stays absent). When the app is published,
`navigation.json`, `appearance.json` and `connections.json` are copied into the
[envelope](envelope.md) as they are; `auth.json` is **not** — the envelope's
`auth.json` is a different document, the addresses the declaration was
resolved to (see [session-protocol](session-protocol.md)).

| File | Schema | Source of the schema |
|---|---|---|
| `navigation.json` | [`definitions.navigation`](schemas/definitions.navigation.schema.json) | hand-written |
| `appearance.json` | [`definitions.appearance`](schemas/definitions.appearance.schema.json) | hand-written |
| `connections.json` | [`definitions.connections`](schemas/definitions.connections.schema.json) | hand-written |
| `entities.json` | [`definitions.entities`](schemas/definitions.entities.schema.json) | hand-written |
| `auth.json` | [`definitions.auth`](schemas/definitions.auth.schema.json) | generated from the reference schema `ProjectIdentitySchema` |

**Why draft.** Only `auth.json` has a reference schema in the engine. The
other four are restated here from what producers write and what readers read;
`appearance.json` in particular is read in three shapes (below), and
`connections.json` entries carry producer-specific members. They move to stable
when the engine owns their schemas.

## `navigation.json`

```json
{
  "navbar": { "links": [{ "label": "Home", "href": "/" }, { "label": "Menu", "href": "/menu" }] },
  "account": { "placement": "navbar", "profileHref": "/profile/", "links": [{ "label": "Orders", "href": "/orders" }] },
  "footer": { "columns": [{ "heading": "Visit", "links": [{ "label": "Contact", "href": "/contact" }] }], "excludeSurfaces": ["profile"] }
}
```

- `navbar.links` — `{ label, href }[]`, hrefs root-relative to the app. A runner
  fills every navbar block whose own `links` prop is empty with these links
  (rewritten for its router) and leaves a navbar that has links as authored.
- `account` (closed) — where the signed-in visitor's control goes:
  `placement` is `navbar`, `bottom-bar` or `app-rail`; `profileHref` and
  `links` are offered in its menu. A runner injects an `account` prop into every
  block of that type (see [session-protocol §6](session-protocol.md#6-identity-on-the-page)).
  Without `account`, a runner MAY show its own minimal session control.
- `footer` — columns of links and pages to leave out. A runner draws the
  columns as the page's footer band (`section` > `grid` > one column of a
  `heading` and its `link`s, hrefs rewritten for its router): inside the
  top-level block that holds the navbar, before that block's trailing
  `section`, or at the end of the page when there is no such block. It skips
  pages named in `excludeSurfaces` and any page that draws its own footer: a
  `footer` block, or a block whose id has the word `footer`, `foot` or
  `altbilgi` — except the shell's own `*-foot` copyright strip while it holds
  no link.

## `appearance.json`

The app-wide [appearance](appearance.md). A reader MUST accept three shapes:

1. a bare configuration: `{ theme?, darkTheme?, styleVariables?, keyframes?, mode?, brand? }`;
2. a reference: `{ config: <configuration> }`;
3. a preset with overrides: `{ use: "<preset name>", theme?, … }` — the named
   preset's tokens are the base, the document's own tokens override them per
   group. A preset name is matched as given, then as `theme-<name>`.

A name is known when it is `default`, a preset the runner ships (the
reference runner: `theme-base`, `theme-zinc`, `theme-paper`, `theme-ember`),
or a theme atom of the app or of a pack it pins. Any other name is an error,
the same for validating and for building (the reference CLI:
`THEME_NOT_FOUND`, naming the themes there are); a producer MUST NOT draw
another theme in its place. A name a pack upgrade removed is the usual case:
the app names one that is there, or writes its own theme atom that `extends`
one and sets what differs. A validator that could not read every pinned pack
does not judge theme names.

A document with none of `config`, `use`, `theme`, `styleVariables`,
`darkTheme`, `keyframes` carries no app-wide appearance, and each page's own
appearance applies. A producer SHOULD write shape 1 or 2.

## `connections.json`

```json
{ "connections": [{ "name": "shop", "connector": "rest", "config": { "baseUrl": "api.example.com/v1", "itemsPath": "data", "idField": "id" } }] }
```

| Member | Meaning |
|---|---|
| `name` | The connection's name — what data sources and engines refer to. Unique. |
| `connector` | The engine's `connection` name (see [connector-manifest](connector-manifest.md)). |
| `config` | Where the source is, for the engine's templates. MUST NOT contain credentials; a producer MUST drop credential-like keys. |
| `config.pageSources` | The paths the app calls the connection on: `[{ "path": "orders", "methods": ["GET", "HEAD"] }]`, each `path` relative to `config.baseUrl` and a prefix on a segment boundary (it covers `orders`, `orders/<id>`, `orders/count`; not `orders-private`). Written by the producer on every build (below); an author MAY write it, and then it is kept, normalised: verbs upper-case, leading and trailing slashes trimmed. |
| `engine` | An engine declaration, when the connection carries its own. |

Readers SHOULD also accept a bare string entry as `{ name }`. Producer-specific
members (`type`, `provider`, `description`) are carried.

### The paths a connection may be called on

A host that holds a connection's secret and calls the API for the app (a
secret-holding proxy) MUST refuse a call whose path and method no entry of the
connection's `pageSources` allows, and MUST refuse every call of a connection
whose `pageSources` is absent or empty. A write verb also needs the secret's own
write consent, where the host keeps one.

The host matches on the path it will forward, after normalising it exactly as
it will be sent: percent-decoding refused where it could change the path
(`%2F`, `%5C`, `%2E`, `%25`, a backslash), dot-segments resolved, and the result
still under `baseUrl`. An entry's `path` allows that path and every path below
it, one whole segment at a time: `orders` allows `orders/7` and never
`orders-private`. An entry whose `path` is empty would allow the whole API, so
it is invalid.

A producer MUST write `pageSources` on every connection of the published
`connections.json`, derived from what the app's pages and layout call through it
([data-protocol §2.2](data-protocol.md#22-entity)):

- each `entity` source naming the connection: the engine's path template with
  its `entityType` and the connection's `config` values filled in, under the
  engine host's path below `baseUrl`, with `GET` and `HEAD`;
- a write to that source adds the verb the runtime sends to an `entity` source
  ([data-protocol §1.3](data-protocol.md#13-the-write-action)): a form binding
  creates (`POST`; a form's `method` is a `rest` source's); a `write` action's
  `create` is `POST`, `delete` is `DELETE`, `update` is `PATCH` where the engine
  updates (a declared engine does not). A form binding that names its own
  `connector` writes through that connection;
- a declared pre-flight (`resolve.path`): its path, with `GET`;
- a connection no source calls: an empty list, and a warning (`CONNECTION_UNUSED`).

A path the producer cannot derive — a template part known only at run time
(`resolve.as`; a config value a source's `query` rebinds; an empty config value),
an `entityType` written as an expression, an engine that is code, an engine host
that is not `baseUrl` or under it, a path that comes out empty — is an error
naming the connection (`CONNECTION_PATHS_UNDERIVED`), unless the author declared
the connection's `pageSources`. A declared list MUST cover every path the
producer can derive (`CONNECTION_PATH_UNDECLARED` otherwise), and a list whose
entries are not `{ path, methods }` with a non-empty path and at least one of
the six verbs is an error (`CONNECTION_PAGE_SOURCES_INVALID`).

## `entities.json`

```json
{ "entities": [
  { "typeId": "Product", "displayName": "Product", "fields": [{ "name": "name", "type": "text", "required": true }, { "name": "price", "type": "number" }] },
  { "typeId": "Review", "fields": [{ "name": "product", "type": "relation", "targetTypeId": "Product", "required": true }, { "name": "stars", "type": "number" }] }
] }
```

Each entity is `{ typeId, displayName?, unique?, fields: { name, type, required?, label?, targetTypeId?, values?, server?, min?, max?, integer?, mustBe? }[] }`.
Members beyond these are carried.

### Field types

A producer SHOULD write one of seven field types. A session server validates
records by these types; it MAY store a field of any other type without
checking its value, and a reader MUST carry an unknown type unchanged.

| `type` | The value written and stored |
|---|---|
| `text` | a string; `""` is a value |
| `email` | a string shaped like an address: something, `@`, a domain with a dot (surrounding space is trimmed). The shape, not deliverability. |
| `number` | a finite JSON number |
| `boolean` | `true` or `false` |
| `date` | an ISO 8601 string (`"2026-10-18"`, `"2026-10-18T09:30:00Z"`) |
| `relation` | the `id` of one record of the collection `targetTypeId` names, as a string |
| `enum` | one of the strings the field's `values` lists |

**Strict.** A session server MUST refuse a value that is not its field's type
— `"10"` for a number, `"on"` or `1` for a boolean, a number for a relation —
and never convert it silently. A form gathers strings the way an HTML form
does; its writer converts them by the source's `fields` before it sends
([data-protocol §4.1](data-protocol.md#41-what-is-sent)).

**Bounds.** A `number` field MAY declare `min` and `max` (inclusive) and
`integer: true` (a whole number); a server refuses a value outside them
(`quantity: must be at least 1`). A producer MUST NOT write them on a field of
another type.

**`mustBe`.** Any field MAY declare the one value it may hold. A consent box
that must be ticked is `{ "name": "consent", "type": "boolean", "required":
true, "mustBe": true }`: `required` alone accepts `false`, which is a value;
`mustBe` refuses it (`consent: must be true`).

**Blank is missing.** On a field that is not `text`, a blank string (`""` or
whitespace only) means the field has no value — an untouched input. A server
SHOULD treat it as absent, so it satisfies an optional field and fails a
required one. On a `text` field `""` is stored as written.

**Relations.** `targetTypeId` names the entity a `relation` field points at. A
producer SHOULD write it on every relation field and MUST NOT write it on a
field of another type; it may name an entity declared later in the file. The
value is the target record's `id` as the session server assigned it — never
its name or another field — so a form chooses it from a list of the target's
records with the record `id` as the option value. Informative: the reference
session server assigns UUIDs and refuses a relation value that is not one; a
development host keeps the ids its seed files give.

**A relation points at a record the caller can read.** A session server MUST
refuse a relation value that names no record of `targetTypeId`, or one the
caller's `view` reach ([`access`](#access)) does not cover
(`order: does not name a readable Order record`). An owner-scoped target is
therefore one of the caller's own: a member cannot attach a note to another
account's order. A relation declares no scope of its own — the target's access
rules are the scope.

**Unique keys.** An entity MAY declare `unique`: a list of field-name lists
(`"unique": [["owner", "sessionId"]]` — one reply per person and session;
`[["owner", "announcementId"]]` — one like per person and announcement). A
session server refuses a create or an update that would give two records the
same values on every field of one key, with `409` and code `CONFLICT`, its
message naming each field of the key as `<field>: <reason>` parts separated by
`;` (`email: another Signup record already has this value`), the form a page
reads the refused fields from ([data-protocol §4.2](data-protocol.md#42-statuskeys)). A
server-owned field (`owner`) counts with the value the server sets. A key one
of whose fields the record leaves empty constrains nothing.

**Closed lists.** A field whose values come from a fixed list the server
should enforce is `enum`, with the list in `values` (`["placed", "shipped"]`);
a producer MUST write `values` on an `enum` field and MUST NOT write it on a
field of another type. A list that is only offered — a select's options — may
stay `text`, the list living where it is offered (a `static` source, see
[data-protocol §2](data-protocol.md#2-data-sources)).

**`required`.** A required field MUST have a value when a record is created:
not absent, not `null`, not a blank string. An update MUST NOT clear it. The
session server enforces this — a producer cannot — and refuses with `400` and
code `VALIDATION_FAILED` (see [data-protocol §4](data-protocol.md#4-writes)).

### Server-owned fields

A field MAY be declared **server-owned** with `server`:

| `server` | The server sets it to | On create | On update |
|---|---|---|---|
| `"owner"` | the id of the signed-in caller (nothing for a visitor who has not signed in) | set | unchanged |
| `"ownerName"` | the caller's display name, else e-mail, at the time of the create (nothing for a visitor who has not signed in) | set | unchanged |
| `"createdAt"` | the time of the create (ISO 8601) | set | unchanged |
| `"updatedAt"` | the time of the write (ISO 8601) | set | set |
| `{ "default": v }` | `v` | set | the client MAY change it |

```json
{ "typeId": "Order", "fields": [
  { "name": "items", "type": "text", "required": true },
  { "name": "owner", "type": "text", "server": "owner" },
  { "name": "placed", "type": "date", "server": "createdAt" },
  { "name": "status", "type": "enum", "values": ["placed", "shipped"], "server": { "default": "placed" } }
] }
```

A `{ "default": v }` field is the server's only at creation: a status starts
"placed", and whoever the access rules let update the record moves it on. The
`owner` field is the record's owner for an `own` access rule
([`access`](#access)).

**Who wrote it, on the page.** `owner` is an id, for rules and for
`{{row.owner == me.id}}` ("yours"); it is not something to show. A page that
says who wrote a record declares an `ownerName` field beside it and shows
that: the name as it was when the record was written, set by the server, so
nobody can sign another's name and no page has to resolve ids it may not
read.

### Writing a record

A session server answers a create (`POST`) and an update (`PATCH`) of a record
by these rules, in one `400 VALIDATION_FAILED` that lists every problem as
`<field>: <reason>` parts separated by `; ` (see
[data-protocol §5](data-protocol.md#5-record-endpoints-of-a-session-server)):

1. The record envelope — `id`, `entityType`, `createdAt`, `updatedAt` — is the
   server's: those members of the body are dropped.
2. **A field the entity does not declare is refused** (`total: is not a field
   of this record`).
3. **A value for a server-owned field is refused** where the server sets it —
   every server-owned field on create; `owner`, `createdAt` and `updatedAt`
   on update (`owner: is set by the server`). The server does not silently
   drop it: a client that sends one is wrong or forging, and is told.
4. **Every declared field's value is checked by its type, strictly**
   (§Field types: `qty: must be a number`), with its bounds and `mustBe`; on
   a field that is not `text`, a blank string is no value; `null` is no value.
5. **`required`** fields are checked as above.
6. **A relation names a record the caller can read** (§Relations).
7. **Unique keys** hold, else `409 CONFLICT` (§Unique keys).

The rules do not compute values: a `total = price × qty` is the producer's or
the server's own business. Informative: the reference contract is
`prepareRecordWrite` in `@pwfabric/contracts`, which the reference development
host (`pwf dev`) runs on every create and update.

`label` is the field's human name, for editors and generated forms.

Who may read and write an entity's records is not declared on the entity: it
is the app's access rules (`auth.json` `access`, below).

### Records an app ships

An entity's first records travel with the app in `app/content/<typeId>.json`
(UUID ids; published by inserting what the store does not hold), and records
to try the app with in `app/data/<typeId>.json` (never published); see
[data-protocol §6](data-protocol.md#6-shipped-content-and-development-data).

## `auth.json`

Who may enter the app — a **declaration**, not addresses.

```json
{ "required": true, "topology": "app", "methods": ["password", "google"],
  "connections": { "google": { "owner": "shared" } },
  "claims": { "subject": "sub", "email": "email", "name": "name" } }
```

| Member | Default | Meaning |
|---|---|---|
| `required` | `false` | Visitors must sign in before any page renders. |
| `topology` | `app` | `app` — the app's own door (a session server signs visitors in by the methods below); `external` — an issuer the app names signs them in. |
| `methods` | `[]` | `app` only: the ways in — `password`, `phiwebs` (a PhiWebs account), `google`, `github`, `microsoft`. |
| `registration` | `closed` when `required`, else `open` | `app` only: who may make an account — `open` (anyone), `invite` (only with an invitation the owner sent), `closed` (nobody: the accounts are the ones the owner made or assigned). See below. |
| `connections` | `{}` | `app` only, keyed by a social method that is also in `methods`: `{ owner: "shared" \| "own", clientId?, tenant? }`. `own` MUST name its `clientId`. |
| `issuer` | — | `external` only, REQUIRED there: `{ issuer, clientId, scopes = ["openid","profile","email"], audience?, authorizeUrl?, tokenUrl?, jwksUri? }`. |
| `claims` | `{ subject: "sub", email: "email", name: "name" }` | Which token claims carry the subject, email, name and (optionally) roles. |
| `access` | — | Optional `{ roles[], rules[{ subject, model, rule }] }` beside the identity: who may do what with the app's records (§`access` below). A reader removes it before validating the identity. |

The identity is closed: unknown members are refused.

Rules (the first three are in the schema):

1. `topology: "external"` requires `issuer` and forbids `methods` and
   `connections`.
2. `topology: "app"` forbids `issuer`.
3. `connections` keys are social methods (`google`, `github`, `microsoft`).
4. Every `connections` key MUST also be in `methods`. *(Beyond the schema.)*
5. `required: true` with no method (and, for `external`, no usable issuer) is
   **allowed** — it records an unanswered question, and an editor SHOULD ask
   the author to finish it. A publisher writes **no** envelope `auth.json` for
   it: an addresses document with no address would declare a door nobody may
   use. The app still declares `required: true`, so a runner gates it and,
   finding no way in, shows the sign-in wall with a disabled sign-in control
   and a message saying no identity provider is configured (see
   [session-protocol §5](session-protocol.md#5-the-gate)). It never lets the
   visitor through.

**Registration.** `member` in an access rule is any signed-in account, so a
team's app is only private if not just anyone can become a member. An app
says who may:

- `open` — anyone registers. A session server takes `POST registerUrl`.
- `invite` — an account is made only with an invitation: the register request
  carries `invitation` (the token the owner's invitation link brought), and a
  session server refuses it without a valid one (`403 INVITATION_REQUIRED`).
- `closed` — nobody registers through the app (`403 REGISTRATION_CLOSED`);
  the publisher writes no `registerUrl`.

Under `invite` and `closed` only an account that exists signs in; any other
credentials are refused like a wrong password. **Default:** `closed` when
`required` is true, `open` otherwise. An app that requires sign-in is a
members' space — a dashboard, an intranet — where an open door would make
every `member` rule public to whoever registers; an app with optional sign-in
is a public app whose visitors make their own accounts (a shop, a
conference). Roles do not decide it: a shop declares `staff` and still takes
customers.

**Roles are assigned, never registered.** A role in `access.roles` is granted
by the owner (an assignment, or the invitation that made the account) and
carried in the principal's `roles` ([session-protocol §8](session-protocol.md#8-the-session-server-informative)).
Registering gives an account no role. An app whose data belongs to a team
SHOULD grant it to a declared role (`squad`), not to bare `member`.

A producer of an older shape (`{ tenantId, clientId, scopes }`) wrote vendor
registration data, not a declaration; a reader MUST NOT guess an identity from
it and SHOULD report it.

### `access`

The app's own records have no API the person wrote: the session server builds
one from the declarations — `entities.json` gives the collections,
[data-protocol §5](data-protocol.md#5-record-endpoints-of-a-session-server)
the endpoints, and `access` who may call them. Every session server that keeps
an app's records enforces the same rules. A `rest` source (an API the person
named) is outside them: that API enforces its own.

```json
{ "required": false, "topology": "app", "methods": ["password"],
  "access": {
    "roles": ["staff"],
    "rules": [
      { "subject": "public", "model": "Booking", "rule": "create" },
      { "subject": "member", "model": "Booking", "rule": "read own" },
      { "subject": "staff",  "model": "Booking", "rule": "read, update" }
    ] } }
```

A visitor who leaves a booking cannot see anybody's bookings; a signed-in
visitor sees their own; staff see and change all of them.

**`subject`** — who the rule is for:

| `subject` | Who |
|---|---|
| `public` | Every visitor, signed in or not. |
| `member` | Every signed-in visitor. |
| a name in `roles` | A signed-in visitor whose principal carries that role (the `roles` claim, [session-protocol §3](session-protocol.md)). |

**`model`** — an entity's `typeId`.

**`rule`** — what the subject may do: verbs separated by commas or spaces.

| Verb | Endpoint (data-protocol §5) |
|---|---|
| `create` | `POST /records/<model>` |
| `list` | `GET /records/<model>`, and `count`/`aggregate` over the rows it lists |
| `view` | `GET /records/<model>/<id>` |
| `update` | `PATCH /records/<model>/<id>` |
| `delete` | `DELETE /records/<model>/<id>` |
| `count` | the plain, unfiltered `count` — a number, never a row; a filtered `count` and `aggregate` need `list` |
| `read` | `list` and `view` |
| `write` | `create`, `update` and `delete` |

The word `own` limits every verb of its rule except `create` to the records
the caller created: the list holds only those, and another visitor's record is
answered `404`. A visitor who is not signed in owns no record.

**How a server decides.**

1. A model **no rule names** is closed: no visitor may call its endpoints.
   A validator reports it as an error (`ACCESS_RULE_MISSING`), so data meant
   for everyone needs an explicit `public` rule. A development server MAY keep
   an app that declares no rule at all open, so an author can try it before
   writing rules; a host that publishes the app MUST NOT. No server may be
   more open than the rules.
2. A model **some rule names** is closed: a request is allowed only when a
   rule whose subject matches the caller grants its verb. Rules add up; none
   takes a grant away.
3. Refused: a caller without a session gets `401 SIGN_IN_REQUIRED`, one with a
   session `403 FORBIDDEN`; a single record outside an `own` grant is `404`.
   A list allowed only by an `own` grant answers the caller's rows and states
   `meta.scope: "owner"`.
4. A word that is not a verb, `own`, or a separator is ignored, and a rule with
   no verb grants nothing. A validator reports both (`APP_ACCESS_RULE`).
5. `required: true` still applies first: no data endpoint answers a visitor
   who has not signed in.

**What a visitor's page learns from them.** The rules stay with the server,
but a producer that knows them marks each own-records source a visitor who is
not signed in cannot read with `requiresSession: true`
([data-protocol §2.6](data-protocol.md#26-sources-that-need-a-session)),
deciding it by the steps above for a caller without a session. Signed out,
the runtime then settles that source as `unauthenticated` without the request
the server would refuse.

The person who owns the app reads and changes its records with the host's own tools, not
through these endpoints; the rules are about visitors.

## Conformance

- `examples/definitions.<file>/{valid,invalid}/*.json` for each file;
  `definitions.auth` is checked against the reference schema too.

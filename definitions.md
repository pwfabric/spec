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
  block of that type (see [session-protocol §6](session-protocol.md#6-the-account-control)).
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
| `engine` | An engine declaration, when the connection carries its own. |

Readers SHOULD also accept a bare string entry as `{ name }`. Producer-specific
members (`type`, `provider`, `description`) are carried.

## `entities.json`

```json
{ "entities": [
  { "typeId": "Product", "displayName": "Product", "fields": [{ "name": "name", "type": "text", "required": true }, { "name": "price", "type": "number" }] },
  { "typeId": "Review", "fields": [{ "name": "product", "type": "relation", "targetTypeId": "Product", "required": true }, { "name": "stars", "type": "number" }] }
] }
```

Each entity is `{ typeId, displayName?, fields: { name, type, required?, label?, targetTypeId? }[] }`.
Members beyond these are carried.

### Field types

A producer SHOULD write one of five field types. A session server that
validates records validates them by these types; it MAY store a field of any
other type without checking its value, and a reader MUST carry an unknown type
unchanged.

| `type` | Stored value | Also accepted on write (SHOULD) |
|---|---|---|
| `text` | a string; `""` is a value | — |
| `number` | a finite JSON number | a decimal numeral as a string (`"12.5"`, `"-3"`, `"1e3"`) |
| `boolean` | `true` or `false` | `"true"`/`"false"`, `"on"`/`"off"`, `"1"`/`"0"` (any case), `1`/`0` |
| `date` | an ISO 8601 string (`"2026-10-18"`, `"2026-10-18T09:30:00Z"`) | — |
| `relation` | the `id` of one record of the collection `targetTypeId` names, as a string | — |

**Why strings are accepted.** A form block gathers its values the way an HTML
form does, so every value arrives as a string: a number field sends `"2"`, a
checkbox `"on"`, a two-way choice `"true"` or `"false"`. A server SHOULD read
those strings as the field's type, and MUST still refuse a value that is not
one: `"abc"` for a number, `"yes"` for a boolean.

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

**Closed lists.** There is no choice type. A field whose values come from a
fixed list is `text`; the list lives where it is offered — a select's options
or a `static` source (see [data-protocol §2](data-protocol.md#2-data-sources)).

**`required`.** A required field MUST have a value when a record is created:
not absent, not `null`, and (for a non-text field) not blank. An update SHOULD
NOT be allowed to clear it. The session server enforces this — a producer
cannot — and refuses with `400` and code `VALIDATION_FAILED` (see
[data-protocol §4](data-protocol.md#4-writes)). Informative: the reference
development host enforces `required` on create and update, counting absent,
`null` and `""` as missing, and checks no types.

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
| `count` | `count`/`aggregate` over every row — a number, never a row |
| `read` | `list` and `view` |
| `write` | `create`, `update` and `delete` |

The word `own` limits every verb of its rule except `create` to the records
the caller created: the list holds only those, and another visitor's record is
answered `404`. A visitor who is not signed in owns no record.

**How a server decides.**

1. A model **no rule names** is open: every visitor the app lets in may call
   every endpoint. A server MAY be stricter (a hosted one may infer that a
   collection a form fills is shown to nobody); it MUST NOT be more open than
   the rules.
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

The person who owns the app reads and changes its records with the host's own tools, not
through these endpoints; the rules are about visitors.

## Conformance

- `examples/definitions.<file>/{valid,invalid}/*.json` for each file;
  `definitions.auth` is checked against the reference schema too.

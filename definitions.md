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
{ "entities": [{ "typeId": "Product", "displayName": "Product", "fields": [{ "name": "name", "type": "text", "required": true }] }] }
```

Each entity is `{ typeId, displayName?, fields: { name, type, required?, label? }[], scope? }`.
Members beyond these are carried. The field `type` vocabulary is defined by the
session server that stores records; this version does not fix it.

### `scope` (draft)

> **Status: draft.** Proposed for the next format version; the reference
> development host already honours it, and a reader that does not know it
> carries it unchanged.

```json
{ "entities": [{ "typeId": "Order", "scope": "owner", "fields": [{ "name": "total", "type": "number" }] }] }
```

| Value | Meaning |
|---|---|
| absent | The server's default: a shared collection, unless the server infers owner scope (below). |
| `project` | One collection for the whole app: every visitor allowed in reads and writes the same records. |
| `owner` | One collection **per visitor**: the session server stamps each record with the signed-in principal that created it, lists only the caller's own records, answers another visitor's record as `404`, and refuses a request without a session (`401 SIGN_IN_REQUIRED`). The record list answer then states `meta.scope: "owner"` (see [data-protocol §5](data-protocol.md#5-record-endpoints-of-a-session-server)). |

The flag replaces guessing. Before it, a server could only infer an
owner-scoped collection from the shape of the declaration — an owner-like
field name (`ownerId`, `userId`, `createdBy`, …) or an `access.rules[]` entry
naming the model. A server MAY still infer owner scope from those signals
when `scope` is absent. Informative: the reference development host honours
`owner` and does not yet act on an explicit `project`.

### Seed records

A development host MAY seed a collection from `app/data/<typeId>.json`
shaped `{ "data": [ records ] }`; see
[data-protocol §6](data-protocol.md#6-seed-data-for-development-hosts-optional).
It is a development-only convention, not part of the published app.

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
| `access` | — | Optional `{ roles[], rules[{ subject, model, rule }] }` beside the identity. A reader removes it before validating the identity. |

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

## Conformance

- `examples/definitions.<file>/{valid,invalid}/*.json` for each file;
  `definitions.auth` is checked against the reference schema too.

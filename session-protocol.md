---
status: draft
formatVersion: "1.0"
---

# The session protocol

When an app declares that visitors must sign in, or offers sign-in at all, the
runner and a **session server** speak this protocol. There are two doors, and
the app's declaration picks one: an **external issuer** the app names (OpenID
Connect with PKCE, in the browser), or the **app door** — a session server that
signs visitors in by password or by a provider, and hands back an opaque
session token. This document specifies what the runner expects to be told, the
requests it makes, where it keeps the session, how it signs out, and how the
credential reaches receipts and data.

Schema: [`schemas/session-protocol.schema.json`](schemas/session-protocol.schema.json)
(the session server's answers; hand-written). The addresses document is
[`schemas/envelope.auth.schema.json`](schemas/envelope.auth.schema.json).

**Why draft.** The provider half of the app door moved from the browser to
the app's own origin recently (§4.2), and the server side of the app door
(§8) is restated from one implementation. The status moves to stable when a
second session server implements §4 and §8.

## 1. A visitor is not a host user

A signed-in visitor is a **principal of one app**, identified by
`(app, issuer, subject)`. A session server MUST NOT accept a visitor's token as
a credential of anything else, and signing into one app MUST NOT sign the
visitor into another. A password visitor and a provider visitor with the same
e-mail address are different principals.

## 2. `auth.json`

The envelope's `auth.json` carries **addresses**, never secrets. It is present
only when the app has a way in.

| Member | Door | Meaning |
|---|---|---|
| `provider` | both | `oauth2-pkce` for an external issuer. For the app door a publisher writes `password` when the door takes a password (with or without provider buttons) and `platform` when it offers provider buttons only. A runner treats any value other than `oauth2-pkce` as the app door and reads the members below, not the value. |
| `issuer`, `clientId`, `scopes` | issuer | The issuer (its `iss`, and the OIDC discovery base), the public client id, the scopes to ask for. REQUIRED for `oauth2-pkce`. A publisher appends `offline_access` to the declared scopes when they lack it (§3.3). |
| `methods` | app door | The declared `methods` of the identity, copied as they are. Informative: the runner decides what to draw from `loginUrl` and `providers`. |
| `authorizeUrl`, `tokenUrl` | issuer | Stated endpoints; when both are present the runner skips discovery. |
| `audience` | issuer | The app's own API at the issuer (e.g. `api://<clientId>`), for the door token (§3.4). |
| `redirectPath` | issuer | Legacy callback path; honoured only when a callback already lands there. |
| `loginUrl`, `registerUrl`, `logoutUrl`, `sessionUrl` | app door | The session server's addresses. `registerUrl` only when the door takes new accounts. |
| `providers` | app door | `{ method }[]` — the provider buttons: `host`, `google`, `github`, `microsoft`. Names only. |
| `startUrl`, `gatewaySessionUrl`, `gatewayLogoutUrl` | app door | The app origin's sign-in addresses. Defaults `/_auth/start`, `/_auth/session`, `/_auth/logout`. |

The runner never constructs a host name; every request in this document goes
to an address it was handed or to its own origin.

The **app's own API base** is `loginUrl` without its trailing `/login`; it is
how the runner recognises its own data requests (§7). An app with no
`loginUrl` ending in `/login` has no own base — which includes every
external-issuer app (§9).

A publisher writes `auth.json` only when there is a way in: an issuer, a
password door it can address, or at least one provider button. An app that
declares `required: true` with none of these ships **no** `auth.json` (§5).

## 3. Door A — external issuer (PKCE)

Used when `provider` is `oauth2-pkce` and `issuer` and `clientId` are present.

### 3.1 Endpoints

If `authorizeUrl` or `tokenUrl` is missing, the runner fetches
`GET <issuer without trailing slash>/.well-known/openid-configuration` and
reads `authorization_endpoint` and `token_endpoint`; both MUST be present.
Discovery is cached per issuer; a failed discovery is not.

### 3.2 Sign-in

1. The runner makes a verifier (32 random bytes, hex), a state (32 hex
   characters) and the challenge `base64url(SHA-256(verifier))`.
2. It stores `{ state, verifier, redirectUri, returnTo }` in
   `sessionStorage["pwapp_pkce_pending:<k>"]` and navigates to `authorizeUrl`
   with `response_type=code`, `client_id`, `redirect_uri`, `scope`
   (space-joined), `state`, `code_challenge`, `code_challenge_method=S256`.
3. `redirect_uri` is the **app base**: origin plus the router's base (the
   shell's path under hash routing, the `<base href>` under path routing). One
   registered redirect URI per app. `returnTo` is the path, query and fragment
   the visitor started from.
4. On load with `?code&state`, the runner takes the pending record (removing
   it whether or not it matches). On a match it posts to `tokenUrl`
   (form-encoded) `grant_type=authorization_code`, `code`, `redirect_uri`,
   `client_id`, `code_verifier`, then restores `returnTo`. A state with no
   matching record, or a failed exchange, is shown to the visitor as an error.

`<k>` is FNV-1a over `issuer|clientId|<scopes sorted, space-joined>`, in base
36, so two apps on one origin never share a token.

### 3.3 Tokens and refresh

The token response is read as `{ access_token, refresh_token?, id_token?,
expires_in, scope? }`. The access token is kept in memory only; the refresh
token in `sessionStorage["pwapp_pkce_rt:<k>"]`. The visitor's profile is
decoded (not verified) from the ID token, else the access token: `sub`, `name`,
`email` (or `preferred_username`), `roles`.

A refresh token exists only when the issuer was asked for `offline_access`.
Because both refresh and the door token (§3.4) depend on it, a publisher
appends `offline_access` to the declared scopes, and a runner sends the scopes
as given.

On load, a stored refresh token triggers one refresh
(`grant_type=refresh_token`, `refresh_token`, `client_id`) before the first
page; a failure removes it and the visitor is simply signed out. A token is
reused while it has more than 30 seconds left; a refresh answer without a new
refresh token keeps the old one.

A host that embeds the app MAY provide `window.__pwfabric_getToken(resource)`; the
runner asks it first and skips PKCE for data tokens when it answers.

### 3.4 The door token

An issuer's access token names the APIs the app reads (its audience is the
data API), so it is not a credential for the app's own session server. When
`audience` is set, the runner redeems the refresh token for the scope
`<audience>/.default` (`grant_type=refresh_token`, `scope`) on first need and
presents **that** token to the session server (§7). The scope MUST NOT be sent
on the authorize request.

### 3.5 Sign-out

The runner forgets the refresh token, the access token and the door token. It
does not call the issuer's end-session endpoint.

## 4. Door B — the app door

Used when `loginUrl` is present and `identity.topology` is not `external`, or
when `providers` is non-empty.

### 4.1 Password

`POST loginUrl` (or `registerUrl` when the visitor is creating an account)
with `Content-Type: application/json` and
`{ email, password }` (registration may add `displayName`). The answer is a
**door response**:

```json
{ "data": { "token": "q8Zr…", "expiresAt": "2026-10-13T09:12:03.000Z",
            "principal": { "id": "p_1", "email": "ada@example.com", "displayName": "Ada" } } }
```

A refusal is `{ "error": { "code": "…", "message": "…" } }` with a 4xx status.
The runner shows `error.message` as given. A session server SHOULD answer every
credential failure with the same message, so an address cannot be probed.

### 4.2 Providers (through the app's origin)

The browser holds no provider client id, verifier or code. To sign in with a
provider the runner navigates to
`<startUrl>/<method>?returnTo=<path>`, where `returnTo` is a path on the app's
own origin (a value not starting with `/`, or starting with `//` or `/\`, is
replaced by `/`). The app origin's sign-in endpoint runs the provider flow with
the session server and sends the visitor back to `returnTo` with the session in
an HttpOnly cookie on the app's origin. On failure it sends the visitor to
`returnTo?auth_error=<code>`.

On load the runner:

1. reads and removes `auth_error` from the address (before routing), and shows
   it on the sign-in wall;
2. uses a session stored for this app, if any (§4.3), without a request;
3. otherwise, unless the topology is `external` or the provider is
   `oauth2-pkce`, asks `GET <gatewaySessionUrl>` with
   `credentials: same-origin` and the header `x-pwapp-request: 1`. A 200 answer
   is a door response (or a bare `{ token, expiresAt, principal? }`); anything
   else — including a 401, a static host's index page, a network error — means
   no session. The answer is stored (§4.3).

The app origin's session endpoint MUST answer only requests carrying
`x-pwapp-request: 1`, so a cross-site page cannot read a session out.

### 4.3 The session

The runner stores `{ token, expiresAt, principal? }` in
`sessionStorage["pwapp_session:<appId>"]` (see
[envelope §4](envelope.md#4-per-page) for `appId`). An entry that is
unparsable or whose `expiresAt` has passed is deleted on read. `sessionStorage`
means closing the tab ends the session. There is no refresh: when the session
expires the visitor signs in again.

When the stored session has no name or e-mail, the runner asks once
`GET sessionUrl` with `x-app-session: <token>`; the answer
`{ data: { principal } }` is merged into the stored session. Any failure leaves
the session as it was.

### 4.4 Sign-out

The runner, in parallel and ignoring failures, posts
`POST logoutUrl` with `x-app-session: <token>` (revoking the token) and
`POST <gatewayLogoutUrl>` with `credentials: same-origin` and
`x-pwapp-request: 1` (deleting the cookie). Then it clears the stored session,
forgets the PKCE session if any, clears its data caches, and re-evaluates the
gate. A second sign-out while one is in flight is the same sign-out.

## 5. The gate

The app is **gated** when `project.identity.required` is true and there is
neither an issuer session nor an app session. While gated the runner fetches
no receipt and renders a sign-in wall: a password form when the app door has a
`loginUrl`, provider buttons for `providers`, an issuer button when Door A is
configured. A `required` app with no way in has no `auth.json` (§2); the
runner still gates it — `required` comes from the app's identity, not from
`auth.json` — and shows the wall with a disabled sign-in control and a message
saying no identity provider is configured. It never lets the visitor through.
The wall removes itself the moment a session appears and the refused
page renders.

The wall protects the view. Receipts on a plain static host are files anyone
can fetch; only a host that checks the credential on receipt requests (§7), and
a session server that refuses data, enforce sign-in.

## 6. The account control

Blocks ask for sign-in or sign-out by emitting an event whose
`payload.action.type` is `auth:signIn` or `auth:signOut`; the runner handles
them. When `navigation.json` declares `account`, the runner injects into every
block of type `account.placement` the prop

```json
{ "state": "signed-in", "name": "Ada", "email": "ada@example.com", "avatarSrc": "…",
  "profileHref": "#/profile", "links": [{ "label": "Orders", "href": "#/orders" }],
  "signInLabel": "Sign in", "signOutLabel": "Sign out", "profileLabel": "Profile" }
```

with hrefs already in the router's form. When the app has no way in, the slot
is left empty. Sign-in with exactly one provider and no password door goes
straight to that provider; with only an issuer, straight to the issuer;
otherwise the wall opens on demand.

## 7. Credentials on requests

**Receipts.** A receipt request carries exactly one credential: the app
session as `x-app-session: <token>`, else the door token (§3.4) as
`Authorization: Bearer <token>`, else nothing. A host that gates receipts reads
either header.

**Data.** A data request whose source names an `authProviderRef` gets
`Authorization: Bearer <token>` only when the ref, without trailing slashes,
equals the app's own API base (§2): the app session token, else the issuer's
access token. Any other ref gets no token. A visitor's credential MUST NOT
reach a third party. An external-issuer app has no own API base, so this rule
never sends a token for its own records (§9).

## 8. The session server (informative)

What a session server answering the app door does, as implemented by the
reference platform:

| Request | Answer |
|---|---|
| `POST <base>/register` `{ email, password (≥ 8), displayName? }` | `201` door response; `409` when the account exists |
| `POST <base>/login` `{ email, password }` | `200` door response; `401` for every credential failure |
| `POST <base>/logout` with `x-app-session` or bearer | `200 { data: { signedOut: true } }`; idempotent |
| `GET <base>/session` with `x-app-session` or bearer | `200 { data: { principal } }`; `principal` is `null` only for apps that allow anonymous visitors |

It accepts the credential on `x-app-session` or `Authorization: Bearer`, stores
only a hash of the session token, and refuses a gated app's requests without a
session with `401 { error: { code: "SIGN_IN_REQUIRED", … } }`. For an external
issuer it verifies the bearer JWT against the issuer's keys (`jwksUri`): RSA
signatures, `iss` equal to the issuer, `aud` containing `audience` (else
`clientId`), and `exp`.

## 9. Known limitation: external issuer and the app's own records

> To be resolved in a later format version. This section records the
> behaviour of format 1.0; it is not a requirement on new implementations.

The runner recovers the app's own API base **only** from `loginUrl` (§2). An
external-issuer `auth.json` carries no `loginUrl` — the issuer is the door —
so an external-issuer app has no own API base, and:

1. A data request whose source names `authProviderRef: "<base>"` (the shape a
   publisher writes for the app's own records, see
   [data-protocol §2.2](data-protocol.md#22-entity)) gets **no**
   `Authorization` header: the ref matches no own base, and §7 sends nothing
   to an unmatched ref.
2. Neither the issuer's access token nor the door token (§3.4) is sent with
   those requests. The door token reaches the session server on **receipt**
   requests only (§7).
3. A session server that gates the app therefore answers the app's own record
   requests `401 SIGN_IN_REQUIRED` even after the visitor has signed in; the
   source binds its `fallback` (or its error state). A session server that
   does not gate the records serves them anonymously.

Sources served by a connection's engine (`entity` sources with a
`connector`) are not affected: the runner hands an engine the issuer's access
token directly, without the own-base rule.

A later format version is expected to state the own API base in `auth.json`
for both doors instead of deriving it from `loginUrl`.

## Conformance

- `examples/session-protocol/{valid,invalid}/*.json` — door responses.
- `examples/envelope.auth/{valid,invalid}/*.json` — the addresses document.
- A scripted exchange fixture (requests a runner makes, answers a session
  server gives) is reserved for `fixtures/`.

---
status: draft
formatVersion: "1.0"
---

# Hosting security

A published app runs code that its author did not write line by line: blocks
from packs, the app's own blocks, compiled engines. Everything that code can
reach, it can reach as the app. This document states what a host must do so
that reach stays inside the app, and what the reference engine does and does
not promise.

**Why draft.** The session storage of §3 is what the reference runner does
today; a cookie-based session for the app door is specified as preferred, not
yet as the only way. The status moves to stable when both the runner and a
session server implement the HttpOnly flow end to end.

## 1. The origin

An app MUST be served from an origin that carries no other privileges.

- No studio, admin, account or other application is served from the same
  origin, and none of their cookies are scoped to it (a cookie set for a
  parent domain counts).
- Nothing else writes `localStorage`, `sessionStorage`, IndexedDB or the
  Cache API of that origin.
- The origin is not on any other service's CORS allowlist with credentials,
  except the app's own session server.

Block code runs with the full authority of the page. Same-origin separation is
the only boundary the browser enforces between an app and anything else, so a
host that puts an app next to something privileged has given every block that
privilege. One origin per app (`<app>.apps.example`) is the simplest way to
meet this; several apps of one owner MAY share an origin when they share
everything else too.

## 2. The Content Security Policy

A host SHOULD serve the policy the app was published with
([pwapp-format §2.1](pwapp-format.md#21-content-security-policy),
`publish.json` `csp.policy`, or the `_headers` file) as a
`Content-Security-Policy` response header on every page path. The policy
limits where block code can send data and what it can load; it does not limit
what block code can do with the data it can already read.

## 3. The session and block code

The reference runner keeps the app door's session token, and an external
issuer's refresh token, in `sessionStorage`
([session-protocol](session-protocol.md)). Block code runs in the same page and
can therefore read it. A host:

- SHOULD prefer the HttpOnly session-cookie flow: the app origin's
  `/_auth/*` endpoints keep the session in an `HttpOnly` cookie scoped to that
  origin, and the browser holds a token only for as long as it needs one;
- SHOULD keep session lifetimes short and revoke a session server-side on
  sign-out;
- MUST NOT give an app's visitor token any authority outside that app
  ([session-protocol §1](session-protocol.md#1-a-visitor-is-not-a-host-user)).

## 4. Screening is hygiene, not a boundary

A producer or a marketplace MAY screen block source (forbidden APIs, network
calls, obfuscation) before publishing it. That catches mistakes and lazy
abuse; it does not stop a determined author, because what code does at run
time cannot be decided from its text. Hosts MUST NOT rely on screening for
isolation. The boundaries are §1 (the origin) and §2 (the policy).

## 5. The preview bridge

An authoring host MAY show an app's pages in an iframe served from a separate
preview origin, which meets §1 for the author's own session. To keep the
preview live without a rebuild, the reference runner has a bridge through which
the framing page pushes a page and the project theme into the running app.

- It is preview-only and off by default. The runner adds a `message` listener
  only when the shell calls `runApp({ previewBridge: { allowedOrigins } })`.
  A host MUST NOT enable it in a published app's shell; published apps never
  listen.
- It is defined by an exact-origin and nonce handshake:
  - `allowedOrigins` are compared to `MessageEvent.origin` with string
    equality. No suffix, prefix or wildcard matching; an entry that is not a
    canonical `http(s)` origin is discarded.
  - A message counts only when `event.source` is `window.parent`.
  - Each page load draws one nonce of at least 128 bits from
    `crypto.getRandomValues`. The runner posts
    `{ type: "pw:preview-ready", nonce, pageKey }` to the parent once per
    allowed origin, each with that origin as `targetOrigin`. It posts again
    after every page change, with the same nonce.
  - The parent answers `{ type: "pw:preview-hello", nonce }`. Until it does,
    nothing else is read. After it, only the origin that answered is heard, and
    every message carries the nonce.
- Payloads are validated before rendering. They are capped at 2 MiB of
  serialized JSON, unknown `type`s are dropped, and the rest is checked against
  the surface and appearance shapes. There are two kinds:
  - `{ type: "pw:surface-update", nonce, pageKey?, surfaceId?, surface: { blocks, appearance?, capabilities? } }`
    applies only to the page on screen, and only when it names that page.
  - `{ type: "pw:project-theme", nonce, theme }` is resolved like
    `pwpack/appearance.json` and reaches the renderer as an appearance
    reference. It is never injected as CSS.
- Every refusal is silent. Nothing is posted back.
- A pushed block type that the app's block manifest lacks is drawn as a
  "rebuild needed" placeholder. No code is loaded for it.

The bridge gives the framing origin the same power over the preview that the
author already has over the app's source. It gives no other origin anything.

## Conformance

- `examples/pwapp-format/{valid,invalid}/*.json` carry `publish.json` with and
  without a well-formed `csp`.
- In the engine repository, the CLI's browser end-to-end test serves the
  round-trip apps under their policy, requires zero violations, and checks
  that a block fetching an undeclared origin is blocked.

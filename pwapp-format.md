---
status: draft
formatVersion: "1.0"
---

# The pwapp format

A **pwapp** is a published app: everything a static host needs to serve it to
visitors. It has two halves — the app as **data** (the [envelope](envelope.md):
pages, navigation, appearance, identity addresses) and the **runtime** that runs
it (a shell page, the runner, the renderer, the shared modules blocks import,
and the compiled block and engine modules the pages use). This document
specifies the served folder, the shell's obligations, the import map, and
`publish.json`, the record of what a published app was resolved against.

Schema: [`schemas/pwapp-format.schema.json`](schemas/pwapp-format.schema.json)
(for `publish.json`; hand-written, no reference schema exists).

**Why draft.** The served folder (§1–§3) is what hosts serve today and is
stable in practice. The packaged form — a `.pwapp` that is the app's
[`.pwpack`](pwpack-format.md) plus `publish.json` plus the compiled output — is
not yet written by any implementation, and `publish.json` (§4) is a
provisional shape. The status moves to stable when a producer writes `.pwapp`
archives and a host serves one.

## 1. The served folder

```text
index.html                         the shell                                (REQUIRED)
assets/embed.<hash8>.js            the renderer; defines window.PWFabric      (REQUIRED)
assets/runner.<hash8>.js           the runner, an ES module exporting runApp  (REQUIRED)
assets/theme.<hash8>.css           the app's tokens as CSS custom properties  (RECOMMENDED)
assets/boot.<hash8>.js             the module that calls runApp (§2)          (RECOMMENDED)
_headers                           response headers for static hosts (§2.1, §2.2) (RECOMMENDED)
robots.txt                         crawlers may read the app (§2.4)           (RECOMMENDED)
shims/<file>.mjs                   import-map targets (§3)                    (REQUIRED)
blocks/manifest.json               block type → module + SHA-256              (REQUIRED)
blocks/<type>.<hash8>.mjs          one ES module per block type a page uses
engines/manifest.json              connector/provider engines                 (OPTIONAL)
engines/<atomId>.<hash8>.mjs       compiled engines only
pwpack/                            the envelope: project.json, surfaces/…     (REQUIRED)
pwpack/media/<file>                media copied into the app, when any
```

`<hash8>` is the first eight hex digits of the SHA-256 of the file's bytes:
a runtime file's name changes exactly when its content does, so a host can
keep it forever (§2.2). A producer MAY use unhashed names (`assets/embed.js`);
the shell names whatever it ships. A published app ships **no source maps**
(`*.map`): they are for the engine's developers, not its visitors, and a
`sourceMappingURL` comment pointing at a file that is not served is removed.

`assets/` holds runtime files only; content files (images, video, fonts) are
`pwpack/media/<file>`, the pack's `media/` copied as it is
([pwpack-format §1.3](pwpack-format.md#13-media)).

The names `assets/`, `shims/`, `blocks/`, `engines/` and `pwpack/` are the
defaults the shell passes to the runner; a shell MAY place them elsewhere and
pass the locations explicitly (§2). Every path the runtime fetches is relative
to the shell's base, so the folder works at a host root, under a sub-path, or
on a CDN.

There is no per-page HTML. A host that serves the app with path routing MUST
answer every page path with `index.html` (an SPA fallback); a host without one
uses hash routing, which needs no host configuration.

## 2. The shell

`index.html` MUST, in this order:

1. declare the import map of §3 in a `<script type="importmap">`;
2. contain the mount element (default `#root`);
3. import `runApp` from the runner and call it, passing the renderer's
   address as `renderer`.

The renderer (a classic script that defines `window.PWFabric` and seeds every
module global of §3) MUST NOT be a blocking script: nothing the size of the
renderer may stand between the visitor and the first paint. The shell MAY
name it as `<script async src="{renderer}">`, so it downloads with the page
and runs the moment it arrives; it SHOULD NOT name it for an app that requires
sign-in (`identity.required`), whose visitor may never need it. The **runner**
needs the renderer only to draw a page: it imports nothing the renderer seeds
until then, and when it needs it, it waits for the element the shell named
or, when there is none, adds `<script src="{renderer}">` itself — so a visitor
held at the sign-in gate never downloads it.

The shell SHOULD start the downloads the first page needs at once, without
holding the page:

- `<link rel="modulepreload">` for the runner and for every shim file of §3;
- the renderer, as above;
- `<link rel="preload" as="fetch" crossorigin>` for the envelope files every
  runner reads on boot that the folder has: `pwpack/project.json`,
  `navigation.json`, `appearance.json`, `connections.json`,
  `blocks/manifest.json`, `engines/manifest.json`.

The import map is the only script that has to be inline: browsers do not load
an import map from a file. Everything else SHOULD be a file, so the policy of
§2.1 needs no hash but the import map's. The reference shell:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' blob: 'sha256-…'; …" />
<title>Café</title>
<meta name="description" content="Our menu, by category, with each dish's diet and price." />
<link rel="stylesheet" href="./assets/theme.3248118d.css" />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap" />
<script type="importmap">{ "imports": { "react": "./shims/react.mjs", "…": "…" } }</script>
<link rel="modulepreload" href="./assets/runner.9094f562.js" />
<script async src="./assets/embed.4f99b147.js"></script>
<link rel="modulepreload" href="./shims/react.mjs" />
<link rel="preload" as="fetch" href="./pwpack/project.json" crossorigin />
<div id="root"></div>
<script type="module" src="./assets/boot.7838adfe.js"></script>
```

```js
// assets/boot.7838adfe.js
import { runApp } from './runner.9094f562.js'
runApp({ source: './pwpack', blocks: './blocks/', renderer: './assets/embed.4f99b147.js', router: 'hash' })
```

The shell's `<meta name="description">` is the app's description (envelope
§2, `description`), or the entry page's own when the app states none; the
runner keeps it per page (envelope §4).

`runApp` options:

| Option | Default | Meaning |
|---|---|---|
| `source` | `./pwpack` | Folder path or absolute URL of the envelope. |
| `blocks` | `./blocks/` | Folder holding `manifest.json` for block modules. |
| `engines` | `./engines` | Folder holding `manifest.json` for engines. |
| `renderer` | `./assets/embed.js` | Address of the renderer, relative to the document. When the first page is drawn the runner uses `window.PWFabric` if it is defined (a host that loads the renderer its own way keeps its own), else waits for a `<script>` the page has with that address, else adds one. |
| `router` | `hash` | `hash`, `path`, or `auto` (= `path` only when `history.pushState` works **and** the page declares `<meta name="pw-router" content="path">`). |
| `mount` | `#root` | Mount element selector. |
| `locale` | `en` | Content locale of runtime-drawn text (`en`, `tr`). |

Under path routing the app's base is the `<base href>` the shell declares; a
host that serves the app under a sub-path SHOULD inject one.

If the renderer cannot be loaded, or loads without defining
`window.PWFabric`, the runner MUST fail loudly rather than render nothing.

Besides `render(target, { surface }, options)`, the renderer defines
`loadBlocks(blocks, descriptors)`: it loads the module of every block type the
tree `blocks` places (children included) at once, and resolves when they have
all settled or 3 s have passed; it never rejects. The runner calls it before it
takes the previous page down, and `render` itself waits for it in fat mode, so
a page is drawn in one commit instead of one wave per nesting level — each
wave moved the content under it (layout shift). The runner MAY start the
modules' downloads as soon as it has the receipt, before the renderer is in,
with the request the block loader makes (`GET`, `credentials: 'omit'`); the
loader's own request is then answered by the browser's cache (§2.2).

### 2.1 Content Security Policy

A published app carries a Content Security Policy derived from what it
declares, so that a block can reach only what the app was published to reach.
A producer computes it at publish time and writes it three times: as a
`<meta http-equiv="Content-Security-Policy">` that is the first element of the
shell's `<head>` after the charset; as `_headers` at the folder root (the
static-host convention: a `/*` line and an indented
`Content-Security-Policy: …` line); and as `publish.json` `csp.policy` (§4).
A host SHOULD serve `csp.policy` (or `_headers`) as a response header on every
page path; the meta is the fallback for a host that serves files only, and a
meta cannot carry `frame-ancestors`, so the meta omits it. A host that serves
both enforces both; the browser then reports one violation per policy.

| Directive | Sources | Why |
|---|---|---|
| `default-src` | `'none'` | Nothing that is not listed. |
| `script-src` | `'self' blob:` and the import map's `'sha256-…'` | Runtime files are on the app's origin; block and engine modules are verified (§5) and imported from `blob:` URLs; the import map is the one inline script. |
| `style-src` | `'self' 'unsafe-inline'`, plus the webfont stylesheet's origin and placed blocks' `style` origins | The renderer draws `<style>` elements at run time (per-page base, visibility, state, responsive and dark-theme rules) and blocks set `style` attributes; neither can be hashed ahead of time. |
| `img-src`, `media-src` | `'self' data: blob:`, plus media origins and placed blocks' `img` / `media` origins | Media origins: `publish.json` `media[]` and absolute URLs in receipt props other than links (`href`, `…Href`, `link`, `url`, `to`). |
| `frame-src` | media origins and placed blocks' `frame` origins, and `'self'` when a page frames a document of the app's own media, when there are any | Embeds name their address in a prop; a block that builds its embed address declares the origin. A page frames its own media when a block prop other than a link holds `pwpack/media/<file>` ending in `.pdf`, `.html`, `.htm` or `.txt` (`./` or `/` before it names the same file); an image, a sound or a video is not framed. |
| `font-src` | `'self'`, plus the webfont files' origin and placed blocks' `font` origins | The allow-listed webfonts the theme names. |
| `connect-src` | `'self'`, plus every origin the app's data and sign-in reach | Absolute `rest` endpoints in receipts; declared engines' `host` resolved with the connection's `config` ([connector-manifest §3.1](connector-manifest.md#31-templates)); the addresses of the envelope `auth.json` and an external issuer; placed blocks' `connect` origins. |
| `base-uri` | `'self'` | A host injects `<base href>` for path routing (§2); `'none'` would make the browser ignore it. |
| `object-src` | `'none'` | |
| `frame-ancestors` | `'none'` | Header only. A host that frames the app replaces it. |

*Placed blocks' origins* are the `definition.origins` of every block type a
page of the app places ([block-manifest, `origins`](block-manifest.md#origins)),
each added to the directive it names. A block that a pinned pack carries but
no page places adds nothing.

An origin that cannot be known at publish time — a template whose `config`
value is missing, an endpoint with an expression in its host, a compiled
engine (its code may reach any origin), a token endpoint discovered from an
issuer — is not guessed. The producer lists it in `csp.unresolved` and the
policy does not allow it; a host that knows the value MAY extend
`connect-src` before serving the header. A development server MAY serve a
policy with its own additions (its reload script and event stream are on its
own origin, so `'self'` covers them); it SHOULD NOT need `'unsafe-eval'`.

### 2.2 Caching

A producer writes, in `_headers`, how long each part of the folder may be
kept. A static host applies every rule that matches a path and joins a header
two rules set, so the rules match disjoint paths (a later rule's
`! Cache-Control` line takes back an earlier one's):

| Path | `Cache-Control` | Why |
|---|---|---|
| `/`, `/index.html` | `no-cache` | The shell names this publish's files. |
| `/assets/*`, `/blocks/*.mjs`, `/engines/*.mjs` | `public, max-age=31536000, immutable` | Content-hashed names (§1). |
| `/blocks/manifest.json`, `/engines/manifest.json`, `/shims/*`, `/pwpack/*` | `no-cache` | Fixed names whose content changes with a publish. |
| `/pwpack/media/*` | `public, max-age=3600` (after `! Cache-Control`) | Media keeps its name across publishes. |

A host that pages with path routing answers a page path with the shell and
SHOULD send the shell's `no-cache` with it. A development server MAY send
`no-cache` for everything.

### 2.3 Webfonts

The theme's allow-listed webfonts ([appearance](appearance.md)) are loaded so
that they never hold the first paint and never move the text:

- **Only the styles the theme draws.** The body family in its body weight and
  the emphasis weights blocks use (500, 600, 700, as the family offers them);
  the heading family in its heading weight; the mono family regular. No
  italics: the browser slants the upright face.
- **Not render-blocking.** The shell preconnects to the font origins and
  preloads the stylesheet (`<link rel="preload" as="style">`); the boot module
  links it. The stylesheet asks for `font-display: swap`.
- **A metric-matched stand-in.** For each family the theme stylesheet declares
  `"<Family> Fallback"` — `src: local(Arial | "Times New Roman" | "Courier New")`
  with the family's `size-adjust`, `ascent-override`, `descent-override` and
  `line-gap-override` (the allow-list carries them) — and the producer names
  it right after the family in the theme's font stacks
  (`Nunito, "Nunito Fallback", ui-sans-serif, …`) in `pwpack/appearance.json`
  and the stylesheet. Until the webfont arrives the page draws the stand-in,
  which takes the same room.

### 2.4 Search engines

The shell carries `<meta name="description">` (§2) and the runner keeps it per
page (envelope §4). The folder carries `robots.txt` allowing every path
(`User-agent: *` / `Allow: /`); a host that serves an app privately answers
with its own.

## 3. The import map and shared modules

Block and engine modules are compiled with a fixed set of bare specifiers left
unresolved. The host supplies each through the import map, pointing at a shim
module that re-exports a global the host seeded from its own copy — so every
block shares one React, one runtime event bus and one zod.

| Specifier | Shim | Global the shim reads | Seeded by a standalone app |
|---|---|---|---|
| `react` | `react.mjs` | `__pwfabric_react` | yes |
| `react/jsx-runtime` | `react-jsx-runtime.mjs` | `__pwfabric_jsx_runtime` | yes |
| `react-dom` | `react-dom.mjs` | `__pwfabric_react_dom` | yes |
| `@pwfabric/runtime` | `runtime.mjs` | `__pwfabric_runtime` | yes |
| `@pwfabric/runtime/data` | `runtime.mjs` | `__pwfabric_runtime` | yes |
| `@pwfabric/runtime/capability` | `runtime.mjs` | `__pwfabric_runtime` | yes |
| `@pwfabric/runtime/adapters` | `runtime.mjs` | `__pwfabric_runtime` | yes |
| `@pwfabric/contracts` | `contracts.mjs` | `__pwfabric_contracts` | yes |
| `@pwfabric/core` | `core.mjs` | `__pwfabric_core` | yes |
| `@pwfabric/authoring` | `sdk@v1.mjs` | `__pwfabric_sdk` | yes |
| `zod` | `zod.mjs` | `__pwfabric_zod` | yes |

Rules:

1. The import map MUST map every specifier in the table. An unmapped
   specifier fails the whole module that imports it at link time.
2. A standalone app's renderer MUST seed every global in the table before
   the first block module is imported; the shell needs no script of its own
   for it. A global nothing seeds still resolves (the shim exists) but its
   exports are `undefined`; a block that needs it degrades.
   The renderer's zod carries zod's English messages only: `z.locales` is
   `{ en }`. A block that wants zod's messages in another language ships that
   locale itself.
3. Several specifiers MAY share one shim file; the file then exports the union
   of what those specifiers' consumers import.
4. A block module MUST NOT import any other bare specifier. Relative imports
   inside the block's own compiled output are allowed. An import map resolves
   exact specifiers only, so a subpath (`@pwfabric/runtime/data`) is a
   separate specifier: it is listed only when the package root re-exports all
   of it, which is what lets the root shim serve it. Any other subpath is
   unmapped; the reference compiler warns about it (`HOST_SUBPATH_IMPORT`).
5. The list is versioned with the engine: a specifier is added only together
   with its shim and its global.

## 4. `publish.json` (provisional)

A published app records what it was resolved against, so the same `.pwapp`
can be re-served, audited or re-published without re-resolving anything:

```json
{
  "formatVersion": "1.0",
  "app": { "id": "@pwpack/example/bakery", "version": "0.3.0" },
  "liveVersion": "0.3.0",
  "publishedAt": "2026-10-06T10:00:00Z",
  "packs": [{ "id": "@pwpack/example/cards", "version": "1.2.0", "hash": "sha256:9f2c…" }],
  "atoms": [{ "kind": "block", "id": "control.badge", "hash": "sha256:0f1e…", "module": "blocks/badge.a3f1c2d4.mjs", "integrity": "a3f1…" }],
  "media": [{ "key": "hero", "url": "https://media.example.com/hero.webp" }],
  "csp": {
    "policy": "default-src 'none'; script-src 'self' blob: 'sha256-…'; …; frame-ancestors 'none'",
    "unresolved": [{ "source": "engine:Graph", "value": "engines/Graph.1a2b3c4d.mjs", "reason": "compiled engine …" }]
  }
}
```

| Member | Meaning |
|---|---|
| `formatVersion` | This format's version. |
| `app` | The `pwpack.json` `id` and `version` this publishes. |
| `liveVersion` | The published version visitors are served. |
| `publishedAt` | When it was published (RFC 3339). |
| `packs` | Resolved pins: every pack build the app runs on, with its content hash. |
| `atoms` | Per atom the app uses: its kind, id, source hash, and — for compiled kinds — the module path and its SHA-256 `integrity`. |
| `media` | The addresses generated or uploaded media were resolved to, by declaration key. |
| `csp` | `{ policy, unresolved? }`: the Content Security Policy of §2.1 as a header value, and what it could not resolve (`{ source, value, reason }`). A gateway serves `policy` as the `Content-Security-Policy` header. |

A `.pwapp` is the app's `.pwpack` (unchanged bytes), plus `publish.json`, plus
the served folder of §1. It is a resolved copy of the `.pwpack`, not a second
layout: the app's own files are never rewritten to produce it.

## 5. Integrity

Before evaluating any module listed in `blocks/manifest.json` or
`engines/manifest.json`, the runtime MUST fetch its bytes, compute SHA-256, and
compare with `integrity` (lower-case hex, or SRI `sha256-<base64>`). A missing
or mismatching hash MUST fail that module; it MUST NOT be evaluated.

## Conformance

- `examples/pwapp-format/{valid,invalid}/*.json` — `publish.json` documents
  against the hand-written schema.
- `examples/envelope.blocks-manifest/` and `examples/envelope.engines-manifest/`
  — the two manifests of §1 (specified in [envelope](envelope.md)).
- A served-folder fixture (shell, shims, one block, one page) that a
  conforming host serves and a conforming runtime renders is reserved under
  `fixtures/roundtrip/`.

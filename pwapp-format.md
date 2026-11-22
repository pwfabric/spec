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
index.html                         the shell: the entry page's document     (REQUIRED)
<key>/index.html                   a page's own document, under path routing (§1.1)
404.html                           the not-found document, under path routing (§1.1)
assets/embed.<hash8>.js            the renderer; defines window.PWFabric      (REQUIRED)
assets/runner.<hash8>.js           the runner, an ES module exporting runApp  (REQUIRED)
assets/theme.<hash8>.css           the app's tokens as CSS custom properties  (RECOMMENDED)
assets/boot.<hash8>.js             the module that calls runApp (§2)          (RECOMMENDED)
_headers                           response headers for static hosts (§2.1, §2.2, §2.6) (RECOMMENDED)
_redirects                         the app's redirects (§2.6)                (when it declares any)
robots.txt                         crawlers may read the app (§2.4)           (RECOMMENDED)
sitemap.xml                        every page's address (§2.4)                (RECOMMENDED with an origin)
llms.txt, llms-full.txt            the pages for a language model (§2.4.1)    (OPTIONAL)
shims/<file>.mjs                   import-map targets (§3)                    (REQUIRED)
blocks/manifest.json               block type → module + SHA-256              (REQUIRED)
blocks/<type>.<hash8>.mjs          one ES module per block type a page uses
engines/manifest.json              connector/provider engines                 (OPTIONAL)
engines/<atomId>.<hash8>.mjs       compiled engines only
pwpack/                            the envelope: project.json, surfaces/…, layout.receipt.json (REQUIRED)
pwpack/surfaces/<key>.html         a page's first frame (§2.5); nested keys in folders (RECOMMENDED)
pwpack/media/<file>                media copied into the app, when any
<path>                             the app's public files, as they are (pwpack-format §1.4)
```

`<hash8>` is the first eight hex digits of the SHA-256 of the file's bytes:
a runtime file's name changes exactly when its content does, so a host can
keep it forever (§2.2). A producer MAY use unhashed names (`assets/embed.js`);
the shell names whatever it ships. A published app ships **no source maps**
(`*.map`): they are for the engine's developers, not its visitors, and a
`sourceMappingURL` comment pointing at a file that is not served is removed.

`assets/` holds runtime files only; content files (images, video, fonts) are
`pwpack/media/<file>`, the pack's `media/` copied as it is
([pwpack-format §1.3](pwpack-format.md#13-media)). The app's `public/` files
are copied to the root of the folder byte for byte
([pwpack-format §1.4](pwpack-format.md#14-public-files)); a producer MUST
refuse one that lands on a path it writes, and lists the rest in
`project.json` `publicFiles` ([envelope §2](envelope.md#2-projectjson)). They
are served under the page policy of §2.1 with no caching rule of the
engine's (a host's default applies; an app sets one with `headers`, §2.6).

The names `assets/`, `shims/`, `blocks/`, `engines/` and `pwpack/` are the
defaults the shell passes to the runner; a shell MAY place them elsewhere and
pass the locations explicitly (§2). Every location the shell passes is relative
to the shell's base, and every module a manifest names is relative to the app
folder that holds `blocks/` and `engines/` ([envelope §5](envelope.md#5-blocksmanifestjson)),
so the folder works at a host root, under a sub-path, or on a CDN, and an app
placed in a page at another path still loads its modules from its own folder.

### 1.1 Documents

Under **hash routing** an app is one document, `index.html`: every page's
address is that file with a fragment (`#/<key>`), and no host configuration
is needed.

Under **path routing** (`runApp` `router` `path` or `auto`) every page is a
document of its own, so a static host serves each page as a file, with no
rewrite rule:

- the entry page: `index.html`, at the app's base (`<base>`);
- every other route: `<key>/index.html`, at `<base><key>/` — the address the
  runner writes for the page ([envelope §3](envelope.md#3-routing-and-links)).
  Static hosts serve a folder's `index.html` at the folder's address, and
  answer `<base><key>` (no slash) by sending the reader on to it or serving
  it in place;
- `404.html`: the app's not-found page (`notFoundSurfaceId`), or, for an app
  without one, the shell with nothing painted. A static host serves it, with
  status 404, for every path no file answers; a host that does not MUST
  answer such a path with it, status 404.

Each document is the shell (§2) with its page's head (§2.4) and its page's
first frame (§2.5). A nested key (`docs/intro`,
[pwpack-format §2.5](pwpack-format.md#25-page-keys)) has its document in
nested folders, `docs/intro/index.html`, and every document's `<base href>`
names the app's base, at whatever depth the document is. A page key whose
first segment is one of the folder names of §1 (`assets`, `blocks`,
`engines`, `shims`, `pwpack`) cannot have a document of its own; a producer
MUST refuse such an app under path routing.

A host that answers every path with `index.html` instead (an SPA fallback)
still serves a working app: the shell's first-paint script replaces the
entry page's frame with the page the address names (§2.5). Such a host
answers an unknown address with status 200, which search engines read as a
page.

## 2. The shell

`index.html` MUST, in this order:

1. declare the import map of §3 in a `<script type="importmap">`;
2. contain the mount element (default `#root`), holding the first frame of
   the document's page when the producer paints one, followed by the
   first-paint data and script (§2.5);
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
  `blocks/manifest.json`, `engines/manifest.json`;
- what the **opened page** needs, and nothing of any other page's. Read at
  build from each page's receipt, assembled into the layout: its receipt, the
  layout's, and every block module the assembled page
  places (both `<link rel="preload" as="fetch" crossorigin>` — the very
  request the runner and the block loader make, a plain CORS `fetch`, so the
  preload answers it and a module is downloaded once per load), and its
  first image (`<link rel="preload" as="image">`) — the first block whose
  props say `priority: true` and name a picture (`src`, `image`, `imageSrc`,
  `backgroundImage`), with `fetchpriority="high"`, else the `src` of the
  first `image` block loaded eagerly (`loading: "eager"`); only a literal
  app file or an `http(s)` address, never an expression or a `data:` URI. A
  lazy image (`loading` is `"lazy"` or unset) MUST NOT be preloaded: the
  browser fetches it only near the viewport, and a page that does not show
  it (a picture below the fold, a record page that finds no record) would
  download it for nothing. Asked for together, the page does not wait on
  the chain runner → receipt → one module per block type.

Which page is opened is known only in the browser. The shell carries the
hints of every route and of the not-found page in
`<script type="application/json" id="pw-page-hints">`
(`{ entry, routes, notFound?, pages: { <key>: { receipt, modules, image?, imagePriority? } } }`),
and an inline script in `<head>` right after it — constant text, allowed by
its hash — adds the links of the page the address names: the entry for no
key, the not-found page for a key that is not a route. It MUST look up only
its own keys (`#/constructor` names no page) and MUST NOT let a hint stop the
app from starting. `page` names the page whose first frame the document
holds; that page's frame file (§2.5) is not asked for again. A shell MUST NOT preload one page's receipt, modules or
image on another: a visitor who opens `#/quickstart` is not sent the entry
page's. The same script names the page it found on the document element,
`<html data-pw-page="<key>">`, before the first paint; the runner names each
page it draws there after it ([envelope §4](envelope.md#4-per-page)).

The **theme stylesheet SHOULD be inline** (`<style>` in `<head>`): it is the
one stylesheet the first paint needs, and a `<link>` to it is a render-blocking
round trip. The file stays in the folder for hosts that link it. It carries
the app's palette on `:root` and `[data-pw-surface]`, then the palette of each
page that wears an appearance of its own
([appearance §1.1](appearance.md#11-a-pages-own-appearance)) on
`:root[data-pw-page="<key>"]` — light, and dark per that page's mode policy
(`:root[data-pw-page="<key>"][data-pw-theme="dark"]`, and
`:root[data-pw-page="<key>"]:not([data-pw-theme="light"])` under
`prefers-color-scheme: dark`) — so the document's ground is the page's own
from the first paint, never the app's first. The page's frame (§2.5) is
painted from its served receipt, in its own appearance.

The import map has to be inline: browsers do not load an import map from a
file. The page-hints script (above) and the first-paint script (§2.5) are
inline because they must run before the first paint. Every other script
SHOULD be a file, so the policy of §2.1 needs no hash but those three. The
reference shell:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' blob: 'sha256-…'; …" />
<title>Café</title>
<meta name="description" content="Our menu, by category, with each dish's diet and price." />
<style>:root{--pw-color-primary:#7c2d12;…}</style>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap" />
<script type="importmap">{ "imports": { "react": "./shims/react.mjs", "…": "…" } }</script>
<link rel="modulepreload" href="./assets/runner.9094f562.js" />
<script async src="./assets/embed.4f99b147.js"></script>
<link rel="modulepreload" href="./shims/react.mjs" />
<link rel="preload" as="fetch" href="./pwpack/project.json" crossorigin />
<script type="application/json" id="pw-page-hints">{"entry":"menu","page":"menu","routes":["menu","dish","visit"],"pages":{"menu":{"receipt":"pwpack/surfaces/menu.receipt.json","modules":["blocks/heading.b54aa22d.mjs"],"image":"./pwpack/media/hero.webp","imagePriority":true},…}}</script>
<script>(function () { /* §2: the opened page's hints */ })()</script>
<style id="pw-static-layout">@media (min-width:1024px){…}</style>
<div id="root"><div id="pw-root" data-pw-static="menu">…the menu's first frame…</div></div>
<script type="application/json" id="pw-first-paint">{"entry":"menu","routes":["menu","dish","visit"],…}</script>
<script>(function () { /* §2.5 */ })()</script>
<script type="module" src="./assets/boot.7838adfe.js"></script>
```

```js
// assets/boot.7838adfe.js
import { runApp } from './runner.9094f562.js'
runApp({ source: './pwpack', blocks: './blocks/', renderer: './assets/embed.4f99b147.js', router: 'hash' })
```

A document's head describes its page (§2.4). Its `<html lang>` is the app's
`locale` (envelope §2). A producer MUST NOT make up a title or a locale: an
app that states no title and a page that states none have an empty `<title>`,
and an app that states no locale has no `lang`.
The runner's own words come from `project.json` `messages` (envelope §2.1),
not from a `runApp` option.

`runApp` options:

| Option | Default | Meaning |
|---|---|---|
| `source` | `./pwpack` | Folder path or absolute URL of the envelope. |
| `blocks` | `./blocks/` | Folder holding `manifest.json` for block modules. |
| `engines` | `./engines` | Folder holding `manifest.json` for engines. |
| `renderer` | `./assets/embed.js` | Address of the renderer, relative to the document. When the first page is drawn the runner uses `window.PWFabric` if it is defined (a host that loads the renderer its own way keeps its own), else waits for a `<script>` the page has with that address, else adds one. |
| `router` | `hash` | `hash`, `path`, or `auto` (= `path` only when `history.pushState` works **and** the page declares `<meta name="pw-router" content="path">`). |
| `mount` | `#root` | Mount element selector. |

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
| `script-src` | `'self' blob:`, the import map's `'sha256-…'` and, with a static first paint, the first-paint script's; plus placed blocks' `script` origins and the app's scripts' origins | Runtime files are on the app's origin; block and engine modules are verified (§5) and imported from `blob:` URLs; the import map and the first-paint script (§2.5) are the inline scripts. A block that loads a library from another origin declares it ([block-manifest, `origins`](block-manifest.md#origins)). The app's scripts ([envelope §2.2](envelope.md#22-scripts-and-consent)): each one's `origins.script`, which lists its `src`'s origin. |
| `style-src` | `'self' 'unsafe-inline'`, plus the webfont stylesheet's origin and placed blocks' `style` origins | The renderer draws `<style>` elements at run time (per-page base, visibility, state, responsive and dark-theme rules) and blocks set `style` attributes; neither can be hashed ahead of time. |
| `img-src`, `media-src` | `'self' data: blob:`, plus media origins, placed blocks' `img` / `media` origins and the app's scripts' `origins.img` (`img-src` only) | Media origins: `publish.json` `media[]` and absolute URLs in receipt props other than links (`href`, `…Href`, `link`, `url`, `to`). |
| `frame-src` | media origins and placed blocks' `frame` origins, and `'self'` when a page frames a document of the app's own media, when there are any | Embeds name their address in a prop; a block that builds its embed address declares the origin. A page frames its own media when a block prop other than a link holds `pwpack/media/<file>` ending in `.pdf` or `.txt` (`./` or `/` before it names the same file); an image, a sound or a video is not framed, and neither is the app's own `.html` / `.htm` — same-origin HTML in a frame runs as the app, so it never opens `frame-src 'self'`. |
| `font-src` | `'self'`, plus the webfont files' origin and placed blocks' `font` origins | The allow-listed webfonts the theme names. |
| `connect-src` | `'self'`, plus every origin the app's data and sign-in reach | Absolute `rest` endpoints in receipts; declared engines' `host` resolved with the connection's `config` ([connector-manifest §3.1](connector-manifest.md#31-templates)); the addresses of the envelope `auth.json` and an external issuer; placed blocks' `connect` origins; the app's scripts' `origins.connect`. |
| `base-uri` | `'self'` | A host injects `<base href>` for path routing (§2); `'none'` would make the browser ignore it. |
| `object-src` | `'none'` | |
| `frame-ancestors` | `'none'`; `'self'` on the app's own media | Header only. A host that frames the app replaces it. |

**The app's own media** (`pwpack/media/*`) is served with the same policy,
`frame-ancestors 'self'` in place of `'none'`: a page of the app may frame
its own document (a PDF shown in place), and no other origin may. `_headers`
says so with a rule of its own for `/pwpack/media/*` that first takes back the
page policy (`! Content-Security-Policy`), so a host sends one policy per
path; a host that serves `csp.policy` MUST make the same substitution on those
paths. Under `'none'` there, an app's own embed was a blank box.

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
| `/`, `/index.html`, and under path routing each `/<key>/`, `/<key>/index.html` and `/404.html` | `no-cache` | A document names this publish's files. |
| `/assets/*`, `/blocks/*.mjs`, `/engines/*.mjs` | `public, max-age=31536000, immutable` | Content-hashed names (§1). |
| `/blocks/manifest.json`, `/engines/manifest.json`, `/shims/*`, `/pwpack/*` | `no-cache` | Fixed names whose content changes with a publish. |
| `/pwpack/media/*` | `public, max-age=3600` (after `! Cache-Control`) | Media keeps its name across publishes. |

A host that answers a page path with the shell (an SPA fallback) SHOULD send
the shell's `no-cache` with it. A development server MAY send
`no-cache` for everything.

### 2.3 Webfonts

The theme's allow-listed webfonts ([appearance](appearance.md)) — of the
app's theme and of every page's own, in one stylesheet (a browser downloads a
face only when a page draws text in it) — are loaded so that they never hold
the first paint and never move the text:

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
  (`Nunito, "Nunito Fallback", ui-sans-serif, …`) in `pwpack/appearance.json`,
  in a served receipt's own `appearance`, and the stylesheet. Until the
  webfont arrives the page draws the stand-in, which takes the same room.

### 2.4 Search engines

**A document's head.** Each document (§1.1) says, in its `<head>`, what its
page is — the same values the runner keeps on every page it draws
([envelope §4](envelope.md#4-per-page)):

- `<title>`: the page's title composed with the app's `title` or
  `titleTemplate` ([receipt §1.1](receipt.md#11-the-document-title)); a page
  title that carries an expression is the app's title alone (its value is
  known only in the browser);
- `<meta name="description">`: the page's `description`, else the app's
  (envelope §2); a description that carries an expression is the app's;
  neither, no element;
- `<link rel="canonical">`, when the app declares its public `origin`
  (envelope §2): the origin with the page's address — `<base><key>/`, the
  base for the entry page — under path routing, the base under hash routing.
  `404.html` has none;
- Open Graph, for a link preview: `og:type` `website`, `og:title` (the
  document's title), `og:description` (the description, when there is one),
  `og:url` (the canonical address, when there is one), `og:image` (the app's
  `image` as an absolute address: an `http(s)` address as declared, the
  app's own file on its origin; none otherwise);
- `404.html` carries `<meta name="robots" content="noindex">`.

An app that requires sign-in (`identity.required`) says nothing of a page's
own to a visitor who has not signed in: every document carries the app's
title and description, and none carries a first frame.

**`robots.txt`** allows every path (`User-agent: *` / `Allow: /`) and, when
the folder carries a sitemap, names it (`Sitemap: <origin><base>sitemap.xml`).
A host that serves an app privately answers with its own. A crawler reads
`robots.txt` at the host's root only: an app served under a sub-path is
named there by its host.

**`sitemap.xml`** ([sitemaps.org](https://www.sitemaps.org/protocol.html)),
when the app declares its `origin` and does not require sign-in: one `<url>`
per document's canonical address — every route under path routing, the base
under hash routing — except a record page (a page with a
`notFoundWhenEmpty` source, [data-protocol §2](data-protocol.md#2-data-sources)),
which names no page without its record.

#### 2.4.1 `llms.txt` and `llms-full.txt`

A path-routed build (`path`, `auto`) of an app that declares its `origin` and
does not require sign-in MAY carry two files for a language model, after the
[llms.txt](https://llmstxt.org) proposal; a producer that writes one SHOULD
write both. They list the same pages as `sitemap.xml`, in the app's
**navigation order**: the entry page first, then each page
`navigation.json` links to (`surfaceKey`, or a root-relative `href`), in
document order, then every other page in `surfaceOrder` order. A page's
**title** is its receipt `title` when that is text with no expression, else
the app's title (the page key when the app has none); its **address** is
its canonical address. Both files are
UTF-8 text, served as `text/plain; charset=utf-8`; `robots.txt` says nothing
of them.

`llms.txt`:

```text
# <app title>

> <app description>

## Pages

- [<page title>](<page address>): <page description>
```

`> …` is written only for an app with a `description`; `: <page description>`
only for a page whose own `description` is text with no expression. The
app's title, when it states none, is its `id`.

`llms-full.txt` starts with the same title and description, then, for each
page:

```text
## <page title>

Source: <page address>

<the page's words>
```

The page's words are its first frame (§2.5) — exactly what its document
shows a reader without scripts, never a template and never data the build
does not have — written as text: a heading as `#` repeated by its level and
its text; a paragraph or any other block of text as its text, its spaces
collapsed; a list item as `- <text>`; a table row as `| <cell> | <cell> |`;
a link as `[<text>](<absolute address>)` (resolved against the app's base on
its origin, a fragment against the page's address); blocks separated by an
empty line. Scripts, styles, media, form controls, and an element the frame
hides (`hidden`, `aria-hidden="true"`, `display: none`, `visibility: hidden`)
are not read. A page that is not painted has its heading and `Source:` only.

A **band** is a top-level block of a page: a block wrapper
(`data-block-wrapper`) inside no other. In a page assembled into a layout
([receipt §4](receipt.md#4-the-layout)), the bands are the layout's blocks that
hold no part of the page, and the page's own top-level blocks. A band whose words are the same on
every listed page — a navbar, a footer, a language switch — is written once,
after the pages, under `## Site navigation`, and not in any page.

### 2.5 Static first paint

A producer SHOULD render each page's **first frame** to HTML at build, so the
visitor sees the page before any script has run, and the runner then
**hydrates** that HTML — it adopts the same nodes instead of drawing the page
again.

**The first frame** is what the renderer draws before anything has arrived.
It is the same for every visitor:

- the receipt's own content, and the rows of its `static` sources;
- every fetched source **loading** — nothing is fetched at build, and
  build-time data never reaches a visitor's HTML; an expression over a
  loading source renders as it does while loading;
- every source the runtime settles **without a request**, settled: an
  **idle** source ([data-protocol §1.1](data-protocol.md#11-page-state): an
  empty record key asks for no record) is idle, not loading. The runtime
  decides it the same way in the browser's first render, so a page that
  shows "no order to confirm" is painted so, not as a spinner hydration
  redraws. A `requiresSession` source
  ([data-protocol §2.6](data-protocol.md#26-sources-that-need-a-session)) is
  **loading**: who the visitor is is not known to the build (`__auth.pending`),
  and the session the runner knows settles it right after hydration — a
  signed-in visitor never sees the signed-out state first. One
  exception: the page's record (`notFoundWhenEmpty`) idle is drawn
  **loading** — that page is never shown without its record (the not-found
  page replaces it), and loading is its frame for every record the address
  names;
- nobody signed in yet: `__auth` signed out with no `error` and `pending`
  true (for an app with a way in), the account control
  signed out ([session-protocol](session-protocol.md)) — with the ways in the
  app **declares** (`project.json` `identity`: `methods` with `password`
  first, `registration`; an `external` topology is `issuer`), never the
  deployment's `auth.json`, which a build does not have and a host
  replaces. The account control is drawn when the identity names a way in;
  a deployment that has none after all (`identity.door: false`) drops it in
  the update after hydration, like any other way the visit differs;
- nothing read from the address: the page's `initialState` as written;
- the phone layout, breakpoint `xs` (mobile first) — laid out at every wider
  breakpoint by the frame's stylesheet (below);
- the app's `locale`, or `en` when it names none — never the build machine's.

It is rendered from the envelope files **as the folder serves them** (media
filled, a source's `fields`), the page assembled into the app's layout
([receipt §4](receipt.md#4-the-layout)), with the blocks, hrefs, navbar, footer and
account control the runner assembles, and the render options that change
markup (appearance, `loadingStrategy: immediate`, locale, messages). A
producer and a runner MUST build these from the same rules; the reference
does it with one function (`@pwfabric/runner` `pageSurfaceOf`).

**Which pages.** Every route and the app's not-found page (`app.notFound`).
Not painted:

- any page of an app that **requires sign-in** (`identity.required`): who is
  signed in decides its first frame;
- the app's sign-in page (`app.signIn`), which is drawn on demand.

A **record page** — one with a source marked `notFoundWhenEmpty`
([data-protocol](data-protocol.md)) — is painted like any page: its first
frame is the shell and the page's loading frame, the same whichever record
the address names (`?id=` seeds a source that is still loading). The runner
hydrates it, and when the record is missing replaces it with the not-found
page.

**At every width.** The first frame is drawn at the phone breakpoint, and
that markup is what ships and what the browser hydrates. The renderer lays a
page out per breakpoint (a block's column span, a row that stacks on a
phone, the measure's columns), so the producer also draws the page at each
wider breakpoint and writes what differs as CSS: for every node whose inline
style there is not the phone frame's, a rule for that breakpoint's widths
(`@media (min-width:…) and (max-width:…)`, the widest open-ended), scoped to
the node (`#pw-root` and a selector from the node's block wrapper
`data-block-wrapper`, or a unique `id`, else from the root, by
`:nth-child`), giving each declaration that differs its wider value with
`!important` (so it wins over the inline style), and a declaration the wider
render does not make `revert`. This is the frame's stylesheet,
`<style id="pw-static-layout">` in the document's `<head>`; with it the
frame is the page at the visitor's width, with or without scripts.

What CSS cannot say stays in its phone form until the renderer runs: a
block whose **markup** (not only its layout) differs on a wider window — a
navbar drawn as a menu button on a phone and a row of links on a desktop.
The producer SHOULD name each such block (the reference:
`STATIC_PAINT_WIDTH`). A block SHOULD lay itself out for the width in CSS
(media or container queries) rather than in its markup, so that its first
frame is right at every width.

**Where it goes.**

- The document's own page: `<div id="pw-root" data-pw-static="<key>">…</div>`
  as the content of the mount element — visible markup, read as it is by a
  reader without scripts and by a crawler — and its stylesheet in `<head>`.
  Under hash routing the document is the entry page's; under path routing
  every page's document holds its own (§1.1), and `404.html` the not-found
  page's.
- Every painted page: `pwpack/surfaces/<key>.html` — its stylesheet, then its
  `#pw-root` element — for a document that holds another page's frame (a
  hash address, a host's SPA fallback). Cached like the rest of `pwpack/`
  (§2.2).
- `<script type="application/json" id="pw-first-paint">`, after the mount
  element: `{ router?, entry, routes, notFound?, pages: { <key>: { keys, file } } }`
  — the same in every document of the app. `keys` are the query keys that
  **change the page's first frame**: of the keys that seed its state (the
  keys it reads as `state.<key>` or declares in `urlState`, minus the
  reserved ones; envelope §4), those whose value, seeded, renders a
  different frame (the reference renders the page again with a probe value
  for each); `file` is the page's `.html`.
- Right after it, one inline script — constant text, allowed by its hash
  (§2.1) — run before the first paint. The frame the document holds stands
  only when it is this visit's: the address names its page and its query
  carries none of that page's `keys`. Otherwise the script removes the frame
  and its stylesheet, then:
  - another painted page, or a page the app does not have while its not-found
    page is painted, with none of its `keys` in the query: that page's `file`
    is fetched and put in place (its stylesheet into `<head>`) when it
    arrives, unless the runner has drawn into the root by then;
  - otherwise nothing; the runner draws the page as without a static paint.

**Hydration.** The runner hydrates the first page it draws when the mount
element holds `#pw-root` naming that page, at whatever width the window is;
whether the address lets the frame stand is the first-paint script's
decision. The hydrating render MUST be given exactly the first frame's
inputs above — the phone breakpoint, no address: a query key that does not
change the frame (a record page's `?id=`) arrives in the update after it.
What the visit differs in — a visitor who is signed in, a wider window,
cached rows, the visitor's own formats when the app names no locale — the
runner applies **after the hydrating commit**, as an update of the same tree
(an update before it makes the renderer drop the HTML and draw again). Once
that update is on screen the inline styles say what the frame's stylesheet
said, and the runner removes the stylesheet; it removes it too when it draws
a page instead of hydrating one. Data is fetched after hydration, as it is
on every page.

If the HTML does not match the first render, the renderer recovers by
drawing again the part that differs, and reports it to the developer console.
Each block sits in its own boundary, so a mismatch redraws that block, not
the page.

Hydration MUST adopt every painted node: neither the hydrating render nor
the update after it draws a painted node again when its markup did not
change. React 19 writes raw HTML (`dangerouslySetInnerHTML`: prose, inline
SVG icons) again whenever its `{ __html }` is a new object, so the React a
block imports (§3) keeps one object per markup string — a block that builds
the object in render, as blocks do, keeps its nodes. The reference checks
every painted page of an app in a browser at a phone and a desktop width
(`pnpm check:hydration <app>… [--router path]`): no recoverable hydration
error, no painted node drawn again while its data is still loading (but a
block named as drawing different markup on a wider window, at a wider
window), and no frame stylesheet left after the update.

**Blocks.** A block's render MUST be pure: the same output wherever it runs.
Browser APIs (`window`, `document`, `navigator`, `matchMedia`, storage, layout
measurement) belong in effects and event handlers, never in render, in a
`useState` initializer or in a helper called from render; "now" (`new Date()`,
`Date.now()`) and random values likewise. A block reads the app's locale from
its context (`context.locale`), never from `<html lang>`. A block that
measures itself in a layout effect and changes its layout from the result
moves the page right after the static paint; its first frame SHOULD NOT
depend on its measured size. A block whose render throws at build is left
empty in the HTML and drawn by the browser when it hydrates; the producer
reports it.

The HTML carries no script and no event-handler attribute. Its `<style>`
elements and `style` attributes are those the renderer draws at run time,
which `style-src 'unsafe-inline'` already allows (§2.1).

### 2.6 The app's headers and redirects

An app MAY declare response headers and redirects of its own in
`app/plan.json` `headers` and `redirects` ([plan §1](plan.md#1-members)). A
producer writes them for a static host and records them in `publish.json`
(§4), for a host that does not read the static-host files.

**Headers.** Each rule `{ path, headers }` is written into `_headers` after
every rule of the engine's own (§2.1, §2.2), in the order declared: the
`path` line, then one indented `<name>: <value>` line per header. `path` is
root-relative to the app, as a link is ([receipt §2.1](receipt.md#21-links));
`*` matches any run of characters (`/*` is every path, `/docs/*` every path
under `/docs/`). A host applies every rule that matches a path and adds each
header the rule sets.

An app's rule adds headers; it never takes back or replaces the engine's:

- `Content-Security-Policy` is the engine's (§2.1). A rule MUST NOT set it,
  in any letter case; the schemas refuse one that does. The policy an app
  runs under is computed from what it declares, so an origin it needs is
  declared where the policy reads it (a block's `origins`, a script of the
  plan's `scripts`), never written as a header.
- A header name is an HTTP token (RFC 9110 `tchar`), without `!`: the
  static-host form that takes a header back (`! Cache-Control`) cannot be
  written. A value is visible ASCII, space and tab only — no control
  character (`U+0000`–`U+001F`, `U+007F`, `U+0080`–`U+009F`), no line or
  paragraph separator (`U+2028`, `U+2029`), no other non-ASCII character —
  so a value can never end a line of `_headers` or a header of a response.
  A path, a redirect's `from` and `to`, and a script's `src` are visible
  ASCII with no whitespace. The schemas refuse anything else, and a
  producer MUST validate the same rules again when it writes `_headers`,
  `_redirects` and `publish.json`, whatever produced the plan: a schema
  check by an editor is not the boundary.
- A header the engine sets on a path (`Cache-Control` on the runtime files)
  is sent once, the engine's: a producer MUST refuse an app rule that sets
  a header an engine rule sets on a path both rules match. A rule for paths
  the engine sets nothing on — the app's own files (§1), `Permissions-Policy`,
  `Referrer-Policy`, `X-Robots-Tag` — is written as declared.

**Redirects.** Each `{ from, to, status }` is a line of `_redirects` at the
folder root, `<from> <to> <status>`, in the order declared; a host answers
the first that matches. `from` is a root-relative path; a trailing `*`
matches the rest of the path, and `:splat` in `to` stands for what it
matched (`/old-blog/* /blog/:splat 301`). `to` is a root-relative path or an
absolute `http(s)` URL. `status` is `301` (the default), `302`, `307` or
`308`. Paths are written root-relative to the app; for an app served under a
sub-path the producer writes them under that path.

A producer MUST refuse a redirect whose `from` is an address the app serves
— a page's document (§1.1), a file of §1 — and one whose `to` is its own
`from`: a static host answers a file before a redirect, so the rule would
never apply, or would loop. Under hash routing a page's address is a
fragment, which never reaches the host, so a redirect from an old
path-routed address (`/menu/`) to the page (`/#/menu`) is how such an app
keeps its links.

## 3. The import map and shared modules

Block and engine modules are compiled with a fixed set of bare specifiers left
unresolved. The host supplies each through the import map, pointing at a shim
module that re-exports a global the host seeded from its own copy — so every
block shares one React and one runtime event bus.

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

`zod` is **not** a shared module: a block's props are declared in its manifest
and applied by the renderer without a validation library
([block-manifest, applying props](block-manifest.md#applying-props)), and a
visitor's page carries no zod. A block module that imports it fails rule 4.

Rules:

1. The import map MUST map every specifier in the table. An unmapped
   specifier fails the whole module that imports it at link time.
2. A standalone app's renderer MUST seed every global in the table before
   the first block module is imported; the shell needs no script of its own
   for it. A global nothing seeds still resolves (the shim exists) but its
   exports are `undefined`; a block that needs it degrades.
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
| `headers`, `redirects` | The app's own header rules and redirects, from `app/plan.json` (§2.6). A host that does not read `_headers` / `_redirects` applies them, after its own and the engine's. |
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

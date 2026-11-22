---
status: stable
formatVersion: "1.0"
---

# The envelope

The **envelope** is an app as a runner reads it: plain JSON files fetched at
load time from a folder path or an absolute URL — never compiled in. It is what
a host serves under `pwpack/` in a published app (see
[pwapp-format](pwapp-format.md)), and what a self-hosted app is made of. This
document specifies which files a runner reads, `project.json`, how routes and
links work, what a runner does to each page before handing it to the
renderer, and the two module manifests.

Schemas: [`envelope`](schemas/envelope.schema.json) (`project.json`),
[`envelope.auth`](schemas/envelope.auth.schema.json),
[`envelope.blocks-manifest`](schemas/envelope.blocks-manifest.schema.json),
[`envelope.engines-manifest`](schemas/envelope.engines-manifest.schema.json) —
all hand-written; the engine types these documents but has no reference schema
for them. `navigation.json`, `appearance.json` and `connections.json` use the
[definitions](definitions.md) schemas.

## 1. Files

Relative to the envelope location `source`:

| File | Required | Specified in |
|---|---|---|
| `project.json` | yes | §2 |
| `surfaces/<key>.receipt.json` (or as mapped by `surfaceReceiptFiles`) | one per page | [receipt](receipt.md) |
| `layout.receipt.json` (or as named by `layoutReceiptFile`) | no — only when `project.json` names it | [receipt §4](receipt.md#4-the-layout) |
| `navigation.json` | no | [definitions](definitions.md#navigationjson) |
| `appearance.json` | no | [definitions](definitions.md#appearancejson) |
| `connections.json` | no | [definitions](definitions.md#connectionsjson) |
| `messages/<lang>.json` | one per locale, with `locales` | §2.3 |
| `messages/<lang>/<key>.json` | per page and locale, as `pageMessages` names them | §2.3 |
| `surfaces/<key>.<lang>.receipt.json` (or as mapped by `localeReceiptFiles`) | per page and locale, when the page has one | §2.3 |
| `auth.json` | no — present only when the app has a way in | [session-protocol](session-protocol.md#2-authjson) |
| `media/<file>` | no | media copied into the app |

Relative to the app folder — the served folder that holds `blocks/` and `engines/`
([pwapp-format §1](pwapp-format.md#1-the-served-folder)); in the standard layout the
shell is served from it too:

| File | Required | Specified in |
|---|---|---|
| `blocks/manifest.json` | yes | §5 |
| `engines/manifest.json` | no | §6 |

A runner MUST fetch `project.json` and `blocks/manifest.json` and fail if
either is missing. Each optional file that is absent or unreadable MUST be
treated as not declared, never as an error. Paths in the envelope are relative
and base-independent: an envelope MUST NOT contain a host's own publishing
paths.

## 2. `project.json`

```json
{
  "schemaVersion": "1.0.0",
  "id": "example-analytics",
  "title": "Example Analytics",
  "entrySurfaceId": "home",
  "surfaceOrder": ["home", "people"],
  "surfaceReceiptFiles": { "home": "surfaces/home.receipt.json", "people": "surfaces/people.receipt.json" },
  "identity": { "required": false, "topology": "app", "methods": [] }
}
```

| Member | Type | Required | Meaning |
|---|---|---|---|
| `entrySurfaceId` | string | yes | Page key of the entry page. Despite the name it is a page **key** (`home`), not a storage id. |
| `surfaceOrder` | string[] (≥ 1) | yes | Every page key, in order. This is the route table. A key may be nested (`docs/intro`, [pwpack-format §2.5](pwpack-format.md#25-page-keys)). |
| `surfaceReceiptFiles` | `{ key: path }` | no | Page key → receipt path relative to `source`. Absent: `surfaces/<key>.receipt.json` for every key, a nested key in its folder (`surfaces/docs/intro.receipt.json`). |
| `layoutReceiptFile` | string | no | The app's layout ([receipt §4](receipt.md#4-the-layout)), relative to `source`: producers write `layout.receipt.json`. Absent, the app has no layout and a runner MUST NOT ask for one. |
| `notFoundSurfaceId` | string | no | Key of the app's own not-found page (§3). Its receipt is in `surfaceReceiptFiles`; it is not in `surfaceOrder`, because it is not a route. |
| `signInSurfaceId` | string | no | Key of the app's own sign-in screen ([session-protocol §5](session-protocol.md#5-the-gate)). Its receipt is in `surfaceReceiptFiles`; it is not in `surfaceOrder`. |
| `id` | string | no | The app's id; keys per-app browser storage (§4). |
| `title` | string | no | The app's name, from `app/plan.json` `title`: the document title of a page without one, and composed with every page's title ([receipt §1.1](receipt.md#11-the-document-title)). A producer MUST NOT make one up (from the pack id, say); absent, the document has no title of the app's. |
| `titleTemplate` | string | no | How a page's title becomes the document title — from `app/plan.json` `titleTemplate`: exactly one `%s`, replaced by the page's title, and `%%` for a `%` (`"%s · Example Analytics"`). Composition: [receipt §1](receipt.md#1-document). |
| `description` | string | no | The app in a sentence, for a search result or a link preview: the document's `<meta name="description">` on every page that states none of its own (§4). |
| `origin` | string | no | The app's public origin, `scheme://host[:port]` with no path (`https://example.com`) — from `app/plan.json` `origin`. A page's canonical address is this origin with the page's address (§4); absent, the app names none. |
| `image` | string | no | The picture a link preview shows for the app (`og:image`) — from `app/plan.json` `image`: an absolute `http(s)` address, or the app's own file, `pwpack/media/<file>`. |
| `locale` | string | no | The app's locale, a BCP 47 tag (`en-GB`) — from `app/plan.json` `locale`. Dates and numbers on its pages are written in it ([expressions §6](expressions.md#6-helpers)); absent, in the visitor's. The shell's `<html lang>` is this tag; absent, a producer writes no `lang` rather than guessing one. |
| `messages` | `{ id: string }` | no | The app's words (§2.1), from `app/plan.json` `messages`. Not written with `locales`: the words are then per locale (§2.3). |
| `locales`, `defaultLocale` | string[], string | no | The app's languages and the one at its root (§2.3), from `app/plan.json`. Absent: one language, `locale`. |
| `addresses` | `{ <lang>: { <key>: address } }` | with `locales` | The address table (§2.3). |
| `localeReceiptFiles` | `{ <lang>: { <key>: path } }` | no | The per-locale receipts the app has (§2.3), relative to `source`. |
| `pageMessages`, `pageMessagesDynamic` | `{ <lang>: { <key>: path } }`, string[] | no | Each page's own words per locale, and the pages that also need the full catalogues (§2.3). |
| `scripts` | `{ key, src, integrity?, origins?, consent }[]` | no | Third-party scripts the runner loads once the visitor consents to their category (§2.2), from `app/plan.json` `scripts`. |
| `publicFiles` | string[] | no | The app's public files as served, each a path from the app folder with no leading `/` (`favicon.ico`, `docs/guide.pdf`) — what the producer copied from `public/` ([pwpack-format §1.4](pwpack-format.md#14-public-files)). A link to one is a file link, not a page (§3). |
| `schemaVersion` | string or number | no | Producers write `"1.0.0"`. A runner MUST NOT branch on it. |
| `identity` | `{ required, topology?, methods?, registration?, door? }` | no | Who may see the pages, frozen at publish: `required` gates rendering; `topology` is `app` or `external`; `methods` lists the app door's ways in; `registration` (`open`, `invite`, `closed`) is who may make an account, as declared — with `methods`, what the static first paint draws the account control from ([pwapp-format §2.5](pwapp-format.md#25-static-first-paint)), since a build has no `auth.json`; `door: false` says the envelope has no `auth.json` (no way in — a build no host serves), so a runner MUST NOT ask for it. Absent `door`: the app has one. |

Members a runner does not read MUST be ignored (producers write, for example,
the hosting platform's own ids).

### 2.1 Messages

**The engine gives states and actions; the app writes every word.** The words
the runner draws around the app's content — its sign-in screen, the session
pill, the account control's labels, its not-found page, a refused sign-in —
and the words a block draws itself (the accessible name of a close button,
"Next page") are the app's, in its `locale`.

`messages` is a flat object from a **message id** to a string. A producer
copies it unchanged from `app/plan.json` `messages`
([plan §1](plan.md#1-members)). For every word, a runner and a renderer MUST
use the app's message for the id, when it is a non-empty string.

**The engine writes no visitor word.** A runner and a renderer keep no
fallback text: a message the app does not set is drawn as nothing. Where that
would leave a control without an accessible name — a button, a link, a form
field, a landmark, a dialog's heading — the control is named by the message
id itself, never by an invented sentence. A development server SHOULD name
each missing id in the console, once; a published app's console stays quiet.
A block's own word is the block's: a block MAY pass a fallback of its own
when it reads an id ([block-manifest](block-manifest.md#words-a-block-draws)).
A runner MUST NOT show a sentence from a server in place of a message (a sign-in
refusal reads `session.refused`, with the server's code in `{code}`), and MUST
NOT rewrite text the app wrote (a greeting is the app's, written with
`{{me.name}}`).

**Placeholders.** `{name}`, `{code}` and `{n}` in a message are replaced by
the visitor's name, a code, and a number where the id says so. A placeholder
with no value is written as nothing; anything else in braces is text, except
a plural.

**Plurals.** A message MAY choose its words by a number with the ICU plural
form:

```text
{n, plural, =0 {Your basket is empty} one {# item in your basket} other {# items in your basket}}
```

`{<arg>, plural, <selector> {<text>} …}` names a placeholder that carries a
number (`n`, or a block's own placeholder) and one branch per selector. A
selector is `=<integer>` (the number exactly) or a plural category of the
Unicode CLDR — `zero`, `one`, `two`, `few`, `many`, `other` — and `other` is
REQUIRED; each selector appears once. A runner and a renderer pick the branch
of the first `=<integer>` equal to the number, else of the category the
number has under the plural rules of the **document language** — `project.json`
`locale`, the shell's `<html lang>`, else `en` (in a browser,
`new Intl.PluralRules(locale).select(n)`) — else `other`. In the chosen
branch, `#` is the number written in that language
(`Intl.NumberFormat(locale)`), and `{name}`-style placeholders are filled as
anywhere else. A value that is not a finite number selects `other` and is
written as given. Only `plural` is understood: `select`, `selectordinal` and
a plural inside a branch are not, and a validator reports them as errors,
with a plural that has no `other`, an unknown selector, a repeated one or an
unbalanced brace — a plural no runner can pick a branch of (the rules:
`scripts/app-rules.mjs`; the reference CLI: `MESSAGES_INVALID`). A runner that meets
such a message writes it as its text, braces and all, rather than guess.
A first frame (pwapp-format §2.5) picks plurals with the same rules and the
app's locale, so hydration draws the same words.

`messages` stays one flat map in the app's one language; the plural rules
are that language's.

**The runner's ids.**

| Id | Where it is drawn |
|---|---|
| `gate.title` | The runner's sign-in screen's heading when the app has no `title`. The `gate.*` ids are reachable only when the app has no sign-in screen of its own (`signInSurfaceId`). |
| `gate.body` | The line under the heading — on the wall of an app that requires sign-in only; the dialog a visitor opens on an optional-sign-in app says no such thing. |
| `gate.email`, `gate.password`, `gate.name` | The password form's fields. |
| `gate.signIn`, `gate.register` | The form's submit, signing in or registering. |
| `gate.toRegister`, `gate.toSignIn` | The switch between the two — drawn only when `auth.json` `registration` is `open`. |
| `gate.or` | Between the form and the provider buttons. |
| `gate.close` | The accessible name of the on-demand dialog's close button. |
| `gate.noProvider` | The disabled screen of an app that requires sign-in and has no way in. |
| `gate.provider.<method>` | A provider button: `password`, `phiwebs`, `microsoft`, `google`, `github`. Another method is named as itself. |
| `pill.region`, `pill.signedIn`, `pill.signIn`, `pill.signOut` | The fallback session bar (`pill.region` names its landmark) — drawn only when the app has no account control and no sign-in screen. |
| `account.signIn`, `account.signOut`, `account.profile` | The labels handed to the app's account control ([session-protocol §6](session-protocol.md#6-identity-on-the-page)). |
| `account.greeting` | The account control's greeting, signed in; `{name}` is the visitor's name, else e-mail. |
| `notFound.title`, `notFound.body`, `notFound.home` | The runner's own not-found page (§3). |
| `session.unreachable`, `session.unexpected`, `session.failed`, `session.refused` | The password door: no answer, an unreadable answer, no session in the answer, a refusal (`{code}` is the server's code). |
| `bridge.exchangeFailed`, `bridge.invalidCallback`, `bridge.issuerUnreachable` | An external issuer's sign-in. |
| `auth.error.<code>` | A refused sign-in round trip (`?auth_error=<code>`, [session-protocol](session-protocol.md)): `access_denied`, `invalid_request`, `invalid_state`, `expired`, `provider_error`, `method_unavailable`, `server_error`. |
| `auth.error.unknown` | Any other code that is a plain identifier, in `{code}`. |
| `auth.error.generic` | A code that is not (it came off the address bar and is not echoed). |

**A block's ids** are namespaced `ui.*` and chosen by the block; they are read
through the renderer ([block-manifest, "Words a block draws"](block-manifest.md#words-a-block-draws)).
The renderer's own ids: `ui.retry`, the accessible name of the retry button
a block whose module failed to load is drawn as (any page can meet it), and
`ui.loading`, the line of the gate while a page's data first loads
(`loadingStrategy: "gate"` only; the reference runner paints at once and never
draws it).

A validator SHOULD report every id an app can reach from what it declares and
does not set, as an error: the visitor would read nothing there (the reference
CLI: `MESSAGES_MISSING`).

### 2.2 Scripts and consent

An app MAY load scripts it does not ship — a visit counter, a support chat —
by declaring them in `scripts`. Each entry:

| Member | Required | Meaning |
|---|---|---|
| `key` | yes | The script's name in the app (`visits`), lower-case words joined by `-`; unique among the app's scripts. |
| `src` | yes | The script's absolute `https` address on an exact origin: a lower-case host or a bracketed IPv6 address, an optional port, then the path — no userinfo, no wildcard. |
| `integrity` | no | Its Subresource Integrity (`sha384-<base64>`). With it the browser refuses bytes that differ; without it the script is trusted by its origin alone. |
| `origins` | no | The further origins it reaches, by directive: `script` (scripts it loads in turn — `src`'s own origin is allowed without being listed), `connect` and `img`. Exact origins, written and checked as a block's ([block-manifest, `origins`](block-manifest.md#origins)): never a wildcard. |
| `consent` | yes | The consent category it waits for (`analytics`, `support`): a lower-case name the app chooses. |

The format names no provider: a script is an address and the origins it
needs. The origin the URL parser gives `src` (`new URL(src).origin`) MUST
match the exact-origin form, so the policy allows exactly what was
validated; a producer checks it again when it computes the policy. What the
app's policy allows for it is
[pwapp-format §2.1](pwapp-format.md#21-content-security-policy): `src`'s
origin and `origins.script` in `script-src`, `origins.connect` in
`connect-src`, `origins.img` in `img-src`. A producer that finds an entry of
`app/plan.json` `scripts` that breaks these rules drops it and reports an
error (the reference CLI: `PLAN_SCRIPT_INVALID`). A script that needs an inline
script, `eval` or an origin it does not declare is refused by the browser,
as any other code of the page would be.

**Loaded only after consent.** A runner MUST NOT load a script before the
visitor has consented to its category, and loads it at most once per page
load: a `<script async src="…">` (with `integrity` and
`crossorigin="anonymous"` when the entry has an `integrity`) appended to the
document's `<head>`, never before the first page is drawn. A script is never
in the shell or in a page's first frame (pwapp-format §2.5). Nothing is
consented by default: the engine draws no banner and decides nothing on the
visitor's behalf; the app asks, with a block of its own, and signals the
answer.

**Signalling consent.** The runtime hands every block three members of its
context:

| Member | Meaning |
|---|---|
| `context.consentCategories` | The categories the app's `scripts` name, each once, in declaration order. |
| `context.consent` | The visitor's answers so far, `{ <category>: true \| false }`; a category not answered is absent. |
| `context.setConsent(answers)` | Records answers (`{ analytics: true, support: false }`), merged over the previous ones. A category that is not in `consentCategories` is ignored. |

The runner keeps the answers in `localStorage["pwapp_consent:<appId>"]`
(`appId` of §4) as a JSON object, so they hold on every page and on the next
visit, and reads them back when the app starts. Each time the answers
change, and once when the app starts with stored answers, the runtime
dispatches `pw:consent` on `window`, a `CustomEvent` whose `detail` is the
answers object, `{ <category>: true | false }` — every category answered so
far, a copy, not the stored value; a script already loaded MAY listen to it. A category that becomes
`true` loads every script that waits for it at once; one that becomes
`false` loads nothing more — a script already running is not stopped (the
browser cannot unload it), and on the next page load it is not loaded. Storage
that cannot be read or written is not an error: the answers then last for the
page load. `context.consent` is `{}` in the first frame and during the
hydrating render (the build knows no visitor, and hydration must draw what
the build drew), and no script is loaded before hydration; the stored answers arrive in the update
after hydration ([pwapp-format §2.5](pwapp-format.md#25-static-first-paint)).

### 2.3 Locales

An app MAY be written in several languages: `locales` lists them (BCP 47
tags, each once, at least one) and `defaultLocale`, one of them, is the
language at the app's root. An app without `locales` is a single-language
app in `locale`, exactly as §2 says, and nothing below applies to it.

**Addresses.** The default locale lives at the app's base; every other
locale under `<base><prefix>`, where the **prefix** is its tag in lower case
and a `/` (`de/`, `pt-br/`). A page's address in a locale is written by its
**segment path**: its receipt's `path` for that locale
(`"path": { "de": "preise" }`, [receipt §1](receipt.md#1-document)), else its
page key. Every producer derives the same **address table** and writes it as
`project.json` `addresses`; the router, the language switch, `hreflang`, the
sitemap and `llms.txt` read it, never a page's `path` directly:

| Page | Segment path in locale `L` | Address in `L` (from the base) |
|---|---|---|
| the entry page | — (it has no `path`) | `""` for the default locale, else `<prefix>` |
| any other page `K` | `path[L]`, else `K` | `<S>/` for the default locale, else `<prefix><S>/` |

```json
"addresses": {
  "en": { "home": "", "pricing": "pricing/", "docs/intro": "docs/intro/" },
  "de": { "home": "de/", "pricing": "de/preise/", "docs/intro": "de/docs/einfuehrung/" }
}
```

The table MUST hold every locale and, in each, every key of `surfaceOrder`.
The not-found and sign-in pages are not routes and have no address. Rules:

1. No two pages share an address in one locale.
2. A segment path set in `path` MUST NOT equal another page's key, nor
   another page's address in that locale (a link is written by page key and
   resolved per locale, so the two would name one address).
3. The locale prefixes are reserved first segments: no page key and no
   segment path starts with a declared locale's prefix, so `de/…` always
   names the German site. No two locales have the same prefix.
4. `path` names only declared locales; the entry page has none.
5. A page key MUST NOT end in `.<lang>` for a declared locale
   (`home.de`): that is the name of a per-locale receipt (below).

A validator reports a broken rule as an error (`APP_ADDRESS_CONFLICT`,
[pwpack-format §Codes](pwpack-format.md#codes)); `defaultLocale` outside
`locales`, two locales with one prefix, a flat `messages` beside `locales` or
a `locale` other than `defaultLocale` is `APP_LOCALES_INVALID`.

**Words.** With `locales`, an app's words are one catalogue per locale,
`app/messages/<lang>.json` — the flat map of §2.1, one per language
(schema: [`envelope.messages`](schemas/envelope.messages.schema.json)) —
served as `messages/<lang>.json`. It replaces `messages`: a runner reads every
message id of §2.1 from the words of the locale drawn, with the plural rules
of that locale.

**Each page's words.** A page does not need the whole catalogue. A producer
writes, per locale and page, `messages/<lang>/<key>.json`: the ids the page
reads by a literal `t('<id>')` — in that locale's receipt, assembled into the
layout — together with the runner's and the renderer's own ids (§2.1) and
every block id (`ui.*`), each the locale's word over the default locale's.
`project.json` `pageMessages` (`{ <lang>: { <key>: path } }`) names them, and
`pageMessagesDynamic` lists the keys of the pages that compute an id
(`t(state.word)`), which need the full catalogues. A runner fetches the
page's own file, once; for a page in `pageMessagesDynamic`, or a page
`pageMessages` does not name, it fetches the drawn locale's catalogue and
the default's as well. It fetches another locale's words only for the
suggestion below, only when the drawn locale sets `locale.suggestion`, and
only once the browser is idle. A block
reads a word by id as it does today (`useAppMessage`, [block-manifest](block-manifest.md#words-a-block-draws)),
and a receipt by `{{t('<id>')}}` ([expressions §6](expressions.md#6-helpers)).
An id the drawn locale's catalogue does not set falls back to the default
locale's; a validator warns about each such id (`MESSAGES_LOCALE_MISSING`),
it is not an error. An id neither sets is drawn as §2.1 says.

**Pages per locale.** A page is one receipt for every locale, its words read
from the catalogue. A page MAY carry a receipt of its own for one locale,
`app/surfaces/<key>.<lang>.receipt.json`, served as
`surfaces/<key>.<lang>.receipt.json` and listed in `localeReceiptFiles`: it
replaces the shared receipt, whole, for that locale only (its own `path` is
not read; addresses come from the shared receipt). The app's layout
([receipt §4](receipt.md#4-the-layout)) is one for every locale and reads
the catalogue.

**On the page.** The locale drawn is the one the address names (§3). The
runtime hands every block:

| Member | Meaning |
|---|---|
| `context.locale` | The locale drawn (with `locales`), else the app's `locale`. |
| `context.locales` | `locales`, in order (`[context.locale]` for a single-language app). |
| `context.alternates` | `{ <lang>: address }`: the current page's address in every locale, from the base, as a link to it is written (`<base>de/preise/`) — what a language switch draws. On the not-found page, each locale's entry page. |

`appHref` writes a link by page key (`/pricing`) as its address in the
locale drawn (`<base>de/preise/`, §3).

**The visitor's language.** A runner never redirects a visitor to another
locale on its own. It MAY offer one: when `navigator.languages` prefers a
declared locale other than the one drawn, the runner MAY show a suggestion
with a link to the current page in that locale, its words read from that
locale's catalogue — `locale.suggestion` (`{language}` is the language's
name in itself), `locale.switch`, `locale.dismiss`. These ids are optional: a
validator does not report them as missing (`MESSAGES_MISSING`), and a runner
whose catalogue lacks them shows no suggestion. The visitor's choice or
dismissal is kept in `localStorage["pwapp_locale:<appId>"]`
(`{ "locale": "<lang>" }` or `{ "dismissed": true }`), and a runner does not
suggest again once either is stored. The suggestion is a strip **fixed at
the bottom of the viewport**, appended to `<body>` after the page, so it
moves nothing the page has drawn (no layout shift). Its bottom padding
includes `env(safe-area-inset-bottom)`, so it clears a phone's home
indicator. It takes no focus: it is not focused when it appears, and the
page keeps the focus it had. While it is shown, the document element's
`scroll-padding-bottom` is the strip's height, so an element scrolled into
view (a focused field) stops above it; the property is removed with the
strip. It is drawn by script after hydration only, never in the first
frame, so a crawler and a visitor without scripts never see it.

**Under hash routing** an app with `locales` is still one document: there
is no document per locale, no `hreflang`, and a plain `sitemap.xml` (the
base only, [pwapp-format §2.4](pwapp-format.md#24-search-engines)). The
locale is in the route, and `context.alternates` are hash routes
(`#/de/preise/`). A multi-language app that is to be found per language is
built with path routing.

## 3. Routing and links

**Locales.** In an app with `locales` (§2.3) the first segment of the path
(under path routing) or of the route (`#/de/preise/`, under hash routing)
selects the locale when it is a declared non-default locale's prefix; any
other address is the default locale's. The rest is matched against that
locale's row of `addresses`. A root-relative link written by page key
(`/pricing`, `/docs/intro`) is rewritten into the address of that page in the
locale drawn; a link that is already an address of the table (`/de/preise/`,
written by a language switch) is kept as that address.

A page is a key in `surfaceOrder`. A nested key is one address, slashes and
all: `docs/intro` is `#/docs/intro` under hash routing and
`<base>docs/intro/` under path routing, and a root-relative link to it is
`/docs/intro`. The router matches the whole path to a key, never a prefix:
`#/docs/intro/more` names no page unless `docs/intro/more` is one. Routing is one rule in both modes: the
location names a key, or it names nothing and the runner renders its not-found
page. A runner MUST NOT fall back to the entry page for an unknown location.

**The not-found page.** When `project.json` declares `notFoundSurfaceId`, the
not-found page is that receipt, rendered at the address that named nothing
exactly as a page is (§4): inside the app's shell, with its navigation filled
and its account control placed, so the reader is still in the app. Only
without one, or when it cannot be fetched, does the runner draw its own page.

**A page whose record is not there.** A detail page names its record in its
address (`#/dish?id=9`). A data source that declares `notFoundWhenEmpty`
([data-protocol §2](data-protocol.md#2-data-sources)) is that record: when it
settles with no record — a 404, no row, or idle because the value it needs is
empty — the runtime tells the host, and the runner renders the not-found page
in place of the page, at the same address. Until the host replaces it, the
page keeps the frame it loaded in: the missing record is not drawn as an
empty page first, so the swap moves nothing on the screen. A refused read or a
server error is not "not found"; the page shows its error state.

- **Hash mode** (default; works on every static host): `#/<key>`. `#/` and no
  fragment mean the entry page. A fragment without the slash (`#section`) is an
  in-page anchor, not a route. A route may carry a query and an anchor, in that
  order: `#/product?id=12#reviews`.
- **Path mode**: `<base><key>/`, where `<base>` is the shell's `<base href>`,
  and the entry page is `<base>` itself — the folder of the page's own
  document ([pwapp-format §1.1](pwapp-format.md#11-documents)), which a
  static host serves as it is. A runner writes every page's address so;
  `<base><key>` without the slash names the same page.

A `navigate` action is followed **as a link to its `url` would be**: a runner
hands a same-origin `http(s)` address to its router, which treats it exactly as
a click on `<a href="url">` (in-page anchor, page route, not-found); another
origin is left to the browser.

**What the router handles.** Under hash routing the router handles every
address of the app's document: its fragment names the page, or names none
and the not-found page is drawn. Under path routing the router handles only
an address that is the app's: the base itself, or `<base><key>` /
`<base><key>/` for a key in `surfaceOrder`, with any query and fragment.
Every other same-origin path — a public file
([pwpack-format §1.4](pwpack-format.md#14-public-files)), the app's media,
another app or page on the same origin, a path under the base that names no
page — is **left to the browser**: the runner does not intercept the click,
and the browser loads the address. For a path under the base that names no
page the host answers with `404.html`, the not-found document
([pwapp-format §1.1](pwapp-format.md#11-documents)), so the visitor still
reads the app's not-found page. Following an in-page anchor
(`#section`, by a link, a block or a `navigate` action) MUST keep the page: the runner scrolls to the element with that id and
the address goes on naming the page, so a reload lands on it at the anchor.
**A fragment-only link resolves against the current page, never against the
base.** In hash mode the runner writes the anchor onto the current route,
query kept (`#/product?id=12` → `#/product?id=12#reviews`); in path mode it
stays on the current path and query (`<base>product/?id=12#reviews`),
although `<base href>` would resolve `#section` against the entry page. So
that the link is right without the router too — opened in a new tab, copied,
followed before the scripts run — the runner rewrites a fragment-only link
into the current page's address with that fragment (below), and the static
first paint writes it so, without the query the build does not know
(`<base>product/#reviews`, `#/product#reviews`). `#` alone names the top of
the page and is rewritten the same way. Such a jump SHOULD scroll
smoothly and MUST NOT animate when the reader prefers reduced motion.

Before rendering, a runner rewrites every link of the page — `href` and every
prop whose name ends in `Href`, a `navigate` action's `url` (in a block's
`action` or a behavior) and a form binding's `successRedirect` — from the root-relative form
of [receipt §2.1](receipt.md#21-links) into its router's form. An internal link
to an unknown key is still rewritten, so it lands on the not-found page: drawn
by the runner in hash mode, served as `404.html` by the host in path mode.
**An empty link stays empty.** A link member whose value is `""` is no link —
a button without a destination — and a runner MUST NOT rewrite it into a link
to the entry page; the entry is written `/`. `activeHref` (the page a nav
block calls current) is rewritten like a link, and an empty `activeHref`
likewise stays empty: it marks no item, so a not-found page that writes
`"activeHref": ""` leaves the entry's item not current.
A fragment-only link (`#reviews`, `#`) is rewritten into the current page's
address with that fragment: `#/<key>#reviews` in hash mode,
`<base><key>/#reviews` in path mode (`<base>#reviews` on the entry page) —
in a link member, a `navigate` action's `url` and what `appHref` returns
alike, in the first frame and after hydration the same, so hydration adopts
the link as the build wrote it.
A link to the app's own media — `pwpack/media/<file>`, also written
`/pwpack/media/<file>` or `./pwpack/media/<file>` — is a file, not a page: the
runner writes it as the relative path `pwpack/media/<file>`, against the
shell's base, in both modes, and never as a route. So is a link to one of the
app's public files: a root-relative link whose path (before `?` and `#`),
without its leading `/`, is in `publicFiles` (`/docs/guide.pdf`) is written
as that relative path (`docs/guide.pdf`), query and fragment kept.

A link whose value **starts with an expression** (`"href": "{{item.url}}"`)
names a page only once its data is in, so it is not rewritten before
rendering: the runner rewrites it, by the same rule, when the expression has
been resolved. A link that starts with a literal path and carries expressions
after it (`/session?id={{item.id}}`) is rewritten before rendering, as written.

**A link a block makes itself.** A block that draws a link the receipt does
not hold as a link member — a markdown link inside a prose prop
(`[Webhooks](/webhooks)`), a table cell built from a `hrefTemplate` — writes
it through `context.appHref(path)` ([block-manifest](block-manifest.md#rules-beyond-the-schema)),
which the runtime fills with the runner's rule above: `appHref('/webhooks?x=1')`
is `#/webhooks?x=1` in hash mode and `<base>webhooks/?x=1` in path mode; a
fragment comes back as the current page's address with it
(`appHref('#faq')` on `pricing` is `#/pricing#faq`, `<base>pricing/#faq`); an
absolute URL, a media link, a public file and `""` come back as given. A link
written that way is the page's address, so it works opened in a new tab or
copied — a bare `/webhooks` does not on a hash-routed static host, which has
no file at that path. The static first paint and the browser write it the
same.

## 4. Per page

When the shell holds the build's first frame of the page the runner draws
first ([pwapp-format §2.5](pwapp-format.md#25-static-first-paint)), the runner
hydrates it: steps 2–6 below are computed for the first frame (nobody signed
in, no address seed), the renderer adopts the HTML, and the visit's own
values follow as an update after the hydrating commit.

For each route, a runner:

1. stops if the app is gated — `identity.required` and no session (see
   [session-protocol](session-protocol.md#5-the-gate));
2. fetches the page's receipt, presenting the visitor's credential as
   specified in [session-protocol §7](session-protocol.md#7-credentials-on-requests),
   and, once per load, the layout `layoutReceiptFile` names, the same way;
   then assembles the page into the layout ([receipt §4](receipt.md#4-the-layout))
   unless the receipt says `layout: false` — every later step reads the
   assembled page;
3. seeds page state from the address query (below);
4. rewrites links (§3);
5. fills empty navbars from `navigation.json` and sets a navbar's empty
   `logoHref` to the entry page;
6. places the account control (see session-protocol);
7. sets the document title — the page's title composed with the app's
   `title` or `titleTemplate` ([receipt §1](receipt.md#1-document)) — and the
   document's `<meta name="description">`: the page's `description` (its
   expressions resolved like the title's), else the project's; until a
   template resolves to text the project's is used, never the template, and
   with neither the element is removed; and, under path routing, the
   document's `<link rel="canonical">`: the project's `origin` with the
   page's address (§3), removed for the not-found page and for an app that
   declares no `origin` (under hash routing every page is the one document,
   which keeps the canonical address its producer wrote,
   [pwapp-format §2.4](pwapp-format.md#24-search-engines));
8. renders the receipt with the renderer, passing the block manifest, the
   page's own appearance when the receipt carries one (the producer resolved
   it to the whole configuration the page wears,
   [appearance §1.1](appearance.md#11-a-pages-own-appearance)), else the
   app-wide appearance of `appearance.json`, and the data configuration of
   [data-protocol](data-protocol.md); and names the page on the document
   element (`<html data-pw-page="<key>">`, [pwapp-format §2](pwapp-format.md#2-the-shell)),
   and removes the name for its own not-found page.

**Query seeding.** A query parameter seeds `state.<key>` only if the page reads
`state.<key>` somewhere in its receipt, or declares `<key>` in `urlState`. Never seeded: the reserved keys
`auth_error`, `code`, `state`, `error`, `error_description`, `error_uri`,
`session_state`, `iss`, `returnTo`; keys starting with `__`; `constructor` and
`prototype`; a form binding's status keys; and
keys read in a data source endpoint's scheme or host part, or in an endpoint
that is a single expression. Values stay strings, the first of a repeated key
wins, values are cut at 512 characters, and `.` or `..` become `''`. Seeds are
merged into the `platform/persistence` `initialState` (the capability is added
when the page has none). A change that only touches the query re-renders only
if it changes the seed.

**The page's address.** A page's query is its route's query: `location.search`
in path mode and the query inside the fragment (`#/<key>?<query>`) in hash
mode. Two things a page keeps there are written back by the runtime through
the runner, keeping the page and the anchor and firing no navigation:

- the keys the page declares in `urlState`
  ([data-protocol §1](data-protocol.md#1-declaring-data)): seeded like any read
  key (they are seeded even when no expression names them), and written back
  whenever they change, **replacing** the history entry; `''` or `null`
  removes the key;
- a split shell's selection, under its `selectionKey`: written back, **pushing**
  a history entry, so Back undoes a selection. The selection is page state
  too, `{{state.<selectionKey>}}`, and a selection naming an item the shell does
  not have is no selection (`null`).

A runner MUST NOT write the selection or `urlState` to `location.search` in
hash mode: there it sits beside the route, where the page cannot read it.

**Per-app storage.** A runner keys browser storage by `appId` = `project.id`,
else `project.title`, else `"app"`. Two apps on one origin SHOULD therefore
carry distinct ids.

## 5. `blocks/manifest.json`

```json
[{ "blockType": "navbar", "moduleUrl": "blocks/navbar.a3f1c2d4.mjs",
   "integrity": "a3f1c2d4…", "publisher": "example", "publisherVerified": true,
   "definition": { "name": "navbar",
                   "props": [{ "name": "links", "default": [], "jsonSchema": { "type": "array" } },
                             { "name": "stateKey", "bindable": false, "jsonSchema": { "type": "string" } },
                             { "name": "size", "default": "md",
                               "jsonSchema": { "type": "string", "enum": ["sm", "md", "lg"] } }] } }]
```

One entry per block type the pages use. `blockType` is the join key with a
block node's `type`; `moduleUrl` is where the module is (below); `integrity` is the
module's SHA-256 as lower-case hex or SRI `sha256-<base64>`. A renderer MUST
verify `integrity` before evaluating a module and MUST fail that block on a
missing or mismatching hash. How a renderer presents a block type a page uses
but the manifest does not list is not specified by this version; a publisher
SHOULD list every type its pages use.

**Where a module is.** A relative `moduleUrl` is relative to the app folder:
the folder that holds the manifest's own folder (`blocks/`, `engines/`). A
runner MUST resolve it against that folder, not against the document's base
URL, and every reader of the entry (the renderer's loader, a preload, an
engine registry) MUST fetch the module at that address. An absolute
`moduleUrl` is used as written. When the shell is served from the app folder
both give the same address; when it is not — the app placed in a page at
another path, or its files on another origin — the module is still found
beside the manifest:

| Manifest at | Page at | `moduleUrl` | Module fetched from |
|---|---|---|---|
| `https://app.example/blocks/manifest.json` | `https://app.example/` | `blocks/navbar.a3f1c2d4.mjs` | `https://app.example/blocks/navbar.a3f1c2d4.mjs` |
| `https://www.example/apps/cafe/blocks/manifest.json` | `https://www.example/team/home` | `blocks/navbar.a3f1c2d4.mjs` | `https://www.example/apps/cafe/blocks/navbar.a3f1c2d4.mjs` |
| `https://cdn.example/cafe/engines/manifest.json` | `https://www.example/` | `engines/acme.5d41402a.mjs` | `https://cdn.example/cafe/engines/acme.5d41402a.mjs` |

`definition.props` lists the props the block's manifest declares
([block-manifest, prop descriptor](block-manifest.md#prop-descriptor)) — the
block's only definition of its props — each with what a renderer reads:
`name`, and when the manifest gives them `bindable`, `required`, `default` and
`jsonSchema`. Members written for people (`type`, `copy`, `description`, and
`description` / `title` / `examples` inside `jsonSchema`) MAY be left out. A
renderer reads it before the module loads:

- a prop whose entry says `bindable: false` is passed to the block exactly as
  written — a `{{…}}` in it, or anywhere inside an object or list value, is not
  resolved. A prop the list does not name, or a block without
  `definition.props`, is bindable;
- before the block renders, its props are applied to the entries
  ([block-manifest, applying props](block-manifest.md#applying-props)):
  defaults filled, values coerced, a value that does not fit kept as written
  — never an error.

A publisher SHOULD carry `definition.props` for every block whose manifest
declares props; without it the block gets its props exactly as written.

## 6. `engines/manifest.json`

One entry per connector or provider engine the app ships:
`{ connection, atomId, kind: "connector" | "provider" }` plus **either**
`moduleUrl` + `integrity` (a compiled engine, located and verified like a block module, §5)
**or** `engine` (a [declaration](connector-manifest.md#3-the-engine-declaration))
— never both, never neither. `connection` names the entry of `connections.json`
the engine serves; a runner carries a declared engine onto that connection
unless the connection already carries its own. An entry naming a connection
`connections.json` does not declare MUST NOT create one.

**One module per provider.** The facets of a vendor
(`providers/<vendor>/entities/*`, [connector-manifest](connector-manifest.md))
share its motor and whatever the motor imports, so a producer compiles every
facet the app ships into ONE module per vendor (`engines/<vendor>.<hash>.mjs`)
and does not repeat that code per facet. Each facet's entry names the shared
module in `moduleUrl` (with its `integrity`) and the facet's factory in
`export`: a named export of that module, the facet's name (`"orders"`). A
runner fetches, verifies and evaluates the module once and builds each
connection's engine from its own export. An entry without `export` is a
module whose factory is `createConnector` (or the default export).

## 7. Versioning

The envelope has no engine-version field. Compatibility is carried by the
runtime files served beside it (the runner and renderer the publisher
included) and by block modules pinned by hash. The only compatibility rule in
the format itself is the `surfaceReceiptFiles` fallback of §2.

## Conformance

- `examples/envelope/`, `examples/envelope.auth/`,
  `examples/envelope.blocks-manifest/`, `examples/envelope.engines-manifest/`,
  against the hand-written schemas.
- A served envelope with expected routes, rewritten links and seeded state is
  reserved for `fixtures/roundtrip/`.

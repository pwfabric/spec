---
status: draft
formatVersion: "1.0"
---

# The plan

`app/plan.json` records how an app was planned: what it is for, which pages it
has and what each one reads and writes, which images and files it needs and
where they go, which data models and connections it uses, and who may enter.
It is a working document — it is how an app is built and revised, not what it
runs on. A runner never reads it; an editor, a builder or a host that opens the
folder as a project does.

Schema: [`schemas/plan.schema.json`](schemas/plan.schema.json) (hand-written;
no reference schema exists in the engine — the shape is taken from the hosting
platform that writes it and restated here in engine-neutral terms).

**Why draft.** The plan's vocabulary is still growing (a single `needs[]`
list is meant to replace `media[]`, `customBlocks[]` and the producer's
`unmet.json`), and the engine itself does not consume it. Only the members
below are specified; a producer MAY write more and a reader MUST ignore what it
does not know.

## 1. Members

| Member | Required | Meaning |
|---|---|---|
| `title` | no | The app's name (≤ 80 characters). |
| `titleTemplate` | no | How a page's title becomes the document title: a string with exactly one `%s`, which the page's title replaces (`"%s · Acme Bakery"`); `%%` writes a `%`. A producer carries it into `project.json` `titleTemplate`; the composition is [receipt §1](receipt.md#1-document). |
| `description` | no | The app in a sentence, for visitors (a search result, a link preview). A producer carries it into `project.json` `description` ([envelope §2](envelope.md#2-projectjson)). |
| `locale` | no | The app's language, a BCP 47 tag (`en-GB`): its words, dates and numbers are written in it. A producer carries it into `project.json` `locale`. |
| `origin` | no | The app's public origin, `scheme://host[:port]` with no path (`https://example.com`): where it is published. Each page's canonical address, Open Graph `og:url`, `sitemap.xml` entry, and a path-routed build's `llms.txt` and `llms-full.txt` are built on it ([pwapp-format §2.4](pwapp-format.md#24-search-engines)); the path the app is served under is the build's, not the plan's. A producer carries it into `project.json` `origin` and refuses one that is not an `http(s)` origin. |
| `image` | no | The picture a link preview shows for the app: an absolute `http(s)` address, or a file of the app (`media/<file>`). A producer carries it into `project.json` `image` (the app's file as served, `pwpack/media/<file>`) and refuses a file the app does not have. |
| `messages` | no | The app's words for the screens and controls the engine draws: a flat object from message id to string, in `locale`. A message MAY use the ICU plural form, `{n, plural, one {# item} other {# items}}`, resolved with the plural rules of `locale`. A producer carries it into `project.json` `messages` unchanged; the ids, the lookup order and the plural rules are [envelope §2.1](envelope.md#21-messages). |
| `headers` | no | Response headers the app adds: `{ path, headers }[]` — `path` root-relative to the app, `*` matching any run of characters; `headers` a map from header name to value. A producer writes them into `_headers` after the engine's own rules; they add to the engine's headers and cannot take one back, and `Content-Security-Policy` cannot be set ([pwapp-format §2.6](pwapp-format.md#26-the-apps-headers-and-redirects)). |
| `redirects` | no | `{ from, to, status? }[]` — `from` a root-relative path (a trailing `*` matches the rest), `to` a root-relative path (`:splat` is what the `*` matched) or an absolute `http(s)` URL, `status` `301` (default), `302`, `307` or `308`. A producer writes them into `_redirects`, in order ([pwapp-format §2.6](pwapp-format.md#26-the-apps-headers-and-redirects)). |
| `scripts` | no | Third-party scripts the app loads once the visitor consents: `{ key, src, integrity?, origins, consent }[]` — `src` an absolute `https` address on an exact origin, `origins` the origins it reaches (`script`, which lists `src`'s own origin; `connect`; `img`), `consent` the consent category it waits for. A producer carries them into `project.json` `scripts` ([envelope §2.2](envelope.md#22-scripts-and-consent)). |
| `intent` | yes | `{ purpose, audience, tone, successCriteria }` — the brief, distilled. Each a non-empty string. |
| `theme` | yes | `{ direction, paletteHint, typographyHint?, status, failure?, resolvedTheme? }` — the look asked for; `resolvedTheme` holds the tokens once produced. |
| `capabilities` | yes | `{ key, capabilityId, purpose, config, status, failure?, usedBySurfaces }[]`. |
| `media` | yes | Media needs (§2). |
| `mediaGeneration` | no | `auto` — a host fills pending image needs on its own; `manual` — they wait for a person. |
| `customBlocks` | yes | `{ key, purpose, behaviorDescription, status, failure?, usedBySurfaces }[]` — blocks no installed pack provides. |
| `surfaces` | no | Pages (§3). Absent: the page list is `pwpack.json` `app.surfaceOrder`; present, it agrees with it (§3.1). |
| `connections` | no | Connection names the app uses. |
| `authRequired` | no | Short form of `identityBinding.required`. |
| `identityBinding` | no | The identity declaration — the same shape as [`app/definitions/auth.json`](definitions.md#authjson) without `access`. |
| `models` | no | `{ key, typeId, displayName, fields[], status, … }[]` — data models to create. |
| `access` | no | `{ roles[], rules[{ subject, model, rule }] }`. |
| `shell` | no | `topnav`, `sidebar`, `bottomnav`, `none`, or `null` (not yet chosen). |
| `packs` | no | `{ id, range }[]` — packs the plan wants installed. |

Every planned item carries a `status`:

| Status | Meaning |
|---|---|
| `pending` | Not produced yet. |
| `generating` | Being produced. |
| `preview` | Produced, awaiting acceptance. |
| `applied` | In the app. |
| `failed` | The last attempt failed; `failure` says why. |
| `requested` | Handed to another producer; terminal for this plan. |

`failure` is `{ code, message, retryable? }` or `null`. `retryable` is recorded
where the failure happened, not inferred by whoever displays it.

## 2. Media needs

```json
{ "key": "hero", "kind": "image", "purpose": "A loaf on a table", "status": "pending",
  "usedBySurfaces": ["home"], "origin": "placeholder",
  "slots": [{ "surfaceKey": "home", "blockId": "hero", "prop": "imageSrc" }] }
```

| Member | Meaning |
|---|---|
| `key`, `kind` (`image` · `file`), `purpose`, `status`, `usedBySurfaces` | The need. |
| `slots` | Where the asset lands: one block prop on one page each. A host that produces the asset writes its address into exactly these props. |
| `url`, `origin` | The asset's address once there is one, and where it came from: `provided`, `placeholder`, `generated`, `uploaded`, `library`. |
| `decorative` | Ambience, not content. |

Rules:

1. A value a person put in a slot (an upload, a library pick, an asset the
   brief supplied) MUST NOT be replaced automatically.
2. Each media need SHOULD also be declared as `app/media/<key>.json`
   ([pwpack-format §1.3](pwpack-format.md#13-media)); the two agree by
   construction. Bytes the need is met with live at `media/<name>`, named by
   the declaration's `file` (`"media/<name>"`) and recorded in
   `media/provenance.json`.

## 3. Pages

| Member | Meaning |
|---|---|
| `key` | The page key — the page's address and its receipt's path (`app/surfaces/<key>.receipt.json`): one or more segments joined by `/`, each lower-case `a-z0-9` words joined by `-` or `.` (`docs/intro`, [pwpack-format §2.5](pwpack-format.md#25-page-keys)). |
| `name`, `purpose`, `isEntry` | What the page is called and for; exactly one page SHOULD be the entry. |
| `keyContent`, `linksTo` | Sections it must contain; page keys it links to. |
| `usesCapabilities`, `usesMedia`, `usesCustomBlocks` | Keys into the lists above. |
| `reads`, `writes`, `counts` | Entity types the page lists, writes, or only counts. |

### 3.1 The page list

The pages an app serves are `pwpack.json` `app`: `entry`, `surfaceOrder`,
`notFound` and `signIn` ([pwpack-format §2](pwpack-format.md#2-pwpackjson)).
`surfaces` is what was planned for them, so it is OPTIONAL and derived: a
plan without it has, for each key of `app.surfaceOrder`, a page with that
`key`, `isEntry` true for `app.entry` only, and nothing else known. A
producer that writes `surfaces` keeps it in step with the app.

When both are present they MUST agree:

1. every key of `app.surfaceOrder`, and `app.notFound` and `app.signIn` when
   declared, has an entry in `surfaces` with that `key`;
2. an entry whose `status` is `applied` names a page the app serves (one of
   the keys of rule 1); an entry in any other status MAY name a page that is
   not served yet — it is planned, not built;
3. the entry with `isEntry: true` is `app.entry`, and no other entry is.

The order of `surfaces` is not the route order; `app.surfaceOrder` is.
Whoever opens the folder checks the rules, since they concern two files: the
reference reader reports a disagreement as an error
(`APP_PLAN_SURFACE_MISMATCH`, [pwpack-format §Codes](pwpack-format.md#codes)).

## 4. Precedence

When a folder carries both `app/definitions/auth.json` and a plan with an
`identityBinding`, the definition wins: definitions are what the app runs on,
the plan is how it was worked on.

## Conformance

- `examples/plan/{valid,invalid}/*.json`, against the hand-written schema.

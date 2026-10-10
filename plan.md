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
| `intent` | yes | `{ purpose, audience, tone, successCriteria }` — the brief, distilled. Each a non-empty string. |
| `theme` | yes | `{ direction, paletteHint, typographyHint?, status, failure?, resolvedTheme? }` — the look asked for; `resolvedTheme` holds the tokens once produced. |
| `capabilities` | yes | `{ key, capabilityId, purpose, config, status, failure?, usedBySurfaces }[]`. |
| `media` | yes | Media needs (§2). |
| `mediaGeneration` | no | `auto` — a host fills pending image needs on its own; `manual` — they wait for a person. |
| `customBlocks` | yes | `{ key, purpose, behaviorDescription, status, failure?, usedBySurfaces }[]` — blocks no installed pack provides. |
| `surfaces` | yes | Pages (§3). |
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
| `key` | The page key — the route segment and the receipt's file name (`app/surfaces/<key>.receipt.json`). Lowercase `a-z0-9` words joined by `-` or `.`. |
| `name`, `purpose`, `isEntry` | What the page is called and for; exactly one page SHOULD be the entry. |
| `keyContent`, `linksTo` | Sections it must contain; page keys it links to. |
| `usesCapabilities`, `usesMedia`, `usesCustomBlocks` | Keys into the lists above. |
| `reads`, `writes`, `counts` | Entity types the page lists, writes, or only counts. |

## 4. Precedence

When a folder carries both `app/definitions/auth.json` and a plan with an
`identityBinding`, the definition wins: definitions are what the app runs on,
the plan is how it was worked on.

## Conformance

- `examples/plan/{valid,invalid}/*.json`, against the hand-written schema.

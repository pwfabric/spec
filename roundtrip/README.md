# Round-trip apps

Three small, canonical apps — each a pwpack folder in `<app>/input/` — and the
pack they stand on. They exist to check that an app survives being exported,
imported and exported again, by any implementation that does either.

| App | What it exercises |
|---|---|
| `l1-static/` | L1 — two pages of foundation blocks; `app/plan.json`, appearance and navigation definitions. |
| `l2-custom-block/` | L2 — one page that uses the app's own block, `atoms/blocks/custom/greeting/` (`component.tsx` + `manifest.json`). |
| `l3-data/` | L3 — an entity (`app/definitions/entities.json`), sign-in (`app/definitions/auth.json`), seed records (`app/data/Product.json`) and a data-bound page. |
| `_foundation/` | The pack the three apps pin: three blocks (`layout.section`, `text.text`, `data.repeater`) and one theme (`theme-zinc`). |

Each app's `pwpack.json` declares the foundation twice, as
[pwpack-format §2](../pwpack-format.md#2-pwpackjson) intends: `requires`
(`{ "id": "@pwpack/fixture/foundation", "range": "^1.0.0" }`, what it stands
on) and `packs[]` (the exact build it was made against, with that build's
content hash). `expected.json` beside each `input/` holds the app's content
hash ([§3.3](../pwpack-format.md#33-content-hash)), its verdict and, for the
apps, the pin it must carry.

`_foundation/input/` is a minimised derivative of the reference foundation pack
(Apache-2.0): the same atom ids, manifest shape and theme tokens, with each
component cut down to a few lines. It is here so the apps have a real build to
pin; it is not a usable foundation.

`app/data/<Entity>.json` (`{ "data": [records] }`, the records in the shape of
[data-protocol](../data-protocol.md)) is where these apps carry seed records.
No format document specifies seed data yet; until one does, this is the
location the round-trip apps use, and an exporter that writes seed records
elsewhere fails the rule below for L3 only.

## The acceptance rule

An implementation that exports and imports apps conforms when, for each app:

1. **Stable.** export → import → export reproduces the same content hash.
   Starting from `<app>/input/`: import it, export it, and the content hash of
   the export equals `contentHash` in `expected.json`; import that export and
   export again, and the hash is still the same. Archive framing,
   compression, file order on disk, platform and clock do not count — the
   content hash is computed from paths and bytes only.
2. **Local.** Changing one prop of one block, and exporting, changes exactly
   one file: the receipt of the page that holds the block. Every other path
   and every other byte is unchanged, and the content hash changes.
3. **Pinned.** The export keeps `requires` and `packs[]`; the foundation pin's
   `hash` equals the content hash of `_foundation/input/`.

`test/fixtures.test.mjs` checks the committed hashes and pins with the spec
alone. In the engine repository, `node scripts/spec-conformance.mjs` checks
rule 1 through the pack library's archive (folder → `.pwpack` → folder) and
rule 2 on a copy of `l1-static` with one prop changed.

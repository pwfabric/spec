# Conformance fixtures

Byte-level fixtures for [pwpack-format](../pwpack-format.md) (`formatVersion`
1.0): what the JSON examples in `../examples/` cannot express — real folders,
real archives, their content hashes and the verdict a conforming reader gives.

Every file here is committed byte for byte (`../.gitattributes` turns off
line-ending conversion): a fixture that a checkout rewrote would hash
differently.

## Layout

```text
fixtures/
├── pwpack/<case>/
│   ├── input/            a pwpack folder, exactly as a reader finds it on disk
│   └── expected.json     the verdict for it
└── pwpack-archives/
    ├── <case>.pwpack.b64       an archive, base64 (76-column lines)
    └── <case>.expected.json    the verdict for it
```

Archives that a conforming producer never writes — `..` names, absolute names,
links, FIFOs, broken checksums, crossed limits — exist only as base64, so no
hostile path is ever a real file in a checkout. Archives older producers do
write (`package/` wrapper, `./` prefixes, a bare tar, GNU long names) are here
too, as cases a reader must accept.

## `expected.json`

Folder case (`fixtures/pwpack/<case>/expected.json`):

| Member | Meaning |
|---|---|
| `case`, `format`, `formatVersion`, `description` | What the case is and which document it checks. |
| `valid` | `true` when validation finds no `error`. |
| `errors`, `warnings`, `info` | The set of codes per severity, sorted, each once ([pwpack-format §Codes](../pwpack-format.md#codes)). |
| `layout` | `canonical`, `rootless`, `mixed` or `empty` (informative). |
| `files` | Number of files in `input/`, pack content or not. |
| `contentHash` | The content hash of `input/` ([§3.3](../pwpack-format.md#33-content-hash)): over its pack content ([§1.2](../pwpack-format.md#12-pack-content)) only. Normative. |
| `archiveSha256` | SHA-256 of the reference archive of `input/`. **Informative**: it holds only for a DEFLATE implementation that compresses like the reference one (§3.3). |
| `atoms` | `{ kind, id }` per [§1.1](../pwpack-format.md#11-how-a-path-becomes-an-atom), sorted by kind then id. |

Archive case (`fixtures/pwpack-archives/<case>.expected.json`) has the same
members, except:

| Member | Meaning |
|---|---|
| `archiveSha256` | SHA-256 of the decoded `.pwpack.b64` — identifies the fixture input. |
| `stage` | `read`: the archive must be refused while opening it; `errors` holds the one read code and `contentHash` is `null`. `validate`: the archive opens; the rest is the verdict on the folder it holds. |
| `limits` | Present on cases that cross a size limit; they assume the reference defaults of [§3.2](../pwpack-format.md#32-reading-an-archive). |

Several accepted archive cases (`package-wrapper`, `dot-slash-prefix`,
`bare-tar`, `old-gnu-magic`, `any-mode-and-mtime`) hold the files of
`pwpack/minimal`; their `contentHash` equals that case's, which is the point of
a framing-independent hash. `partial-wrapper` adds a file outside the pack
content and `pwpack/source-with-tooling` adds an author's tooling
(`package.json`, `tsconfig.json`, `scripts/`, `test/` …); both hash as
`minimal` too, because the hash covers the pack content only.

### Collisions no folder can hold

A path that is both a file and a directory (`atoms/lib/x` and
`atoms/lib/x/y.ts`) cannot exist in a folder, so it has no `pwpack/` case:
`pwpack-archives/path-conflict` is the archive form (refused at read,
`PATH_CONFLICT`). An implementation whose packs can also be built in memory
MUST report the same pair as the validation error `PATH_CONFLICT`, and its
writer MUST refuse it; the reference library's unit tests cover that form.

Paths that differ only in case (`Hero.json`, `hero.json`) cannot be checked
out on Windows or macOS, so they too are an archive case only:
`pwpack-archives/case-conflict` opens and validates with the warning
`CASE_CONFLICT`.

## Checking an implementation

**With the spec alone.** `test/fixtures.test.mjs` (Node built-ins only)
recomputes the content hash of every `input/` folder, checks the round-trip
pins, checks each archive's SHA-256 and that every `expected.json` is
well-formed and uses only documented codes.

**An implementation's verdicts.** The engine repository runs every case
through its pack library with `node scripts/spec-conformance.mjs`. Any other
implementation is checked by the same runner through an adapter module:

```sh
node scripts/spec-conformance.mjs --implementation ./my-adapter.mjs
```

The module's default export (or the module itself) is:

```ts
interface ConformanceAdapter {
  /** Shown in the report. */
  name?: string
  /** Open a folder on disk. Throw an error with `code` (a read code) to refuse it. */
  readFolder(dir: string): unknown | Promise<unknown>
  /** Validate an opened pack: the codes it finds, per severity. */
  validate(pack: unknown): { errors: string[]; warnings: string[]; info?: string[] } | Promise<…>
  /** The content hash, `sha256:<hex>`. */
  hash(pack: unknown): string | Promise<string>
  /** The atoms, `{ kind, id }` (other members are ignored). */
  atoms(pack: unknown): { kind: string; id: string }[] | Promise<…>
  /** OPTIONAL. Open `.pwpack` bytes; throw with `code` to refuse. Without it, archive cases are skipped. */
  readArchive?(bytes: Uint8Array): unknown | Promise<unknown>
  /** OPTIONAL. Pack to `.pwpack` bytes. Without it, the archive round trip is skipped. */
  writeArchive?(pack: unknown): Uint8Array | Promise<Uint8Array>
}
```

`pack` is whatever the adapter's `readFolder` / `readArchive` returns; the
runner only hands it back. Codes are compared as sets per severity; `info`
is compared only when the adapter returns it. `archiveSha256` is reported,
never failed on.

## Regenerating

The `input/` folders and the archive recipes are written by hand. The
expected values are generated by the reference pack library and committed:

```sh
pnpm --filter @pwfabric/pack build
node spec/scripts/build-fixtures.mjs            # write
node spec/scripts/build-fixtures.mjs --check    # exit 1 on drift
```

A change that alters an expected value is a change of behaviour of the
reference library, and the diff of `expected.json` is where it shows.

## Still reserved

- `classify/paths.json` — a table of paths and the `{ kind, id }` each
  classifies as. `pwpack/every-atom-family` covers every row of
  [§1.1](../pwpack-format.md#11-how-a-path-becomes-an-atom) by example;
  the table form is not written yet.
- `exchanges/` — recorded request/answer sequences for
  [session-protocol](../session-protocol.md) and
  [data-protocol](../data-protocol.md).
- `appearance/` — token sets in, emitted custom properties out
  ([appearance](../appearance.md)).

---
status: stable
formatVersion: "1.0"
---

# The pwpack format

A **pwpack** is the unit the engine reads: one folder that is a pack of
reusable parts (atoms), an app, or both. The same folder is the working copy an
author edits, and — packed as a deterministic archive, the **`.pwpack`** — the
artefact that is published, installed, delivered and exported. This document
specifies the folder layout, the identity file `pwpack.json`, how a path in the
folder becomes an atom, and the archive rules that make the same folder produce
the same bytes everywhere.

Schema: [`schemas/pwpack-format.schema.json`](schemas/pwpack-format.schema.json)
(for `pwpack.json`; generated from the reference schema `PwpackIdentitySchema`).

## 1. Folder layout

```text
<name>/
├── pwpack.json                     identity (REQUIRED)
├── app/                            the app's own composition (only in an app)
│   ├── plan.json                   how the app was planned          → plan.md
│   ├── definitions/<key>.json      appearance · navigation · connections · entities · auth → definitions.md
│   ├── surfaces/<key>.receipt.json one per page                     → receipt.md
│   ├── media/<key>.json            media declarations (no bytes)   → §1.3
│   └── unmet.json                  needs the producer could not meet, when any
├── media/                          content files: images, video, fonts (only when any)
│   ├── <name>                      the bytes, one file per name
│   └── provenance.json             where each file came from, and its hash
└── atoms/                          reusable parts
    ├── blocks/<category>/<name>/   component.tsx + manifest.json   → block-manifest.md
    ├── capabilities/<name>/        handler.ts + manifest.json      → capability-manifest.md
    ├── connectors/<Name>.knowledge.json (+ <Name>.ts)              → connector-manifest.md
    ├── providers/<vendor>/entities/<entity>.knowledge.json (+ .ts)
    ├── appearance/<theme>/manifest.json                            → appearance.md
    ├── patterns/<name>.json
    ├── icons/icons.json
    ├── auth/AuthProvider.tsx, auth/<method>.knowledge.json
    ├── surfaces/<group>/<name>.receipt.json   shared page recipes
    ├── lib/                        shared code, compiled as companions, never an atom
    └── test/                       the pack's own tests (OPTIONAL)
```

Rules:

1. The folder root is the archive root. A producer MUST NOT add a wrapping
   directory (`package/`, `src/`, `pack/`) above `pwpack.json`.
2. `pwpack.json` MUST be present at the root. A `package.json` is not an
   identity file; a reader MUST NOT treat it as one.
3. A folder whose `pwpack.json` has an `app` member is an **app**; without it,
   the folder is a **pack**. A pack MAY carry an `app/` folder (for example,
   showcase pages); it is read only when `app` is declared.
4. `app/` is a declaration: it is read when the folder is opened as an app and
   carries no compiled code. `atoms/` is read by an installer. Neither half
   reads the other's files by path.
5. Paths use `/` as separator, are relative to the root, and MUST NOT contain
   `..` segments, a leading `/`, a drive letter or a backslash. A reader MUST
   refuse a folder or archive that contains such a path.
6. File names are case-sensitive: `Hero.json` and `hero.json` are two
   paths. A producer SHOULD NOT write two paths that differ only in case or
   in Unicode normalisation (compared as the lower case of their NFC form):
   extracted onto a case-insensitive file system, one overwrites the other.
   A reader accepts them and warns (`CASE_CONFLICT`).
7. A path MUST NOT be both a file and a directory: `atoms/x` and
   `atoms/x/y` cannot both exist on disk, and extracting them clobbers one
   or fails. A reader MUST refuse an archive that holds such a pair
   (`PATH_CONFLICT`), and validation reports it as an error for a pack held
   in memory.
8. One name per concept: `media/` holds content files (images, video,
   fonts) and nothing else. `assets/` is not a pwpack folder; in a pwapp it
   names the runtime files (`assets/embed.js`, `assets/runner.js`,
   `assets/theme.css`, see [pwapp-format](pwapp-format.md)). A pack MUST
   NOT carry `app/assets/`; a reader does not read it and validation
   reports every file there as an error (`LEGACY_ASSETS_FOLDER`).

### 1.1 How a path becomes an atom

Every file under `atoms/` is classified by its path alone. The `atoms/` prefix
is a root, not part of the id; a reader MUST also accept the same paths
without it (the **rootless** layout of folders written before `atoms/`
existed) and classify them identically.

| Path below `atoms/` | Kind | Atom id |
|---|---|---|
| `blocks/<p1>/…/<pn>/component.tsx` (at least two segments) | `block` | `<p1>.….<pn>` — e.g. `blocks/control/badge/component.tsx` → `control.badge` |
| `blocks/<p1>/…/<pn>/bundle.mjs` | `block` (precompiled) | same as above |
| `surfaces/<g1>/…/<name>.receipt.json` | `surface` | `<g1>.….<name>` |
| `capabilities/<name>/handler.ts` | `capability` | `platform/<name>` |
| `appearance/<p1>/…/manifest.json` | `ui-appearance` | `<p1>.…` |
| `patterns/<name>.json` (exactly two segments) | `pattern` | `<name>` |
| `icons/…/icons.json` | `icon-set` | `icons` |
| `connectors/<Name>.knowledge.json` (exactly two segments) | `connector` | `<Name>` |
| `providers/<vendor>/entities/<entity>.knowledge.json` (exactly four segments) | `provider` | `<vendor>.<entity>` |
| `auth/AuthProvider.knowledge.json` or `auth/AuthProvider.tsx` | `auth-provider` | `auth` |
| `auth/<method>.knowledge.json` (exactly two segments) | `auth-provider` | `auth.<method>`, only when `<method>` is one of `password`, `host`, `google`, `github`, `microsoft` |

Everything else is **inert cargo**: it travels in the archive but is not an
atom. That includes a connector's or provider's engine source (`<Name>.ts`),
which is compiled from its knowledge file's sibling at publish time, and a
`blocks/<x>/README.md`.

`atoms/lib/…` and rootless `lib/…` are **shared code**: not atoms, but compiled
together with the atoms that import them. `app/…` is the app declaration.
`pwpack.json` at the root is the identity. A reader MUST derive atom ids
exactly as in the table; an id derived differently names an atom no consumer
can resolve.

When both `auth/AuthProvider.knowledge.json` and `auth/AuthProvider.tsx` are
present, they are one atom (`auth`) and the knowledge file is its manifest.

### 1.2 Pack content

A folder on disk is often an author's working copy, with tooling beside the
pack (`package.json`, `tsconfig.json`, `vitest.config.ts`, `scripts/`, a root
`test/`, version-control files). None of that is the pack. A reader computes
the **pack content** of a folder as exactly these files:

- `pwpack.json`, `LICENSE`, `NOTICE` and `README.md` at the root;
- every file under `app/`, `atoms/` and `media/`;
- for the rootless layout (§1.1), every file under a root atom-family
  directory: `blocks/`, `capabilities/`, `connectors/`, `providers/`,
  `appearance/`, `patterns/`, `icons/`, `surfaces/`, `auth/`, and the
  shared-code root `lib/`. A root `test/` is not pack content; a pack that
  ships its tests keeps them in `atoms/test/`.

Everything else is dropped. The content hash (§3.3) is over the pack
content, so a pack read from its source folder and the same pack read from
its archive have the same identity. Validation still reports what it finds
outside the pack content (`UNKNOWN_TOP_LEVEL`), so an author sees it.

A Markdown file directly in `atoms/` or directly in an atom-family directory
(`atoms/README.md`, `atoms/blocks/README.md`, rootless `blocks/README.md`)
is documentation: pack content, not an atom, and not an unknown family
(`DOC_FILE`, info).

### 1.3 Media

Three places, one concept each:

| Path | What it is |
|---|---|
| `app/media/<key>.json` | One **media declaration**: which image or file the app needs and which page slots its address goes into. No bytes. Schema: [`schemas/pwpack-format.media-declaration.schema.json`](schemas/pwpack-format.media-declaration.schema.json). |
| `media/<name>` | The **bytes** a pack carries — generated, uploaded (a brief's attachments are uploads) or shipped with the pack. |
| `media/provenance.json` | One entry per file under `media/`: `{ path, hash, source, createdAt, model?, license?, origin? }` — where the bytes came from and their `sha256:` hash. `source` is `generated` (produced by a model), `uploaded` (added by a person; bytes a brief supplied are `uploaded`) or `provided` (shipped with a pack or supplied by the host). |

A declaration is
`{ kind: "image" | "file", purpose?, origin?, slots?: [{ surfaceKey, blockId, prop }], status?, url?, decorative?, file? }`:

- `key` is the declaration's file name without `.json`; it is how
  `app/plan.json` `media[]` and a pwapp's `publish.json` `media[]` name it.
- `origin` says where the asset came from: `uploaded` (added by a person,
  including a brief's attachments), `generated`, `library`, `placeholder`,
  `provided` (shipped with a pack or supplied by the host). The vocabulary
  is open; a reader accepts any non-empty string.
- `file`, when present, is the bytes' path **from the pack root** —
  `media/<name>`, e.g. `"media/logo.svg"`, the same form as
  `media/provenance.json` `items[].path`. It names one file directly in
  `media/`: no sub-directory, no `.` or `..` name, no backslash, and never
  `media/provenance.json`.
- `url` is the asset's address once it has one; a host that produces or
  receives the asset writes that address into the declared `slots` (a value
  a person put in a slot is never replaced, [plan §2](plan.md#2-media-needs)).

Rules:

1. A declaration that names a `file` MUST have its bytes at that path
   (`MEDIA_FILE_MISSING`), and `media/provenance.json` MUST list that path
   (`MEDIA_FILE_UNRECORDED`). Both are errors.
2. Every file under `media/` SHOULD be listed in `media/provenance.json`
   (`MEDIA_UNDECLARED`, warning), and its recorded hash SHOULD match its bytes
   (`MEDIA_HASH_MISMATCH`, warning). A provenance record that does not parse
   or breaks its schema is an error (`MEDIA_PROVENANCE_INVALID`), and so is
   one naming a file the pack lacks (`MEDIA_PROVENANCE_PATH_MISSING`).
3. A declaration that parses as JSON but breaks its schema is an error
   (`MEDIA_DECLARATION_INVALID`) and is not read. Anything under `app/media/`
   that is not a `<key>.json` directly in it is a warning
   (`APP_UNEXPECTED_FILE`): bytes belong in `media/`.
4. A pack MUST NOT carry `app/assets/` (§1 rule 8, `LEGACY_ASSETS_FOLDER`).

The same records appear in `app/plan.json` `media[]` (see [plan](plan.md)).
When a pwapp is built, the bytes are served at `pwpack/media/<name>`
([pwapp-format §1](pwapp-format.md#1-the-served-folder)).

## 2. `pwpack.json`

```json
{
  "id": "@pwpack/acme/bakery",
  "version": "0.3.0",
  "formatVersion": "1.0",
  "engines": { "pwfabric": ">=4.17 <5" },
  "license": { "fork": true, "redistribute": false },
  "app": { "entry": "home", "surfaceOrder": ["home", "menu", "contact"] },
  "packs": [{ "id": "@pwpack/acme/cards", "version": "1.2.0", "hash": "sha256:9f2c…" }]
}
```

| Member | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | The pack's id. A published pack's id is `@pwpack/<publisher>/<name>`. |
| `version` | string | yes | The pack's own semantic version. |
| `formatVersion` | `"MAJOR.MINOR"` | no | Version of this format (folder layout and `pwpack.json`). Absent means the **pre-versioned layout** — the format as it was before this field existed — not "latest". This document is `1.0`. |
| `engines.pwfabric` | semver range | no | Engine releases the pack runs on. Absent: no constraint is stated. |
| `requires` | array | no | Packs this one stands on. Each entry is `{ "id", "range" }`: `id` a bare pack name (`records`) or a scoped id (`@pwpack/records`, `@pwfabric/foundation`), `range` a semver range. A bare pack name is accepted for older files; producers SHOULD write the object form. |
| `license` | `{ fork, redistribute }` | no | What the publisher allows: `fork` — copy an atom into another pack and change it; `redistribute` — publish that fork. Absent is **not** "both false": the consumer applies its own default. |
| `app` | `{ entry, surfaceOrder }` | no | Present only in an app. `entry` is the key of the entry page; `surfaceOrder` lists every page key in navigation order, each naming `app/surfaces/<key>.receipt.json`. |
| `packs` | `{ id, version, hash }[]` | no | Declared pins: the exact pack builds this folder was made against. `hash` is the content hash of that build's `.pwpack`. An installer treats the list as an instruction to make those builds available. |

Rules:

1. A reader MUST ignore members it does not know (a document written against a
   newer minor still reads), and SHOULD compare `formatVersion` to know whether
   it has understood everything.
2. A reader MUST NOT treat an absent `license` as a refusal or a grant.
3. A producer MUST list `app.entry` in `app.surfaceOrder`. A reader
   tolerates an entry missing from the order: the app still opens on its
   entry page, and validation warns (`APP_ENTRY_NOT_IN_ORDER`). `app.entry`
   and every key in `app.surfaceOrder` MUST have a receipt at
   `app/surfaces/<key>.receipt.json`; a missing one is an error
   (`APP_SURFACE_MISSING`).
4. Two versions are distinct: `version` is the pack's; `formatVersion` is this
   format's; `engines.pwfabric` is the engine's. Changing one never implies
   changing another.

### 2.1 Rules beyond the schema

- `engines.pwfabric` MUST be a valid semver range (`^2.0.0`, `~1.4`,
  `>=1.2.0 <3`, `1.x || 2.x`). The reference reader refuses an unparsable
  range; JSON Schema cannot check it.
- Rule 3 above (entry and pages exist) concerns other files and is checked by
  whoever opens the folder.

### 2.2 Not the derived manifest

The list of atoms a pack contains, its content hash and its storage location
are **derived** from the folder (by the classification in §1.1 and by hashing
the archive). They MUST NOT be written into the folder by hand; a reader
computes them.

### 2.3 Two spellings of `requires`

Current packs write `requires` as pack ranges,
`[{ "id": "@pwpack/records", "range": "^2.0.0" }]` (see
`examples/pwpack-format/valid/requires-as-pack-ranges.json`). That is the
form producers SHOULD write. Some older files list bare pack names; readers
MUST accept both and treat a bare name as "any version".

## 3. The `.pwpack` archive

The `.pwpack` is the folder packed so that the same folder always yields the
same bytes — the property that lets one hash identify a pack build whoever
produced it. It is named `<name>-<version>.pwpack`.

A `.pwpack` MUST be:

1. a **gzip**-compressed **tar** archive in the **ustar** format;
2. **rootless**: entry names are the folder-relative paths of §1, with no
   leading `./`, no `package/` or other prefix;
3. complete: one entry per file of the pack content (§1.2). A producer
   SHOULD write the pack content and nothing else; a reader ignores anything
   outside it when it computes the content hash;
4. **sorted**: entries in ascending byte order of their UTF-8 path;
5. **timeless and ownerless**: every entry carries the same fixed modification
   time, the same fixed file mode, and the same fixed owner and group ids and
   names, whatever the producing machine's clock, umask or user;
6. compressed with a gzip header whose **modification time is 0** and which
   carries no original file name.

### 3.1 Archive constants

A producer MUST write exactly the following. With them, rules 1–6 above are
checkable byte for byte up to the compressor (see §3.3).

**Entries**

| Constant | Value |
|---|---|
| Entries written | one per file, **plus one per directory** implied by a file path (`atoms/`, `atoms/blocks/`, …). No entry for the root itself. Nothing else: no links, devices, FIFOs, global PAX headers or GNU records. |
| Entry name | the path of §1 for a file; the path followed by `/` for a directory (`atoms/blocks/`). UTF-8, no `./`, no wrapper. |
| Order | all entry names (files and directories together) in ascending order of their UTF-8 bytes, compared byte by byte, a proper prefix first. A directory (`a/`) therefore precedes everything inside it. Not locale order: `Zeta.json` < `alpha.json` < `éclair.json`. |
| Type flag | `0` for a file, `5` for a directory. |
| Mode | `0000644` for a file, `0000755` for a directory (no executable bit is carried for files). |
| uid / gid | `0` / `0`. |
| uname / gname | empty (all NUL). |
| mtime | `0` (1970-01-01T00:00:00Z). |
| devmajor / devminor | `0` / `0`. |
| linkname | empty (all NUL). |
| Magic / version | `ustar\0` / `00` (POSIX ustar). |
| Size of a directory | `0`. |
| File data | the file's bytes exactly as they are in the folder: no line-ending, encoding or Unicode normalisation. A file with CRLF line endings keeps them. |

**Header encoding.** Numeric fields are zero-padded octal ASCII filling the
field minus one byte, followed by one NUL: mode, uid, gid, devmajor and
devminor as 7 digits + NUL; size and mtime as 11 digits + NUL. The checksum
is the unsigned byte sum of the header with the checksum field read as eight
spaces, written as 6 octal digits, NUL, space. Unused bytes are NUL.

**Long names.** A name that fits the 100-byte `name` field is written there
with an empty `prefix`. Otherwise the producer splits it at a `/` into
`prefix` (≤ 155 bytes) and `name` (≤ 100 bytes, non-empty), choosing the
**longest prefix that fits**. When no split fits, the entry is preceded by a
PAX extended header: type `x`, name `PaxHeader`, mode `0000644`, every other
field as above, whose data is the single record `<len> path=<full name>\n`
(`<len>` is the decimal byte length of the whole record, itself included),
padded to 512 bytes. The entry's own `name` field then holds the first 100
bytes of the full name (cut at a UTF-8 character boundary) and its `prefix` is
empty. No other PAX record is written.

**End of archive.** Each entry's data is padded with NUL to a multiple of 512
bytes. The archive ends with two 512-byte blocks of zeros and nothing after
them (no padding to a record size).

**Compression.** The tar is compressed as one gzip member (RFC 1952) with
DEFLATE at compression **level 9**, default strategy, a 32 KiB window
(windowBits 15) and memLevel 8. The header
carries **MTIME 0**, no FNAME, FCOMMENT, FEXTRA or FHCRC, and the **OS byte
3 (Unix)** whatever platform produced it.

**File name.** `<name>-<version>.pwpack`.

### 3.2 Reading an archive

A reader accepts a gzip-compressed tar (the normal case) and, for older
producers, a bare uncompressed tar. It tolerates what existing producers
emit: a `package/` wrapper on **every** file member (removed; a wrapper on
only some members is kept as an ordinary directory), `./` prefixes, explicit
directory entries (ignored except for the path check), ustar `prefix` names,
PAX `path` records, GNU long-name records, the old GNU magic (`ustar  `,
whose prefix bytes are not a prefix), any mode and any mtime.

A reader:

- MUST refuse an archive with a member — file or directory — whose name,
  after the `prefix`, PAX or GNU long name is applied, violates §1 rule 5;
- MUST refuse link members (symbolic and hard), devices, FIFOs and every other
  member that is neither a file nor a directory;
- MUST refuse an archive that names the same path twice (after unwrapping);
- MUST refuse an archive in which a path is both a file and a directory —
  the directory of another file or an explicit directory member (§1 rule 7);
- MUST refuse a malformed stream: not gzip and not tar, a corrupt gzip stream,
  a header checksum that matches neither the unsigned nor the signed sum, a
  numeric field that is not octal, a member truncated by the end of the stream;
- MUST refuse an archive without `pwpack.json` at its root (reported by
  validation, after the archive has been opened);
- MUST enforce size limits, and SHOULD verify the content hash (§3.3) against
  the pin or listing that named the archive before installing anything from
  it.

**Limits.** The reference reader's defaults, which the limit fixtures assume,
are: 64 MiB of archive as given, 128 MiB of tar after decompression (the
decompression-bomb ceiling), 5 000 members (files, directories and links
together), 20 MiB per file and 50 MiB of file data in total. A size field in
base-256 encoding is beyond every limit. A reader MUST open every archive
within these limits; it MAY be configured with lower ones, and then its own
limit fixtures differ.

### 3.3 Content hash

The identity of a pack build is its **content hash**, computed from the
folder — never from the archive bytes:

1. For every file of the pack content (§1.2), take its path (§1, UTF-8) and
   the lower-case hexadecimal SHA-256 of its bytes. Files outside the pack
   content do not contribute.
2. Form one line per file: `<path>` `\0` (one NUL byte) `<sha256 hex>` `\n`.
3. Sort the lines by the UTF-8 bytes of the path (the order of §3.1).
4. The content hash is `sha256:` followed by the lower-case hexadecimal
   SHA-256 of the concatenated lines.

Directories do not contribute; an empty pack hashes the empty string. The
textual form is always `sha256:<64 hex>`; where a pin (`packs[].hash`) or a
listing names a pack build, it carries this value.

The content hash depends only on the paths and bytes of the pack content, so
the same pack has the same content hash whether it was read from its source
folder (with its tooling) or from any archive layout §3.2 accepts. The SHA-256 of the `.pwpack` bytes is **not** the identity: two
conforming producers whose DEFLATE implementations differ (zlib builds and
versions are free to choose different matches at the same level) write
different compressed bytes for the same tar. A reader MUST NOT reject an
archive because its own re-packing compresses differently. Some existing
producers record the SHA-256 of the archive bytes as a listing's
`contentHash`; that value identifies one file, not the pack build.

## Conformance

- `examples/pwpack-format/valid/*.json` and `invalid/*.json` — `pwpack.json`
  documents, checked against the JSON Schema and the reference schema.
- `fixtures/pwpack/<case>/` — a pwpack folder (`input/`) and what a
  conforming implementation answers for it (`expected.json`): whether it is
  valid, the codes below, its content hash (§3.3), its atoms (§1.1) and,
  informatively, the SHA-256 of the reference archive. See
  [fixtures/README.md](fixtures/README.md).
- `fixtures/pwpack-archives/<case>.pwpack.b64` — archives a conforming
  producer never writes (hostile names, links, malformed streams, crossed
  limits) and layouts older producers do write, base64-encoded so that no
  hostile path ever exists as a file; `<case>.expected.json` gives the
  verdict.
- `roundtrip/<app>/` — whole apps, for the round-trip rule of
  [roundtrip/README.md](roundtrip/README.md).
- `test/fixtures.test.mjs` checks every content hash with nothing but the
  spec; an implementation is checked against the verdicts by a runner that
  drives it through a small adapter (fixtures/README.md).

A producer conforms to §3.1 when its archive of a fixture folder reads back to
the same content hash and, given a DEFLATE implementation that compresses the
same input to the same bytes, is byte-identical to the reference archive.

### Codes

A reader reports what it finds with these codes. The fixtures name them, so
two implementations can be compared case by case; an implementation MAY use
its own messages, and MAY report more than one finding for a case, but the
set of codes per severity is what conforms.

**Read codes** — the folder or archive cannot be opened at all. The first
problem met is reported and nothing is returned.

| Code | Meaning |
|---|---|
| `UNSAFE_PATH` | A member or file name violates §1 rule 5. |
| `LINK_ENTRY` | A symbolic or hard link (archive member, or a link in a folder on disk). |
| `UNSUPPORTED_ENTRY` | A device, FIFO or other member that is neither a file nor a directory. |
| `DUPLICATE_ENTRY` | The same path twice (after unwrapping). |
| `PATH_CONFLICT` | A path that is both a file and a directory (§1 rule 7). |
| `GZIP_INVALID` | Neither gzip nor tar, or a corrupt gzip stream. |
| `TAR_INVALID` | Bad header checksum, non-octal numeric field, truncated member, malformed PAX record. |
| `ENTRY_TOO_LARGE` | One file over the per-file limit, or a base-256 size field. |
| `TOO_MANY_ENTRIES` | More members than the limit. |
| `PACK_TOO_LARGE` | The archive, the decompressed tar or the sum of file sizes over its limit. |
| `NOT_A_DIRECTORY` | The folder to read does not exist or is not a directory. |

**Validation codes** — the pack was opened; these describe its content. Only
an `error` makes the pack invalid.

| Code | Severity | Meaning |
|---|---|---|
| `UNSAFE_PATH` | error | A path in an in-memory pack violates §1 rule 5. |
| `PATH_CONFLICT` | error | A path in an in-memory pack is both a file and a directory (§1 rule 7). |
| `IDENTITY_MISSING` | error | No `pwpack.json` at the root. |
| `IDENTITY_INVALID` | error | `pwpack.json` is not JSON, or breaks its schema (§2, §2.1). |
| `APP_SURFACE_MISSING` | error | `app.entry` or an `app.surfaceOrder` key has no `app/surfaces/<key>.receipt.json`. |
| `DUPLICATE_ATOM` | error | Two different directories yield the same `kind:id` (§1.1), e.g. one under `atoms/` and one rootless. |
| `JSON_INVALID` | error | A `.json` file under `app/` does not parse. |
| `MEDIA_PROVENANCE_INVALID` | error | `media/provenance.json` does not parse or breaks its schema. |
| `MEDIA_PROVENANCE_PATH_MISSING` | error | `media/provenance.json` names a file the pack does not carry. |
| `MEDIA_DECLARATION_INVALID` | error | An `app/media/<key>.json` that parses but breaks its schema (§1.3 rule 3). |
| `MEDIA_FILE_MISSING` | error | A media declaration's `file` names bytes the pack does not carry (§1.3 rule 1). |
| `MEDIA_FILE_UNRECORDED` | error | A media declaration's `file` has no entry in `media/provenance.json` (§1.3 rule 1). Not reported when the record is itself invalid. |
| `LEGACY_ASSETS_FOLDER` | error | A file under `app/assets/`, which is not part of the format and is not read (§1 rule 8). Declarations go in `app/media/`, bytes in `media/`. |
| `JSON_INVALID` | warning | Any other `.json` file does not parse. |
| `CASE_CONFLICT` | warning | Two paths that differ only in case or Unicode normalisation (the lower case of their NFC form is equal), or a file and a directory that do; one is lost on a case-insensitive file system (§1 rule 6). |
| `UNKNOWN_TOP_LEVEL` | warning | A top-level entry outside the pack content (§1.2), other than `package.json`. |
| `UNKNOWN_ATOM_FAMILY` | warning | A directory under `atoms/` that is not a family of §1.1, or a file directly in `atoms/` that is not Markdown. |
| `LAYOUT_ROOTLESS` | warning | Atom families at the root (the pre-`atoms/` layout). |
| `LAYOUT_MIXED` | warning | `atoms/` and root atom families together. |
| `FORMAT_VERSION_NEWER` | warning | `formatVersion` has a major above the reader's. |
| `APP_ENTRY_NOT_IN_ORDER` | warning | `app.entry` is not listed in `app.surfaceOrder`. §2 rule 3: a producer MUST list it; a reader tolerates it and still opens the app on its entry page. |
| `APP_SURFACE_DUPLICATE` | warning | `app.surfaceOrder` lists a key more than once. |
| `APP_UNEXPECTED_FILE` | warning | A file under `app/surfaces/` that is not `<key>.receipt.json`, or under `app/media/` that is not `<key>.json`. |
| `MEDIA_HASH_MISMATCH` | warning | A media file's bytes disagree with the `sha256:` hash its provenance records. |
| `MEDIA_UNDECLARED` | warning | A file under `media/` without an entry in a valid `media/provenance.json`. Not reported when the record is itself invalid (`MEDIA_PROVENANCE_INVALID` covers it). |
| `LEGACY_PACKAGE_JSON` | info | A `package.json` at the root (not an identity file, §1 rule 2; not pack content, §1.2). |
| `DOC_FILE` | info | A Markdown file directly in `atoms/` or in an atom-family directory: documentation, not an atom (§1.2). |

The atoms a fixture lists are `{ kind, id }` per §1.1, one per `kind:id`,
sorted by kind and then id in UTF-8 byte order.

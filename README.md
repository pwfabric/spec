# PWFabric formats

This repository specifies the file formats and wire protocols of the PWFabric
engine on their own terms. A pack, an app or a host written against these
documents should interoperate with the reference engine without reading its
source.

Each format has a document (`<name>.md`) and, where the format is data, a JSON
Schema (`schemas/<name>.schema.json`, JSON Schema 2020-12). Valid and invalid
examples live in `examples/<schema>/{valid,invalid}/`.

## The formats

| Document | Status | What it covers |
|---|---|---|
| [pwpack-format](pwpack-format.md) | stable | The pwpack folder, `pwpack.json`, atom paths, the deterministic `.pwpack` archive |
| [pwapp-format](pwapp-format.md) | draft | A published app: the served folder, its shell, import map and runtime files, `publish.json` |
| [block-manifest](block-manifest.md) | stable | The manifest beside every block atom |
| [capability-manifest](capability-manifest.md) | stable | The manifest beside every capability atom |
| [connector-manifest](connector-manifest.md) | draft | Connector and provider atoms, and the engine declaration |
| [appearance](appearance.md) | stable | Theme tokens, the dark variant, mode policy and contrast rules |
| [receipt](receipt.md) | draft | A page: `*.receipt.json` |
| [plan](plan.md) | draft | `app/plan.json` |
| [definitions](definitions.md) | draft | `app/definitions/*.json`: appearance, navigation, connections, entities, auth |
| [envelope](envelope.md) | stable | The files a runner reads to run an app |
| [session-protocol](session-protocol.md) | draft | How a running app signs its visitors in and keeps the session |
| [data-protocol](data-protocol.md) | draft | How a running app reads and writes data |
| [hosting-security](hosting-security.md) | draft | What a host must do so an app's code stays inside the app: the origin, the Content Security Policy, the session |

**stable** means the format is implemented, exercised by the reference
engine's tests and by the examples here, and changes only by a new
`formatVersion`. **draft** means the document describes what implementations do
today but a part of it is still moving; each draft document says which part
and why.

## Conventions

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, MAY and OPTIONAL
are to be read as described in RFC 2119 and RFC 8174 when, and only when, they
appear in capitals.

A **reader** is any program that consumes a document; a **producer** writes
one. A **host** is the program that serves a published app to visitors. The
**session server** is the service that signs an app's visitors in and answers
its data requests; the reference engine does not ship one, it talks to one.

Every document carries `formatVersion` in its front matter. Versions are
`MAJOR.MINOR`: a minor version only adds optional fields and rules a reader of
the previous minor can ignore; a major version may remove or change meaning.
The version of a format is independent of the engine's package versions.

## Schemas: generated and hand-written

Where the reference engine defines a format with a zod schema (in the package
`@pwfabric/contracts`), the JSON Schema here is generated
from it by `scripts/generate-schemas.mjs` and committed. Rules the reference
schema states as code but JSON Schema can express declaratively are added by
the generator (`scripts/sources.mjs`); rules neither can express are written in
the document under **Rules beyond the schema**.

Where no reference schema exists, the JSON Schema is hand-written from the
engine's behaviour and the document says so.

## Running the conformance tests

```sh
pnpm install
pnpm test
```

The test (`test/conformance.test.mjs`) checks that every example is accepted or
refused as its folder says by the JSON Schema. When `@pwfabric/contracts`
(the reference engine's contracts package, from
[pwfabric/pwfabric](https://github.com/pwfabric/pwfabric)) can be imported from
here, `test/reference.test.mjs` also checks each example against the reference
schema — a disagreement between the two fails — and that the generated schemas
on disk equal what the generator produces now; without it those checks are
skipped. After changing a reference schema, run `pnpm generate`.

## Byte-level fixtures and round-trip apps

`fixtures/` holds byte-level conformance fixtures for
[pwpack-format](pwpack-format.md): pwpack folders and archives (hostile ones as
base64), each with the verdict, codes, content hash and atoms a conforming
implementation must produce. `roundtrip/` holds three small apps (static, with
a custom block, with data and sign-in) and the fixture pack they pin, for the
export → import → export rule. `test/fixtures.test.mjs` checks their hashes and
pins with nothing but Node; it runs with the tests above.

An implementation's verdicts are checked by a runner in the engine repository
(`node scripts/spec-conformance.mjs`, with this repository cloned into its
`spec/` folder), which any other implementation can use through a small
adapter. See [fixtures/README.md](fixtures/README.md) and
[roundtrip/README.md](roundtrip/README.md). The expected values are generated
by the reference pack library with `node scripts/build-fixtures.mjs` (which
needs `@pwfabric/pack` built beside it) and committed.

## Licence

Apache License 2.0 — see [LICENSE](LICENSE).

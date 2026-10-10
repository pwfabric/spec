#!/usr/bin/env node
/**
 * Generates the expected results of the byte-level conformance fixtures.
 *
 *   fixtures/pwpack/<case>/expected.json          from fixtures/pwpack/<case>/input/
 *   fixtures/pwpack-archives/<case>.pwpack.b64     hand-built archives (hostile and tolerated)
 *   fixtures/pwpack-archives/<case>.expected.json
 *   roundtrip/<app>/expected.json                  from roundtrip/<app>/input/
 *   roundtrip/<app>/input/pwpack.json  `packs[]`    pins recomputed from roundtrip/_foundation
 *
 * The `input/` folders are written by hand and committed; this script only
 * computes what a conforming implementation must answer for them, by running
 * the reference pack library. It therefore runs where that library is built
 * (the engine repository), not in the standalone spec:
 *
 *   node scripts/build-fixtures.mjs [--pack <path to the pack library's index.js>] [--check]
 *
 * Default `--pack` is the engine repository's `packages/pack/dist/index.js`.
 * When the library cannot be loaded the script says so and exits 0 without
 * writing anything. `--check` writes nothing and exits 1 when a committed
 * file differs from what would be written.
 *
 * Archive fixtures are built here with a deliberately tiny tar writer that
 * can say what a conforming producer never would (`..` names, links, FIFOs,
 * wrong checksums), so no hostile path ever exists as a real file.
 *
 * Node built-ins only.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const SPEC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FORMAT = { format: 'pwpack-format', formatVersion: '1.0' }
const FOUNDATION_ID = '@pwpack/fixture/foundation'

// ---------------------------------------------------------------------------
// Arguments and the reference library
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const argValue = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const CHECK = args.includes('--check')
const packPath = resolve(argValue('--pack') ?? join(SPEC_ROOT, '..', 'packages', 'pack', 'dist', 'index.js'))

let pack
try {
  pack = await import(pathToFileURL(packPath).href)
} catch (err) {
  console.log(`build-fixtures: skipped — the reference pack library is not loadable at ${packPath}`)
  console.log(`  (${String(err?.message ?? err).split('\n')[0]})`)
  console.log('  Build it (pnpm --filter @pwfabric/pack build) or pass --pack <path>.')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex')
const json = (value) => JSON.stringify(value, null, 2) + '\n'
const uniqueSorted = (codes) => [...new Set(codes)].sort()

let drift = 0
function emit(path, content) {
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content)
  const current = existsSync(path) ? readFileSync(path) : null
  if (current && current.equals(bytes)) return
  if (CHECK) {
    drift++
    console.log(`differs: ${path}`)
    return
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, bytes)
  console.log(`wrote ${path}`)
}

/** Validation verdict, reduced to what the fixtures pin: sorted unique codes per severity. */
function verdict(folder) {
  const v = pack.validatePack(folder)
  const of = (severity) => uniqueSorted(v.issues.filter((i) => i.severity === severity).map((i) => i.code))
  return {
    valid: v.ok,
    errors: of('error'),
    warnings: of('warning'),
    info: of('info'),
    layout: v.layout,
  }
}

const atomsOf = (folder) => pack.deriveAtoms(folder).map(({ kind, id }) => ({ kind, id }))

async function describeFolder(folder) {
  const v = verdict(folder)
  let archiveSha256 = null
  try {
    archiveSha256 = `sha256:${sha256Hex(await pack.writePwpack(folder))}`
  } catch {
    archiveSha256 = null
  }
  return {
    ...v,
    files: folder.files.size,
    contentHash: pack.hashPack(folder),
    archiveSha256,
    atoms: atomsOf(folder),
  }
}

// ---------------------------------------------------------------------------
// 1. Folder cases
// ---------------------------------------------------------------------------

const FOLDER_CASES = {
  minimal: 'The smallest valid pack: pwpack.json and one block atom.',
  'app-entry-surface-order': 'An app: app.entry and app.surfaceOrder, each key with its receipt.',
  'app-surface-missing':
    'An app whose entry and one listed page have no receipt, whose entry is not in the order, which lists a page twice, and which carries a non-receipt file under app/surfaces/.',
  'every-atom-family':
    'One file of every classified kind, plus inert cargo (README, connector engine source, an unknown auth method), shared code and tests.',
  'rootless-legacy-layout': 'Atom families at the root (the pre-atoms/ layout) and a legacy package.json.',
  'mixed-layout-duplicate-atom':
    'Both layouts at once; the same block from two directories; an unknown atom family; a stray top-level file.',
  'requires-object': 'requires in the object form { id, range }.',
  'requires-bare-name': 'requires as a bare pack name (older files).',
  'identity-missing': 'No pwpack.json.',
  'identity-invalid': 'pwpack.json that parses but breaks the schema (empty id, numeric version, bad formatVersion, unparsable engines range).',
  'identity-not-json': 'pwpack.json that is not JSON.',
  'format-version-newer': 'A pack declaring a newer major formatVersion, with an unknown member (ignored).',
  'json-invalid': 'A receipt under app/ that is not JSON (error) and an atom JSON file that is not JSON (warning).',
  'media-provenance-valid': 'media/ with a provenance record whose hash matches.',
  'media-provenance-invalid': 'media/provenance.json that breaks its schema (unknown source, bad timestamp).',
  'media-provenance-mismatch': 'Provenance naming a file the pack lacks, a wrong hash, and a media file without provenance.',
  'media-declarations':
    'An app with media declarations under app/media/: one naming its bytes in media/ (recorded in provenance), one pending without bytes.',
  'media-legacy-assets-folder': 'Declarations and bytes under app/assets/, which is not part of the format: every file there is an error and nothing is read.',
  'media-file-missing':
    'A declaration whose file is not under media/, and one whose file is there but has no provenance entry.',
  'media-declaration-invalid': 'Declarations that break their schema (unknown kind, a file climbing out of media/), and bytes under app/media/.',
  'crlf-preserved': 'Files with CRLF line endings: bytes are hashed and packed exactly as they are, never converted.',
  'long-path-pax': 'A path no ustar name/prefix split can hold; the archive carries it in a PAX path record.',
  'utf8-names-byte-order': 'Upper-case, lower-case and non-ASCII names: ordering is by UTF-8 bytes, not locale.',
  'source-with-tooling':
    'The minimal case as an author’s source folder: package.json, tsconfig.json, vitest.config.ts, scripts/ and test/ beside it. None of it is pack content, so the content hash equals minimal’s.',
}

const fixturesDir = join(SPEC_ROOT, 'fixtures', 'pwpack')
const onDisk = readdirSync(fixturesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
for (const name of onDisk) {
  if (!(name in FOLDER_CASES)) throw new Error(`fixtures/pwpack/${name} has no description in build-fixtures.mjs`)
}
const caseHashes = {}
for (const [name, description] of Object.entries(FOLDER_CASES)) {
  const folder = await pack.readFolder(join(fixturesDir, name, 'input'))
  const d = await describeFolder(folder)
  caseHashes[name] = d.contentHash
  emit(join(fixturesDir, name, 'expected.json'), json({ case: name, ...FORMAT, description, ...d }))
}

// ---------------------------------------------------------------------------
// 2. Archive cases
// ---------------------------------------------------------------------------

const BLOCK = 512
const enc = new TextEncoder()

/** One tar header. Fields default to what a conforming producer writes. */
function tarHeader({ name, size = 0, type = '0', mode = 0o644, prefix = '', linkname = '', magic = 'ustar\0', version = '00', mtime = 0, breakChecksum = false, base256Size = false }) {
  const h = new Uint8Array(BLOCK)
  const put = (s, off, len) => h.set(enc.encode(s).subarray(0, len), off)
  const oct = (v, off, width) => put(v.toString(8).padStart(width - 1, '0') + '\0', off, width)
  put(name, 0, 100)
  oct(mode, 100, 8)
  oct(0, 108, 8)
  oct(0, 116, 8)
  if (base256Size) {
    h[124] = 0x80
    h[135] = 1
  } else oct(size, 124, 12)
  oct(mtime, 136, 12)
  put('        ', 148, 8)
  put(type, 156, 1)
  put(linkname, 157, 100)
  put(magic, 257, 6)
  put(version, 263, 2)
  if (prefix) put(prefix, 345, 155)
  let sum = 0
  for (const b of h) sum += b
  if (breakChecksum) sum += 1
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8)
  return h
}

const pad = (n) => new Uint8Array(n % BLOCK === 0 ? 0 : BLOCK - (n % BLOCK))

/**
 * A tar from a list of members: `{ name, data?, type?, ...headerFields }`,
 * `{ pax: '<path>' }` (a PAX `x` record for the next member) or
 * `{ gnuLongName: '<path>' }` (a GNU `L` record for the next member).
 */
function tar(members, { end = true } = {}) {
  const chunks = []
  for (const m of members) {
    if (m.pax !== undefined) {
      const body = ` path=${m.pax}\n`
      let len = enc.encode(body).length + 1
      while (enc.encode(`${len}${body}`).length !== len) len = enc.encode(`${len}${body}`).length
      const data = enc.encode(`${len}${body}`)
      chunks.push(tarHeader({ name: 'PaxHeader', size: data.length, type: 'x' }), data, pad(data.length))
      continue
    }
    if (m.gnuLongName !== undefined) {
      const data = enc.encode(`${m.gnuLongName}\0`)
      chunks.push(tarHeader({ name: '././@LongLink', size: data.length, type: 'L' }), data, pad(data.length))
      continue
    }
    const data = m.data === undefined ? new Uint8Array(0) : typeof m.data === 'string' ? enc.encode(m.data) : m.data
    const declared = m.size ?? data.length
    chunks.push(tarHeader({ ...m, size: declared }))
    if (data.length) chunks.push(data, pad(data.length))
  }
  if (end) chunks.push(new Uint8Array(BLOCK * 2))
  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
}

const gz = (bytes) => {
  const out = gzipSync(bytes, { level: 9 })
  out[9] = 3
  return out
}

/** The minimal folder case, as tar members (files only, byte order). */
const minimalFolder = await pack.readFolder(join(fixturesDir, 'minimal', 'input'))
const minimalMembers = (rename = (p) => p) =>
  [...minimalFolder.files.keys()].sort(pack.compareBytes).map((p) => ({ name: rename(p), data: minimalFolder.files.get(p) }))
const identity = enc.encode(json({ id: '@pwpack/fixture/archive', version: '1.0.0', formatVersion: '1.0' }))
const withIdentity = (...members) => [{ name: 'pwpack.json', data: identity }, ...members]
const zeros = (n) => new Uint8Array(n)
const MiB = 1024 * 1024

const ARCHIVE_CASES = {
  // ---- refused: unsafe paths ----
  'unsafe-parent-segment': ['A member named ../evil.txt.', () => gz(tar(withIdentity({ name: '../evil.txt', data: 'x' })))],
  'unsafe-nested-parent': ['A member whose path climbs out midway: atoms/../../evil.txt.', () => gz(tar(withIdentity({ name: 'atoms/../../evil.txt', data: 'x' })))],
  'unsafe-absolute': ['An absolute member name.', () => gz(tar(withIdentity({ name: '/etc/evil.txt', data: 'x' })))],
  'unsafe-backslash': ['A member name with backslashes.', () => gz(tar(withIdentity({ name: 'atoms\\..\\evil.txt', data: 'x' })))],
  'unsafe-drive-letter': ['A drive-qualified member name.', () => gz(tar(withIdentity({ name: 'C:/evil.txt', data: 'x' })))],
  'unsafe-empty-segment': ['A member name with an empty segment.', () => gz(tar(withIdentity({ name: 'atoms//patterns/x.json', data: '{}' })))],
  'unsafe-directory-entry': ['A directory member named ../up/.', () => gz(tar(withIdentity({ name: '../up/', type: '5', mode: 0o755 })))],
  'unsafe-ustar-prefix': ['An innocent name whose ustar prefix field is ../..', () => gz(tar(withIdentity({ name: 'evil.txt', prefix: '../..', data: 'x' })))],
  'unsafe-pax-path': ['An innocent ustar name overridden by a PAX path record ../pax-evil.txt.', () => gz(tar(withIdentity({ pax: '../pax-evil.txt' }, { name: 'innocent.txt', data: 'x' })))],
  'unsafe-gnu-longname': ['An innocent ustar name overridden by a GNU long name ../gnu-evil.txt.', () => gz(tar(withIdentity({ gnuLongName: '../gnu-evil.txt' }, { name: 'innocent.txt', data: 'x' })))],
  // ---- refused: members that are not files ----
  'symlink-entry': ['A symbolic-link member.', () => gz(tar(withIdentity({ name: 'atoms/passwd', type: '2', linkname: '/etc/passwd' })))],
  'hardlink-entry': ['A hard-link member.', () => gz(tar(withIdentity({ name: 'atoms/copy.json', type: '1', linkname: 'pwpack.json' })))],
  'fifo-entry': ['A FIFO member.', () => gz(tar(withIdentity({ name: 'atoms/pipe', type: '6' })))],
  'char-device-entry': ['A character-device member.', () => gz(tar(withIdentity({ name: 'atoms/tty', type: '3' })))],
  'duplicate-entry': ['The same path twice.', () => gz(tar(withIdentity({ name: 'pwpack.json', data: identity })))],
  'path-conflict': [
    'atoms/lib/x is a file and also the directory of atoms/lib/x/y.ts: no file system can hold both.',
    () => gz(tar(withIdentity({ name: 'atoms/lib/x', data: 'x' }, { name: 'atoms/lib/x/y.ts', data: 'export {}\n' }))),
  ],
  'duplicate-after-unwrap': [
    'Every member under package/, two of them naming the same path once the wrapper is removed (one via ./).',
    () => gz(tar([{ name: 'package/pwpack.json', data: identity }, { name: './package/pwpack.json', data: identity }])),
  ],
  // ---- refused: malformed streams ----
  'not-an-archive': ['Bytes that are neither gzip nor tar.', () => Buffer.from('this is not an archive\n')],
  'truncated-gzip': ['A gzip stream cut in half.', () => {
    const full = gz(tar(minimalMembers()))
    return full.subarray(0, Math.floor(full.length / 2))
  }],
  'bad-checksum': ['A header whose checksum is off by one.', () => gz(tar([{ name: 'pwpack.json', data: identity, breakChecksum: true }]))],
  'truncated-entry': ['A member declaring more bytes than the stream holds.', () => gz(tar([{ name: 'pwpack.json', data: identity, size: 4096 }], { end: false }))],
  'non-octal-size': ['A header whose size field is not an octal number.', () => {
    const t = tar(withIdentity())
    t.set(enc.encode('00000000009\0'), 124)
    let sum = 0
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : t[i]
    t.set(enc.encode(sum.toString(8).padStart(6, '0') + '\0 '), 148)
    return gz(t)
  }],
  // ---- refused: limits (reference defaults) ----
  'base256-size': ['A size field in base-256 encoding (a value past the octal range).', () => gz(tar([{ name: 'big.bin', base256Size: true }], { end: false }))],
  'entry-too-large': ['One file of 20 MiB + 1 byte.', () => gz(tar(withIdentity({ name: 'media/big.bin', data: zeros(20 * MiB + 1) })))],
  'too-many-entries': ['5001 members.', () => gz(tar(withIdentity(...Array.from({ length: 5000 }, (_, i) => ({ name: `atoms/lib/f${String(i).padStart(4, '0')}.ts`, data: '' })))))],
  'total-too-large': ['Three files of 17 MiB: 51 MiB of files in total.', () => gz(tar(withIdentity(...[1, 2, 3].map((i) => ({ name: `media/part${i}.bin`, data: zeros(17 * MiB) })))))],
  // ---- accepted: layouts existing producers emit ----
  'package-wrapper': ['The minimal case with every member under package/ (removed on read).', () => gz(tar(minimalMembers((p) => `package/${p}`)))],
  'partial-wrapper': ['Only some members under package/: the wrapper is kept as an ordinary directory.', () => gz(tar([...minimalMembers(), { name: 'package/extra.txt', data: 'x\n' }]))],
  'dot-slash-prefix': ['The minimal case with ./ in front of every member, plus directory entries.', () =>
    gz(tar([{ name: './', type: '5', mode: 0o755 }, ...minimalMembers((p) => `./${p}`)]))],
  'bare-tar': ['The minimal case as an uncompressed tar.', () => tar(minimalMembers())],
  'any-mode-and-mtime': ['The minimal case with executable modes and real mtimes (ignored on read).', () => {
    const t = tar(minimalMembers().map((m, i) => ({ ...m, mode: 0o755, mtime: 1759000000 + i })))
    return gz(t)
  }],
  'old-gnu-magic': ['The minimal case with the old GNU magic ("ustar  "), whose prefix bytes are not a prefix.', () =>
    gz(tar(minimalMembers().map((m) => ({ ...m, magic: 'ustar ', version: ' \0' }))))],
  'gnu-longname-accepted': ['A long path carried in a GNU long-name record.', () =>
    gz(tar([...minimalMembers(), { gnuLongName: `atoms/lib/${'n'.repeat(120)}.ts` }, { name: 'atoms/lib/short.ts', data: 'export {}\n' }]))],
  'reference-long-path': ['The long-path-pax case as the reference writer packs it (PAX path record).', async () =>
    Buffer.from(await pack.writePwpack(await pack.readFolder(join(fixturesDir, 'long-path-pax', 'input')))),
  ],
  'case-conflict': [
    'atoms/patterns/Hero.json and atoms/patterns/hero.json: distinct paths (accepted), one file on a case-insensitive file system (warned).',
    () => gz(tar(withIdentity({ name: 'atoms/patterns/Hero.json', data: '{}\n' }, { name: 'atoms/patterns/hero.json', data: '{}\n' }))),
  ],
  'no-identity': ['A readable archive without pwpack.json: opened, then refused by validation.', () =>
    gz(tar(minimalMembers().filter((m) => m.name !== 'pwpack.json')))],
}

const LIMIT_CASES = new Set(['base256-size', 'entry-too-large', 'too-many-entries', 'total-too-large'])

const archivesDir = join(SPEC_ROOT, 'fixtures', 'pwpack-archives')
for (const [name, [description, build]] of Object.entries(ARCHIVE_CASES)) {
  const bytes = Buffer.from(await build())
  const b64 = bytes.toString('base64').replace(/.{1,76}/g, '$&\n')
  emit(join(archivesDir, `${name}.pwpack.b64`), b64)
  const base = { case: name, ...FORMAT, description, archiveSha256: `sha256:${sha256Hex(bytes)}` }
  if (LIMIT_CASES.has(name)) base.limits = 'reference-defaults'
  let folder
  try {
    folder = await pack.readPwpack(new Uint8Array(bytes))
  } catch (err) {
    if (!err?.code) throw err
    emit(join(archivesDir, `${name}.expected.json`), json({ ...base, stage: 'read', valid: false, errors: [err.code], warnings: [], info: [], contentHash: null, atoms: [] }))
    continue
  }
  const v = verdict(folder)
  emit(
    join(archivesDir, `${name}.expected.json`),
    json({ ...base, stage: 'validate', valid: v.valid, errors: v.errors, warnings: v.warnings, info: v.info, layout: v.layout, files: folder.files.size, contentHash: pack.hashPack(folder), atoms: atomsOf(folder) })
  )
}

// ---------------------------------------------------------------------------
// 3. Round-trip apps (and their pinned foundation)
// ---------------------------------------------------------------------------

const ROUNDTRIP = {
  _foundation: 'The fixture foundation pack the round-trip apps pin: three blocks and one theme.',
  'l1-static': 'L1 — a static two-page app on the foundation: receipts, appearance, navigation.',
  'l2-custom-block': 'L2 — one page that uses the app\u2019s own block (atoms/blocks/custom/greeting).',
  'l3-data': 'L3 — an entity, sign-in and seed records declared under app/, a data-bound page.',
}
const rtDir = join(SPEC_ROOT, 'roundtrip')
const foundation = await pack.readFolder(join(rtDir, '_foundation', 'input'))
const foundationHash = pack.hashPack(foundation)
const foundationVersion = pack.validatePack(foundation).identity?.version

for (const [name, description] of Object.entries(ROUNDTRIP)) {
  const input = join(rtDir, name, 'input')
  if (name !== '_foundation') {
    const idPath = join(input, 'pwpack.json')
    const doc = JSON.parse(readFileSync(idPath, 'utf8'))
    doc.packs = (doc.packs ?? []).map((p) => (p.id === FOUNDATION_ID ? { ...p, version: foundationVersion, hash: foundationHash } : p))
    emit(idPath, json(doc))
  }
  // Re-read after the pin is written so the expected hash covers it (in --check mode the pin may differ; drift is reported above).
  const folder = await pack.readFolder(input)
  const d = await describeFolder(folder)
  const out = { case: name, ...FORMAT, description, ...d }
  if (name !== '_foundation') out.pins = [{ id: FOUNDATION_ID, version: foundationVersion, hash: foundationHash, from: '_foundation' }]
  emit(join(rtDir, name, 'expected.json'), json(out))
}

if (CHECK && drift > 0) {
  console.log(`build-fixtures: ${drift} file(s) differ from what the reference library produces`)
  process.exit(1)
}
console.log(`build-fixtures: ${Object.keys(FOLDER_CASES).length} folder cases, ${Object.keys(ARCHIVE_CASES).length} archive cases, ${Object.keys(ROUNDTRIP).length} round-trip folders`)

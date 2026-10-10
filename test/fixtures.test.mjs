/**
 * The byte-level fixtures, checked with the spec alone (Node built-ins).
 *
 * 1. Every fixture folder (fixtures/pwpack/<case>/input, roundtrip/<app>/input)
 *    has the content hash its expected.json states — computed here from the
 *    rule of pwpack-format §3.3, not by any implementation.
 * 2. Every round-trip app pins the fixture foundation by its content hash.
 * 3. Every archive fixture decodes to the bytes its expected.json identifies.
 * 4. Every expected.json is well-formed and uses only the codes
 *    pwpack-format §Conformance documents.
 *
 * Whether an implementation gives these verdicts is checked by the engine's
 * conformance runner (see fixtures/README.md), not here.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SPEC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = join(SPEC_ROOT, 'fixtures', 'pwpack')
const ARCHIVES = join(SPEC_ROOT, 'fixtures', 'pwpack-archives')
const ROUNDTRIP = join(SPEC_ROOT, 'roundtrip')

// ---- pwpack-format §3.3, from the document ----
const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex')
const byteOrder = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))

function filesOf(dir, rel = '') {
  const out = []
  for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const path = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...filesOf(dir, path))
    else out.push(path)
  }
  return out
}

// pwpack-format §1.2: the pack content, the only files the content hash covers.
const PACK_ROOT_FILES = new Set(['pwpack.json', 'LICENSE', 'NOTICE', 'README.md'])
const PACK_ROOT_DIRS = new Set(['app', 'atoms', 'media', 'blocks', 'capabilities', 'connectors', 'providers', 'appearance', 'patterns', 'icons', 'surfaces', 'auth', 'lib'])
function isPackContent(path) {
  const slash = path.indexOf('/')
  return slash === -1 ? PACK_ROOT_FILES.has(path) : PACK_ROOT_DIRS.has(path.slice(0, slash))
}

function contentHash(dir) {
  const lines = filesOf(dir)
    .filter(isPackContent)
    .sort(byteOrder)
    .map((path) => `${path}\0${sha256Hex(readFileSync(join(dir, path)))}\n`)
  return `sha256:${sha256Hex(Buffer.from(lines.join(''), 'utf8'))}`
}

// ---- the normative code list, read from pwpack-format §Conformance ----
const formatDoc = readFileSync(join(SPEC_ROOT, 'pwpack-format.md'), 'utf8').replace(/\r\n/g, '\n')
const codesSection = formatDoc.slice(formatDoc.indexOf('### Codes'))
const DOCUMENTED = { read: new Set(), error: new Set(), warning: new Set(), info: new Set() }
const readTable = codesSection.slice(0, codesSection.indexOf('**Validation codes**'))
for (const [, code] of readTable.matchAll(/^\| `([A-Z_]+)` \|/gm)) DOCUMENTED.read.add(code)
for (const [, code, severity] of codesSection.matchAll(/^\| `([A-Z_]+)` \| (error|warning|info) \|/gm)) DOCUMENTED[severity].add(code)

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const dirsIn = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

const HASH = /^sha256:[0-9a-f]{64}$/
const isSortedUnique = (list) => list.every((v, i) => i === 0 || byteOrder(list[i - 1], v) < 0)

function checkShape(e, name) {
  expect(e.case).toBe(name)
  expect(e.format).toBe('pwpack-format')
  expect(e.formatVersion).toMatch(/^\d+\.\d+$/)
  expect(typeof e.description).toBe('string')
  expect(typeof e.valid).toBe('boolean')
  for (const key of ['errors', 'warnings', 'info']) {
    expect(Array.isArray(e[key]), `${key} is an array`).toBe(true)
    expect(isSortedUnique(e[key]), `${key} is sorted, each code once`).toBe(true)
  }
  expect(e.valid).toBe(e.errors.length === 0)
  expect(Array.isArray(e.atoms)).toBe(true)
  for (const atom of e.atoms) {
    expect(typeof atom.kind).toBe('string')
    expect(typeof atom.id).toBe('string')
  }
  const keys = e.atoms.map((a) => `${a.kind}\0${a.id}`)
  expect(isSortedUnique(keys), 'atoms sorted by kind then id, each once').toBe(true)
}

function checkValidationCodes(e) {
  for (const code of e.errors) expect(DOCUMENTED.error, `error code ${code} is documented`).toContain(code)
  for (const code of e.warnings) expect(DOCUMENTED.warning, `warning code ${code} is documented`).toContain(code)
  for (const code of e.info) expect(DOCUMENTED.info, `info code ${code} is documented`).toContain(code)
}

describe('the code list in pwpack-format §Conformance', () => {
  it('documents read codes and every severity of validation code', () => {
    expect(DOCUMENTED.read.size).toBeGreaterThan(5)
    expect(DOCUMENTED.error.size).toBeGreaterThan(5)
    expect(DOCUMENTED.warning.size).toBeGreaterThan(5)
    expect(DOCUMENTED.info.size).toBeGreaterThan(0)
  })
})

describe('the content hash rule', () => {
  it('hashes the empty folder as the SHA-256 of nothing', () => {
    const lines = []
    expect(`sha256:${sha256Hex(Buffer.from(lines.join('')))}`).toBe(
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })
  it('orders by UTF-8 bytes, not by locale', () => {
    expect(['éclair', 'alpha', 'Zeta', '日本'].sort(byteOrder)).toEqual(['Zeta', 'alpha', 'éclair', '日本'])
  })
})

describe('folder fixtures (fixtures/pwpack)', () => {
  const cases = dirsIn(FIXTURES)
  it('exist', () => expect(cases.length).toBeGreaterThan(10))

  for (const name of cases) {
    describe(name, () => {
      const dir = join(FIXTURES, name)
      const expectedPath = join(dir, 'expected.json')
      it('has input/ and expected.json', () => {
        expect(existsSync(join(dir, 'input'))).toBe(true)
        expect(existsSync(expectedPath)).toBe(true)
      })
      it('has a well-formed expected.json with documented codes', () => {
        const e = readJson(expectedPath)
        checkShape(e, name)
        checkValidationCodes(e)
        expect(e.files).toBe(filesOf(join(dir, 'input')).length)
        expect(e.contentHash).toMatch(HASH)
        if (e.archiveSha256 !== null) expect(e.archiveSha256).toMatch(HASH)
      })
      it('has the content hash expected.json states', () => {
        expect(contentHash(join(dir, 'input'))).toBe(readJson(expectedPath).contentHash)
      })
    })
  }

  it('crlf-preserved still carries CRLF (the checkout did not convert it)', () => {
    const bytes = readFileSync(join(FIXTURES, 'crlf-preserved', 'input', 'atoms', 'patterns', 'crlf.json'), 'latin1')
    expect(bytes).toContain('\r\n')
  })

  it('long-path-pax has a path no ustar name/prefix split can hold', () => {
    const paths = filesOf(join(FIXTURES, 'long-path-pax', 'input'))
    const unsplittable = (p) =>
      Buffer.byteLength(p) > 100 &&
      ![...p].some((ch, i) => ch === '/' && Buffer.byteLength(p.slice(0, i)) <= 155 && Buffer.byteLength(p.slice(i + 1)) <= 100 && i + 1 < p.length)
    expect(paths.some(unsplittable)).toBe(true)
  })
})

describe('archive fixtures (fixtures/pwpack-archives)', () => {
  const names = readdirSync(ARCHIVES)
    .filter((f) => f.endsWith('.pwpack.b64'))
    .map((f) => f.slice(0, -'.pwpack.b64'.length))
    .sort()
  it('exist, each with its expected.json', () => {
    expect(names.length).toBeGreaterThan(10)
    const expected = readdirSync(ARCHIVES).filter((f) => f.endsWith('.expected.json'))
    expect(expected.length).toBe(names.length)
  })

  const minimal = readJson(join(FIXTURES, 'minimal', 'expected.json')).contentHash

  for (const name of names) {
    it(`${name}: well-formed, documented codes, bytes as identified`, () => {
      const e = readJson(join(ARCHIVES, `${name}.expected.json`))
      checkShape(e, name)
      const bytes = Buffer.from(readFileSync(join(ARCHIVES, `${name}.pwpack.b64`), 'utf8').replace(/\s+/g, ''), 'base64')
      expect(`sha256:${sha256Hex(bytes)}`).toBe(e.archiveSha256)
      expect(['read', 'validate']).toContain(e.stage)
      if (e.stage === 'read') {
        expect(e.valid).toBe(false)
        expect(e.errors).toHaveLength(1)
        expect(DOCUMENTED.read, `read code ${e.errors[0]} is documented`).toContain(e.errors[0])
        expect(e.contentHash).toBeNull()
        expect(e.atoms).toEqual([])
      } else {
        checkValidationCodes(e)
        expect(e.contentHash).toMatch(HASH)
      }
    })
  }

  it('reads every tolerated framing of the minimal pack to the minimal content hash', () => {
    for (const name of ['package-wrapper', 'dot-slash-prefix', 'bare-tar', 'old-gnu-magic', 'any-mode-and-mtime']) {
      expect(readJson(join(ARCHIVES, `${name}.expected.json`)).contentHash, name).toBe(minimal)
    }
  })
})

describe('round-trip apps (roundtrip)', () => {
  const apps = dirsIn(ROUNDTRIP)
  const foundation = readJson(join(ROUNDTRIP, '_foundation', 'expected.json'))

  it('has the foundation and the three levels', () => {
    expect(apps).toEqual(['_foundation', 'l1-static', 'l2-custom-block', 'l3-data'])
  })

  for (const name of apps) {
    describe(name, () => {
      const dir = join(ROUNDTRIP, name)
      const e = readJson(join(dir, 'expected.json'))
      it('is valid, with a well-formed expected.json', () => {
        checkShape(e, name)
        checkValidationCodes(e)
        expect(e.valid).toBe(true)
        expect(e.errors).toEqual([])
        expect(e.warnings).toEqual([])
      })
      it('has the content hash expected.json states', () => {
        expect(contentHash(join(dir, 'input'))).toBe(e.contentHash)
      })
      if (name !== '_foundation') {
        it('pins the fixture foundation by its content hash, and requires it', () => {
          const identity = readJson(join(dir, 'input', 'pwpack.json'))
          const fid = readJson(join(ROUNDTRIP, '_foundation', 'input', 'pwpack.json'))
          expect(identity.app?.surfaceOrder).toContain(identity.app?.entry)
          expect(identity.requires).toContainEqual({ id: fid.id, range: expect.any(String) })
          const pin = identity.packs.find((p) => p.id === fid.id)
          expect(pin).toEqual({ id: fid.id, version: fid.version, hash: foundation.contentHash })
          expect(e.pins).toEqual([{ id: fid.id, version: fid.version, hash: foundation.contentHash, from: '_foundation' }])
        })
      }
    })
  }

  it('l2-custom-block carries its own block', () => {
    const e = readJson(join(ROUNDTRIP, 'l2-custom-block', 'expected.json'))
    expect(e.atoms).toContainEqual({ kind: 'block', id: 'custom.greeting' })
  })

  it('l3-data declares an entity, sign-in and seed records', () => {
    const input = join(ROUNDTRIP, 'l3-data', 'input', 'app')
    expect(readJson(join(input, 'definitions', 'entities.json')).entities.length).toBeGreaterThan(0)
    expect(readJson(join(input, 'definitions', 'auth.json')).methods.length).toBeGreaterThan(0)
    expect(readJson(join(input, 'data', 'Product.json')).data.length).toBeGreaterThan(0)
  })
})

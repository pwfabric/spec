/**
 * The rules of an app's plan and project.json that no JSON Schema can state:
 * they compare one entry of the document with another. They are listed in
 * plan.md and envelope.md under the members they concern; this is that list
 * as code, so the conformance test can refuse an example that breaks one.
 * Zero dependencies.
 *
 *   planFindings(doc)     → [{ rule, message }]   empty = conforms
 *   envelopeFindings(doc) → [{ rule, message }]
 *
 * Only MUST rules are here.
 */

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** An exact origin, as a block's `definition.origins` entry (block-manifest, `origins`). */
const EXACT_ORIGIN = /^https?:\/\/(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:.]+\])(?::[0-9]{1,5})?$/

/**
 * envelope §2.2: `scripts[].key` is unique; the origin of `src` is an exact
 * https origin — what the URL parser makes of it, so a default port, a
 * userinfo or a wildcard cannot pass — so the policy, which allows that
 * origin in script-src, allows exactly what was validated.
 */
function scriptFindings(scripts, find) {
  if (!Array.isArray(scripts)) return
  const seen = new Set()
  scripts.forEach((s, i) => {
    if (!isObject(s)) return
    if (typeof s.key === 'string') {
      if (seen.has(s.key)) find('scriptKeyDuplicate', `scripts[${i}].key "${s.key}" is declared twice`)
      seen.add(s.key)
    }
    if (typeof s.src !== 'string') return
    let url
    try {
      url = new URL(s.src)
    } catch {
      find('scriptSrc', `scripts[${i}].src is not a URL`)
      return
    }
    if (url.protocol !== 'https:' || url.username || url.password || !EXACT_ORIGIN.test(url.origin) || !s.src.startsWith(`${url.origin}/`)) {
      find('scriptSrc', `scripts[${i}].src "${s.src}" is not an https address on an exact origin`)
      return
    }
  })
}

/** The page slot of a layout receipt (receipt §4). */
export const PAGE_SLOT = 'pw:page'

/**
 * receipt §4: a layout has exactly one page slot; the slot is a bare node
 * (`type`, and `id` at most) and is not inside a `repeat`.
 */
export function layoutFindings(doc) {
  const out = []
  const find = (rule, message) => out.push({ rule, message })
  if (!isObject(doc)) return [{ rule: 'document', message: 'not an object' }]
  let slots = 0
  const go = (n, path, inRepeat) => {
    if (!isObject(n)) return
    const repeated = inRepeat || typeof n.repeat === 'string'
    if (n.type === PAGE_SLOT) {
      slots++
      const extra = Object.keys(n).filter((k) => k !== 'type' && k !== 'id')
      if (extra.length) find('pageSlotNotBare', `${path} is the page slot and carries ${extra.join(', ')}`)
      if (inRepeat) find('pageSlotRepeated', `${path} is the page slot inside a repeat`)
    }
    if (Array.isArray(n.children)) n.children.forEach((c, i) => go(c, `${path}.children[${i}]`, repeated))
  }
  if (Array.isArray(doc.blocks)) doc.blocks.forEach((b, i) => go(b, `blocks[${i}]`, false))
  if (slots !== 1) find('pageSlotCount', `a layout has exactly one page slot; this one has ${slots}`)
  return out
}

/** The selectors a plural branch may carry (envelope §2.1). */
const PLURAL_SELECTOR = /^\s*(=\d+|zero|one|two|few|many|other)\s*\{/
const PLURAL_HEAD = /^\{\s*([A-Za-z_][\w]*)\s*,\s*plural\s*,/

/** Index of the `}` that closes the `{` at `open`, or -1. */
function closing(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return i
  }
  return -1
}

/**
 * The plural arguments of one message (envelope §2.1): each
 * `{arg, plural, <selector> {text} … }` has an `other` branch, only the CLDR
 * categories and `=N` as selectors, each once, balanced braces, and no plural
 * inside a branch. Returns the problems found, as text.
 */
export function pluralProblems(message) {
  const problems = []
  for (let i = 0; i < message.length; i++) {
    if (message[i] !== '{') continue
    const head = PLURAL_HEAD.exec(message.slice(i))
    if (!head) continue
    const end = closing(message, i)
    if (end === -1) {
      problems.push(`the plural of {${head[1]}} is not closed`)
      break
    }
    let rest = message.slice(i + head[0].length, end)
    const seen = new Set()
    while (rest.trim() !== '') {
      const sel = PLURAL_SELECTOR.exec(rest)
      if (!sel) {
        problems.push(`the plural of {${head[1]}} has a branch that is not <selector> {text}`)
        break
      }
      const open = sel[0].length - 1
      const close = closing(rest, open)
      if (close === -1) {
        problems.push(`the plural of {${head[1]}} has an unclosed branch "${sel[1]}"`)
        break
      }
      if (seen.has(sel[1])) problems.push(`the plural of {${head[1]}} has the branch "${sel[1]}" twice`)
      seen.add(sel[1])
      if (/\{\s*[A-Za-z_]\w*\s*,\s*plural\s*,/.test(rest.slice(open + 1, close))) {
        problems.push(`the plural of {${head[1]}} has a plural inside its branch "${sel[1]}"`)
      }
      rest = rest.slice(close + 1)
    }
    if (!seen.has('other')) problems.push(`the plural of {${head[1]}} has no "other" branch`)
    i = end
  }
  return problems
}

function messageFindings(messages, find) {
  if (!isObject(messages)) return
  for (const [id, text] of Object.entries(messages)) {
    if (typeof text !== 'string') continue
    for (const p of pluralProblems(text)) find('messagePlural', `messages["${id}"]: ${p}`)
  }
}

/** The address prefix of a locale (envelope §2.3): its tag in lower case, then `/`. */
export const localePrefix = (tag) => `${String(tag).toLowerCase()}/`

/**
 * envelope §2.3: `defaultLocale` is one of `locales`; with `locales` there is
 * no flat `messages` map (the words are per locale), and `locale`, when
 * present, is `defaultLocale`.
 */
function localeFindings(doc, find) {
  if (doc.locales === undefined && doc.defaultLocale === undefined) return
  const locales = Array.isArray(doc.locales) ? doc.locales : []
  if (!Array.isArray(doc.locales)) find('localesMissing', 'defaultLocale is set but locales is not')
  if (typeof doc.defaultLocale !== 'string') find('defaultLocaleMissing', 'locales is set but defaultLocale is not')
  else if (!locales.includes(doc.defaultLocale)) find('defaultLocaleUndeclared', `defaultLocale "${doc.defaultLocale}" is not one of locales`)
  const prefixes = new Map()
  for (const l of locales) {
    const p = localePrefix(l)
    if (prefixes.has(p)) find('localePrefixDuplicate', `locales "${prefixes.get(p)}" and "${l}" have the same address prefix ${p}`)
    prefixes.set(p, l)
  }
  if (doc.messages !== undefined) find('messagesFlatWithLocales', 'an app with locales keeps its words in messages/<lang>.json, not in a flat messages map')
  if (doc.locale !== undefined && doc.locale !== doc.defaultLocale) find('localeNotDefault', `locale "${doc.locale}" is not defaultLocale "${doc.defaultLocale}"`)
}

/**
 * envelope §2.3, the address table: `addresses` has every locale and, in each,
 * every page of `surfaceOrder`; an address is unique within its locale; a
 * non-default locale's addresses start with its prefix and the default's
 * with no locale's; the entry page is the locale's root.
 */
function addressFindings(doc, find) {
  if (!Array.isArray(doc.locales)) {
    if (doc.addresses !== undefined) find('addressesWithoutLocales', 'addresses is set but locales is not')
    return
  }
  const table = isObject(doc.addresses) ? doc.addresses : null
  if (!table) return find('addressesMissing', 'an app with locales carries its address table, addresses')
  const keys = Array.isArray(doc.surfaceOrder) ? doc.surfaceOrder : []
  const prefixes = doc.locales.map(localePrefix)
  for (const lang of doc.locales) {
    const row = isObject(table[lang]) ? table[lang] : null
    if (!row) {
      find('addressesLocaleMissing', `addresses has no row for "${lang}"`)
      continue
    }
    const prefix = lang === doc.defaultLocale ? '' : localePrefix(lang)
    const seen = new Map()
    for (const key of keys) {
      const address = row[key]
      if (typeof address !== 'string') {
        find('addressMissing', `addresses["${lang}"] has no address for the page "${key}"`)
        continue
      }
      if (seen.has(address)) find('addressConflict', `in "${lang}" the pages "${seen.get(address)}" and "${key}" share the address "${address}"`)
      seen.set(address, key)
      if (!address.startsWith(prefix)) find('addressPrefix', `addresses["${lang}"]["${key}"] "${address}" does not start with ${prefix}`)
      const rest = address.slice(prefix.length)
      if (rest !== '' && prefixes.includes(`${rest.split('/')[0]}/`)) {
        find('addressReservedSegment', `addresses["${lang}"]["${key}"] "${address}" starts its path with a locale prefix`)
      }
      if (key === doc.entrySurfaceId && address !== prefix) find('addressEntry', `the entry page's address in "${lang}" is "${prefix}", not "${address}"`)
    }
  }
}

export function planFindings(doc) {
  const out = []
  const find = (rule, message) => out.push({ rule, message })
  if (!isObject(doc)) return [{ rule: 'document', message: 'not an object' }]
  scriptFindings(doc.scripts, find)
  messageFindings(doc.messages, find)
  localeFindings(doc, find)
  return out
}

export function envelopeFindings(doc) {
  const out = []
  const find = (rule, message) => out.push({ rule, message })
  if (!isObject(doc)) return [{ rule: 'document', message: 'not an object' }]
  scriptFindings(doc.scripts, find)
  messageFindings(doc.messages, find)
  localeFindings(doc, find)
  addressFindings(doc, find)
  return out
}

/** appearance §3.3: a token set's `fonts` names each family once, each file once, and a weight range low to high. */
export function fontFindings(doc) {
  const out = []
  if (!isObject(doc) || !Array.isArray(doc.fonts)) return out
  const families = new Set()
  const files = new Set()
  doc.fonts.forEach((f, i) => {
    if (!isObject(f)) return
    if (typeof f.family === 'string') {
      const name = f.family.trim().toLowerCase()
      if (families.has(name)) out.push({ rule: 'fontFamilyDuplicate', message: `fonts[${i}].family "${f.family}" is listed twice` })
      families.add(name)
    }
    for (const file of Array.isArray(f.files) ? f.files : []) {
      if (!isObject(file) || typeof file.src !== 'string') continue
      if (files.has(file.src)) out.push({ rule: 'fontFileDuplicate', message: `fonts[${i}] names ${file.src}, which another face names too` })
      files.add(file.src)
      if (typeof file.weight === 'string') {
        const [lo, hi] = file.weight.split(' ').map(Number)
        if (lo > hi) out.push({ rule: 'fontWeightRange', message: `fonts[${i}] ${file.src}: the weight range "${file.weight}" runs high to low` })
      }
    }
  })
  return out
}

/** A per-locale message catalogue (`messages/<lang>.json`): its plurals are well formed. */
export function catalogueFindings(doc) {
  const out = []
  if (!isObject(doc)) return [{ rule: 'document', message: 'not an object' }]
  messageFindings(doc, (rule, message) => out.push({ rule, message }))
  return out
}

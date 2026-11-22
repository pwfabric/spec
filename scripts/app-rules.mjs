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
 * userinfo or a wildcard cannot pass — and is listed in `origins.script`, so
 * the policy allows exactly what was validated.
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
    const listed = Array.isArray(s.origins?.script) ? s.origins.script : []
    if (!listed.includes(url.origin)) find('scriptSrcOrigin', `scripts[${i}].src's origin ${url.origin} is not listed in its origins.script`)
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

export function planFindings(doc) {
  const out = []
  const find = (rule, message) => out.push({ rule, message })
  if (!isObject(doc)) return [{ rule: 'document', message: 'not an object' }]
  scriptFindings(doc.scripts, find)
  messageFindings(doc.messages, find)
  return out
}

export function envelopeFindings(doc) {
  const out = []
  const find = (rule, message) => out.push({ rule, message })
  if (!isObject(doc)) return [{ rule: 'document', message: 'not an object' }]
  scriptFindings(doc.scripts, find)
  messageFindings(doc.messages, find)
  return out
}

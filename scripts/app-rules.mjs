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

export function planFindings(doc) {
  const out = []
  const find = (rule, message) => out.push({ rule, message })
  if (!isObject(doc)) return [{ rule: 'document', message: 'not an object' }]
  scriptFindings(doc.scripts, find)
  return out
}

export function envelopeFindings(doc) {
  const out = []
  const find = (rule, message) => out.push({ rule, message })
  if (!isObject(doc)) return [{ rule: 'document', message: 'not an object' }]
  scriptFindings(doc.scripts, find)
  return out
}

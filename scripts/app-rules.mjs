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

/** `scripts[].key` is unique (plan §1, envelope §2.2). */
function scriptFindings(scripts, find) {
  if (!Array.isArray(scripts)) return
  const seen = new Set()
  scripts.forEach((s, i) => {
    if (!isObject(s) || typeof s.key !== 'string') return
    if (seen.has(s.key)) find('scriptKeyDuplicate', `scripts[${i}].key "${s.key}" is declared twice`)
    seen.add(s.key)
  })
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

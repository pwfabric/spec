/**
 * The rules of a pattern atom that no JSON Schema can state: they compare one
 * part of the document with another (a slot used in the snippet with the
 * declarations, a form binding's form with the snippet's node ids). They are
 * listed in pattern-format.md under "Rules beyond the schema"; this is that
 * list as code, so the conformance test can refuse an example that breaks
 * one. Zero dependencies.
 *
 *   patternFindings(doc) → [{ rule, message }]   empty = conforms
 *
 * Only MUST rules are here. A SHOULD (a declared slot the pattern never uses)
 * is not a finding.
 */

/** A slot token: upper case, digits and `_` between double braces. */
export const SLOT_TOKEN = /\{\{([A-Z0-9_]+)\}\}/g

/** The members whose values are moved into a page and may carry slots. */
export const WIRING_MEMBERS = ['dataSources', 'initialState', 'behaviors', 'formBindings']

/** Main-slot names: the declaration documents the node with `children: []`. */
export const MAIN_SLOTS = ['MAIN', 'BANDS']

const tokensIn = (value, into = new Set()) => {
  if (value === undefined) return into
  for (const m of JSON.stringify(value).matchAll(SLOT_TOKEN)) into.add(m[1])
  return into
}

const nodesOf = (snippet) => (Array.isArray(snippet) ? snippet : snippet ? [snippet] : [])

function walk(snippet, visit) {
  const go = (n) => {
    if (!n || typeof n !== 'object' || Array.isArray(n)) return
    visit(n)
    if (Array.isArray(n.children)) n.children.forEach(go)
  }
  nodesOf(snippet).forEach(go)
}

/** The first node, depth first in document order, whose `children` is an empty list. */
export function mainSlotNode(snippet) {
  let hit = null
  walk(snippet, (n) => {
    if (!hit && Array.isArray(n.children) && n.children.length === 0) hit = n
  })
  return hit
}

export function patternFindings(p) {
  const out = []
  const find = (rule, message) => out.push({ rule, message })
  if (!p || typeof p !== 'object' || Array.isArray(p)) return [{ rule: 'document', message: 'not an object' }]

  const declared = new Set(Object.keys(p.placeholders ?? {}).map((k) => k.replace(/^\{\{|\}\}$/g, '')))

  // 1. Every slot carried in the snippet or a wiring member is declared ({{ID}} excepted).
  const carried = tokensIn(p.snippet)
  for (const m of WIRING_MEMBERS) tokensIn(p[m], carried)
  carried.delete('ID')
  for (const t of carried) {
    if (!declared.has(t)) find('slotUndeclared', `{{${t}}} is carried but not declared in placeholders`)
  }

  // 2. A declared main slot has its node.
  if (MAIN_SLOTS.some((s) => declared.has(s)) && !mainSlotNode(p.snippet)) {
    find('mainSlotMissing', 'a main slot is declared but no snippet node has "children": []')
  }

  // 3. usesBlocks names exactly the block types the snippet places.
  const types = new Set()
  const ids = new Map()
  const stateKeys = new Set()
  walk(p.snippet, (n) => {
    if (typeof n.type === 'string') types.add(n.type)
    if (typeof n.id === 'string') ids.set(n.id, (ids.get(n.id) ?? 0) + 1)
    if (typeof n.props?.stateKey === 'string' && !/\{\{/.test(n.props.stateKey)) stateKeys.add(n.props.stateKey)
  })
  const uses = new Set(Array.isArray(p.usesBlocks) ? p.usesBlocks : [])
  for (const t of types) if (!uses.has(t)) find('usesBlocks', `the snippet places "${t}" but usesBlocks omits it`)
  for (const t of uses) if (!types.has(t)) find('usesBlocks', `usesBlocks names "${t}" but the snippet never places it`)

  // 4. Node ids are unique.
  for (const [id, n] of ids) if (n > 1) find('duplicateId', `the snippet uses the id "${id}" ${n} times`)

  // 5. References inside the pattern resolve inside the pattern.
  const sources = Array.isArray(p.dataSources) ? p.dataSources : []
  const sourceIds = new Map()
  for (const s of sources) if (s && typeof s.id === 'string') sourceIds.set(s.id, (sourceIds.get(s.id) ?? 0) + 1)
  for (const [id, n] of sourceIds) if (n > 1) find('duplicateSource', `the source id "${id}" is declared ${n} times`)
  const behaviors = Array.isArray(p.behaviors) ? p.behaviors : []
  behaviors.forEach((b, i) => {
    if (typeof b?.targetBlockId === 'string' && !ids.has(b.targetBlockId)) {
      find('behaviorTarget', `behaviors[${i}].targetBlockId "${b.targetBlockId}" is not a snippet node id`)
    }
    for (const a of Array.isArray(b?.actions) ? b.actions : []) {
      if ((a?.type === 'showBlock' || a?.type === 'hideBlock') && !ids.has(a.blockId)) {
        find('behaviorTarget', `behaviors[${i}] ${a.type} "${a.blockId}" is not a snippet node id`)
      }
      if (a?.type === 'refresh' && !sourceIds.has(a.sourceId)) {
        find('behaviorSource', `behaviors[${i}] refreshes "${a.sourceId}", which is not one of the pattern's sources`)
      }
      if (a?.type === 'setState' && typeof a.key === 'string') stateKeys.add(a.key)
    }
  })
  const bindings = Array.isArray(p.formBindings) ? p.formBindings : []
  bindings.forEach((fb, i) => {
    if (typeof fb?.formId === 'string' && !ids.has(fb.formId)) find('formBindingForm', `formBindings[${i}].formId "${fb.formId}" is not a snippet node id`)
    if (typeof fb?.sourceId === 'string' && !sourceIds.has(fb.sourceId)) find('formBindingSource', `formBindings[${i}].sourceId "${fb.sourceId}" is not one of the pattern's sources`)
    for (const v of Object.values(fb?.statusKeys ?? {})) if (typeof v === 'string') stateKeys.add(v)
  })

  // 6. Every state key the pattern reads or writes is seeded.
  const read = JSON.stringify({ s: p.snippet, d: p.dataSources, b: p.behaviors })
  for (const m of read.matchAll(/\{\{\s*state\.([A-Za-z_$][\w$]*)/g)) stateKeys.add(m[1])
  const seeded = p.initialState && typeof p.initialState === 'object' ? p.initialState : {}
  for (const k of stateKeys) if (!Object.hasOwn(seeded, k)) find('stateUnseeded', `state "${k}" is read or written but initialState does not seed it`)

  // 7. Every connector a source names is declared in requires.connectors.
  const required = new Set(Array.isArray(p.requires?.connectors) ? p.requires.connectors : [])
  for (const s of sources) {
    if (typeof s?.connector === 'string' && !required.has(s.connector)) {
      find('connectorUndeclared', `source "${s.id}" names connector "${s.connector}" but requires.connectors does not`)
    }
  }

  return out
}

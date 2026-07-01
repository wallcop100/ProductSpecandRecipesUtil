/**
 * Utilities for virtual container ("wrapper") ElementTypes.
 *
 * A wrapper is a virtual assembly element (DL, LIN, or anything else) whose real
 * deliverables are its internal contents. Detection is a **multi-signal soft
 * match** — no single privileged rule — combining:
 *   - naming pattern (ET-DL-* / ET-LIN-*) — a hint, not a privilege
 *   - the ET is marked Ideaworks / N/A in the Product Spec (deliberately, though
 *     usually applied *after* it's flagged a wrapper, so it's corroborating)
 *   - the ET has internal recipe rows (ContextType=ElementType)
 *   - the DB IsCollection flag (weak — used inconsistently by users)
 * Manual include/exclude always wins, to fix false positives/negatives.
 */

const DEFAULT_NAMING_RE = /^ET-(DL|LIN)-/i

// Soft-hint weights; a score at/above THRESHOLD marks a wrapper. Strong hints
// (naming, Ideaworks/N/A) qualify alone; weak hints need corroboration — which
// keeps a real element-with-contents (e.g. a PANEL with real metalwork and a
// genuine product spec) from being mis-flagged.
const HINT_WEIGHTS = { naming: 2, ideaworksNA: 2, hasInternals: 1, isCollection: 1 }
const THRESHOLD = 2

/** Returns true if the ref matches the built-in wrapper naming hint. */
export function looksLikeContainer(ref) {
  if (!ref) return false
  return DEFAULT_NAMING_RE.test(ref)
}

/** True if the ET's Product Spec row is marked Ideaworks / N/A. */
export function isIdeaworksNA(etRef, psRows = []) {
  const key = (etRef || '').toLowerCase()
  if (!key) return false
  return psRows.some(r => {
    if ((r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() !== key) return false
    const mfr  = (r.Manufacturer || r.manufacturer || '').trim().toLowerCase()
    const code = (r.ProductCode  || r.productCode  || '').trim().toLowerCase()
    return mfr === 'ideaworks' && code === 'n/a'
  })
}

/**
 * computeContainerInfo({ elementTypes, psRows, recipes, manualInclude, manualExclude })
 * → { refs: Set<lowercased ref>, reasons: { [lowerRef]: { score, hints, forced, isContainer } } }
 *
 * `reasons` powers a "why is this a wrapper?" tooltip. `forced` is 'included' |
 * 'excluded' | null (manual override).
 */
export function computeContainerInfo({ elementTypes = [], psRows = [], recipes = [], manualInclude = [], manualExclude = [] } = {}) {
  const inc = new Set(manualInclude.map(r => r.toLowerCase()))
  const exc = new Set(manualExclude.map(r => r.toLowerCase()))

  const isCollection = new Set()
  for (const et of elementTypes) {
    const r = (et.ElementTypeRef || et.elementTypeRef || '').toLowerCase()
    if (r && (et.IsCollection === 'Y' || et.isCollection === 'Y')) isCollection.add(r)
  }

  const hasInternals = new Set()
  for (const row of recipes) {
    const ct = row.ContextType || row.contextType
    const cr = (row.ContextRef || row.contextRef || '').toLowerCase()
    if (ct === 'ElementType' && cr) hasInternals.add(cr)
  }

  // Every ref we know about
  const allRefs = new Set()
  for (const et of elementTypes) { const r = et.ElementTypeRef || et.elementTypeRef; if (r) allRefs.add(r) }
  for (const row of psRows)      { const r = row.ElementTypeRef || row.elementTypeRef; if (r) allRefs.add(r) }
  for (const row of recipes)     { const r = row.ElementTypeRef || row.elementTypeRef; if (r) allRefs.add(r) }

  const refs = new Set()
  const reasons = {}

  for (const ref of allRefs) {
    const key = ref.toLowerCase()
    const hints = []
    if (looksLikeContainer(ref))     hints.push('naming')
    if (isIdeaworksNA(ref, psRows))  hints.push('ideaworksNA')
    if (hasInternals.has(key))       hints.push('hasInternals')
    if (isCollection.has(key))       hints.push('isCollection')
    const score = hints.reduce((s, h) => s + (HINT_WEIGHTS[h] || 0), 0)

    let forced = null
    let isContainer
    if (exc.has(key))      { isContainer = false; forced = 'excluded' }
    else if (inc.has(key)) { isContainer = true;  forced = 'included' }
    else                     isContainer = score >= THRESHOLD

    if (isContainer) refs.add(key)
    reasons[key] = { score, hints, forced, isContainer }
  }

  // Manual includes for refs not otherwise seen
  for (const key of inc) {
    if (!reasons[key]) { refs.add(key); reasons[key] = { score: 0, hints: [], forced: 'included', isContainer: true } }
  }

  return { refs, reasons }
}

/**
 * Returns an array of PositionTypeRefs (other than currentPosRef) that use
 * this ET in any section of their recipe.
 */
export function getUsedIn(etRef, recipes, currentPosRef) {
  const key = (etRef || '').toLowerCase()
  const positions = new Set()
  for (const row of recipes) {
    const rowET = (row.ElementTypeRef || row.elementTypeRef || '').toLowerCase()
    if (rowET !== key) continue
    const posRef = row.PositionTypeRef || row.positionTypeRef || ''
    if (posRef && posRef !== currentPosRef) {
      positions.add(posRef)
    }
  }
  return [...positions]
}

/**
 * Returns the unique internal items of a container ET as [{ ref, name }].
 * Internal items are recipe rows whose ContextType is ElementType and whose
 * ContextRef matches etRef. Names are resolved from elementTypes when available.
 */
export function getInternalItems(etRef, recipes, elementTypes = []) {
  const key = (etRef || '').toLowerCase()
  if (!key) return []
  const etMap = new Map(elementTypes.map(et => [
    (et.ElementTypeRef || et.elementTypeRef || '').toLowerCase(),
    et,
  ]))
  const items = []
  const seen = new Set()
  for (const row of recipes) {
    const ct = row.ContextType || row.contextType
    const cr = (row.ContextRef || row.contextRef || '').toLowerCase()
    const er = row.ElementTypeRef || row.elementTypeRef
    if (ct !== 'ElementType' || cr !== key || !er) continue
    if (seen.has(er)) continue
    seen.add(er)
    const info = etMap.get(er.toLowerCase())
    items.push({ ref: er, name: info?.Name || info?.name || null })
  }
  return items
}

/**
 * Given an ET ref like 'ET-DL-SPOT-03', strips the trailing numeric suffix,
 * finds all existing ETs with the same base prefix, and returns the next
 * sequential ref.
 *
 * Example: existing = ['ET-DL-SPOT-01', 'ET-DL-SPOT-02', 'ET-DL-SPOT-03']
 *          →  'ET-DL-SPOT-04'
 */
export function getNextAvailableRef(etRef, elementTypes) {
  if (!etRef) return null

  // Strip trailing -NN suffix (one or more digits after the last hyphen)
  const match = etRef.match(/^(.*)-(\d+)$/)
  if (!match) return null

  const base = match[1] // e.g. 'ET-DL-SPOT'
  const baseLower = base.toLowerCase()

  let maxN = 0
  for (const et of elementTypes) {
    const ref = et.ElementTypeRef || et.elementTypeRef || ''
    const m = ref.match(/^(.*)-(\d+)$/)
    if (!m) continue
    if (m[1].toLowerCase() !== baseLower) continue
    const n = parseInt(m[2], 10)
    if (n > maxN) maxN = n
  }

  const nextN = maxN + 1
  // Preserve original zero-padding width
  const padWidth = match[2].length
  const paddedN = String(nextN).padStart(padWidth, '0')
  return `${base}-${paddedN}`
}

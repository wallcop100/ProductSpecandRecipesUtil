/**
 * Utilities for DL/LIN virtual container ElementTypes.
 *
 * A container ET is a virtual assembly element (DL or LIN) whose contents are
 * the real deliverable items. Detection priority:
 *  1. Manual overrides (stored in SQLite project_prefs)
 *  2. Naming convention: ElementTypeRef matches ET-DL-* or ET-LIN-* pattern
 *     (second hyphen-segment is 'DL' or 'LIN').
 *     User can remove the "container" designation to override false positives.
 */

/** Returns true if the ref looks like a DL or LIN virtual container by naming convention. */
export function looksLikeContainer(ref) {
  if (!ref) return false
  // Match refs of the form ET-DL-... or ET-LIN-... (case-insensitive)
  return /^ET-(DL|LIN)-/i.test(ref)
}

/**
 * Build the effective set of container ET refs from manual overrides and naming convention.
 * Returns a Set of lowercased ET refs.
 */
export function buildContainerETSet(psRows, manualRefs = [], allRefs = []) {
  const set = new Set(manualRefs.map(r => r.toLowerCase()))

  // From naming convention: ET-DL-* or ET-LIN-*
  for (const ref of allRefs) {
    if (ref && looksLikeContainer(ref)) {
      set.add(ref.toLowerCase())
    }
  }

  return set
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

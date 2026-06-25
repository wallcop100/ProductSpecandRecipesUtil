/**
 * Utilities for DL/LIN virtual container ElementTypes.
 *
 * A container ET is one whose Product Spec entry is always Idaaworks / N/A.
 * Detection priority:
 *  1. Manual overrides (stored in SQLite project_prefs)
 *  2. PS rows where Manufacturer=Idaaworks AND ProductCode=N/A
 *  3. Naming convention: ElementTypeRef matches ET-DL-* or ET-LIN-* pattern
 *     (second hyphen-segment is 'DL' or 'LIN') — catches containers before a PS
 *     row exists. User can remove the "container" designation to override false positives.
 */

/** Returns true if the ref looks like a DL or LIN virtual container by naming convention. */
export function looksLikeContainer(ref) {
  if (!ref) return false
  // Match refs of the form ET-DL-... or ET-LIN-... (case-insensitive)
  return /^ET-(DL|LIN)-/i.test(ref)
}

/**
 * Build the effective set of container ET refs from all three sources.
 * Returns a Set of lowercased ET refs.
 */
export function buildContainerETSet(psRows, manualRefs = [], allRefs = []) {
  const set = new Set(manualRefs.map(r => r.toLowerCase()))

  // From PS: Idaaworks/N/A signal
  for (const row of psRows) {
    const ref = (row.ElementTypeRef || row.elementTypeRef || '').toLowerCase()
    const mfr = (row.Manufacturer || row.manufacturer || '').toLowerCase().trim()
    const code = (row.ProductCode || row.productCode || '').toLowerCase().trim()
    if (!ref) continue
    if (mfr === 'idaaworks' && code === 'n/a') {
      set.add(ref)
    }
  }

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
 * Given an ET ref like 'ET-DL-SPOT-03', strips the trailing numeric suffix,
 * finds all existing ETs with the same base prefix, and returns the next
 * sequential ref.
 *
 * Example: existing = ['ET-DL-SPOT-01', 'ET-DL-SPOT-02', 'ET-DL-SPOT-03']
 *          → 'ET-DL-SPOT-04'
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

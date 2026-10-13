/**
 * useCatalogue — what a shared product catalogue knows about the Form's codes, when the
 * app is served next to a companion that has one (platform/companion.js). Otherwise it
 * returns an empty object and nothing else changes.
 *
 * Advisory, like every suggestion in the import: it is shown beside a code, never applied
 * to it. A catalogue that has not seen a code says nothing — absence is not evidence.
 */
import { useEffect, useState } from 'react'
import { useCompanion } from '../../platform/companion'
import { norm } from '../../utils/productCodes'

export const catalogueKey = (code, manufacturer) => `${norm(manufacturer || '')}|${norm(code)}`

/** entries: [{ text, manufacturers }] → { [catalogueKey]: product | null } */
export default function useCatalogue(entries) {
  const api = useCompanion()
  const [known, setKnown] = useState({})
  const wanted = (entries || [])
    .filter(e => !e.placeholder && e.text)
    .map(e => [e.text, e.manufacturers?.length === 1 ? e.manufacturers[0] : ''])
  const sig = wanted.map(([c, m]) => catalogueKey(c, m)).sort().join('\n')

  useEffect(() => {
    if (!api?.lookupProduct || !wanted.length) return
    let live = true
    const todo = wanted.filter(([c, m]) => !(catalogueKey(c, m) in known))
    Promise.all(todo.map(([c, m]) => api.lookupProduct(c, m).then(v => [catalogueKey(c, m), v])))
      .then(pairs => { if (live && pairs.length) setKnown(k => ({ ...k, ...Object.fromEntries(pairs) })) })
    return () => { live = false }
  }, [api, sig])   // eslint-disable-line react-hooks/exhaustive-deps

  return known
}

const shared = new Set()

/**
 * Offer the ElementType decisions just staged back to the catalogue, for a person on the
 * other side to review. The family goes with the ref: it is the part another project can use. Only decisions with one maker (a product is the pair), and each
 * once per session. → how many were offered.
 */
export async function shareAssignments(api, entries, { project = '', familyOf = () => '' } = {}) {
  if (!api?.contribute) return 0
  const offers = (entries || []).filter(e => e.etRef && !e.placeholder && e.manufacturers?.length === 1)
    .map(e => ({
      kind: 'et-assignment', code: e.text, manufacturer: e.manufacturers[0], ref: e.etRef,
      family: familyOf(e.etRef) || '', description: e.variants?.[0]?.note || '', project,
    }))
    .filter(o => !shared.has(catalogueKey(o.code, o.manufacturer) + '|' + o.ref))
  const ok = await Promise.all(offers.map(o => api.contribute(o)))
  offers.forEach((o, i) => { if (ok[i]) shared.add(catalogueKey(o.code, o.manufacturer) + '|' + o.ref) })
  return ok.filter(Boolean).length
}

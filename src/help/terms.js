/**
 * terms.js — Find's words, titles and how-to text as DATA (help/terms.json), and the live changes
 * made on Orion /psr → Find laid over them. No imports: Orion's preview loads this very file (and
 * help/search.js) from the repo, so its preview is the app's search, not a copy.
 *
 *   terms.json      { version, synonyms: { word: [means…] }, actions: { id: { area, needs, title,
 *                     titleNoRef, how, words, hidden } } }
 *   overrides       { actions: { id: { title, titleNoRef, how, add: [w], remove: [w], hidden } },
 *                     synonyms: { set: { word: [means…] }, remove: [word] } }   — served beside a companion
 *
 *   mergeTerms(base, overrides)  → terms with the overrides applied
 *   actionsFromTerms(terms)      → [{ id, area, needs, title(ref), words, how }] (hidden ones left out)
 */

const lc = s => String(s ?? '').trim().toLowerCase()

export function mergeTerms(base = {}, ov = null) {
  const actions = {}
  for (const [id, t] of Object.entries(base.actions || {})) actions[id] = { ...t, words: [...(t.words || [])] }
  const synonyms = { ...(base.synonyms || {}) }
  if (!ov) return { ...base, actions, synonyms }
  for (const [id, o] of Object.entries(ov.actions || {})) {
    // An action the code no longer has: nothing to apply it to (Orion lists it as orphaned).
    if (!actions[id]) continue
    const t = actions[id]
    for (const f of ['title', 'titleNoRef', 'how']) if (o[f] != null && String(o[f]).trim()) t[f] = String(o[f])
    if (o.hidden != null) t.hidden = !!o.hidden
    const gone = new Set((o.remove || []).map(lc))
    t.words = t.words.filter(w => !gone.has(lc(w)))
    for (const w of o.add || []) if (lc(w) && !t.words.some(x => lc(x) === lc(w))) t.words.push(lc(w))
  }
  for (const w of ov.synonyms?.remove || []) delete synonyms[lc(w)]
  for (const [w, means] of Object.entries(ov.synonyms?.set || {})) {
    const m = (means || []).map(lc).filter(Boolean)
    if (lc(w) && m.length) synonyms[lc(w)] = m
  }
  return { ...base, actions, synonyms }
}

/** Searchable actions from terms: a title with `{ref}` in it is filled with the bound ref. */
export function actionsFromTerms(terms = {}) {
  return Object.entries(terms.actions || {}).filter(([, t]) => !t.hidden).map(([id, t]) => ({
    id, area: t.area, needs: t.needs || null, how: t.how || '', words: t.words || [],
    title: ref => (ref && t.title ? t.title.replace(/\{ref\}/g, ref) : (t.titleNoRef || t.title || id).replace(/\{ref\}/g, '').trim()),
  }))
}

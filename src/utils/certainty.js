/**
 * certainty — how sure the companion is of one suggestion, and so how much to ask of the person adding it.
 *
 *   sure     one click, as before: the project's own, confirmed, or ≥3 yes from ≥2 people and no open "no"
 *   likely   one click, then a 👍/👎 chip that never blocks
 *   unsure   Add opens the check popup: a range-only match, a kit seen once, a placeholder, someone's
 *            correction not yet confirmed, or a pair whose latest "no" is newer than its latest yes
 *
 * `votes` come from the companion ({yes, no, origins, openNo, verdict}); it stops serving dropped pairs itself.
 * Without the companion's `checks` feature nothing halts: an unsure suggestion is only likely.
 */
export function levelOf({ own = false, votes, projects = 0, range = false, proposed = false, placeholder = false } = {}, checks = true) {
  if (own || votes?.verdict === 'confirmed') return 'sure'
  const v = votes || { yes: 0, no: 0, origins: 0, openNo: false }
  const unsure = v.openNo || placeholder || proposed || ((range || projects <= 1) && !v.yes)
  if (unsure) return checks ? 'unsure' : 'likely'
  if (v.yes >= 3 && v.origins >= 2) return 'sure'
  return 'likely'
}

const people = n => `${n} ${n === 1 ? 'person' : 'people'}`
/** "2 people said yes, 1 person said no", or ''. */
export const saidOf = votes => [votes?.yes && `${people(votes.yes)} said yes`, votes?.no && `${people(votes.no)} said no`].filter(Boolean).join(', ')

/** One sentence: why the companion thinks so. */
export function evidenceOf({ votes, projects = 0, positions = 0, range = false, proposed = false, placeholder = false, anchor = '' }) {
  const said = saidOf(votes)
  const basis = placeholder ? 'positions like this usually have one, but none is known for this profile'
    : proposed ? 'someone gave this code as the right one; nobody else has checked it yet'
    : range ? `same range as ${anchor} in the maker's catalogue (matched on the code and its description, not seen used)`
    : `used with this profile on ${projects} project${projects === 1 ? '' : 's'}${positions ? `, ${positions} position${positions === 1 ? '' : 's'}` : ''}`
  return [basis, said].filter(Boolean).join('; ')
}

// How often a person is halted: once per suggestion each (again only after a new "no"), and not twice in 3 minutes.
const GAP_MS = 3 * 60 * 1000
let lastAsked = -Infinity
const CHECKED = n => `psr-checked:${n || '-'}`
function readChecked(n) {
  try { return JSON.parse(localStorage.getItem(CHECKED(n)) || '{}') } catch { return {} }
}

/** Whether to halt for `key` now. `votes.no` is remembered with the answer, so a newer "no" asks again. */
export function mayAsk(project, key, votes, now = Date.now()) {
  if (now - lastAsked < GAP_MS) return false
  const seen = readChecked(project)[key]
  return seen === undefined || (votes?.openNo && (votes.no || 0) > seen)
}

export function noteAsked(project, key, votes, vote, now = Date.now()) {
  lastAsked = now
  const all = readChecked(project)
  all[key] = (votes?.no || 0) + (vote === 'rejected' ? 1 : 0)   // their own "no" is not news to them
  try { localStorage.setItem(CHECKED(project), JSON.stringify(Object.fromEntries(Object.entries(all).slice(-500)))) } catch { /* a convenience only */ }
}

/** Tests only. */
export function resetAsked() { lastAsked = -Infinity }

/**
 * ptResolve.js — map a Form's PositionTypeRef onto the project's PositionType.
 *
 * The Form and the DesignDB do not always name the same thing the same way. In the
 * real data, the Form says `C01`, but the DB holds BOTH `C01` and `C01r` — and the
 * recipe hangs off `C01r`, never `C01`. Assigning captured product codes to `C01`
 * silently prefills a recipe on a PositionType that will never have one.
 *
 * The DB already states the relationship, so nothing here is guessed:
 *
 *     C01r.ExtRef === "C01"        "my ref in external documents is C01"
 *
 * A Form IS an external document. So the rule is simply: if some PositionType
 * claims this Form ref as its ExtRef, that PositionType is the target. Otherwise
 * the Form ref addresses a PositionType directly.
 *
 * This deliberately encodes NO naming convention. It never looks for a trailing
 * "r", never parses `-PARENTS`, and never compares prefixes — a project may use
 * any suffix, or none. Only ExtRef speaks. Where it is silent, the user decides.
 */

const norm = r => String(r ?? '').trim()
const key = r => norm(r).toUpperCase()

/** How a Form ref was resolved. Ordered by how much the DB told us. */
export const VIA = {
  EXT_REF: 'extRef',   // a PositionType claims this ref as its ExtRef
  DIRECT: 'direct',    // the ref names a PositionType outright
  MISSING: 'missing',  // no PositionType matches; nothing to prefill
}

const refOf = pt => norm(pt.PositionTypeRef ?? pt.positionTypeRef ?? pt.Ref ?? pt.ref)
const extOf = pt => norm(pt.ExtRef ?? pt.extRef)

/**
 * resolveFormRef(formRef, positionTypes) -> { formRef, target, via, ambiguous }
 *
 * `target` is null when nothing matches. `ambiguous` lists the other claimants when
 * more than one PositionType names the same ExtRef — a malformed DB, surfaced
 * rather than silently resolved by picking one.
 */
export function resolveFormRef(formRef, positionTypes = []) {
  const want = key(formRef)
  if (!want) return { formRef: norm(formRef), target: null, via: VIA.MISSING, ambiguous: [] }

  const claimants = positionTypes.filter(pt => key(extOf(pt)) === want)
  if (claimants.length > 0) {
    return {
      formRef: norm(formRef),
      target: refOf(claimants[0]),
      via: VIA.EXT_REF,
      ambiguous: claimants.slice(1).map(refOf),
    }
  }

  const direct = positionTypes.find(pt => key(refOf(pt)) === want)
  return {
    formRef: norm(formRef),
    target: direct ? refOf(direct) : null,
    via: direct ? VIA.DIRECT : VIA.MISSING,
    ambiguous: [],
  }
}

/**
 * Resolve every distinct Form ref, in first-seen order, for the confirmation step.
 * Each entry carries `rows` (how many Form rows use it) so the user can see what a
 * skip would cost.
 */
export function resolveFormRefs(formRefs, positionTypes = []) {
  const counts = new Map()
  for (const r of formRefs) {
    const k = key(r)
    if (!k) continue
    if (!counts.has(k)) counts.set(k, { formRef: norm(r), rows: 0 })
    counts.get(k).rows++
  }
  return [...counts.values()].map(({ formRef, rows }) => ({
    ...resolveFormRef(formRef, positionTypes),
    rows,
  }))
}

/**
 * Fold the user's overrides into a plain lookup used at staging time.
 * `overrides` maps a Form ref to a chosen PositionTypeRef, or to '' meaning "skip".
 *
 * Returns Map<normalised form ref, target ref>. Skipped and unresolved refs are
 * absent, so a caller that misses one prefills nothing rather than guessing.
 */
export function buildRefMap(resolutions, overrides = {}) {
  const map = new Map()
  for (const r of resolutions) {
    const override = overrides[r.formRef]
    const target = override === undefined ? r.target : (override || null)
    if (target) map.set(key(r.formRef), target)
  }
  return map
}

/** Look a Form ref up in a map from buildRefMap. */
export const targetFor = (map, formRef) => map.get(key(formRef)) || null

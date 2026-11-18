/**
 * derived.js — every list or rule the app derives from the workbook, defined ONCE.
 * docs/DERIVED.md says what each one means, who reads it, and the deliberate exceptions.
 * Never rebuild one of these inline: tests/frontend/derived.test.js fails if you do.
 */

/** The key two refs are compared by: trimmed, case-insensitive (as SQL Server compares them).
 *  A key only: never show it or write it back; show the ref as the project spells it. */
export const refKey = s => String(s ?? '').trim().toUpperCase()

/** A row that is not deleted. A null row is live, as `(row?.IsDeleted || …) !== 'Y'` always was. */
export const live = r => (r?.IsDeleted || r?.isDeleted) !== 'Y'

/**
 * Every family on a project, keyed by refKey, each with the spelling the project uses (first seen):
 * each ref an ElementType names as its Family, plus the family rows parseDb strips
 * (dbCollectionRefs: ET-DRIVERS, ET-PS). NOT IsCollection: on 5642, 22 of 24 IsCollection rows are
 * wrappers (ET-DL-01) and 12 of 14 families have no row (VHCCAF).
 */
export function familyNames(elementTypes = [], collectionRefs = []) {
  const m = new Map()
  for (const f of [...elementTypes.map(e => e.Family || e.family), ...collectionRefs]) {
    const k = refKey(f)
    if (k && !m.has(k)) m.set(k, String(f).trim())
  }
  return m
}

/** familyNames' keys: for "is this a family?" checks. */
export const familyRefs = (elementTypes = [], collectionRefs = []) => new Set(familyNames(elementTypes, collectionRefs).keys())

/** Every ref with a row (an ElementType or a stripped DesignDB collection), as refKeys. A family
 *  "has a row" when its ref is in here. */
export function familyRowRefs(elementTypes = [], collectionRefs = []) {
  return new Set([...elementTypes.map(e => e.ElementTypeRef || e.elementTypeRef), ...collectionRefs].map(refKey).filter(Boolean))
}

/** True when the project already has a row for this family: an ElementType or a DesignDB collection ref. */
export function familyRowExists(family, elementTypes = [], collectionRefs = []) {
  return !!refKey(family) && familyRowRefs(elementTypes, collectionRefs).has(refKey(family))
}

/** A row's ElementTypeRef as written (either casing of the column), '' when it has none. */
export const etRefOf = r => r?.ElementTypeRef || r?.elementTypeRef || ''

/** The same, camelCase first: for objects the app builds (Form entries, ingredients) that override
 *  `elementTypeRef` over a spread row (`{ ...entry, elementTypeRef: ref }`), so camelCase is current. */
export const entryRefOf = e => e?.elementTypeRef || e?.ElementTypeRef || ''

/** The key two product codes are compared by: the same rule as refKey. A key only, never shown. */
export const codeKey = refKey

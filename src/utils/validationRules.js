/**
 * validationRules.js
 * Client-side validation mirroring the backend rules. Runs in-browser for
 * real-time feedback before the user saves or exports.
 *
 * Each issue shape:
 *   { severity: 'error'|'warning', rule: string, message: string, ref: string|null }
 */

import { DIM_QTY_COMPONENTS } from './constants.js'

// Ref-token vocabularies for tag-driven recipe checks. Tokens are matched as
// hyphen-delimited segments of the (uppercased) ElementTypeRef, which avoids the
// false positives a bare substring match would cause for short tokens like SR.
const DRIVER_TOKENS = ['DRIVER', 'CCL', 'CCR', 'CVR']
const SOCKET_TOKENS = ['SOCK', 'SOCKET']
const STRAIN_RELIEF_TOKENS = ['SR']
const CONNECTOR_TOKENS = ['SOCK', 'SOCKET', 'PLUG', 'PIN']

/** Segments of an ET ref, uppercased (e.g. 'ET-SOCK-5P-01' → ['ET','SOCK','5P','01']). */
function refSegments(ref) {
  return ((ref || '').toUpperCase()).split('-')
}

/** True if any of tokens appears as a segment of the ref. */
function refHasToken(ref, tokens) {
  const segs = refSegments(ref)
  return tokens.some(t => segs.includes(t))
}

/** Rows for a position at PositionType context level. */
function positionLevelRows(rsRows, ref) {
  return rsRows.filter(
    r => (r.positionTypeRef || r.PositionTypeRef) === ref &&
         (r.contextType || r.ContextType) === 'PositionType'
  )
}

/** All recipe rows for a position (any context). */
function allRowsFor(rsRows, ref) {
  return rsRows.filter(r => (r.positionTypeRef || r.PositionTypeRef) === ref)
}

const refOf = r => r.elementTypeRef || r.ElementTypeRef || ''

/**
 * Run all validation rules against the current data.
 *
 * @param {object} dbData - { element_types: [], position_types: [] }
 * @param {object[]} psRows - product spec rows
 * @param {object[]} rsRows - recipe spec rows
 * @param {object} positionUI - { [ref: string]: { tags: string[] } } from store
 * @returns {object[]} issues
 */
// Rules whose fix lives on the Product Spec screen (ref is an ET ref); all
// others are recipe rules whose ref is a PositionTypeRef.
const SPEC_RULES = new Set(['DUPLICATE_PRODUCT_CODE', 'MISSING_PRODUCT_CODE'])

export function runValidation(dbData, psRows, rsRows, positionUI) {
  const issues = []

  issues.push(...checkMissingIsDesign(rsRows, positionUI))
  issues.push(...checkDuplicateIsDesign(rsRows, positionUI))
  issues.push(...checkDuplicateProductCode(psRows))
  issues.push(...checkMissingLockingLever(rsRows, positionUI))
  issues.push(...checkDimQtyMultNotOne(rsRows))
  issues.push(...checkMissingClipsDimQty(rsRows, positionUI))
  issues.push(...checkLocalDriverRequirements(rsRows, positionUI))
  issues.push(...checkRemoteNoSiteSocket(rsRows, positionUI))
  issues.push(...checkExteriorIPConnectors(rsRows, positionUI))
  issues.push(...checkMissingProductSpecs(psRows))
  issues.push(...checkDanglingElementTypeRefs(dbData, psRows, rsRows))

  // Tag each issue with where its "fix" lives so the UI can route correctly.
  for (const i of issues) i.fixKind = SPEC_RULES.has(i.rule) ? 'spec' : 'position'

  return issues
}

// ---------------------------------------------------------------------------
// Rule 1 — MISSING_IS_DESIGN
// Every position type's recipe must have exactly one row with IsDesign = 'Y'
// ---------------------------------------------------------------------------
function checkMissingIsDesign(rsRows, positionUI) {
  const issues = []
  const positionRefs = Object.keys(positionUI || {})

  for (const ref of positionRefs) {
    const posRows = rsRows.filter(
      r => (r.positionTypeRef || r.PositionTypeRef) === ref &&
           (r.contextType || r.ContextType) === 'PositionType'
    )
    const designRows = posRows.filter(
      r => (r.isDesign || r.IsDesign) === 'Y'
    )
    if (designRows.length === 0) {
      issues.push({
        severity: 'error',
        rule: 'MISSING_IS_DESIGN',
        message: `Position type "${ref}" has no IsDesign=Y row in its recipe.`,
        ref,
      })
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Rule 2 — DUPLICATE_IS_DESIGN
// More than one IsDesign=Y row per position is an error
// ---------------------------------------------------------------------------
function checkDuplicateIsDesign(rsRows, positionUI) {
  const issues = []
  const positionRefs = Object.keys(positionUI || {})

  for (const ref of positionRefs) {
    const posRows = rsRows.filter(
      r => (r.positionTypeRef || r.PositionTypeRef) === ref &&
           (r.contextType || r.ContextType) === 'PositionType'
    )
    const designRows = posRows.filter(
      r => (r.isDesign || r.IsDesign) === 'Y'
    )
    if (designRows.length > 1) {
      issues.push({
        severity: 'error',
        rule: 'DUPLICATE_IS_DESIGN',
        message: `Position type "${ref}" has ${designRows.length} IsDesign=Y rows — only one is allowed.`,
        ref,
      })
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Rule 3 — DUPLICATE_PRODUCT_CODE
// Product codes must be unique across psRows (except "N/A")
// ---------------------------------------------------------------------------
function checkDuplicateProductCode(psRows) {
  const issues = []
  const seen = {}

  for (const row of psRows) {
    const code = row.productCode || row.ProductCode || null
    if (!code || code.trim().toUpperCase() === 'N/A') continue

    const upper = code.trim().toUpperCase()
    if (seen[upper]) {
      seen[upper].count++
    } else {
      seen[upper] = { count: 1, ref: row.elementTypeRef || row.ElementTypeRef || null }
    }
  }

  for (const [code, info] of Object.entries(seen)) {
    if (info.count > 1) {
      issues.push({
        severity: 'error',
        rule: 'DUPLICATE_PRODUCT_CODE',
        message: `Product code "${code}" appears ${info.count} times. Product codes must be unique.`,
        ref: info.ref,
      })
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Rule 4 — MISSING_LOCKING_LEVER
// LIN positions must have a row at ContextType=PositionType level whose
// ElementTypeRef contains "LLOCK" or "LEVER"
// ---------------------------------------------------------------------------
function checkMissingLockingLever(rsRows, positionUI) {
  const issues = []

  for (const [ref, ui] of Object.entries(positionUI || {})) {
    const tags = ui.tags || []
    if (!tags.includes('LIN')) continue

    const posRows = rsRows.filter(
      r => (r.positionTypeRef || r.PositionTypeRef) === ref &&
           (r.contextType || r.ContextType) === 'PositionType'
    )

    const hasLever = posRows.some(r => {
      const etRef = ((r.elementTypeRef || r.ElementTypeRef) || '').toUpperCase()
      return etRef.includes('LLOCK') || etRef.includes('LEVER')
    })

    if (!hasLever) {
      issues.push({
        severity: 'error',
        rule: 'MISSING_LOCKING_LEVER',
        message: `LIN position "${ref}" has no locking lever (LLOCK/LEVER) in its recipe.`,
        ref,
      })
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Rule 5 — DIM_QTY_MULT_NOT_ONE
// TAPE/PROFILE/DIFF/MOUNT/FLEX rows should have DimQtyMultiplier = 1
// ---------------------------------------------------------------------------
function checkDimQtyMultNotOne(rsRows) {
  const issues = []

  for (const row of rsRows) {
    const etRef = ((row.elementTypeRef || row.ElementTypeRef) || '').toUpperCase()
    const isDimComponent = DIM_QTY_COMPONENTS.some(token => etRef.includes(token))
    if (!isDimComponent) continue

    const mult = row.dimQtyMultiplier ?? row.Dim_QuantityMultiplier ?? row.DimQtyMultiplier

    if (mult !== 1 && mult !== null && mult !== undefined) {
      issues.push({
        severity: 'warning',
        rule: 'DIM_QTY_MULT_NOT_ONE',
        message: `Row for "${etRef}" has DimQtyMultiplier=${mult}. Expected 1 for dimensional components.`,
        ref: row.positionTypeRef || row.PositionTypeRef || null,
      })
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Rule 6 — MISSING_CLIPS_DIM_QTY
// LIN positions with a CLIP row must have Dim_Quantity set
// ---------------------------------------------------------------------------
function checkMissingClipsDimQty(rsRows, positionUI) {
  const issues = []

  for (const [ref, ui] of Object.entries(positionUI || {})) {
    const tags = ui.tags || []
    if (!tags.includes('LIN')) continue

    const clipRows = rsRows.filter(r => {
      const ptRef = r.positionTypeRef || r.PositionTypeRef
      const etRef = ((r.elementTypeRef || r.ElementTypeRef) || '').toUpperCase()
      return ptRef === ref && etRef.includes('CLIP')
    })

    for (const row of clipRows) {
      const dimQty = row.Dim_QuantityMultiplier ?? row.dimQtyMultiplier ?? null
      if (dimQty === null || dimQty === undefined) {
        issues.push({
          severity: 'warning',
          rule: 'MISSING_CLIPS_DIM_QTY',
          message: `LIN position "${ref}" has a CLIP row with no clip rate (Dim_QuantityMultiplier) set.`,
          ref,
        })
      }
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Rule 7 — LOCAL_DRIVER_REQUIREMENTS
// A local-driver position (tag 'Local') needs a driver in its assembly and a
// site-side socket + strain relief at position level (the first-fix kit).
// Only checked once a recipe has been started, to avoid noise on empty rows.
// ---------------------------------------------------------------------------
function checkLocalDriverRequirements(rsRows, positionUI) {
  const issues = []

  for (const [ref, ui] of Object.entries(positionUI || {})) {
    const tags = ui.tags || []
    // Local first-fix kit (driver + site socket + strain relief) applies to
    // point-source/downlight positions, not linear — LIN has its own wiring.
    if (!tags.includes('Local') || tags.includes('LIN')) continue

    const allRows = allRowsFor(rsRows, ref)
    if (allRows.length === 0) continue // empty recipe — MISSING_IS_DESIGN covers it

    const posRows = positionLevelRows(rsRows, ref)

    if (!allRows.some(r => refHasToken(refOf(r), DRIVER_TOKENS))) {
      issues.push({
        severity: 'warning',
        rule: 'LOCAL_MISSING_DRIVER',
        message: `Local position "${ref}" has no driver (DRIVER/CCL/CCR) in its assembly.`,
        ref,
      })
    }
    if (!posRows.some(r => refHasToken(refOf(r), SOCKET_TOKENS))) {
      issues.push({
        severity: 'warning',
        rule: 'LOCAL_MISSING_SITE_SOCKET',
        message: `Local position "${ref}" has no site-side socket at position level (first-fix).`,
        ref,
      })
    }
    if (!posRows.some(r => refHasToken(refOf(r), STRAIN_RELIEF_TOKENS))) {
      issues.push({
        severity: 'warning',
        rule: 'LOCAL_MISSING_STRAIN_RELIEF',
        message: `Local position "${ref}" has no site-side strain relief (SR) at position level.`,
        ref,
      })
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Rule 8 — REMOTE_HAS_SITE_SOCKET
// A remote-driver position (tag 'Remote-CC' / 'Remote-CV') has no local driver,
// so the mains/DALI socket belongs with the remote driver, not the fitting.
// A site-side socket at position level is therefore likely a mistake.
// ---------------------------------------------------------------------------
function checkRemoteNoSiteSocket(rsRows, positionUI) {
  const issues = []

  for (const [ref, ui] of Object.entries(positionUI || {})) {
    const tags = ui.tags || []
    if (!tags.includes('Remote-CC') && !tags.includes('Remote-CV')) continue

    const offending = positionLevelRows(rsRows, ref)
      .filter(r => refHasToken(refOf(r), SOCKET_TOKENS))

    if (offending.length > 0) {
      issues.push({
        severity: 'warning',
        rule: 'REMOTE_HAS_SITE_SOCKET',
        message: `Remote-driver position "${ref}" has a site-side socket at position level — remote positions take no site connector at the fitting.`,
        ref,
      })
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Rule 10 — MISSING_PRODUCT_CODE (soft warning)
// PS rows with no ProductCode and not marked TBC are likely incomplete.
// ---------------------------------------------------------------------------
function checkMissingProductSpecs(psRows) {
  return psRows
    .filter(r => {
      if ((r.IsDeleted || r.isDeleted) === 'Y') return false
      if ((r.IsTBC || r.isTBC) === 'Y') return false
      const code = (r.ProductCode || r.productCode || '').trim()
      return !code
    })
    .map(r => ({
      severity: 'warning',
      rule: 'MISSING_PRODUCT_CODE',
      message: `"${r.ElementTypeRef || r.elementTypeRef}" has no ProductCode and is not marked TBC.`,
      ref: r.ElementTypeRef || r.elementTypeRef || null,
    }))
}

// ---------------------------------------------------------------------------
// Rule — DANGLING_ELEMENT_TYPE_REF
// A recipe or product-spec row references an ElementType that no longer exists
// in the catalogue, or points at one that has been soft-deleted (IsDeleted=Y).
// Surfaces the fallout of a catalogue delete (EXPORT_PLAN §4, settled decision).
// ---------------------------------------------------------------------------
function checkDanglingElementTypeRefs(dbData, psRows, rsRows) {
  const issues = []
  const ets = (dbData && dbData.element_types) || []
  if (ets.length === 0) return issues   // catalogue not loaded — skip

  const live = new Set()
  const deleted = new Set()
  for (const e of ets) {
    const ref = (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase()
    if (!ref) continue
    if ((e.IsDeleted || e.isDeleted) === 'Y') deleted.add(ref)
    else live.add(ref)
  }

  const seen = new Set()
  function check(ref, where) {
    const raw = (ref || '').trim()
    const key = raw.toLowerCase()
    if (!key) return
    // Only flag refs pointing at a soft-deleted catalogue entry — the direct
    // fallout of a catalogue delete. Refs simply absent from the catalogue are
    // the app's existing "recipe-only" concept and handled elsewhere.
    if (!(deleted.has(key) && !live.has(key))) return
    const dedupe = `${key}::${where}`
    if (seen.has(dedupe)) return
    seen.add(dedupe)
    issues.push({
      severity: 'error',
      rule: 'DANGLING_ELEMENT_TYPE_REF',
      message: `${where} references "${raw}", which is deleted in the ElementTypes catalogue.`,
      ref: null,
    })
  }

  for (const r of rsRows) {
    if ((r.IsDeleted || r.isDeleted) === 'Y') continue
    check(r.ElementTypeRef || r.elementTypeRef, 'A recipe row')
    if ((r.ContextType || r.contextType) === 'ElementType') {
      check(r.ContextRef || r.contextRef, 'A recipe container')
    }
  }
  for (const r of psRows) {
    if ((r.IsDeleted || r.isDeleted) === 'Y') continue
    check(r.ElementTypeRef || r.elementTypeRef, 'A product-spec row')
  }

  return issues
}

// ---------------------------------------------------------------------------
// Rule 9 — EXTERIOR_NON_IP_CONNECTOR
// Exterior / IP-rated positions should use IP-rated connectors throughout.
// Warn when a connector row (socket/plug/pin) carries no IP segment in its ref.
// ---------------------------------------------------------------------------
function checkExteriorIPConnectors(rsRows, positionUI) {
  const issues = []

  for (const [ref, ui] of Object.entries(positionUI || {})) {
    const tags = ui.tags || []
    if (!tags.includes('Exterior') && !tags.includes('IP-Rated')) continue

    const connectorRows = allRowsFor(rsRows, ref)
      .filter(r => refHasToken(refOf(r), CONNECTOR_TOKENS))
    if (connectorRows.length === 0) continue

    const nonIp = connectorRows.filter(r => !refHasToken(refOf(r), ['IP']))
    if (nonIp.length > 0) {
      issues.push({
        severity: 'warning',
        rule: 'EXTERIOR_NON_IP_CONNECTOR',
        message: `Exterior position "${ref}" has ${nonIp.length} connector(s) that are not IP-rated (no IP in the ref).`,
        ref,
      })
    }
  }

  return issues
}

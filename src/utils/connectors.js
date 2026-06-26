/**
 * connectors.js — connector role detection and standard connection presets.
 *
 * Connectors are wired in pairs across recipe levels. The conventions (process
 * guide §6 + the seed templates in electron/db.js):
 *   - the SOCKET is free-issued → sits at POSITION level (wired to site)
 *   - its PLUG goes INSIDE the DL element
 *   - strain reliefs (SR) belong at BOTH levels where needed
 * Roles are read from tokens in the element type ref (SOCKET/PLUG by substring,
 * SR by hyphen-segment to avoid matching inside words like DRIVER).
 */

/** Hyphen-delimited, uppercased segments of a ref. */
function segments(ref) {
  return ((ref || '').toUpperCase()).split('-')
}

/**
 * connectorRole(ref) → 'socket' | 'plug' | 'sr' | null
 * SR is checked first (as a whole segment) so an SR ref isn't mis-read as a
 * socket/plug if it also carries those words.
 */
export function connectorRole(ref) {
  if (!ref) return null
  const upper = ref.toUpperCase()
  if (segments(ref).includes('SR') || upper.includes('STRAINRELIEF')) return 'sr'
  if (upper.includes('SOCKET') || segments(ref).includes('SOCK')) return 'socket'
  if (upper.includes('PLUG')) return 'plug'
  return null
}

/** True if the ref looks like any kind of connector. */
export function isConnector(ref) {
  return connectorRole(ref) !== null
}

/**
 * counterpartRef(ref) — the matching half of a socket/plug, by swapping the
 * SOCKET/SOCK ↔ PLUG token in place (case-insensitive, first occurrence).
 * Returns null when the ref isn't a socket or plug.
 */
export function counterpartRef(ref) {
  if (!ref) return null
  const role = connectorRole(ref)
  if (role === 'socket') {
    return ref.replace(/SOCKET/i, 'PLUG').replace(/SOCK(?!ET)/i, 'PLUG')
  }
  if (role === 'plug') {
    return ref.replace(/PLUG/i, 'SOCKET')
  }
  return null
}

/**
 * strainReliefRef(ref) — a suggested SR ref derived from a connector ref by
 * swapping its SOCKET/PLUG token for SR (e.g. ET-SOCKET-5P-01 → ET-SR-5P-01).
 */
export function strainReliefRef(ref) {
  if (!ref) return null
  return ref
    .replace(/SOCKET/i, 'SR')
    .replace(/SOCK(?!ET)/i, 'SR')
    .replace(/PLUG/i, 'SR')
}

/**
 * pinHint(ref) — the pin-count token (e.g. '5P', '5PIN', '2PIN') if present, for
 * matching connectors of the same family. Returns null when none is found.
 */
export function pinHint(ref) {
  const m = (ref || '').toUpperCase().match(/(\d+)\s*P(IN)?/)
  return m ? `${m[1]}P${m[2] ? 'IN' : ''}` : null
}

// ---------------------------------------------------------------------------
// Connection types + attribute composition
//
// A connection type fixes the socket/plug roles and their recipe sections:
//   'position'    — wired to site (free-issued socket + its strain relief)
//   'dl_internal' — inside the DL element (plug, DC pair)
//   'lin_internal'— inside the LIN element
// The wizard composes the final parts from a type + attributes (pin count, IP,
// twin-spot, strain reliefs) rather than a fixed preset list.
// ---------------------------------------------------------------------------

export const CONNECTION_TYPES = [
  {
    id: 'site',
    label: 'Site mains/DALI (socket free-issued)',
    tags: ['Local'],
    defaultPins: '5',
    parts: [
      { slotKey: 'SITE_SOCKET', role: 'socket', section: 'position' },
      { slotKey: 'DRIVER_PLUG', role: 'plug', section: 'dl_internal' },
    ],
  },
  {
    id: 'dc',
    label: 'Driver ↔ fitting (inside DL)',
    tags: ['Local'],
    defaultPins: '2',
    parts: [
      { slotKey: 'DC_SOCKET', role: 'socket', section: 'dl_internal' },
      { slotKey: 'DC_PLUG', role: 'plug', section: 'dl_internal' },
    ],
  },
  {
    id: 'remote',
    label: 'Remote driver (inside DL)',
    tags: ['Remote-CC'],
    defaultPins: '2',
    parts: [
      { slotKey: 'REMOTE_SOCKET', role: 'socket', section: 'dl_internal' },
      { slotKey: 'REMOTE_PLUG', role: 'plug', section: 'dl_internal' },
    ],
  },
  {
    id: 'lin',
    label: 'Linear + locking lever',
    tags: ['LIN'],
    defaultPins: '2',
    parts: [
      { slotKey: 'LIN_SOCKET', role: 'socket', section: 'position' },
      { slotKey: 'LOCKING_LEVER', role: 'lever', section: 'position', token: 'LEVER' },
      { slotKey: 'LIN_PLUG', role: 'plug', section: 'lin_internal' },
    ],
  },
]

/** Look up a connection type by id. */
export function getConnectionType(id) {
  return CONNECTION_TYPES.find(t => t.id === id) || null
}

const ROLE_TOKEN = { socket: 'SOCKET', plug: 'PLUG', sr: 'SR', lever: 'LEVER' }

/**
 * composeConnection({ typeId, pins, ip, twinSpot, includeSR, context })
 * Builds the ordered parts for a connection from a type + attributes.
 * Each part: { role, slotKey, section, token, quantity, optional }.
 * - pins/ip flow into `token` for ref suggestion (e.g. '5P', 'IP')
 * - twinSpot sets quantity 2
 * - includeSR appends an SR part per connector side (derived placement)
 * - context==='element' coerces every section to the ET internals
 */
export function composeConnection({ typeId, pins, ip = false, twinSpot = false, includeSR = false, context = 'position' } = {}) {
  const type = getConnectionType(typeId)
  if (!type) return []
  const pinTok = pins ? `${pins}P` : null
  const ipTok = ip ? 'IP' : null
  const qty = twinSpot ? 2 : null

  const base = type.parts.map(p => ({
    role: p.role,
    slotKey: p.slotKey,
    section: p.section,
    token: [ROLE_TOKEN[p.role] || p.token, pinTok, ipTok].filter(Boolean),
    quantity: qty,
    optional: false,
  }))

  // Strain reliefs: one per connector side, placed at that side's section.
  if (includeSR) {
    const srSections = [...new Set(
      base.filter(p => p.role === 'socket' || p.role === 'plug').map(p => p.section)
    )]
    for (const section of srSections) {
      base.push({
        role: 'sr',
        slotKey: section === 'position' ? 'SITE_SR' : 'DC_SR',
        section,
        token: ['SR', pinTok].filter(Boolean),
        quantity: qty,
        optional: true,
      })
    }
  }

  if (context === 'element') {
    // In an ET editor every part lands in the ET's internal recipe.
    for (const p of base) p.section = 'dl_internal'
  }

  return base
}

/**
 * suggestRefForPart(part, knownRefs) — first known ref matching the part's role
 * tokens (and pin/IP when present); else '' for the user to type. `part.token`
 * may be a string or an array of required tokens.
 */
export function suggestRefForPart(part, knownRefs = []) {
  const tokens = (Array.isArray(part.token) ? part.token : [part.token])
    .filter(Boolean)
    .map(t => t.toUpperCase())
  if (tokens.length === 0) return ''
  const match = knownRefs.find(r => {
    const u = r.toUpperCase()
    return tokens.every(t => u.includes(t))
  })
  if (match) return match
  // Fall back to matching just the role token (first token)
  return knownRefs.find(r => r.toUpperCase().includes(tokens[0])) || ''
}

// ---------------------------------------------------------------------------
// Connector gap analysis (powers the reactive suggestions panel)
// ---------------------------------------------------------------------------

/**
 * connectorGaps(grouped) — analyse a position's grouped recipe
 * ({ position, dlInternal, linInternal }) and return the connector gaps:
 *   - every socket needs its plug (placed inside the DL when the socket is at
 *     position level)
 *   - every plug needs its socket (placed at position level — the free-issued
 *     socket)  ← symmetric pairing
 *   - optional strain-relief gaps (flagged optional, never block completeness)
 * Each gap: { kind:'plug'|'socket'|'sr', ref, section, label, optional, sourceRef }
 */
export function connectorGaps(grouped) {
  const refOf = r => r.elementTypeRef || r.ElementTypeRef || ''
  const sections = [
    { key: 'position', label: 'position level', rows: grouped.position || [] },
    { key: 'dl_internal', label: 'the DL element', rows: grouped.dlInternal || [] },
    { key: 'lin_internal', label: 'the LIN element', rows: grouped.linInternal || [] },
  ]
  const all = [...(grouped.position || []), ...(grouped.dlInternal || []), ...(grouped.linInternal || [])]
  const eq = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase()
  const has = ref => all.some(r => eq(refOf(r), ref))
  const labelFor = key => key === 'dl_internal' ? 'the DL element'
    : key === 'lin_internal' ? 'the LIN element' : 'position level'

  const gaps = []
  const seen = new Set()
  const push = g => { if (!seen.has(g.kind + g.ref + g.section)) { seen.add(g.kind + g.ref + g.section); gaps.push(g) } }

  for (const section of sections) {
    for (const row of section.rows) {
      const ref = refOf(row)
      const role = connectorRole(ref)

      if (role === 'socket') {
        const plug = counterpartRef(ref)
        if (plug && !has(plug)) {
          // free-issued socket at position → plug goes in the DL; otherwise same level
          const target = section.key === 'position' ? 'dl_internal' : section.key
          push({ kind: 'plug', ref: plug, section: target, sourceRef: ref, optional: false,
            label: `Add matching plug ${plug} in ${labelFor(target)}` })
        }
      } else if (role === 'plug') {
        const socket    = counterpartRef(ref)                    // legacy: PLUG → SOCKET
        const sockAlt   = ref.replace(/PLUG/gi, 'SOCK')         // abstract: PLUG → SOCK
        if (!has(socket) && !has(sockAlt)) {
          // a plug in the DL implies the free-issued socket at position level
          const target     = section.key === 'dl_internal' ? 'position' : section.key
          // Prefer SOCK form for refs using NNPin convention (abstract refs)
          const suggestRef = /\dPIN/i.test(ref) ? sockAlt : socket
          push({ kind: 'socket', ref: suggestRef, section: target, sourceRef: ref, optional: false,
            label: `Add matching socket ${suggestRef} at ${labelFor(target)}` })
        }
      }
    }
    // SR hints removed: connector templates include SR explicitly, and
    // LOCAL_MISSING_STRAIN_RELIEF validation catches genuinely absent SRs.
  }

  return gaps
}

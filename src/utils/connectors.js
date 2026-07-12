/**
 * connectors.js — "does this ref look like a connector?", and nothing more.
 *
 * This file used to also hold a library of connection PRESETS (CONNECTION_TYPES,
 * composeConnection, suggestRefForPart) that guessed a connector's parts from token/role
 * matching — 5-pin, IP-rated, twin-spot, include-strain-reliefs — and a wizard composed a
 * recipe out of them.
 *
 * That whole approach is gone. Connectors are now Connector Templates: real, named, tagged
 * ingredient sets the user defines, applied and audited through the coverage matrix
 * (ConnectorsScreen → CoverageMatrix → collectionStatus). A template says what a position
 * SHOULD carry because someone decided it, not because a ref happened to contain "SOCKET".
 * Gap analysis moved to connectorGapsForPosition() for exactly that reason.
 *
 * What survives is the one thing that is genuinely a property of the ref itself: whether it
 * names a connector at all. formSpec uses it to classify a recipe row the Form never
 * mentioned as derived detail rather than a defect.
 *
 * Roles are read from tokens in the ref (SOCKET/PLUG by substring, SR by hyphen-segment, so
 * it cannot match inside a word like DRIVER).
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

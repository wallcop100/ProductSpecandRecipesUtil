/**
 * tagEngine.js
 * Derives classification tags from DB fields on a position type.
 */

/**
 * Derive tags for a single position type from its DB fields.
 *
 * @param {object} positionType - { PositionTypeRef, DriverLocation, SecondaryPowerType, ControlTypeRef, 'SecondaryPowerNodes_+ve' }
 * @returns {{ tags: string[], confidence: 'high'|'medium'|'low', source: object }}
 */
export function deriveTagsForPosition(positionType) {
  const ref = (positionType.PositionTypeRef || '').toUpperCase()
  const driverLocation = positionType.DriverLocation || null
  const secondaryPowerType = positionType.SecondaryPowerType || null
  const controlTypeRef = positionType.ControlTypeRef || null
  const nodes = positionType['SecondaryPowerNodes_+ve']

  const tags = []
  const sources = {}
  // Track per-tag confidence levels so we can compute the overall level
  const confidenceLevels = []

  // --- FittingType tag ---
  let fittingTag = 'DL'
  let fittingSource = 'default'
  let fittingConfidence = 'low'

  if (ref.includes('LIN')) {
    fittingTag = 'LIN'
    fittingSource = 'ref_inference'
    fittingConfidence = 'medium'
  } else if (ref.includes('PANEL')) {
    fittingTag = 'PANEL'
    fittingSource = 'ref_inference'
    fittingConfidence = 'medium'
  } else if (ref.includes('PS')) {
    fittingTag = 'PS'
    fittingSource = 'ref_inference'
    fittingConfidence = 'medium'
  }

  tags.push(fittingTag)
  sources.FittingType = { tag: fittingTag, source: fittingSource }
  confidenceLevels.push(fittingConfidence)

  // --- Driver tag ---
  let driverTag = null
  let driverConfidence = 'low'

  if (driverLocation === 'Local') {
    driverTag = 'Local'
    driverConfidence = 'high'
  } else if (driverLocation === 'Remote') {
    if (secondaryPowerType === 'CC') {
      driverTag = 'Remote-CC'
      driverConfidence = 'high'
    } else if (secondaryPowerType === 'CV') {
      driverTag = 'Remote-CV'
      driverConfidence = 'high'
    } else {
      // Remote but power type unknown
      driverTag = 'No-Driver'
      driverConfidence = 'low'
    }
  } else {
    driverTag = 'No-Driver'
    driverConfidence = 'low'
  }

  tags.push(driverTag)
  sources.Driver = { tag: driverTag }
  confidenceLevels.push(driverConfidence)

  // --- Wiring tag ---
  let wiringTag = null
  let wiringConfidence = 'high'

  if (controlTypeRef === 'DALI') {
    wiringTag = '5Pin-DALI'
  } else if (controlTypeRef === 'TE') {
    wiringTag = '3Pin-TE'
  } else if (controlTypeRef === 'TW') {
    wiringTag = '4Pin-TW'
  } else if (controlTypeRef === 'LOCAL') {
    // CV systems don't need a pin-count wiring tag
    wiringTag = null
  } else if (controlTypeRef !== null) {
    // Unknown control type — don't add a tag but note low confidence
    wiringTag = null
    wiringConfidence = 'low'
  }

  if (wiringTag !== null) {
    tags.push(wiringTag)
    sources.Wiring = { tag: wiringTag }
    confidenceLevels.push(wiringConfidence)
  }

  // --- Special tags ---
  const nodesValue = nodes !== undefined && nodes !== null ? String(nodes) : null

  if (nodesValue === '2') {
    tags.push('TwinSpot')
    sources.TwinSpot = { tag: 'TwinSpot' }
    confidenceLevels.push('high')
  }

  const upperRef = ref.toUpperCase()
  if (upperRef.includes('EXT') || upperRef.includes('IP')) {
    tags.push('Exterior')
    sources.Exterior = { tag: 'Exterior', source: 'ref_inference' }
    confidenceLevels.push('medium')
  }

  // --- Overall confidence ---
  let confidence = 'high'
  if (confidenceLevels.includes('low')) {
    confidence = 'low'
  } else if (confidenceLevels.includes('medium')) {
    confidence = 'medium'
  }

  return {
    tags,
    confidence,
    source: sources,
  }
}

/**
 * Derive tags for all position types.
 *
 * @param {object[]} positionTypes
 * @returns {{ [ref: string]: { tags: string[], confidence: string, source: object } }}
 */
export function deriveTagsForAll(positionTypes) {
  const result = {}
  for (const pt of positionTypes) {
    const ref = pt.PositionTypeRef
    result[ref] = deriveTagsForPosition(pt)
  }
  return result
}

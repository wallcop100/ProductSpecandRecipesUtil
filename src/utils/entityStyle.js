/**
 * Shared visual language for entity types.
 *
 * Anything whose ContextType / EntityType is `ElementType` is rendered in the
 * orange accent; `PositionType` in the blue accent. Collections (container ETs)
 * carry the `grain` icon; plain elements `select_all`; positions `tab_unselected`;
 * and anything with internal contents `category`.
 */

// Accent (text/border) + fill (background) per type.
export const TYPE_COLORS = {
  ElementType:  { accent: '#bf6018', fill: '#ffeddb' },
  PositionType: { accent: '#4e7594', fill: '#e2f8fe' },
}

// Material icon names used across the entity surfaces.
export const ICONS = {
  position:   'tab_unselected',
  element:    'select_all',
  collection: 'grain',
  contents:   'category',
}

/** Colours for a ContextType / EntityType value, defaulting to ElementType. */
export function colorsForType(type) {
  return TYPE_COLORS[type] || TYPE_COLORS.ElementType
}

/**
 * Pick the icon for an entity given its type and whether it is a collection
 * (virtual container). Collections always win — a container element reads as a
 * collection first.
 */
export function iconForEntity({ type = 'ElementType', isCollection = false } = {}) {
  if (isCollection) return ICONS.collection
  return type === 'PositionType' ? ICONS.position : ICONS.element
}

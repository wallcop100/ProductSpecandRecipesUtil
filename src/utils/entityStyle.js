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

/**
 * ACTION_ICONS — the single source of truth mapping a UI action/state to its
 * Material Icons ligature. Use these everywhere so the same action always reads
 * the same glyph (replaces the old mix of unicode/emoji pseudo-icons).
 */
export const ACTION_ICONS = {
  // navigation
  back:        'arrow_back',
  forward:     'arrow_forward',
  external:    'open_in_new',
  separator:   'chevron_right',
  expand:      'expand_more',
  collapse:    'chevron_right',
  expandAll:   'unfold_more',
  collapseAll: 'unfold_less',
  drawerOpen:  'chevron_left',
  drawerClose: 'chevron_right',
  // editing
  copy:        'content_copy',
  paste:       'content_paste',
  add:         'add',
  addToSpec:   'playlist_add',
  remove:      'close',
  delete:      'delete',
  edit:        'edit_note',
  drag:        'drag_indicator',
  more:        'more_horiz',
  moveUp:      'arrow_upward',
  moveDown:    'arrow_downward',
  undo:        'undo',
  redo:        'redo',
  suggest:     'auto_awesome',
  // domain actions
  template:    'edit_note',
  productSpec: 'list_alt',
  tags:        'sell',
  validate:    'rule',
  saveTemplate:'bookmark_add',
  review:      'checklist',
  favorite:    'star',
  favoriteOff: 'star_border',
  container:   'inventory_2',
  // status
  complete:    'check_circle',
  incomplete:  'radio_button_unchecked',
  partial:     'warning',
  missing:     'cancel',
  na:          'remove',
  showDeleted: 'visibility',
  hideDeleted: 'visibility_off',
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

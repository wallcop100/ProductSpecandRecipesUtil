/**
 * Colour tokens — the only colours a component may name.
 *
 * Meaning, not decoration: accent = action/selection/active; attn = needs a decision;
 * danger = blocks export or destructive; success = ✓ icon only. Everything else is a neutral.
 * companion purple = anything learned from or served by the companion: a card shows it with `.companion-card`
 * (glistening purple outline), a lone item with `.companion-dot` — never both. Both live in debug.css.
 * Entity colours (ElementType orange, PositionType blue) live in utils/entityStyle.js.
 */
export const C = {
  // neutrals
  ink:        '#212529',
  muted:      '#6c757d',
  faint:      '#adb5bd',
  border:     '#dee2e6',
  subtle:     '#f8f9fa',
  surface:    '#ffffff',
  // accent blue
  accent:     '#0d6efd',
  accentTint: '#e7f1ff',
  accentEdge: '#b6d4fe',
  accentInk:  '#084298',
  // attention amber
  attnTint:   '#fff3cd',
  attn:       '#ffc107',
  attnInk:    '#664d03',
  // danger red
  danger:     '#dc3545',
  dangerTint: '#f8d7da',
  dangerInk:  '#842029',
  // companion purple — anything learned from or linked to the companion
  companion:  '#8b5cf6',
  // quiet lavender for an ElementType ref pill in a list: reads as a label, not a call to action
  refTint:    '#f0ecfb',
  refInk:     '#5b3fa8',
  // ✓ only
  success:    '#198754',
}

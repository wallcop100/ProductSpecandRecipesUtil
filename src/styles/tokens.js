/**
 * Colour tokens — the only colours a component may name.
 *
 * Meaning, not decoration: accent = action/selection/active; attn = needs a decision;
 * danger = blocks export or destructive; success = ✓ icon only. Everything else is a neutral.
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
  // ✓ only
  success:    '#198754',
}

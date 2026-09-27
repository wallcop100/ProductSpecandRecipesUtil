/**
 * productLines.js — product lines whose KIND is known from research, not from a code shape.
 *
 * One-off makers never reach the code-shape table (a shape needs two agreeing codes), so a
 * row's main code from these lines is filed by its maker AND the line's name in the Form's
 * text. Never by maker alone: Atea's rails and fixing sets are not its flexible lines.
 * Only the main code of a row is filed this way; its extras keep their own words.
 */
export const PRODUCT_LINES = [
  // "Mini dot-free flexible LED light lines" — atea.fr/4411, atea.fr/4331
  { maker: /\batea\b/i, line: /\bNEO\b/i, family: 'ET-LIN-FLEX', head: 'ET-LIN-FLEX' },
  // Surface-mounted modular linear in extruded aluminium — formalighting.com Microline 7x5
  { maker: /\bforma\s*lighting\b|\bformalighting\b/i, line: /\bMICROLINE\b/i, family: 'ET-LIN-FIXED', head: 'ET-LIN-FIXED' },
  // Flexible linear range — tryka.com/product-category/flexible/continuity
  { maker: /\btryka\b/i, line: /\bCONTINUITY\b/i, family: 'ET-LIN-FLEX', head: 'ET-LIN-FLEX' },
  // Light and track in one — professional.flos.com The Glowing Track; filed as track (as 4343
  // files its integral track luminaire).
  { maker: /\bflos\b/i, line: /\bGLOWING\s+TRACK\b/i, family: 'ET-TRACK', head: 'ET-TRACK' },
]

/** The known line this main code belongs to, or null. */
export function productLineFor(manufacturer, text) {
  return PRODUCT_LINES.find(p => p.maker.test(String(manufacturer ?? '')) && p.line.test(String(text ?? ''))) || null
}

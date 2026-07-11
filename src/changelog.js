/**
 * changelog.js — the one-line "what changed" shown on the start page.
 *
 * It exists so a fresh deploy is visibly distinguishable: if the top line's date/note
 * moved, you are looking at a new build (past a stale cache). Newest first; add ONE line
 * whenever you ship something user-facing. Keep each note short — it renders on a single
 * line under the title.
 */
export const CHANGELOG = [
  { date: '2026-07-11', note: 'Fix-validation step can flag a position (or its family) as "no recipe needed" right there' },
  { date: '2026-07-11', note: 'Recipe rows: one fork icon everywhere; shared-ET is a quiet icon, and never doubles up inside a wrapper' },
  { date: '2026-07-11', note: 'Import: stage result pops a modal; shared-ElementType fork lives in the builder' },
  { date: '2026-07-11', note: 'Fixed the DesignDB patch freeze, the dev sql.js load, and identical sort orders' },
]

export const LATEST = CHANGELOG[0]

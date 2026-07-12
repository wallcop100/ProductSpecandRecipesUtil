/**
 * changelog.js — the one-line "what changed" shown on the start page.
 *
 * It exists so a fresh deploy is visibly distinguishable: if the top line's date/note
 * moved, you are looking at a new build (past a stale cache). Newest first; add ONE line
 * whenever you ship something user-facing. Keep each note short — it renders on a single
 * line under the title.
 */
export const CHANGELOG = [
  { date: '2026-07-12', note: 'Import + Product Spec tutorials rebuilt: drag-a-brush over continuous text, and the real split-panel browser/editor' },
  { date: '2026-07-12', note: 'Strain-relief warning no longer fires on positions with no connectors; tutorial scenes rebuilt against the real rendered DOM' },
  { date: '2026-07-12', note: 'Tutorial scenes now mirror the real panes and use the real refs (A02m, C01r, ET-LIN-01) — the pointer is anchored, not guessed' },
  { date: '2026-07-12', note: 'Every pane now has a tutorial card: auto-opens once, replays from the ? chip, an animated demo of what the pane can do' },
  { date: '2026-07-11', note: 'New landing page: it IS the project list. Re-picking a folder no longer forks a duplicate; projects can be named' },
  { date: '2026-07-11', note: 'Form spec: a pending product can be merged into an ElementType the recipe already has, instead of only "Create"' },
  { date: '2026-07-11', note: 'Removed the old built-in "Connector Sets" templates (2/3/4/5-Pin × Local/Remote) — the Connectors screen owns that' },
  { date: '2026-07-11', note: 'Built-in templates drop their connector slots — the connector wizard owns sockets, plugs and strain reliefs now' },
  { date: '2026-07-11', note: '"Like this" palette tab: when the Form is silent on a position, compare and borrow rows from comparable ones' },
  { date: '2026-07-11', note: 'Builder: the duplicate Navigator drawer is gone; palette opens with a position; Validation + Done? are one Status button' },
  { date: '2026-07-11', note: 'Validation no longer demands a socket/strain-relief on projects that use no connectors' },
  { date: '2026-07-11', note: 'Fix-validation step can flag a position (or its family) as "no recipe needed" right there' },
  { date: '2026-07-11', note: 'Recipe rows: one fork icon everywhere; shared-ET is a quiet icon, and never doubles up inside a wrapper' },
  { date: '2026-07-11', note: 'Import: stage result pops a modal; shared-ElementType fork lives in the builder' },
  { date: '2026-07-11', note: 'Fixed the DesignDB patch freeze, the dev sql.js load, and identical sort orders' },
]

export const LATEST = CHANGELOG[0]

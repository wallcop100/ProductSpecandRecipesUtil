/**
 * positionHealth.js: the one answer to "how is this position?", for the rail and the editor header.
 * Priority: validation error (red) > a
 * suggestion waiting (purple) > validation warning or a Form gap (amber) > done (green). No recipe, not in the Form and ignored stay grey:
 * they are not faults. `status` is usePositionList's statusOf (shared with the toolbar Form chip).
 */
export const STATUS_LABEL = {
  empty: 'No recipe yet',
  form: 'The Form asks for something it lacks, or a code needs an ElementType',
  done: 'Has a recipe, nothing outstanding',
  notInForm: 'No recipe — the Form asks for nothing here',
  ignored: 'Ignored',
}

export function positionHealth({ status, issues: all = [], companion = false }) {
  // No recipe is grey, not red: "no IsDesign row" is true of every empty position and says nothing more.
  const noRecipe = status === 'empty' || status === 'notInForm'
  const issues = noRecipe ? all.filter(i => i.rule !== 'MISSING_IS_DESIGN') : all
  const reasons = issues.map(i => ({ kind: 'validation', severity: i.severity === 'error' ? 'error' : 'warning', message: i.message }))
  if (status === 'form') reasons.push({ kind: 'form', severity: 'warning', message: STATUS_LABEL.form })
  if (status !== 'done' && STATUS_LABEL[status]) reasons.push({ kind: 'status', severity: 'info', message: STATUS_LABEL[status] })
  if (companion) reasons.push({ kind: 'companion', severity: 'info', message: 'There are suggestions for this recipe' })
  const has = s => reasons.some(r => r.severity === s)
  const level = has('error') ? 'red' : companion ? 'purple' : has('warning') ? 'amber' : status === 'done' ? 'green' : 'grey'
  return { level, reasons }
}

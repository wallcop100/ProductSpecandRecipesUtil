/**
 * The windows Find can ask the builder to open (useStore.requestUi(kind) → BuilderScreen).
 * One list, so a test can hold the registry (help/actions.js) and the builder to the same names.
 */
export const UI_REQUESTS = [
  'export', 'status', 'review', 'formBuild', 'styles', 'saveTemplate', 'tags', 'etWindow', 'retireUnused',
  'linWizard', 'dupET', 'backup', 'fixer', 'elementsView', 'positionsView', 'drawer',
]

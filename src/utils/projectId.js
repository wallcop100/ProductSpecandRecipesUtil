/**
 * projectId.js — extract a project number from a filename.
 *
 * Project files usually embed a 4–6 digit job number. We surface the first such
 * run of digits as a suggestion; the user always confirms or overrides it.
 */

const PROJECT_ID_RE = /(?<ProjectID>[4-6][0-9][0-9][0-9])/

/**
 * extractProjectId(filename) → the matched digit run, or '' when none is found.
 */
export function extractProjectId(filename) {
  if (!filename) return ''
  const m = String(filename).match(PROJECT_ID_RE)
  return m?.groups?.ProjectID || ''
}

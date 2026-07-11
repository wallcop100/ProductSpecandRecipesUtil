/**
 * projectIdentity.js — telling projects apart, and putting back together the ones that were
 * accidentally split in two.
 *
 * A project row is (folder_path, config_name). `folder_path` is an opaque directory-handle
 * id; `config_name` is an overlay over the same workbooks ("Base", "Phase 2"). Two configs
 * of one folder read the IDENTICAL Excel files and differ only in what the tool knows that
 * Excel does not — tags, templates, collections, unexported changes.
 *
 * Picking a folder used to mint a fresh handle id every time, so re-picking a project you
 * already had forked a second, empty copy of it. This module holds the pure parts of
 * recognising that and collapsing it back.
 */

const lc = s => String(s ?? '').trim().toLowerCase()

export const UNASSIGNED = 'Unassigned'

/**
 * uniqueConfigName(existing, wanted) → a name not already taken.
 *
 * `UNIQUE(folder_path, config_name)` is a real constraint: moving a stray project onto the
 * canonical folder would violate it if its config name were already there. "Base" becomes
 * "Base (2)". This is the guard that keeps the adoption from throwing.
 */
export function uniqueConfigName(existing = [], wanted = 'Base') {
  const taken = new Set(existing.map(lc))
  const base = String(wanted ?? '').trim() || 'Base'
  if (!taken.has(lc(base))) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`
    if (!taken.has(lc(candidate))) return candidate
  }
}

/** Does this project hold any work of its own? */
export function holdsWork(p) {
  return (p?.unexported ?? 0) > 0 || (p?.taggedPositions ?? 0) > 0 || (p?.overlayRows ?? 0) > 0
}

/**
 * groupProjects(summaries) → [{ number, projects: [...] }]
 *
 * Grouped by project number so the configs of one job sit together. Configs newest-first —
 * the one you were last in is the one you want. Numberless projects last: they are the ones
 * whose filename never yielded a job number, not a category of their own.
 */
export function groupProjects(summaries = []) {
  const by = new Map()
  for (const p of summaries) {
    const number = String(p.project_number ?? '').trim() || UNASSIGNED
    if (!by.has(number)) by.set(number, [])
    by.get(number).push(p)
  }

  const recency = (a, b) => String(b.last_opened ?? '').localeCompare(String(a.last_opened ?? ''))
  const groups = [...by.entries()].map(([number, projects]) => ({
    number,
    projects: [...projects].sort(recency),
  }))

  return groups.sort((a, b) => {
    if (a.number === UNASSIGNED) return 1
    if (b.number === UNASSIGNED) return -1
    // most recently touched job first — you came back for a reason
    return recency(a.projects[0], b.projects[0])
  })
}

/**
 * adoptPlan(canonical, strays) → [{ id, action: 'rekey' | 'delete', configName? }]
 *
 * How to collapse several project rows that turned out to be the same folder.
 *
 * A stray that holds work is RE-KEYED, never merged. Every overlay table hangs off
 * `project_id`, not `folder_path` — so moving the row onto the canonical folder carries its
 * tags, templates, collections and unexported changes with it, intact, and it simply becomes
 * another CONFIG of the one project. That is the mechanism the schema already has.
 *
 * Merging two overlays — two sets of tags, two pending queues — is where data dies. It is
 * never proposed. A stray that holds nothing (the usual case, since the bug minted EMPTY
 * copies) is offered for deletion instead.
 *
 * `canonical` and `strays` are project summaries: { id, config_name, unexported, taggedPositions }.
 */
export function adoptPlan(canonical, strays = []) {
  if (!canonical) return []
  // Names already spoken for on the canonical folder — including the ones we are about to take.
  const taken = [canonical.config_name]
  const out = []

  for (const s of strays) {
    if (!s || s.id === canonical.id) continue
    if (!holdsWork(s)) {
      out.push({ id: s.id, action: 'delete', configName: s.config_name })
      continue
    }
    const configName = uniqueConfigName(taken, s.config_name || 'Base')
    taken.push(configName)
    out.push({ id: s.id, action: 'rekey', configName })
  }
  return out
}

/**
 * Which row of a duplicate set is the real project? The one with the most work in it —
 * losing a rename is annoying, losing unexported changes is a disaster. Recency breaks ties.
 */
export function pickCanonical(projects = []) {
  const weight = p => (p.unexported ?? 0) * 100 + (p.taggedPositions ?? 0) + (p.overlayRows ?? 0)
  return [...projects].sort((a, b) =>
    weight(b) - weight(a) ||
    String(b.last_opened ?? '').localeCompare(String(a.last_opened ?? ''))
  )[0] ?? null
}

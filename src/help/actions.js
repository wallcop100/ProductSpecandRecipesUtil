/**
 * actions.js — everything Find (Ctrl+K) can do. What each action DOES lives here; what it is
 * CALLED — its title, the words people type for it, its one-line how, its area — lives in
 * help/terms.json, which Orion /psr → Find edits (live beside a companion, then a pull request).
 *
 * Each action takes you to the place that does it, already open on the thing you named, or does it
 * on the spot. "rename ET-PS-MINI-TINI" → the Product Spec on that ElementType with its ref field
 * open and ET-PS-MINI-TINI-01 typed in.
 *
 *   id      stable; terms.json, outcomes and tests name it
 *   run     (ctx) → does it; ctx in help/run.js
 *   when    (state) → false hides it (nothing to export, no project open)
 *   cli     the `psr` command doing the same, when there is one
 *   screen  where it lives, to rank it first there
 *   inPlace runs on the spot (no navigation)
 *   titleOf (ref, state) → a title that depends on the state (overrides terms.json's)
 *
 *   buildActions(overrides) → the searchable actions: terms.json (+ the live overrides) joined to
 *   what each does; an id in terms.json with no behaviour here is left out, and vice versa.
 */
import { TUTORIALS } from '../tutorial/tutorials'
import { refNumberFix } from '../utils/specSuggest'
import BASE_TERMS from './terms.json'
import { mergeTerms, actionsFromTerms } from './terms'

const pending = s => (s.psChanges?.length || 0) + (s.rsChanges?.length || 0) + (s.dbChanges?.length || 0)

export const AREAS = {
  et: 'ElementTypes', spec: 'Product Spec', recipe: 'Positions & recipes', template: 'Templates & collections',
  connector: 'Connectors', tag: 'Tags', import: 'Import & the Form', export: 'Export, patches & sync',
  check: 'Checks & status', project: 'Project & data', help: 'Help & feedback',
}

export const BEHAVIOUR = [
  // ---- ElementTypes
  { id: 'et.rename', screen: 'product-spec', cli: 'psr et rename <ref> <newRef>',
    run: c => c.spec(c.ref, 'rename', c.ref ? refNumberFix({ ElementTypeRef: c.ref }, c.s.elementTypes)?.ref || null : null) },
  { id: 'et.family', screen: 'product-spec', cli: 'psr et move-family <family> <ref…> [--no-renumber]', run: c => c.spec(c.ref, 'family') },
  { id: 'et.create', screen: 'builder', cli: 'psr et create <ref> [--name] [--family]', run: c => c.host('newET', { posRef: c.s.activePositionRef || null }) },
  { id: 'et.fork', screen: 'product-spec', cli: 'psr et fork <ref>',
    run: c => { if (!c.ref) return c.go('product-spec'); const r = c.s.forkElementType(c.ref); c.spec(r || c.ref) } },
  { id: 'et.delete', screen: 'product-spec', cli: 'psr et delete <ref> [--with-spec]', run: c => c.ui('etWindow') },
  { id: 'et.retire', screen: 'builder', cli: 'psr ets --unused', run: c => c.ui('retireUnused') },
  { id: 'et.window', screen: 'builder', run: c => c.ui('etWindow') },
  { id: 'et.browse', screen: 'builder', run: c => c.ui('elementsView') },
  { id: 'et.swap', screen: 'builder', cli: 'psr swap <fromET> <toET> [--position ref]', run: c => (c.ref ? c.host('swap', { fromRef: c.ref }) : c.go('builder')) },
  { id: 'et.merge', screen: 'builder', run: c => (c.ref ? c.host('swap', { fromRef: c.ref }) : c.ui('retireUnused')) },
  { id: 'et.wrapper', screen: 'builder', run: c => { if (c.ref) { c.s.openETRecipe?.(c.ref); c.go('builder') } else c.ui('elementsView') } },
  { id: 'et.usedin', screen: 'product-spec', cli: 'psr et <ref>', run: c => c.spec(c.ref) },
  { id: 'et.families', screen: 'builder', run: c => c.ui('export') },
  { id: 'et.master', screen: 'builder', run: c => c.ui('export') },
  { id: 'et.styleguide', screen: 'product-spec', run: c => c.go('product-spec') },
  { id: 'et.linwizard', screen: 'builder', run: c => c.ui('linWizard') },
  { id: 'et.dup', screen: 'builder', run: c => c.ui('dupET') },
  // ---- Product Spec
  { id: 'spec.code', screen: 'product-spec', cli: 'psr spec set <ref> Manufacturer=… ProductCode=…', run: c => c.spec(c.ref) },
  { id: 'spec.tbc', screen: 'product-spec', cli: 'psr spec set <ref> IsTBC=Y', run: c => c.spec(c.ref) },
  { id: 'spec.na', screen: 'product-spec',
    run: c => { if (c.ref) c.s.updatePSRow(c.ref, { Manufacturer: 'Ideaworks', ProductCode: 'N/A' }); c.spec(c.ref) } },
  { id: 'spec.wrappers', screen: 'builder', run: c => c.ui('export') },
  { id: 'spec.elsewhere', screen: 'product-spec', run: c => c.spec(c.ref) },
  { id: 'spec.missing', screen: 'product-spec', cli: 'psr spec --missing', run: c => c.go('product-spec') },
  { id: 'spec.duplicates', screen: 'product-spec', run: c => c.go('product-spec') },
  { id: 'spec.retired', screen: 'product-spec', run: c => c.go('product-spec') },
  { id: 'spec.bulkmaker', screen: 'product-spec', run: c => c.go('product-spec') },
  { id: 'spec.skip', screen: 'product-spec', run: c => c.go('product-spec') },
  { id: 'spec.open', screen: 'product-spec', run: c => c.go('product-spec') },
  // ---- Positions & recipes
  { id: 'pos.open', screen: 'builder', cli: 'psr position <ref>', run: c => c.openPosition(c.pos) },
  { id: 'pos.add', screen: 'builder', cli: 'psr recipe add <position> <etRef>',
    run: c => { if (c.pos) c.s.setActivePosition(c.pos); c.ui('drawer', { tab: 'palette' }) } },
  { id: 'pos.copy', screen: 'builder', cli: 'psr copy <from> <to>', run: c => c.openPosition(c.pos) },
  { id: 'pos.fork', screen: 'builder', run: c => (c.pos ? c.host('forkPosition', { sourceRef: c.pos }) : c.go('builder')) },
  { id: 'pos.ignore', screen: 'builder', cli: 'psr ignore <position>', inPlace: true, run: c => { if (c.pos) c.s.toggleIgnorePosition(c.pos) } },
  { id: 'pos.suggest', screen: 'builder', run: c => c.openPosition(c.pos) },
  { id: 'pos.qty', screen: 'builder', cli: 'psr recipe update <position> <row> Quantity=…', run: c => c.openPosition(c.pos) },
  { id: 'pos.flags', screen: 'builder', run: c => c.openPosition(c.pos) },
  { id: 'pos.remove', screen: 'builder', cli: 'psr recipe remove <position> <row>', run: c => c.openPosition(c.pos) },
  { id: 'pos.deleted', screen: 'builder', inPlace: true, run: c => c.s.toggleShowDeleted(),
    titleOf: (ref, s) => (s?.showDeleted ? 'Hide removed rows' : null) },
  { id: 'pos.shared', screen: 'builder', inPlace: true, run: c => c.s.toggleSharedEverywhere() },
  { id: 'pos.wrapper', screen: 'builder', run: c => c.openPosition(c.pos) },
  { id: 'pos.empty', screen: 'builder', run: c => { c.s.setPositionList({ emptyOnly: true }); c.ui('positionsView') } },
  { id: 'pos.formonly', screen: 'builder', run: c => { c.s.setPositionList({ formOnly: true }); c.ui('positionsView') } },
  { id: 'pos.ignored', screen: 'builder', run: c => { c.s.setPositionList({ showIgnored: true }); c.ui('positionsView') } },
  { id: 'pos.similar', screen: 'builder', run: c => { if (c.pos) c.s.setActivePosition(c.pos); c.ui('drawer', { tab: 'similar' }) } },
  { id: 'pos.formpane', screen: 'builder', run: c => { if (c.pos) c.s.setActivePosition(c.pos); c.ui('drawer', { tab: 'form' }) } },
  { id: 'pos.review', screen: 'builder', run: c => c.ui('review') },
  // ---- Templates & collections
  { id: 'tpl.apply', screen: 'builder', cli: 'psr template apply <id|name> <position…>', run: c => c.openPosition(c.pos) },
  { id: 'tpl.save', screen: 'builder', run: c => c.ui('saveTemplate') },
  { id: 'tpl.manage', screen: 'template-editor', run: c => c.go('template-editor') },
  { id: 'tpl.collection', screen: 'builder', cli: 'psr collection apply <id|name> <position…>', run: c => c.go('template-editor') },
  { id: 'tpl.styles', screen: 'builder', run: c => c.ui('styles') },
  { id: 'tpl.formbuild', screen: 'builder', run: c => c.ui('formBuild') },
  // ---- Connectors
  { id: 'conn.open', screen: 'connectors', cli: 'psr connectors', run: c => c.go('connectors') },
  { id: 'conn.position', screen: 'connectors', run: c => { if (c.pos) c.s.setActivePosition(c.pos); c.ui('drawer', { tab: 'connectors' }) } },
  { id: 'conn.global', screen: 'connectors', cli: 'psr connector apply <key> [position…]', run: c => c.go('connectors') },
  { id: 'conn.wago', screen: 'connectors', run: c => c.go('connectors') },
  // ---- Tags
  { id: 'tag.edit', screen: 'builder', run: c => c.ui('tags') },
  { id: 'tag.recompute', screen: 'builder', inPlace: true, run: c => c.s.recomputeAllTags() },
  // ---- Import & the Form
  { id: 'imp.form', screen: 'product-code-import', run: c => c.go('product-code-import') },
  { id: 'imp.compare', screen: 'product-code-import', run: c => c.go('product-code-import') },
  { id: 'imp.columns', screen: 'product-code-import', run: c => c.go('product-code-import') },
  { id: 'imp.refs', screen: 'product-code-import', cli: 'psr position add <ref…>', run: c => c.go('product-code-import') },
  // ---- Export, patches & sync
  { id: 'exp.export', screen: 'builder', cli: 'psr export', when: s => pending(s) > 0, run: c => c.ui('export') },
  { id: 'exp.check', cli: 'psr check --refresh', inPlace: true, run: c => c.s.checkFiles() },
  { id: 'exp.order', run: c => c.ui('export') },
  { id: 'exp.pending', screen: 'builder', run: c => c.ui('export') },
  { id: 'exp.discard', when: s => pending(s) > 0, inPlace: true,
    run: c => { if (window.confirm(`Discard all ${pending(c.s)} unexported changes? This cannot be undone.`)) c.s.discardPendingChanges() } },
  { id: 'exp.undo', cli: 'psr undo', inPlace: true, run: c => c.s.undo() },
  { id: 'exp.redo', cli: 'psr redo', inPlace: true, run: c => c.s.redo() },
  { id: 'exp.save', inPlace: true, run: c => c.saveNow() },
  // ---- Checks & status
  { id: 'chk.validation', screen: 'builder', cli: 'psr validate', run: c => c.ui('status', { tab: 'validation' }) },
  { id: 'chk.done', screen: 'builder', cli: 'psr status', run: c => c.ui('status', { tab: 'done' }) },
  { id: 'chk.fix', screen: 'builder', run: c => c.ui('fixer') },
  { id: 'chk.align', screen: 'builder', run: c => c.ui('export') },
  // ---- Project & data
  { id: 'prj.open', screen: 'folder-setup', cli: 'psr open <project>', run: c => c.go('folder-setup') },
  { id: 'prj.backup', screen: 'builder', run: c => c.ui('backup') },
  { id: 'prj.tree', screen: 'builder', run: c => c.ui('positionsView') },
  // ---- Help & feedback
  { id: 'help.bug', cli: 'psr report "…"', inPlace: true, run: c => c.host('report') },
  { id: 'help.bugmode', inPlace: true, run: c => c.s.setBugMode(true) },
  { id: 'help.shortcuts', inPlace: true, run: c => c.host('shortcuts') },
]
const BY_ID = new Map(BEHAVIOUR.map(b => [b.id, b]))

// One "how does it work" entry per tutorial: the explanations. Their words are their own text.
const TUTORIAL_ACTIONS = Object.entries(TUTORIALS).map(([id, t]) => ({
  id: `tut.${id}`, area: 'help', needs: null, title: () => `How it works: ${t.title}`,
  words: [t.title, t.intro || '', ...(t.steps || []).map(st => st.blurb || '')].map(x => String(x).toLowerCase()),
  how: t.intro || '', run: c => c.tutorial(id), inPlace: true, tutorial: true,
}))

/** The searchable actions: the terms (with Orion's live overrides) joined to what each action does. */
export function buildActions(overrides = null) {
  const terms = mergeTerms(BASE_TERMS, overrides)
  const named = actionsFromTerms(terms).filter(a => BY_ID.has(a.id)).map(a => {
    const b = BY_ID.get(a.id)
    return { ...a, ...b, title: b.titleOf ? (ref, s) => b.titleOf(ref, s) || a.title(ref) : a.title }
  })
  return { actions: [...named, ...TUTORIAL_ACTIONS], synonyms: terms.synonyms || {} }
}

const BUILT = buildActions()
export const ACTIONS = BUILT.actions
export const SYNONYMS = BUILT.synonyms
export const ACTION_BY_ID = new Map(ACTIONS.map(a => [a.id, a]))

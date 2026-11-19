/**
 * formImpact.js — what a Form revision means for ONE position's recipe, in-line (JQSFCU).
 *
 * The old side is the comparison base (importDraft.compareBase: the previous Form, or an
 * older one picked from ⋯), the new side the loaded Form (importDraft rows). Rows pair refKey
 * per Form ref (formDiff.matchForms). Each row is read as CODES: words the Product Spec
 * knows name their ElementType; other code-shaped words are codes it does not know yet.
 *
 * Changes for the position:
 *   swap    — an ElementType in the recipe gives way to another the spec knows
 *   respec  — an ElementType in the recipe gives way to a code nobody has yet: its
 *             Product Spec row could take the new code (or a new ElementType is made)
 *   add     — a known code is new to the Form here
 *   remove  — a known code left the Form here
 *   addNew  — a code the spec does not know yet is new here (it needs an ElementType)
 *   dropNew — such a code left the Form here
 *
 * SHARING. An ElementType is one Product Spec row, used by every position whose recipe
 * holds it (inside a shared wrapper too). Changing it in place changes them all. So each
 * swap / respec says who else holds the old ElementType and whether THEIR Form rows make
 * the same change. The rule for a code that changed (respec):
 *   - change the ElementType in place only when every position holding it THAT IS IN THE
 *     FORM changes the same way AND the old code is nowhere in the new Form (`canUpdate`);
 *     positions using it that the Form never mentions change with it (`outsideForm`);
 *   - otherwise the old one stays in use: fork it (a copy carrying the new code) or make a
 *     new ElementType, and swap it in for the positions that change.
 * A row inside a wrapper is the wrapper's: `container` / `wrapperUsers` say whether
 * changing it here would change other positions too. Pure.
 */
import { matchForms, diffRow } from './formDiff'
import { classify } from './productCodes'
import { looksLikeProductCode } from './codeHeuristics'
import { getUsedIn } from './containerUtils'
import { wrapperUsedBy } from './collectionStatus'
import { live, etRefOf, refKey } from './derived'


/**
 * The Product Spec writes a finish into the code ("ZH-INFD-…-54H (Finish: RAL 9010)"); the Form
 * gives the bare code. Without the bare code every finished product read as "never had an
 * ElementType", so Update-in-place and Swap never fired. Only an unambiguous bare code (one
 * ElementType per maker) is added: two finishes of one code are two products.
 */
export function withBareCodes(master = []) {
  const bare = c => String(c).replace(/\s*\([^()]*\)\s*$/, '').trim()
  const groups = new Map()
  for (const x of master) {
    const b = bare(x.code)
    if (b === x.code || !b) continue
    const k = `${refKey(x.manufacturer)} ${refKey(b)}`
    groups.set(k, [...(groups.get(k) || []), { ...x, code: b }])
  }
  const known = new Set(master.map(x => `${refKey(x.manufacturer)} ${refKey(x.code)}`))
  const extra = [...groups].filter(([k, xs]) => !known.has(k) && new Set(xs.map(x => refKey(x.ref))).size === 1).map(([, xs]) => xs[0])
  return extra.length ? [...master, ...extra] : master
}

/** A row's words: the ones the spec knows (→ ElementType), and unknown code-shaped ones. */
export function readCodes(row, master) {
  const known = new Map()   // ET → code
  const unknown = []
  const words = []          // how each word was read, for the trace
  // An "(old code …)" note is not a product; brackets and trailing punctuation are not
  // part of a code: "(FPS2020BG2000)" is FPS2020BG2000 (2EF42C).
  const text = String(row?.rawText || '').replace(/\(\s*old\s+code[^)]*\)/gi, ' ')
  for (const raw of text.split(/[\s,;]+/)) {
    const w = raw.replace(/^[([{"'<]+/, '').replace(/[)\]}"'>.:]+$/, '')
    if (!w || w === '+') continue
    const c = classify(w, { master }, row.manufacturer)
    if (c.elementTypeRef) known.set(c.elementTypeRef, w)
    else if (looksLikeProductCode(w)) unknown.push(w)
    else continue
    words.push({ word: w, status: c.status, ...(c.elementTypeRef || c.masterRef ? { ref: c.elementTypeRef || c.masterRef } : {}),
      ...(c.base && c.status !== 'green' ? { nearest: c.base } : {}), ...(c.otherMaker ? { otherMaker: c.otherMaker.manufacturer } : {}) })
  }
  return { known, unknown, words }
}

/** Rows of a Form (draft rows or base rows) that land on posRef. */
function rowsFor(rows, posRef, targetOf) {
  return (rows || []).filter(r => refKey(targetOf(String(r.formRef ?? r.positionType ?? '').trim())) === refKey(posRef))
}

/** The ElementTypes a position's recipe holds (wrapper contents included), upper-cased. */
function heldBy(recipes, posRef) {
  return new Set(recipes.filter(r => live(r) && (r.PositionTypeRef || r.positionTypeRef) === posRef)
    .map(r => refKey(etRefOf(r))))
}

/**
 * The raw changes for one position: [{ kind, fromEt, toEt, toCode, oldText, newText }].
 * Only swap / respec / remove need the recipe; add is any newly known code.
 */
function rawChanges(posRef, { baseRows, newRows, master, targetOf }) {
  const olds = rowsFor(baseRows, posRef, targetOf).map(diffRow)
  const news = rowsFor(newRows, posRef, targetOf)
  const m = matchForms(olds, news.map(diffRow))
  const out = []
  const pairs = news.map((r, i) => ({ now: r, was: m.rows[i].prev, state: m.rows[i].state }))
  for (const old of m.removed) pairs.push({ now: null, was: old, state: 'removed' })
  for (const { now, was, state } of pairs) {
    if (state === 'unchanged') continue
    const a = was ? readCodes(was, master) : { known: new Map(), unknown: [], words: [] }
    const b = now ? readCodes(now, master) : { known: new Map(), unknown: [], words: [] }
    const gone = [...a.known.keys()].filter(et => !b.known.has(et))
    const came = [...b.known.keys()].filter(et => !a.known.has(et))
    const fresh = b.unknown.filter(w => !a.unknown.map(refKey).includes(refKey(w)) && ![...a.known.values()].map(refKey).includes(refKey(w)))
    const base = { oldText: was?.rawText ?? null, newText: now?.rawText ?? null, maker: now?.manufacturer ?? was?.manufacturer ?? '', read: { was: a.words, now: b.words } }
    // Pair what left with what came, one for one, in order: a product replaced.
    const n = Math.min(gone.length, came.length)
    for (let i = 0; i < n; i++) out.push({ kind: 'swap', fromEt: gone[i], fromCode: a.known.get(gone[i]), toEt: came[i], toCode: b.known.get(came[i]), ...base })
    let rest = gone.slice(n)
    const freshLeft = [...fresh]
    for (const et of rest) {
      if (freshLeft.length) out.push({ kind: 'respec', fromEt: et, fromCode: a.known.get(et), toCode: freshLeft.shift(), ...base })
      else out.push({ kind: 'remove', fromEt: et, fromCode: a.known.get(et), ...base })
    }
    for (const et of came.slice(n)) out.push({ kind: 'add', toEt: et, toCode: b.known.get(et), ...base })
    // Codes the spec does not know yet (3VHRQP): new ones still to give an ElementType, and
    // unknown ones the Form dropped. Without these a changed Form row could show no diff.
    for (const w of freshLeft) out.push({ kind: 'addNew', toCode: w, ...base })
    const nowWords = new Set([...b.unknown, ...b.known.values()].map(refKey))
    for (const w of a.unknown) if (!nowWords.has(refKey(w))) out.push({ kind: 'dropNew', fromCode: w, ...base })
  }
  return out
}

const sameChange = (x, y) => x.kind === y.kind && refKey(x.fromEt) === refKey(y.fromEt)
  && refKey(x.toEt) === refKey(y.toEt) && refKey(x.toCode) === refKey(y.toCode)

/**
 * formImpact({ posRef, baseRows, newRows, recipes, psRows-derived master, targetOf })
 * → [{ kind, fromEt, toEt, toCode, oldText, newText, inRecipe, sharers, changing, notChanging, consistent }]
 * `targetOf(formRef)` → the PositionTypeRef a Form ref lands on.
 */
export function formImpact({ posRef, baseRows = [], newRows = [], recipes = [], master = [], targetOf = r => r }) {
  if (!baseRows.length || !posRef) return []
  master = withBareCodes(master)
  const ctx = { baseRows, newRows, master, targetOf }
  const held = heldBy(recipes, posRef)
  const memo = new Map()
  const changesOf = p => { if (!memo.has(p)) memo.set(p, rawChanges(p, ctx)); return memo.get(p) }
  // Every ElementType the NEW Form still names, anywhere.
  const stillNamed = new Set()
  for (const r of newRows) for (const et of readCodes(r, master).known.keys()) stillNamed.add(refKey(et))
  return changesOf(posRef).map(c => withTrace(posRef, held, (() => {
    if (c.kind === 'addNew' || c.kind === 'dropNew') return { ...c, inRecipe: false, sharers: [], changing: [], notChanging: [], outsideForm: [], consistent: true, canUpdate: false }
    if (c.kind === 'add') return { ...c, inRecipe: held.has(refKey(c.toEt)), sharers: [], changing: [], notChanging: [], outsideForm: [], consistent: true, canUpdate: false }
    const inRecipe = held.has(refKey(c.fromEt))
    const sharers = inRecipe ? getUsedIn(c.fromEt, recipes, posRef) : []
    // Only positions IN the Form have a say: one the Form never mentions keeps nothing and
    // changes nothing there, but an in-place update still reaches it (`outsideForm`).
    const inForm = p => rowsFor(baseRows, p, targetOf).length > 0 || rowsFor(newRows, p, targetOf).length > 0
    const changing = sharers.filter(p => inForm(p) && changesOf(p).some(x => sameChange(x, c)))
    const outsideForm = sharers.filter(p => !inForm(p))
    const notChanging = sharers.filter(p => inForm(p) && !changing.includes(p))
    const consistent = notChanging.length === 0
    const stillInForm = stillNamed.has(refKey(c.fromEt))
    // Where this position holds it: on site, or inside a wrapper (and who else uses that).
    const row = recipes.find(r => live(r) && (r.PositionTypeRef || r.positionTypeRef) === posRef && refKey(etRefOf(r)) === refKey(c.fromEt))
    const container = row && (row.ContextType || row.contextType) === 'ElementType' ? (row.ContextRef || row.contextRef) : null
    const wrapperUsers = container ? wrapperUsedBy(recipes, container).filter(p => p !== posRef) : []
    return { ...c, inRecipe, sharers, changing, notChanging, outsideForm, consistent, stillInForm,
      canUpdate: consistent && !stillInForm, container, wrapperUsers }
  })()))
}

/** A change with its trace (trace.js): how each word of the old and new row was read, and why it is this kind. */
function withTrace(posRef, held, { read, ...c }) {
  const pick = ['kind', 'fromEt', 'toEt', 'toCode', 'fromCode', 'inRecipe', 'container', 'sharers', 'changing', 'notChanging', 'outsideForm', 'stillInForm', 'canUpdate']
  return { ...c, trace: {
    rule: 'formImpact', subject: posRef,
    inputs: { maker: c.maker, was: c.oldText, now: c.newText, recipeHolds: [...held] },
    result: Object.fromEntries(pick.filter(k => c[k] !== undefined && !(Array.isArray(c[k]) && !c[k].length)).map(k => [k, c[k]])),
    read,
  } }
}

/**
 * formDiffStates({ posRefs, baseRows, newRows, targetOf, master })
 *   → Map(posRef → { state: 'add' | 'omit' | 'mixed', added: [code], dropped: [code] })
 * How each position's PRODUCT CODES moved since the comparison base, for the rail (862MB6):
 * codes the Form now gives that it didn't (add), codes it no longer gives (omit), or both
 * (mixed — a code swapped). A change of words around the codes is not a change of product.
 */
export function formDiffStates({ posRefs = [], baseRows = [], newRows = [], targetOf = r => r, master = [] }) {
  const out = new Map()
  if (!baseRows.length) return out
  master = withBareCodes(master)
  const codesOf = rows => {
    const set = new Map()
    for (const r of rows) {
      const { known, unknown } = readCodes(r, master)
      for (const c of [...known.values(), ...unknown]) set.set(refKey(c), c)
    }
    return set
  }
  for (const p of posRefs) {
    const was = codesOf(rowsFor(baseRows, p, targetOf))
    const now = codesOf(rowsFor(newRows, p, targetOf))
    const added = [...now.keys()].filter(k => !was.has(k)).map(k => now.get(k))
    const dropped = [...was.keys()].filter(k => !now.has(k)).map(k => was.get(k))
    if (!added.length && !dropped.length) continue
    out.set(p, { state: added.length && dropped.length ? 'mixed' : added.length ? 'add' : 'omit', added, dropped })
  }
  return out
}

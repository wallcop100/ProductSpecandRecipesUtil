import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Button, Form, Alert, Spinner, Modal } from 'react-bootstrap'
import useStore from '../store/useStore'
import { readSheet as readSheetFrom, fileMeta } from '../utils/backend'
import MaterialIcon from '../components/MaterialIcon'
import IconButton from '../components/IconButton'
import CodeChips from '../components/CodeChips'
import PaintPalette from '../components/PaintPalette'
import CompareCodesPanel from '../components/CompareCodesPanel'
import NeedsResolving from '../components/NeedsResolving'
import CaptureLines from '../components/CaptureLines'
import PrimingModal from '../components/PrimingModal'
import NewETModal from '../components/NewETModal'
import ResolveRefsStep from '../components/ResolveRefsStep'
import StageBar from '../components/StageBar'
import TutorialHint from '../tutorial/TutorialHint'
import MapColumnsStep from '../components/MapColumnsStep'
import {
  makeRow, deriveCaptures, buildDistinct, buildMaster, classify, duplicateSet,
  hasNoteCollision, rowConfidence, sortByConfidence, norm, setNoteOverride,
  pendingResolutions, groupKey,
} from '../utils/productCodes'
import {
  setRule, revokeRule, applyRules, learnedRules, learnedSignals, suggestCodes,
  acceptSuggestions, punctuationSuggestion, acceptPunctuationSuggestion, roleTally,
  discardsFromNoteEdit, pickExamples, learnCodeTokens, clearOverridesFor,
} from '../utils/codeLearning'
import { inferConvention, reuseCandidates, suggestRef } from '../utils/etRefSuggest'
import { resolveFormRefs, buildRefMap, targetFor } from '../utils/ptResolve'
import { applyKnownCodes, knownTokenIndices } from '../utils/knownCodes'
import { diffCaptures, wrapperDivergence } from '../utils/formSpec'

/** Fuzzy header match: exact normalised hit first, else shortest header containing it. */
const nh = h => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '')
function detect(headers, want) {
  const list = headers.filter(Boolean)
  return list.find(h => nh(h) === want)
    || list.filter(h => nh(h).includes(want)).sort((a, b) => a.length - b.length)[0]
    || ''
}
const CONTEXT_WANTS = ['productname', 'finish', 'furtherinfo', 'positiontypedescription']
/** Truthy exclusion: any non-blank value that isn't an explicit no. */
const isExcluded = v => {
  const s = String(v ?? '').trim()
  return s !== '' && !/^(n|no|0|false)$/i.test(s)
}

/**
 * ProductCodeImportScreen — the "magic wand".
 *
 * Imports an arbitrary spreadsheet and walks the user through turning freehand
 * ProductCode fields into distinct codes. It encodes NO syntax: every token starts
 * as a note (never used, never lost), and Code/Discard are explicit acts that the
 * tool then replays across the batch. Confirmed codes stage into psChanges, and
 * their notes onto the ElementType Description.
 *
 * The chosen spreadsheet is only ever read.
 */
export default function ProductCodeImportScreen({ onBack, onReviewPositions }) {
  const psRows = useStore(s => s.psRows)
  const positionTypes = useStore(s => s.positionTypes)
  const elementTypes = useStore(s => s.elementTypes)
  const ensurePSRow = useStore(s => s.ensurePSRow)
  const updatePSRow = useStore(s => s.updatePSRow)
  const updateElementType = useStore(s => s.updateElementType)
  const saveFormCaptures = useStore(s => s.saveFormCaptures)
  const formCaptures = useStore(s => s.formCaptures)
  const containerETRefs = useStore(s => s.containerETRefs)
  const importDraft = useStore(s => s.importDraft)
  const saveImportDraft = useStore(s => s.saveImportDraft)
  const clearImportDraft = useStore(s => s.clearImportDraft)

  const [step, setStep] = useState('pick')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const [filepath, setFilepath] = useState('')
  const [sheets, setSheets] = useState([])
  const [sheet, setSheet] = useState('')
  const [headers, setHeaders] = useState([])
  const [rawRows, setRawRows] = useState([])
  const [map, setMap] = useState({ pt: '', code: '', mfr: '', exclude: '', context: [] })

  const [rows, setRows] = useState([])
  const [rules, setRules] = useState({})
  const [idx, setIdx] = useState(0)
  const [assignments, setAssignments] = useState({})
  const [creatingFor, setCreatingFor] = useState(null)
  const [staged, setStaged] = useState(null)
  const [stagedOpen, setStagedOpen] = useState(false)   // the result surfaces as a modal, not below the fold
  const [showBoundaries, setShowBoundaries] = useState(false)
  const [undoSnap, setUndoSnap] = useState(null)   // one-level undo of the last paint
  const [brush, setBrush] = useState('code')       // the colour you're painting with
  const [scope, setScope] = useState('batch')      // 'batch' teaches every row; 'row' is local
  const [dirStats, setDirStats] = useState({ forward: 0, backward: 0 })   // learned from note drags
  const [priming, setPriming] = useState(false)
  const [resolutions, setResolutions] = useState([])     // form ref -> PositionType
  const [refOverrides, setRefOverrides] = useState({})
  const [keptSeparate, setKeptSeparate] = useState(new Set())   // dismissed similar-groups
  const [mergingGroup, setMergingGroup] = useState(null)        // codes awaiting one new ET
  // Identity of the picked workbook. `filepath` is an in-memory token that cannot
  // survive a reload, so the draft (and the captures) carry this instead.
  const [source, setSource] = useState(null)
  const [autoMap, setAutoMap] = useState({})   // what the tool guessed, so it can say so
  const [resumeDismissed, setResumeDismissed] = useState(false)
  // Stage ①: what the Product Spec already knows. Exact hits are painted for you.
  const [knownStats, setKnownStats] = useState(null)   // { exactCount, variantCount, adjacentCount, byRow }
  const [preKnownRows, setPreKnownRows] = useState(null)   // one-shot undo of the auto-paint

  const knownPTs = useMemo(
    () => new Set(positionTypes.map(p => p.PositionTypeRef || p.positionTypeRef).filter(Boolean)),
    [positionTypes]
  )
  const master = useMemo(() => buildMaster(psRows), [psRows])

  /** Where each Form ref's recipe actually goes, after the resolve step. */
  const refMap = useMemo(() => buildRefMap(resolutions, refOverrides), [resolutions, refOverrides])
  const ptTarget = useCallback(pt => targetFor(refMap, pt), [refMap])

  // Roles are always derived from the learned rules + per-row overrides.
  const resolved = useMemo(() => applyRules(rows, rules), [rows, rules])
  const duplicates = useMemo(() => duplicateSet(resolved), [resolved])
  const ctx = useMemo(() => ({ master, duplicates }), [master, duplicates])

  // ---- load -----------------------------------------------------------------
  /** `path` is the opaque token for the picked workbook (see utils/backend.js). */
  async function readSheet(path, sheetName) {
    return readSheetFrom(path, sheetName || undefined)
  }

  /** Default to the first sheet that actually has a product-code column. */
  async function loadWorkbook(path) {
    setBusy(true); setError(null)
    try {
      let data = await readSheet(path, null)
      if (!detect(data.headers, 'productcode')) {
        for (const s of data.sheets) {
          if (s === data.sheet) continue
          const alt = await readSheet(path, s)
          if (detect(alt.headers, 'productcode')) { data = alt; break }
        }
      }
      applySheet(data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setBusy(false)
    }
  }

  function applySheet(data) {
    setSheets(data.sheets); setSheet(data.sheet); setHeaders(data.headers); setRawRows(data.rows)
    const guessed = {
      pt: detect(data.headers, 'positiontype'),
      code: detect(data.headers, 'productcode'),
      mfr: detect(data.headers, 'manufacturer'),
      exclude: detect(data.headers, 'exclude'),
    }
    setAutoMap(guessed)
    setMap({ ...guessed, context: CONTEXT_WANTS.map(w => detect(data.headers, w)).filter(Boolean) })
    setStep('map')
  }

  async function pickSheet(name) {
    setBusy(true)
    try { applySheet(await readSheet(filepath, name)) }
    catch (err) { setError(err.response?.data?.error || err.message) }
    finally { setBusy(false) }
  }

  async function handlePick() {
    const path = await window.electronAPI?.openXlsxDialog?.()
    if (!path) return
    setFilepath(path)
    setSource(await fileMeta(path))
    loadWorkbook(path)
  }

  const skipped = useMemo(
    () => (map.exclude ? rawRows.filter(r => isExcluded(r[map.exclude])).length : 0),
    [rawRows, map.exclude]
  )

  /** The rows the mapping selects, in queue order. */
  const buildRows = useCallback(() => rawRows
    .filter(r => !(map.exclude && isExcluded(r[map.exclude])))
    .filter(r => r[map.code] != null && String(r[map.code]).trim() !== '')
    .map((r, i) => makeRow(i, String(r[map.code]), {
      positionType: String(r[map.pt] ?? '').trim(),
      manufacturer: String(r[map.mfr] ?? '').trim(),
      context: Object.fromEntries(map.context.map(c => [c, r[c]]).filter(([, v]) => v != null && String(v).trim() !== '')),
    })), [rawRows, map])

  /**
   * Before reviewing a single code, settle where each Form ref's recipe belongs.
   * The DesignDB's ExtRef usually answers it; the user confirms and may override.
   * Skipped when the sheet has no PositionType column — nothing to resolve.
   */
  function startResolve() {
    const raw = buildRows()

    // Stage ① — most of a revised Form is unchanged. Every run of tokens that IS a
    // product code already in this project's spec is painted for you: a lookup, not
    // a guess. Variants ("that code plus a bit more") are flagged, never painted.
    const { rows: built, ...stats } = applyKnownCodes(raw, master)
    setKnownStats(stats.exactCount || stats.variantCount || stats.adjacentCount ? stats : null)
    setPreKnownRows(stats.exactCount ? raw : null)

    setRows(sortByConfidence(applyRules(built, {}), { master, duplicates: new Set() }))
    setRules({}); setIdx(0); setAssignments({}); setStaged(null); setUndoSnap(null)
    setKeptSeparate(new Set())

    if (!map.pt) { setResolutions([]); setRefOverrides({}); enterReview(built); return }
    setResolutions(resolveFormRefs(built.map(r => r.positionType), positionTypes))
    setRefOverrides({})
    setStep('resolve')
  }

  function enterReview(built = rows) {
    setStep('review')
    // Teach the dialect from a few covering examples before the queue starts.
    if (built.length >= 3) setPriming(true)
  }

  // ---- draft ------------------------------------------------------------------
  // Every decision in this wizard used to live in local state, so Back or the
  // "Review now" hand-off destroyed forty painted rows without a word. Save the
  // DECISIONS (not the derived tokens/roles) and offer to resume.

  /** Only from `resolve` onward: earlier steps still need the workbook itself. */
  const draftable = rows.length > 0 && (step === 'resolve' || step === 'review') && !staged

  const draftFromState = useCallback(() => ({
    version: 1,
    source: { ...(source || {}), sheet },
    step, map, rules, assignments, idx, resolutions, refOverrides, dirStats,
    keptSeparate: [...keptSeparate],
    rows: rows.map(r => ({
      id: r.id, rawText: r.rawText, positionType: r.positionType, manufacturer: r.manufacturer,
      context: r.context, overrides: r.overrides, noteOverride: r.noteOverride, confirmed: r.confirmed,
    })),
  }), [source, sheet, step, map, rules, assignments, idx, resolutions, refOverrides, dirStats, keptSeparate, rows])

  // Debounced: painting a token must not write a pref on every keystroke.
  useEffect(() => {
    if (!draftable) return
    const t = setTimeout(() => { saveImportDraft(draftFromState()) }, 1000)
    return () => clearTimeout(t)
  }, [draftable, draftFromState, saveImportDraft])

  /** Rebuild tokens/roles from the raw text — makeRow is the only source of truth. */
  function resumeDraft(d) {
    const restored = (d.rows || []).map(r => ({
      ...makeRow(r.id, r.rawText, {
        positionType: r.positionType, manufacturer: r.manufacturer, context: r.context,
      }),
      overrides: r.overrides || {},
      noteOverride: r.noteOverride || {},
      confirmed: !!r.confirmed,
    }))
    setRows(restored)

    // The auto-paint lives in `overrides` and came back with them; recompute the
    // MATCH so the amber variant marks and the banner survive a resume too. It is
    // idempotent, and there is nothing left to undo.
    const { rows: _ignored, ...stats } = applyKnownCodes(restored, master)
    setKnownStats(stats.exactCount || stats.variantCount || stats.adjacentCount ? stats : null)
    setPreKnownRows(null)
    setRules(d.rules || {})
    setAssignments(d.assignments || {})
    setIdx(d.idx || 0)
    setResolutions(d.resolutions || [])
    setRefOverrides(d.refOverrides || {})
    setKeptSeparate(new Set(d.keptSeparate || []))
    setDirStats(d.dirStats || { forward: 0, backward: 0 })
    setMap(d.map || { pt: '', code: '', mfr: '', exclude: '', context: [] })
    setSource(d.source || null)
    setSheet(d.source?.sheet || '')
    setStaged(null); setUndoSnap(null)
    setStep(d.step === 'resolve' ? 'resolve' : 'review')   // never back to pick/map: no workbook
  }

  /** Un-paint everything the spec matched, in one step. */
  function undoKnownPaint() {
    if (!preKnownRows) return
    setRows(sortByConfidence(applyRules(preKnownRows, rules), ctx))
    setPreKnownRows(null)
    setKnownStats(s => (s ? { ...s, exactCount: 0 } : null))
  }

  async function discardDraft() {
    await clearImportDraft()
    setResumeDismissed(true)
  }

  // ---- review ---------------------------------------------------------------
  const current = resolved[idx]
  // Learned continuously, and only from the rows the user has actually taught —
  // painted, edited, or confirmed. Reading every row would feed the tool's own
  // untouched defaults back in as evidence. Never stops: paints, note edits, note
  // drags and ElementType decisions all land here.
  const signals = useMemo(() => learnedSignals(resolved), [resolved])
  const suggested = useMemo(() => (current ? suggestCodes(current, rules, signals) : []), [current, rules, signals])
  const punct = useMemo(() => punctuationSuggestion(rows), [rows])

  // How notes find their code: split on the delimiters the user's own discards
  // revealed, then read toward the code in the direction they keep dragging.
  const direction = dirStats.backward > dirStats.forward ? 'backward' : 'forward'
  const captureOpts = useMemo(
    () => ({ delimiters: signals.delimiters, direction }),
    [signals.delimiters, direction]
  )
  const punctPending = punct.some(p => !rules[p.toLowerCase()])

  const patchRow = useCallback((id, fn) => {
    setRows(rs => rs.map(r => (r.id === id ? fn(r) : r)))
  }, [])

  /**
   * Apply a role to a swept run. By default it teaches the batch (every identical
   * token follows); Alt scopes it to this row.
   */
  /** A sweep paints a role over the covered tokens of a given row. */
  const paintRow = useCallback((rowId, idxs, role, localOnly) => {
    const row = resolved.find(r => r.id === rowId)
    if (!row || idxs.length === 0) return
    // Painting can teach the whole batch, so an accident propagates. Keep one step back.
    setUndoSnap({
      rules, rows, role,
      label: idxs.map(i => row.tokens[i].text).join(' '),
      scope: localOnly ? 'this row' : 'every row',
    })
    if (localOnly) {
      patchRow(rowId, r => {
        const overrides = { ...r.overrides }
        for (const i of idxs) overrides[i] = role
        return { ...r, overrides }
      })
    } else {
      const texts = idxs.map(i => row.tokens[i].text)
      setRules(rl => texts.reduce((acc, t) => setRule(acc, t, role), rl))
      // An override outranks a rule, so a token the auto-paint already marked would
      // ignore this one. "Every row" has to mean every row.
      setRows(rs => clearOverridesFor(rs, texts))
    }
  }, [resolved, patchRow, rules, rows])

  /** The active row's sweep, with the palette's brush and scope. */
  const paint = useCallback((idxs, role = brush, localOnly = scope === 'row') => {
    if (!current) return
    paintRow(current.id, idxs, role, localOnly)
  }, [current, paintRow, brush, scope])

  function undoLastPaint() {
    if (!undoSnap) return
    setRules(undoSnap.rules)
    setRows(undoSnap.rows)
    setUndoSnap(null)
  }

  const acceptRowSuggestions = useCallback(() => {
    if (!current) return
    acceptRowSuggestionsFor(current.id)
  }, [current]) // eslint-disable-line react-hooks/exhaustive-deps

  const acceptRowSuggestionsFor = useCallback(rowId => {
    const row = resolved.find(r => r.id === rowId)
    if (!row) return
    patchRow(rowId, r => acceptSuggestions({ ...r, roles: row.roles }, rules, signals))
  }, [resolved, patchRow, rules, signals])

  /**
   * Editing a note teaches too: words you deleted are being kept in neither the code
   * nor the note, so they are noise everywhere. Guarded — only a pure deletion
   * teaches, and a word that looks like a code is never auto-discarded.
   *
   * The baseline is whatever the note said when you started editing it, NOT only the
   * words originally derived from the field. Comparing against the derived note meant
   * the second and every later edit of a note taught nothing at all.
   */
  const editNote = useCallback((rowId, code, text) => {
    const row = resolved.find(r => r.id === rowId)
    if (row && text != null) {
      const cap = deriveCaptures(row, captureOpts).captures.find(c => c.code === code)
      if (cap?.note) {
        const drop = discardsFromNoteEdit(cap.note, text, signals)
        if (drop.length) setRules(rl => drop.reduce((acc, w) => setRule(acc, w, 'discard'), rl))
      }
    }
    patchRow(rowId, r => setNoteOverride(r, code, text))
  }, [resolved, patchRow, captureOpts, signals])

  /**
   * Move note text between captured codes. `word` moves a single token; omitting it
   * moves the whole note. Either way the direction teaches: notes read toward their
   * code, and which way that is, is this project's habit — not a rule we impose.
   */
  const moveNoteIn = useCallback((rowId, fromCode, toCode, word = null) => {
    const row = resolved.find(r => r.id === rowId)
    if (!row) return
    const caps = deriveCaptures(row, captureOpts).captures
    const fi = caps.findIndex(c => c.code === fromCode)
    const ti = caps.findIndex(c => c.code === toCode)
    if (fi < 0 || ti < 0) return
    setDirStats(s => ti < fi ? { ...s, backward: s.backward + 1 } : { ...s, forward: s.forward + 1 })

    const words = s => String(s || '').split(/\s+/).filter(Boolean)
    let moved, left
    if (word) {
      const rest = words(caps[fi].note)
      const at = rest.indexOf(word)
      if (at < 0) return
      rest.splice(at, 1)               // only the dragged occurrence
      moved = word
      left = rest.join(' ')
    } else {
      moved = caps[fi].note
      left = ''
    }
    const merged = [caps[ti].note, moved].filter(Boolean).join(' ').trim()
    patchRow(rowId, r => setNoteOverride(setNoteOverride(r, toCode, merged), fromCode, left))
  }, [resolved, patchRow, captureOpts])

  /** Move a whole note from one captured code onto another (drag between lines). */
  const handleMoveNote = (fromCode, toCode) => current && moveNoteIn(current.id, fromCode, toCode)
  const handleMoveNoteWord = (fromCode, toCode, word) => current && moveNoteIn(current.id, fromCode, toCode, word)

  // A handful of rows that between them show the most of this sheet's dialect.
  const examples = useMemo(() => (rows.length ? pickExamples(resolved, 5) : []), [rows.length, resolved])

  /** Priming done: the examples are painted, so count them as reviewed. */
  function finishPriming(ids) {
    const done = new Set(ids)
    setRows(rs => rs.map(r => (done.has(r.id) ? { ...r, confirmed: true } : r)))
    setPriming(false)
    setUndoSnap(null)
    const next = resolved.findIndex(r => !done.has(r.id))
    if (next >= 0) setIdx(next)
  }

  /** Right-hand bar -> jump back to a row that produced this code, to adjust it. */
  function jumpToCode(entry) {
    const first = entry.rowRefs[0]
    const at = resolved.findIndex(r => r.id === first)
    if (at >= 0) { setIdx(at); setUndoSnap(null) }
  }

  /** Confirm takes the suggested codes with it — that's what they're for. */
  const confirmAndAdvance = useCallback(() => {
    if (!current) return
    patchRow(current.id, r => ({
      ...acceptSuggestions({ ...r, roles: current.roles }, rules, signals),
      confirmed: true,
    }))
    setIdx(i => Math.min(i + 1, rows.length - 1))
    setUndoSnap(null)
  }, [current, patchRow, rows.length, rules, signals])

  const batchConfirmEasy = useCallback(() => {
    const easy = new Set(resolved.filter(r => !r.confirmed && rowConfidence(r, ctx) === 'high').map(r => r.id))
    setRows(rs => rs.map(r => (easy.has(r.id) ? { ...r, confirmed: true } : r)))
  }, [resolved, ctx])

  useEffect(() => {
    if (step !== 'review' || !current) return
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'Enter') { e.preventDefault(); confirmAndAdvance() }
      else if ('123'.includes(e.key)) {
        e.preventDefault()
        setBrush({ 1: 'code', 2: 'note', 3: 'discard' }[e.key])
      } else if (e.key.toLowerCase() === 'a') { e.preventDefault(); acceptRowSuggestions() }
      else if (e.key.toLowerCase() === 'b') { e.preventDefault(); batchConfirmEasy() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, current, confirmAndAdvance, batchConfirmEasy, acceptRowSuggestions])

  // ---- distinct list (from CONFIRMED rows only) -------------------------------
  const confirmed = useMemo(() => resolved.filter(r => r.confirmed), [resolved])
  const convention = useMemo(() => inferConvention(elementTypes), [elementTypes])

  /**
   * What you already decided this code was, last time.
   *
   * `classify` only knows what the Product Spec says. But a merge made in the Form pane is
   * not always stamped onto the spec — a container must not be (its N/A is load-bearing),
   * and a clash is never overwritten. Those merges would go pending again on every
   * re-import. So the previous captures are consulted LAST, after the spec has had its say.
   */
  const priorEtByCode = useMemo(() => {
    const m = new Map()
    for (const entries of Object.values(formCaptures?.byPosition ?? {})) {
      for (const e of entries || []) {
        const ref = e.elementTypeRef
        if (!ref) continue
        if (e.code) m.set(norm(e.code), ref)
        for (const mg of e.merged || []) if (mg.code) m.set(norm(mg.code), ref)
      }
    }
    return m
  }, [formCaptures])

  const entries = useMemo(() => buildDistinct(confirmed, captureOpts).map(e => {
    // A product is (maker, code): the same code from another maker is another product.
    const c = classify(e.text, ctx, e.manufacturers[0] || '')
    // The spec wins; your past decision is only consulted where the spec is silent.
    const etRef = c.elementTypeRef || assignments[norm(e.text)] || priorEtByCode.get(norm(e.text)) || null
    const note = e.variants[0]?.note || ''
    // Only unresolved codes need a suggestion / reuse candidates.
    const help = etRef ? {} : {
      reuse: reuseCandidates(e.text, note, { psRows, elementTypes, manufacturer: e.manufacturers[0] || '' }, 3),
      suggestedRef: suggestRef(e.text, note, e.manufacturers[0] || '', convention, elementTypes, psRows).ref,
    }
    return { ...e, ...c, etRef, ...help }
  }), [confirmed, ctx, assignments, captureOpts, psRows, elementTypes, convention, priorEtByCode])

  const { collisions, similar } = useMemo(
    () => pendingResolutions(entries, keptSeparate), [entries, keptSeparate]
  )
  const unassigned = entries.filter(e => !e.etRef && !hasNoteCollision(e))
  // Staging is incremental. handleStage only ever writes entries that HAVE an
  // ElementType, so an unassigned or colliding code is simply left where it is —
  // no reason to hold the finished ones hostage to it. The draft survives so the
  // rest can be finished later.
  const stageable = entries.filter(e => e.etRef).length
  const leftBehind = entries.length - stageable
  const canStage = stageable > 0

  /** Fold a variant's note into its code, on the rows behind it, so it earns its own ref. */
  function handlePromote(entry, variant) {
    for (const rowId of variant.rowRefs) {
      const r = resolved.find(x => x.id === rowId)
      if (!r) continue
      const cap = deriveCaptures(r, captureOpts).captures.find(c => c.code === entry.text && c.note === variant.note)
      if (!cap) continue
      patchRow(rowId, row => {
        const overrides = { ...row.overrides }
        for (const i of cap.noteTokens) overrides[i] = 'code'
        return { ...row, overrides }
      })
    }
  }

  /**
   * The variants were the same product after all: give every row behind this code
   * the one note, collapsing the collision without inventing a new ref.
   */
  function handleUnify(entry, note) {
    for (const rowId of entry.rowRefs) patchRow(rowId, r => setNoteOverride(r, entry.text, note))
  }

  /** These near-miss codes are genuinely different products — stop asking. */
  function handleKeepSeparate(group) {
    setKeptSeparate(s => new Set(s).add(groupKey(group)))
  }

  /**
   * Consolidate near-miss codes onto ONE ElementType. If one of them already has a
   * ref, the rest join it; otherwise the user creates a single ET for all of them.
   */
  function handleMerge(group, existingRef) {
    if (existingRef) {
      group.forEach(e => assignET(e.text, existingRef))
      return
    }
    const lead = group[0]
    setMergingGroup(group.map(e => e.text))
    setCreatingFor({
      text: lead.text,
      ref: lead.suggestedRef || '',
      manufacturer: lead.manufacturers[0] || '',
      description: lead.variants[0]?.note || '',
      note: lead.variants[0]?.note || '',
      positionTypes: [...new Set(group.flatMap(e => e.positionTypes))],
      rowCount: group.reduce((n, e) => n + e.rowRefs.length, 0),
    })
  }

  /**
   * Assign an ElementType to a code, and learn from it. Saying "this code is an ET"
   * is the strongest evidence available that its tokens really are a code, so it
   * becomes a batch-wide rule — no re-asking about the same token thirty rows later.
   */
  const assignET = useCallback((codeText, ref) => {
    setAssignments(a => ({ ...a, [norm(codeText)]: ref }))
    setRules(rl => learnCodeTokens(rl, codeText))
  }, [])

  /** Assign an existing ElementType to a distinct code — the reuse/dedup win. */
  function handleReuse(entry, ref) {
    assignET(entry.text, ref)
  }

  async function handleStage() {
    // 1. Stage the Product Spec: product code + manufacturer per code, note → ET Description.
    let n = 0
    const codeToEt = new Map()
    for (const e of entries) {
      if (!e.etRef) continue
      codeToEt.set(norm(e.text), e.etRef)
      const note = e.variants[0]?.note || ''
      if (e.status !== 'green') {
        ensurePSRow(e.etRef)
        updatePSRow(e.etRef, {
          ProductCode: e.text,
          ...(e.manufacturers.length === 1 ? { Manufacturer: e.manufacturers[0] } : {}),
        })
        n++
      }
      if (note) updateElementType(e.etRef, { Description: note })
    }

    // 2. Collect what the Form says each PositionType uses. THIS IS ALL IT DOES.
    //
    //    The import never writes a recipe row. A one-click "add everything, everywhere"
    //    is a black box: it lands rows in positions the user never looked at, and the
    //    only way to check is to visit each one anyway. Stage ③ is the builder, where
    //    the Side-by-Side pane offers each Form product for the user to add, one tick
    //    at a time, into a slot they choose.
    //
    //    The captures are keyed by the PositionType the DesignDB points at, not the
    //    one the Form names: the Form says C01, but C01r declares ExtRef="C01" and is
    //    where the recipe lives. Resolved (and confirmable) in the resolve step; a ref
    //    left unresolved is captured against nothing rather than the wrong position.
    const byPos = new Map()   // target PositionTypeRef -> [{ elementTypeRef, code, note, manufacturer, formRef }]
    // Codes the Form asks for that have no ElementType yet. Staging is incremental, so
    // these are the ones you deliberately left for later — and dropping them here would
    // erase the Form's own request. The pane surfaces them and offers to create the ET.
    const pendingByPos = new Map()
    const contextByPosition = {}
    let unrouted = 0
    for (const row of confirmed) {
      if (!row.positionType) continue
      const target = map.pt ? ptTarget(row.positionType) : row.positionType
      if (!target) { unrouted++; continue }
      // The context columns the user picked at the mapping step — the same ones shown
      // above the paint surface. Carried through so the Side-by-Side pane can show
      // them, keeping the user grounded in what the sheet actually said.
      if (!contextByPosition[target] && Object.keys(row.context || {}).length) {
        contextByPosition[target] = row.context
      }
      for (const cap of deriveCaptures(row, captureOpts).captures) {
        const et = codeToEt.get(norm(cap.code))
        if (!et) {
          // The Form asked for this product. Nobody has said what it is yet.
          if (!pendingByPos.has(target)) pendingByPos.set(target, [])
          const pend = pendingByPos.get(target)
          if (!pend.some(x => norm(x.code) === norm(cap.code))) {
            pend.push({
              code: cap.code, note: cap.note,
              manufacturer: row.manufacturer || '', formRef: row.positionType,
            })
          }
          continue
        }
        if (!byPos.has(target)) byPos.set(target, [])
        const list = byPos.get(target)
        if (!list.some(x => x.elementTypeRef === et)) {
          list.push({
            elementTypeRef: et, code: cap.code, note: cap.note,
            manufacturer: row.manufacturer || '', formRef: row.positionType,
          })
        }
      }
    }
    // 3. Persist the Form's spec, and diff it against the previous import — the
    //    manual compare the user does whenever the spreadsheet is revised.
    const nextCaptures = {
      version: 1,
      source: { ...(source || await fileMeta(filepath) || {}), sheet },
      importedAt: new Date().toISOString(),
      byPosition: Object.fromEntries(byPos),
      pendingByPosition: Object.fromEntries(pendingByPos),
      contextByPosition,
      orphansByPosition: {},
      unrouted: resolutions.filter(r => !r.target).map(r => ({ formRef: r.formRef, rows: r.rows })),
    }
    const diff = diffCaptures(formCaptures, nextCaptures)

    // A code that has left the Form is not deleted — its row is flagged in the pane.
    for (const r of diff.removed) {
      const ref = r.entry.elementTypeRef
      if (!ref) continue
      ;(nextCaptures.orphansByPosition[r.posRef] ||= []).push(ref)
    }

    // A changed code inside a SHARED wrapper is the fork decision (see formSpec).
    const divergence = wrapperDivergence(useStore.getState().recipes, diff, containerETRefs)

    // The fork decision must outlive this screen, which unmounts on "Review now".
    nextCaptures.divergence = divergence

    await saveFormCaptures(nextCaptures)
    // Staging is incremental: the assigned codes have landed, but painting that has
    // not been assigned yet would be lost with the draft. Keep it until nothing is
    // left behind.
    if (leftBehind === 0) await clearImportDraft()
    setStaged({
      codes: n,
      byPosition: Object.fromEntries(byPos),
      positions: byPos.size,
      products: [...byPos.values()].reduce((t, l) => t + l.length, 0),
      unrouted, diff, divergence, leftBehind,
      pending: [...pendingByPos.values()].reduce((n, l) => n + l.length, 0),
    })
    setStagedOpen(true)
  }

  const remaining = resolved.filter(r => !r.confirmed).length
  const easyLeft = resolved.filter(r => !r.confirmed && rowConfidence(r, ctx) === 'high').length
  // What the spec matched on the row being reviewed.
  const currentMatch = current && knownStats?.byRow?.get(current.id)
  const knownIdx = useMemo(() => knownTokenIndices(currentMatch), [currentMatch])
  const variantIdx = useMemo(() => {
    const m = new Map()
    for (const v of currentMatch?.variants || []) m.set(v.range[0], v)
    for (const a of currentMatch?.adjacent || []) {
      for (let k = a.range[0]; k <= a.range[1]; k++) m.set(k, { base: a.code, ref: a.ref })
    }
    return m
  }, [currentMatch])

  const readout = current ? deriveCaptures(current, captureOpts) : null
  const learned = useMemo(() => learnedRules(rows, rules), [rows, rules])
  const tally = useMemo(() => roleTally(resolved), [resolved])

  // ---------------------------------------------------------------------------
  return (
    <div className="p-3" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="d-flex align-items-center gap-2 mb-3">
        <IconButton icon="arrow_back" size={18} onClick={onBack} title="Back" />
        <h5 className="mb-0 d-flex align-items-center gap-2" style={{ fontSize: 16 }}>
          <MaterialIcon name="auto_fix_high" size={20} /> Import product codes
        </h5>
        <TutorialHint id="code-import" />
        {source?.name && <span className="text-muted ms-2 text-truncate" style={{ fontSize: 11, maxWidth: 260 }}>{source.name}</span>}
      </div>

      {/* The whole workflow, in three. The import owns ① and ②; the builder owns ③. */}
      <div className="mb-3">
        <StageBar
          current={staged ? 3 : step === 'review' ? (canStage ? 2 : 1) : 1}
          done={staged ? [1, 2] : []}
          progress={{
            1: rows.length ? `${rows.length - remaining}/${rows.length} rows` : undefined,
            2: entries.length ? `${entries.length - unassigned.length}/${entries.length} codes` : undefined,
            3: staged ? 'nothing written yet — add them in the builder' : 'in the builder',
          }}
        />
      </div>

      {error && <Alert variant="danger" style={{ fontSize: 12 }}>{error}</Alert>}

      {step === 'pick' && importDraft && !resumeDismissed && (
        <div className="mx-auto mb-4 px-3 py-2 rounded" style={{ maxWidth: 520, background: '#e7f1ff', border: '1px solid #b6d4fe' }}>
          <div className="fw-semibold d-flex align-items-center gap-1" style={{ fontSize: 13 }}>
            <MaterialIcon name="history" size={16} /> Resume your import?
          </div>
          <div className="text-muted my-1" style={{ fontSize: 12 }}>
            {importDraft.source?.name && <span style={{ fontFamily: 'monospace' }}>{importDraft.source.name}</span>}
            {importDraft.source?.name && ' — '}
            {(importDraft.rows || []).filter(r => r.confirmed).length} of {(importDraft.rows || []).length} rows
            confirmed. The spreadsheet is not re-read; your painted codes and rules are restored.
          </div>
          <div className="d-flex gap-2">
            <Button size="sm" variant="primary" style={{ fontSize: 11 }} onClick={() => resumeDraft(importDraft)}>
              Resume
            </Button>
            <Button size="sm" variant="outline-secondary" style={{ fontSize: 11 }} onClick={discardDraft}>
              Start over
            </Button>
          </div>
        </div>
      )}

      {step === 'pick' && (
        <div className="text-center py-5">
          <p className="text-muted" style={{ fontSize: 13 }}>
            Choose the spreadsheet this project starts from. It is only ever read — never written.
          </p>
          <Button variant="primary" onClick={handlePick} disabled={busy}>
            {busy ? <Spinner size="sm" animation="border" /> : <MaterialIcon name="folder_open" size={16} />}
            <span className="ms-1">Choose spreadsheet…</span>
          </Button>
        </div>
      )}

      {step === 'map' && (
        <MapColumnsStep
          sheets={sheets} sheet={sheet} onSheet={pickSheet}
          headers={headers} rawRows={rawRows}
          map={map} onMap={setMap} autoMap={autoMap}
          skipped={skipped} busy={busy} onStart={startResolve}
        />
      )}

      {step === 'resolve' && (
        <ResolveRefsStep
          resolutions={resolutions}
          overrides={refOverrides}
          onOverride={(formRef, target) => setRefOverrides(o => ({ ...o, [formRef]: target }))}
          positionTypes={positionTypes}
          onBack={() => setStep('map')}
          onConfirm={() => enterReview()}
        />
      )}

      {step === 'review' && (
        <div className="d-flex gap-3" style={{ flex: 1, minHeight: 0 }}>
          {/* Queue + Learned panel */}
          <div style={{ width: 210, overflowY: 'auto', flexShrink: 0 }}>
            <div className="fw-semibold text-muted mb-1" style={{ fontSize: 10, textTransform: 'uppercase' }}>
              Queue ({remaining} left)
            </div>
            {easyLeft > 0 && (
              <Button size="sm" variant="outline-success" className="w-100 mb-2" style={{ fontSize: 11 }} onClick={batchConfirmEasy}>
                Confirm {easyLeft} easy {easyLeft === 1 ? 'row' : 'rows'} <kbd>B</kbd>
              </Button>
            )}
            {resolved.map((r, i) => (
              <div key={r.id} onClick={() => { setIdx(i); setUndoSnap(null) }}
                className="px-2 py-1 rounded d-flex align-items-center gap-1"
                style={{
                  cursor: 'pointer', fontSize: 11, fontFamily: 'monospace',
                  background: i === idx ? '#cfe2ff' : 'transparent',
                  color: r.confirmed ? '#adb5bd' : '#212529',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                {r.confirmed && <MaterialIcon name="check" size={12} style={{ color: '#198754', flexShrink: 0 }} />}
                <span style={{ color: '#6c757d' }}>{r.positionType}</span> {r.rawText.split('\n')[0]}
              </div>
            ))}

            <div className="fw-semibold text-muted mt-3 mb-1" style={{ fontSize: 10, textTransform: 'uppercase' }}>
              Learned this project
            </div>
            {punctPending && (
              <Button size="sm" variant="outline-secondary" className="w-100 mb-1" style={{ fontSize: 10 }}
                onClick={() => setRules(rl => acceptPunctuationSuggestion(rows, rl))}>
                Discard {punct.join(' ')} everywhere
              </Button>
            )}
            {examples.length > 0 && (
              <Button size="sm" variant="outline-primary" className="w-100 mb-1" style={{ fontSize: 10 }}
                onClick={() => setPriming(true)}
                title="Re-run the teaching examples if suggestions look poor">
                <MaterialIcon name="school" size={11} /> Teach from examples
              </Button>
            )}
            {/* What the tool has worked out about this project's dialect. */}
            <div className="mb-1 px-1 py-1 rounded" style={{ background: '#f8f9fa', fontSize: 10 }}>
              <div>
                <span className="text-muted">separators </span>
                {signals.delimiters.size > 0
                  ? [...signals.delimiters].map(d => (
                      <span key={d} className="rounded px-1 me-1"
                        style={{ background: '#e7f1ff', fontFamily: 'monospace' }}>{d}</span>
                    ))
                  : <span className="fst-italic text-muted">none detected yet</span>}
              </div>
              <div className="text-muted">
                keeping <strong style={{ color: '#0f5132' }}>{tally.code}</strong> as code ·{' '}
                <strong>{tally.note}</strong> as note · discarding <strong>{tally.discard}</strong>
              </div>
              {signals.profile.minLen > 0 && (
                <div className="text-muted">
                  codes here: {signals.profile.requireDigit ? 'contain digits, ' : ''}≥{signals.profile.minLen} chars
                </div>
              )}
            </div>

            {learned.length === 0 && (
              <div className="text-muted fst-italic" style={{ fontSize: 10 }}>
                Nothing yet. Paint a token and it applies to every row containing it.
              </div>
            )}
            {learned.map(l => (
              <div key={l.text} className="d-flex align-items-center gap-1" style={{ fontSize: 10 }}>
                <span style={{ fontFamily: 'monospace' }}>{l.text}</span>
                <span className="text-muted">→ {l.role} ({l.rows})</span>
                <IconButton icon="close" size={11} className="ms-auto" title="Revoke"
                  onClick={() => setRules(rl => revokeRule(rl, l.text))} />
              </div>
            ))}
          </div>

          {/* Active field */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
            {!current && <div className="text-muted fst-italic">No rows to review.</div>}
            {current && (
              <>
                <div className="text-muted mb-1" style={{ fontSize: 11 }}>
                  Row {idx + 1} of {rows.length}
                  {current.positionType && <> · <strong>{current.positionType}</strong></>}
                  {current.manufacturer && <> · {current.manufacturer}</>}
                </div>

                {Object.keys(current.context).length > 0 && (
                  <div className="mb-2 px-2 py-1 rounded" style={{ background: '#f8f9fa', fontSize: 11 }}>
                    {Object.entries(current.context).map(([k, v]) => (
                      <div key={k}><span className="text-muted">{k}:</span> {String(v)}</div>
                    ))}
                  </div>
                )}

                {/* Stage ① — what the Product Spec already knew. */}
                {knownStats && (
                  <div className="mb-2 px-2 py-1 rounded d-flex align-items-center gap-2 flex-wrap"
                    style={{ background: '#d1e7dd', border: '1px solid #a3cfbb', fontSize: 11, color: '#0f5132' }}>
                    {knownStats.exactCount > 0 && (
                      <span>
                        <MaterialIcon name="check_circle" size={13} /> {knownStats.exactCount} code
                        {knownStats.exactCount === 1 ? '' : 's'} already in your Product Spec — painted for you
                      </span>
                    )}
                    {knownStats.variantCount > 0 && (
                      <span style={{ color: '#856404' }}>
                        <MaterialIcon name="warning" size={12} /> {knownStats.variantCount} look like a known code
                        with something extra — amber; you decide
                      </span>
                    )}
                    {knownStats.adjacentCount > 0 && (
                      <span style={{ color: '#856404' }}>
                        <MaterialIcon name="warning" size={12} /> {knownStats.adjacentCount} known codes sit side by
                        side — painting both would merge them, so neither was
                      </span>
                    )}
                    {preKnownRows && (
                      <Button size="sm" variant="link" className="p-0 ms-auto" style={{ fontSize: 10 }}
                        onClick={undoKnownPaint} title="Un-paint everything matched from the spec">
                        Undo all
                      </Button>
                    )}
                  </div>
                )}

                <PaintPalette
                  brush={brush} onBrush={setBrush}
                  scope={scope} onScope={setScope}
                  suggestedCount={suggested.length}
                  onAcceptSuggestions={acceptRowSuggestions}
                  showBoundaries={showBoundaries} onShowBoundaries={setShowBoundaries}
                  undo={undoSnap} onUndo={undoLastPaint}
                />

                {/* The field and what it yields are ONE thing: paint above, codes
                    promote onto their own line below. */}
                <div className="border rounded mb-3" style={{ background: '#fff' }}>
                  <div className="p-3" style={{ minHeight: 110, display: 'flex', alignItems: 'center' }}>
                    <CodeChips
                      row={current}
                      brush={brush}
                      onSweep={paint}
                      suggested={suggested}
                      known={knownIdx}
                      variants={variantIdx}
                      showBoundaries={showBoundaries}
                    />
                  </div>
                  <div className="px-3 pb-2 pt-1" style={{ background: '#fcfcfd', borderTop: '1px solid #e9ecef' }}>
                    <CaptureLines
                      captures={readout.captures}
                      discarded={readout.discarded}
                      onEditNote={(code, text) => editNote(current.id, code, text)}
                      onMoveNote={handleMoveNote}
                      onMoveNoteWord={handleMoveNoteWord}
                    />
                  </div>
                </div>

                <Button size="sm" variant="primary" onClick={confirmAndAdvance}>
                  {current.confirmed ? 'Confirmed — next' : 'Confirm'}
                  {suggested.length > 0 && <> (takes {suggested.length} suggested)</>} <kbd>Enter</kbd>
                </Button>
              </>
            )}
          </div>

          {/* Compare + stage */}
          <div style={{ width: 350, overflowY: 'auto', flexShrink: 0 }} className="border-start ps-3">
            <NeedsResolving
              collisions={collisions}
              similar={similar}
              resolvedCount={entries.length - collisions.length}
              onPromote={handlePromote}
              onUnify={handleUnify}
              onMerge={handleMerge}
              onKeepSeparate={handleKeepSeparate}
              onJump={jumpToCode}
            />

            <div className="fw-semibold text-muted mb-2" style={{ fontSize: 10, textTransform: 'uppercase' }}>
              Distinct codes ({entries.length})
            </div>
            <CompareCodesPanel
              entries={entries}
              knownPTs={knownPTs}
              ptTarget={map.pt ? ptTarget : null}
              onJump={jumpToCode}
              onReuse={handleReuse}
              onCreateET={e => setCreatingFor({
                text: e.text,
                ref: e.suggestedRef || '',
                manufacturer: e.manufacturers[0] || '',
                description: e.variants[0]?.note || '',
                note: e.variants[0]?.note || '',
                positionTypes: e.positionTypes,
                rowCount: e.rowRefs.length,
              })}
            />

            <div className="mt-3">
              <Button variant="success" size="sm" className="w-100" disabled={!canStage} onClick={handleStage}>
                Stage {stageable} code{stageable === 1 ? '' : 's'}
              </Button>
              {leftBehind > 0 && (
                <div className="text-muted mt-1" style={{ fontSize: 10 }}>
                  {leftBehind} other code{leftBehind === 1 ? '' : 's'} {leftBehind === 1 ? 'is' : 'are'} not
                  ready — {collisions.length > 0 && <>{collisions.length} with differing notes, </>}
                  {unassigned.length > 0 && <>{unassigned.length} with no ElementType</>}. They stay put, and your
                  draft is kept so you can finish them.
                </div>
              )}
              {!canStage && entries.length > 0 && (
                <div className="text-muted mt-1" style={{ fontSize: 10 }}>
                  Assign an ElementType to at least one code before staging.
                </div>
              )}
              <div className="text-muted mt-1" style={{ fontSize: 10 }}>
                <MaterialIcon name="info" size={10} /> Notes become the ElementType Description in the DesignDB,
                and reach it through the ElementTypes patch script at export.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Staging result — a popup, so it is unmissable rather than below the fold. */}
      <Modal show={stagedOpen && !!staged} onHide={() => setStagedOpen(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 16 }}>
            <MaterialIcon name="check_circle" size={18} style={{ color: '#198754' }} /> Form template attached
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ fontSize: 13 }}>
          {staged && (
            <>
              <div>
                <strong>{staged.products}</strong> product{staged.products === 1 ? '' : 's'} across{' '}
                <strong>{staged.positions}</strong> PositionType{staged.positions === 1 ? '' : 's'}
                {staged.codes > 0 && <> · {staged.codes} product spec row{staged.codes === 1 ? '' : 's'} staged</>}.
              </div>
              <div className="mt-2 text-muted">
                No recipe was touched. Go to the builder and add each product where it belongs —
                the Side-by-Side pane shows what the Form asks for, position by position.
              </div>
              {staged.unrouted > 0 && (
                <div className="mt-2 text-muted">
                  {staged.unrouted} row{staged.unrouted === 1 ? '' : 's'} captured nothing — their Form ref
                  resolves to no PositionType, or you skipped it.
                </div>
              )}
              {staged.leftBehind > 0 && (
                <div className="mt-2 text-muted">
                  {staged.leftBehind} code{staged.leftBehind === 1 ? '' : 's'} still {staged.leftBehind === 1 ? 'has' : 'have'} no
                  ElementType. Your draft is kept — come back and stage them whenever you like.
                  {staged.pending > 0 && <> The Side-by-Side pane lists them where the Form asks for them.</>}
                </div>
              )}

              {/* What changed since the last import — the manual compare, done. */}
              {staged.diff && (staged.diff.added.length + staged.diff.removed.length
                + staged.diff.changed.length + staged.diff.moved.length) > 0 && (
                <div className="mt-3 pt-2 border-top">
                  <div className="fw-semibold" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                    Since the last import
                  </div>
                  <div className="text-muted">
                    {staged.diff.added.length} added · {staged.diff.removed.length} removed ·{' '}
                    {staged.diff.changed.length} changed · {staged.diff.moved.length} moved
                  </div>
                  {staged.diff.removed.length > 0 && (
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      Removed codes are flagged where they appear, never deleted for you.
                    </div>
                  )}
                </div>
              )}

              {/* A changed code inside a SHARED wrapper: edit it, or fork it. */}
              {staged.divergence?.length > 0 && (
                <div className="mt-3 px-2 py-2 rounded" style={{ background: '#fff3cd', border: '1px solid #f0e0a8', color: '#856404', fontSize: 12 }}>
                  {staged.divergence.map(d => (
                    <div key={d.wrapper} className="mb-1">
                      <MaterialIcon name="warning" size={12} />{' '}
                      <span style={{ fontFamily: 'monospace' }}>{d.wrapper}</span> is shared by{' '}
                      {d.sharers.join(', ')}.{' '}
                      {d.consistent
                        ? <>Every position changed alike — safe to edit it in place.</>
                        : <>
                            Only {d.changedPositions.join(', ')} changed; {d.unchangedPositions.join(', ')} did
                            not. One wrapper cannot hold both — fork it from the position's recipe
                            (<em>Duplicate element type</em>).
                          </>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="d-flex align-items-center">
          <span className="text-muted me-auto" style={{ fontSize: 11 }}>
            Product Spec changes leave via <strong>Export changes</strong>.
          </span>
          <Button variant="outline-secondary" size="sm" onClick={() => setStagedOpen(false)}>Close</Button>
          {onReviewPositions && staged && (
            <Button size="sm" variant="success"
              onClick={() => { setStagedOpen(false); onReviewPositions(Object.keys(staged.byPosition || {})) }}>
              <MaterialIcon name="playlist_add_check" size={14} /> Build recipes →
            </Button>
          )}
        </Modal.Footer>
      </Modal>

      <PrimingModal
        show={priming && examples.length > 0}
        examples={examples}
        signals={signals}
        captureOpts={captureOpts}
        suggestedFor={row => suggestCodes(row, rules, signals)}
        onPaint={(rowId, idxs, role) => paintRow(rowId, idxs, role, false)}
        onAcceptSuggestions={acceptRowSuggestionsFor}
        onEditNote={editNote}
        onMoveNote={moveNoteIn}
        onMoveNoteWord={moveNoteIn}
        onSkip={() => setPriming(false)}
        onDone={finishPriming}
      />

      <NewETModal
        show={!!creatingFor}
        onHide={() => { setCreatingFor(null); setMergingGroup(null) }}
        contextLabel={creatingFor
          ? (mergingGroup ? `for ${mergingGroup.length} merged codes` : `for ${creatingFor.text}`)
          : null}
        // Closing to compare against a sibling code must not lose what you typed.
        draftKey={creatingFor ? `${mergingGroup ? mergingGroup.join('|') : ''}::${norm(creatingFor.text)}` : null}
        importContext={creatingFor ? {
          code: creatingFor.text,
          manufacturer: creatingFor.manufacturer,
          note: creatingFor.note,
          positionTypes: creatingFor.positionTypes,
          rowCount: creatingFor.rowCount,
          mergedCodes: mergingGroup,
        } : null}
        prefill={creatingFor ? {
          ref: creatingFor.ref,
          manufacturer: creatingFor.manufacturer,
          productCode: creatingFor.text,
          description: creatingFor.description,
        } : {}}
        onCreated={etRef => {
          // A merge puts every code in the group on the one new ElementType.
          for (const code of mergingGroup || [creatingFor.text]) assignET(code, etRef)
          setCreatingFor(null)
          setMergingGroup(null)
        }}
      />
    </div>
  )
}

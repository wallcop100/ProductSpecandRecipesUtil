import useImportSession from './import/useImportSession'
import InfoTip from '../components/InfoTip'
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Button, ButtonGroup, Form, Alert, Spinner, Modal, Dropdown } from 'react-bootstrap'
import { ACTION_ICONS } from '../utils/entityStyle'
import useStore from '../store/useStore'
import { readSheet as readSheetFrom, fileMeta } from '../utils/backend'
import MaterialIcon from '../components/MaterialIcon'
import IconButton from '../components/IconButton'
import CodeChips from '../components/CodeChips'
import PaintPalette from '../components/PaintPalette'
import CompareCodesPanel, { StatusLegend, TONE, ICON, MEANS, STATUS_LABEL } from '../components/CompareCodesPanel'
import NeedsResolving from '../components/NeedsResolving'
import CaptureLines from '../components/CaptureLines'
import PrimingModal from '../components/PrimingModal'
import NewETModal from '../components/NewETModal'
import ElementTypesWindow from '../components/ElementTypesWindow'
import ResolveRefsStep from '../components/ResolveRefsStep'
import StageBar from '../components/StageBar'
import StatusChip from '../components/StatusChip'
import TutorialHint from '../tutorial/TutorialHint'
import MapColumnsStep from '../components/MapColumnsStep'
import FormTable from '../components/import/FormTable'
import FormPositionList from '../components/import/FormPositionList'
import CompactPositionPainter from '../components/import/CompactPositionPainter'
import CopyButton from '../components/CopyButton'
import ContextColumnChips from '../components/ContextColumnChips'
import { capturableColumns, captureContext } from '../utils/formColumns'
import {
  makeRow, deriveCaptures, buildDistinct, buildMaster, classify, duplicateSet,
  hasNoteCollision, rowConfidence, sortByConfidence, norm, setNoteOverride,
  pendingResolutions, groupKey, hasProductIdentity,
} from '../utils/productCodes'
import {
  setRule, revokeRule, applyRules, learnedRules, learnedSignals, suggestCodes,
  acceptSuggestions, prePaint, punctuationSuggestion, acceptPunctuationSuggestion, roleTally,
  discardsFromNoteEdit, pickExamples, learnCodeTokens, clearOverridesFor,
} from '../utils/codeLearning'
import { inferConvention, reuseCandidates, suggestRef } from '../utils/etRefSuggest'
import { proposeElementTypes, familyDescription } from '../utils/etSeed'
import { matchShape } from '../utils/codeShapes'
import shippedShapes from '../data/codeShapes.json'
import { resolveFormRefs, buildRefMap, targetFor } from '../utils/ptResolve'
import { applyKnownCodes, knownTokenIndices } from '../utils/knownCodes'
import { isObvious, isNothingRow, isTbcRow } from '../utils/obviousRows'
import { joinAccessories, isPlaceholder, accessoriesFrom, leadOf } from '../utils/accessories'
import { matchForms, diffRow } from '../utils/formDiff'
import { readOlderForm } from '../utils/olderForm'
import { groupPositions, positionStatus, mergeCaptures, restrictCaptures } from '../utils/formPositions'
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
/**
 * A row that wants a product nobody has chosen: no real code in it (a "TBC" or "N/A" painted
 * as a code is not one), and either TBC-ish words or a painted "TBC".
 */
const isTbc = (row, captureOpts) => {
  const caps = deriveCaptures(row, captureOpts).captures
  if (caps.some(c => hasProductIdentity(c.code))) return false
  return isTbcRow(row) || caps.some(c => norm(c.code) === 'TBC')
}
/** A row's captures that are products: "TBC" / "N/A" painted as a code are not. */
const productCaptures = (row, captureOpts) => deriveCaptures(row, captureOpts).captures.filter(c => hasProductIdentity(c.code))
/** The entry key of a TBC row: one per Form position. */
const tbcKey = row => `TBC (${row.positionType || `row ${row.id + 1}`})`

/**
 * `embedded`: { posRef, onStaged } — the builder's Form spec pane runs this screen for ONE
 * PositionType (D4Z9CX): By position, locked to the Form rows that land on posRef, with
 * the chrome hidden. It is the same session (importDraft), so a position painted here is
 * done in Import too, and the Form is loaded once for every position.
 */
export default function ProductCodeImportScreen({ onBack, onReviewPositions, embedded = null }) {
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
  const recipes = useStore(s => s.recipes)
  const dbCollectionRefs = useStore(s => s.dbCollectionRefs)
  const createElementType = useStore(s => s.createElementType)
  const addPSRow = useStore(s => s.addPSRow)
  const saveImportDraft = useStore(s => s.saveImportDraft)
  const clearImportDraft = useStore(s => s.clearImportDraft)

  const [step, setStep] = useState('pick')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const [filepath, setFilepath] = useState('')
  const projectId = useStore(s => s.projectId)
  const [sheets, setSheets] = useState([])
  const [sheet, setSheet] = useState('')
  const [headers, setHeaders] = useState([])
  const [rawRows, setRawRows] = useState([])
  const [map, setMap] = useState({ pt: '', code: '', mfr: '', exclude: '', acc: '', context: [] })

  // What the import DECIDES lives in one session with full undo; see useImportSession.
  const session = useImportSession()
  const {
    rows, setRows, rules, setRules, assignments, setAssignments,
    refOverrides, setRefOverrides, keptSeparate, setKeptSeparate, dirStats, setDirStats,
  } = session
  // The table: which row is open in the painter, which has keyboard focus, and the view.
  const [expandedId, setExpandedId] = useState(null)
  const [focusId, setFocusId] = useState(null)
  const [filter, setFilter] = useState('all')      // all | unconfirmed | needsEt | unchanged | changed | new | removed
  // The older Form this import is compared with (formDiff.js): { name, rows } or null.
  const [compareBase, setCompareBase] = useState(null)
  // "By position" mode: the Form refs already added end to end (kept with the draft).
  const [stagedRefs, setStagedRefs] = useState([])
  // Whole Form (the three stages over every row) or By position (a selection end to end).
  const [modeChoice, setModeState] = useState('form')
  const mode = embedded ? 'position' : modeChoice
  const [selectedRefs, setSelectedRefs] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [etFocusCode, setEtFocusCode] = useState(null)
  const [refsOpen, setRefsOpen] = useState(false)
  const [reviewingExisting, setReviewingExisting] = useState(false)
  const [creatingFor, setCreatingFor] = useState(null)
  const [staged, setStaged] = useState(null)
  const [stagedOpen, setStagedOpen] = useState(false)   // the result surfaces as a modal, not below the fold
  const [showBoundaries, setShowBoundaries] = useState(false)
  const [undoSnap, setUndoSnap] = useState(null)   // one-level undo of the last paint
  const [brush, setBrush] = useState('code')       // the colour you're painting with
  const [scope, setScope] = useState('batch')      // 'batch' teaches every row; 'row' is local
  const [priming, setPriming] = useState(false)
  const [resolutions, setResolutions] = useState([])     // form ref -> PositionType
  const [mergingGroup, setMergingGroup] = useState(null)        // codes awaiting one new ET
  const [bulkProposals, setBulkProposals] = useState(null)      // the bulk "create them all" review
  // Opening is a request; the proposals are snapshotted on the next render, once any rows
  // the click just confirmed are counted (the window must not re-seed while you edit it).
  const [bulkOpen, setBulkOpen] = useState(false)
  // The tool-wide style library: how products became ElementTypes on every project opened.
  const [styleLibrary, setStyleLibrary] = useState([])
  useEffect(() => {
    let live = true
    Promise.resolve(window.electronAPI?.db?.getStyleExemplars?.())
      .then(rows => { if (live && Array.isArray(rows)) setStyleLibrary(rows) })
      .catch(() => { /* no library yet */ })
    return () => { live = false }
  }, [])
  // Identity of the picked workbook. `filepath` is an in-memory token that cannot
  // survive a reload, so the draft (and the captures) carry this instead.
  const [source, setSource] = useState(null)
  const [autoStart, setAutoStart] = useState(false)   // columns obvious → skip the map step
  const [autoMap, setAutoMap] = useState({})   // what the tool guessed, so it can say so
  const [resumeDismissed, setResumeDismissed] = useState(false)
  const [showLearned, setShowLearned] = useState(false)   // the dialect panel, from the ⋯ menu
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
      // Optional, and often present but unused: only map it when some row fills it in.
      acc: (h => (h && data.rows.some(r => !isPlaceholder(r[h])) ? h : ''))(detect(data.headers, 'accessor')),
    }
    setAutoMap(guessed)
    setMap({ ...guessed, context: CONTEXT_WANTS.map(w => detect(data.headers, w)).filter(Boolean) })
    setStep('map')
    // The three columns that matter were all found: skip straight on (Back returns here).
    setAutoStart(!!(guessed.code && guessed.pt && guessed.mfr))
  }

  async function pickSheet(name) {
    setBusy(true)
    try { applySheet(await readSheet(filepath, name)) }
    catch (err) { setError(err.response?.data?.error || err.message) }
    finally { setBusy(false) }
  }

  async function openToken(path) {
    setFilepath(path)
    setSource(await fileMeta(path))
    loadWorkbook(path)
  }

  async function handlePick() {
    const path = await window.electronAPI?.openXlsxDialog?.()
    if (!path) return
    // Remembered for this project, like its folder: next time Import reopens it.
    try { await window.electronAPI?.rememberFormFile?.(projectId, path) } catch { /* not remembered */ }
    setRemembered(null)
    openToken(path)
  }

  /** Reopen the remembered Form (a click: the browser may ask for access again). */
  async function reopenRemembered() {
    const r = await window.electronAPI?.reopenFormFile?.(projectId, { ask: true })
    if (r?.token) { setRemembered(null); openToken(r.token) }
    else setError('Could not open it again. Choose the spreadsheet instead.')
  }

  /**
   * Compare this import with an older Form spreadsheet. Its columns are read by the same
   * header names as this sheet's mapping (else guessed); it is only read, never imported.
   */
  async function compareWithFile() {
    const path = await window.electronAPI?.openXlsxDialog?.()
    if (!path) return
    setBusy(true); setError(null)
    try {
      setCompareBase(await readOlderForm(path, map, { readSheet, fileMeta }))
      setFilter('all')
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally { setBusy(false) }
  }

  const skipped = useMemo(
    () => (map.exclude ? rawRows.filter(r => isExcluded(r[map.exclude])).length : 0),
    [rawRows, map.exclude]
  )

  /**
   * Every column worth carrying. CAPTURE is generous and SHOW is a preference: a column
   * that was never captured can never be offered in the Side-by-Side pane later without a
   * re-import, and "I want to see Wattage too" should not cost a re-import.
   *
   * `map.context` therefore no longer decides what is kept — only what is shown by default.
   */
  const capturable = useMemo(() => capturableColumns(headers, map), [headers, map])

  /** The rows the mapping selects, in queue order. */
  const buildRows = useCallback(() => rawRows
    .filter(r => !(map.exclude && isExcluded(r[map.exclude])))
    // The Accessories column (when mapped) is more codes for the same position.
    .map(r => ({ r, text: joinAccessories(r[map.code], map.acc ? r[map.acc] : null) }))
    .filter(({ text }) => text !== '')
    .map(({ r, text }, i) => ({
      ...makeRow(i, text, {
        positionType: String(r[map.pt] ?? '').trim(),
        manufacturer: String(r[map.mfr] ?? '').trim(),
        context: captureContext(r, capturable),
      }),
      // Where the Accessories text starts: codes after it are extras by default.
      accFrom: accessoriesFrom(r[map.code], text),
    })), [rawRows, map, capturable])

  /**
   * Before reviewing a single code, settle where each Form ref's recipe belongs.
   * The DesignDB's ExtRef usually answers it; the user confirms and may override.
   * Skipped when the sheet has no PositionType column — nothing to resolve.
   */
  /**
   * Rows whose every product code is already in the Product Spec (same maker, same code)
   * ARE confirmed: the spec has decided them. So are rows with no product at all. Not when the spec flagged the row (a variant,
   * codes side by side) or a code is only a guess. `byRow` is applyKnownCodes's.
   */
  function confirmInSpec(rows, rowRules, byRow) {
    return applyRules(rows, rowRules).map(r => {
      if (r.confirmed) return r
      // "n/a", "by others": nothing to add, so nothing to decide (ZEM43Y).
      if (isNothingRow(r)) return { ...r, confirmed: true, autoConfirmed: true }
      const m = byRow?.get(r.id)
      if (m && (m.variants?.length || m.adjacent?.length)) return r
      const caps = productCaptures(r, captureOpts)
      if (!caps.length || !caps.every(c => classify(c.code, ctx, r.manufacturer).status === 'green')) return r
      return { ...r, confirmed: true, autoConfirmed: true }
    })
  }

  function startResolve() {
    const raw = buildRows()

    // Stage ① — most of a revised Form is unchanged. Every run of tokens that IS a
    // product code already in this project's spec is painted for you: a lookup, not
    // a guess. Variants ("that code plus a bit more") are flagged, never painted.
    // Codes from this project's spec AND every project opened before are painted; then
    // every confident guess (a maker's code shape, a word shaped like a code) is
    // pre-selected underneath, so the table opens filled in and you only fix mistakes.
    const { rows: known, ...stats } = applyKnownCodes(raw, master, styleLibrary)
    const built = confirmInSpec(applyRules(applyRules(known, {}).map(prePaint), {}), {}, stats.byRow)
    stats.preCount = built.reduce((n, r) => n + Object.keys(r.pre || {}).length, 0)
    setKnownStats(stats.exactCount || stats.preCount || stats.variantCount || stats.adjacentCount ? stats : null)
    setPreKnownRows(stats.exactCount || stats.preCount ? raw : null)

    session.load({ rows: built })
    setExpandedId(null); setFocusId(null); setStaged(null); setUndoSnap(null)

    // Form refs are matched to DesignDB PositionTypes silently; only the ones that do not
    // match cleanly are raised, on their rows and in the toolbar (no separate step).
    setResolutions(map.pt ? resolveFormRefs(built.map(r => r.positionType), positionTypes) : [])
    enterReview(built)
  }

  // After applySheet's column guesses have landed in state (buildRows reads them).
  useEffect(() => {
    if (!autoStart || step !== 'map' || !map.code) return
    setAutoStart(false)
    startResolve()
  }, [autoStart, step, map])   // eslint-disable-line react-hooks/exhaustive-deps

  function enterReview(built = rows) {
    setStep('review')
    // Teach the dialect from a few examples only when the sheet needs it: if most rows
    // already read as obvious (one clean code, or nothing to add), go straight to the
    // table — "Teach from examples" stays one click away.
    // Only for a project starting from nothing (9GLX5N): with a Product Spec in place you
    // start straight away, with what it knows; never from the builder.
    if (embedded || psRows.some(r => String(r.ProductCode || r.productCode || '').trim())) return
    const obvious = built.filter(r => isObvious(r)).length
    if (built.length >= 3 && obvious < built.length * 0.6) setPriming(true)
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
    step, map, rules, assignments, resolutions, refOverrides, dirStats, compareBase, stagedRefs,
    keptSeparate: [...keptSeparate],
    rows: rows.map(r => ({
      id: r.id, rawText: r.rawText, positionType: r.positionType, manufacturer: r.manufacturer,
      context: r.context, overrides: r.overrides, noteOverride: r.noteOverride, confirmed: r.confirmed,
      ...(r.autoConfirmed ? { autoConfirmed: true } : {}),
      accFrom: r.accFrom ?? null, leadCode: r.leadCode ?? null, pre: r.pre || null,
    })),
  }), [source, sheet, step, map, rules, assignments, resolutions, refOverrides, dirStats, keptSeparate, rows, compareBase, stagedRefs])

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
      autoConfirmed: !!r.autoConfirmed,
      accFrom: r.accFrom ?? null,
      leadCode: r.leadCode ?? null,
      ...(r.pre ? { pre: r.pre } : {}),
    }))
    // The auto-paint lives in `overrides` and came back with them; recompute the
    // MATCH so the amber variant marks and the banner survive a resume too. It is
    // idempotent, and there is nothing left to undo.
    const { rows: _ignored, ...stats } = applyKnownCodes(restored, master, styleLibrary)
    // Codes the spec has learned since (or rows saved before this rule): confirmed.
    const settled = confirmInSpec(restored, d.rules || {}, stats.byRow)
    for (let k = 0; k < restored.length; k++) restored[k] = { ...restored[k], confirmed: settled[k].confirmed, autoConfirmed: !!(settled[k].autoConfirmed || restored[k].autoConfirmed) }
    setKnownStats(stats.exactCount || stats.variantCount || stats.adjacentCount ? stats : null)
    setPreKnownRows(null)
    session.load({
      rows: restored,
      rules: d.rules || {},
      assignments: d.assignments || {},
      refOverrides: d.refOverrides || {},
      keptSeparate: new Set(d.keptSeparate || []),
      dirStats: d.dirStats || { forward: 0, backward: 0 },
    })
    setExpandedId(null)
    setResolutions(d.resolutions || [])
    setMap(d.map ? { acc: '', ...d.map } : { pt: '', code: '', mfr: '', exclude: '', acc: '', context: [] })
    setSource(d.source || null)
    setSheet(d.source?.sheet || '')
    setCompareBase(d.compareBase || null)
    setStagedRefs(d.stagedRefs || [])
    setStaged(null); setUndoSnap(null)
    setStep('review')   // never back to pick/map: no workbook (a draft saved at the old resolve step lands here too)
  }

  /** Un-paint everything the spec matched, in one step. */
  function undoKnownPaint() {
    if (!preKnownRows) return
    setRows(applyRules(preKnownRows, rules))
    setPreKnownRows(null)
    setKnownStats(s => (s ? { ...s, exactCount: 0, libraryCount: 0, preCount: 0 } : null))
  }

  async function discardDraft() {
    await clearImportDraft()
    setResumeDismissed(true)
  }

  // A saved import always carries on where it left off: no question to answer.
  useEffect(() => {
    if (step === 'pick' && importDraft && !resumeDismissed) { setResumeDismissed(true); resumeDraft(importDraft) }
  }, [step, importDraft, resumeDismissed])   // eslint-disable-line react-hooks/exhaustive-deps

  // No saved import: reopen the Form last used for this project, as the folder is. Straight
  // in when access is still granted; otherwise a one-click "Reopen …".
  const [remembered, setRemembered] = useState(null)   // { name } awaiting a click
  useEffect(() => {
    if (step !== 'pick' || importDraft || filepath) return
    let live = true
    Promise.resolve(window.electronAPI?.reopenFormFile?.(projectId, { ask: false })).then(r => {
      if (!live || !r) return
      if (r.token) openToken(r.token)
      else setRemembered({ name: r.name })
    }).catch(() => {})
    return () => { live = false }
  }, [step, importDraft, projectId])   // eslint-disable-line react-hooks/exhaustive-deps

  /** Start again from a (new) Form spreadsheet: the ⋯ menu's Re-import. */
  async function reimport() {
    if (rows.some(r => r.confirmed && !r.autoConfirmed) && !window.confirm('Start again from a spreadsheet? The painting and confirms on this import are dropped (anything already added to the Product Spec stays).')) return
    // The Form being replaced becomes what the new one is compared with.
    const base = rows.length ? { name: source?.name || 'the last import', rows: rows.map(diffRow) } : compareBase
    await discardDraft()
    setCompareBase(base)
    setStagedRefs([]); setSelectedRefs(new Set())
    session.load({ rows: [] })
    setStaged(null); setExpandedId(null); setKnownStats(null); setPreKnownRows(null)
    setStep('pick')
    handlePick()
  }

  // ---- review ---------------------------------------------------------------
  // The row open in the painter (the table's expanded row).
  const current = expandedId != null ? resolved.find(r => r.id === expandedId) || null : null
  // The table reads like the sheet: Form order, not confidence order.
  const formOrder = useMemo(() => [...resolved].sort((a, b) => a.id - b.id), [resolved])
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
      role,
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
  }, [resolved, patchRow])

  /** The active row's sweep, with the palette's brush and scope. */
  const paint = useCallback((idxs, role = brush, localOnly = scope === 'row') => {
    if (!current) return
    paintRow(current.id, idxs, role, localOnly)
  }, [current, paintRow, brush, scope])

  function undoLastPaint() {
    session.undo()
    setUndoSnap(null)
  }

  // Ctrl+Z / Ctrl+Shift+Z undo and redo any decision in the import (not while typing).
  useEffect(() => {
    if (step !== 'review' && step !== 'resolve') return
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const t = e.target
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      if (e.shiftKey) session.redo(); else session.undo()
      setUndoSnap(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, session.undo, session.redo])   // eslint-disable-line react-hooks/exhaustive-deps

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
    setExpandedId(null)
  }

  /** Right-hand bar -> jump back to a row that produced this code, to adjust it. */
  function jumpToCode(entry) {
    const first = entry.rowRefs[0]
    if (first == null) return
    setFilter('all'); setQuery('')
    setExpandedId(first); setFocusId(first); setUndoSnap(null)
    setTimeout(() => document.querySelector(`[data-row-id="${first}"]`)?.scrollIntoView?.({ block: 'center' }), 0)
  }

  /** Confirm takes the suggested codes with it — that's what they're for. */
  const confirmAndAdvance = useCallback(() => {
    if (!current) return
    patchRow(current.id, r => ({
      ...acceptSuggestions({ ...r, roles: current.roles }, rules, signals),
      confirmed: true,
    }))
    // On to the next unconfirmed row in the sheet, open in the painter.
    const at = formOrder.findIndex(r => r.id === current.id)
    const next = formOrder.slice(at + 1).find(r => !r.confirmed)
    setExpandedId(next ? next.id : null)
    if (next) setFocusId(next.id)
    setUndoSnap(null)
  }, [current, patchRow, rules, signals, formOrder])

  /** Confirm every obvious row at once (one undo step); the doubtful ones stay for you. */
  // By position: the rows of the selected positions are the whole world.
  const inSelection = useMemo(() => (mode === 'position'
    ? r => selectedRefs.has(String(r.positionType ?? '').trim()) : null), [mode, selectedRefs])

  const confirmObvious = useCallback(() => {
    const easy = new Map(resolved.filter(r => (!inSelection || inSelection(r)) && isObvious(r, rules, signals, captureOpts)).map(r => [r.id, r]))
    if (easy.size === 0) return
    setRows(rs => rs.map(r => {
      const res = easy.get(r.id)
      return res ? { ...acceptSuggestions({ ...r, roles: res.roles }, rules, signals), confirmed: true } : r
    }))
  }, [resolved, rules, signals, captureOpts, inSelection])


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
        if (e.placeholderKey) { m.set(norm(e.placeholderKey), ref); continue }
        if (e.code) m.set(norm(e.code), ref)
        for (const mg of e.merged || []) if (mg.code) m.set(norm(mg.code), ref)
      }
    }
    return m
  }, [formCaptures])

  const entries = useMemo(() => buildDistinct(confirmed, captureOpts).filter(e => hasProductIdentity(e.text)).map(e => {
    // A product is (maker, code): the same code from another maker is another product.
    const c = classify(e.text, ctx, e.manufacturers[0] || '')
    // The spec wins; your past decision is only consulted where the spec is silent.
    const etRef = c.elementTypeRef || assignments[norm(e.text)] || priorEtByCode.get(norm(e.text)) || null
    const note = e.variants[0]?.note || ''
    // Only unresolved codes need a suggestion / reuse candidates.
    const help = etRef ? {} : {
      reuse: reuseCandidates(e.text, note, { psRows, elementTypes, manufacturer: e.manufacturers[0] || '' }, 3),
      suggested: suggestRef(e.text, note, e.manufacturers[0] || '', convention, elementTypes, psRows),
    }
    return { ...e, ...c, etRef, ...help }
  }), [confirmed, ctx, assignments, captureOpts, psRows, elementTypes, convention, priorEtByCode])

  /**
   * TBC rows ("TBC", "*custom*", "Awaiting custom code", "Light Sheet"): a product is wanted
   * but not chosen. Each position gets one entry, keyed "TBC (J3a)", which becomes its own
   * ElementType and a placeholder Product Spec row (ProductCode TBC, IsTBC Y).
   */
  const tbcEntries = useMemo(() => {
    const byKey = new Map()
    for (const r of confirmed) {
      if (!isTbc(r, captureOpts)) continue
      const text = tbcKey(r)
      const note = r.rawText.replace(/\s*\n\s*/g, ' ').trim()
      if (!byKey.has(text)) {
        const etRef = assignments[norm(text)] || priorEtByCode.get(norm(text)) || null
        byKey.set(text, {
          text, placeholder: { formRef: r.positionType || text }, status: 'placeholder', etRef,
          rowRefs: [], manufacturers: r.manufacturer ? [r.manufacturer] : [],
          positionTypes: r.positionType ? [r.positionType] : [], variants: [{ note, rowRefs: [], positionTypes: [] }],
        })
      }
      byKey.get(text).rowRefs.push(r.id)
    }
    return [...byKey.values()]
  }, [confirmed, captureOpts, assignments, priorEtByCode])
  const codeEntries = entries
  const allEntries = useMemo(() => [...codeEntries, ...tbcEntries], [codeEntries, tbcEntries])

  const { collisions, similar } = useMemo(
    () => pendingResolutions(codeEntries, keptSeparate), [codeEntries, keptSeparate]
  )
  const unassigned = allEntries.filter(e => !e.etRef && !hasNoteCollision(e))
  // Staging is incremental. handleStage only ever writes entries that HAVE an
  // ElementType, so an unassigned or colliding code is simply left where it is —
  // no reason to hold the finished ones hostage to it. The draft survives so the
  // rest can be finished later.
  const stageable = allEntries.filter(e => e.etRef).length
  const leftBehind = allEntries.length - stageable
  const canStage = stageable > 0
  // The main button waits for the whole Form: every row confirmed, every code with an
  // ElementType. Adding part of it is possible (⋯) but never the easy path — half an import
  // is hard to retrace.
  const unconfirmedCount = resolved.filter(r => !r.confirmed).length
  const ready = unconfirmedCount === 0 && leftBehind === 0 && canStage

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
      ref: lead.suggested?.ref || '',
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

  /**
   * An ElementType proposal for EVERY code still without one (etSeed.js): family-based
   * ref, "Maker - Code" name, description seeded from the Form's product name column.
   * The bulk review starts from these, and a single "Create" uses the same ref.
   *
   * A code is the LEAD of its cell (the luminaire) when it is the first capture of any
   * Form row that yields it; any other code is an extra, filed as an accessory.
   */
  const { proposals, newFamilies } = useMemo(() => {
    const byId = new Map(confirmed.map(r => [r.id, r]))
    const pick = c => {
      const keys = Object.keys(c || {})
      const k = keys.find(h => /product\s*name/i.test(h)) || keys.find(h => /description/i.test(h))
      return k ? String(c[k] ?? '').trim() : ''
    }
    const contextFor = e => {
      for (const id of e.rowRefs) {
        const text = pick(byId.get(id)?.context)
        if (text) return text
      }
      return ''
    }
    // The Form's PageType (Point / Linear) — which company family a code can belong to.
    const pageTypeFor = e => {
      for (const id of e.rowRefs) {
        const c = byId.get(id)?.context || {}
        const k = Object.keys(c).find(h => /page\s*type/i.test(h))
        if (k && String(c[k] ?? '').trim()) return String(c[k]).trim()
      }
      return ''
    }
    const leads = new Set()
    for (const r of confirmed) {
      const lead = leadOf(r, productCaptures(r, captureOpts))
      if (lead) leads.add(norm(lead.code))
    }
    return proposeElementTypes(unassigned, {
      elementTypes, psRows, recipes, positionTypes, collectionRefs: dbCollectionRefs,
      ptTarget: map.pt ? ptTarget : r => r, contextFor,
      roleOf: e => (leads.has(norm(e.text)) ? 'lead' : 'extra'),
      pageTypeFor,
      library: styleLibrary,
    })
  }, [unassigned, confirmed, captureOpts, elementTypes, psRows, recipes, positionTypes, dbCollectionRefs, map.pt, ptTarget, styleLibrary])

  /** Every family the project already has: collection rows, and the ParentRefs in use. */
  const knownFamilies = useMemo(() => [...new Set([
    ...dbCollectionRefs, ...elementTypes.map(e => e.Family || e.family).filter(Boolean),
  ])], [dbCollectionRefs, elementTypes])

  /** Create a family's collection row (under its own parent) if the project does not have it yet. */
  function ensureFamily(ref, description, parent = null) {
    if (!ref) return
    const have = useStore.getState().elementTypes.some(e => (e.ElementTypeRef || '').toLowerCase() === ref.toLowerCase())
    if (have || knownFamilies.some(f => f.toLowerCase() === ref.toLowerCase())) return
    createElementType({ ref, description: description || null, family: parent || null, isCollection: true })
  }

  // What a single "Create" offers: reuse/variant from suggestRef, else the family ref.
  const panelEntries = useMemo(() => {
    const seed = new Map(proposals.map(p => [norm(p.code), p]))
    return entries.map(e => {
      // A supplier's old numbering, from the shipped shape table — worth a look even once assigned.
      const old = matchShape(e.text, e.manufacturers[0] || '', shippedShapes.shapes).superseded
      e = old ? { ...e, superseded: { example: old.example } } : e
      if (e.etRef || !e.suggested) return e
      const p = seed.get(norm(e.text))
      const ref = e.suggested.reason === 'new' && p?.ref ? p.ref : e.suggested.ref
      return { ...e, suggestedRef: ref, seed: p }
    })
  }, [entries, proposals])

  function openBulkCreate() {
    setEtFocusCode(null)
    setBulkOpen(true)
  }
  useEffect(() => {
    if (!bulkOpen || bulkProposals) return
    // By position: only the selected positions' codes.
    const scoped = mode === 'position'
      ? new Set(entries.filter(e => (e.positionTypes || []).some(pt => selectedRefs.has(String(pt ?? '').trim()))).map(e => norm(e.text)))
      : null
    setBulkProposals({ proposals: scoped ? proposals.filter(p => scoped.has(norm(p.code))) : proposals, newFamilies })
  }, [bulkOpen, bulkProposals, proposals, newFamilies, mode, selectedRefs, entries])

  /** Apply the reviewed proposals: new families first, then reuse or create each code. */
  function applyBulk({ families, items, notCodes = [] }) {
    // "Not a code": its words are a note on every row, from now on (revocable like any rule).
    const words = [...new Set(notCodes.flatMap(c => String(c).split(/\s+/).filter(Boolean)))]
    if (words.length) {
      setRules(rl => words.reduce((acc, w) => setRule(acc, w, 'note'), rl))
      setRows(rs => clearOverridesFor(rs, words))
    }
    // Parents before children, so a ParentRef never points at a row not yet made.
    const depth = f => (f.parent && families.some(x => x.ref === f.parent) ? 1 + depth(families.find(x => x.ref === f.parent)) : 0)
    for (const f of [...families].sort((a, b) => depth(a) - depth(b))) ensureFamily(f.ref.trim(), f.description.trim(), f.parent)
    for (const p of items) {
      if (p.action === 'reuse' && p.reuseRef) { assignET(p.code, p.reuseRef); continue }
      const ref = p.ref.trim()
      createElementType({
        ref, name: p.name.trim() || null, description: p.description.trim() || null, family: p.family || null,
      })
      // A TBC placeholder's spec row says so: no code yet, flagged TBC.
      const spec = { ProductCode: p.placeholder ? 'TBC' : p.code, ...(p.placeholder ? { IsTBC: 'Y' } : {}),
        ...(p.manufacturer ? { Manufacturer: p.manufacturer } : {}) }
      if (psRows.some(r => (r.ElementTypeRef || '').toLowerCase() === ref.toLowerCase())) updatePSRow(ref, spec)
      else addPSRow(ref, spec)
      assignET(p.code, ref)
    }
    setBulkProposals(null); setBulkOpen(false)
  }

  /** Assign an existing ElementType to a distinct code — the reuse/dedup win. */
  function handleReuse(entry, ref) {
    assignET(entry.text, ref)
  }

  /**
   * handleStage({ only }) — `only` (a Set of Form refs) stages just those positions ("By
   * position" mode): their codes' Product Spec rows, and their captures MERGED into the
   * Form's (formPositions.mergeCaptures), so every other position keeps what it had.
   * Returns the resolved PositionTypeRefs staged.
   */
  async function handleStage({ only = null } = {}) {
    const inScope = r => !only || only.has(String(r.positionType ?? '').trim())
    const entryInScope = e => !only || (e.positionTypes || []).some(pt => only.has(String(pt ?? '').trim()))
    // 1. Stage the Product Spec: product code + manufacturer per code, note → ET Description.
    let n = 0
    const codeToEt = new Map()
    for (const e of allEntries) {
      if (!e.etRef) continue
      // Codes elsewhere in the Form keep their ElementType for the captures below, but
      // only this selection's codes are written to the spec now.
      if (!entryInScope(e)) { codeToEt.set(norm(e.text), e.etRef); continue }
      codeToEt.set(norm(e.text), e.etRef)
      const note = e.variants[0]?.note || ''
      if (e.placeholder) {
        // The placeholder Product Spec row: a product is wanted, not chosen yet.
        ensurePSRow(e.etRef)
        updatePSRow(e.etRef, {
          ProductCode: 'TBC', IsTBC: 'Y',
          ...(e.manufacturers.length === 1 ? { Manufacturer: e.manufacturers[0] } : {}),
        })
        n++
        continue
      }
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
      if (!row.positionType || !inScope(row)) continue
      const target = map.pt ? ptTarget(row.positionType) : row.positionType
      if (!target) { unrouted++; continue }
      // EVERY column the sheet carries for this position, not just the ones ticked at the
      // mapping step. What is shown is a preference the pane can change at any time; what
      // is captured can only be changed by re-importing, so capture everything.
      if (!contextByPosition[target] && Object.keys(row.context || {}).length) {
        contextByPosition[target] = row.context
      }
      const caps = productCaptures(row, captureOpts)
      if (isTbc(row, captureOpts)) {
        const key = tbcKey(row)
        const et = codeToEt.get(norm(key))
        const item = { code: 'TBC', placeholderKey: key, note: row.rawText.replace(/\s*\n\s*/g, ' ').trim(), role: 'lead',
          manufacturer: row.manufacturer || '', formRef: row.positionType }
        const bucket = et ? byPos : pendingByPos
        if (!bucket.has(target)) bucket.set(target, [])
        const list = bucket.get(target)
        if (!list.some(x => x.placeholderKey === key)) list.push(et ? { elementTypeRef: et, ...item } : item)
        continue
      }
      const lead = leadOf(row, caps)
      for (const cap of caps) {
        const role = cap === lead ? 'lead' : 'extra'
        const et = codeToEt.get(norm(cap.code))
        if (!et) {
          // The Form asked for this product. Nobody has said what it is yet.
          if (!pendingByPos.has(target)) pendingByPos.set(target, [])
          const pend = pendingByPos.get(target)
          if (!pend.some(x => norm(x.code) === norm(cap.code))) {
            pend.push({
              code: cap.code, note: cap.note, role,
              manufacturer: row.manufacturer || '', formRef: row.positionType,
            })
          }
          continue
        }
        if (!byPos.has(target)) byPos.set(target, [])
        const list = byPos.get(target)
        if (!list.some(x => x.elementTypeRef === et)) {
          list.push({
            elementTypeRef: et, code: cap.code, note: cap.note, role,
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
      // What the sheet HAS (in sheet order), and what to show unless the pane says otherwise.
      contextColumns: capturable,
      contextDefaults: map.context,
      // The Form's own "leave this out" flag (ExcludeFromOutput). The bare Form refs — dead
      // positions resolve them to recipe space via ExtRef (see deadPositions.js). Empty when
      // no exclude column was mapped.
      excludedFormRefs: map.exclude
        ? [...new Set(rawRows
            .filter(r => isExcluded(r[map.exclude]))
            .map(r => String(r[map.pt] ?? '').trim())
            .filter(Boolean))]
        : [],
      orphansByPosition: {},
      unrouted: resolutions.filter(r => !r.target).map(r => ({ formRef: r.formRef, rows: r.rows })),
    }
    // A selection is compared, and merged, only within its own positions.
    const scopeTargets = only ? [...new Set(confirmed.filter(inScope)
      .map(r => (map.pt ? ptTarget(r.positionType) : r.positionType)).filter(Boolean))] : null
    if (only) nextCaptures.unrouted = nextCaptures.unrouted.filter(u => only.has(u.formRef))
    const diff = diffCaptures(only ? restrictCaptures(formCaptures, scopeTargets) : formCaptures, nextCaptures)

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

    if (only) {
      await saveFormCaptures(mergeCaptures(formCaptures, nextCaptures, scopeTargets, [...only]))
      setStagedRefs(prev => [...new Set([...prev, ...only])])
      return scopeTargets
    }
    await saveFormCaptures(nextCaptures)
    // The draft is kept after adding: coming back to Import picks up this Form where it
    // was (to check it, or add what changed). Only Re-import (⋯) starts again.
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
  const easyLeft = useMemo(() => resolved.filter(r => (!inSelection || inSelection(r)) && isObvious(r, rules, signals, captureOpts)).length, [resolved, rules, signals, captureOpts, inSelection])

  // ---- the table ------------------------------------------------------------
  /** The ElementType a code already has: the spec first, then your choice, then last import's. */
  const etFor = useCallback((code, manufacturer) =>
    classify(code, ctx, manufacturer).elementTypeRef || assignments[norm(code)] || priorEtByCode.get(norm(code)) || null,
  [ctx, assignments, priorEtByCode])

  /** Where each Form ref goes, by ref: 'ok' | 'redirect' | 'missing' | 'ambiguous'. */
  const refState = useMemo(() => {
    const m = new Map()
    for (const r of resolutions) {
      const o = refOverrides[r.formRef]
      const target = o === undefined ? r.target : (o || null)
      const state = !target ? 'missing' : (o === undefined && r.ambiguous?.length) ? 'ambiguous'
        : norm(target) !== norm(r.formRef) ? 'redirect' : 'ok'
      m.set(norm(r.formRef), { target, state })
    }
    return m
  }, [resolutions, refOverrides])

  const rowInfo = useCallback(row => {
    const caps = productCaptures(row, captureOpts)
    if (isTbc(row, captureOpts)) {
      const key = tbcKey(row)
      return {
        codes: [{ code: key, main: true, etRef: assignments[norm(key)] || priorEtByCode.get(norm(key)) || null }],
        status: { tone: 'warn', icon: 'hourglass_empty', label: 'TBC', tip: 'No product chosen yet: it gets a placeholder Product Spec row (TBC) and its own ElementType.' },
        suggested: [],
        pt: map.pt ? (refState.get(norm(row.positionType)) || { state: 'ok' }) : { state: 'ok' },
      }
    }
    const lead = leadOf(row, caps)
    const codes = caps.map(c => ({ code: c.code, main: c === lead, etRef: etFor(c.code, row.manufacturer) }))
    const st = lead ? classify(lead.code, ctx, row.manufacturer).status : null
    const status = !lead
      ? (isNothingRow(row)
          ? { tone: 'neutral', icon: 'block', label: 'nothing to add', tip: 'No product here (n/a, by others, by specialist…): nothing to add.' }
          : { tone: 'neutral', icon: 'remove', label: 'no code', tip: 'Nothing in this cell is marked as a code.' })
      : { tone: TONE[st], icon: ICON[st], label: STATUS_LABEL[st], tip: MEANS[st] }
    return {
      codes, status,
      suggested: row.confirmed ? [] : suggestCodes(row, rules, signals),
      pt: map.pt ? (refState.get(norm(row.positionType)) || { state: 'ok' }) : { state: 'ok' },
    }
  }, [captureOpts, etFor, ctx, rules, signals, map.pt, refState, assignments, priorEtByCode])

  const refProblems = useMemo(
    () => [...refState.values()].filter(r => r.state === 'missing' || r.state === 'ambiguous').length, [refState])

  /** A row still waiting on an ElementType: one of its codes, or its TBC placeholder. */
  const needsEt = useCallback(r => (isTbc(r, captureOpts) ? !etFor(tbcKey(r), r.manufacturer)
    : productCaptures(r, captureOpts).some(c => !etFor(c.code, r.manufacturer))), [captureOpts, etFor])
  const needsEtCount = useMemo(() => formOrder.filter(needsEt).length, [formOrder, needsEt])

  // ---- By position ------------------------------------------------------------
  // Remembered per project; Whole Form unless you chose otherwise.
  useEffect(() => {
    if (projectId == null || embedded) return
    Promise.resolve(window.electronAPI?.db?.getPref?.(projectId, 'import_mode'))
      .then(v => { if (v === 'position' || v === 'form') setModeState(v) }).catch(() => {})
  }, [projectId])
  const setMode = m => {
    setModeState(m)
    if (projectId != null) Promise.resolve(window.electronAPI?.db?.setPref?.(projectId, 'import_mode', m)).catch(() => {})
  }
  const scopeRows = useMemo(() => (inSelection ? formOrder.filter(inSelection) : formOrder), [formOrder, inSelection])
  const stagedSet = useMemo(() => new Set(stagedRefs), [stagedRefs])
  const formPositions = useMemo(() => groupPositions(formOrder).map(g => ({
    ...g, target: map.pt ? ptTarget(g.formRef) : g.formRef,
    status: positionStatus(g, { needsEt, stagedRefs: stagedSet }),
  })), [formOrder, map.pt, ptTarget, needsEt, stagedSet])
  // Nothing (or nothing that still exists) selected: take the next position still to do.
  const embeddedRef = embedded?.posRef || null
  // Embedded `autoSaveAll` (the builder, once a Form is loaded): every position whose rows
  // are all confirmed and all have an ElementType, in one selection, saved together.
  useEffect(() => {
    if (!embedded?.autoSaveAll || step !== 'review') return
    const want = formPositions.filter(p => p.status === 'ready').map(p => p.formRef)
    if (want.length !== selectedRefs.size || want.some(r => !selectedRefs.has(r))) setSelectedRefs(new Set(want))
  }, [embedded, step, formPositions, selectedRefs])
  useEffect(() => {
    if (!embeddedRef || step !== 'review') return
    // Embedded: the Form refs that land on this PositionType, and nothing else.
    const want = formPositions.filter(p => String(p.target || '').toLowerCase() === embeddedRef.toLowerCase()).map(p => p.formRef)
    if (want.length !== selectedRefs.size || want.some(r => !selectedRefs.has(r))) setSelectedRefs(new Set(want))
  }, [embeddedRef, step, formPositions, selectedRefs])
  // …and the painter opens on its first row still to confirm.
  useEffect(() => {
    if (!embeddedRef || step !== 'review') return
    const first = formOrder.find(r => selectedRefs.has(String(r.positionType ?? '').trim()) && !r.confirmed)
    setExpandedId(first ? first.id : null)
    if (first) setFocusId(first.id)
  }, [embeddedRef, step, selectedRefs])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (embedded || mode !== 'position' || step !== 'review' || formPositions.length === 0) return
    const live = [...selectedRefs].filter(r => formPositions.some(p => p.formRef === r))
    if (live.length) { if (live.length !== selectedRefs.size) setSelectedRefs(new Set(live)); return }
    const next = formPositions.find(p => p.status !== 'done') || formPositions[0]
    setSelectedRefs(new Set([next.formRef]))
  }, [mode, step, formPositions, selectedRefs])
  // What the selection still needs, for its checklist.
  const selection = useMemo(() => {
    if (mode !== 'position') return null
    const rowsIn = formOrder.filter(r => selectedRefs.has(String(r.positionType ?? '').trim()))
    const inSel = e => (e.positionTypes || []).some(pt => selectedRefs.has(String(pt ?? '').trim()))
    const codes = allEntries.filter(inSel)
    // Counted from the rows, confirmed or not: the codes they hold with no ElementType yet.
    const missing = new Set()
    for (const r of rowsIn) {
      if (isTbc(r, captureOpts)) { if (!etFor(tbcKey(r), r.manufacturer)) missing.add(norm(tbcKey(r))) }
      else for (const c of productCaptures(r, captureOpts)) if (!etFor(c.code, r.manufacturer)) missing.add(norm(c.code))
    }
    const noEt = Math.max(missing.size, codes.filter(e => !e.etRef).length)
    const unconfirmedRows = rowsIn.filter(r => !r.confirmed).length
    const clashes = collisions.filter(inSel).length
    return {
      refs: [...selectedRefs], rows: rowsIn.length, unconfirmedRows, codes: codes.length, noEt, clashes,
      // The ElementTypes window works on confirmed rows' codes.
      canOpenEts: codes.some(e => !e.etRef) || clashes > 0,
      ready: rowsIn.length > 0 && unconfirmedRows === 0 && noEt === 0 && clashes === 0,
    }
  }, [mode, formOrder, selectedRefs, allEntries, collisions, captureOpts, etFor])
  // The code list follows the selection in By position mode.
  const shownEntries = useMemo(() => (mode === 'position'
    ? panelEntries.filter(e => (e.positionTypes || []).some(pt => selectedRefs.has(String(pt ?? '').trim())))
    : panelEntries), [mode, panelEntries, selectedRefs])
  const [addingSel, setAddingSel] = useState(false)
  async function addSelectionAndBuild() {
    setAddingSel(true)
    try {
      const targets = await handleStage({ only: new Set(selectedRefs) })
      // Save now: the debounced draft save would die with this screen on the way out.
      await saveImportDraft({ ...draftFromState(), stagedRefs: [...new Set([...stagedRefs, ...selectedRefs])] })
      if (embedded) { embedded.onStaged?.(targets || []); return }
      if (onReviewPositions && targets?.length) onReviewPositions(targets, { fromImport: true })
    } finally { setAddingSel(false) }
  }

  // Embedded with `autoSave` (the builder, for a position whose Form rows are all known
  // codes): save them to the position at once, so its Form-vs-recipe comparison shows
  // without a Save step nobody needs. Rows that need a decision are left for the painter.
  const autoSaved = useRef(null)
  useEffect(() => {
    // Only with codes to save: a confirmed row with nothing painted must not save an empty position.
    if (!(embedded?.autoSave || embedded?.autoSaveAll) || step !== 'review' || !selection?.ready || !selection.codes || addingSel) return
    const key = `${embedded.posRef}|${selection.refs.join(',')}`
    if (autoSaved.current === key) return
    autoSaved.current = key
    addSelectionAndBuild()
  })   // eslint-disable-line react-hooks/exhaustive-deps

  // What changed since the older Form (formDiff.js), per row id, and what it no longer has.
  const formDiff = useMemo(() => {
    if (!compareBase) return null
    const res = matchForms(compareBase.rows || [], formOrder.map(diffRow))
    const byId = new Map(formOrder.map((r, i) => [r.id, res.rows[i]]))
    return { byId, removed: res.removed, counts: res.counts }
  }, [compareBase, formOrder])
  /** The codes in an old row the Product Spec knows: "QC7000 · ET-PS-04". */
  const knownIn = useCallback(old => String(old?.rawText || '').split(/\s+/).filter(Boolean)
    .map(w => ({ code: w, et: classify(w, ctx, old.manufacturer).elementTypeRef || null }))
    .filter(x => x.et), [ctx])

  const tableRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return formOrder.filter(r => {
      if (inSelection && !inSelection(r)) return false
      if (filter === 'unconfirmed' && r.confirmed) return false
      if (filter === 'needsEt' && !needsEt(r)) return false
      if (['unchanged', 'changed', 'new'].includes(filter) && formDiff?.byId.get(r.id)?.state !== filter) return false
      if (filter === 'removed') return false
      if (!q) return true
      return [r.rawText, r.positionType, r.manufacturer, ...Object.values(r.context || {})]
        .some(v => String(v ?? '').toLowerCase().includes(q))
    })
  }, [formOrder, filter, query, needsEt, formDiff, inSelection])

  /** The Form's own columns, in its order; ProductCode carries Accessories (they share a cell). */
  const tableColumns = useMemo(() => {
    const cols = []
    if (map.pt) cols.push({ key: 'pt', label: map.pt })
    if (map.mfr) cols.push({ key: 'mfr', label: map.mfr })
    cols.push({ key: 'code', label: map.acc ? `${map.code} + ${map.acc}` : (map.code || 'ProductCode') })
    const order = headers.length ? headers : map.context
    for (const h of order) if (map.context.includes(h) && h !== map.acc) cols.push({ key: `ctx:${h}`, label: h })
    return cols
  }, [map, headers])

  /** Every column any row carries, for the column chooser. */
  const anyContext = useMemo(() => {
    const out = {}
    for (const r of rows) for (const [k, v] of Object.entries(r.context || {})) if (v != null && String(v).trim() !== '') out[k] = v
    return out
  }, [rows])

  /** A click in a cell: this word, this row only. */
  const setTokenRole = useCallback((rowId, i, role) => {
    patchRow(rowId, r => ({ ...r, overrides: { ...r.overrides, [i]: role } }))
  }, [patchRow])

  /** Ticking a row takes its suggested codes with it, as Confirm always has. */
  const toggleConfirm = useCallback(rowId => {
    const row = resolved.find(r => r.id === rowId)
    if (!row) return
    if (row.confirmed) patchRow(rowId, r => ({ ...r, confirmed: false, autoConfirmed: false }))
    else patchRow(rowId, r => ({ ...acceptSuggestions({ ...r, roles: row.roles }, rules, signals), confirmed: true, autoConfirmed: false }))
  }, [resolved, patchRow, rules, signals])

  /** "needs ET" on a code: its rows count as confirmed, then the ElementTypes window opens at it. */
  const openETFor = useCallback(code => {
    for (const r of resolved) {
      if (r.confirmed) continue
      const mine = isTbc(r, captureOpts) ? norm(tbcKey(r)) === norm(code)
        : deriveCaptures(r, captureOpts).captures.some(c => norm(c.code) === norm(code))
      if (mine) {
        patchRow(r.id, x => ({ ...acceptSuggestions({ ...x, roles: r.roles }, rules, signals), confirmed: true }))
      }
    }
    setEtFocusCode(code)
    setBulkOpen(true)
  }, [resolved, captureOpts, patchRow, rules, signals])
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

  // Keyboard, table-first: ↑/↓ move, Space confirms, Enter opens the painter (and, in it,
  // confirms and moves on), Esc closes it; 1/2/3 pick the brush and A takes suggestions in
  // the painter; B confirms every obvious row.
  const keyRef = useRef(null)
  keyRef.current = { tableRows, focusId, expandedId, current, confirmAndAdvance, confirmObvious, acceptRowSuggestions, toggleConfirm }
  useEffect(() => {
    // Not in the builder: single keys there belong to the builder.
    if (step !== 'review' || embedded) return
    function onKey(e) {
      const t = e.target
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = keyRef.current
      const at = k.tableRows.findIndex(r => r.id === k.focusId)
      const focusAt = i => {
        const r = k.tableRows[Math.max(0, Math.min(k.tableRows.length - 1, i))]
        if (!r) return
        setFocusId(r.id)
        document.querySelector(`[data-row-id="${r.id}"]`)?.scrollIntoView?.({ block: 'nearest' })
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(at + 1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(at - 1) }
      else if (e.key === ' ' && k.focusId != null) { e.preventDefault(); k.toggleConfirm(k.focusId) }
      else if (e.key === 'Enter') {
        e.preventDefault()
        if (k.current && k.expandedId === k.current.id) k.confirmAndAdvance()
        else if (k.focusId != null) setExpandedId(k.focusId)
      } else if (e.key === 'Escape' && k.expandedId != null) setExpandedId(null)
      else if (k.current && '123'.includes(e.key)) { e.preventDefault(); setBrush({ 1: 'code', 2: 'note', 3: 'discard' }[e.key]) }
      else if (k.current && e.key.toLowerCase() === 'a') { e.preventDefault(); k.acceptRowSuggestions() }
      else if (e.key.toLowerCase() === 'b') { e.preventDefault(); k.confirmObvious() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  // ---------------------------------------------------------------------------
  return (
    <div className={embedded ? '' : 'p-3'} style={embedded ? { fontSize: 11 } : { height: '100vh', display: 'flex', flexDirection: 'column' }}
      data-testid={embedded ? 'embedded-import' : undefined}>
      <div className={embedded ? 'd-none' : 'd-flex align-items-center gap-2 mb-3'}>
        <IconButton icon="arrow_back" size={18} onClick={onBack} title="Back" />
        <h5 className="mb-0 d-flex align-items-center gap-2" style={{ fontSize: 16 }}>
          <MaterialIcon name="auto_fix_high" size={20} /> Import product codes
        </h5>
        <TutorialHint id="code-import" />
        {source?.name && <span className="text-muted ms-2 text-truncate" style={{ fontSize: 11, maxWidth: 260 }}>{source.name}</span>}
        <ButtonGroup size="sm" className="ms-auto" aria-label="Work by" data-testid="import-mode">
          <Button variant={mode === 'form' ? 'primary' : 'outline-secondary'} style={{ fontSize: 11 }} onClick={() => setMode('form')}
            title="The three stages over the whole Form: every row, then every code, then add them all">Whole Form</Button>
          <Button variant={mode === 'position' ? 'primary' : 'outline-secondary'} style={{ fontSize: 11 }} onClick={() => setMode('position')}
            title="One position (or a few) at a time, end to end: rows, ElementTypes, Product Spec, recipe">By position</Button>
        </ButtonGroup>
        <Dropdown align="end">
          <Dropdown.Toggle as={IconButton} bsSize="sm" variant="outline-secondary" icon={ACTION_ICONS.more} title="More" aria-label="More" />
          <Dropdown.Menu style={{ fontSize: 12 }}>
            <Dropdown.Item onClick={() => handleStage()} disabled={!canStage || ready}
              title="Adds the codes that already have an ElementType; the rest wait in your draft">
              <MaterialIcon name="playlist_add" size={14} /> Add only the {stageable} finished now
            </Dropdown.Item>
            <Dropdown.Item onClick={reimport}>
              <MaterialIcon name="restart_alt" size={14} /> Re-import from a spreadsheet…
            </Dropdown.Item>
            <Dropdown.Item onClick={() => setShowLearned(v => !v)} disabled={step !== 'review'}>
              <MaterialIcon name={showLearned ? 'check_box' : 'check_box_outline_blank'} size={14} /> Learned this project
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>

      {/* The whole workflow, in three. The import owns ① and ②; the builder owns ③. */}
      <div className="mb-3" style={mode === 'position' || embedded ? { display: 'none' } : undefined}>
        <StageBar
          current={staged ? 3 : step === 'review' ? (canStage ? 2 : 1) : 1}
          done={staged ? [1, 2] : []}
          progress={{
            1: rows.length ? `${rows.length - remaining}/${rows.length} rows` : undefined,
            2: entries.length ? `${entries.length - unassigned.length}/${entries.length} codes` : undefined,
            3: staged ? 'next: add them in the builder' : 'in the builder',
          }}
        />
      </div>

      {error && <Alert variant="danger" style={{ fontSize: 12 }}>{error}</Alert>}

      {step === 'pick' && (
        <div className="text-center py-5">
          <p className="text-muted" style={{ fontSize: 13 }}>
            The Form template spreadsheet{' '}
            <InfoTip>Only ever read, never written.</InfoTip>
          </p>
          {remembered && (
            <div className="mb-2">
              <Button variant="primary" onClick={reopenRemembered} disabled={busy} data-testid="reopen-form">
                <MaterialIcon name="history" size={16} /> <span className="ms-1">Reopen {remembered.name}</span>
              </Button>
            </div>
          )}
          <Button variant={remembered ? 'outline-secondary' : 'primary'} onClick={handlePick} disabled={busy}>
            {busy ? <Spinner size="sm" animation="border" /> : <MaterialIcon name="folder_open" size={16} />}
            <span className="ms-1">{remembered ? 'Choose another spreadsheet…' : 'Choose spreadsheet…'}</span>
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


      {/* Embedded in the builder's Form spec pane: one position's rows, condensed. */}
      {step === 'review' && embedded && (
        <CompactPositionPainter
          posRef={embedded.posRef}
          rows={scopeRows}
          info={rowInfo}
          selection={selection}
          easyLeft={easyLeft}
          adding={addingSel}
          onSetRole={setTokenRole}
          onToggleConfirm={toggleConfirm}
          onNeedsET={openETFor}
          onMakeMain={(rowId, code) => patchRow(rowId, r => ({ ...r, leadCode: code }))}
          onConfirmObvious={confirmObvious}
          onAdd={addSelectionAndBuild}
          onUndo={() => { session.undo(); setUndoSnap(null) }}
          onRedo={() => { session.redo(); setUndoSnap(null) }}
          canUndo={session.canUndo} canRedo={session.canRedo}
        />
      )}

      {step === 'review' && !embedded && (
        <div className="d-flex gap-3" style={{ flex: 1, minHeight: 0 }}>
          {mode === 'position' && !embedded && (
            <div style={{ width: 200, flexShrink: 0, minHeight: 0 }}>
              <FormPositionList positions={formPositions} selected={selectedRefs} onSelect={setSelectedRefs} />
            </div>
          )}
          {/* What the tool has learned about this sheet's dialect (⋯ → Learned this project). */}
          {showLearned && !embedded && <div style={{ width: 190, overflowY: 'auto', flexShrink: 0 }} data-testid="learned-panel">
            <div className="fw-semibold text-muted mb-1" style={{ fontSize: 10, textTransform: 'uppercase' }}>
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
                Nothing yet{' '}
                <InfoTip size={11}>Paint a token and it applies to every row containing it.</InfoTip>
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
          </div>}

          {/* The Form, as a table. Simple edits in the cells; ▸ opens the full painter. */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="d-flex align-items-center gap-2 mb-2 flex-wrap" data-testid="table-toolbar">
              <Form.Control size="sm" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search rows…" aria-label="Search rows" style={{ maxWidth: 200, fontSize: 12 }} />
              {!embedded && <Button size="sm" variant="link" className="p-0" style={{ fontSize: 11 }} title="Change which columns are read"
                onClick={() => {
                  if (rows.some(r => r.confirmed && !r.autoConfirmed) && !window.confirm('Changing columns re-reads the rows and loses the painting and confirms. Continue?')) return
                  setStep('map')
                }}>← Columns</Button>}
              <ButtonGroup size="sm" aria-label="Show rows">
                {[['all', `All ${scopeRows.length}`], ['unconfirmed', `Unconfirmed ${scopeRows.filter(r => !r.confirmed).length}`], ['needsEt', `Needs ET ${scopeRows.filter(needsEt).length}`]].map(([k, label]) => (
                  <Button key={k} variant={filter === k ? 'primary' : 'outline-secondary'} style={{ fontSize: 11 }}
                    onClick={() => setFilter(k)}>{label}</Button>
                ))}
              </ButtonGroup>
              {formDiff && (
                <ButtonGroup size="sm" aria-label="Show changes">
                  {[['changed', 'Changed', '#b45309'], ['new', 'New', '#0d6efd'], ['removed', 'Removed', '#842029'], ['unchanged', 'Unchanged', '#6c757d']].map(([k, label]) => (
                    <Button key={k} variant={filter === k ? 'primary' : 'outline-secondary'} style={{ fontSize: 11 }}
                      onClick={() => setFilter(filter === k ? 'all' : k)}>{label} {formDiff.counts[k]}</Button>
                  ))}
                </ButtonGroup>
              )}
              {!embedded && <Button size="sm" variant="link" className="p-0" style={{ fontSize: 11 }} onClick={compareWithFile} disabled={busy}
                title="Pick an older version of this Form: each row shows what changed since then">
                <MaterialIcon name="difference" size={13} /> Compare with an older Form…
              </Button>}
              {easyLeft > 0 && (
                <Button size="sm" variant="success" style={{ fontSize: 11 }} onClick={confirmObvious}
                  title="Rows with one clean code (plus '+' extras and accessories), and placeholder rows with nothing to add. One undo takes them all back.">
                  <MaterialIcon name="done_all" size={13} /> Confirm {easyLeft} obvious {easyLeft === 1 ? 'row' : 'rows'} <kbd>B</kbd>
                </Button>
              )}
              {map.pt && resolutions.length > 0 && (
                <StatusChip tone={refProblems ? 'warn' : 'ok'} icon={refProblems ? 'link_off' : 'link'}
                  label={refProblems ? `${refProblems} ${refProblems === 1 ? 'ref needs' : 'refs need'} a PositionType` : `${resolutions.length} ref${resolutions.length === 1 ? '' : 's'} matched`}
                  tip="Each Form ref is matched to a DesignDB PositionType (directly, or through its ExtRef). Click to review."
                  role="button" aria-label="Form refs" onClick={() => setRefsOpen(true)} style={{ cursor: 'pointer' }} />
              )}
              <ContextColumnChips context={anyContext} available={capturable} shown={map.context}
                onChange={next => setMap(m => ({ ...m, context: next }))} />
              <span className="ms-auto d-inline-flex gap-1">
                <IconButton icon="undo" size={16} title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!session.canUndo}
                  onClick={() => { session.undo(); setUndoSnap(null) }} />
                <IconButton icon="redo" size={16} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!session.canRedo}
                  onClick={() => { session.redo(); setUndoSnap(null) }} />
              </span>
            </div>

            {/* What changed since the older Form. */}
            {formDiff && (
              <div className="mb-2 px-2 py-1 rounded d-flex align-items-center gap-2 flex-wrap" data-testid="form-diff-banner"
                style={{ background: '#fff8e1', border: '1px solid #ffe08a', fontSize: 11, color: '#5c4400' }}>
                <MaterialIcon name="difference" size={13} />
                <span>Compared with <strong>{compareBase.name}</strong>: {formDiff.counts.unchanged} unchanged · {formDiff.counts.changed} changed ·{' '}
                  {formDiff.counts.new} new · {formDiff.counts.removed} removed</span>
                <Button size="sm" variant="link" className="p-0 ms-auto" style={{ fontSize: 10 }}
                  onClick={() => { setCompareBase(null); if (['unchanged', 'changed', 'new', 'removed'].includes(filter)) setFilter('all') }}>Clear comparison</Button>
              </div>
            )}

            {/* Stage ① — what the Product Spec already knew. */}
            {knownStats && (
              <div className="mb-2 px-2 py-1 rounded d-flex align-items-center gap-2 flex-wrap"
                style={{ background: '#d1e7dd', border: '1px solid #a3cfbb', fontSize: 11, color: '#0f5132' }}>
                {knownStats.exactCount - (knownStats.libraryCount || 0) > 0 && (
                  <span>
                    <MaterialIcon name="check_circle" size={13} /> {knownStats.exactCount - (knownStats.libraryCount || 0)} in your Product Spec
                  </span>
                )}
                {knownStats.libraryCount > 0 && (
                  <span>
                    <MaterialIcon name="history" size={13} /> {knownStats.libraryCount} from earlier projects{' '}
                    <InfoTip size={11}>The same maker and code on a project opened before. Its ElementType comes with it.</InfoTip>
                  </span>
                )}
                {knownStats.preCount > 0 && (
                  <span>
                    <MaterialIcon name="auto_fix_high" size={13} /> {knownStats.preCount} pre-selected{' '}
                    <InfoTip size={11}>Words shaped like a maker's code. Click one to change it; your paint always wins.</InfoTip>
                  </span>
                )}
                {knownStats.variantCount > 0 && (
                  <span style={{ color: '#856404' }}>
                    <MaterialIcon name="warning" size={12} /> {knownStats.variantCount} variant{knownStats.variantCount === 1 ? '' : 's'}{' '}
                    <InfoTip size={11}>Known codes with something extra, marked amber. You decide.</InfoTip>
                  </span>
                )}
                {knownStats.adjacentCount > 0 && (
                  <span style={{ color: '#856404' }}>
                    <MaterialIcon name="warning" size={12} /> {knownStats.adjacentCount} side by side{' '}
                    <InfoTip size={11}>Known codes next to each other. Painting both would merge them, so neither was painted.</InfoTip>
                  </span>
                )}
                {preKnownRows && (
                  <Button size="sm" variant="link" className="p-0 ms-auto" style={{ fontSize: 10 }}
                    onClick={undoKnownPaint} title="Un-paint everything painted or pre-selected for you">
                    Undo all
                  </Button>
                )}
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <FormTable
                rows={tableRows}
                columns={tableColumns}
                info={rowInfo}
                onSetRole={setTokenRole}
                onToggleConfirm={toggleConfirm}
                onNeedsET={openETFor}
                onFixRef={() => setRefsOpen(true)}
                onMakeMain={(rowId, code) => patchRow(rowId, r => ({ ...r, leadCode: code }))}
                change={formDiff ? r => formDiff.byId.get(r.id) : null}
                removed={formDiff && (filter === 'all' || filter === 'removed') ? formDiff.removed : null}
                knownIn={knownIn}
                expandedId={expandedId}
                onExpand={id => { setExpandedId(id); if (id != null) setFocusId(id); setUndoSnap(null) }}
                focusId={focusId}
                onFocus={setFocusId}
                renderExpanded={() => current && (
                  <div className="p-2">
                {/* The Form's ProductCode cell as written, to copy while checking the spec. */}
                    <div className="d-flex align-items-start gap-2 mb-1 px-2" style={{ fontSize: 11 }}>
                      <span className="fw-semibold flex-shrink-0" style={{ minWidth: 84 }}>
                        {map.code || 'ProductCode'}{map.acc && <span className="text-muted fw-normal"> + {map.acc}</span>}
                      </span>
                      <span style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{current.rawText}</span>
                      <CopyButton text={current.rawText} what="the Form's product code cell" />
                    </div>

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
                      {current.confirmed ? 'Confirmed — next' : 'Confirm & next'}
                      {suggested.length > 0 && <> (takes {suggested.length} suggested)</>} <kbd>Enter</kbd>
                    </Button>
                  </div>
                )}
              />
            </div>
          </div>

          {/* Compare + stage */}
          <div style={{ width: embedded ? 260 : 350, overflowY: 'auto', flexShrink: 0 }} className="border-start ps-3">
            {/* Stage sits on top, sticky: when every code is done it is the next thing to do,
                not something to scroll past the whole code list to find. */}
            {selection && (
              <div className="mb-3 pb-2" data-testid="selection-checklist"
                style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bs-body-bg, #fff)', fontSize: 12 }}>
                <div className="fw-semibold mb-1">
                  {embedded ? embedded.posRef : selection.refs.length === 1 ? selection.refs[0] : `${selection.refs.length} positions`}
                  <span className="text-muted fw-normal"> · {selection.rows} row{selection.rows === 1 ? '' : 's'}</span>
                </div>
                {[
                  { done: selection.unconfirmedRows === 0, label: selection.unconfirmedRows ? `Confirm ${selection.unconfirmedRows} row${selection.unconfirmedRows === 1 ? '' : 's'}` : 'Rows confirmed',
                    action: selection.unconfirmedRows && easyLeft ? { label: `Confirm ${easyLeft} obvious`, onClick: confirmObvious } : null },
                  { done: selection.noEt === 0 && selection.clashes === 0,
                    label: selection.noEt || selection.clashes
                      ? [selection.noEt && `Give ${selection.noEt} code${selection.noEt === 1 ? '' : 's'} an ElementType`, selection.clashes && `settle ${selection.clashes} clash${selection.clashes === 1 ? '' : 'es'}`].filter(Boolean).join(', ')
                      : selection.codes ? 'ElementTypes chosen' : 'No codes to assign',
                    action: selection.canOpenEts ? { label: 'Open', onClick: openBulkCreate }
                      : selection.noEt && selection.unconfirmedRows ? { label: 'after confirming', onClick: null } : null },
                ].map((st, i) => (
                  <div key={i} className="d-flex align-items-center gap-2 mb-1" data-testid={`sel-step-${i + 1}`}>
                    <MaterialIcon name={st.done ? 'check_circle' : 'radio_button_unchecked'} size={15}
                      style={{ color: st.done ? '#198754' : '#adb5bd' }} />
                    <span className={st.done ? 'text-muted' : ''}>{i + 1}. {st.label}</span>
                    {st.action && (st.action.onClick
                      ? <Button size="sm" variant="link" className="p-0 ms-auto" style={{ fontSize: 11 }} onClick={st.action.onClick}>{st.action.label}</Button>
                      : <span className="ms-auto text-muted" style={{ fontSize: 10 }}>{st.action.label}</span>)}
                  </div>
                ))}
                {embedded && selection.refs.length === 0 ? (
                  <div className="text-muted fst-italic" data-testid="embedded-no-rows">The Form has no rows for {embedded.posRef}.</div>
                ) : (
                  <Button variant="success" size="sm" className="w-100 mt-1" disabled={!selection.ready || addingSel}
                    onClick={addSelectionAndBuild} data-testid="add-and-build">
                    <MaterialIcon name="playlist_add" size={14} />{' '}
                    {embedded ? '3. Add to Product Spec' : <>3. Add to Product Spec &amp; build recipe{selection.refs.length === 1 ? '' : 's'} →</>}
                  </Button>
                )}
                <div className="text-muted mt-1" style={{ fontSize: 10 }}>
                  {embedded
                    ? 'Writes this position’s Product Spec rows; the Form spec pane then shows what to add to or remove from its recipe.'
                    : 'Writes these positions’ Product Spec rows, then opens them in the builder to build their recipes. Other positions are left as they are.'}
                </div>
              </div>
            )}
            <div className="mb-3 pb-2" data-testid="stage-block"
              style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bs-body-bg, #fff)', display: selection ? 'none' : undefined }}>
              {leftBehind === 0 && entries.length > 0 ? (
                <div className="px-2 py-2 rounded mb-1" style={{ background: '#d1e7dd', border: '1px solid #a3cfbb', color: '#0f5132', fontSize: 11 }}>
                  <MaterialIcon name="check_circle" size={14} /> All {entries.length} code{entries.length === 1 ? ' has' : 's have'} an ElementType
                </div>
              ) : null}
              <Button variant="success" size="sm" className="w-100" disabled={!ready} onClick={() => handleStage()}>
                <MaterialIcon name="playlist_add" size={14} /> Add {stageable} to Product Spec
              </Button>
              {!ready && (unconfirmedCount > 0 || unassigned.length > 0) && (
                <div className="mt-1 px-2 py-1 rounded" data-testid="stage-todo"
                  style={{ fontSize: 11, background: '#fff3cd', border: '1px solid #ffe69c', color: '#664d03' }}>
                  First:{' '}
                  {unconfirmedCount > 0 && (
                    <Button variant="link" size="sm" className="p-0 align-baseline" style={{ fontSize: 11 }} data-testid="todo-unconfirmed"
                      onClick={() => { setQuery(''); setFilter('unconfirmed') }} title="Show only the rows still to confirm">
                      confirm {unconfirmedCount} row{unconfirmedCount === 1 ? '' : 's'}
                    </Button>
                  )}
                  {unconfirmedCount > 0 && unassigned.length > 0 && ', then '}
                  {unassigned.length > 0 && (
                    <Button variant="link" size="sm" className="p-0 align-baseline" style={{ fontSize: 11 }} data-testid="todo-needs-et"
                      onClick={openBulkCreate} title="Open the ElementTypes window at the codes still without one">
                      give {unassigned.length} code{unassigned.length === 1 ? '' : 's'} an ElementType
                    </Button>
                  )}
                  {collisions.length > 0 && (
                    <> · <Button variant="link" size="sm" className="p-0 align-baseline" style={{ fontSize: 11 }} onClick={openBulkCreate}>
                      settle {collisions.length} differing note{collisions.length === 1 ? '' : 's'}
                    </Button></>
                  )}
                </div>
              )}
              <div className="text-muted mt-1 d-flex align-items-center gap-1" style={{ fontSize: 10 }}>
                Recipes are not touched{' '}
                <InfoTip size={11}>
                  Writes a Product Spec row (code and maker) for each code with an ElementType, and remembers
                  what the Form asks for per position. You then add each product to its recipe in the builder,
                  where the Side-by-Side pane lists them.
                </InfoTip>
                {refProblems > 0 && (
                  <StatusChip size="xs" tone="warn" icon="link_off" role="button" aria-label="Refs needing a PositionType"
                    label={`${refProblems} ref${refProblems === 1 ? '' : 's'} unmatched`}
                    tip="Rows under these Form refs capture nothing until they are matched to a PositionType. Click to fix."
                    onClick={() => setRefsOpen(true)} style={{ cursor: 'pointer', marginLeft: 'auto' }} />
                )}
              </div>
            </div>

            {/* One place to decide ElementTypes: the window's New tab (clashes on top). */}
            {!selection && (unassigned.length > 0 || collisions.length > 0 || similar.length > 0) && (
              <Button size="sm" variant="primary" className="w-100 mb-2" onClick={openBulkCreate} data-testid="review-ets">
                <MaterialIcon name="category" size={14} />{' '}
                {unassigned.length > 0 && <>{unassigned.length} code{unassigned.length === 1 ? '' : 's'} need an ElementType</>}
                {unassigned.length > 0 && (collisions.length + similar.length) > 0 && ' · '}
                {(collisions.length + similar.length) > 0 && <>{collisions.length + similar.length} clash{collisions.length + similar.length === 1 ? '' : 'es'}</>}
                {' '}→ Review
              </Button>
            )}

            <div className="fw-semibold text-muted mb-2 d-flex align-items-center" style={{ fontSize: 10, textTransform: 'uppercase' }}>
              Distinct codes ({shownEntries.length}){selection ? ' · this selection' : ''}
              {elementTypes.length > 0 && (
                <Button size="sm" variant="link" className="p-0 ms-auto text-muted" style={{ fontSize: 10, textTransform: 'none' }}
                  onClick={() => setReviewingExisting(true)} title="Every ElementType in the project">
                  <MaterialIcon name="category" size={12} /> ElementTypes…
                </Button>
              )}
            </div>
            {shownEntries.length > 0 && <StatusLegend />}
            <CompareCodesPanel
              entries={shownEntries}
              knownPTs={knownPTs}
              ptTarget={map.pt ? ptTarget : null}
              onJump={jumpToCode}
              onNeedsET={e => openETFor(e.text)}
            />


            <div className="text-muted mt-3" style={{ fontSize: 10 }}>
              Notes → ElementType Description <InfoTip size={11}>A code's note becomes its ElementType's Description in the DesignDB, through the ElementTypes patch script at export.</InfoTip>
            </div>
          </div>
        </div>
      )}

      {/* Form refs that did not match cleanly — opened from their rows or the toolbar chip. */}
      <Modal show={refsOpen} onHide={() => setRefsOpen(false)} size="lg" scrollable>
        <Modal.Body>
          <ResolveRefsStep
            resolutions={resolutions}
            overrides={refOverrides}
            onOverride={(formRef, target) => setRefOverrides(o => ({ ...o, [formRef]: target }))}
            positionTypes={positionTypes}
            onConfirm={() => setRefsOpen(false)}
            confirmLabel="Done"
          />
        </Modal.Body>
      </Modal>

      {/* Staging result — a popup, so it is unmissable rather than below the fold. */}
      <Modal show={stagedOpen && !!staged} onHide={() => setStagedOpen(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 16 }}>
            <MaterialIcon name="check_circle" size={18} style={{ color: '#198754' }} /> Added to the Product Spec
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ fontSize: 13 }}>
          {staged && (
            <>
              <div>
                <strong>{staged.products}</strong> product{staged.products === 1 ? '' : 's'} across{' '}
                <strong>{staged.positions}</strong> PositionType{staged.positions === 1 ? '' : 's'}
                {staged.codes > 0 && <> · {staged.codes} new Product Spec row{staged.codes === 1 ? '' : 's'}</>}{' '}
                <InfoTip>No recipe was touched. In the builder, the Side-by-Side pane shows what the Form asks for, position by position, and adds each product in one click.</InfoTip>
              </div>
              {staged.unrouted > 0 && (
                <div className="mt-2" style={{ color: '#856404' }}>
                  <MaterialIcon name="link_off" size={13} /> {staged.unrouted} row{staged.unrouted === 1 ? '' : 's'} captured nothing{' '}
                  <InfoTip>Their Form ref matches no PositionType, or you skipped it.</InfoTip>
                </div>
              )}
              {staged.leftBehind > 0 && (
                <div className="mt-2" style={{ color: '#856404' }}>
                  <MaterialIcon name="help" size={13} /> {staged.leftBehind} code{staged.leftBehind === 1 ? '' : 's'} still without an ElementType{' '}
                  <InfoTip>Your draft is kept: come back and add them whenever you like.{staged.pending > 0 && <> The Side-by-Side pane lists them where the Form asks for them.</>}</InfoTip>
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
                    <InfoTip size={11}>Removed codes are flagged where they appear, never deleted for you.</InfoTip>
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
          <Button variant="link" size="sm" className="text-muted me-auto" onClick={() => setStagedOpen(false)}>Stay here</Button>
          {onReviewPositions && staged && staged.positions > 0 && (
            <Button size="sm" variant="primary"
              onClick={() => { setStagedOpen(false); onReviewPositions(Object.keys(staged.byPosition || {})) }}>
              <MaterialIcon name="playlist_add_check" size={14} /> Build recipes for {staged.positions === 1 ? 'this position' : `these ${staged.positions} positions`} →
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

      <ElementTypesWindow
        show={!!bulkProposals || reviewingExisting}
        view={bulkProposals ? 'new' : 'existing'}
        onHide={() => { setBulkProposals(null); setBulkOpen(false); setReviewingExisting(false) }}
        bulk={bulkProposals ? {
          proposals: bulkProposals.proposals,
          newFamilies: bulkProposals.newFamilies,
          families: knownFamilies,
          elementTypes,
          onApply: applyBulk,
          focusCode: etFocusCode,
          onShowRows: code => { setBulkProposals(null); setBulkOpen(false); setFilter('all'); setQuery(code) },
          header: (collisions.length > 0 || similar.length > 0) ? (
            <div className="mb-3 pb-2 border-bottom" data-testid="clashes">
              <NeedsResolving
                collisions={collisions}
                similar={similar}
                resolvedCount={entries.length - collisions.length}
                onPromote={handlePromote}
                onUnify={handleUnify}
                onMerge={handleMerge}
                onKeepSeparate={handleKeepSeparate}
                onJump={e => { setBulkProposals(null); setBulkOpen(false); jumpToCode(e) }}
              />
            </div>
          ) : null,
        } : null}
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
          name: creatingFor.name || '',
          family: creatingFor.family || '',
          manufacturer: creatingFor.manufacturer,
          productCode: creatingFor.text,
          description: creatingFor.description,
        } : {}}
        onCreated={etRef => {
          // Its family may be one the seed proposed and nobody has created yet.
          const et = useStore.getState().elementTypes.find(e => (e.ElementTypeRef || '').toLowerCase() === etRef.toLowerCase())
          const fam = et?.Family || ''
          const proposed = newFamilies.find(f => f.ref.toLowerCase() === fam.toLowerCase())
          if (proposed?.parent) {
            const up = newFamilies.find(f => f.ref.toLowerCase() === proposed.parent.toLowerCase())
            ensureFamily(proposed.parent, up?.description, up?.parent)
          }
          if (fam) ensureFamily(fam, proposed?.description || familyDescription(fam.replace(/^ET-/i, '')), proposed?.parent)
          // A merge puts every code in the group on the one new ElementType.
          for (const code of mergingGroup || [creatingFor.text]) assignET(code, etRef)
          setCreatingFor(null)
          setMergingGroup(null)
        }}
      />
    </div>
  )
}

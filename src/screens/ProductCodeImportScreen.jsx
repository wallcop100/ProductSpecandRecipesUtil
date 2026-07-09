import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Button, Form, Alert, Spinner } from 'react-bootstrap'
import useStore from '../store/useStore'
import { readSheet as readSheetFrom } from '../utils/backend'
import MaterialIcon from '../components/MaterialIcon'
import IconButton from '../components/IconButton'
import CodeChips from '../components/CodeChips'
import PaintPalette from '../components/PaintPalette'
import CompareCodesPanel from '../components/CompareCodesPanel'
import CaptureLines from '../components/CaptureLines'
import PrimingModal from '../components/PrimingModal'
import NewETModal from '../components/NewETModal'
import {
  makeRow, deriveCaptures, buildDistinct, buildMaster, classify, duplicateSet,
  hasNoteCollision, rowConfidence, sortByConfidence, norm, setNoteOverride,
} from '../utils/productCodes'
import {
  setRule, revokeRule, applyRules, learnedRules, learnedSignals, suggestCodes,
  acceptSuggestions, punctuationSuggestion, acceptPunctuationSuggestion, roleTally,
  discardsFromNoteEdit, pickExamples,
} from '../utils/codeLearning'
import { inferConvention, reuseCandidates, suggestRef } from '../utils/etRefSuggest'

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
  const dbWriteEnabled = useStore(s => s.dbWriteEnabled)
  const ensurePSRow = useStore(s => s.ensurePSRow)
  const updatePSRow = useStore(s => s.updatePSRow)
  const updateElementType = useStore(s => s.updateElementType)
  const prepopulateRecipe = useStore(s => s.prepopulateRecipe)

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
  const [showBoundaries, setShowBoundaries] = useState(false)
  const [undoSnap, setUndoSnap] = useState(null)   // one-level undo of the last paint
  const [brush, setBrush] = useState('code')       // the colour you're painting with
  const [scope, setScope] = useState('batch')      // 'batch' teaches every row; 'row' is local
  const [dirStats, setDirStats] = useState({ forward: 0, backward: 0 })   // learned from note drags
  const [priming, setPriming] = useState(false)

  const knownPTs = useMemo(
    () => new Set(positionTypes.map(p => p.PositionTypeRef || p.positionTypeRef).filter(Boolean)),
    [positionTypes]
  )
  const master = useMemo(() => buildMaster(psRows), [psRows])

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
    setMap({
      pt: detect(data.headers, 'positiontype'),
      code: detect(data.headers, 'productcode'),
      mfr: detect(data.headers, 'manufacturer'),
      exclude: detect(data.headers, 'exclude'),
      context: CONTEXT_WANTS.map(w => detect(data.headers, w)).filter(Boolean),
    })
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
    loadWorkbook(path)
  }

  const skipped = useMemo(
    () => (map.exclude ? rawRows.filter(r => isExcluded(r[map.exclude])).length : 0),
    [rawRows, map.exclude]
  )

  function startReview() {
    const built = rawRows
      .filter(r => !(map.exclude && isExcluded(r[map.exclude])))
      .filter(r => r[map.code] != null && String(r[map.code]).trim() !== '')
      .map((r, i) => makeRow(i, String(r[map.code]), {
        positionType: String(r[map.pt] ?? '').trim(),
        manufacturer: String(r[map.mfr] ?? '').trim(),
        context: Object.fromEntries(map.context.map(c => [c, r[c]]).filter(([, v]) => v != null && String(v).trim() !== '')),
      }))
    setRows(sortByConfidence(applyRules(built, {}), { master, duplicates: new Set() }))
    setRules({}); setIdx(0); setAssignments({}); setStaged(null); setUndoSnap(null)
    setStep('review')
    // Teach the dialect from a few covering examples before the queue starts.
    if (built.length >= 3) setPriming(true)
  }

  // ---- review ---------------------------------------------------------------
  const current = resolved[idx]
  // Learned continuously from the resolved roles — every code you paint, and every
  // single-token field, sharpens the next suggestion.
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
      setRules(rl => idxs.reduce((acc, i) => setRule(acc, row.tokens[i].text, role), rl))
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
   */
  const editNote = useCallback((rowId, code, text) => {
    const row = resolved.find(r => r.id === rowId)
    if (row && text != null) {
      const cap = deriveCaptures(row, captureOpts).captures.find(c => c.code === code)
      const derived = cap && !cap.noteEdited ? cap.note : null
      if (derived) {
        const drop = discardsFromNoteEdit(derived, text, signals)
        if (drop.length) setRules(rl => drop.reduce((acc, w) => setRule(acc, w, 'discard'), rl))
      }
    }
    patchRow(rowId, r => setNoteOverride(r, code, text))
  }, [resolved, patchRow, captureOpts, signals])

  const moveNoteIn = useCallback((rowId, fromCode, toCode) => {
    const row = resolved.find(r => r.id === rowId)
    if (!row) return
    const caps = deriveCaptures(row, captureOpts).captures
    const fi = caps.findIndex(c => c.code === fromCode)
    const ti = caps.findIndex(c => c.code === toCode)
    if (fi < 0 || ti < 0) return
    setDirStats(s => ti < fi ? { ...s, backward: s.backward + 1 } : { ...s, forward: s.forward + 1 })
    const merged = [caps[ti].note, caps[fi].note].filter(Boolean).join(' ').trim()
    patchRow(rowId, r => setNoteOverride(setNoteOverride(r, toCode, merged), fromCode, ''))
  }, [resolved, patchRow, captureOpts])

  /** Move a whole note from one captured code onto another (drag between lines). */
  const handleMoveNote = (fromCode, toCode) => current && moveNoteIn(current.id, fromCode, toCode)

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

  const entries = useMemo(() => buildDistinct(confirmed, captureOpts).map(e => {
    const c = classify(e.text, ctx)
    const etRef = c.elementTypeRef || assignments[norm(e.text)] || null
    const note = e.variants[0]?.note || ''
    // Only unresolved codes need a suggestion / reuse candidates.
    const help = etRef ? {} : {
      reuse: reuseCandidates(e.text, note, { psRows, elementTypes }, 3),
      suggestedRef: suggestRef(e.text, note, e.manufacturers[0] || '', convention, elementTypes, psRows).ref,
    }
    return { ...e, ...c, etRef, ...help }
  }), [confirmed, ctx, assignments, captureOpts, psRows, elementTypes, convention])

  const collisions = entries.filter(hasNoteCollision)
  const unassigned = entries.filter(e => !e.etRef && !hasNoteCollision(e))
  const canStage = entries.length > 0 && collisions.length === 0 && unassigned.length === 0

  // Shared point source: a position's PRIMARY captured code is its point source;
  // positions sharing that ET may share a DL. A prompt, not an automatic merge.
  const sharedPointSources = useMemo(() => {
    const byEt = new Map()   // etRef -> Set(positionType)
    for (const row of confirmed) {
      const primary = deriveCaptures(row, captureOpts).captures[0]
      if (!primary) continue
      const et = classify(primary.code, ctx).elementTypeRef || assignments[norm(primary.code)]
      if (!et || !row.positionType) continue
      if (!byEt.has(et)) byEt.set(et, new Set())
      byEt.get(et).add(row.positionType)
    }
    return [...byEt.entries()]
      .filter(([, pts]) => pts.size > 1)
      .map(([et, pts]) => ({ et, positionTypes: [...pts] }))
  }, [confirmed, captureOpts, ctx, assignments])

  /** Fold a variant's note into its code, on the rows behind it, so it earns its own ref. */
  function handlePromote(entry, variant) {
    for (const rowId of variant.rowRefs) {
      const r = resolved.find(x => x.id === rowId)
      if (!r) continue
      const cap = deriveCaptures(r).captures.find(c => c.code === entry.text && c.note === variant.note)
      if (!cap) continue
      patchRow(rowId, row => {
        const overrides = { ...row.overrides }
        for (const i of cap.noteTokens) overrides[i] = 'code'
        return { ...row, overrides }
      })
    }
  }

  /** Assign an existing ElementType to a distinct code — the reuse/dedup win. */
  function handleReuse(entry, ref) {
    setAssignments(a => ({ ...a, [norm(entry.text)]: ref }))
  }

  function handleStage() {
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

    // 2. Prepopulate each PositionType's recipe from its assigned captures (flat,
    //    form-badged). Positions with an existing recipe get the additions too, and
    //    are reported so the user can review them.
    const byPos = new Map()   // positionType -> [{ elementTypeRef, code, note }]
    for (const row of confirmed) {
      if (!row.positionType) continue
      for (const cap of deriveCaptures(row, captureOpts).captures) {
        const et = codeToEt.get(norm(cap.code))
        if (!et) continue
        if (!byPos.has(row.positionType)) byPos.set(row.positionType, [])
        const list = byPos.get(row.positionType)
        if (!list.some(x => x.elementTypeRef === et)) list.push({ elementTypeRef: et, code: cap.code, note: cap.note })
      }
    }
    let rowsAdded = 0
    const reviewPositions = []
    for (const [pos, ets] of byPos) {
      const res = prepopulateRecipe(pos, ets)
      rowsAdded += res.added
      if (res.existed && res.added > 0) reviewPositions.push(pos)
    }

    setStaged({ codes: n, rows: rowsAdded, review: reviewPositions })
  }

  const remaining = resolved.filter(r => !r.confirmed).length
  const easyLeft = resolved.filter(r => !r.confirmed && rowConfidence(r, ctx) === 'high').length
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
        {filepath && <span className="text-muted ms-2" style={{ fontSize: 11 }}>{filepath}</span>}
      </div>

      {error && <Alert variant="danger" style={{ fontSize: 12 }}>{error}</Alert>}

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
        <div style={{ maxWidth: 560 }}>
          {sheets.length > 1 && (
            <Form.Group className="mb-3">
              <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Sheet</Form.Label>
              <Form.Select size="sm" value={sheet} onChange={e => pickSheet(e.target.value)} disabled={busy}>
                {sheets.map(s => <option key={s} value={s}>{s}</option>)}
              </Form.Select>
            </Form.Group>
          )}

          {[
            ['code', 'ProductCode column', true],
            ['pt', 'PositionType column (the key)', false],
            ['mfr', 'Manufacturer column', false],
            ['exclude', 'Exclude rows where this column is set', false],
          ].map(([key, label, req]) => (
            <Form.Group className="mb-2" key={key}>
              <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>
                {label} {req && <span className="text-danger">*</span>}
              </Form.Label>
              <Form.Select size="sm" value={map[key]} onChange={e => setMap(m => ({ ...m, [key]: e.target.value }))}>
                <option value="">— none —</option>
                {headers.filter(Boolean).map(h => <option key={h} value={h}>{h}</option>)}
              </Form.Select>
            </Form.Group>
          ))}

          <Form.Label className="mt-2" style={{ fontSize: 12, fontWeight: 600 }}>
            Context columns <span className="text-muted fw-normal">— shown beside the field to help you decide</span>
          </Form.Label>
          <div className="border rounded p-2 mb-3" style={{ maxHeight: 130, overflowY: 'auto' }}>
            {headers.filter(Boolean).map(h => (
              <Form.Check key={h} type="checkbox" id={`ctx-${h}`} label={h} style={{ fontSize: 11 }}
                checked={map.context.includes(h)}
                onChange={e => setMap(m => ({
                  ...m,
                  context: e.target.checked ? [...m.context, h] : m.context.filter(x => x !== h),
                }))} />
            ))}
          </div>

          <div className="text-muted mb-3" style={{ fontSize: 11 }}>
            {rawRows.length} rows in “{sheet}”{skipped > 0 && <> · {skipped} skipped as excluded</>}
          </div>
          <Button variant="primary" size="sm" disabled={!map.code || busy} onClick={startReview}>
            Start review →
          </Button>
        </div>
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
                      showBoundaries={showBoundaries}
                    />
                  </div>
                  <div className="px-3 pb-2 pt-1" style={{ background: '#fcfcfd', borderTop: '1px solid #e9ecef' }}>
                    <CaptureLines
                      captures={readout.captures}
                      discarded={readout.discarded}
                      onEditNote={(code, text) => editNote(current.id, code, text)}
                      onMoveNote={handleMoveNote}
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
            <div className="fw-semibold text-muted mb-2" style={{ fontSize: 10, textTransform: 'uppercase' }}>
              Distinct codes ({entries.length})
            </div>
            <CompareCodesPanel
              entries={entries}
              knownPTs={knownPTs}
              onJump={jumpToCode}
              onPromote={handlePromote}
              onReuse={handleReuse}
              onCreateET={e => setCreatingFor({
                text: e.text,
                ref: e.suggestedRef || '',
                manufacturer: e.manufacturers[0] || '',
                description: e.variants[0]?.note || '',
              })}
            />

            {/* Shared point source — positions whose primary code is the same ET. */}
            {sharedPointSources.length > 0 && (
              <div className="mt-2 px-2 py-1 rounded" style={{ background: '#fff8e1', border: '1px solid #f0e0a8', fontSize: 10 }}>
                <div className="fw-semibold" style={{ color: '#92400e' }}>
                  <MaterialIcon name="hub" size={11} /> Shared point source — may share a DL
                </div>
                {sharedPointSources.map(g => (
                  <div key={g.et} className="text-muted">
                    <span style={{ fontFamily: 'monospace' }}>{g.et}</span> · {g.positionTypes.join(', ')}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3">
              <Button variant="success" size="sm" className="w-100" disabled={!canStage} onClick={handleStage}>
                Stage codes + prefill recipes
              </Button>
              {collisions.length > 0 && (
                <div className="text-warning mt-1" style={{ fontSize: 10 }}>
                  {collisions.length} code{collisions.length === 1 ? '' : 's'} captured with differing notes — resolve above.
                </div>
              )}
              {collisions.length === 0 && unassigned.length > 0 && (
                <div className="text-muted mt-1" style={{ fontSize: 10 }}>
                  {unassigned.length} code{unassigned.length === 1 ? '' : 's'} still need an ElementType.
                </div>
              )}
              {!dbWriteEnabled && (
                <div className="text-muted mt-1" style={{ fontSize: 10 }}>
                  <MaterialIcon name="info" size={10} /> Notes are written to the ElementType Description, which
                  lives in the DesignDB table. With DB writes off they stay project-local.
                </div>
              )}
              {staged && (
                <Alert variant="success" className="mt-2 py-1 px-2" style={{ fontSize: 11 }}>
                  <div>
                    Staged {staged.codes} code{staged.codes === 1 ? '' : 's'} and pre-filled {staged.rows} recipe
                    row{staged.rows === 1 ? '' : 's'} (badged <strong>Form</strong>).
                  </div>
                  {staged.review.length > 0 && (
                    <div className="mt-1">
                      {staged.review.length} position{staged.review.length === 1 ? '' : 's'} already had a recipe
                      — the additions need a look ({staged.review.join(', ')}).
                      {onReviewPositions && (
                        <Button size="sm" variant="outline-success" className="ms-2"
                          style={{ fontSize: 10, padding: '0 6px' }}
                          onClick={() => onReviewPositions(staged.review)}>
                          Review now →
                        </Button>
                      )}
                    </div>
                  )}
                  <div className="mt-1">Open <strong>Export changes</strong> to copy the patch.</div>
                </Alert>
              )}
            </div>
          </div>
        </div>
      )}

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
        onSkip={() => setPriming(false)}
        onDone={finishPriming}
      />

      <NewETModal
        show={!!creatingFor}
        onHide={() => setCreatingFor(null)}
        contextLabel={creatingFor ? `for ${creatingFor.text}` : null}
        prefill={creatingFor ? {
          ref: creatingFor.ref,
          manufacturer: creatingFor.manufacturer,
          productCode: creatingFor.text,
          description: creatingFor.description,
        } : {}}
        onCreated={etRef => {
          setAssignments(a => ({ ...a, [norm(creatingFor.text)]: etRef }))
          setCreatingFor(null)
        }}
      />
    </div>
  )
}

import React, { useMemo, useState } from 'react'
import { Button, Form } from 'react-bootstrap'
import useStore from '../../store/useStore'
import MaterialIcon from '../MaterialIcon'
import CellTokens from './CellTokens'
import ETRefSelect from '../ETRefSelect'
import { BRUSH } from '../CodeChips'
import { familyOptionsOf } from '../NewETModal'
import { refamily, cleanRef, proposalTrace, whyText } from '../../utils/etSeed'
import { registerTrace, traceIds } from '../../utils/trace'
import { CopyText } from '../CopyButton'
import { rowCells } from '../../utils/formPositions'
import { EtPill, Gutter, GRAPHITE, btn, card } from '../FormPaneParts'
import { C } from '../../styles/tokens'
import { codeKey } from '../../utils/derived'
import { changedWord, wordAt } from '../../utils/formNotes'
import { NoteEditor, NotNeededButton, CodeDiff } from '../FormNoteParts'

const mono = { fontFamily: 'monospace' }

/**
 * CompactPositionPainter — one position's Form entries, in the builder's Form spec pane
 * (D4Z9CX, design A).
 *
 *   - each Form entry has two faces, toggled in its header: Form data (its cells, few / many /
 *     custom columns) and Paint (the brushes and the painted text). It opens in Paint by itself
 *     when something there still needs painting, else in Form data;
 *   - a code with no ElementType gets a card: reuse what the recipe already has, or create one
 *     from the autofilled Ref, Family and Description. Codes with an ElementType are the pane's
 *     lines, not repeated here;
 *   - no Save: once every code has an ElementType the import screen saves the position itself.
 * The import screen owns the state; this only draws it.
 */
export default function CompactPositionPainter({ posRef, rows, info, onSetRole, onToggleConfirm, onNeedsET, onMakeMain, proposalFor, onMoveNoteWord, onEditNote,
  onAssign, hideCodes = [], newCodes = [], reuseFor, since }) {
  const elementTypes = useStore(s => s.elementTypes)
  const map = useStore(s => s.importDraft?.map)
  const dbCollectionRefs = useStore(s => s.dbCollectionRefs)
  const formNotes = useStore(s => s.formNotes)
  const familyOptions = useMemo(() => familyOptionsOf(elementTypes || [], dbCollectionRefs || []), [elementTypes, dbCollectionRefs])
  const [brush, setBrush] = useState('code')
  const [pinned, setPinned] = usePinned()
  const [peek, setPeek] = useState(false)
  const [edits, setEdits] = useState({})   // code -> { ref, family } typed on its card
  const [faces, setFaces] = useState({})   // row id -> 'data' | 'paint', once chosen
  const cols = useColPref()
  if (!rows.length) {
    return <div className="text-muted fst-italic" style={{ fontSize: 11 }} data-testid="embedded-no-rows">The Form gives no product code for {posRef}.</div>
  }
  const infos = rows.map(r => ({ row: r, inf: info(r) }))
  // Every entry says "n/a", "by others"…: nothing to add, nothing to ask (859SCF).
  if (infos.every(({ inf }) => inf.codes.length === 0 && inf.status?.icon === 'block')) {
    return (
      <div className="text-muted" style={{ fontSize: 11 }} data-testid="compact-nothing">
        <MaterialIcon name="block" size={12} /> Nothing to add: the Form has no product for {posRef}.
      </div>
    )
  }
  const hide = new Set(hideCodes.map(codeKey))
  const fresh = new Set(newCodes.map(codeKey))
  const keys = (
    <BrushKeys brush={brush} setBrush={setBrush} open={pinned || peek} pinned={pinned}
      onPeek={() => setPeek(true)} onPin={() => { setPinned(!pinned); setPeek(false) }} />
  )

  return (
    <div style={{ fontSize: 11 }} data-testid="compact-painter">
      {infos.map(({ row, inf }) => {
        // Still to paint: a code with no ElementType, or an entry nobody has confirmed.
        const needs = inf.codes.some(c => !c.etRef) || (!row.confirmed && inf.status?.icon !== 'block')
        const face = faces[row.id] || (needs ? 'paint' : 'data')
        const setFace = f => setFaces(m => ({ ...m, [row.id]: f }))
        const cards = inf.codes.filter(c => !c.etRef && !c.settled && !hide.has(codeKey(c.code)))
        return (
          <div key={row.id} className="py-1 border-bottom" data-testid="compact-row" data-face={face}>
            <div className="d-flex align-items-center gap-1" style={{ fontSize: 10, color: C.muted, minHeight: 20 }}>
              {row.manufacturer && <span className="text-truncate">{row.manufacturer}</span>}
              {face === 'paint' && keys}
              <span className="ms-auto d-inline-flex align-items-center gap-1">
                {/* No code in this entry at all: the tick is the only thing to do with it. */}
                {inf.codes.length === 0 && (
                  <Form.Check type="checkbox" checked={!!row.confirmed} onChange={() => onToggleConfirm(row.id)}
                    aria-label={`Confirm row ${row.id + 1}`} title={row.confirmed ? 'Confirmed' : 'Confirm: no product here'} />
                )}
                <Seg value={face} onChange={setFace} testid="face" options={[['data', 'table_rows', 'Form data'], ['paint', 'brush', 'Paint']]} />
              </span>
            </div>
            <Face open={face === 'data'} testid="face-data">
              <FormData row={row} map={map} posRef={posRef} notes={formNotes} cols={cols} />
            </Face>
            <Face open={face === 'paint'} testid="face-paint">
              <CellTokens row={row} suggested={inf.suggested} brush={pinned || peek ? brush : null} onSetRole={(i, role) => onSetRole(row.id, i, role)} />
              {inf.codes.length === 0 && inf.suggested?.length > 0 && !row.confirmed && (
                <div className="text-muted" style={{ fontSize: 10 }}>{inf.status?.label || ''}</div>
              )}
            </Face>
            {cards.length > 0 && (
              <div className="d-flex flex-column mt-1">
                {cards.map(c => (
                  <CodeCard key={c.code} c={c} posRef={posRef} row={row} many={inf.codes.length > 1} familyOptions={familyOptions} elementTypes={elementTypes}
                    edit={edits[c.code]} proposal={proposalFor?.(c.code)} isNew={fresh.has(codeKey(c.code))} since={since}
                    reuse={reuseFor?.(c.code, row)} onAssign={ref => onAssign?.(c.code, ref)}
                    otherRefs={inf.codes.filter(o => o.code !== c.code).map(o => o.etRef || shownRef(edits[o.code], proposalFor?.(o.code))).filter(Boolean)}
                    onEdit={v => setEdits(e => ({ ...e, [c.code]: { ...e[c.code], ...v } }))}
                    onCreate={seed => onNeedsET(c.code, seed)}
                    onEditNote={text => onEditNote?.(row.id, c.code, text)}
                    onMakeMain={() => onMakeMain(row.id, c.code)}
                    onDropWord={(from, word) => from !== c.code && onMoveNoteWord?.(row.id, from, c.code, word)} />
                ))}
              </div>
            )}
            {face === 'paint' && inf.codes.length > 0 && <LooseWords text={inf.loose} onDropWord={(from, word) => from && onMoveNoteWord?.(row.id, from, '', word)} />}
          </div>
        )
      })}
    </div>
  )
}

/** A face that morphs its height and fades as it opens or closes. */
function Face({ open, testid, children }) {
  return (
    <div data-testid={testid} aria-hidden={!open || undefined} inert={open ? undefined : ''}
      style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0, pointerEvents: open ? undefined : 'none',
        transition: 'grid-template-rows .28s ease, opacity .22s ease' }}>
      <div style={{ overflow: 'hidden', minHeight: 0 }}>{children}</div>
    </div>
  )
}

/** A row of icon buttons, one lit. options: [value, icon, title]. */
function Seg({ value, onChange, options, testid, children }) {
  return (
    <span className="d-inline-flex rounded overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      {options.map(([v, icon, title], i) => (
        <button key={v} type="button" title={title} aria-label={title} aria-pressed={value === v} data-testid={`${testid}-${v}`}
          onClick={() => onChange(v)} className="border-0 d-inline-flex align-items-center px-1"
          style={{ background: value === v ? C.accentTint : C.surface, color: value === v ? C.accent : C.muted, borderLeft: i ? `1px solid ${C.border}` : 'none', lineHeight: '18px' }}>
          <MaterialIcon name={icon} size={14} />
        </button>
      ))}
      {children}
    </span>
  )
}

/**
 * Which Form columns the data face shows: few or many (FEW / MANY), or custom
 * (ticked on the ▾, which opens on hover or focus). Remembered per browser, so across projects.
 */
function useColPref() {
  const KEY = 'psr.formPane.cols'
  const [pref, set] = useState(() => { try { return JSON.parse(localStorage.getItem(KEY)) || { preset: 'few', custom: null } } catch { return { preset: 'few', custom: null } } })
  return [pref, next => { set(next); try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private window */ } }]
}

// Erik's lists (2026-11-18), in this order. The maker and code cells answer to these names whatever the Form calls them.
const FEW = ['ManufacturerName', 'ProductCode', 'ProductName', 'Finish']
const MANY = ['ManufacturerName', 'ProductCode', 'ProductName', 'PositionTypeDescription', 'FurtherInfo', 'Finish', 'ColourTemp', 'IPRating', 'FirstFixElement', 'MountingMethod']
const colKey = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
const pick = (cells, names) => names.map(n => cells.find(c => colKey(c.as || c.col) === colKey(n) || colKey(c.col) === colKey(n))).filter(Boolean)
  .filter((c, i, a) => a.indexOf(c) === i)

function FormData({ row, map, posRef, notes = [], cols: [pref, setPref] }) {
  const cells = rowCells(row, map)
  const [pop, setPop] = useState(false)
  const [hover, setHover] = useState(null)
  const [editing, setEditing] = useState(null)   // a column
  // As the Form gave it, before a wrong code was corrected (NAL5HU).
  const rawCells = row._fixes ? rowCells({ ...row, rawText: row._rawText, accFrom: row._rawAccFrom }, map) : cells
  const rawOf = col => rawCells.find(c => c.col === col)?.value ?? cells.find(c => c.col === col)?.value ?? ''
  const cellNote = col => notes.find(n => n.kind === 'cell' && n.posRef === posRef && n.column === col && n.formText === rawOf(col))
  const fixesIn = col => (row._fixes ? notes.filter(n => n.kind === 'wrongCode' && n.posRef === posRef && codeKey(n.formRef) === codeKey(row.positionType)
    && wordAt(rawOf(col), n.code) >= 0) : [])
  const { saveFormNote, removeFormNote } = useStore.getState()
  const saveCell = async (col, isCode, { note, shouldBe }) => {
    const raw = rawOf(col)
    if (isCode) {
      for (const f of fixesIn(col)) await removeFormNote(f.key)
      if (shouldBe && shouldBe !== raw) {
        const [code, to] = changedWord(raw, shouldBe)
        await saveFormNote({ posRef, formRef: row.positionType, kind: 'wrongCode', column: col, code, shouldBe: to, manufacturer: row.manufacturer || '', formText: String(row._rawText ?? row.rawText ?? ''), note })
        if (cellNote(col)) await removeFormNote(cellNote(col).key)
        return setEditing(null)
      }
    }
    if (note) await saveFormNote({ posRef, formRef: row.positionType, kind: 'cell', column: col, formText: raw, note })
    else if (cellNote(col)) await removeFormNote(cellNote(col).key)
    setEditing(null)
  }
  const clearCell = async col => {
    for (const f of fixesIn(col)) await removeFormNote(f.key)
    if (cellNote(col)) await removeFormNote(cellNote(col).key)
    setEditing(null)
  }
  const few = pick(cells, FEW).map(c => c.col)
  const custom = pref.custom || few
  const shown = pref.preset === 'many' ? pick(cells, MANY) : pref.preset === 'custom' ? cells.filter(c => custom.includes(c.col)) : pick(cells, FEW)
  const tick = col => setPref({ preset: 'custom', custom: custom.includes(col) ? custom.filter(x => x !== col) : [...custom, col] })
  return (
    <div className="pt-1" data-testid="form-raw">
      <div className="d-flex mb-1" style={{ position: 'relative' }}>
        <Seg value={pref.preset} onChange={v => setPref({ ...pref, preset: v })} testid="cols"
          options={[['few', 'short_text', 'Few lines'], ['many', 'notes', 'Many lines'], ['custom', 'tune', 'Custom']]}>
          <button type="button" className="border-0 d-inline-flex align-items-center px-0" aria-label="Choose columns" aria-expanded={pop} data-testid="cols-pick"
            style={{ background: pref.preset === 'custom' ? C.accentTint : C.surface, color: C.muted, lineHeight: '18px' }}
            onMouseEnter={() => setPop(true)} onFocus={() => setPop(true)} onClick={() => setPop(true)} onKeyDown={e => { if (e.key === 'Escape') setPop(false) }}>
            <MaterialIcon name="expand_more" size={12} />
          </button>
        </Seg>
        {pop && (
          <div className="shadow-sm rounded p-1" data-testid="cols-list" onMouseLeave={() => setPop(false)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setPop(false) }}
            style={{ position: 'absolute', top: 22, left: 0, zIndex: 5, background: C.surface, border: `1px solid ${C.border}`, maxHeight: 220, overflowY: 'auto', fontSize: 10, minWidth: 140 }}>
            {cells.map(c => (
              <Form.Check key={c.col} type="checkbox" id={`col-${c.col}`} checked={pref.preset === 'custom' ? custom.includes(c.col) : shown.includes(c)}
                onChange={() => tick(c.col)} label={c.col} />
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, max-content) 1fr', columnGap: 8, rowGap: 1 }}>
        {shown.map(({ col, value, code }) => {
          const fixes = code ? fixesIn(col) : []
          const note = cellNote(col)
          const noted = !!(note || fixes.length)
          const raw = rawOf(col)
          const tip = [note?.note, ...fixes.map(f => f.note)].filter(Boolean).join(' · ')
          return (
            <React.Fragment key={col}>
              <span className="text-muted text-truncate" style={{ fontSize: 10, maxWidth: 120 }} title={col}>{col}</span>
              <span className="d-flex align-items-start gap-1 rounded" data-testid="form-cell" data-col={col} data-noted={noted || undefined}
                onMouseEnter={() => setHover(col)} onMouseLeave={() => setHover(h => (h === col ? null : h))}
                style={{ minWidth: 0, padding: '0 2px', margin: '0 -2px', background: hover === col ? C.hoverTint : undefined }}>
                <span style={{ ...mono, color: C.ink, whiteSpace: 'pre-wrap', wordBreak: 'break-word', minWidth: 0,
                  ...(noted && { textDecoration: `underline dotted ${C.accent}`, textUnderlineOffset: 3 }) }} title={tip || undefined}>
                  {fixes.length && raw !== value ? <CodeDiff from={raw} to={value} /> : code ? <CopyText text={value} /> : value}
                </span>
                <button type="button" className="border-0 bg-transparent p-0 ms-auto d-inline-flex" data-testid="cell-note"
                  aria-label={`Note on ${col}`} title={tip || undefined} onClick={() => setEditing(e => (e === col ? null : col))}
                  style={{ color: noted ? C.accent : hover === col ? C.muted : C.faint, visibility: noted || hover === col || editing === col ? 'visible' : 'hidden', flexShrink: 0 }}>
                  <MaterialIcon name="rate_review" size={14} />
                </button>
              </span>
            </React.Fragment>
          )
        })}
      </div>
      {editing && (() => {
        const cell = cells.find(c => c.col === editing)
        const isCode = !!cell?.code
        const prior = cellNote(editing)?.note || fixesIn(editing).map(f => f.note).filter(Boolean).join(' ') || ''
        return (
          <NoteEditor key={editing} head={`${editing} · “${rawOf(editing)}”`} initial={prior}
            shouldBe={isCode ? (cell?.value ?? '') : undefined} notePlaceholder={isCode ? 'Note (optional)' : undefined}
            saveLabel={() => (isCode ? 'Save' : 'Save note')}
            onSave={v => saveCell(editing, isCode, v)} onCancel={() => setEditing(null)}
            onClear={cellNote(editing) || fixesIn(editing).length ? () => clearCell(editing) : undefined} />
        )
      })()}
    </div>
  )
}

/** The three brushes: tucked away as swatches until peeked or pinned. */
function BrushKeys({ brush, setBrush, open, pinned, onPeek, onPin }) {
  return (
    <span className="d-inline-flex align-items-center gap-1" data-testid="paint-key">
      {!open ? (
        <button type="button" className="d-inline-flex gap-1 align-items-center border-0 bg-transparent px-1" data-testid="brush-peek"
          onClick={onPeek} title="Click a word to cycle code → note → discard. Click here for the brushes.">
          {['code', 'note', 'discard'].map(r => <span key={r} style={{ width: 9, height: 9, borderRadius: 2, background: BRUSH[r].swatch,
            border: r === 'note' ? `1px solid ${C.faint}` : 'none' }} />)}
        </button>
      ) : (
        <span className="d-inline-flex rounded overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          {['code', 'note', 'discard'].map((r, i) => {
            const b = BRUSH[r]
            const active = brush === r
            return (
              <button key={r} type="button" onClick={() => setBrush(r)} aria-pressed={active} data-testid={`brush-${r}`}
                title={`Paint ${b.label.toLowerCase()}: click words to make them ${b.label.toLowerCase()}`}
                className="d-inline-flex align-items-center gap-1 px-1 border-0"
                style={{ background: active ? b.swatch : C.surface, color: active ? C.surface : C.ink, fontWeight: active ? 600 : 400,
                  fontSize: 10, lineHeight: '16px', borderRight: i < 2 ? `1px solid ${C.border}` : 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: active ? C.surface : b.swatch,
                  border: r === 'note' ? `1px solid ${C.faint}` : 'none' }} />
                {b.label}
              </button>
            )
          })}
        </span>
      )}
      <button type="button" className="border-0 bg-transparent p-0 d-inline-flex" data-testid="brush-pin" aria-pressed={pinned}
        title={pinned ? 'Brushes stay open. Click to tuck them away.' : 'Keep the brushes open'}
        style={{ color: pinned ? C.accent : C.faint }} onClick={onPin}>
        <MaterialIcon name="push_pin" size={12} />
      </button>
    </span>
  )
}

const shownRef = (edit, proposal) => edit?.ref ?? edit?.famRef ?? proposal?.ref ?? ''

/** Main product or extra, for an entry with several codes: click an extra to make it main. */
function MainStar({ c, onMakeMain }) {
  return (
    <span role={c.main ? undefined : 'button'} title={c.main ? 'Main product' : 'Extra: click to make it the main product'}
      style={{ color: c.main ? C.accent : C.faint, cursor: c.main ? 'default' : 'pointer' }}
      onClick={c.main ? undefined : onMakeMain}>
      <MaterialIcon name={c.main ? 'star' : 'star_border'} size={11} />
    </span>
  )
}

/** The brushes stay open until you tuck them away; remembered per browser. */
function usePinned() {
  const [pinned, set] = useState(() => { try { return localStorage.getItem('psr.formPane.brushPinned') !== '0' } catch { return true } })
  return [pinned, v => { set(v); try { localStorage.setItem('psr.formPane.brushPinned', v ? '1' : '0') } catch { /* private window */ } }]
}

/**
 * A product code with no ElementType, as a card (graphite stripe): reuse what the recipe already
 * has, or create one from the autofilled Ref, Family and the note as Description (its words drag
 * between cards). `reuse`: { ref, why } or null.
 */
function CodeCard({ c, posRef, row, many, familyOptions, elementTypes, edit, proposal, otherRefs = [], isNew, since, reuse, onAssign, onEdit, onCreate, onMakeMain, onDropWord, onEditNote }) {
  const [typing, setTyping] = useState(null)   // the note being typed, or null
  const [picking, setPicking] = useState(false)
  const [notNeeded, setNotNeeded] = useState(false)
  const [over, drop] = useWordDrop(onDropWord)
  // A family you pick renumbers the ref (famRef) unless you typed the ref yourself (AEST77).
  const ref = shownRef(edit, proposal)
  const family = edit?.family ?? proposal?.family ?? ''
  const pickFam = f => ({ family: f, famRef: f ? refamily([{ code: c.code, manufacturer: proposal?.manufacturer, name: proposal?.name, description: proposal?.description }, ...otherRefs.map(ref => ({ ref }))], [0], f, elementTypes || [], useStore.getState().psRows)[0].ref : '',
    ...(edit?.ref === '' && { ref: undefined }) })   // a cleared ref is not a typed one
  const fams = family && !familyOptions.includes(family) ? [family, ...familyOptions] : familyOptions
  const learned = proposal?.family && family === proposal.family && whyText(proposal)
  const ctl = { ...mono, fontSize: 11, height: 24, padding: '1px 5px' }
  const lbl = { fontSize: 10, color: C.muted }
  return (
    <div data-testid="code-card" data-code={c.code} {...drop}
      data-trace={traceIds(registerTrace(c.trace), registerTrace(proposalTrace(proposal)))}
      style={{ ...card(over ? C.accent : GRAPHITE), background: over ? C.accentTint : C.surface }}>
      <div className="d-flex align-items-center gap-1">
        <Gutter mark={isNew ? '+' : ''} tip={isNew && since ? `New since ${since}` : undefined} />
        {many && <MainStar c={c} onMakeMain={onMakeMain} />}
        <span className="text-truncate" style={{ ...mono, fontWeight: 600 }}><CopyText text={c.code} /></span>
      </div>
      {reuse && (
        <>
          <div className="d-flex align-items-center gap-1 mt-1" data-testid="reuse-row">
            <EtPill etRef={reuse.ref} />
            <span className="text-muted text-truncate" style={{ fontSize: 10 }}>{reuse.why}</span>
            <Button size="sm" variant="primary" className="ms-auto" style={btn} data-testid="reuse-use" onClick={() => onAssign(reuse.ref)}>Use</Button>
          </div>
          <div className="d-flex align-items-center gap-1 my-1 text-muted" style={{ fontSize: 10 }}>
            <span className="flex-grow-1 border-top" /> or create <span className="flex-grow-1 border-top" />
          </div>
        </>
      )}
      <div className="row g-1 mt-1">
        <div className="col-7">
          <div style={lbl}>Ref</div>
          <Form.Control size="sm" style={ctl} value={ref} onChange={e => onEdit({ ref: e.target.value })} aria-label={`Ref for ${c.code}`}
            onBlur={() => { if (edit?.ref != null && cleanRef(edit.ref) !== edit.ref) onEdit({ ref: cleanRef(edit.ref) }) }} />
        </div>
        <div className="col-5">
          <div style={lbl}>Family</div>
          {/* Type a family the project lacks, or pick one (T6FDCM); the New ElementType dialog creates it. */}
          <Form.Control size="sm" style={ctl} value={family} list={`fams-${c.code}`} aria-label={`Family for ${c.code}`} placeholder="(none)"
            onChange={e => { const f = e.target.value
              onEdit(familyOptions.includes(f) || !f ? pickFam(f) : { family: f }) }}
            onBlur={() => { if (edit?.family && !familyOptions.includes(edit.family)) onEdit(pickFam(cleanRef(edit.family).toUpperCase())) }} />
          <datalist id={`fams-${c.code}`}>{fams.map(f => <option key={f} value={f} />)}</datalist>
        </div>
      </div>
      {learned && (
        <div className="d-flex align-items-center gap-1 text-muted" style={{ fontSize: 10, marginTop: 2 }} data-testid="family-from">
          <span className="companion-dot" />Family: {learned}
        </div>
      )}
      <div className="mt-1" style={lbl}>Description</div>
      {typing != null ? (
        <Form.Control size="sm" autoFocus className="fst-italic" style={{ fontSize: 11, height: 24, padding: '1px 4px' }} value={typing}
          aria-label={`Note for ${c.code}`} data-testid="code-note-input"
          onChange={e => setTyping(e.target.value)}
          onBlur={e => { if (!e.currentTarget.dataset.cancel && typing.trim() !== (c.note || '')) onEditNote(typing.trim()); setTyping(null) }}
          onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.dataset.cancel = '1'; if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }} />
      ) : (
      <div className="fst-italic rounded px-1" style={{ border: `1px solid ${C.border}`, minHeight: 22, lineHeight: '20px', cursor: 'text' }}
        data-testid="code-note" title="Click to type the note; drag a word to move it" onClick={() => setTyping(c.note || '')}>
        <NoteWords text={c.note} from={c.code} empty="no description: click to type one" />
      </div>
      )}
      <div className="d-flex align-items-center gap-1 mt-1">
        {picking ? (
          <div className="flex-grow-1" data-testid="existing-pick">
            <ETRefSelect onCommit={r => { setPicking(false); if (r) onAssign(r) }} onCancel={() => setPicking(false)} />
          </div>
        ) : (
          <>
            <Button size="sm" variant={reuse ? 'outline-primary' : 'primary'} style={btn} data-testid="give-et"
              aria-label={`Give ${c.code} an ElementType`} onClick={() => onCreate({ ref: cleanRef(ref), family: cleanRef(family).toUpperCase() })}>
              Create {cleanRef(ref) || 'ElementType'}
            </Button>
            <Button size="sm" variant="outline-secondary" style={btn} data-testid="pick-existing" onClick={() => setPicking(true)}>Existing</Button>
            {row && <NotNeededButton on={notNeeded} onClick={() => setNotNeeded(v => !v)} />}
          </>
        )}
      </div>
      {notNeeded && row && (
        <NoteEditor head={`${c.code} · “${c.note || ''}”`} shouldBe="" shouldBePlaceholder="leave blank if it isn't needed at all"
          saveLabel={fixing => (fixing ? 'Save' : 'Not needed · save note')} onCancel={() => setNotNeeded(false)}
          onSave={({ note, shouldBe }) => {
            const base = { posRef, formRef: row.positionType, code: c.code, manufacturer: row.manufacturer || '', desc: c.note || '', formText: String(row._rawText ?? row.rawText ?? ''), note }
            useStore.getState().saveFormNote(shouldBe ? { ...base, kind: 'wrongCode', column: 'ProductCode', shouldBe } : { ...base, kind: 'notNeeded' })
            setNotNeeded(false)
          }} />
      )}
    </div>
  )
}

const WORD = 'application/x-psr-word'

/** Drop target for a dragged note word: [isOver, handlers]. */
function useWordDrop(onDropWord) {
  const [over, setOver] = useState(false)
  return [over, {
    onDragOver: e => { if (e.dataTransfer.types.includes(WORD)) { e.preventDefault(); setOver(true) } },
    onDragLeave: () => setOver(false),
    onDrop: e => { setOver(false); const d = e.dataTransfer.getData(WORD); if (!d) return
      e.preventDefault(); const { from, word } = JSON.parse(d); onDropWord(from, word) },
  }]
}

/** A note as one sentence; each word drags on its own. `from` is its code ('' = no code). */
function NoteWords({ text, from, empty }) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  if (!words.length) return <span style={{ color: C.faint }}>{empty}</span>
  return words.map((w, i) => (
    <React.Fragment key={i}>{i > 0 && ' '}
      <span draggable title="Drag onto a code to move this word" style={{ cursor: 'grab' }}
        onDragStart={e => e.dataTransfer.setData(WORD, JSON.stringify({ from, word: w }))}>{w}</span>
    </React.Fragment>
  ))
}

/** Words the Form gives on no code. They stay on the Form unless dragged onto a code. */
function LooseWords({ text, onDropWord }) {
  const [over, drop] = useWordDrop(onDropWord)
  if (!text) return null
  return (
    <div className="rounded px-2 py-1" data-testid="loose-note" {...drop}
      style={{ border: `1px dashed ${over ? C.accent : C.faint}`, background: over ? C.accentTint : C.subtle }}>
      <div style={{ fontSize: 10, color: C.muted }}>Not on any code: kept on the Form only. Drag a word onto a code.</div>
      <div className="fst-italic"><NoteWords text={text} from="" /></div>
    </div>
  )
}

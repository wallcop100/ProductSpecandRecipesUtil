import React, { useMemo, useState } from 'react'
import { Button, Form } from 'react-bootstrap'
import useStore from '../../store/useStore'
import MaterialIcon from '../MaterialIcon'
import CellTokens from './CellTokens'
import { BRUSH } from '../CodeChips'
import { familyOptionsOf } from '../NewETModal'
import { refamily, cleanRef } from '../../utils/etSeed'
import { CopyText } from '../CopyButton'
import { positionRecipeWithWrapperInternals } from '../../utils/collectionStatus'
import { C } from '../../styles/tokens'

const mono = { fontFamily: 'monospace' }
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

/**
 * CompactPositionPainter — one position's Form, in the builder's Form spec pane (D4Z9CX),
 * reduced to ONE call to action: give each new product code an ElementType.
 *
 *   - known codes are always listed, one line each: code → ElementType · in the recipe or not;
 *   - each new code has the one primary button, "Give <code> an ElementType" (it confirms
 *     the code's Form entry and opens the ElementTypes window at it);
 *   - no Save: once every code has an ElementType the import screen saves the position
 *     itself (embedded auto-save), and the pane moves on to the recipe check.
 * Clicking a word still switches it code / note / discard, for a code read wrongly. A tick
 * box is only offered where an entry holds no code at all — there it is the one action.
 * The import screen owns the state; this only draws it.
 */
export default function CompactPositionPainter({ posRef, rows, info, onSetRole, onToggleConfirm, onNeedsET, onMakeMain, proposalFor, onMoveNoteWord, onEditNote }) {
  const recipes = useStore(s => s.recipes)
  const elementTypes = useStore(s => s.elementTypes)
  const familyOptions = useMemo(() => familyOptionsOf(elementTypes || []), [elementTypes])
  const [brush, setBrush] = useState('code')
  const [pinned, setPinned] = usePinned()
  const [peek, setPeek] = useState(false)
  const [edits, setEdits] = useState({})   // code -> { ref, family } typed on its card
  if (!rows.length) {
    return <div className="text-muted fst-italic" style={{ fontSize: 11 }} data-testid="embedded-no-rows">The Form gives no product code for {posRef}.</div>
  }
  const have = new Set(positionRecipeWithWrapperInternals(recipes, posRef).combined
    .filter(r => (r.IsDeleted || r.isDeleted) !== 'Y').map(r => String(r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()))
  const inRecipe = ref => have.has(String(ref).toLowerCase())

  const infos = rows.map(r => ({ row: r, inf: info(r) }))
  // Every entry says "n/a", "by others"…: nothing to add, nothing to ask (859SCF).
  if (infos.every(({ inf }) => inf.codes.length === 0 && inf.status?.icon === 'block')) {
    return (
      <div className="text-muted" style={{ fontSize: 11 }} data-testid="compact-nothing">
        <MaterialIcon name="block" size={12} /> Nothing to add: the Form has no product for {posRef}.
      </div>
    )
  }
  const needEt = infos.flatMap(({ inf }) => inf.codes.filter(c => !c.etRef)).length

  // Every Form entry, with its words to paint (5FGNH2: also the ones already settled, so
  // opening the painter always shows something to paint), then each code it reads:
  // settled ones as code → ElementType · in the recipe or not, new ones with the button.
  return (
    <div style={{ fontSize: 11 }} data-testid="compact-painter">
      {needEt > 0 && (
        <div className="fw-semibold mb-1" style={{ color: C.attnInk }} data-testid="compact-summary">
          <MaterialIcon name="warning" size={13} /> {plural(needEt, 'code')} need{needEt === 1 ? 's' : ''} an ElementType
        </div>
      )}

      {/* The main painter's three brushes, small: pick one, then click words (5 FormPane). */}
      <div className="d-flex align-items-center gap-1 mb-1" data-testid="paint-key">
        {!pinned && !peek ? (
          <button type="button" className="d-inline-flex gap-1 align-items-center border-0 bg-transparent px-1" data-testid="brush-peek"
            onClick={() => setPeek(true)} title="Click a word to cycle code → note → discard. Click here for the brushes.">
            {['code', 'note', 'discard'].map(r => <span key={r} style={{ width: 9, height: 9, borderRadius: 2, background: BRUSH[r].swatch,
              border: r === 'note' ? `1px solid ${C.faint}` : 'none' }} />)}
          </button>
        ) : (
        <div className="d-flex rounded overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          {['code', 'note', 'discard'].map((r, i) => {
            const b = BRUSH[r]
            const active = brush === r
            return (
              <button key={r} type="button" onClick={() => setBrush(r)} aria-pressed={active} data-testid={`brush-${r}`}
                title={`Paint ${b.label.toLowerCase()}: click words to make them ${b.label.toLowerCase()}`}
                className="d-inline-flex align-items-center gap-1 px-2 border-0"
                style={{ background: active ? b.swatch : C.surface, color: active ? C.surface : C.ink, fontWeight: active ? 600 : 400,
                  fontSize: 10, lineHeight: '18px', borderRight: i < 2 ? `1px solid ${C.border}` : 'none' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: active ? C.surface : b.swatch,
                  border: r === 'note' ? `1px solid ${C.faint}` : 'none' }} />
                {b.label}
              </button>
            )
          })}
        </div>
        )}
        <button type="button" className="border-0 bg-transparent p-0 d-inline-flex" data-testid="brush-pin" aria-pressed={pinned}
          title={pinned ? 'Brushes stay open. Click to tuck them away.' : 'Keep the brushes open'}
          style={{ color: pinned ? C.accent : C.muted }} onClick={() => { setPinned(!pinned); setPeek(false) }}>
          <MaterialIcon name="push_pin" size={13} />
        </button>
      </div>

      {infos.map(({ row, inf }) => (
        <div key={row.id} className="py-1 border-bottom" data-testid="compact-row">
          <div className="d-flex align-items-start gap-1">
            <div style={{ flex: 1, minWidth: 0 }}>
              {row.manufacturer && <div className="text-muted" style={{ fontSize: 10 }}>{row.manufacturer}</div>}
              <CellTokens row={row} suggested={inf.suggested} brush={pinned || peek ? brush : null} onSetRole={(i, role) => onSetRole(row.id, i, role)} />
            </div>
            {/* No code in this entry at all: the tick is the only thing to do with it. */}
            {inf.codes.length === 0 && (
              <Form.Check type="checkbox" checked={!!row.confirmed} onChange={() => onToggleConfirm(row.id)}
                aria-label={`Confirm row ${row.id + 1}`} title={row.confirmed ? 'Confirmed' : 'Confirm: no product here'} />
            )}
          </div>
          {inf.codes.length === 0 && (
            <div className="text-muted" style={{ fontSize: 10 }}>
              {inf.suggested?.length && !row.confirmed ? 'Underlined words look like codes: click one to use it' : (inf.status?.label || 'no code')}
            </div>
          )}
          {inf.codes.length > 0 && (
            <div className="d-flex flex-column gap-1 mt-1" data-testid={inf.codes.some(c => c.etRef) ? 'compact-known' : undefined}>
              {inf.codes.map(c => (
                <CodeCard key={c.code} c={c} many={inf.codes.length > 1} inRecipe={inRecipe} familyOptions={familyOptions} elementTypes={elementTypes}
                  edit={edits[c.code]} proposal={proposalFor?.(c.code)}
                  otherRefs={inf.codes.filter(o => o.code !== c.code).map(o => o.etRef || shownRef(edits[o.code], proposalFor?.(o.code))).filter(Boolean)}
                  onEdit={v => setEdits(e => ({ ...e, [c.code]: { ...e[c.code], ...v } }))}
                  onCreate={seed => onNeedsET(c.code, seed)}
                  onEditNote={text => onEditNote?.(row.id, c.code, text)}
                  onMakeMain={() => onMakeMain(row.id, c.code)}
                  onDropWord={(from, word) => from !== c.code && onMoveNoteWord?.(row.id, from, c.code, word)} />
              ))}
              <LooseWords text={inf.loose} onDropWord={(from, word) => from && onMoveNoteWord?.(row.id, from, '', word)} />
            </div>
          )}
        </div>
      ))}
    </div>
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
 * One product code as a card: code (and main star), its ElementType or the proposed ref and
 * family to create it with, and its note as one sentence whose words drag between cards.
 */
function CodeCard({ c, many, inRecipe, familyOptions, elementTypes, edit, proposal, otherRefs = [], onEdit, onCreate, onMakeMain, onDropWord, onEditNote }) {
  const [typing, setTyping] = useState(null)   // the note being typed, or null
  const [over, drop] = useWordDrop(onDropWord)
  // A family you pick renumbers the ref (famRef) unless you typed the ref yourself (AEST77).
  const ref = shownRef(edit, proposal)
  const family = edit?.family ?? proposal?.family ?? ''
  const fams = family && !familyOptions.includes(family) ? [family, ...familyOptions] : familyOptions
  const ctl = { ...mono, fontSize: 11, height: 24, padding: '1px 5px' }
  return (
    <div className="rounded p-2" data-testid="code-card" {...drop}
      style={{ borderStyle: 'solid', borderWidth: '1px 1px 1px 3px', borderColor: over ? C.accent : `${C.border} ${C.border} ${C.border} ${C.accent}`, background: over ? C.accentTint : C.surface }}>
      <div className="d-flex align-items-center gap-1">
        {many && <MainStar c={c} onMakeMain={onMakeMain} />}
        <span className="text-truncate" style={{ ...mono, fontWeight: 600 }}><CopyText text={c.code} /></span>
        {c.etRef ? (
          <MaterialIcon name="check_circle" size={16} className="ms-auto" style={{ color: C.success }} title="Has an ElementType" />
        ) : (
          <Button size="sm" variant="primary" className="ms-auto rounded-circle p-0 d-inline-flex align-items-center justify-content-center flex-shrink-0"
            style={{ width: 22, height: 22 }} data-testid="give-et" aria-label={`Give ${c.code} an ElementType`} title={`Give ${c.code} an ElementType`}
            onClick={() => onCreate({ ref: cleanRef(ref), family: cleanRef(family) })}>
            <MaterialIcon name="add" size={16} />
          </Button>
        )}
      </div>
      {c.etRef ? (
        <div style={{ fontSize: 10 }} data-testid="known-code">
          <span style={mono}>{c.code}</span> → <span style={mono}>{c.etRef}</span>
          <span className="text-muted"> · {inRecipe(c.etRef) ? 'in the recipe' : 'not in the recipe yet'}</span>
        </div>
      ) : (
        <div className="row g-1 mt-1">
          <div className="col-7">
            <div style={{ fontSize: 10, color: C.muted }}>Ref</div>
            <Form.Control size="sm" style={ctl} value={ref} onChange={e => onEdit({ ref: e.target.value })} aria-label={`Ref for ${c.code}`}
              onBlur={() => { if (edit?.ref != null && cleanRef(edit.ref) !== edit.ref) onEdit({ ref: cleanRef(edit.ref) }) }} />
          </div>
          <div className="col-5">
            <div style={{ fontSize: 10, color: C.muted }}>Family</div>
            <Form.Select size="sm" style={{ ...ctl, paddingRight: 18, backgroundPosition: 'right 4px center' }} value={family}
              onChange={e => { const f = e.target.value
                onEdit({ family: f, famRef: f ? refamily([{ code: c.code, manufacturer: proposal?.manufacturer, name: proposal?.name, description: proposal?.description }, ...otherRefs.map(ref => ({ ref }))], [0], f, elementTypes || [], useStore.getState().psRows)[0].ref : '',
                  ...(edit?.ref === '' && { ref: undefined }) }) /* a cleared ref is not a typed one */ }} aria-label={`Family for ${c.code}`}>
              <option value="">(none)</option>
              {fams.map(f => <option key={f} value={f}>{f}</option>)}
            </Form.Select>
          </div>
        </div>
      )}
      <div className="mt-1" style={{ fontSize: 10, color: C.muted }}>Description</div>
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

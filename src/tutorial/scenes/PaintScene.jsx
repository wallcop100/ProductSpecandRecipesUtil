import React from 'react'
import StageBar from '../../components/StageBar'
import EntityPill from '../../components/EntityPill'
import { Stage, Cursor, Pulse, Appear, MiniRow, Caption } from './atoms'
import { DEMO_PAINT } from '../demo-data'

/**
 * PaintScene — the import: freehand spreadsheet text becomes distinct product codes.
 *
 * beats: 0 the ①②③ this whole workflow hangs on
 *        1 the Form ref routes via ExtRef (L01 in the Form → the recipe position)
 *        2 painting: keys 1/2/3 mark tokens code / note / discard
 *        3 the painted code, distinct, gets an ElementType
 *        4 Stage — and what staging does NOT do
 */
export default function PaintScene({ beat }) {
  const ROLE_STYLE = {
    code: { background: '#cfe2ff', color: '#084298' },
    note: { background: '#d1e7dd', color: '#0f5132' },
    discard: { background: '#f8d7da', color: '#842029', textDecoration: 'line-through' },
    null: { background: '#fff', color: '#6c757d' },
  }
  const painted = beat >= 2
  const cursorAt = { 2: { x: 150, y: 96 }, 3: { x: 280, y: 138 }, 4: { x: 300, y: 176 } }[beat]

  return (
    <>
      <Stage height={230}>
        <div className="mb-2"><StageBar current={beat >= 3 ? 2 : 1} done={beat >= 3 ? [1] : []} /></div>

        {beat === 1 && (
          <Appear when>
            <div className="rounded px-2 py-1 mb-2" style={{ background: '#e7f1ff', border: '1px solid #b6d4fe', fontSize: 10 }}>
              The Form says <strong>L01</strong> — the DB's <strong>ExtRef</strong> column says which
              PositionType claims that name. Never guessed from spelling.
            </div>
          </Appear>
        )}

        {/* the freehand cell, tokenised */}
        <div className="text-muted mb-1" style={{ fontSize: 9, textTransform: 'uppercase' }}>ProductCode cell, row L01</div>
        <Pulse on={beat === 2}>
          <div className="d-flex flex-wrap gap-1 rounded px-2 py-2 mb-2" style={{ background: '#fff', border: '1px solid #e9ecef' }}>
            {DEMO_PAINT.tokens.map(t => (
              <span key={t.text} className="rounded px-1" style={{
                fontSize: 10, fontFamily: 'monospace',
                transition: 'background .35s ease, color .35s ease',
                ...(painted ? ROLE_STYLE[t.role] : ROLE_STYLE.null),
              }}>{t.text}</span>
            ))}
          </div>
        </Pulse>
        {beat === 2 && (
          <div className="d-flex gap-2 mb-1" style={{ fontSize: 9 }}>
            <span><kbd>1</kbd> code</span><span><kbd>2</kbd> note</span><span><kbd>3</kbd> discard</span>
            <span className="text-muted">— painting one token teaches every row containing it</span>
          </div>
        )}

        {/* the distinct code and its ET */}
        <Appear when={beat >= 3}>
          <MiniRow active={beat === 3}>
            <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 10 }}>TP-940-24V</span>
            <span className="text-muted" style={{ fontSize: 9 }}>Brightline · 940lm tape</span>
            <span className="ms-auto d-inline-flex align-items-center gap-1">
              <EntityPill type="ElementType" label="ET-TAPE-01" />
            </span>
          </MiniRow>
        </Appear>
        <Appear when={beat >= 4}>
          <div className="rounded px-2 py-1" style={{ background: '#d1e7dd', border: '1px solid #a3cfbb', fontSize: 10, color: '#0f5132' }}>
            Staged: the Form template + the Product Spec rows. <strong>No recipe row is written</strong> —
            stage ③ happens in the builder, one position at a time, where you can see it.
          </div>
        </Appear>

        <Cursor at={cursorAt} click={beat >= 2 && beat <= 4} />
      </Stage>
      <Caption>
        {[
          'The whole workflow: ① identify codes ② assign ElementTypes ③ build recipes.',
          'First the Form’s position names are routed to real PositionTypes — by ExtRef.',
          'The cell is freehand text. Paint each token: product code, note, or noise.',
          'Each distinct code then gets an ElementType — reuse one, or create it.',
          'Stage writes the Form template and Product Spec. Recipes stay yours to build.',
        ][beat]}
      </Caption>
    </>
  )
}

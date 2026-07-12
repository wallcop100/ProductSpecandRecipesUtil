import React from 'react'
import StageBar from '../../components/StageBar'
import EntityPill from '../../components/EntityPill'
import { Stage, Click, Pulse, Appear, MiniRow, Caption } from './atoms'
import { DEMO_PAINT, DEMO_FORM } from '../demo-data'

/**
 * PaintScene — the import: freehand spreadsheet text becomes distinct product codes.
 *
 * The ExtRef beat uses the real relationship: the Form says C01, and C01r is the
 * PositionType whose ExtRef claims that name — which is where the recipe actually lives.
 * Nothing infers that from the spelling.
 *
 * beats: 0 the ①②③ the whole workflow hangs on
 *        1 the Form ref routes via ExtRef (C01 → C01r)
 *        2 painting: keys 1/2/3 mark tokens code / note / discard
 *        3 the distinct code gets an ElementType
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

  return (
    <>
      <Stage height={240}>
        <div className="mb-2">
          <StageBar current={beat >= 3 ? 2 : 1} done={beat >= 3 ? [1] : []} />
        </div>

        {beat === 1 && (
          <Appear when>
            <div className="rounded px-2 py-2 mb-2" style={{ background: '#e7f1ff', border: '1px solid #b6d4fe', fontSize: 10 }}>
              The Form says <strong>{DEMO_FORM.formRef}</strong>. The DesignDB row whose{' '}
              <strong>ExtRef</strong> claims that name is <strong>{DEMO_FORM.target}</strong> — and that is
              where the recipe lives. Never inferred from the spelling.
            </div>
          </Appear>
        )}

        <div className="text-muted mb-1" style={{ fontSize: 8, textTransform: 'uppercase' }}>
          ProductCode cell — row {DEMO_FORM.formRef}
        </div>
        <Click on={beat === 2}>
          <Pulse on={beat === 2}>
            <div className="d-flex flex-wrap gap-1 rounded px-2 py-2 mb-2"
              style={{ background: '#fff', border: '1px solid #e9ecef' }}>
              {DEMO_PAINT.tokens.map(t => (
                <span key={t.text} className="rounded px-1" style={{
                  fontSize: 10, fontFamily: 'monospace',
                  transition: 'background .35s ease, color .35s ease',
                  ...(painted ? ROLE_STYLE[t.role] : ROLE_STYLE.null),
                }}>{t.text}</span>
              ))}
            </div>
          </Pulse>
        </Click>

        {beat === 2 && (
          <div className="d-flex gap-2 mb-1" style={{ fontSize: 9 }}>
            <span><kbd>1</kbd> code</span><span><kbd>2</kbd> note</span><span><kbd>3</kbd> discard</span>
            <span className="text-muted">— painting one token teaches every row containing it</span>
          </div>
        )}

        <Appear when={beat >= 3}>
          <MiniRow active={beat === 3}>
            <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 9 }}>LL240272024</span>
            <span className="text-muted" style={{ fontSize: 8 }}>Nichia · 2700K 24V</span>
            <span className="ms-auto">
              <Click on={beat === 3}>
                <EntityPill type="ElementType" label="ET-LIN-TAPE-01" />
              </Click>
            </span>
          </MiniRow>
        </Appear>

        <Appear when={beat >= 4}>
          <div className="rounded px-2 py-1" style={{ background: '#d1e7dd', border: '1px solid #a3cfbb', fontSize: 9, color: '#0f5132' }}>
            Staged: the Form template + the Product Spec rows. <strong>No recipe row is written</strong> —
            stage ③ happens in the builder, one position at a time, where you can see it.
          </div>
        </Appear>
      </Stage>
      <Caption>
        {[
          'The whole workflow: ① identify codes ② assign ElementTypes ③ build recipes.',
          `The Form’s ${DEMO_FORM.formRef} is routed to ${DEMO_FORM.target} by ExtRef — never by spelling.`,
          'The cell is freehand text. Paint each token: product code, note, or noise.',
          'Each distinct code then gets an ElementType — reuse one, or create it.',
          'Stage writes the Form template and the Product Spec. Recipes stay yours to build.',
        ][beat]}
      </Caption>
    </>
  )
}

import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import EntityPill from '../../components/EntityPill'
import { Stage, Click, Pulse, Appear, MiniRow, Caption } from './atoms'
import { DEMO_FORM } from '../demo-data'

/**
 * FormPaneScene — the Side-by-Side.
 *
 * It OPENS ON THE EMPTY STATE, because that is what you actually see: with no Form imported,
 * the pane is a dashed box saying "No Form template yet" and offering the one thing to do.
 * The old version of this card jumped straight to a populated pane the user had no way to
 * reach, and taught a screen that does not exist until you import.
 *
 * beats: 0 no Form yet — import it (the real first step)
 *        1 imported: what the Form asks for, beside what the recipe has
 *        2 tick a missing product
 *        3 choose where it lands (the Form carries no slot)
 *        4 a pending product with no ElementType — "That's it" links it to one you have
 */
export default function FormPaneScene({ beat }) {
  const imported = beat >= 1
  const added = beat >= 3
  const [tape, profile] = DEMO_FORM.asks

  if (!imported) {
    return (
      <>
        <Stage height={230}>
          <div className="text-muted fw-semibold text-uppercase mb-2" style={{ fontSize: 8, letterSpacing: '.05em' }}>
            Form spec
          </div>
          <div className="px-3 py-4 rounded text-center" style={{ background: '#fff', border: '1px dashed #ced4da' }}>
            <MaterialIcon name="auto_fix_high" size={26} style={{ color: '#adb5bd' }} />
            <div className="fw-semibold mt-2" style={{ fontSize: 11 }}>No Form template yet</div>
            <div className="text-muted mt-1 mb-2" style={{ fontSize: 10, lineHeight: 1.5 }}>
              Import the Form and this panel shows, for every position, exactly which products it
              asks for and which are already in the recipe.
            </div>
            <Click on>
              <Pulse on>
                <span className="rounded px-2 py-1" style={{ background: '#0d6efd', color: '#fff', fontSize: 10 }}>
                  Import the Form template →
                </span>
              </Pulse>
            </Click>
            <div className="text-muted mt-3" style={{ fontSize: 9, lineHeight: 1.6 }}>
              <div><strong>①</strong> Identify codes &nbsp;<strong>②</strong> Assign ElementTypes</div>
              <div><strong>③</strong> Add them here, where they belong</div>
            </div>
          </div>
        </Stage>
        <Caption>Until a Form is imported, this pane has nothing to compare — and says so.</Caption>
      </>
    )
  }

  return (
    <>
      <Stage height={230}>
        <div className="d-flex align-items-center gap-1 mb-1">
          <span className="text-muted fw-semibold text-uppercase" style={{ fontSize: 8, letterSpacing: '.05em' }}>
            Form spec
          </span>
          <span className="text-muted" style={{ fontSize: 8 }}>· {DEMO_FORM.source}</span>
          <span className="ms-auto text-muted" style={{ fontSize: 8 }}>
            {added ? '2/2' : '1/2'} present
          </span>
        </div>

        <div className="d-flex gap-2" style={{ height: '100%' }}>
          {/* what the recipe has */}
          <div style={{ flex: 1 }}>
            <div className="text-muted mb-1" style={{ fontSize: 8, textTransform: 'uppercase' }}>{DEMO_FORM.target} recipe has</div>
            <MiniRow>
              <MaterialIcon name="check_circle" size={11} style={{ color: '#198754' }} />
              <EntityPill type="ElementType" label={tape.ref} />
            </MiniRow>
            <Appear when={added}>
              <MiniRow active style={{ borderColor: '#198754' }}>
                <EntityPill type="ElementType" label={profile.ref} />
                <span className="badge ms-auto" style={{ background: '#198754', fontSize: 7 }}>inside ET-LIN-01</span>
              </MiniRow>
            </Appear>
            <Appear when={beat >= 4}>
              <MiniRow>
                <EntityPill type="ElementType" label={DEMO_FORM.pending.matches} />
                <span className="text-muted" style={{ fontSize: 8 }}>already here</span>
              </MiniRow>
            </Appear>
          </div>

          {/* what the Form asks for */}
          <div style={{ width: 186, borderLeft: '1px solid #dee2e6', paddingLeft: 8 }}>
            <div className="text-muted mb-1" style={{ fontSize: 8, textTransform: 'uppercase' }}>the Form asks for</div>
            <MiniRow>
              <MaterialIcon name="check_circle" size={11} style={{ color: '#198754' }} />
              <span style={{ fontFamily: 'monospace', fontSize: 8 }}>{tape.code}</span>
            </MiniRow>
            <MiniRow active={beat === 2 || beat === 3}>
              <Click on={beat === 2}>
                <MaterialIcon
                  name={added ? 'check_circle' : beat === 2 ? 'check_box' : 'check_box_outline_blank'}
                  size={11}
                  style={{ color: added ? '#198754' : '#0d6efd', transition: 'color .3s ease' }} />
              </Click>
              <span style={{ fontFamily: 'monospace', fontSize: 8 }}>{profile.code}</span>
            </MiniRow>

            {beat === 3 && (
              <Appear when>
                <div className="rounded px-1 py-1 mb-1" style={{ background: '#f0f4ff', border: '1px solid #c7d7f5', fontSize: 8 }}>
                  add to: <strong>inside ET-LIN-01</strong> · at position level
                </div>
              </Appear>
            )}

            {/* the pending product — the Form asked, nobody named it */}
            <div className="rounded px-1 py-1 mt-2" style={{ background: '#fdecec', border: '1px solid #f5c2c7' }}>
              <div style={{ fontSize: 7, color: '#842029', fontWeight: 600 }}>
                <MaterialIcon name="help" size={9} /> 1 product with no ElementType
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 8 }}>{DEMO_FORM.pending.code}</div>
              <div className="text-muted" style={{ fontSize: 7 }}>{DEMO_FORM.pending.mfr}</div>
              {beat >= 4 && (
                <Appear when>
                  <div className="d-flex align-items-center gap-1 rounded px-1 mt-1" style={{ background: '#fff', fontSize: 7 }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{DEMO_FORM.pending.matches}</span>
                    <Click on>
                      <span className="rounded px-1" style={{ background: '#198754', color: '#fff' }}>That&apos;s it</span>
                    </Click>
                  </div>
                </Appear>
              )}
            </div>
          </div>
        </div>
      </Stage>
      <Caption>
        {[
          '',
          'Left, what the recipe has. Right, what the Form asks for. The gap is your work.',
          'A product the Form names that the recipe lacks is a defect. Tick it.',
          'The Form carries no slot, so you say where it lands: inside the wrapper, or at position level.',
          'A product nobody named is usually one you already have — "That’s it" links them, instead of minting a duplicate.',
        ][beat]}
      </Caption>
    </>
  )
}

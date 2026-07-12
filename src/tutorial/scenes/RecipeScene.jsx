import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import EntityPill from '../../components/EntityPill'
import FlagPill from '../../components/FlagPill'
import { Stage, Click, Pulse, Appear, Caption } from './atoms'
import { DEMO_RECIPE, DEMO_NEW_ROW } from '../demo-data'

/**
 * RecipeScene — a replica of a real IngredientCard, laid out as the real one is:
 *
 *   [✓] [copy] [drag] │ EntityPill(stack: ref + family) → arrow → Mfr – Code   │ [swap]
 *                     │ Design  Contract  Integer  TBC   [qty]  …              │ [delete]
 *                     │                                                        │ [container]
 *
 * The quantity is a chip in the FLAGS row under the pill — not on the right — and the
 * destructive actions are a vertical column on the far right. Getting that wrong made the
 * first version of this card teach a layout the app does not have.
 *
 * beats: 0 the row: ElementType → the product it resolves to
 *        1 quantity (in the flags row)
 *        2 the flags themselves
 *        3 + Add Entity — Existing / New
 *        4 the new row arrives
 *        5 delete = IsDeleted, restorable
 */
export default function RecipeScene({ beat }) {
  const qty = beat >= 1 ? 2 : 1
  const contract = beat >= 2
  const deleted = beat >= 5
  const [wrapper, socket] = DEMO_RECIPE

  const Card = ({ row, children, dim, accent = '#bf6018' }) => (
    <div className="mb-1" style={{
      border: '1px solid #e9ecef', borderLeft: `3px solid ${accent}`, borderRadius: 6,
      background: dim ? '#f8f9fa' : '#fff', opacity: dim ? 0.65 : 1,
      transition: 'opacity .3s ease, background .3s ease',
    }}>
      <div className="d-flex align-items-start gap-1 px-2 py-1">
        <MaterialIcon name="check_box_outline_blank" size={12} style={{ color: '#ccc', paddingTop: 2 }} />
        <MaterialIcon name="content_copy" size={11} style={{ color: '#aaa', paddingTop: 2 }} />
        <MaterialIcon name="drag_indicator" size={13} style={{ color: '#aaa', paddingTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        {/* the right-hand action column, as in the real card */}
        <div className="d-flex flex-column align-items-center gap-1" style={{ alignSelf: 'flex-start' }}>
          <MaterialIcon name="swap_horiz" size={12} style={{ color: '#adb5bd' }} />
          <Click on={beat === 5 && row === 'socket'}>
            <MaterialIcon name="delete" size={12}
              style={{ color: deleted && row === 'socket' ? '#dc3545' : '#adb5bd', transition: 'color .3s ease' }} />
          </Click>
          <MaterialIcon name="inventory_2" size={12}
            style={{ color: row === 'wrapper' ? '#bf6018' : '#adb5bd' }} />
        </div>
      </div>
    </div>
  )

  return (
    <>
      <Stage height={240}>
        <div className="d-flex align-items-center gap-2 mb-1">
          <span className="fw-semibold text-uppercase text-muted" style={{ fontSize: 8, letterSpacing: '.05em' }}>
            PositionType Level — C01r
          </span>
          <div className="ms-auto">
            <Click on={beat === 3}>
              <Pulse on={beat === 3}>
                <span className="rounded px-2 py-1" style={{ background: '#fff', border: '1px solid #0d6efd', color: '#0d6efd', fontSize: 9 }}>
                  + Add Entity
                </span>
              </Pulse>
            </Click>
          </div>
        </div>

        {beat === 3 && (
          <Appear when>
            <div className="d-flex gap-1 justify-content-end mb-1" style={{ fontSize: 9 }}>
              <span className="rounded px-2 py-1" style={{ background: '#e7f1ff', color: '#084298' }}>Existing…</span>
              <span className="rounded px-2 py-1" style={{ background: '#d1e7dd', color: '#0f5132' }}>New ↗</span>
            </div>
          </Appear>
        )}

        {/* the wrapper — the Design element */}
        <Card row="wrapper">
          <div className="d-flex align-items-center gap-1 mb-1 flex-wrap">
            <EntityPill type="ElementType" label={wrapper.ref} sublabel={wrapper.family} stack />
            <MaterialIcon name="arrow_forward" size={11} style={{ color: '#ccc' }} />
            <span className="text-muted" style={{ fontSize: 9 }}>{wrapper.mfr} – {wrapper.code}</span>
            <span className="rounded px-1 ms-1" style={{ fontSize: 8, color: '#0d6efd' }}>Edit internals →</span>
          </div>
          <div className="d-flex gap-1 align-items-center flex-wrap">
            <FlagPill label="Design" value="Y" onChange={() => {}} activeVariant="primary" />
            <FlagPill label="Contract" value={null} onChange={() => {}} activeVariant="success" />
            <FlagPill label="Integer" value={null} onChange={() => {}} activeVariant="secondary" />
            <FlagPill label="TBC" value={null} onChange={() => {}} activeVariant="danger" />
          </div>
        </Card>

        {/* the socket — where qty, flags and delete are taught */}
        <Card row="socket" dim={deleted} accent="#bf6018">
          <div className="d-flex align-items-center gap-1 mb-1 flex-wrap">
            <EntityPill type="ElementType" label={socket.ref} sublabel={socket.family} stack />
            <MaterialIcon name="arrow_forward" size={11} style={{ color: '#ccc' }} />
            <Pulse on={beat === 0}>
              <span className="text-muted" style={{ fontSize: 9 }}>{socket.mfr} – {socket.code}</span>
            </Pulse>
          </div>
          {/* the FLAGS ROW — all four pills, then the qty chip, then the overflow. This is
              where quantity actually lives; it is not on the right of the card. */}
          <div className="d-flex gap-1 align-items-center flex-wrap">
            <Pulse on={beat === 2}>
              <span className="d-inline-flex gap-1">
                <FlagPill label="Design" value={null} onChange={() => {}} activeVariant="primary" />
                <FlagPill label="Contract" value={contract ? 'Y' : null} onChange={() => {}} activeVariant="success" />
                <FlagPill label="Integer" value={null} onChange={() => {}} activeVariant="secondary" />
                <FlagPill label="TBC" value={null} onChange={() => {}} activeVariant="danger" />
              </span>
            </Pulse>
            <Click on={beat === 1}>
              <Pulse on={beat === 1}>
                <span className="d-inline-flex align-items-center gap-1 rounded px-1 py-1"
                  style={{ border: '1px solid #dee2e6', background: '#fff' }}>
                  <MaterialIcon name="category" size={12} style={{ color: '#6c757d' }} />
                  {beat >= 1 ? (
                    <span className="d-inline-flex align-items-center gap-1">
                      <span style={{ fontSize: 9, color: '#6c757d' }}>−</span>
                      <span style={{ fontSize: 10, fontWeight: 600 }}>{qty}</span>
                      <span style={{ fontSize: 9, color: '#6c757d' }}>+</span>
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#adb5bd' }}>{qty}</span>
                  )}
                </span>
              </Pulse>
            </Click>
            <MaterialIcon name="more_horiz" size={13} style={{ color: '#adb5bd' }} />
          </div>
        </Card>

        {deleted && (
          <Appear when>
            <div style={{ fontSize: 8, color: '#6c757d' }} className="ps-2">
              <MaterialIcon name="delete" size={9} /> IsDeleted — restorable, and synced to Excel at export
            </div>
          </Appear>
        )}

        {/* the added row */}
        <Appear when={beat === 4}>
          <div className="mb-1" style={{ border: '1px solid #198754', borderLeft: '3px solid #198754', borderRadius: 6, background: '#f2fbf5' }}>
            <div className="d-flex align-items-center gap-1 px-2 py-1">
              <EntityPill type="ElementType" label={DEMO_NEW_ROW.ref} sublabel={DEMO_NEW_ROW.family} stack />
              <span className="text-muted" style={{ fontSize: 9 }}>{DEMO_NEW_ROW.desc}</span>
              <span className="badge ms-auto" style={{ background: '#198754', fontSize: 7 }}>New</span>
            </div>
          </div>
        </Appear>
      </Stage>
      <Caption>
        {[
          'The pill is the ElementType (with its family under it); after the arrow, the product the spec says it is.',
          'Quantity is the chip in the flags row — click the category icon and a stepper opens.',
          'Flags sit beside it: exactly one Design element; Contract items are free-issued.',
          'Add Entity forks: an ElementType you already have, or a new one.',
          'The new row lands here, and reads New until you export.',
          'Delete is the bin in the right-hand column — it marks IsDeleted, and never destroys.',
        ][beat]}
      </Caption>
    </>
  )
}

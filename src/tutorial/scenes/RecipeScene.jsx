import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import EntityPill from '../../components/EntityPill'
import FlagPill from '../../components/FlagPill'
import { Stage, Cursor, Pulse, Appear, MiniRow, Caption } from './atoms'
import { DEMO_RECIPE, DEMO_NEW_ROW } from '../demo-data'

/**
 * RecipeScene — the focused position editor, on D01's demo recipe.
 *
 * beats: 0 row anatomy (ET pill → product code)
 *        1 the qty stepper opens and goes 1 → 2
 *        2 the flags: Design / Contract
 *        3 + Add Entity: the Existing / New fork
 *        4 the new row slides in
 *        5 delete marks IsDeleted — restorable, synced at export
 */
export default function RecipeScene({ beat }) {
  const qty = beat >= 1 ? 2 : 1
  const deleted = beat >= 5

  const cursorAt = { 1: { x: 218, y: 62 }, 2: { x: 90, y: 92 }, 3: { x: 250, y: 8 }, 5: { x: 296, y: 62 } }[beat]

  const socket = DEMO_RECIPE[1]

  return (
    <>
      <Stage>
        <div className="d-flex align-items-center gap-2 mb-2" style={{ fontSize: 10 }}>
          <span className="fw-semibold text-uppercase text-muted" style={{ letterSpacing: '.05em' }}>
            PositionType level — D01
          </span>
          <Pulse on={beat === 3} style={{ marginLeft: 'auto' }}>
            <span className="rounded px-2 py-1" style={{ background: '#fff', border: '1px solid #0d6efd', color: '#0d6efd' }}>
              + Add Entity
            </span>
          </Pulse>
        </div>

        {beat === 3 && (
          <Appear when>
            <div className="d-flex gap-1 justify-content-end mb-1" style={{ fontSize: 10 }}>
              <span className="rounded px-2 py-1" style={{ background: '#e7f1ff', color: '#084298' }}>Existing…</span>
              <span className="rounded px-2 py-1" style={{ background: '#d1e7dd', color: '#0f5132' }}>New ↗</span>
            </div>
          </Appear>
        )}

        {/* the design row */}
        <MiniRow>
          <EntityPill type="ElementType" label={DEMO_RECIPE[0].ref} />
          <MaterialIcon name="arrow_forward" size={12} style={{ color: '#ccc' }} />
          <Pulse on={beat === 0}>
            <span className="text-muted">{DEMO_RECIPE[0].manufacturer} – {DEMO_RECIPE[0].code}</span>
          </Pulse>
          <span className="ms-auto d-inline-flex align-items-center gap-1">
            <FlagPill label="Design" value="Y" onChange={() => {}} activeVariant="primary" />
          </span>
        </MiniRow>

        {/* the socket row — qty, flags, delete all happen here */}
        <MiniRow dim={deleted}>
          <EntityPill type="ElementType" label={socket.ref} />
          <MaterialIcon name="arrow_forward" size={12} style={{ color: '#ccc' }} />
          <span className="text-muted">{socket.manufacturer} – {socket.code}</span>
          <span className="ms-auto d-inline-flex align-items-center gap-1">
            <Pulse on={beat === 2}>
              <FlagPill label="Contract" value={beat >= 2 ? 'Y' : null} onChange={() => {}} activeVariant="success" />
            </Pulse>
            <Pulse on={beat === 1}>
              <span className="d-inline-flex align-items-center gap-1 rounded px-1"
                style={{ border: '1px solid #dee2e6', background: '#fff' }}>
                <MaterialIcon name="category" size={12} style={{ color: '#6c757d' }} />
                <span style={{ fontWeight: 600, transition: 'color .3s ease', color: qty > 1 ? '#212529' : '#adb5bd' }}>{qty}</span>
              </span>
            </Pulse>
            <Pulse on={beat === 5}>
              <MaterialIcon name="delete" size={13} style={{ color: deleted ? '#dc3545' : '#adb5bd', transition: 'color .3s ease' }} />
            </Pulse>
          </span>
        </MiniRow>
        {deleted && (
          <Appear when>
            <div style={{ fontSize: 9, color: '#6c757d' }} className="ps-2">
              <MaterialIcon name="delete" size={10} /> IsDeleted — restorable, and synced to Excel at export
            </div>
          </Appear>
        )}

        {/* the row the demo adds */}
        <Appear when={beat >= 4}>
          <MiniRow active style={{ borderColor: '#198754' }}>
            <EntityPill type="ElementType" label={DEMO_NEW_ROW.ref} />
            <span className="text-muted">{DEMO_NEW_ROW.label}</span>
            <span className="ms-auto badge" style={{ background: '#198754', fontSize: 8 }}>New</span>
          </MiniRow>
        </Appear>

        <Cursor at={cursorAt} click={beat === 1 || beat === 3 || beat === 5} />
      </Stage>
      <Caption>
        {[
          'A row is an ingredient: the ElementType, and the product the spec says it is.',
          'The category icon is the quantity — click it and step 1 → 2.',
          'Flags mark what a row IS: the Design element, a Contract item…',
          'Add Entity forks: pick an Existing ElementType, or mint a New one.',
          'The new row lands in this section, marked New until exported.',
          'Delete never destroys — the row is marked IsDeleted and can be restored.',
        ][beat]}
      </Caption>
    </>
  )
}

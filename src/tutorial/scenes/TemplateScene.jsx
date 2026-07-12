import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import EntityPill from '../../components/EntityPill'
import { Stage, Cursor, Pulse, Appear, MiniRow, Caption } from './atoms'
import { DEMO_TEMPLATE } from '../demo-data'

/**
 * TemplateScene — templates: canned recipes with slots.
 *
 * beats: 0 global vs project scope
 *        1 a global is read-only — Override copies it into this project
 *        2 slots (fill later, per position) vs exact refs (fixed)
 *        3 applying a template REPLACES the recipe
 */
export default function TemplateScene({ beat }) {
  const overridden = beat >= 1
  const cursorAt = { 1: { x: 250, y: 40 }, 2: { x: 120, y: 108 }, 3: { x: 250, y: 170 } }[beat]

  return (
    <>
      <Stage>
        <div className="d-flex gap-2 mb-2" style={{ fontSize: 9 }}>
          <div style={{ flex: 1 }}>
            <div className="text-muted text-uppercase" style={{ fontSize: 8 }}>Global (all projects)</div>
            <MiniRow dim={overridden}>
              <MaterialIcon name="public" size={11} style={{ color: '#6c757d' }} />
              <span>{DEMO_TEMPLATE.name}</span>
              <MaterialIcon name="lock" size={10} style={{ color: '#adb5bd' }} />
            </MiniRow>
          </div>
          <div style={{ flex: 1 }}>
            <div className="text-muted text-uppercase" style={{ fontSize: 8 }}>This project</div>
            {overridden ? (
              <Appear when>
                <MiniRow active>
                  <MaterialIcon name="edit" size={11} style={{ color: '#0d6efd' }} />
                  <span>{DEMO_TEMPLATE.name}</span>
                  <span className="badge ms-auto" style={{ background: '#0d6efd', fontSize: 7 }}>override</span>
                </MiniRow>
              </Appear>
            ) : (
              <Pulse on={beat === 1}>
                <div className="rounded px-2 py-1" style={{ border: '1px dashed #ced4da', color: '#adb5bd' }}>
                  Override for this project
                </div>
              </Pulse>
            )}
          </div>
        </div>

        {/* the slots */}
        <div className="text-muted text-uppercase mb-1" style={{ fontSize: 8 }}>Ingredients</div>
        {DEMO_TEMPLATE.slots.map(s => (
          <MiniRow key={s.label}>
            <Pulse on={beat === 2 && s.kind === 'slot'}>
              {s.kind === 'slot' ? (
                <span className="rounded px-1" style={{
                  border: '1px dashed #adb5bd', color: '#6c757d', fontSize: 9,
                  background: 'repeating-linear-gradient(45deg,#f8f9fa,#f8f9fa 4px,#f1f3f5 4px,#f1f3f5 8px)',
                }}>{s.label} — slot, filled per position</span>
              ) : (
                <span className="d-inline-flex align-items-center gap-1">
                  <EntityPill type="ElementType" label={s.ref} />
                  <span className="text-muted" style={{ fontSize: 9 }}>{s.label} — exact</span>
                </span>
              )}
            </Pulse>
          </MiniRow>
        ))}

        {beat === 3 && (
          <Appear when>
            <div className="rounded px-2 py-1 mt-1" style={{ background: '#fff3cd', border: '1px solid #f0e0a8', fontSize: 9, color: '#856404' }}>
              <MaterialIcon name="warning" size={10} /> Applying a template <strong>replaces</strong> the
              position's recipe — a confirm stands in the way when rows exist.
            </div>
          </Appear>
        )}

        <Cursor at={cursorAt} click={beat === 1 || beat === 3} />
      </Stage>
      <Caption>
        {[
          'Globals live in your library, across projects. Project templates belong here.',
          'Globals are read-only — Override copies one into the project to edit.',
          'A slot is filled per position at apply time; an exact ref is fixed.',
          'Templates replace. Additive changes come from the palette instead.',
        ][beat]}
      </Caption>
    </>
  )
}

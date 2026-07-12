import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import EntityPill from '../../components/EntityPill'
import { Stage, Cursor, Pulse, MiniRow, Caption } from './atoms'
import { DEMO_POSITIONS } from '../demo-data'

/**
 * TreeScene — the project tree, played on the demo positions.
 *
 * beats: 0 the tree, grouped by family
 *        1 the filter narrows it to the Linear family
 *        2 the coverage bar — how many positions have a recipe
 *        3 the ignore toggle — X01 needs no recipe, drop it from the totals
 *        4 clicking a position focuses it
 */
export default function TreeScene({ beat }) {
  const filtered = beat === 1
  const ignoring = beat >= 3
  const focusing = beat >= 4

  const shown = filtered ? DEMO_POSITIONS.filter(p => p.family === 'Linear') : DEMO_POSITIONS
  // Coverage counts only in-scope positions: ignoring X01 shrinks the denominator.
  const scoped = ignoring ? DEMO_POSITIONS.filter(p => p.ref !== 'X01') : DEMO_POSITIONS
  const reciped = scoped.filter(p => p.reciped).length

  const cursorAt = { 1: { x: 118, y: 8 }, 3: { x: 236, y: 148 }, 4: { x: 60, y: 78 } }[beat]

  return (
    <>
      <Stage>
        {/* the header the real tree has: filter + coverage */}
        <div className="d-flex align-items-center gap-2 mb-2" style={{ fontSize: 10 }}>
          <Pulse on={beat === 1}>
            <span className="rounded px-2 py-1" style={{ background: '#fff', border: '1px solid #dee2e6', color: filtered ? '#212529' : '#adb5bd' }}>
              {filtered ? 'linear' : 'Filter positions…'}
            </span>
          </Pulse>
          <Pulse on={beat === 2} style={{ marginLeft: 'auto' }}>
            <span className="d-inline-flex align-items-center gap-1" style={{ color: '#555' }}>
              <strong>{reciped}</strong>/{scoped.length} reciped
              <span style={{ width: 46, height: 4, background: '#e9ecef', borderRadius: 2, overflow: 'hidden', display: 'inline-block' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.round((reciped / scoped.length) * 100)}%`, background: '#0d6efd', transition: 'width .4s ease' }} />
              </span>
            </span>
          </Pulse>
        </div>

        {/* families and their positions */}
        {['Downlights', 'Linear', 'Specials'].map(fam => {
          const rows = shown.filter(p => p.family === fam)
          if (rows.length === 0) return null
          return (
            <div key={fam} className="mb-1">
              <div className="text-muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em' }}>{fam}</div>
              {rows.map(p => (
                <MiniRow key={p.ref}
                  active={focusing && p.ref === 'L01'}
                  dim={ignoring && p.ref === 'X01'}>
                  <EntityPill type="PositionType" label={p.ref} />
                  <span className="text-muted text-truncate" style={{ flex: 1 }}>{p.name}</span>
                  {p.reciped
                    ? <span style={{ color: '#198754', fontSize: 9 }}>3 rows</span>
                    : <span className="text-muted fst-italic" style={{ fontSize: 9 }}>empty</span>}
                  <MaterialIcon name={ignoring && p.ref === 'X01' ? 'do_not_disturb_on' : 'do_not_disturb_off'}
                    size={12} style={{ color: ignoring && p.ref === 'X01' ? '#ffc107' : '#dee2e6', transition: 'color .3s ease' }} />
                </MiniRow>
              ))}
            </div>
          )
        })}

        <Cursor at={cursorAt} click={beat === 3 || beat === 4} />
      </Stage>
      <Caption>
        {[
          'Every PositionType from the DesignDB, grouped by family.',
          'The filter narrows by ref, name or tag.',
          `${reciped} of ${scoped.length} positions have at least one recipe row.`,
          'X01 needs no recipe — flagging it drops it from every total.',
          'Clicking a position hands the whole surface to its recipe.',
        ][beat]}
      </Caption>
    </>
  )
}

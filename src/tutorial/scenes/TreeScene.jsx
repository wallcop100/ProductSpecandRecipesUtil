import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { Stage, Click, Pulse, PositionRow, FamilyHeader, Caption } from './atoms'
import { DEMO_POSITIONS } from '../demo-data'

/**
 * TreeScene — a replica of ProjectTreeView's overview, built against its actual rendered DOM
 * rather than an impression of it. The header order is the real one:
 *
 *   PositionTypes · ?  ·  n/m reciped ▓▓░  ·  Review empty (n)  ······  Tags  Status  [filter]
 *
 * — coverage on the LEFT after the title, the filter pushed RIGHT with ms-auto. Families are
 * headed by their REF (DOWNLIGHT, LINEAR-HL-ARCHITECTURAL) with a count and an "Ignore
 * family" action, and a row is just its ref: the DesignDB leaves Name blank, so the real row
 * prints no description at all.
 *
 * beats: 0 the tree, grouped by family
 *        1 the filter (top right) narrows it
 *        2 the coverage readout (top left)
 *        3 the ignore toggle — at the END of A02wE's row
 *        4 clicking a row opens the position
 */
export default function TreeScene({ beat }) {
  const filtering = beat === 1
  const ignoring = beat >= 3
  const opening = beat >= 4

  const shown = filtering
    ? DEMO_POSITIONS.filter(p => p.family !== 'DOWNLIGHT')
    : DEMO_POSITIONS

  // Ignoring A02wE takes it out of the denominator — that is what out-of-scope means.
  const scoped = DEMO_POSITIONS.filter(p => !(ignoring && p.ref === 'A02wE'))
  const reciped = scoped.filter(p => p.rows > 0).length
  const pct = Math.round((reciped / scoped.length) * 100)
  const empties = scoped.filter(p => p.rows === 0).length

  const families = [...new Set(shown.map(p => p.family))]

  return (
    <>
      <Stage>
        <div className="d-flex align-items-center gap-2 mb-2 pb-2" style={{ borderBottom: '1px solid #e9ecef' }}>
          <strong className="text-uppercase text-muted" style={{ fontSize: 9, letterSpacing: '.05em' }}>
            PositionTypes
          </strong>
          <MaterialIcon name="help" size={10} style={{ color: '#adb5bd' }} />

          <Pulse on={beat === 2}>
            <span className="d-inline-flex align-items-center gap-1" style={{ fontSize: 9, color: '#555' }}>
              <strong>{reciped}</strong>/{scoped.length} reciped
              <span style={{ width: 44, height: 4, background: '#e9ecef', borderRadius: 2, overflow: 'hidden', display: 'inline-block' }}>
                <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: '#0d6efd', transition: 'width .45s ease' }} />
              </span>
            </span>
          </Pulse>

          <span className="rounded px-1" style={{ fontSize: 8, border: '1px solid #ffc107', color: '#997404' }}>
            Review empty ({empties})
          </span>

          {/* ms-auto — Tags, Status and the filter live on the RIGHT, as they really do */}
          <div className="ms-auto d-flex align-items-center gap-1">
            <span className="rounded px-1" style={{ fontSize: 8, border: '1px solid #dee2e6', color: '#6c757d' }}>Tags</span>
            <span className="rounded px-1" style={{ fontSize: 8, border: '1px solid #dee2e6', color: '#6c757d' }}>Status</span>
            <Click on={beat === 1}>
              <Pulse on={beat === 1}>
                <span className="rounded px-1 py-1 d-inline-flex align-items-center gap-1"
                  style={{ background: '#fff', border: '1px solid #dee2e6', fontSize: 8, minWidth: 86 }}>
                  <MaterialIcon name="search" size={9} style={{ color: '#adb5bd' }} />
                  <span style={{ color: filtering ? '#212529' : '#adb5bd' }}>
                    {filtering ? 'LIN' : 'Filter positions…'}
                  </span>
                </span>
              </Pulse>
            </Click>
          </div>
        </div>

        {families.map(fam => {
          const rows = shown.filter(p => p.family === fam)
          return (
            <div key={fam} className="mb-1">
              <FamilyHeader family={fam} count={rows.length} />
              {rows.map(p => (
                <PositionRow
                  key={p.ref}
                  posRef={p.ref}
                  rows={p.rows}
                  ignored={ignoring && p.ref === 'A02wE'}
                  active={opening && p.ref === 'C01r'}
                  clickIgnore={beat === 3 && p.ref === 'A02wE'}
                  clickRow={beat === 4 && p.ref === 'C01r'}
                />
              ))}
            </div>
          )
        })}
      </Stage>
      <Caption>
        {[
          'Every PositionType the DesignDB defines, under its family — the family’s own ref.',
          'The filter sits top-right, beside the Tags and Status toggles. Type LIN.',
          'Top-left: how many in-scope positions already have a recipe.',
          'The ignore toggle is the last icon on a row, before the chevron.',
          'Click the row and the surface becomes C01r’s recipe.',
        ][beat]}
      </Caption>
    </>
  )
}

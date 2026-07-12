import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { Stage, Click, Pulse, PositionRow, Caption } from './atoms'
import { DEMO_POSITIONS } from '../demo-data'

/**
 * TreeScene — a replica of ProjectTreeView's overview.
 *
 * The header order is the real one: title, then the coverage readout, then "Review empty",
 * and the filter bar pushed to the RIGHT with ms-auto. Rows are PositionRow, which mirrors
 * the real row down to the ignore toggle sitting at the end, before the chevron.
 *
 * beats: 0 the tree, grouped by family
 *        1 the filter (top right) narrows it
 *        2 the coverage readout (top left)
 *        3 the ignore toggle — at the END of A02wE's row
 *        4 clicking a position opens it
 */
export default function TreeScene({ beat }) {
  const filtering = beat === 1
  const ignoring = beat >= 3
  const opening = beat >= 4

  const shown = filtering
    ? DEMO_POSITIONS.filter(p => p.family !== 'Downlight')
    : DEMO_POSITIONS

  // Ignoring A02wE removes it from the denominator — that is what "out of scope" means.
  const scoped = DEMO_POSITIONS.filter(p => !(ignoring && p.ref === 'A02wE'))
  const reciped = scoped.filter(p => p.rows > 0).length
  const pct = Math.round((reciped / scoped.length) * 100)

  const families = [...new Set(shown.map(p => p.family))]

  return (
    <>
      <Stage>
        {/* The real header: title · coverage · Review empty ·············· filter (ms-auto) */}
        <div className="d-flex align-items-center gap-2 mb-2 pb-2" style={{ borderBottom: '1px solid #e9ecef' }}>
          <strong className="text-uppercase text-muted" style={{ fontSize: 9, letterSpacing: '.05em' }}>
            PositionTypes
          </strong>
          <Pulse on={beat === 2}>
            <span className="d-inline-flex align-items-center gap-1" style={{ fontSize: 10, color: '#555' }}>
              <strong>{reciped}</strong>/{scoped.length} reciped
              <span style={{ width: 48, height: 4, background: '#e9ecef', borderRadius: 2, overflow: 'hidden', display: 'inline-block' }}>
                <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: '#0d6efd', transition: 'width .45s ease' }} />
              </span>
            </span>
          </Pulse>
          <span className="rounded px-1" style={{ fontSize: 9, border: '1px solid #ffc107', color: '#997404' }}>
            Review empty ({scoped.filter(p => p.rows === 0).length})
          </span>

          {/* ms-auto — the filter lives on the RIGHT, as it does in the real header */}
          <div className="ms-auto">
            <Click on={beat === 1}>
              <Pulse on={beat === 1}>
                <span className="rounded px-2 py-1 d-inline-flex align-items-center gap-1"
                  style={{ background: '#fff', border: '1px solid #dee2e6', fontSize: 9, minWidth: 96 }}>
                  <MaterialIcon name="search" size={10} style={{ color: '#adb5bd' }} />
                  <span style={{ color: filtering ? '#212529' : '#adb5bd' }}>
                    {filtering ? 'LIN' : 'Filter positions…'}
                  </span>
                </span>
              </Pulse>
            </Click>
          </div>
        </div>

        {families.map(fam => (
          <div key={fam} className="mb-1">
            <div className="text-muted" style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {fam}
            </div>
            {shown.filter(p => p.family === fam).map(p => (
              <PositionRow
                key={p.ref}
                posRef={p.ref}
                desc={p.desc}
                rows={p.rows}
                ignored={ignoring && p.ref === 'A02wE'}
                active={opening && p.ref === 'C01r'}
                clickIgnore={beat === 3 && p.ref === 'A02wE'}
                clickRow={beat === 4 && p.ref === 'C01r'}
              />
            ))}
          </div>
        ))}
      </Stage>
      <Caption>
        {[
          'Every PositionType the DesignDB defines, grouped by its family.',
          'The filter sits top-right. Type LIN and only the linear family remains.',
          'Top-left: how many in-scope positions already have a recipe.',
          'The ignore toggle is at the end of each row. A02wE needs no recipe of its own.',
          'Click the row and the surface becomes C01r’s recipe.',
        ][beat]}
      </Caption>
    </>
  )
}

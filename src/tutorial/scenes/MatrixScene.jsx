import React from 'react'
import EntityPill from '../../components/EntityPill'
import { Stage, Click, Pulse, Appear, MiniCell, Caption } from './atoms'
import { DEMO_MATRIX } from '../demo-data'

/**
 * MatrixScene — the connectors coverage matrix: positions × collections.
 *
 * beats: 0 a collection is a named ingredient set, gated by tags
 *        1 the matrix — every cell is a status
 *        2 click the red cell; the panel names what is missing
 *        3 add it — the cell turns green
 *        4 Apply all fills the column
 */
export default function MatrixScene({ beat }) {
  const fixed = beat >= 3
  const statusOf = (row, coll) =>
    (fixed && row.ref === 'A02m' && coll === 'Local driver kit') ? 'complete' : row.cells[coll]

  return (
    <>
      <Stage>
        {beat === 0 && (
          <div className="rounded px-2 py-2 mb-2" style={{ background: '#e7f1ff', border: '1px solid #b6d4fe', fontSize: 10 }}>
            A collection names a SET of ingredients and the tags it applies to. A position whose tags
            don’t match isn’t expected to carry it — that is what <strong>N/A</strong> means, not a gap.
          </div>
        )}

        <table style={{ fontSize: 9, borderCollapse: 'separate', borderSpacing: 3 }}>
          <thead>
            <tr>
              <th />
              {DEMO_MATRIX.collections.map(c => (
                <th key={c} className="text-muted fw-normal" style={{ fontSize: 8 }}>
                  {beat === 4 && c === 'Local driver kit' ? (
                    <Click on>
                      <Pulse on>
                        <span className="rounded px-1" style={{ background: '#0d6efd', color: '#fff' }}>
                          {c} · Apply all
                        </span>
                      </Pulse>
                    </Click>
                  ) : c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO_MATRIX.rows.map(row => (
              <tr key={row.ref}>
                <td><EntityPill type="PositionType" label={row.ref} /></td>
                {DEMO_MATRIX.collections.map(c => {
                  const hot = beat === 2 && row.ref === 'A02m' && c === 'Local driver kit'
                  return (
                    <td key={c}>
                      <Click on={hot}>
                        <Pulse on={hot}>
                          <MiniCell status={statusOf(row, c)} />
                        </Pulse>
                      </Click>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {(beat === 2 || beat === 3) && (
          <Appear when>
            <div className="rounded px-2 py-1 mt-2" style={{ background: '#fff', border: '1px solid #dee2e6', fontSize: 9 }}>
              <strong>A02m × Local driver kit</strong> — missing{' '}
              <span style={{ fontFamily: 'monospace' }}>{DEMO_MATRIX.missingRef}</span>
              <span className="ms-2">
                <Click on={beat === 2}>
                  <span className="rounded px-1" style={{
                    background: fixed ? '#d1e7dd' : '#0d6efd', color: fixed ? '#0f5132' : '#fff',
                    transition: 'background .3s ease',
                  }}>
                    {fixed ? 'added ✓' : '+ Add'}
                  </span>
                </Click>
              </span>
            </div>
          </Appear>
        )}
      </Stage>
      <Caption>
        {[
          'A collection is a named ingredient set with tag gates. No matching tag → N/A, not a gap.',
          'Rows are positions, columns are collections. Green complete, amber partial, red missing.',
          'Click a red cell and the panel names exactly which ref is absent.',
          'Add it from right there — the cell turns green while you watch.',
          'Apply all fills every incomplete cell in the column, in one undoable step.',
        ][beat]}
      </Caption>
    </>
  )
}

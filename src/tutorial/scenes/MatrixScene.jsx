import React from 'react'
import EntityPill from '../../components/EntityPill'
import { Stage, Cursor, Pulse, Appear, MiniCell, Caption } from './atoms'
import { DEMO_MATRIX } from '../demo-data'

/**
 * MatrixScene — connectors: collections × positions, coverage at a glance.
 *
 * beats: 0 a collection is a named ingredient set, gated by tags
 *        1 the matrix: every cell is a status
 *        2 click the red cell — the detail panel says exactly what is missing
 *        3 add it — the cell turns green
 *        4 Apply all fills a whole column in one move
 */
export default function MatrixScene({ beat }) {
  const fixed = beat >= 3
  const cursorAt = { 2: { x: 196, y: 92 }, 3: { x: 250, y: 130 }, 4: { x: 196, y: 40 } }[beat]

  const cellStatus = (pos, coll) => {
    if (fixed && pos === 'D01' && coll === 'Strain reliefs') return 'complete'
    return DEMO_MATRIX.cells[pos][coll]
  }

  return (
    <>
      <Stage>
        {beat === 0 && (
          <div className="rounded px-2 py-2 mb-2" style={{ background: '#e7f1ff', border: '1px solid #b6d4fe', fontSize: 10 }}>
            A collection names a SET of ingredients (“3-Pin kit” = socket + strain relief + plug)
            and the tags it applies to. Positions with matching tags are expected to carry it.
          </div>
        )}

        {/* the matrix */}
        <table style={{ fontSize: 9, borderCollapse: 'separate', borderSpacing: 3 }}>
          <thead>
            <tr>
              <th />
              {DEMO_MATRIX.collections.map(c => (
                <th key={c} className="text-muted fw-normal" style={{ fontSize: 8 }}>
                  <Pulse on={beat === 4 && c === 'Strain reliefs'}>{c}{beat === 4 && c === 'Strain reliefs' ? ' · Apply all' : ''}</Pulse>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(DEMO_MATRIX.cells).map(pos => (
              <tr key={pos}>
                <td><EntityPill type="PositionType" label={pos} /></td>
                {DEMO_MATRIX.collections.map(c => (
                  <td key={c}>
                    <Pulse on={beat === 2 && pos === 'D01' && c === 'Strain reliefs'}>
                      <MiniCell status={cellStatus(pos, c)} />
                    </Pulse>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* the detail panel for the clicked cell */}
        {(beat === 2 || beat === 3) && (
          <Appear when>
            <div className="rounded px-2 py-1 mt-2" style={{ background: '#fff', border: '1px solid #dee2e6', fontSize: 9 }}>
              <strong>D01 × Strain reliefs</strong> — missing:{' '}
              <span style={{ fontFamily: 'monospace' }}>ET-SR-01</span>
              <span className="rounded px-1 ms-2" style={{ background: fixed ? '#d1e7dd' : '#0d6efd', color: fixed ? '#0f5132' : '#fff' }}>
                {fixed ? 'added ✓' : '+ Add'}
              </span>
            </div>
          </Appear>
        )}

        <Cursor at={cursorAt} click={beat >= 2} />
      </Stage>
      <Caption>
        {[
          'A collection is a named ingredient set with tag gates.',
          'Rows are positions, columns are collections; a cell’s colour is its status.',
          'Click a red cell and the panel names exactly which refs are missing.',
          'Add the missing ref — the cell turns green where you can see it.',
          'Apply all fills every incomplete cell in the column, one undoable move.',
        ][beat]}
      </Caption>
    </>
  )
}

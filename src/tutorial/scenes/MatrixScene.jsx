import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { Stage, Click, Pulse, Appear, Caption } from './atoms'
import { DEMO_COLLECTIONS, DEMO_MATRIX } from '../demo-data'

/**
 * MatrixScene — the Connectors screen, as it actually is.
 *
 * The first version drew an abstract grid of pills and coloured squares, and never once showed
 * you MAKING a connector template — which is the first thing the screen asks of you, and the
 * only thing that turns an empty screen into a matrix. Rebuilt against the real components:
 *
 *   ConnectorsScreen   three panels — the template list (left), the matrix (centre), and the
 *                      cell detail panel (right, 320px, only when a cell is selected).
 *   CoverageMatrix     a real table. A toolbar with "+ New template" and an "Incomplete only"
 *                      switch; columns are PositionType | Tags | one per template, and each
 *                      template header carries "Apply all" (the missing ones) and "Fill" (the
 *                      partial ones). A cell is an icon on a tint, not a bare square.
 *   CollectionEditor   the modal: Name, Applicable tags, and an ingredients TABLE where every
 *                      row is a ref + a SECTION (free issue vs inside the wrapper) + a qty.
 *   CellDetailPanel    "N/M ingredients present", grouped by section, each ref with a tick or
 *                      a ring and an Add / Remove button.
 *
 * The empty state is beat 0 on purpose: with no templates there IS no matrix, and that is the
 * screen most people meet first.
 *
 * beats: 0 no templates yet — the matrix does not exist until you make one
 *        1 the editor: a name, the TAGS that gate it, and ingredients with a section each
 *        2 the matrix — rows, tags, statuses, and what N/A really means
 *        3 click a cell; the detail panel opens on the right
 *        4 the panel names exactly which ref is absent — Add it
 *        5 the cell turns green while you watch
 *        6 the column buttons do the whole column at once
 */

/** The real STATUS_SYMBOL values from CoverageMatrix. */
const STATUS = {
  complete: { icon: 'check_circle', color: '#198754', bg: '#d1e7dd' },
  partial:  { icon: 'warning', color: '#856404', bg: '#fff3cd' },
  missing:  { icon: 'cancel', color: '#842029', bg: '#f8d7da' },
  na:       { icon: 'remove', color: '#adb5bd', bg: '#f8f9fa' },
}

const Tag = ({ children }) => (
  <span className="rounded px-1" style={{ background: '#6c757d', color: '#fff', fontSize: 7, marginRight: 2 }}>
    {children}
  </span>
)

export default function MatrixScene({ beat }) {
  const kit = DEMO_COLLECTIONS[1]                 // Local Driver Kit — the one the card works
  const { posRef, collection } = DEMO_MATRIX.cell
  const fixed = beat >= 5
  const selected = beat >= 3

  const statusOf = (row, name) =>
    (fixed && row.ref === posRef && name === collection) ? 'complete' : row.cells[name]

  return (
    <>
      <Stage height={268}>
        {beat === 0 && (
          <Appear when>
            <div className="d-flex flex-column align-items-center justify-content-center text-center"
              style={{ height: '100%' }}>
              <div className="text-muted mb-3" style={{ fontSize: 11, maxWidth: 300, lineHeight: 1.6 }}>
                No connector templates defined yet. Create one, then click a cell to add or
                remove its connectors on each position.
              </div>
              <Click on>
                <Pulse on>
                  <span className="rounded px-2 py-1" style={{ background: '#0d6efd', color: '#fff', fontSize: 10 }}>
                    + New template
                  </span>
                </Pulse>
              </Click>
            </div>
          </Appear>
        )}

        {/* THE EDITOR — a name, the tags that gate it, and the ingredients table */}
        {beat === 1 && (
          <Appear when>
            <div className="rounded" style={{ background: '#fff', border: '1px solid #dee2e6' }}>
              <div className="px-2 py-1 border-bottom fw-semibold" style={{ fontSize: 10 }}>
                New Connector Template
              </div>
              <div className="px-2 py-2" style={{ fontSize: 9 }}>
                <div className="fw-semibold" style={{ fontSize: 8 }}>Name</div>
                <div className="rounded px-1 mb-2" style={{ border: '1px solid #dee2e6', fontSize: 9 }}>
                  {kit.name}
                </div>

                <div className="fw-semibold" style={{ fontSize: 8 }}>Applicable tags</div>
                <Pulse on>
                  <div className="rounded px-1 mb-2" style={{ border: '1px solid #0d6efd', background: '#f8f9ff' }}>
                    {kit.tags.map(t => <Tag key={t}>{t}</Tag>)}
                    <span className="text-muted" style={{ fontSize: 8 }}>Type tag and press Enter…</span>
                  </div>
                </Pulse>

                <div className="fw-semibold" style={{ fontSize: 8 }}>Ingredients</div>
                <table style={{ width: '100%', fontSize: 8 }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <th className="px-1 fw-normal text-muted">ElementTypeRef</th>
                      <th className="px-1 fw-normal text-muted">Section</th>
                      <th className="px-1 fw-normal text-muted">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kit.ingredients.map(i => (
                      <tr key={i.ref}>
                        <td className="px-1" style={{ fontFamily: 'monospace' }}>{i.ref}</td>
                        <td className="px-1 text-muted">
                          {i.section === 'position' ? 'Free Issue' : 'Inside Wrapper'}
                        </td>
                        <td className="px-1">{i.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <span className="text-muted" style={{ fontSize: 8 }}>+ Add ingredient</span>
              </div>
            </div>
          </Appear>
        )}

        {/* THE MATRIX — the real table, plus the detail panel on the right */}
        {beat >= 2 && (
          <div className="d-flex gap-2" style={{ height: '100%' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* the toolbar */}
              <div className="d-flex align-items-center gap-2 mb-1" style={{ fontSize: 8 }}>
                <span className="rounded px-1" style={{ background: '#0d6efd', color: '#fff' }}>+ New template</span>
                <span className="text-muted">3 positions · click a cell to manage connectors</span>
                <span className="ms-auto text-muted">Incomplete only</span>
              </div>

              <table style={{ width: '100%', fontSize: 8, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th className="px-1 fw-normal text-muted border" style={{ textAlign: 'left' }}>PositionType</th>
                    <th className="px-1 fw-normal text-muted border" style={{ textAlign: 'left' }}>Tags</th>
                    {DEMO_COLLECTIONS.map(c => (
                      <th key={c.name} className="px-1 border" style={{ textAlign: 'center', fontWeight: 500 }}>
                        <div style={{ fontSize: 8 }}>{c.name}</div>
                        {/* the two column actions, exactly as the real header carries them */}
                        <Click on={beat === 6 && c.name === collection}>
                          <Pulse on={beat === 6 && c.name === collection}>
                            <span className="d-inline-flex gap-1 mt-1">
                              <span className="rounded px-1" style={{ fontSize: 7, border: '1px solid #dc3545', color: '#dc3545' }}>
                                Apply all <MaterialIcon name="cancel" size={7} />
                              </span>
                              <span className="rounded px-1" style={{ fontSize: 7, border: '1px solid #ffc107', color: '#856404' }}>
                                Fill <MaterialIcon name="warning" size={7} />
                              </span>
                            </span>
                          </Pulse>
                        </Click>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEMO_MATRIX.rows.map(row => (
                    <tr key={row.ref}>
                      <td className="px-1 border" style={{ fontFamily: 'monospace', color: '#0d6efd' }}>
                        {row.ref} <MaterialIcon name="open_in_new" size={8} />
                      </td>
                      <td className="px-1 border">{row.tags.map(t => <Tag key={t}>{t}</Tag>)}</td>
                      {DEMO_COLLECTIONS.map(c => {
                        const st = STATUS[statusOf(row, c.name)]
                        const isCell = row.ref === posRef && c.name === collection
                        const hot = beat === 3 && isCell
                        return (
                          <td key={c.name} className="border" style={{
                            textAlign: 'center', background: st.bg,
                            outline: selected && isCell ? '2px solid #0d6efd' : undefined,
                            outlineOffset: -2,
                            transition: 'background .4s ease',
                          }}>
                            <Click on={hot}>
                              <Pulse on={hot}>
                                <MaterialIcon name={st.icon} size={12} style={{ color: st.color }} />
                              </Pulse>
                            </Click>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {beat === 2 && (
                <div className="rounded px-2 py-1 mt-2" style={{ background: '#f8f9fa', fontSize: 8, color: '#6c757d' }}>
                  <MaterialIcon name="remove" size={8} /> <strong>N/A</strong> is not a gap: the tags
                  don’t match, so this template was never expected here.
                </div>
              )}
            </div>

            {/* THE CELL DETAIL PANEL — on the right, only once a cell is selected */}
            {beat >= 4 && (
              <Appear when>
                <div className="ps-2" style={{ width: 118, flexShrink: 0, borderLeft: '1px solid #dee2e6' }}>
                  <div className="fw-semibold" style={{ fontSize: 8 }}>{collection}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 7, color: '#0d6efd' }}>
                    {posRef} <MaterialIcon name="open_in_new" size={7} />
                  </div>
                  <div className="text-muted mb-1" style={{ fontSize: 7 }}>
                    {fixed ? '2' : '1'}/2 ingredients present
                  </div>

                  <div className="text-muted text-uppercase fw-semibold" style={{ fontSize: 6, letterSpacing: '.04em' }}>
                    Free issue
                  </div>
                  {kit.ingredients.map(i => {
                    const present = DEMO_MATRIX.present.includes(i.ref) || (fixed && i.ref === DEMO_MATRIX.missingRef)
                    const adding = beat === 4 && i.ref === DEMO_MATRIX.missingRef
                    return (
                      <div key={i.ref} className="d-flex align-items-center gap-1 border-bottom py-1" style={{ fontSize: 7 }}>
                        <MaterialIcon name={present ? 'check_circle' : 'radio_button_unchecked'} size={9}
                          style={{ color: present ? '#198754' : '#dc3545', flexShrink: 0, transition: 'color .4s ease' }} />
                        <span className="text-truncate" style={{ fontFamily: 'monospace', minWidth: 0, flex: 1 }}>
                          {i.ref}
                        </span>
                        {!present && (
                          <Click on={adding}>
                            <span className="rounded px-1" style={{ fontSize: 6, border: '1px solid #198754', color: '#198754' }}>
                              Add
                            </span>
                          </Click>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Appear>
            )}
          </div>
        )}
      </Stage>
      <Caption>
        {[
          'With no templates there is no matrix. A connector template is the thing you make first.',
          'A name, the TAGS that gate it, and its ingredients — each one either free-issued to site, or landing inside the wrapper.',
          'Rows are positions, columns are templates. Green complete, amber partial, red missing — and N/A means the tags never matched, so nothing is wrong.',
          'A02m is amber: it carries some of the kit, not all of it. Click the cell.',
          'The panel names exactly what is absent — the driver — and adds it from right there.',
          'One ingredient added, the cell goes green, and the count moves with it.',
          'The column headers do the whole column: Apply all for the missing ones, Fill for the partial ones — previewed first, and one undo.',
        ][beat]}
      </Caption>
    </>
  )
}

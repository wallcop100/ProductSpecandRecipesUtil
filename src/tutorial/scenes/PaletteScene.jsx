import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { Stage, Click, Pulse, Appear, Caption } from './atoms'
import { DEMO_WRAPPER, DEMO_RECIPE, DEMO_NEW_ROW } from '../demo-data'

/**
 * PaletteScene — the right-hand drawer, as it actually is.
 *
 * The first version drew a generic list of pills and invented tabs. The real drawer is 280px
 * on the right of the builder, and its ElementTypes tab (ElementPalette) is a specific thing:
 *
 *   tabs        ElementTypes · Templates · ★ · Like this   (Nav variant="tabs"), then a ✕
 *   mode        a full-width ButtonGroup: [ ET Ref | ⌕ Mfr + Code ] — the SAME elements,
 *               keyed differently. In Mfr+Code the card's headline becomes the product code
 *               and the groups become manufacturers.
 *   filter      FilterBar: a search box + a family select, then expand-all / collapse-all,
 *               and a green "＋ Add ElementType" link on the right.
 *   groups      chevron · FAMILY · (n) — collapsible, and force-opened while a search or a
 *               family filter is active.
 *   cards       DraggableETCard: an icon in a tinted pill, the ref in bold, a ★ on the right,
 *               a 3px accent down the left edge, and the Name underneath. Indented under its
 *               family. An "undefined" ref — used in a recipe but in neither the DB nor the
 *               spec — is amber-bordered and says "not in DB or spec".
 *
 * beats: 0 four tabs, and why the drawer only exists while a position is open
 *        1 ET Ref vs Mfr + Code — the same elements, two ways in
 *        2 search + family filter, which force the groups open
 *        3 a card: drag it, star it — and what an amber card means
 *        4 the other three tabs, and the one that REPLACES your recipe
 */

const TABS = ['ElementTypes', 'Templates', '★', 'Like this']
const ACCENT = '#6f42c1'
const FILL = '#f3effc'

/** A DraggableETCard replica. */
function Card({ etRef, name, flagged, starred, hot }) {
  return (
    <Click on={hot} style={{ width: '100%' }}>
      <div style={{
        width: '100%', marginLeft: 8, marginBottom: 3, padding: '3px 6px',
        border: `1px solid ${flagged ? '#f59e0b' : '#dee2e6'}`,
        borderLeft: flagged ? '1px solid #f59e0b' : `3px solid ${ACCENT}`,
        borderRadius: 4, background: flagged ? '#fffbeb' : '#fff', fontSize: 9,
      }}>
        <div className="d-flex align-items-center gap-1">
          <span className="d-inline-flex" style={{ background: FILL, borderRadius: 3, padding: '1px 3px' }}>
            <MaterialIcon name="category" size={10} style={{ color: ACCENT }} />
          </span>
          <span className="fw-semibold flex-grow-1 text-truncate" style={{ minWidth: 0 }}>{etRef}</span>
          <MaterialIcon name={starred ? 'star' : 'star_border'} size={11}
            style={{ color: starred ? '#f5a623' : '#ccc', transition: 'color .3s ease' }} />
        </div>
        {name && <div className="text-muted" style={{ fontSize: 8, marginLeft: 18 }}>{name}</div>}
        {flagged && <div style={{ fontSize: 7, color: '#b45309', marginLeft: 18 }}>not in DB or spec</div>}
      </div>
    </Click>
  )
}

function Group({ label, count, open, children }) {
  return (
    <div className="mb-1">
      <div className="d-flex align-items-center gap-1 text-uppercase text-muted fw-bold"
        style={{ fontSize: 7, letterSpacing: .5 }}>
        <MaterialIcon name={open ? 'expand_more' : 'chevron_right'} size={10} />
        <span>{label}</span>
        <span className="fw-normal">({count})</span>
      </div>
      {open && children}
    </div>
  )
}

export default function PaletteScene({ beat }) {
  const byCode = beat === 1
  const filtering = beat === 2
  const starred = beat >= 3
  const tab = beat === 4 ? 'Templates' : 'ElementTypes'

  const [wrapperRow] = DEMO_RECIPE
  const tape = DEMO_WRAPPER.internals[0]

  return (
    <>
      <Stage height={268}>
        {/* the drawer, on the right, exactly where it lives */}
        <div className="d-flex" style={{ height: '100%' }}>
          <div className="d-flex align-items-center justify-content-center text-muted"
            style={{ flex: 1, fontSize: 9, fontStyle: 'italic' }}>
            the recipe you are filling
          </div>

          <div style={{
            width: 190, flexShrink: 0, background: '#fff',
            borderLeft: '1px solid #dee2e6', display: 'flex', flexDirection: 'column',
          }}>
            {/* tabs */}
            <div className="d-flex align-items-center px-1 pt-1" style={{ borderBottom: '1px solid #dee2e6' }}>
              {TABS.map(t => {
                const on = t === tab
                return (
                  <Click key={t} on={beat === 4 && t === 'Templates'}>
                    <span className="px-1 py-1" style={{
                      fontSize: 7, borderRadius: '4px 4px 0 0',
                      border: on ? '1px solid #dee2e6' : '1px solid transparent',
                      borderBottom: on ? '1px solid #fff' : 'none',
                      marginBottom: -1,
                      color: on ? '#495057' : '#0d6efd',
                      background: on ? '#fff' : 'transparent',
                    }}>{t}</span>
                  </Click>
                )
              })}
              <MaterialIcon name="close" size={11} className="ms-auto me-1" style={{ color: '#888' }} />
            </div>

            {tab === 'ElementTypes' ? (
              <div className="px-1 pt-1" style={{ flex: 1, minHeight: 0 }}>
                {/* the mode toggle — the same elements, keyed two ways */}
                <Click on={beat === 1}>
                  <Pulse on={beat === 1} style={{ width: '100%' }}>
                    <div className="d-flex mb-1" style={{ width: '100%', fontSize: 7 }}>
                      <span className="px-1 py-1" style={{
                        flex: 1, textAlign: 'center', borderRadius: '3px 0 0 3px',
                        background: byCode ? '#fff' : '#0d6efd',
                        color: byCode ? '#6c757d' : '#fff',
                        border: '1px solid #0d6efd',
                        transition: 'background .3s ease, color .3s ease',
                      }}>ET Ref</span>
                      <span className="px-1 py-1 d-inline-flex align-items-center justify-content-center gap-1" style={{
                        flex: 1, borderRadius: '0 3px 3px 0',
                        background: byCode ? '#0d6efd' : '#fff',
                        color: byCode ? '#fff' : '#6c757d',
                        border: '1px solid #0d6efd',
                        transition: 'background .3s ease, color .3s ease',
                      }}>
                        <MaterialIcon name="category_search" size={9} /> Mfr + Code
                      </span>
                    </div>
                  </Pulse>
                </Click>

                {/* FilterBar: search + family, then expand/collapse and Add ElementType */}
                <Click on={filtering}>
                  <Pulse on={filtering} style={{ width: '100%' }}>
                    <div className="rounded px-1 mb-1" style={{
                      width: '100%', border: `1px solid ${filtering ? '#0d6efd' : '#dee2e6'}`,
                      fontSize: 7, color: filtering ? '#212529' : '#adb5bd',
                    }}>
                      {filtering ? 'TAPE' : 'Search elements…'}
                    </div>
                  </Pulse>
                </Click>
                <div className="d-flex align-items-center gap-1 mb-1" style={{ fontSize: 7 }}>
                  <span className="rounded px-1" style={{ border: '1px solid #dee2e6', color: '#adb5bd' }}>
                    All families
                  </span>
                  <MaterialIcon name="unfold_more" size={10} style={{ color: '#6c757d' }} />
                  <MaterialIcon name="unfold_less" size={10} style={{ color: '#6c757d' }} />
                  <span className="ms-auto d-inline-flex align-items-center gap-1" style={{ color: '#198754' }}>
                    <MaterialIcon name="add_circle" size={9} /> Add ElementType
                  </span>
                </div>

                {/* groups + cards */}
                {filtering ? (
                  <Appear when>
                    <Group label="ET-LIN-COMPONENTS" count={1} open>
                      <Card etRef={tape.ref} name={tape.desc} />
                    </Group>
                  </Appear>
                ) : (
                  <>
                    <Group label="ET-LIN-COMPONENTS" count={2} open>
                      <Card etRef={byCode ? 'LL240272024' : tape.ref} name={byCode ? tape.ref : tape.desc} />
                      <Card etRef={wrapperRow.ref} name="Linear wrapper" starred={starred} hot={beat === 3} />
                    </Group>
                    <Group label="ET-CABLE" count={1} open={beat !== 0}>
                      <Card etRef={DEMO_NEW_ROW.ref} name={DEMO_NEW_ROW.desc} flagged />
                    </Group>
                  </>
                )}
              </div>
            ) : (
              <Appear when>
                <div className="px-1 pt-1" style={{ fontSize: 8 }}>
                  <div className="rounded px-1 py-1 mb-1" style={{ border: '1px solid #dee2e6' }}>
                    <div className="fw-semibold">Local Downlight</div>
                    <div className="text-muted" style={{ fontSize: 7 }}>2 ingredients</div>
                  </div>
                  <div className="rounded px-1 py-1" style={{ background: '#fff3cd', border: '1px solid #f0e0a8', fontSize: 7, color: '#856404' }}>
                    <MaterialIcon name="warning" size={9} /> Applying a template <strong>REPLACES</strong> the
                    recipe. With rows already there, it asks first.
                  </div>
                </div>
              </Appear>
            )}
          </div>
        </div>
      </Stage>
      <Caption>
        {[
          'Four tabs on the right: ElementTypes, Templates, ★ Favourites, and “Like this”. It is a drawer of things to pull INTO the open recipe.',
          'ET Ref or Mfr + Code — the same elements, two ways in. By code, the headline becomes the product code and the groups become manufacturers.',
          'Search and the family filter narrow it, and force the groups open so nothing hides in a collapsed header.',
          'Drag a card onto a recipe section, or star it — favourites follow you across projects. Amber means the ref is used in a recipe but is in neither the DB nor the spec.',
          'Templates REPLACE the whole recipe, so they ask first. “Like this” is the other way in: borrow rows from a comparable position.',
        ][beat]}
      </Caption>
    </>
  )
}

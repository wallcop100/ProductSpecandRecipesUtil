import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import EntityPill from '../../components/EntityPill'
import { Stage, Cursor, Pulse, Appear, MiniRow, Caption } from './atoms'

/**
 * PaletteScene — the right-hand drawer: the four SOURCES you pull into a recipe.
 *
 * beats: 0 the four tabs named
 *        1 an ElementType flies from the palette into the recipe
 *        2 a template applies — and REPLACES the recipe (the warning beat)
 *        3 the star saves a favourite (cross-project)
 *        4 "Like this" borrows a row from a comparable position
 */
export default function PaletteScene({ beat }) {
  const TABS = ['ElementTypes', 'Templates', '★', 'Like this']
  const activeTab = { 0: -1, 1: 0, 2: 1, 3: 2, 4: 3 }[beat]
  const cursorAt = { 1: { x: 210, y: 78 }, 2: { x: 250, y: 78 }, 3: { x: 290, y: 108 }, 4: { x: 260, y: 108 } }[beat]

  return (
    <>
      <Stage>
        <div className="d-flex gap-2" style={{ height: '100%' }}>
          {/* the recipe being built */}
          <div style={{ flex: 1 }}>
            <div className="text-muted mb-1" style={{ fontSize: 9, textTransform: 'uppercase' }}>D01 recipe</div>
            <MiniRow dim={beat === 2}>
              <EntityPill type="ElementType" label="ET-DL-01" />
            </MiniRow>
            <Appear when={beat === 1}>
              <MiniRow active style={{ borderColor: '#198754' }}>
                <EntityPill type="ElementType" label="ET-SOCK-3P" />
                <span className="badge ms-auto" style={{ background: '#198754', fontSize: 8 }}>added</span>
              </MiniRow>
            </Appear>
            {beat === 2 && (
              <Appear when>
                <div className="rounded px-2 py-1 mb-1" style={{ background: '#fff3cd', border: '1px solid #f0e0a8', fontSize: 9, color: '#856404' }}>
                  <MaterialIcon name="warning" size={10} /> Applying a template REPLACES the recipe — it confirms first.
                </div>
                <MiniRow active><EntityPill type="ElementType" label="ET-DL-01" /><span className="text-muted" style={{ fontSize: 9 }}>from template</span></MiniRow>
                <MiniRow active><EntityPill type="ElementType" label="ET-COLLAR-01" /><span className="text-muted" style={{ fontSize: 9 }}>from template</span></MiniRow>
              </Appear>
            )}
            <Appear when={beat === 4}>
              <MiniRow active style={{ borderColor: '#198754' }}>
                <EntityPill type="ElementType" label="ET-SR-01" />
                <span className="text-muted" style={{ fontSize: 9 }}>borrowed from L01</span>
              </MiniRow>
            </Appear>
          </div>

          {/* the drawer */}
          <div style={{ width: 170, borderLeft: '1px solid #dee2e6', paddingLeft: 8 }}>
            <div className="d-flex gap-1 mb-2" style={{ fontSize: 8 }}>
              {TABS.map((t, i) => (
                <Pulse key={t} on={beat === 0}>
                  <span className="rounded px-1 py-1" style={{
                    background: i === activeTab ? '#e7f1ff' : '#f8f9fa',
                    color: i === activeTab ? '#084298' : '#6c757d',
                    border: `1px solid ${i === activeTab ? '#b6d4fe' : '#e9ecef'}`,
                    transition: 'background .3s ease',
                  }}>{t}</span>
                </Pulse>
              ))}
            </div>
            {(beat === 0 || beat === 1) && (
              <>
                <MiniRow><EntityPill type="ElementType" label="ET-SOCK-3P" /></MiniRow>
                <MiniRow><EntityPill type="ElementType" label="ET-SR-01" /></MiniRow>
              </>
            )}
            {beat === 2 && <MiniRow><MaterialIcon name="dashboard_customize" size={12} /><span style={{ fontSize: 9 }}>Local Downlight</span></MiniRow>}
            {beat === 3 && (
              <MiniRow>
                <EntityPill type="ElementType" label="ET-SOCK-3P" />
                <Pulse on style={{ marginLeft: 'auto' }}>
                  <MaterialIcon name="star" size={14} style={{ color: '#ffc107' }} />
                </Pulse>
              </MiniRow>
            )}
            {beat === 4 && (
              <MiniRow>
                <EntityPill type="PositionType" label="L01" />
                <span className="text-muted" style={{ fontSize: 8 }}>same family</span>
              </MiniRow>
            )}
          </div>
        </div>
        <Cursor at={cursorAt} click={beat >= 1} />
      </Stage>
      <Caption>
        {[
          'Four sources: ElementTypes, Templates, Favourites, and positions Like this one.',
          'Drag an ElementType in — or click it — and it lands in the open section.',
          'Templates REPLACE the whole recipe, so a confirm stands in the way.',
          'The star saves a favourite. Favourites follow you across every project.',
          '"Like this" shows comparable positions — borrow a row, or their whole recipe.',
        ][beat]}
      </Caption>
    </>
  )
}

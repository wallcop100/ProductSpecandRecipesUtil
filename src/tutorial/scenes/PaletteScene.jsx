import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import EntityPill from '../../components/EntityPill'
import { Stage, Click, Pulse, Appear, MiniRow, Caption } from './atoms'

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

  return (
    <>
      <Stage>
        <div className="d-flex gap-2" style={{ height: '100%' }}>
          {/* the recipe being built */}
          <div style={{ flex: 1 }}>
            <div className="text-muted mb-1" style={{ fontSize: 9, textTransform: 'uppercase' }}>C01r recipe</div>
            <MiniRow dim={beat === 2}>
              <EntityPill type="ElementType" label="ET-LIN-01" />
            </MiniRow>
            <Appear when={beat === 1}>
              <MiniRow active style={{ borderColor: '#198754' }}>
                <EntityPill type="ElementType" label="ET-2Pin-LIN-Socket" />
                <span className="badge ms-auto" style={{ background: '#198754', fontSize: 8 }}>added</span>
              </MiniRow>
            </Appear>
            {beat === 2 && (
              <Appear when>
                <div className="rounded px-2 py-1 mb-1" style={{ background: '#fff3cd', border: '1px solid #f0e0a8', fontSize: 9, color: '#856404' }}>
                  <MaterialIcon name="warning" size={10} /> Applying a template REPLACES the recipe — it confirms first.
                </div>
                <MiniRow active><EntityPill type="ElementType" label="ET-LIN-01" /><span className="text-muted" style={{ fontSize: 9 }}>from template</span></MiniRow>
                <MiniRow active><EntityPill type="ElementType" label="ET-CCL-D-250-1CH-01" /><span className="text-muted" style={{ fontSize: 9 }}>from template</span></MiniRow>
              </Appear>
            )}
            <Appear when={beat === 4}>
              <MiniRow active style={{ borderColor: '#198754' }}>
                <EntityPill type="ElementType" label="LC2" />
                <span className="text-muted" style={{ fontSize: 9 }}>borrowed from C03r</span>
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
                <Click on={beat === 1}>
                  <MiniRow><EntityPill type="ElementType" label="ET-2Pin-LIN-Socket" /></MiniRow>
                </Click>
                <MiniRow><EntityPill type="ElementType" label="LC2" /></MiniRow>
              </>
            )}
            {beat === 2 && (
              <Click on>
                <MiniRow><MaterialIcon name="dashboard_customize" size={12} /><span style={{ fontSize: 9 }}>Local Downlight</span></MiniRow>
              </Click>
            )}
            {beat === 3 && (
              <MiniRow>
                <EntityPill type="ElementType" label="ET-2Pin-LIN-Socket" />
                <span className="ms-auto">
                  <Click on><Pulse on><MaterialIcon name="star" size={14} style={{ color: '#ffc107' }} /></Pulse></Click>
                </span>
              </MiniRow>
            )}
            {beat === 4 && (
              <Click on>
                <MiniRow>
                  <EntityPill type="PositionType" label="C03r" />
                  <span className="text-muted" style={{ fontSize: 8 }}>same family</span>
                </MiniRow>
              </Click>
            )}
          </div>
        </div>
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

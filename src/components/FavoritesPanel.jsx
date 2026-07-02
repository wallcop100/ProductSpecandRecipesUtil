import React, { useState } from 'react'
import { Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import EntityPill from './EntityPill'
import TagBadge from './TagBadge'

/**
 * FavoritesPanel — the user's cross-project "pot": favourite templates
 * (global-scope), tags, and element types (with product spec). Each item is
 * drawable into the active position. Lives in the BuilderScreen right drawer.
 */
export default function FavoritesPanel() {
  const favorites = useStore(s => s.favorites)
  const templates = useStore(s => s.templates)
  const activePositionRef = useStore(s => s.activePositionRef)
  const removeFavorite = useStore(s => s.removeFavorite)
  const addFavorite = useStore(s => s.addFavorite)
  const drawFavoriteElement = useStore(s => s.drawFavoriteElement)
  const togglePositionTag = useStore(s => s.togglePositionTag)
  const applyConnectorTemplate = useStore(s => s.applyConnectorTemplate)

  const [tagInput, setTagInput] = useState('')

  const globalTemplates = templates.filter(t => t.scope === 'global')
  const elementFavs = favorites.filter(f => f.kind === 'element')
  const tagFavs = favorites.filter(f => f.kind === 'tag')

  const noTarget = !activePositionRef
  const targetHint = noTarget ? 'Select a position first' : `Add to ${activePositionRef}`

  function addTagFav() {
    const t = tagInput.trim()
    if (!t) return
    addFavorite({ kind: 'tag', ref: t, label: t })
    setTagInput('')
  }

  return (
    <div style={{ padding: '0.5rem 0.75rem', fontSize: 12 }}>
      {noTarget && (
        <div className="alert alert-light border py-1 px-2 mb-2" style={{ fontSize: 11 }}>
          Select a position to draw favourites into it.
        </div>
      )}

      {/* Templates (global library) */}
      <Section icon="dashboard_customize" title={`Templates (${globalTemplates.length})`}>
        {globalTemplates.length === 0 && <Empty>Save a template to your library to see it here.</Empty>}
        {globalTemplates.map(t => (
          <Row key={t.id}
            onDraw={() => !noTarget && applyConnectorTemplate(activePositionRef, t.id)}
            drawTitle={targetHint} noTarget={noTarget}
          >
            <MaterialIcon name="dashboard_customize" size={14} className="text-primary" />
            <span className="text-truncate">{t.name}</span>
          </Row>
        ))}
      </Section>

      {/* Element types with spec */}
      <Section icon="widgets" title={`Elements (${elementFavs.length})`}>
        {elementFavs.length === 0 && <Empty>Star an element in the palette to save it here.</Empty>}
        {elementFavs.map(f => (
          <Row key={f.id}
            onDraw={() => !noTarget && drawFavoriteElement(activePositionRef, f)}
            onRemove={() => removeFavorite(f.id)}
            drawTitle={targetHint} noTarget={noTarget}
          >
            <EntityPill type="ElementType" label={f.ref} sublabel={f.data?.family} stack />
            {(f.data?.ProductCode || f.data?.Manufacturer) && (
              <span className="text-muted text-truncate" style={{ fontSize: 10 }}>
                {[f.data?.ProductCode, f.data?.Manufacturer].filter(Boolean).join(' · ')}
              </span>
            )}
          </Row>
        ))}
      </Section>

      {/* Tags */}
      <Section icon="sell" title={`Tags (${tagFavs.length})`}>
        <div className="d-flex gap-1 mb-2">
          <Form.Control
            size="sm" placeholder="Favourite a tag…" value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTagFav() }}
            style={{ fontSize: 11 }}
          />
          <Button size="sm" variant="outline-secondary" style={{ fontSize: 11 }} onClick={addTagFav}>Add</Button>
        </div>
        {tagFavs.map(f => (
          <Row key={f.id}
            onDraw={() => !noTarget && togglePositionTag(activePositionRef, f.ref)}
            onRemove={() => removeFavorite(f.id)}
            drawTitle={noTarget ? targetHint : `Toggle "${f.ref}" on ${activePositionRef}`}
            noTarget={noTarget}
          >
            <TagBadge tag={f.ref} />
          </Row>
        ))}
      </Section>
    </div>
  )
}

function Section({ icon, title, children }) {
  return (
    <div className="mb-3">
      <div className="d-flex align-items-center gap-1 text-uppercase text-muted fw-bold mb-1"
        style={{ fontSize: 10, letterSpacing: 0.5 }}>
        <MaterialIcon name={icon} size={13} />
        <span>{title}</span>
      </div>
      {children}
    </div>
  )
}

function Empty({ children }) {
  return <div className="text-muted fst-italic" style={{ fontSize: 11 }}>{children}</div>
}

function Row({ children, onDraw, onRemove, drawTitle, noTarget }) {
  return (
    <div className="d-flex align-items-center gap-2 mb-1 px-1 py-1 rounded"
      style={{ border: '1px solid #eee', background: '#fff' }}>
      <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ minWidth: 0 }}>{children}</div>
      <button className="btn btn-link p-0" style={{ color: noTarget ? '#ccc' : '#0d6efd', lineHeight: 1 }}
        title={drawTitle} disabled={noTarget} onClick={onDraw}>
        <MaterialIcon name="add_circle" size={16} />
      </button>
      {onRemove && (
        <button className="btn btn-link p-0 text-muted" style={{ lineHeight: 1 }} title="Remove from favourites" onClick={onRemove}>
          <MaterialIcon name="close" size={14} />
        </button>
      )}
    </div>
  )
}

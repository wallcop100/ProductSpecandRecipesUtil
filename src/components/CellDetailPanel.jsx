import React, { useMemo } from 'react'
import { Button, Badge, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { ACTION_ICONS } from '../utils/entityStyle'

const SECTION_LABEL = {
  position: 'position',
  dl_internal: 'DL',
  lin_internal: 'LIN',
}

function parseIngredients(collection) {
  if (!collection) return []
  if (Array.isArray(collection.Ingredients)) return collection.Ingredients
  try { return JSON.parse(collection.Ingredients || '[]') } catch { return [] }
}

function parseTags(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

/**
 * CellDetailPanel — live editor for one (position × collection) cell.
 * Shows each ingredient ref with its present/absent state and a per-ref
 * add/remove toggle, plus whole-collection Apply / Remove / Swap.
 *
 * Reads recipes from the store so it updates live as the user toggles refs.
 */
export default function CellDetailPanel({ posRef, collectionId, onClose, onSwap, onOpenPosition }) {
  const etCollections    = useStore(s => s.etCollections)
  const positionUI       = useStore(s => s.positionUI)
  const recipes          = useStore(s => s.recipes)
  const addCollectionRef    = useStore(s => s.addCollectionRef)
  const removeCollectionRef = useStore(s => s.removeCollectionRef)
  const applyCollection     = useStore(s => s.applyCollection)
  const removeCollection    = useStore(s => s.removeCollection)

  const collection = etCollections.find(c => c.CollectionId === collectionId)

  const tags = positionUI[posRef]?.tags ?? []
  const collTags = collection ? parseTags(collection.ApplicableTags) : []
  const applicable = collTags.length === 0 || collTags.some(t => tags.includes(t))

  // Active (non-deleted) refs present on this position
  const presentRefs = useMemo(() => {
    const set = new Set()
    for (const r of recipes) {
      if ((r.PositionTypeRef || r.positionTypeRef) !== posRef) continue
      if ((r.IsDeleted || r.isDeleted) === 'Y') continue
      const ref = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
      if (ref) set.add(ref)
    }
    return set
  }, [recipes, posRef])

  const ingredients = collection ? parseIngredients(collection) : []
  const presentCount = ingredients.filter(i => presentRefs.has((i.ElementTypeRef || i.slotLabel || '').toLowerCase())).length
  const missingCount = ingredients.length - presentCount

  if (!collection) {
    return (
      <div className="p-3 text-muted small">Template not found.</div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="d-flex align-items-start gap-2 px-3 py-2 border-bottom" style={{ flexShrink: 0 }}>
        <div className="flex-grow-1">
          <div className="fw-semibold" style={{ fontSize: 13 }}>{collection.Name}</div>
          <div
            onClick={() => onOpenPosition?.(posRef)}
            title="Open this position type in the builder"
            className="d-inline-flex align-items-center gap-1"
            style={{ fontFamily: 'monospace', fontSize: 11, color: '#0d6efd', cursor: 'pointer' }}
          >
            {posRef} <MaterialIcon name={ACTION_ICONS.external} size={13} />
          </div>
        </div>
        <Button variant="link" size="sm" className="p-0 text-muted" style={{ lineHeight: 1 }}
          onClick={onClose} title="Close" aria-label="Close"><MaterialIcon name="close" size={18} /></Button>
      </div>

      {/* Applicability note */}
      <div className="px-3 pt-2" style={{ flexShrink: 0 }}>
        {applicable ? (
          <div className="small text-muted mb-1">
            {presentCount}/{ingredients.length} ingredients present
          </div>
        ) : (
          <div className="alert alert-secondary py-1 px-2 mb-2" style={{ fontSize: 11 }}>
            Tags don't match this position — you can still apply manually.
          </div>
        )}
      </div>

      {/* Ingredient list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
        {ingredients.length === 0 && (
          <div className="text-muted small py-2">This template has no ingredients.</div>
        )}
        {ingredients.map((ing, idx) => {
          const ref = ing.ElementTypeRef || ing.slotLabel || ''
          const present = presentRefs.has(ref.toLowerCase())
          const section = ing.section || 'position'
          return (
            <div
              key={`${ref}-${idx}`}
              className="d-flex align-items-center gap-2 py-1 border-bottom"
              style={{ fontSize: 12 }}
            >
              <span
                title={present ? 'Present in recipe' : 'Not in recipe'}
                style={{ color: present ? '#198754' : '#dc3545', width: 16, textAlign: 'center' }}
              >
                <MaterialIcon name={present ? ACTION_ICONS.complete : ACTION_ICONS.incomplete} size={14} />
              </span>
              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ref}
                </div>
                <Badge bg="light" text="dark" style={{ fontSize: 9 }}>{SECTION_LABEL[section] || section}</Badge>
              </div>
              {present ? (
                <Button size="sm" variant="outline-danger" style={{ fontSize: 10, padding: '1px 7px' }}
                  onClick={() => removeCollectionRef(posRef, ref)} title="Soft-delete this ref from the recipe">
                  Remove
                </Button>
              ) : (
                <Button size="sm" variant="outline-success" style={{ fontSize: 10, padding: '1px 7px' }}
                  onClick={() => addCollectionRef(posRef, ref, section, ing.quantity ?? 1)} title="Add this ref to the recipe">
                  + Add
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {/* Bulk actions */}
      <div className="border-top px-3 py-2 d-flex flex-column gap-2" style={{ flexShrink: 0 }}>
        <div className="d-flex gap-2">
          <Button size="sm" variant="success" className="flex-grow-1" style={{ fontSize: 11 }}
            disabled={missingCount === 0}
            onClick={() => applyCollection(posRef, collectionId)}>
            Apply all missing{missingCount > 0 ? ` (${missingCount})` : ''}
          </Button>
          <Button size="sm" variant="outline-danger" className="flex-grow-1" style={{ fontSize: 11 }}
            disabled={presentCount === 0}
            onClick={() => removeCollection(posRef, collectionId)}>
            Remove all{presentCount > 0 ? ` (${presentCount})` : ''}
          </Button>
        </div>
        <Button size="sm" variant="outline-secondary" style={{ fontSize: 11 }}
          onClick={() => onSwap(posRef, collectionId)}>
          Swap for another template…
        </Button>
      </div>
    </div>
  )
}

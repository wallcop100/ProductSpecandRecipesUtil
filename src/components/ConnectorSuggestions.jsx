import React, { useMemo } from 'react'
import { Button, Dropdown } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { connectorGapsForPosition } from '../utils/collectionStatus'
import { membership } from '../utils/connectorGroups'
import { C } from '../styles/tokens'

/**
 * ConnectorSuggestions — reactive connector guidance for a position.
 *
 * Sourced entirely from the user's Connector Templates (the same templates the
 * matrix uses): every suggested ref is a real ref the user put in a template —
 * nothing is guessed or hardcoded.
 *
 * A gap now says WHY it is a gap, because "not there" and "in the wrong place" want
 * different fixes:
 *   missing   — add it, in the slot the template asks for
 *   misplaced — the ref is present but in the wrong context: move it, don't add a
 *               second copy (which is what a flat ref check used to leave you doing)
 *   short     — present, but under the required quantity: raise it
 *   blocked   — belongs inside a wrapper, and the position has no design element.
 *               No button: adding it would write a blank ContextRef.
 */

const STYLE = {
  missing:   { icon: 'add_circle',  action: 'Add',   variant: 'outline-primary' },
  misplaced: { icon: 'move_down',   action: 'Move',  variant: 'outline-warning' },
  short:     { icon: 'exposure_plus_1', action: 'Raise', variant: 'outline-primary' },
}

const Dots = React.forwardRef(({ onClick }, ref) => (
  <button ref={ref} type="button" className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 13, lineHeight: 1 }}
    aria-label="More" title="More" onClick={e => { e.preventDefault(); onClick(e) }}>⋯</button>
))

export default function ConnectorSuggestions({ posRef }) {
  const recipes = useStore(s => s.recipes)
  const etCollections = useStore(s => s.etCollections)
  const positionUI = useStore(s => s.positionUI)
  const containerETRefs = useStore(s => s.containerETRefs)
  const addRecipeRow = useStore(s => s.addRecipeRow)
  const moveRecipeRowToSection = useStore(s => s.moveRecipeRowToSection)
  const updateRecipeRow = useStore(s => s.updateRecipeRow)

  const connectorPins = useStore(s => s.connectorPins)
  const connectorExcludes = useStore(s => s.connectorExcludes)

  const gaps = useMemo(() => {
    const recOf = useStore.getState()._templateRecOf()
    const member = membership([posRef], etCollections, connectorPins, recOf, connectorExcludes).get(posRef)
    return connectorGapsForPosition(recipes, posRef, recOf(posRef), etCollections, containerETRefs, member)
  }, [recipes, posRef, positionUI, etCollections, containerETRefs, connectorPins, connectorExcludes])

  if (gaps.length === 0) return null

  function resolve(g) {
    if (g.blocked) return
    if (g.status === 'misplaced') moveRecipeRowToSection(posRef, g.rows[0]._id, g.section)
    else if (g.status === 'short') updateRecipeRow(posRef, g.rows[0]._id, { quantity: g.need, Quantity: g.need })
    else addRecipeRow(posRef, g.section, { elementTypeRef: g.ref, quantity: g.need }, { asPosition: true })
  }

  return (
    <div className="mb-3 px-3 py-2 rounded" style={{ background: C.attnTint, border: `1px solid ${C.attnTint}`, fontSize: 12 }}>
      <div className="fw-semibold mb-1 d-flex align-items-center" style={{ fontSize: 11, color: C.attnInk }}>
        Connector suggestions
        {/* The detail (which template, extras, switching it) is in the drawer's Connectors tab. */}
        <Button size="sm" variant="link" className="p-0 ms-auto" style={{ fontSize: 11 }} data-testid="connector-details"
          onClick={() => useStore.getState().setDrawerTab('connectors')}>details →</Button>
      </div>
      {gaps.map(g => {
        const s = STYLE[g.status] || STYLE.missing
        return (
          <div key={`${g.ref}|${g.section}|${g.status}`} className="d-flex align-items-center gap-2 py-1" data-testid="suggestion-connector-row" data-source="user-template">
            <MaterialIcon name={g.blocked ? 'block' : s.icon} size={13}
              style={{ color: g.blocked ? C.dangerInk : C.attnInk, flexShrink: 0 }} />
            <span style={{ flex: 1, color: g.blocked ? C.dangerInk : undefined }}>{g.label}</span>
            {g.blocked
              ? <span className="text-muted fst-italic" style={{ fontSize: 10 }}>fix the recipe first</span>
              : (
                <Button size="sm" variant={s.variant} style={{ fontSize: 11, padding: '0px 8px' }}
                  onClick={() => resolve(g)}>
                  {s.action}
                </Button>
              )}
            <Dropdown align="end">
              <Dropdown.Toggle as={Dots} />
              <Dropdown.Menu style={{ fontSize: 12 }}>
                <Dropdown.Item data-testid="report-suggestion" onClick={e => useStore.getState().requestBugNote(e.currentTarget.closest('[data-testid="suggestion-connector-row"]'))}>Report a problem with this suggestion…</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        )
      })}
    </div>
  )
}

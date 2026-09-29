import { useMemo } from 'react'
import useStore from '../store/useStore'
import { positionFamilyOf } from '../utils/positionFamily'
import { signatures, findGroups, membership, templateParts, signatureKey } from '../utils/connectorGroups'

/**
 * useConnectorGroups — the Connectors screen's view of the project as groups: every
 * in-scope position's connector signature, who belongs to which template (pins, then
 * filters), the groups not yet a template, and the clashes.
 */
export default function useConnectorGroups() {
  const positionTypes = useStore(s => s.positionTypes)
  const recipes = useStore(s => s.recipes)
  const positionUI = useStore(s => s.positionUI)
  const etCollections = useStore(s => s.etCollections)
  const connectorPins = useStore(s => s.connectorPins)
  const connectorExcludes = useStore(s => s.connectorExcludes)
  const ignoredPositionFamilies = useStore(s => s.ignoredPositionFamilies)
  const elementTypes = useStore(s => s.elementTypes)
  const connectorFamilies = useStore(s => s.connectorFamilies)

  return useMemo(() => {
    const ignoredFam = new Set(ignoredPositionFamilies || [])
    const scoped = positionTypes.filter(pt => !positionUI[pt.PositionTypeRef]?.ignored
      && !(ignoredFam.size && ignoredFam.has(positionFamilyOf(pt))))
    const opts = useStore.getState()._connectorOpts()
    const sigs = signatures(scoped, recipes, opts)
    const refs = scoped.map(pt => pt.PositionTypeRef)
    const members = membership(refs, etCollections, connectorPins, r => positionUI[r]?.tags || [], connectorExcludes)
    const templateKeys = new Set(etCollections.map(c => signatureKey(templateParts(c))))
    const groups = findGroups(sigs, { exclude: templateKeys })
    const membersOf = id => refs.filter(r => members.get(r)?.templates.includes(id))
    const clashes = refs.filter(r => members.get(r)?.clash)
    return { scoped, sigs, members, groups, membersOf, clashes }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionTypes, recipes, positionUI, etCollections, connectorPins, connectorExcludes, ignoredPositionFamilies, elementTypes, connectorFamilies])
}

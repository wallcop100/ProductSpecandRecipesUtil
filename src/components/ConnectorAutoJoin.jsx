import { useEffect } from 'react'
import useStore from '../store/useStore'
import useConnectorGroups from './useConnectorGroups'
import { templateParts, signatureKey } from '../utils/connectorGroups'

/**
 * ConnectorAutoJoin — no questions asked: a position with no connector template whose
 * connectors are exactly one template's parts joins that template (pinned), in the
 * background. Not one you took out of it, and not when two templates fit (that is
 * yours to settle). Renders nothing.
 */
export default function ConnectorAutoJoin() {
  const groups = useConnectorGroups()
  const etCollections = useStore(s => s.etCollections)
  const excludes = useStore(s => s.connectorExcludes)
  useEffect(() => {
    if (!etCollections.length) return
    const byKey = new Map()
    for (const c of etCollections) {
      const parts = templateParts(c)
      if (!parts.length) continue
      const k = signatureKey(parts)
      byKey.set(k, [...(byKey.get(k) || []), c.CollectionId])
    }
    const joins = new Map()   // template → positions
    for (const [pos, parts] of groups.sigs) {
      if ((groups.members.get(pos)?.templates || []).length || groups.members.get(pos)?.pinnedTo) continue
      const ids = (byKey.get(signatureKey(parts)) || []).filter(id => !(excludes?.[id] || []).includes(pos))
      if (ids.length !== 1) continue
      joins.set(ids[0], [...(joins.get(ids[0]) || []), pos])
    }
    if (!joins.size) return
    ;(async () => { for (const [id, refs] of joins) await useStore.getState().pinPositions(id, refs) })()
  }, [groups, etCollections, excludes])
  return null
}

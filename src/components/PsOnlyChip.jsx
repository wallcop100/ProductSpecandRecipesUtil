import { useMemo } from 'react'
import useStore from '../store/useStore'
import { C } from '../styles/tokens'

const lc = s => String(s || '').toLowerCase()

/** lc refs a live Product Spec row names that the DesignDB lacks and no queued change adds (those show "New"). */
export function usePsOnlyRefs() {
  const psRows = useStore(s => s.psRows)
  const elementTypes = useStore(s => s.elementTypes)
  const dbCollectionRefs = useStore(s => s.dbCollectionRefs)
  const dbChanges = useStore(s => s.dbChanges)
  return useMemo(() => {
    const inDb = new Set([...elementTypes.filter(e => e._row_num != null).map(e => lc(e.ElementTypeRef || e.elementTypeRef)),
      ...(dbCollectionRefs || []).map(lc), ...(dbChanges || []).map(c => lc(c.elementTypeRef))])
    return new Set(psRows.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y').map(r => lc(r.ElementTypeRef || r.elementTypeRef))
      .filter(r => r && !inDb.has(r)))
  }, [psRows, elementTypes, dbCollectionRefs, dbChanges])
}

// `short` for a list row, where the full words would crush the ref.
export default function PsOnlyChip({ short = false }) {
  return (
    <span className="badge" style={{ background: C.attnTint, color: C.attnInk, border: `1px solid ${C.attn}`, fontSize: 9, flexShrink: 0 }}
      title="In the Product Spec, not a live ElementType in the DesignDB. The next patch adds it, unless the DesignDB marked it deleted: then undelete it there.">
      {short ? 'PS ✓ DB ✗' : 'Product Spec ✓ · DesignDB ✗'}
    </span>
  )
}

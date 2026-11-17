import { test, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import useStore from '../../src/store/useStore'
import { usePsOnlyRefs } from '../../src/components/PsOnlyChip'

test('a Product Spec ElementType queued for the DesignDB patch is New, not PS ✓ DB ✗', () => {
  useStore.setState({
    elementTypes: [], dbCollectionRefs: [],
    psRows: [{ ElementTypeRef: 'ET-NEW-01' }, { ElementTypeRef: 'ET-LOST-01' }],
    dbChanges: [{ elementTypeRef: 'ET-NEW-01', _isNew: true, updates: {} }],
  })
  const { result } = renderHook(() => usePsOnlyRefs())
  expect([...result.current]).toEqual(['et-lost-01'])
})

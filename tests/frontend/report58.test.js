// Report #58: a deleted ElementType must reach the DesignDB as IsDeleted='Y', even when the
// browser never loaded the DesignDB Elements sheet.
import { describe, test, expect } from 'vitest'
import useStore from '../../src/store/useStore.js'

describe('report 58', () => {
  test('deleteElementType queues IsDeleted for an ET the app has not loaded', () => {
    useStore.setState({ elementTypes: [], dbChanges: [], psRows: [] })
    useStore.getState().deleteElementType('ET-UNSEEN')
    expect(useStore.getState().dbChanges[0]).toMatchObject({ elementTypeRef: 'ET-UNSEEN', updates: { IsDeleted: 'Y' } })
  })
})

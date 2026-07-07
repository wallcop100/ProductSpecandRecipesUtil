import { describe, test, expect } from 'vitest'
import { buildPsScript, buildRsScript, buildDbScript } from '../../src/utils/patchScript.js'

describe('buildPsScript', () => {
  test('update writes changed fields by header, keyed on EntityRef', () => {
    const s = buildPsScript([
      { elementTypeRef: 'ET-DL-01', updates: { ProductCode: 'ABC-123', IsTBC: 'Y' }, before: {} },
    ])
    expect(s).toContain('const col: {[key: string]: number} = headerMap(Form);')
    expect(s).toContain('findByKey(Form,col,"EntityRef","ET-DL-01")')
    expect(s).toContain('setByHeader(Form,col,r,"ProductCode","ABC-123")')
    expect(s).toContain('setByHeader(Form,col,r,"IsTBC","Y")')
    expect(s).not.toContain('apR') // no appends
  })

  test('new row appends with an append cursor and EntityType', () => {
    const s = buildPsScript([
      { elementTypeRef: 'ET-NEW', _isNew: true, updates: { ProductCode: '0012' } },
    ])
    expect(s).toContain('let apR: number = lastRow(Form) + 1;')
    expect(s).toContain('setByHeader(Form,col,apR,"EntityRef","ET-NEW")')
    expect(s).toContain('setByHeader(Form,col,apR,"EntityType","ElementType")')
    // leading-zero product code stays a quoted string, not a bare number
    expect(s).toContain('setByHeader(Form,col,apR,"ProductCode","0012")')
    expect(s).toContain('apR++;')
  })

  test('soft-delete is an IsDeleted="Y" update', () => {
    const s = buildPsScript([
      { elementTypeRef: 'ET-OLD', updates: { IsDeleted: 'Y' }, before: {} },
    ])
    expect(s).toContain('setByHeader(Form,col,r,"IsDeleted","Y")')
  })

  test('created-then-deleted is a no-op (empty script)', () => {
    expect(buildPsScript([{ elementTypeRef: 'X', _isNew: true, updates: { IsDeleted: 'Y' } }])).toBe('')
  })

  test('empty registry → empty string', () => {
    expect(buildPsScript([])).toBe('')
  })
})

describe('buildDbScript', () => {
  test('targets the ElementTypes sheet keyed on Ref, no EntityType column', () => {
    const s = buildDbScript([{ elementTypeRef: 'ET-Z', _isNew: true, updates: { Name: 'Zed' } }])
    expect(s).toContain('const col: {[key: string]: number} = headerMap(ElementTypes);')
    expect(s).toContain('setByHeader(ElementTypes,col,apR,"Ref","ET-Z")')
    expect(s).toContain('setByHeader(ElementTypes,col,apR,"Name","Zed")')
    expect(s).not.toContain('EntityType')
  })
})

describe('buildRsScript', () => {
  const key = { ContextType: 'ElementType', ContextRef: 'ET-DL-01', RecipeIndex: 3, ElementTypeRef: 'ET-SOCK-5P' }

  test('update matches the composite key and sets changed fields (numbers bare)', () => {
    const s = buildRsScript([
      { _id: '1', positionTypeRef: 'P1', action: 'upsert',
        row: { _row_num: 5, ...key }, changedFields: { Quantity: 2 }, before: { ...key, Quantity: 1 } },
    ])
    expect(s).toContain('findWhere(Form,col,{"ContextType":"ElementType","ContextRef":"ET-DL-01","RecipeIndex":3,"EntityRef":"ET-SOCK-5P"})')
    expect(s).toContain('setByHeader(Form,col,r,"Quantity",2)') // bare number
  })

  test('append writes EntityType + mapped fields with a cursor', () => {
    const s = buildRsScript([
      { _id: '2', positionTypeRef: 'P1', action: 'upsert',
        row: { ContextType: 'ElementType', ContextRef: 'ET-DL-01', RecipeIndex: 7, elementTypeRef: 'ET-CLIP', quantity: 1 } },
    ])
    expect(s).toContain('let apR: number = lastRow(Form) + 1;')
    expect(s).toContain('setByHeader(Form,col,apR,"EntityType","ElementType")')
    expect(s).toContain('setByHeader(Form,col,apR,"EntityRef","ET-CLIP")')
    expect(s).toContain('setByHeader(Form,col,apR,"Quantity",1)')
    expect(s).toContain('apR++;')
  })

  test('delete tombstones the matched row', () => {
    const s = buildRsScript([
      { _id: '3', positionTypeRef: 'P1', action: 'delete', row: { ...key }, before: { ...key } },
    ])
    expect(s).toContain('findWhere(Form,col,')
    expect(s).toContain('setByHeader(Form,col,r,"IsDeleted","Y")')
  })

  test('unresolved template slots are skipped', () => {
    const s = buildRsScript([
      { _id: '4', positionTypeRef: 'P1', action: 'upsert', row: { resolved: false, slotKey: 'S', ContextType: 'PositionType', ContextRef: 'P1', RecipeIndex: 1, elementTypeRef: '' } },
    ])
    expect(s).toBe('')
  })

  test('two entries on the same natural key coalesce to one op', () => {
    const s = buildRsScript([
      { _id: 'a', positionTypeRef: 'P1', action: 'upsert', row: { _row_num: 9, ...key }, changedFields: { Quantity: 2 }, before: { ...key } },
      { _id: 'b', positionTypeRef: 'P1', action: 'upsert', row: { _row_num: 9, ...key }, changedFields: { Quantity: 5 }, before: { ...key } },
    ])
    expect(s).toContain('setByHeader(Form,col,r,"Quantity",5)') // last wins
    expect(s).not.toContain('"Quantity",2')
  })
})

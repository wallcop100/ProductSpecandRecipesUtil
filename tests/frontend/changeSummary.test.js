import { describe, test, expect } from 'vitest'
import { buildSummary, summaryMarkdown, fieldChanges } from '../../src/components/ChangeSummaryModal.jsx'

describe('buildSummary', () => {
  const psChanges = [
    { elementTypeRef: 'ET-A', _isNew: true, updates: {} },
    { elementTypeRef: 'ET-B', updates: { IsDeleted: 'Y' } },
    { elementTypeRef: 'ET-C', updates: { Name: 'x' }, before: { Name: 'y' } },
  ]
  const rsChanges = [
    { _id: '1', positionTypeRef: 'P1', action: 'upsert', row: { ElementTypeRef: 'ET-NEW' } },              // append → new
    { _id: '2', positionTypeRef: 'P1', action: 'upsert', row: { _row_num: 5, ElementTypeRef: 'ET-CHG' }, changedFields: { Quantity: 2 } },
    { _id: '3', positionTypeRef: 'P1', action: 'upsert', row: { _row_num: 6, ElementTypeRef: 'ET-DEL' }, changedFields: { IsDeleted: 'Y' } },
    { _id: '4', positionTypeRef: 'P2', action: 'delete', row: { ElementTypeRef: 'ET-GONE' } },
  ]

  // Export always emits all three files; there is no per-file scope any more.
  test('one section per file that has changes, in order', () => {
    const dbChanges = [{ elementTypeRef: 'ET-Z', _isNew: true, updates: {} }]
    const sections = buildSummary({ psChanges, rsChanges, dbChanges })
    expect(sections.map(s => s.key)).toEqual(['ps', 'rs', 'db'])
  })

  test('action phrases per entity', () => {
    const sections = buildSummary({ psChanges, rsChanges })
    expect(sections.map(s => s.key)).toEqual(['ps', 'rs'])

    const ps = sections[0].lines
    expect(ps.find(l => l.ref === 'ET-A').detail).toBe('Spec added')
    expect(ps.find(l => l.ref === 'ET-B').detail).toBe('Marked IsDeleted')
    expect(ps.find(l => l.ref === 'ET-C').detail).toBe('Name updated')

    // the kind badge drives the icon/colour in the Changes tab
    expect(ps.find(l => l.ref === 'ET-A').kind).toBe('add')
    expect(ps.find(l => l.ref === 'ET-B').kind).toBe('delete')
    expect(ps.find(l => l.ref === 'ET-C').kind).toBe('update')

    const rs = sections[1].lines
    expect(rs.find(l => l.ref === 'P1').detail).toMatch(/\+1 added/)
    expect(rs.find(l => l.ref === 'P1').detail).toMatch(/−1 removed/)
    expect(rs.find(l => l.ref === 'P1').detail).toMatch(/~1 changed/)
    expect(rs.find(l => l.ref === 'P2').detail).toMatch(/−1 removed/)
  })

  test('recipe lines list the added/removed ET refs', () => {
    const rs = [
      { _id: '1', positionTypeRef: 'DL-RING-01', action: 'upsert', row: { ElementTypeRef: 'ET-SOCK-5P' } },
      { _id: '2', positionTypeRef: 'DL-RING-01', action: 'upsert', row: { ElementTypeRef: 'ET-SR' } },
      { _id: '3', positionTypeRef: 'DL-RING-01', action: 'delete', row: { ElementTypeRef: 'ET-PLUG-2P' } },
    ]
    const line = buildSummary({ rsChanges: rs })[0].lines[0]
    expect(line.detail).toBe('+2 added (ET-SOCK-5P, ET-SR), −1 removed (ET-PLUG-2P)')
  })

  test('TBC + product code reads as phrases', () => {
    const ps = [{ elementTypeRef: 'ET-DL-01', updates: { ProductCode: 'ABC', IsTBC: 'Y' }, before: {} }]
    expect(buildSummary({ psChanges: ps })[0].lines[0].detail).toBe('Marked TBC, Product code set')
  })

  test('markdown mirrors the lines', () => {
    const md = summaryMarkdown(buildSummary({ psChanges, rsChanges }))
    expect(md).toContain('## Change summary')
    expect(md).toContain('- **ET-B** — Marked IsDeleted')
  })

  test('empty registries produce no sections', () => {
    expect(buildSummary({})).toHaveLength(0)
    expect(buildSummary()).toHaveLength(0)
  })
})

describe('fieldChanges — the before → after the Changes tab shows', () => {
  test('an updated field carries both values', () => {
    const rows = fieldChanges({ updates: { Name: 'New name' }, before: { Name: 'Old name' } })
    expect(rows).toEqual([{ field: 'Name', label: 'Name', from: 'Old name', to: 'New name', flag: false }])
  })

  test('a set-from-blank has no "from"', () => {
    const rows = fieldChanges({ _isNew: true, updates: { Details: 'XAL 011' }, before: {} })
    expect(rows[0]).toMatchObject({ label: 'Details', from: '', to: 'XAL 011' })
  })

  test('a cleared field has no "to"', () => {
    const rows = fieldChanges({ updates: { Manufacturer: '' }, before: { Manufacturer: 'Acme' } })
    expect(rows[0]).toMatchObject({ label: 'Manufacturer', from: 'Acme', to: '' })
  })

  test('a no-op (same value) is not a change', () => {
    expect(fieldChanges({ updates: { Name: 'same' }, before: { Name: 'same' } })).toEqual([])
  })

  test('the ref itself is never a field change', () => {
    expect(fieldChanges({ updates: { ElementTypeRef: 'ET-X', Name: 'n' }, before: {} }).map(r => r.field)).toEqual(['Name'])
  })

  test('ParentRef is labelled from the DesignDB column, Details from its own', () => {
    const rows = fieldChanges({ updates: { Family: 'ET-PS', Details: 'X 1' }, before: {} })
    expect(rows.find(r => r.field === 'Family').label).toBe('ParentRef')
    expect(rows.find(r => r.field === 'Details').label).toBe('Details')
  })

  test('flags are marked so the UI can render them differently', () => {
    expect(fieldChanges({ updates: { IsTBC: 'Y' }, before: {} })[0]).toMatchObject({ label: 'TBC', flag: true })
  })
})

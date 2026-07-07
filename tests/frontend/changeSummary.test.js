import { describe, test, expect } from 'vitest'
import { buildSummary, summaryMarkdown } from '../../src/components/ChangeSummaryModal.jsx'

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

  test('export scope: action phrases per entity', () => {
    const sections = buildSummary({ psChanges, rsChanges }, 'export')
    expect(sections).toHaveLength(2)

    const ps = sections[0].lines
    expect(ps.find(l => l.ref === 'ET-A').detail).toBe('Spec added')
    expect(ps.find(l => l.ref === 'ET-B').detail).toBe('Marked IsDeleted')
    expect(ps.find(l => l.ref === 'ET-C').detail).toBe('Name updated')

    const rs = sections[1].lines
    // P1: one append, one field-change, one soft-delete
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
    const line = buildSummary({ rsChanges: rs }, 'export')[0].lines[0]
    expect(line.detail).toBe('+2 added (ET-SOCK-5P, ET-SR), −1 removed (ET-PLUG-2P)')
  })

  test('TBC + product code reads as phrases', () => {
    const ps = [{ elementTypeRef: 'ET-DL-01', updates: { ProductCode: 'ABC', IsTBC: 'Y' }, before: {} }]
    expect(buildSummary({ psChanges: ps }, 'export')[0].lines[0].detail).toBe('Marked TBC, Product code set')
  })

  test('db scope only reads dbChanges', () => {
    const sections = buildSummary({ psChanges, rsChanges, dbChanges: [{ elementTypeRef: 'ET-Z', _isNew: true }] }, 'db')
    expect(sections).toHaveLength(1)
    expect(sections[0].lines).toHaveLength(1)
    expect(sections[0].lines[0].ref).toBe('ET-Z')
  })

  test('markdown mirrors the lines', () => {
    const md = summaryMarkdown(buildSummary({ psChanges, rsChanges }, 'export'), 'Product Spec & Recipe Spec')
    expect(md).toContain('## Change summary — Product Spec & Recipe Spec')
    expect(md).toContain('- **ET-B** — Marked IsDeleted')
  })

  test('empty registries produce no sections', () => {
    expect(buildSummary({}, 'export')).toHaveLength(0)
  })
})

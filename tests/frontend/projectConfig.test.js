import { describe, it, expect } from 'vitest'
import { configItems, diffForPush, pickForPull, itemsToConfig, EXCLUDED_PREFS } from '../../src/platform/projectConfig'

const cfg = () => ({
  position_ui: [{ position_type_ref: 'L01', tags: ['x'], tag_add: [], tag_remove: [], user_notes: '', ignored: true }],
  templates: [{ id: 't1', name: 'Driver', scope: 'project', ingredients: [], updated_at: 'now', project_id: 3 }],
  slot_mappings: { t1: { drv: 'ET-DRV-01' } },
  collections: [{ CollectionId: 'c1', Name: 'Tape', UpdatedAt: 'now' }],
  prefs: { tag_rules: '[]', pending_db_changes: '[{"edit":1}]', form_import_draft: '{}', form_captures: '{}' },
  local_element_types: [{ ref: 'ET-L-01', family: 'ET-L' }],
  pending_changes: { ps: [{ edit: 1 }], rs: [] },
})

describe('project configuration', () => {
  it('never carries work in progress', () => {
    const items = configItems(cfg())
    expect(items.some(i => i.kind === 'cfg-pref' && EXCLUDED_PREFS.has(i.key))).toBe(false)
    expect(JSON.stringify(items)).not.toContain('edit')
    expect(items.map(i => i.kind).sort()).toEqual(['cfg-collection', 'cfg-position', 'cfg-pref', 'cfg-slot', 'cfg-template', 'local-et'])
  })
  it('ignores volatile fields, so an unchanged config sends nothing', () => {
    const { snap } = diffForPush(configItems(cfg()), {})
    const again = cfg(); again.templates[0].updated_at = 'later'; again.collections[0].UpdatedAt = 'later'
    expect(diffForPush(configItems(again), snap).items).toEqual([])
  })
  it('sends only what changed, and a tombstone for a deleted template', () => {
    const { snap } = diffForPush(configItems(cfg()), {})
    const next = cfg(); next.position_ui[0].ignored = false; next.templates = []; next.slot_mappings = {}
    const sent = diffForPush(configItems(next), snap).items
    expect(sent).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'cfg-position', key: 'L01', value: expect.objectContaining({ ignored: false }) }),
      { kind: 'cfg-template', key: 't1', value: { deleted: true } },
      { kind: 'cfg-slot', key: 't1|drv', value: { deleted: true } },
    ]))
    expect(sent).toHaveLength(3)
  })
  it('a renamed local ElementType leaves a tombstone, applied as a deletion', () => {
    const { snap } = diffForPush(configItems(cfg()), {})
    const next = cfg(); next.local_element_types = [{ ref: 'ET-L-02', family: 'ET-L' }]
    const sent = diffForPush(configItems(next), snap).items
    expect(sent).toEqual(expect.arrayContaining([
      { kind: 'local-et', key: 'ET-L-01', value: { deleted: true } },
      expect.objectContaining({ kind: 'local-et', key: 'ET-L-02' }),
    ]))
    expect(itemsToConfig(sent).deletes.localEts).toEqual(['ET-L-01'])
  })
  it('a pull never overwrites what this session changed but has not sent', () => {
    const { snap } = diffForPush(configItems(cfg()), {})
    const here = cfg(); here.position_ui[0].ignored = false                       // changed here
    const pulled = [
      { kind: 'cfg-position', key: 'L01', value: { tags: [], tag_add: [], tag_remove: [], user_notes: '', ignored: true } },
      { kind: 'cfg-template', key: 't1', value: { name: 'Driver v2' } },        // unchanged here
    ]
    const { apply, keep } = pickForPull(pulled, configItems(here), snap)
    expect(apply.map(i => i.key)).toEqual(['t1'])
    expect(keep).toHaveLength(1)
  })
  it('turns items back into an applicable config, with deletions apart', () => {
    const { cfg: c, deletes } = itemsToConfig([
      ...configItems(cfg()),
      { kind: 'cfg-template', key: 't9', value: { deleted: true } },
    ])
    expect(c.position_ui[0]).toMatchObject({ position_type_ref: 'L01', ignored: true })
    expect(c.slot_mappings).toEqual({ t1: { drv: 'ET-DRV-01' } })
    expect(c.prefs).toEqual({ tag_rules: '[]' })
    expect(c.templates[0].id).toBe('t1')
    expect(deletes.templates).toEqual(['t9'])
    expect(c.pending_changes).toBeUndefined()
  })
})

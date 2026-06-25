import { describe, test, expect } from 'vitest'
import { findBestTemplate, recipeToTemplate } from '../../src/utils/templateLoader.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const globalTemplates = [
  {
    id: 'DL+Local',
    scope: 'global',
    base_template_id: null,
    applicable_tags: '["DL","Local"]',
    ingredients: '[]',
    name: 'DL Local',
  },
  {
    id: 'DL+Local+TwinSpot',
    scope: 'global',
    base_template_id: null,
    applicable_tags: '["DL","Local","TwinSpot"]',
    ingredients: '[]',
    name: 'DL Local TwinSpot',
  },
  {
    id: 'DL+Remote-CC',
    scope: 'global',
    base_template_id: null,
    applicable_tags: '["DL","Remote-CC"]',
    ingredients: '[]',
    name: 'DL Remote CC',
  },
  {
    id: 'LIN+Tape+Profile',
    scope: 'global',
    base_template_id: null,
    applicable_tags: '["LIN","Local"]',
    ingredients: '[]',
    name: 'LIN Tape Profile',
  },
]

const projectTemplates = [
  {
    id: 'custom-1',
    scope: 'project',
    base_template_id: 'DL+Local',
    applicable_tags: '["DL","Local"]',
    ingredients: '[]',
    name: 'Custom DL Local',
  },
]

const allTemplates = [...globalTemplates, ...projectTemplates]

// ---------------------------------------------------------------------------
// findBestTemplate
// ---------------------------------------------------------------------------
describe('findBestTemplate', () => {
  test('project template overrides global with same applicable_tags', () => {
    const tags = ['DL', 'Local', '5Pin-DALI']
    const result = findBestTemplate(tags, allTemplates)

    // project template matches ["DL","Local"] — same tag count as global DL+Local
    expect(result).not.toBeNull()
    expect(result.scope).toBe('project')
    expect(result.id).toBe('custom-1')
  })

  test('most specific tag match wins (TwinSpot template beats Local template)', () => {
    const tags = ['DL', 'Local', 'TwinSpot', '5Pin-DALI']
    // Only global templates; project only has base DL+Local
    const result = findBestTemplate(tags, globalTemplates)

    // DL+Local+TwinSpot (3 tags) is more specific than DL+Local (2 tags)
    expect(result).not.toBeNull()
    expect(result.id).toBe('DL+Local+TwinSpot')
  })

  test('returns null if no template tags match position tags', () => {
    const tags = ['DL', 'Remote-CV']
    const result = findBestTemplate(tags, globalTemplates)

    expect(result).toBeNull()
  })

  test('partial tag subset: DL+Local template matches position with ["DL","Local","5Pin-DALI"]', () => {
    // DL+Local has 2 tags; position has 3 — still a valid subset match
    const tags = ['DL', 'Local', '5Pin-DALI']
    const result = findBestTemplate(tags, globalTemplates)

    expect(result).not.toBeNull()
    expect(result.applicable_tags).toEqual(expect.arrayContaining(['DL', 'Local']))
  })

  test('returns null for empty tag array', () => {
    const result = findBestTemplate([], allTemplates)
    expect(result).toBeNull()
  })

  test('returns null for null templates array', () => {
    const result = findBestTemplate(['DL', 'Local'], null)
    expect(result).toBeNull()
  })

  test('returns null for empty templates array', () => {
    const result = findBestTemplate(['DL', 'Local'], [])
    expect(result).toBeNull()
  })

  test('ingredients are parsed from JSON string before returning', () => {
    const tpl = {
      id: 'DL+Local+ingr',
      scope: 'global',
      applicable_tags: '["DL","Local"]',
      ingredients: '[{"slotKey":"DESIGN_ELEMENT","section":"position"}]',
      name: 'Test',
    }
    const result = findBestTemplate(['DL', 'Local'], [tpl])

    expect(Array.isArray(result.ingredients)).toBe(true)
    expect(result.ingredients[0].slotKey).toBe('DESIGN_ELEMENT')
  })

  test('applicable_tags is returned as parsed array', () => {
    const result = findBestTemplate(['DL', 'Local'], globalTemplates)
    expect(Array.isArray(result.applicable_tags)).toBe(true)
  })

  test('when no project override exists, best global wins', () => {
    const tags = ['DL', 'Remote-CC']
    const result = findBestTemplate(tags, globalTemplates)

    expect(result).not.toBeNull()
    expect(result.id).toBe('DL+Remote-CC')
  })

  test('template with no applicable_tags is skipped', () => {
    const tpl = {
      id: 'EMPTY',
      scope: 'global',
      applicable_tags: '[]',
      ingredients: '[]',
      name: 'Empty',
    }
    const result = findBestTemplate(['DL', 'Local'], [tpl])
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// recipeToTemplate
// ---------------------------------------------------------------------------
describe('recipeToTemplate', () => {
  const sampleRecipe = {
    position: [
      {
        elementTypeRef: 'ET-DL-SPOT-01',
        isDesign: 'Y',
        isContractItem: null,
        recipeIndex: 0,
        quantity: null,
      },
      {
        elementTypeRef: 'ET-SOCK-5P-01',
        isDesign: null,
        isContractItem: 'Y',
        recipeIndex: 1,
        quantity: null,
      },
    ],
    dlInternal: [
      {
        elementTypeRef: 'ET-DRIVER-CC-01',
        isDesign: null,
        isContractItem: 'Y',
        recipeIndex: 0,
        quantity: null,
      },
    ],
    linInternal: [],
  }

  test('converts recipe rows to slot definitions', () => {
    const tpl = recipeToTemplate(sampleRecipe, 'My Template', 'project')

    const ingredients = JSON.parse(tpl.ingredients)
    expect(ingredients).toHaveLength(3)
  })

  test('each ingredient has required fields', () => {
    const tpl = recipeToTemplate(sampleRecipe, 'My Template', 'project')
    const ingredients = JSON.parse(tpl.ingredients)

    for (const ing of ingredients) {
      expect(ing).toHaveProperty('slotKey')
      expect(ing).toHaveProperty('slotLabel')
      expect(ing).toHaveProperty('section')
      expect(ing).toHaveProperty('isDesign')
      expect(ing).toHaveProperty('isContractItem')
      expect(ing).toHaveProperty('fixed')
    }
  })

  test('assigns sequential slot keys where ET ref segment is not usable', () => {
    const recipe = {
      position: [
        { elementTypeRef: null, isDesign: 'Y', recipeIndex: 0, quantity: null },
      ],
      dlInternal: [],
      linInternal: [],
    }
    const tpl = recipeToTemplate(recipe, 'Fallback', 'project')
    const ingredients = JSON.parse(tpl.ingredients)

    expect(ingredients[0].slotKey).toMatch(/^SLOT_\d+$/)
  })

  test('ingredients are serialised as JSON string', () => {
    const tpl = recipeToTemplate(sampleRecipe, 'My Template', 'project')
    expect(typeof tpl.ingredients).toBe('string')
    expect(() => JSON.parse(tpl.ingredients)).not.toThrow()
  })

  test('template has id (uuid), name, scope, applicable_tags', () => {
    const tpl = recipeToTemplate(sampleRecipe, 'Test Template', 'project')

    expect(tpl.id).toBeDefined()
    expect(tpl.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
    expect(tpl.name).toBe('Test Template')
    expect(tpl.scope).toBe('project')
    expect(tpl.applicable_tags).toBe('[]')
  })

  test('scope defaults to project when not specified', () => {
    const tpl = recipeToTemplate(sampleRecipe, 'Default Scope')
    expect(tpl.scope).toBe('project')
  })

  test('section field is preserved on each ingredient', () => {
    const tpl = recipeToTemplate(sampleRecipe, 'Section Test', 'global')
    const ingredients = JSON.parse(tpl.ingredients)

    const positionIngs = ingredients.filter(i => i.section === 'position')
    const dlIngs = ingredients.filter(i => i.section === 'dl_internal')

    expect(positionIngs).toHaveLength(2)
    expect(dlIngs).toHaveLength(1)
  })

  test('fixed=true when quantity is explicitly set on source row', () => {
    const recipe = {
      position: [
        { elementTypeRef: 'ET-CAP-01', quantity: 2, recipeIndex: 0 },
      ],
      dlInternal: [],
      linInternal: [],
    }
    const tpl = recipeToTemplate(recipe, 'Fixed Test', 'project')
    const ingredients = JSON.parse(tpl.ingredients)

    expect(ingredients[0].fixed).toBe(true)
  })

  test('fixed=false when quantity is null on source row', () => {
    const tpl = recipeToTemplate(sampleRecipe, 'Not Fixed', 'project')
    const ingredients = JSON.parse(tpl.ingredients)

    // All rows in sampleRecipe have quantity: null
    expect(ingredients.every(i => i.fixed === false)).toBe(true)
  })

  test('applicable_tags defaults to "[]" when suggestedTags is omitted', () => {
    const tpl = recipeToTemplate(sampleRecipe, 'No Tags')
    expect(tpl.applicable_tags).toBe('[]')
  })

  test('suggestedTags are serialised into applicable_tags', () => {
    const tpl = recipeToTemplate(sampleRecipe, 'Tagged', 'project', ['DL', 'Local'])
    expect(tpl.applicable_tags).toBe('["DL","Local"]')
  })

  test('suggestedTags with many tags all appear in applicable_tags', () => {
    const tags = ['DL', 'Local', '5Pin-DALI', 'Adjustable']
    const tpl = recipeToTemplate(sampleRecipe, 'Many Tags', 'project', tags)
    const parsed = JSON.parse(tpl.applicable_tags)
    expect(parsed).toEqual(tags)
  })

  test('empty suggestedTags array produces applicable_tags "[]"', () => {
    const tpl = recipeToTemplate(sampleRecipe, 'Empty Tags', 'project', [])
    expect(tpl.applicable_tags).toBe('[]')
  })

  test('suggestedTags-tagged template is auto-matched by findBestTemplate', () => {
    const tpl = recipeToTemplate(sampleRecipe, 'Auto Match', 'project', ['DL', 'Local'])
    const result = findBestTemplate(['DL', 'Local', '5Pin-DALI'], [tpl])
    expect(result).not.toBeNull()
    expect(result.name).toBe('Auto Match')
  })
})

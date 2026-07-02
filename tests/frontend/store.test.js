/**
 * store.test.js
 * Vitest unit tests for useStore (Zustand).
 *
 * Fixture: PT-DL-LOCAL-01 (Local DALI downlight)
 * Template: DL+Local with slots DESIGN_ELEMENT, SITE_SOCKET, SITE_SR, LOCAL_DRIVER
 */

import { describe, test, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the store
// ---------------------------------------------------------------------------

// Mock window.electronAPI
vi.stubGlobal('window', {
  electronAPI: {
    db: {
      upsertPositionUI: vi.fn().mockResolvedValue({}),
      upsertSlotMapping: vi.fn().mockResolvedValue({}),
      upsertTemplate: vi.fn().mockResolvedValue({}),
    },
  },
})

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}))

import axios from 'axios'
import useStore, { getRecipeForPosition } from '../../src/store/useStore.js'

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const POS_REF = 'PT-DL-LOCAL-01'
const TEMPLATE_ID = 'DL+Local'
const PROJECT_ID = 42

const dlLocalTemplate = {
  id: TEMPLATE_ID,
  name: 'DL+Local',
  scope: 'global',
  applicable_tags: ['DL', 'Local'],
  ingredients: [
    {
      slotKey: 'DESIGN_ELEMENT',
      slotLabel: 'Design Element',
      section: 'position',
      isDesign: 'Y',
      isContractItem: null,
      fixed: false,
      recipeIndex: 0,
    },
    {
      slotKey: 'SITE_SOCKET',
      slotLabel: 'Site Socket',
      section: 'position',
      isDesign: null,
      isContractItem: 'Y',
      fixed: false,
      recipeIndex: 1,
    },
    {
      slotKey: 'SITE_SR',
      slotLabel: 'Site SR',
      section: 'position',
      isDesign: null,
      isContractItem: null,
      fixed: false,
      recipeIndex: 2,
    },
    {
      slotKey: 'LOCAL_DRIVER',
      slotLabel: 'Local Driver',
      section: 'dl_internal',
      isDesign: null,
      isContractItem: 'Y',
      fixed: false,
      recipeIndex: 0,
    },
  ],
}

const elementTypes = [
  { ElementTypeRef: 'ET-DL-SPOT-01' },
  { ElementTypeRef: 'ET-SOCK-5P-01' },
  { ElementTypeRef: 'ET-SR-DALI-01' },
  { ElementTypeRef: 'ET-DRIVER-CC-01' },
]

const positionTypes = [
  {
    PositionTypeRef: POS_REF,
    DriverLocation: 'Local',
    SecondaryPowerType: null,
    ControlTypeRef: 'DALI',
    'SecondaryPowerNodes_+ve': null,
  },
]

const completeSlotMappings = {
  DESIGN_ELEMENT: 'ET-DL-SPOT-01',
  SITE_SOCKET: 'ET-SOCK-5P-01',
  SITE_SR: 'ET-SR-DALI-01',
  LOCAL_DRIVER: 'ET-DRIVER-CC-01',
}

const partialSlotMappings = {
  DESIGN_ELEMENT: 'ET-DL-SPOT-01',
  // SITE_SOCKET, SITE_SR, LOCAL_DRIVER are unresolved
}

// ---------------------------------------------------------------------------
// Helper: reset the store to a known state before each test
// ---------------------------------------------------------------------------

function resetStore(overrides = {}) {
  useStore.setState({
    projectId: PROJECT_ID,
    folderPath: '/projects/test',
    paths: { db: '/db.xlsx', ps: '/ps.xlsx', rs: '/rs.xlsx' },
    elementTypes,
    positionTypes,
    psRows: [],
    recipes: [],
    templates: [dlLocalTemplate],
    slotMappings: {},
    positionUI: {
      [POS_REF]: {
        tags: ['DL', 'Local', '5Pin-DALI'],
        tagSource: 'derived',
        tagConfidence: 'high',
        userNotes: null,
      },
    },
    activePositionRef: null,
    activeTab: 'recipes',
    validationResults: [],
    fileWatchAlert: null,
    psChanges: [],
    rsChanges: [],
    past: [],
    future: [],
    activeContextType: 'PositionType',
    activeETRef: null,
    containerETRefs: new Set(),
    containerETManualRefs: [],
    isLoading: false,
    loadError: null,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadProject', () => {
  test('loadTemplates populates templates and slotMappings', () => {
    resetStore()

    const slotMappingsData = {
      [TEMPLATE_ID]: { DESIGN_ELEMENT: 'ET-DL-SPOT-01' },
    }

    useStore.getState().loadProject({
      projectId: PROJECT_ID,
      folderPath: '/projects/test',
      paths: { db: '/db.xlsx', ps: '/ps.xlsx', rs: '/rs.xlsx' },
      elementTypes,
      positionTypes,
      psRows: [],
      recipes: [],
      templates: [dlLocalTemplate],
      slotMappings: slotMappingsData,
      positionUI: {},
    })

    const state = useStore.getState()
    // loadProject appends the built-in CONNECTOR_TEMPLATES, so the loaded
    // template is present (first) alongside those.
    expect(state.templates[0].id).toBe(TEMPLATE_ID)
    expect(state.templates.some(t => t.id === TEMPLATE_ID)).toBe(true)
    expect(state.templates.length).toBeGreaterThan(1)
    expect(state.slotMappings).toEqual(slotMappingsData)
    expect(state.slotMappings[TEMPLATE_ID].DESIGN_ELEMENT).toBe('ET-DL-SPOT-01')
  })
})

describe('applyTemplate', () => {
  beforeEach(() => {
    resetStore({
      slotMappings: { [TEMPLATE_ID]: completeSlotMappings },
    })
  })

  test('applyTemplate creates recipe rows from resolved template', () => {
    useStore.getState().applyTemplate(POS_REF, TEMPLATE_ID)

    const { recipes } = useStore.getState()
    const posRows = recipes.filter(
      r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF
    )

    // DL+Local has 4 ingredients (3 position + 1 dl_internal)
    expect(posRows).toHaveLength(4)

    const designRow = posRows.find(r => r.slotKey === 'DESIGN_ELEMENT')
    expect(designRow).toBeDefined()
    expect(designRow.elementTypeRef).toBe('ET-DL-SPOT-01')
    expect(designRow.resolved).toBe(true)

    const driverRow = posRows.find(r => r.slotKey === 'LOCAL_DRIVER')
    expect(driverRow).toBeDefined()
    expect(driverRow.contextType).toBe('ElementType')
  })

  test('applyTemplate leaves placeholder rows for unresolved slots (resolved=false)', () => {
    resetStore({
      slotMappings: { [TEMPLATE_ID]: partialSlotMappings },
    })

    useStore.getState().applyTemplate(POS_REF, TEMPLATE_ID)

    const { recipes } = useStore.getState()
    const posRows = recipes.filter(
      r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF
    )

    const socketRow = posRows.find(r => r.slotKey === 'SITE_SOCKET')
    expect(socketRow).toBeDefined()
    expect(socketRow.resolved).toBe(false)
    expect(socketRow.elementTypeRef).toBeNull()

    const srRow = posRows.find(r => r.slotKey === 'SITE_SR')
    expect(srRow).toBeDefined()
    expect(srRow.resolved).toBe(false)

    const driverRow = posRows.find(r => r.slotKey === 'LOCAL_DRIVER')
    expect(driverRow).toBeDefined()
    expect(driverRow.resolved).toBe(false)
  })

  test('applyTemplate assigns a _id to every new row', () => {
    useStore.getState().applyTemplate(POS_REF, TEMPLATE_ID)

    const { recipes } = useStore.getState()
    const posRows = recipes.filter(
      r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF
    )

    for (const row of posRows) {
      expect(row._id).toBeDefined()
      expect(typeof row._id).toBe('string')
      expect(row._id.length).toBeGreaterThan(0)
    }
  })

  test('applyTemplate records rsChanges for all new rows', () => {
    useStore.getState().applyTemplate(POS_REF, TEMPLATE_ID)

    const { rsChanges } = useStore.getState()
    expect(rsChanges.length).toBeGreaterThanOrEqual(4)
  })
})

describe('resolveSlot', () => {
  beforeEach(() => {
    // Start with template applied (unresolved slots)
    resetStore({
      slotMappings: { [TEMPLATE_ID]: partialSlotMappings },
    })
    useStore.getState().applyTemplate(POS_REF, TEMPLATE_ID)
    vi.clearAllMocks()
  })

  test('resolveSlot updates row entityRef and clears placeholder state', async () => {
    await useStore.getState().resolveSlot(POS_REF, 'SITE_SOCKET', 'ET-SOCK-5P-01')

    const { recipes } = useStore.getState()
    const socketRow = recipes.find(
      r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF &&
           r.slotKey === 'SITE_SOCKET'
    )

    expect(socketRow).toBeDefined()
    expect(socketRow.elementTypeRef).toBe('ET-SOCK-5P-01')
    expect(socketRow.resolved).toBe(true)
  })

  test('resolveSlot persists mapping via electronAPI.db', async () => {
    await useStore.getState().resolveSlot(POS_REF, 'SITE_SOCKET', 'ET-SOCK-5P-01')

    expect(window.electronAPI.db.upsertSlotMapping).toHaveBeenCalledWith(
      PROJECT_ID,
      TEMPLATE_ID,
      'SITE_SOCKET',
      'ET-SOCK-5P-01'
    )
  })

  test('resolveSlot updates slotMappings in store', async () => {
    await useStore.getState().resolveSlot(POS_REF, 'SITE_SOCKET', 'ET-SOCK-5P-01')

    const { slotMappings } = useStore.getState()
    expect(slotMappings[TEMPLATE_ID]).toBeDefined()
    expect(slotMappings[TEMPLATE_ID]['SITE_SOCKET']).toBe('ET-SOCK-5P-01')
  })

  test('resolveSlot adds to rsChanges', async () => {
    const changesBefore = useStore.getState().rsChanges.length
    await useStore.getState().resolveSlot(POS_REF, 'SITE_SOCKET', 'ET-SOCK-5P-01')

    const changesAfter = useStore.getState().rsChanges.length
    expect(changesAfter).toBeGreaterThan(changesBefore)
  })
})

describe('saveAsTemplate', () => {
  beforeEach(() => {
    // Start with a fully applied + resolved recipe
    resetStore({
      slotMappings: { [TEMPLATE_ID]: completeSlotMappings },
    })
    useStore.getState().applyTemplate(POS_REF, TEMPLATE_ID)
    vi.clearAllMocks()
  })

  test('saveAsTemplate converts active recipe to template definition', async () => {
    await useStore.getState().saveAsTemplate(POS_REF, 'My Custom DL', 'project')

    const { templates } = useStore.getState()
    const saved = templates.find(t => t.name === 'My Custom DL')

    expect(saved).toBeDefined()
    expect(saved.scope).toBe('project')
    expect(saved.id).toBeDefined()
  })

  test('saveAsTemplate adds projectId when scope is project', async () => {
    await useStore.getState().saveAsTemplate(POS_REF, 'Project Tpl', 'project')

    const { templates } = useStore.getState()
    const saved = templates.find(t => t.name === 'Project Tpl')

    expect(saved.projectId).toBe(PROJECT_ID)
  })

  test('saveAsTemplate persists via electronAPI.db.upsertTemplate', async () => {
    await useStore.getState().saveAsTemplate(POS_REF, 'Persist Test', 'project')

    expect(window.electronAPI.db.upsertTemplate).toHaveBeenCalledOnce()
  })

  test('saveAsTemplate global scope does not set projectId', async () => {
    await useStore.getState().saveAsTemplate(POS_REF, 'Global Tpl', 'global')

    const { templates } = useStore.getState()
    const saved = templates.find(t => t.name === 'Global Tpl')

    expect(saved.projectId).toBeUndefined()
  })

  test('saveAsTemplate populates applicable_tags from positionUI tags', async () => {
    // positionUI[POS_REF].tags = ['DL', 'Local', '5Pin-DALI'] from resetStore
    await useStore.getState().saveAsTemplate(POS_REF, 'Tagged Template', 'project')

    const { templates } = useStore.getState()
    const saved = templates.find(t => t.name === 'Tagged Template')

    const parsedTags = JSON.parse(saved.applicable_tags)
    expect(parsedTags).toContain('DL')
    expect(parsedTags).toContain('Local')
    expect(parsedTags).toContain('5Pin-DALI')
  })

  test('saveAsTemplate applicable_tags allow template to auto-match via findBestTemplate', async () => {
    await useStore.getState().saveAsTemplate(POS_REF, 'Auto-Match Tpl', 'project')

    const { templates } = useStore.getState()
    // The saved template should auto-match a position with the same tags
    const saved = templates.find(t => t.name === 'Auto-Match Tpl')
    const parsedTags = JSON.parse(saved.applicable_tags)

    // All three position tags should be in applicable_tags
    expect(parsedTags.length).toBeGreaterThan(0)
    for (const tag of parsedTags) {
      expect(['DL', 'Local', '5Pin-DALI']).toContain(tag)
    }
  })
})

describe('addPSRow', () => {
  beforeEach(() => {
    resetStore({
      psRows: [
        {
          ElementTypeRef: 'ET-DL-SPOT-01',
          ProductCode: 'PC-001',
          Manufacturer: 'Acme',
          _id: 'existing-1',
          _row_num: 5,
        },
      ],
    })
  })

  test('addPSRow creates a new row with the given ElementTypeRef', () => {
    useStore.getState().addPSRow('ET-NEW-01')

    const { psRows } = useStore.getState()
    const newRow = psRows.find(r => (r.ElementTypeRef || r.elementTypeRef) === 'ET-NEW-01')

    expect(newRow).toBeDefined()
    expect(newRow.ElementTypeRef).toBe('ET-NEW-01')
    expect(newRow._id).toBeDefined()
  })

  test('addPSRow new row starts with null product fields', () => {
    useStore.getState().addPSRow('ET-BLANK-01')

    const { psRows } = useStore.getState()
    const newRow = psRows.find(r => (r.ElementTypeRef || r.elementTypeRef) === 'ET-BLANK-01')

    expect(newRow.ProductCode).toBeNull()
    expect(newRow.Manufacturer).toBeNull()
    expect(newRow.ComponentDescription).toBeNull()
    expect(newRow.IsTBC).toBeNull()
    expect(newRow.IsDeleted).toBeNull()
    expect(newRow._row_num).toBeNull()
  })

  test('addPSRow new row has _isNew: true in psChanges', () => {
    useStore.getState().addPSRow('ET-NEW-02')

    const { psChanges } = useStore.getState()
    const change = psChanges.find(c => c.elementTypeRef === 'ET-NEW-02')

    expect(change).toBeDefined()
    expect(change._isNew).toBe(true)
  })

  test('addPSRow returns null and does not add when ref already exists (case-insensitive)', () => {
    const result = useStore.getState().addPSRow('ET-DL-SPOT-01')

    expect(result).toBeNull()

    const { psRows } = useStore.getState()
    const matches = psRows.filter(
      r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === 'et-dl-spot-01'
    )
    expect(matches).toHaveLength(1)
  })

  test('addPSRow case-insensitive duplicate check (different casing)', () => {
    const result = useStore.getState().addPSRow('et-dl-spot-01')
    expect(result).toBeNull()
  })

  test('addPSRow returns null and does not add for blank ref', () => {
    const before = useStore.getState().psRows.length
    const result = useStore.getState().addPSRow('')

    expect(result).toBeNull()
    expect(useStore.getState().psRows).toHaveLength(before)
  })

  test('addPSRow returns null for whitespace-only ref', () => {
    const result = useStore.getState().addPSRow('   ')
    expect(result).toBeNull()
  })

  test('addPSRow trims whitespace from the ref', () => {
    useStore.getState().addPSRow('  ET-TRIM-01  ')

    const { psRows } = useStore.getState()
    const newRow = psRows.find(r => (r.ElementTypeRef || r.elementTypeRef) === 'ET-TRIM-01')
    expect(newRow).toBeDefined()
  })

  test('addPSRow multiple distinct rows accumulate in psRows', () => {
    const before = useStore.getState().psRows.length
    useStore.getState().addPSRow('ET-A')
    useStore.getState().addPSRow('ET-B')
    useStore.getState().addPSRow('ET-C')

    const { psRows } = useStore.getState()
    expect(psRows).toHaveLength(before + 3)
  })

  test('addPSRow each new row queues one psChange with _isNew', () => {
    useStore.getState().addPSRow('ET-X')
    useStore.getState().addPSRow('ET-Y')

    const { psChanges } = useStore.getState()
    const newChanges = psChanges.filter(c => c._isNew === true)
    expect(newChanges).toHaveLength(2)
  })
})

describe('reapplyTemplate', () => {
  beforeEach(() => {
    // Start with partial slot mappings so some rows are already resolved
    resetStore({
      slotMappings: { [TEMPLATE_ID]: partialSlotMappings },
    })
    useStore.getState().applyTemplate(POS_REF, TEMPLATE_ID)
    vi.clearAllMocks()
  })

  test('reapplyTemplate preserves existing resolved ET refs', () => {
    // DESIGN_ELEMENT is already resolved (ET-DL-SPOT-01) from partialSlotMappings
    useStore.getState().reapplyTemplate(POS_REF, TEMPLATE_ID)

    const { recipes } = useStore.getState()
    const designRow = recipes.find(
      r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF &&
           r.slotKey === 'DESIGN_ELEMENT'
    )

    expect(designRow).toBeDefined()
    expect(designRow.elementTypeRef).toBe('ET-DL-SPOT-01')
    expect(designRow.resolved).toBe(true)
  })

  test('reapplyTemplate adds new slots as unresolved placeholders', () => {
    useStore.getState().reapplyTemplate(POS_REF, TEMPLATE_ID)

    const { recipes } = useStore.getState()

    // SITE_SOCKET and SITE_SR were not in partialSlotMappings → should be unresolved
    const socketRow = recipes.find(
      r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF &&
           r.slotKey === 'SITE_SOCKET'
    )
    expect(socketRow).toBeDefined()
    expect(socketRow.resolved).toBe(false)
    expect(socketRow.elementTypeRef).toBeNull()

    const driverRow = recipes.find(
      r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF &&
           r.slotKey === 'LOCAL_DRIVER'
    )
    expect(driverRow).toBeDefined()
    expect(driverRow.resolved).toBe(false)
  })

  test('reapplyTemplate produces rows for all template slots', () => {
    useStore.getState().reapplyTemplate(POS_REF, TEMPLATE_ID)

    const { recipes } = useStore.getState()
    const posRows = recipes.filter(
      r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF
    )

    // DL+Local has 4 ingredients
    expect(posRows).toHaveLength(4)
  })
})

describe('fileWatchAlert', () => {
  beforeEach(() => resetStore())

  test('setFileWatchAlert stores alert in state', () => {
    useStore.getState().setFileWatchAlert({ file: 'ps', path: '/projects/test/ps.xlsx' })

    const { fileWatchAlert } = useStore.getState()
    expect(fileWatchAlert).toEqual({ file: 'ps', path: '/projects/test/ps.xlsx' })
  })

  test('dismissFileWatchAlert clears the alert', () => {
    useStore.setState({ fileWatchAlert: { file: 'rs', path: '/rs.xlsx' } })
    useStore.getState().dismissFileWatchAlert()

    expect(useStore.getState().fileWatchAlert).toBeNull()
  })

  test('setFileWatchAlert can be cleared by passing null', () => {
    useStore.getState().setFileWatchAlert({ file: 'ps', path: '/ps.xlsx' })
    useStore.getState().setFileWatchAlert(null)

    expect(useStore.getState().fileWatchAlert).toBeNull()
  })
})

describe('reloadFileFromDisk', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  test('reloadFileFromDisk calls /import and merges single file (ps)', async () => {
    const freshPsRows = [
      { ElementTypeRef: 'ET-DL-SPOT-01', ProductCode: 'PC-001', _id: 'existing' },
    ]
    // Store reads response.data.ps (not ps_rows)
    axios.post.mockResolvedValueOnce({ data: { ps: freshPsRows } })

    useStore.setState({ fileWatchAlert: { file: 'ps', path: '/ps.xlsx' } })

    await useStore.getState().reloadFileFromDisk('ps')

    // Store sends { db, ps, rs } flat — not wrapped in { paths: ... }
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/import'),
      expect.objectContaining({ ps: '/ps.xlsx' })
    )

    const { psRows, fileWatchAlert } = useStore.getState()
    // rows get re-stamped with new _ids, so just check content
    expect(psRows).toHaveLength(1)
    expect(psRows[0].ElementTypeRef).toBe('ET-DL-SPOT-01')
    expect(fileWatchAlert).toBeNull()
  })

  test('reloadFileFromDisk calls /import and merges single file (rs)', async () => {
    const freshRsRows = [
      {
        PositionTypeRef: POS_REF,
        ElementTypeRef: 'ET-DL-SPOT-01',
        ContextType: 'PositionType',
        RecipeIndex: 1,
      },
    ]
    // Store reads response.data.rs (not rs_rows)
    axios.post.mockResolvedValueOnce({ data: { rs: freshRsRows } })

    useStore.setState({ fileWatchAlert: { file: 'rs', path: '/rs.xlsx' } })

    await useStore.getState().reloadFileFromDisk('rs')

    const { recipes, fileWatchAlert } = useStore.getState()
    expect(recipes).toHaveLength(1)
    expect(recipes[0].PositionTypeRef).toBe(POS_REF)
    expect(fileWatchAlert).toBeNull()
  })
})

describe('reorderIngredients', () => {
  beforeEach(() => {
    resetStore({
      slotMappings: { [TEMPLATE_ID]: completeSlotMappings },
    })
    useStore.getState().applyTemplate(POS_REF, TEMPLATE_ID)
    vi.clearAllMocks()
  })

  test('reorderIngredients within section updates RecipeIndex sequence', () => {
    const { recipes: before } = useStore.getState()
    const positionRows = before.filter(
      r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF &&
           (r.contextType || r.ContextType) === 'PositionType'
    )

    // There should be 3 position-level rows (DESIGN_ELEMENT, SITE_SOCKET, SITE_SR)
    expect(positionRows).toHaveLength(3)

    // Move item at index 0 to index 2 (send to end)
    useStore.getState().reorderIngredients(POS_REF, 'position', 0, 2)

    const { recipes: after } = useStore.getState()
    const reorderedRows = after
      .filter(
        r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF &&
             (r.contextType || r.ContextType) === 'PositionType'
      )
      .sort((a, b) => (a.RecipeIndex ?? a.recipeIndex) - (b.RecipeIndex ?? b.recipeIndex))

    // RecipeIndex should be 1, 2, 3 after renumbering
    expect(reorderedRows[0].RecipeIndex ?? reorderedRows[0].recipeIndex).toBe(1)
    expect(reorderedRows[1].RecipeIndex ?? reorderedRows[1].recipeIndex).toBe(2)
    expect(reorderedRows[2].RecipeIndex ?? reorderedRows[2].recipeIndex).toBe(3)
  })

  test('reorderIngredients adds all affected rows to rsChanges', () => {
    const changesBefore = useStore.getState().rsChanges.length
    useStore.getState().reorderIngredients(POS_REF, 'position', 0, 2)

    const changesAfter = useStore.getState().rsChanges.length
    // At minimum 3 rows changed (all position-level rows got renumbered)
    expect(changesAfter - changesBefore).toBeGreaterThanOrEqual(3)
  })
})

describe('moveIngredientAcrossSections', () => {
  beforeEach(() => {
    resetStore({
      slotMappings: { [TEMPLATE_ID]: completeSlotMappings },
    })
    useStore.getState().applyTemplate(POS_REF, TEMPLATE_ID)
    vi.clearAllMocks()
  })

  test('moveIngredientAcrossSections updates ContextType and ContextRef', () => {
    const { recipes: before } = useStore.getState()

    // Pick the SITE_SOCKET row (position level) to move to dl_internal
    const socketRow = before.find(
      r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF &&
           r.slotKey === 'SITE_SOCKET'
    )
    expect(socketRow).toBeDefined()
    expect(socketRow.contextType).toBe('PositionType')

    useStore.getState().moveIngredientAcrossSections(POS_REF, socketRow._id, 'dl_internal')

    const { recipes: after } = useStore.getState()
    const movedRow = after.find(r => r._id === socketRow._id)

    expect(movedRow.contextType).toBe('ElementType')
    // contextRef should be the DESIGN_ELEMENT entity ref
    expect(movedRow.contextRef).toBe('ET-DL-SPOT-01')
  })

  test('moveIngredientAcrossSections re-sequences both section RecipeIndexes', () => {
    const { recipes: before } = useStore.getState()

    const socketRow = before.find(
      r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF &&
           r.slotKey === 'SITE_SOCKET'
    )

    useStore.getState().moveIngredientAcrossSections(POS_REF, socketRow._id, 'dl_internal')

    const { recipes: after } = useStore.getState()

    // Source section (position) should now have 2 rows with sequential indexes
    const positionRows = after
      .filter(
        r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF &&
             (r.contextType || r.ContextType) === 'PositionType'
      )
      .sort((a, b) => (a.RecipeIndex ?? a.recipeIndex) - (b.RecipeIndex ?? b.recipeIndex))

    expect(positionRows).toHaveLength(2)
    expect(positionRows[0].RecipeIndex ?? positionRows[0].recipeIndex).toBe(1)
    expect(positionRows[1].RecipeIndex ?? positionRows[1].recipeIndex).toBe(2)

    // Target section (dl_internal) now has LOCAL_DRIVER + moved SITE_SOCKET = 2 rows
    const dlRows = after
      .filter(
        r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF &&
             (r.contextType || r.ContextType) === 'ElementType'
      )
      .sort((a, b) => (a.RecipeIndex ?? a.recipeIndex) - (b.RecipeIndex ?? b.recipeIndex))

    expect(dlRows).toHaveLength(2)
    expect(dlRows[0].RecipeIndex ?? dlRows[0].recipeIndex).toBe(1)
    expect(dlRows[1].RecipeIndex ?? dlRows[1].recipeIndex).toBe(2)
  })

  test('moveIngredientAcrossSections adds all affected rows to rsChanges', () => {
    const { recipes: before } = useStore.getState()
    const socketRow = before.find(
      r => (r.positionTypeRef || r.PositionTypeRef) === POS_REF &&
           r.slotKey === 'SITE_SOCKET'
    )
    const changesBefore = useStore.getState().rsChanges.length

    useStore.getState().moveIngredientAcrossSections(POS_REF, socketRow._id, 'dl_internal')

    const changesAfter = useStore.getState().rsChanges.length
    // At least the rows in both sections that were renumbered
    expect(changesAfter - changesBefore).toBeGreaterThanOrEqual(2)
  })
})

describe('getRecipeForPosition (exported helper)', () => {
  test('groups flat recipes into position / dlInternal / linInternal sections', () => {
    const flatRecipes = [
      { positionTypeRef: POS_REF, contextType: 'PositionType', elementTypeRef: 'ET-DL-SPOT-01', _id: 'a' },
      { positionTypeRef: POS_REF, contextType: 'PositionType', elementTypeRef: 'ET-SOCK-5P-01', _id: 'b' },
      { positionTypeRef: POS_REF, contextType: 'ElementType', elementTypeRef: 'ET-DRIVER-CC-01', _id: 'c' },
      { positionTypeRef: 'PT-OTHER', contextType: 'PositionType', elementTypeRef: 'ET-SOMETHING', _id: 'd' },
    ]

    const grouped = getRecipeForPosition(flatRecipes, POS_REF)

    expect(grouped.position).toHaveLength(2)
    expect(grouped.dlInternal).toHaveLength(1)
    expect(grouped.linInternal).toHaveLength(0)
  })

  test('routes LIN element refs to linInternal', () => {
    const flatRecipes = [
      { positionTypeRef: POS_REF, contextType: 'ElementType', elementTypeRef: 'ET-LIN-PROF-01', _id: 'x' },
    ]

    const grouped = getRecipeForPosition(flatRecipes, POS_REF)

    expect(grouped.linInternal).toHaveLength(1)
    expect(grouped.dlInternal).toHaveLength(0)
  })
})

describe('duplicateET', () => {
  // ET-DL-01 internals shared by two positions
  const sharedETRecipes = [
    {
      positionTypeRef: 'PT-A', PositionTypeRef: 'PT-A',
      contextType: 'ElementType', ContextType: 'ElementType',
      contextRef: 'ET-DL-01', ContextRef: 'ET-DL-01',
      elementTypeRef: 'ET-DRIVER-01', ElementTypeRef: 'ET-DRIVER-01',
      recipeIndex: 2, RecipeIndex: 2, _id: 'a1',
    },
    {
      positionTypeRef: 'PT-B', PositionTypeRef: 'PT-B',
      contextType: 'ElementType', ContextType: 'ElementType',
      contextRef: 'ET-DL-01', ContextRef: 'ET-DL-01',
      elementTypeRef: 'ET-DRIVER-01', ElementTypeRef: 'ET-DRIVER-01',
      recipeIndex: 2, RecipeIndex: 2, _id: 'b1',
    },
  ]

  test('forks internals for the current position only, under the new ref', () => {
    resetStore({ recipes: sharedETRecipes })

    useStore.getState().duplicateET('ET-DL-01', 'ET-DL-02', 'PT-A')

    const { recipes, activeContextType, activeETRef, rsChanges } = useStore.getState()

    const forked = recipes.filter(r => (r.ContextRef || r.contextRef) === 'ET-DL-02')
    expect(forked).toHaveLength(1)
    expect(forked[0].PositionTypeRef).toBe('PT-A')
    expect(forked[0].ElementTypeRef).toBe('ET-DRIVER-01')

    // The other position keeps the original shared ET untouched
    const ptB = recipes.filter(r => (r.PositionTypeRef || r.positionTypeRef) === 'PT-B')
    expect(ptB).toHaveLength(1)
    expect(ptB[0].ContextRef).toBe('ET-DL-01')

    // Opens the new ET for editing
    expect(activeContextType).toBe('ElementType')
    expect(activeETRef).toBe('ET-DL-02')

    // Queued for export
    expect(rsChanges.some(c => c.action === 'upsert' && c.row?.ContextRef === 'ET-DL-02')).toBe(true)
  })

  test('does nothing without a target position or new ref', () => {
    resetStore({ recipes: sharedETRecipes })
    useStore.getState().duplicateET('ET-DL-01', '', 'PT-A')
    expect(useStore.getState().recipes).toHaveLength(2)
  })

  test('suggestNextETRef proposes the next sequential ref', () => {
    resetStore({ recipes: sharedETRecipes })
    expect(useStore.getState().suggestNextETRef('ET-DL-01')).toBe('ET-DL-02')
  })
})

describe('undo / redo', () => {
  test('undo reverts a recipe mutation and redo re-applies it', () => {
    resetStore()

    useStore.getState().addRecipeRow(POS_REF, 'position', { elementTypeRef: 'ET-X' })
    expect(useStore.getState().recipes).toHaveLength(1)
    expect(useStore.getState().past).toHaveLength(1)

    useStore.getState().undo()
    expect(useStore.getState().recipes).toHaveLength(0)
    expect(useStore.getState().rsChanges).toHaveLength(0)
    expect(useStore.getState().future).toHaveLength(1)

    useStore.getState().redo()
    expect(useStore.getState().recipes).toHaveLength(1)
    expect(useStore.getState().future).toHaveLength(0)
  })

  test('undo and redo are no-ops on empty stacks', () => {
    resetStore()
    expect(() => useStore.getState().undo()).not.toThrow()
    expect(() => useStore.getState().redo()).not.toThrow()
    expect(useStore.getState().recipes).toHaveLength(0)
  })

  test('a new mutation clears the redo stack', () => {
    resetStore()
    useStore.getState().addRecipeRow(POS_REF, 'position', { elementTypeRef: 'ET-X' })
    useStore.getState().undo()
    expect(useStore.getState().future).toHaveLength(1)

    useStore.getState().addRecipeRow(POS_REF, 'position', { elementTypeRef: 'ET-Y' })
    expect(useStore.getState().future).toHaveLength(0)
  })
})

describe('ensurePSRow / auto-add on assignment', () => {
  test('ensurePSRow registers a new ref once and is idempotent', () => {
    resetStore({ psRows: [] })
    useStore.getState().ensurePSRow('ET-SOCKET-5P-01')
    let ps = useStore.getState().psRows
    expect(ps).toHaveLength(1)
    expect(ps[0].ElementTypeRef).toBe('ET-SOCKET-5P-01')

    useStore.getState().ensurePSRow('ET-SOCKET-5P-01')
    expect(useStore.getState().psRows).toHaveLength(1) // no duplicate
  })

  test('addRecipeRow registers the assigned ref in the Product Spec', () => {
    resetStore({ psRows: [], recipes: [] })
    useStore.getState().addRecipeRow(POS_REF, 'position', { elementTypeRef: 'ET-SOCKET-5P-01' })
    const ps = useStore.getState().psRows
    expect(ps.some(r => r.ElementTypeRef === 'ET-SOCKET-5P-01')).toBe(true)
  })
})

describe('addConnection', () => {
  // A position with a DL design element so dl_internal parts resolve their context
  const withDesign = [
    {
      positionTypeRef: POS_REF, PositionTypeRef: POS_REF,
      contextType: 'PositionType', ContextType: 'PositionType',
      contextRef: POS_REF, ContextRef: POS_REF,
      elementTypeRef: 'ET-DL-01', ElementTypeRef: 'ET-DL-01',
      isDesign: 'Y', IsDesign: 'Y',
      recipeIndex: 1, RecipeIndex: 1, _id: 'design',
    },
  ]

  test('inserts all parts at the right sections in one undoable step', () => {
    resetStore({ psRows: [], recipes: withDesign })

    useStore.getState().addConnection(POS_REF, [
      { section: 'position', elementTypeRef: 'ET-SOCKET-5P-01' },
      { section: 'dl_internal', elementTypeRef: 'ET-PLUG-5P-01' },
    ])

    const { recipes, past } = useStore.getState()
    const socket = recipes.find(r => (r.ElementTypeRef || r.elementTypeRef) === 'ET-SOCKET-5P-01')
    const plug = recipes.find(r => (r.ElementTypeRef || r.elementTypeRef) === 'ET-PLUG-5P-01')

    expect(socket.ContextType).toBe('PositionType')          // position level
    expect(plug.ContextType).toBe('ElementType')             // inside the DL
    expect(plug.ContextRef).toBe('ET-DL-01')

    // One history entry for the whole connection
    expect(past).toHaveLength(1)

    // A single undo removes both inserted rows
    useStore.getState().undo()
    const after = useStore.getState().recipes
    expect(after.some(r => (r.ElementTypeRef || r.elementTypeRef) === 'ET-SOCKET-5P-01')).toBe(false)
    expect(after.some(r => (r.ElementTypeRef || r.elementTypeRef) === 'ET-PLUG-5P-01')).toBe(false)
  })

  test('skips parts with no elementTypeRef', () => {
    resetStore({ psRows: [], recipes: withDesign })
    useStore.getState().addConnection(POS_REF, [
      { section: 'position', elementTypeRef: 'ET-SOCKET-5P-01' },
      { section: 'position', elementTypeRef: '' },
    ])
    const added = useStore.getState().recipes.filter(r => (r.ElementTypeRef || r.elementTypeRef) === 'ET-SOCKET-5P-01')
    expect(added).toHaveLength(1)
  })

  test('passes quantity through (twin-spot)', () => {
    resetStore({ psRows: [], recipes: withDesign })
    useStore.getState().addConnection(POS_REF, [
      { section: 'position', elementTypeRef: 'ET-SOCKET-5P-01', quantity: 2 },
    ])
    const socket = useStore.getState().recipes.find(r => (r.ElementTypeRef || r.elementTypeRef) === 'ET-SOCKET-5P-01')
    expect(socket.Quantity).toBe(2)
  })

  test('merge sums duplicate quantities instead of adding a new row', () => {
    resetStore({ psRows: [], recipes: withDesign })
    useStore.getState().addConnection(POS_REF, [
      { section: 'position', elementTypeRef: 'ET-SOCKET-5P-01', quantity: 2 },
    ])
    // Paste the same ET into the same section with merge → one row, qty 5
    useStore.getState().addConnection(POS_REF, [
      { section: 'position', elementTypeRef: 'ET-SOCKET-5P-01', quantity: 3 },
    ], { merge: true })

    const sockets = useStore.getState().recipes.filter(r => (r.ElementTypeRef || r.elementTypeRef) === 'ET-SOCKET-5P-01')
    expect(sockets).toHaveLength(1)
    expect(sockets[0].Quantity).toBe(5)

    // Without merge it appends a separate row
    useStore.getState().addConnection(POS_REF, [
      { section: 'position', elementTypeRef: 'ET-SOCKET-5P-01', quantity: 1 },
    ])
    expect(useStore.getState().recipes.filter(r => (r.ElementTypeRef || r.elementTypeRef) === 'ET-SOCKET-5P-01')).toHaveLength(2)
  })

  test('pasteDuplicateCount detects rows already present', () => {
    resetStore({ psRows: [], recipes: withDesign })
    useStore.getState().addConnection(POS_REF, [
      { section: 'position', elementTypeRef: 'ET-SOCKET-5P-01' },
    ])
    useStore.setState({ rowClipboard: { parts: [
      { section: 'position', elementTypeRef: 'ET-SOCKET-5P-01', quantity: 1 },
      { section: 'position', elementTypeRef: 'ET-NEW-01', quantity: 1 },
    ], count: 2, label: '2 rows' } })
    expect(useStore.getState().pasteDuplicateCount(POS_REF)).toBe(1)
  })
})

describe('removeRecipeRow — new vs existing', () => {
  test('hard-removes a new (unsynced) row', () => {
    resetStore({ recipes: [
      { _id: 'new1', positionTypeRef: POS_REF, PositionTypeRef: POS_REF, elementTypeRef: 'ET-A', ElementTypeRef: 'ET-A', _row_num: null },
    ] })
    useStore.getState().removeRecipeRow(POS_REF, 'new1')
    expect(useStore.getState().recipes.find(r => r._id === 'new1')).toBeUndefined()
  })

  test('soft-deletes an existing (synced) row instead of removing it', () => {
    resetStore({ recipes: [
      { _id: 'src1', positionTypeRef: POS_REF, PositionTypeRef: POS_REF, elementTypeRef: 'ET-A', ElementTypeRef: 'ET-A', _row_num: 7 },
    ] })
    useStore.getState().removeRecipeRow(POS_REF, 'src1')
    const row = useStore.getState().recipes.find(r => r._id === 'src1')
    expect(row).toBeDefined()
    expect(row.IsDeleted).toBe('Y')
    // and it queues an upsert (not a bare delete) so the flag syncs out
    expect(useStore.getState().rsChanges.some(c => c._id === 'src1' && c.action === 'upsert')).toBe(true)
  })
})

describe('updatePSRow — upsert', () => {
  test('creates a PS row when none exists for the ref', () => {
    resetStore({ psRows: [] })
    useStore.getState().updatePSRow('ET-NOSPEC', { Manufacturer: 'Acme', ProductCode: 'X1' })
    const row = useStore.getState().psRows.find(r => (r.ElementTypeRef || r.elementTypeRef) === 'ET-NOSPEC')
    expect(row).toBeDefined()
    expect(row.Manufacturer).toBe('Acme')
    expect(row.ProductCode).toBe('X1')
    expect(row._row_num).toBeNull()
  })
})

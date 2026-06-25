'use strict'

const Database = require('better-sqlite3')
const path = require('path')

let db = null

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function initDb(dbPath) {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  createTables()
  return db
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb(dbPath) first.')
  return db
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_path  TEXT UNIQUE NOT NULL,
      db_filename  TEXT,
      ps_filename  TEXT,
      rs_filename  TEXT,
      last_opened  TEXT
    );

    CREATE TABLE IF NOT EXISTS position_ui (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id         INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      position_type_ref  TEXT NOT NULL,
      tags               TEXT DEFAULT '[]',
      tag_source         TEXT DEFAULT '{}',
      tag_confidence     TEXT DEFAULT 'high',
      user_notes         TEXT DEFAULT '',
      UNIQUE(project_id, position_type_ref)
    );

    CREATE TABLE IF NOT EXISTS templates (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      scope            TEXT NOT NULL,
      project_id       INTEGER,
      base_template_id TEXT,
      applicable_tags  TEXT DEFAULT '[]',
      ingredients      TEXT DEFAULT '[]',
      sort_order       INTEGER DEFAULT 0,
      created_at       TEXT,
      updated_at       TEXT,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS slot_mappings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL,
      slot_key    TEXT NOT NULL,
      entity_ref  TEXT NOT NULL,
      UNIQUE(project_id, template_id, slot_key)
    );

    CREATE TABLE IF NOT EXISTS project_prefs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      key        TEXT NOT NULL,
      value      TEXT,
      UNIQUE(project_id, key)
    );
  `)
}

// ---------------------------------------------------------------------------
// Helper: ISO timestamp
// ---------------------------------------------------------------------------

function now() {
  return new Date().toISOString()
}

// ---------------------------------------------------------------------------
// Helper: parse JSON fields on a template row
// ---------------------------------------------------------------------------

function parseTemplate(row) {
  if (!row) return null
  return {
    ...row,
    applicable_tags: JSON.parse(row.applicable_tags || '[]'),
    ingredients: JSON.parse(row.ingredients || '[]'),
  }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

function upsertProject(folderPath, dbFilename, psFilename, rsFilename) {
  const database = getDb()
  const ts = now()
  database
    .prepare(`
      INSERT INTO projects (folder_path, db_filename, ps_filename, rs_filename, last_opened)
      VALUES (@folderPath, @dbFilename, @psFilename, @rsFilename, @ts)
      ON CONFLICT(folder_path) DO UPDATE SET
        db_filename = excluded.db_filename,
        ps_filename = excluded.ps_filename,
        rs_filename = excluded.rs_filename,
        last_opened = excluded.last_opened
    `)
    .run({ folderPath, dbFilename, psFilename, rsFilename, ts })
  return database.prepare('SELECT * FROM projects WHERE folder_path = ?').get(folderPath)
}

function getProject(folderPath) {
  return getDb().prepare('SELECT * FROM projects WHERE folder_path = ?').get(folderPath) || null
}

function getLastProject() {
  return (
    getDb()
      .prepare('SELECT * FROM projects WHERE last_opened IS NOT NULL ORDER BY last_opened DESC LIMIT 1')
      .get() || null
  )
}

function updateLastOpened(projectId) {
  getDb()
    .prepare('UPDATE projects SET last_opened = ? WHERE id = ?')
    .run(now(), projectId)
}

// ---------------------------------------------------------------------------
// Position UI
// ---------------------------------------------------------------------------

function upsertPositionUI(projectId, positionTypeRef, { tags = [], tagSource = {}, tagConfidence = 'high', userNotes = '' } = {}) {
  const database = getDb()
  database
    .prepare(`
      INSERT INTO position_ui (project_id, position_type_ref, tags, tag_source, tag_confidence, user_notes)
      VALUES (@projectId, @positionTypeRef, @tags, @tagSource, @tagConfidence, @userNotes)
      ON CONFLICT(project_id, position_type_ref) DO UPDATE SET
        tags           = excluded.tags,
        tag_source     = excluded.tag_source,
        tag_confidence = excluded.tag_confidence,
        user_notes     = excluded.user_notes
    `)
    .run({
      projectId,
      positionTypeRef,
      tags: JSON.stringify(tags),
      tagSource: JSON.stringify(tagSource),
      tagConfidence,
      userNotes,
    })
  return getPositionUI(projectId, positionTypeRef)
}

function getPositionUI(projectId, positionTypeRef) {
  const row = getDb()
    .prepare('SELECT * FROM position_ui WHERE project_id = ? AND position_type_ref = ?')
    .get(projectId, positionTypeRef)
  if (!row) return null
  return {
    ...row,
    tags: JSON.parse(row.tags || '[]'),
    tag_source: JSON.parse(row.tag_source || '{}'),
  }
}

function getAllPositionUI(projectId) {
  const rows = getDb()
    .prepare('SELECT * FROM position_ui WHERE project_id = ?')
    .all(projectId)
  return rows.map((row) => ({
    ...row,
    tags: JSON.parse(row.tags || '[]'),
    tag_source: JSON.parse(row.tag_source || '{}'),
  }))
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function upsertTemplate(template) {
  const database = getDb()
  const ts = now()
  const {
    id,
    name,
    scope,
    project_id = null,
    base_template_id = null,
    applicable_tags = [],
    ingredients = [],
    sort_order = 0,
    created_at = ts,
  } = template

  database
    .prepare(`
      INSERT INTO templates (id, name, scope, project_id, base_template_id, applicable_tags, ingredients, sort_order, created_at, updated_at)
      VALUES (@id, @name, @scope, @project_id, @base_template_id, @applicable_tags, @ingredients, @sort_order, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name             = excluded.name,
        scope            = excluded.scope,
        project_id       = excluded.project_id,
        base_template_id = excluded.base_template_id,
        applicable_tags  = excluded.applicable_tags,
        ingredients      = excluded.ingredients,
        sort_order       = excluded.sort_order,
        updated_at       = excluded.updated_at
    `)
    .run({
      id,
      name,
      scope,
      project_id,
      base_template_id,
      applicable_tags: JSON.stringify(applicable_tags),
      ingredients: JSON.stringify(ingredients),
      sort_order,
      created_at,
      updated_at: ts,
    })
  return getTemplate(id)
}

function getTemplate(id) {
  return parseTemplate(getDb().prepare('SELECT * FROM templates WHERE id = ?').get(id))
}

/**
 * Return all templates visible to a project:
 *   - All global templates (scope = 'global')
 *   - All project-specific templates for the given projectId
 * Project templates with a base_template_id replace the global template with
 * that ID in the final list (override pattern).
 * When projectId is omitted, only global templates are returned.
 */
function getAllTemplates(projectId) {
  const database = getDb()

  const globals = database
    .prepare("SELECT * FROM templates WHERE scope = 'global' ORDER BY sort_order ASC, id ASC")
    .all()
    .map(parseTemplate)

  if (!projectId) return globals

  const projectTemplates = database
    .prepare("SELECT * FROM templates WHERE scope = 'project' AND project_id = ? ORDER BY sort_order ASC, id ASC")
    .all(projectId)
    .map(parseTemplate)

  // Build a map of base_template_id -> project template for override lookup
  const overrideByBase = new Map()
  const projectNoBase = []
  for (const pt of projectTemplates) {
    if (pt.base_template_id) {
      overrideByBase.set(pt.base_template_id, pt)
    } else {
      projectNoBase.push(pt)
    }
  }

  // Replace globals where a project override exists, preserve order
  const merged = globals.map((g) => overrideByBase.get(g.id) || g)

  // Append project-only templates (no base) at the end
  return [...merged, ...projectNoBase]
}

function deleteTemplate(id) {
  getDb().prepare('DELETE FROM templates WHERE id = ?').run(id)
}

// ---------------------------------------------------------------------------
// Slot Mappings
// ---------------------------------------------------------------------------

function upsertSlotMapping(projectId, templateId, slotKey, entityRef) {
  getDb()
    .prepare(`
      INSERT INTO slot_mappings (project_id, template_id, slot_key, entity_ref)
      VALUES (@projectId, @templateId, @slotKey, @entityRef)
      ON CONFLICT(project_id, template_id, slot_key) DO UPDATE SET
        entity_ref = excluded.entity_ref
    `)
    .run({ projectId, templateId, slotKey, entityRef })
}

function getSlotMappings(projectId, templateId) {
  const rows = getDb()
    .prepare('SELECT slot_key, entity_ref FROM slot_mappings WHERE project_id = ? AND template_id = ?')
    .all(projectId, templateId)
  const result = {}
  for (const row of rows) {
    result[row.slot_key] = row.entity_ref
  }
  return result
}

function getAllSlotMappings(projectId) {
  const rows = getDb()
    .prepare('SELECT template_id, slot_key, entity_ref FROM slot_mappings WHERE project_id = ?')
    .all(projectId)
  const result = {}
  for (const row of rows) {
    if (!result[row.template_id]) result[row.template_id] = {}
    result[row.template_id][row.slot_key] = row.entity_ref
  }
  return result
}

function deleteSlotMapping(projectId, templateId, slotKey) {
  getDb()
    .prepare('DELETE FROM slot_mappings WHERE project_id = ? AND template_id = ? AND slot_key = ?')
    .run(projectId, templateId, slotKey)
}

// ---------------------------------------------------------------------------
// Project Prefs
// ---------------------------------------------------------------------------

function setPref(projectId, key, value) {
  getDb()
    .prepare(`
      INSERT INTO project_prefs (project_id, key, value)
      VALUES (@projectId, @key, @value)
      ON CONFLICT(project_id, key) DO UPDATE SET value = excluded.value
    `)
    .run({ projectId, key, value: value === undefined ? null : String(value) })
}

function getPref(projectId, key) {
  const row = getDb()
    .prepare('SELECT value FROM project_prefs WHERE project_id = ? AND key = ?')
    .get(projectId, key)
  return row ? row.value : null
}

// ---------------------------------------------------------------------------
// Seed Data — Global Templates
// ---------------------------------------------------------------------------

/**
 * Ingredient slot factory.
 * Provide at minimum: slotKey, slotLabel, section, recipeIndex.
 * All other fields default to the "unset / flexible" state.
 */
function makeSlot({
  slotKey,
  slotLabel,
  section,
  recipeIndex,
  isDesign = null,
  isContractItem = null,
  quantity = null,
  dimQtyMultiplier = null,
  dimQuantity = null,
  isInteger = null,
  fixed = false,
}) {
  return {
    slotKey,
    slotLabel,
    section,
    recipeIndex,
    isDesign,
    isContractItem,
    quantity,
    dimQtyMultiplier,
    dimQuantity,
    isInteger,
    fixed,
  }
}

// ---------------------------------------------------------------------------
// Per-template ingredient lists
// ---------------------------------------------------------------------------

// 1. DL+Local — Local Downlight
const ingredientsDLLocal = [
  makeSlot({ slotKey: 'DESIGN_ELEMENT', slotLabel: 'DL Virtual Element',  section: 'position',    recipeIndex: 1,  isDesign: 'Y' }),
  makeSlot({ slotKey: 'SITE_SOCKET',    slotLabel: 'Site Socket',          section: 'position',    recipeIndex: 2,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'SITE_SR',        slotLabel: 'Site Strain Relief',   section: 'position',    recipeIndex: 3,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'MOUNT_COLLAR',   slotLabel: 'Mounting Collar',      section: 'position',    recipeIndex: 4,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'LOCAL_DRIVER',   slotLabel: 'Local Driver',         section: 'dl_internal', recipeIndex: 5,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DRIVER_PLUG',    slotLabel: 'Driver Plug',          section: 'dl_internal', recipeIndex: 6,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DC_SOCKET',      slotLabel: 'DC Socket',            section: 'dl_internal', recipeIndex: 7,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DC_PLUG',        slotLabel: 'DC Plug',              section: 'dl_internal', recipeIndex: 8,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DC_SR',          slotLabel: 'DC Strain Relief',     section: 'dl_internal', recipeIndex: 9,  isContractItem: 'Y' }),
]

// 2. DL+Remote-CC — Remote Driver CC
const ingredientsDLRemoteCC = [
  makeSlot({ slotKey: 'DESIGN_ELEMENT', slotLabel: 'DL Virtual Element',  section: 'position',    recipeIndex: 1,  isDesign: 'Y' }),
  makeSlot({ slotKey: 'MOUNT_COLLAR',   slotLabel: 'Mounting Collar',      section: 'position',    recipeIndex: 2,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'REMOTE_SOCKET',  slotLabel: 'Remote Socket',        section: 'dl_internal', recipeIndex: 3,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'REMOTE_PLUG',    slotLabel: 'Remote Plug',          section: 'dl_internal', recipeIndex: 4,  isContractItem: 'Y' }),
]

// 3. DL+Exterior — Exterior / IP-Rated
const ingredientsDLExterior = [
  makeSlot({ slotKey: 'DESIGN_ELEMENT', slotLabel: 'DL Virtual Element (IP)',   section: 'position',    recipeIndex: 1,  isDesign: 'Y' }),
  makeSlot({ slotKey: 'SITE_SOCKET',    slotLabel: 'IP Site Socket',             section: 'position',    recipeIndex: 2,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'SITE_SR',        slotLabel: 'IP Site Strain Relief',      section: 'position',    recipeIndex: 3,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'MOUNT_COLLAR',   slotLabel: 'IP Mounting Collar',         section: 'position',    recipeIndex: 4,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'LOCAL_DRIVER',   slotLabel: 'Exterior Driver',            section: 'dl_internal', recipeIndex: 5,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DRIVER_PLUG',    slotLabel: 'Driver Plug',                section: 'dl_internal', recipeIndex: 6,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DC_SOCKET',      slotLabel: 'DC Socket (IP)',             section: 'dl_internal', recipeIndex: 7,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DC_PLUG',        slotLabel: 'DC Plug (IP)',               section: 'dl_internal', recipeIndex: 8,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DC_SR',          slotLabel: 'DC Strain Relief (IP)',      section: 'dl_internal', recipeIndex: 9,  isContractItem: 'Y' }),
]

// 4. DL+Local+3Pin — Locally Switched (3-pin trailing edge)
const ingredientsDLLocal3Pin = [
  makeSlot({ slotKey: 'DESIGN_ELEMENT', slotLabel: 'DL Virtual Element',         section: 'position',    recipeIndex: 1,  isDesign: 'Y' }),
  makeSlot({ slotKey: 'SITE_SOCKET',    slotLabel: 'Site Socket',                 section: 'position',    recipeIndex: 2,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'SITE_SR',        slotLabel: 'Site Strain Relief',          section: 'position',    recipeIndex: 3,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'MOUNT_COLLAR',   slotLabel: 'Mounting Collar',             section: 'position',    recipeIndex: 4,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'LOCAL_DRIVER',   slotLabel: 'Local Driver (3-Pin TE)',     section: 'dl_internal', recipeIndex: 5,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DRIVER_PLUG',    slotLabel: 'Driver Plug',                 section: 'dl_internal', recipeIndex: 6,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DC_SOCKET',      slotLabel: 'DC Socket',                   section: 'dl_internal', recipeIndex: 7,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DC_PLUG',        slotLabel: 'DC Plug',                     section: 'dl_internal', recipeIndex: 8,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DC_SR',          slotLabel: 'DC Strain Relief',            section: 'dl_internal', recipeIndex: 9,  isContractItem: 'Y' }),
]

// 5. DL+Local+4Pin — Tuneable White
const ingredientsDLLocal4Pin = [
  makeSlot({ slotKey: 'DESIGN_ELEMENT', slotLabel: 'DL Virtual Element (TW)',     section: 'position',    recipeIndex: 1,  isDesign: 'Y' }),
  makeSlot({ slotKey: 'SITE_SOCKET',    slotLabel: 'Site Socket',                  section: 'position',    recipeIndex: 2,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'SITE_SR',        slotLabel: 'Site Strain Relief',           section: 'position',    recipeIndex: 3,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'MOUNT_COLLAR',   slotLabel: 'Mounting Collar',              section: 'position',    recipeIndex: 4,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'LOCAL_DRIVER',   slotLabel: 'Local Driver (4-Pin TW)',      section: 'dl_internal', recipeIndex: 5,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DRIVER_PLUG',    slotLabel: 'Driver Plug (4-Pin)',           section: 'dl_internal', recipeIndex: 6,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DC_SOCKET',      slotLabel: 'DC Socket',                    section: 'dl_internal', recipeIndex: 7,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DC_PLUG',        slotLabel: 'DC Plug',                      section: 'dl_internal', recipeIndex: 8,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DC_SR',          slotLabel: 'DC Strain Relief',             section: 'dl_internal', recipeIndex: 9,  isContractItem: 'Y' }),
]

// 6. DL+Local+TwinSpot — Twin Spot (quantity=2 on paired slots)
const ingredientsDLTwinSpot = [
  makeSlot({ slotKey: 'DESIGN_ELEMENT', slotLabel: 'DL Virtual Element',  section: 'position',    recipeIndex: 1,  isDesign: 'Y' }),
  makeSlot({ slotKey: 'SITE_SOCKET',    slotLabel: 'Site Socket',          section: 'position',    recipeIndex: 2,  isContractItem: 'Y', quantity: 2 }),
  makeSlot({ slotKey: 'SITE_SR',        slotLabel: 'Site Strain Relief',   section: 'position',    recipeIndex: 3,  isContractItem: 'Y', quantity: 2 }),
  makeSlot({ slotKey: 'MOUNT_COLLAR',   slotLabel: 'Mounting Collar',      section: 'position',    recipeIndex: 4,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'LOCAL_DRIVER',   slotLabel: 'Local Driver',         section: 'dl_internal', recipeIndex: 5,  isContractItem: 'Y', quantity: 2 }),
  makeSlot({ slotKey: 'DRIVER_PLUG',    slotLabel: 'Driver Plug',          section: 'dl_internal', recipeIndex: 6,  isContractItem: 'Y', quantity: 2 }),
  makeSlot({ slotKey: 'DC_SOCKET',      slotLabel: 'DC Socket',            section: 'dl_internal', recipeIndex: 7,  isContractItem: 'Y', quantity: 2 }),
  makeSlot({ slotKey: 'DC_PLUG',        slotLabel: 'DC Plug',              section: 'dl_internal', recipeIndex: 8,  isContractItem: 'Y', quantity: 2 }),
  makeSlot({ slotKey: 'DC_SR',          slotLabel: 'DC Strain Relief',     section: 'dl_internal', recipeIndex: 9,  isContractItem: 'Y' }),
]

// 7. LIN+Tape+Profile — Linear Tape + Profile
const ingredientsLINTapeProfile = [
  makeSlot({ slotKey: 'DESIGN_ELEMENT', slotLabel: 'LIN Virtual Element',  section: 'position',     recipeIndex: 1,  isDesign: 'Y' }),
  makeSlot({ slotKey: 'LIN_SOCKET',     slotLabel: 'Linear Socket',         section: 'position',     recipeIndex: 2,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'CLIPS',          slotLabel: 'Retention Clips',       section: 'position',     recipeIndex: 3,  isContractItem: 'Y', isInteger: true }),
  makeSlot({ slotKey: 'LOCKING_LEVER',  slotLabel: 'Locking Lever',         section: 'position',     recipeIndex: 4,  isContractItem: 'Y', fixed: true }),
  makeSlot({ slotKey: 'TAPE',           slotLabel: 'LED Tape',              section: 'lin_internal', recipeIndex: 5,  dimQtyMultiplier: 1, fixed: true }),
  makeSlot({ slotKey: 'PROFILE',        slotLabel: 'Extrusion Profile',     section: 'lin_internal', recipeIndex: 6,  dimQtyMultiplier: 1, fixed: true }),
  makeSlot({ slotKey: 'DIFFUSER',       slotLabel: 'Diffuser',              section: 'lin_internal', recipeIndex: 7,  dimQtyMultiplier: 1, fixed: true }),
  makeSlot({ slotKey: 'END_CAPS',       slotLabel: 'End Caps',              section: 'lin_internal', recipeIndex: 8,  isContractItem: 'Y', quantity: 2, fixed: true }),
  makeSlot({ slotKey: 'LIN_PLUG',       slotLabel: 'Linear Plug',           section: 'lin_internal', recipeIndex: 9,  isContractItem: 'Y' }),
]

// 8. LIN+Flex+Mount — Linear Flex + Mount
const ingredientsLINFlexMount = [
  makeSlot({ slotKey: 'DESIGN_ELEMENT',  slotLabel: 'LIN Virtual Element',  section: 'position',     recipeIndex: 1,  isDesign: 'Y' }),
  makeSlot({ slotKey: 'LIN_SOCKET',      slotLabel: 'Linear Socket',         section: 'position',     recipeIndex: 2,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'MOUNT_CHANNEL',   slotLabel: 'Mounting Channel',      section: 'position',     recipeIndex: 3,  isContractItem: 'Y', dimQtyMultiplier: 1, fixed: true }),
  makeSlot({ slotKey: 'CLIPS',           slotLabel: 'Retention Clips',       section: 'position',     recipeIndex: 4,  isContractItem: 'Y', isInteger: true }),
  makeSlot({ slotKey: 'TAPE',            slotLabel: 'LED Flex Strip',        section: 'lin_internal', recipeIndex: 5,  dimQtyMultiplier: 1, fixed: true }),
  makeSlot({ slotKey: 'DIFFUSER',        slotLabel: 'Diffuser',              section: 'lin_internal', recipeIndex: 6,  dimQtyMultiplier: 1, fixed: true }),
  makeSlot({ slotKey: 'END_CAPS',        slotLabel: 'End Caps',              section: 'lin_internal', recipeIndex: 7,  isContractItem: 'Y', quantity: 2, fixed: true }),
  makeSlot({ slotKey: 'LIN_PLUG',        slotLabel: 'Linear Plug',           section: 'lin_internal', recipeIndex: 8,  isContractItem: 'Y' }),
]

// 9. LIN+Flex — Linear Flex Only (no profile/channel)
const ingredientsLINFlex = [
  makeSlot({ slotKey: 'DESIGN_ELEMENT', slotLabel: 'LIN Virtual Element',  section: 'position',     recipeIndex: 1,  isDesign: 'Y' }),
  makeSlot({ slotKey: 'LIN_SOCKET',     slotLabel: 'Linear Socket',         section: 'position',     recipeIndex: 2,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'TAPE',           slotLabel: 'LED Flex Strip',        section: 'lin_internal', recipeIndex: 3,  dimQtyMultiplier: 1, fixed: true }),
  makeSlot({ slotKey: 'LIN_PLUG',       slotLabel: 'Linear Plug',           section: 'lin_internal', recipeIndex: 4,  isContractItem: 'Y' }),
]

// 10. PANEL — PSU Enclosure
const ingredientsPANEL = [
  makeSlot({ slotKey: 'DESIGN_ELEMENT', slotLabel: 'PSU Virtual Element',   section: 'position', recipeIndex: 1,  isDesign: 'Y' }),
  makeSlot({ slotKey: 'REMOTE_SOCKET',  slotLabel: 'PSU Enclosure Body',    section: 'position', recipeIndex: 2,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'REMOTE_PLUG',    slotLabel: 'Cable Gland (Mains)',    section: 'position', recipeIndex: 3,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DC_SOCKET',      slotLabel: 'Cable Gland (DC Out)',   section: 'position', recipeIndex: 4,  isContractItem: 'Y' }),
  makeSlot({ slotKey: 'DC_PLUG',        slotLabel: 'Remote Driver / PSU',    section: 'position', recipeIndex: 5,  isContractItem: 'Y' }),
]

// ---------------------------------------------------------------------------
// Global template definitions
// ---------------------------------------------------------------------------

const GLOBAL_TEMPLATES = [
  {
    id: 'DL+Local',
    name: 'Local Downlight',
    scope: 'global',
    applicable_tags: ['DL', 'Local'],
    ingredients: ingredientsDLLocal,
    sort_order: 10,
  },
  {
    id: 'DL+Remote-CC',
    name: 'Remote Driver CC',
    scope: 'global',
    applicable_tags: ['DL', 'Remote-CC'],
    ingredients: ingredientsDLRemoteCC,
    sort_order: 20,
  },
  {
    id: 'DL+Exterior',
    name: 'Exterior / IP-Rated',
    scope: 'global',
    applicable_tags: ['DL', 'Exterior'],
    ingredients: ingredientsDLExterior,
    sort_order: 30,
  },
  {
    id: 'DL+Local+3Pin',
    name: 'Locally Switched',
    scope: 'global',
    applicable_tags: ['DL', 'Local', '3Pin-TE'],
    ingredients: ingredientsDLLocal3Pin,
    sort_order: 40,
  },
  {
    id: 'DL+Local+4Pin',
    name: 'Tuneable White',
    scope: 'global',
    applicable_tags: ['DL', 'Local', '4Pin-TW'],
    ingredients: ingredientsDLLocal4Pin,
    sort_order: 50,
  },
  {
    id: 'DL+Local+TwinSpot',
    name: 'Twin Spot',
    scope: 'global',
    applicable_tags: ['DL', 'Local', 'TwinSpot'],
    ingredients: ingredientsDLTwinSpot,
    sort_order: 60,
  },
  {
    id: 'LIN+Tape+Profile',
    name: 'Linear Tape + Profile',
    scope: 'global',
    applicable_tags: ['LIN', 'Tape+Profile'],
    ingredients: ingredientsLINTapeProfile,
    sort_order: 70,
  },
  {
    id: 'LIN+Flex+Mount',
    name: 'Linear Flex + Mount',
    scope: 'global',
    applicable_tags: ['LIN', 'Flex+Mount'],
    ingredients: ingredientsLINFlexMount,
    sort_order: 80,
  },
  {
    id: 'LIN+Flex',
    name: 'Linear Flex Only',
    scope: 'global',
    applicable_tags: ['LIN', 'Flex-Only'],
    ingredients: ingredientsLINFlex,
    sort_order: 90,
  },
  {
    id: 'PANEL',
    name: 'PSU Enclosure',
    scope: 'global',
    applicable_tags: ['PANEL'],
    ingredients: ingredientsPANEL,
    sort_order: 100,
  },
]

/**
 * Insert global templates only if none exist yet.
 * Safe to call on every app start.
 */
function seedGlobalTemplates() {
  const database = getDb()
  const count = database.prepare("SELECT COUNT(*) AS n FROM templates WHERE scope = 'global'").get().n
  if (count > 0) return

  const ts = now()
  const insert = database.prepare(`
    INSERT INTO templates (id, name, scope, project_id, base_template_id, applicable_tags, ingredients, sort_order, created_at, updated_at)
    VALUES (@id, @name, @scope, @project_id, @base_template_id, @applicable_tags, @ingredients, @sort_order, @created_at, @updated_at)
  `)

  const insertMany = database.transaction((templates) => {
    for (const t of templates) {
      insert.run({
        id: t.id,
        name: t.name,
        scope: t.scope,
        project_id: null,
        base_template_id: null,
        applicable_tags: JSON.stringify(t.applicable_tags),
        ingredients: JSON.stringify(t.ingredients),
        sort_order: t.sort_order,
        created_at: ts,
        updated_at: ts,
      })
    }
  })

  insertMany(GLOBAL_TEMPLATES)
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  initDb,
  getDb,
  upsertProject,
  getProject,
  getLastProject,
  updateLastOpened,
  upsertPositionUI,
  getPositionUI,
  getAllPositionUI,
  upsertTemplate,
  getTemplate,
  getAllTemplates,
  deleteTemplate,
  upsertSlotMapping,
  getSlotMappings,
  getAllSlotMappings,
  deleteSlotMapping,
  setPref,
  getPref,
  seedGlobalTemplates,
}

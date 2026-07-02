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
  migrate()
  return db
}

/**
 * migrate() — additive schema migrations for existing project DBs.
 * CREATE TABLE IF NOT EXISTS can't add columns to pre-existing tables, so we
 * check and ALTER here. Safe to run on every startup.
 */
function migrate() {
  const hasColumn = (table, column) =>
    db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column)

  if (!hasColumn('position_ui', 'ignored')) {
    db.exec(`ALTER TABLE position_ui ADD COLUMN ignored INTEGER DEFAULT 0`)
  }
  // Tag exceptions (Phase 2): per-position add/remove overrides on top of rule tags.
  if (!hasColumn('position_ui', 'tag_add')) {
    db.exec(`ALTER TABLE position_ui ADD COLUMN tag_add TEXT DEFAULT '[]'`)
  }
  if (!hasColumn('position_ui', 'tag_remove')) {
    db.exec(`ALTER TABLE position_ui ADD COLUMN tag_remove TEXT DEFAULT '[]'`)
  }

  // et_collections: excluded tags (excluded takes priority over applicable/included).
  if (!hasColumn('et_collections', 'ExcludedTags')) {
    db.exec(`ALTER TABLE et_collections ADD COLUMN ExcludedTags TEXT DEFAULT '[]'`)
  }

  // projects: config-aware identity. Old schema keyed by UNIQUE(folder_path) with
  // no config columns. Rebuild preserving `id` so overlay FKs stay valid, and
  // switch the unique constraint to (folder_path, config_name).
  if (!hasColumn('projects', 'config_name')) {
    db.pragma('foreign_keys = OFF')
    const rebuild = db.transaction(() => {
      db.exec(`
        CREATE TABLE projects_new (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          folder_path    TEXT NOT NULL,
          config_name    TEXT NOT NULL DEFAULT 'Base',
          project_number TEXT,
          project_label  TEXT,
          db_filename    TEXT,
          ps_filename    TEXT,
          rs_filename    TEXT,
          last_opened    TEXT,
          UNIQUE(folder_path, config_name)
        );
        INSERT INTO projects_new (id, folder_path, config_name, db_filename, ps_filename, rs_filename, last_opened)
          SELECT id, folder_path, 'Base', db_filename, ps_filename, rs_filename, last_opened FROM projects;
        DROP TABLE projects;
        ALTER TABLE projects_new RENAME TO projects;
      `)
    })
    rebuild()
    db.pragma('foreign_keys = ON')
  }
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
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_path    TEXT NOT NULL,
      config_name    TEXT NOT NULL DEFAULT 'Base',
      project_number TEXT,
      project_label  TEXT,
      db_filename    TEXT,
      ps_filename    TEXT,
      rs_filename    TEXT,
      last_opened    TEXT,
      UNIQUE(folder_path, config_name)
    );

    CREATE TABLE IF NOT EXISTS position_ui (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id         INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      position_type_ref  TEXT NOT NULL,
      tags               TEXT DEFAULT '[]',
      tag_source         TEXT DEFAULT '{}',
      tag_confidence     TEXT DEFAULT 'high',
      tag_add            TEXT DEFAULT '[]',
      tag_remove         TEXT DEFAULT '[]',
      user_notes         TEXT DEFAULT '',
      ignored            INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS et_collections (
      CollectionId    TEXT PRIMARY KEY,
      project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      Name            TEXT NOT NULL,
      ApplicableTags  TEXT DEFAULT '[]',
      Ingredients     TEXT DEFAULT '[]',
      CreatedAt       TEXT,
      UpdatedAt       TEXT
    );

    -- User "favourites pot": cross-project, not tied to any project_id.
    -- kind: 'tag' | 'element'  (favourite templates reuse scope='global' templates)
    CREATE TABLE IF NOT EXISTS favorites (
      id          TEXT PRIMARY KEY,
      kind        TEXT NOT NULL,
      ref         TEXT,
      label       TEXT,
      data        TEXT DEFAULT '{}',
      created_at  TEXT
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

function upsertProject(folderPath, configName = 'Base', projectNumber = null, projectLabel = null, dbFilename = null, psFilename = null, rsFilename = null) {
  const database = getDb()
  const ts = now()
  const config = configName || 'Base'
  database
    .prepare(`
      INSERT INTO projects (folder_path, config_name, project_number, project_label, db_filename, ps_filename, rs_filename, last_opened)
      VALUES (@folderPath, @config, @projectNumber, @projectLabel, @dbFilename, @psFilename, @rsFilename, @ts)
      ON CONFLICT(folder_path, config_name) DO UPDATE SET
        project_number = excluded.project_number,
        project_label  = excluded.project_label,
        db_filename    = excluded.db_filename,
        ps_filename    = excluded.ps_filename,
        rs_filename    = excluded.rs_filename,
        last_opened    = excluded.last_opened
    `)
    .run({ folderPath, config, projectNumber, projectLabel, dbFilename, psFilename, rsFilename, ts })
  return database.prepare('SELECT * FROM projects WHERE folder_path = ? AND config_name = ?').get(folderPath, config)
}

function getProject(folderPath, configName = 'Base') {
  return getDb()
    .prepare('SELECT * FROM projects WHERE folder_path = ? AND config_name = ?')
    .get(folderPath, configName || 'Base') || null
}

/** All configs saved for a folder, most-recently-opened first. */
function getConfigsForFolder(folderPath) {
  return getDb()
    .prepare('SELECT * FROM projects WHERE folder_path = ? ORDER BY last_opened DESC')
    .all(folderPath)
}

/** Every project/config row, for the project manager. */
function getAllProjects() {
  return getDb()
    .prepare('SELECT * FROM projects ORDER BY project_number, folder_path, config_name')
    .all()
}

/** Wipe a single config (cascade deletes all its overlay data). */
function deleteProject(projectId) {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(projectId)
  return true
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

function upsertPositionUI(projectId, positionTypeRef, { tags = [], tagAdd = [], tagRemove = [], userNotes = '', ignored = false } = {}) {
  const database = getDb()
  database
    .prepare(`
      INSERT INTO position_ui (project_id, position_type_ref, tags, tag_add, tag_remove, user_notes, ignored)
      VALUES (@projectId, @positionTypeRef, @tags, @tagAdd, @tagRemove, @userNotes, @ignored)
      ON CONFLICT(project_id, position_type_ref) DO UPDATE SET
        tags       = excluded.tags,
        tag_add    = excluded.tag_add,
        tag_remove = excluded.tag_remove,
        user_notes = excluded.user_notes,
        ignored    = excluded.ignored
    `)
    .run({
      projectId,
      positionTypeRef,
      tags: JSON.stringify(tags),
      tagAdd: JSON.stringify(tagAdd),
      tagRemove: JSON.stringify(tagRemove),
      userNotes,
      ignored: ignored ? 1 : 0,
    })
  return getPositionUI(projectId, positionTypeRef)
}

function parsePositionUIRow(row) {
  if (!row) return null
  return {
    ...row,
    tags: JSON.parse(row.tags || '[]'),
    tag_add: JSON.parse(row.tag_add || '[]'),
    tag_remove: JSON.parse(row.tag_remove || '[]'),
    tag_source: JSON.parse(row.tag_source || '{}'),
    ignored: !!row.ignored,
  }
}

function getPositionUI(projectId, positionTypeRef) {
  const row = getDb()
    .prepare('SELECT * FROM position_ui WHERE project_id = ? AND position_type_ref = ?')
    .get(projectId, positionTypeRef)
  return parsePositionUIRow(row)
}

function getAllPositionUI(projectId) {
  return getDb()
    .prepare('SELECT * FROM position_ui WHERE project_id = ?')
    .all(projectId)
    .map(parsePositionUIRow)
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
// Favourites (cross-project user library: tags + elements)
// ---------------------------------------------------------------------------

function parseFavorite(row) {
  if (!row) return null
  let data = {}
  try { data = JSON.parse(row.data || '{}') } catch { data = {} }
  return { ...row, data }
}

function upsertFavorite(fav) {
  const ts = now()
  const { id, kind, ref = null, label = null, data = {}, created_at = ts } = fav
  getDb()
    .prepare(`
      INSERT INTO favorites (id, kind, ref, label, data, created_at)
      VALUES (@id, @kind, @ref, @label, @data, @created_at)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind, ref = excluded.ref, label = excluded.label, data = excluded.data
    `)
    .run({ id, kind, ref, label, data: JSON.stringify(data), created_at })
  return parseFavorite(getDb().prepare('SELECT * FROM favorites WHERE id = ?').get(id))
}

function getFavorites() {
  return getDb()
    .prepare('SELECT * FROM favorites ORDER BY created_at ASC, id ASC')
    .all()
    .map(parseFavorite)
}

function deleteFavorite(id) {
  getDb().prepare('DELETE FROM favorites WHERE id = ?').run(id)
}

/** All prefs for a project as a { key: value } map. */
function getAllPrefs(projectId) {
  const rows = getDb()
    .prepare('SELECT key, value FROM project_prefs WHERE project_id = ?')
    .all(projectId)
  const out = {}
  for (const r of rows) out[r.key] = r.value
  return out
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
// ET Collections
// ---------------------------------------------------------------------------

function parseCollection(row) {
  if (!row) return null
  return {
    ...row,
    ApplicableTags: JSON.parse(row.ApplicableTags || '[]'),
    ExcludedTags:   JSON.parse(row.ExcludedTags   || '[]'),
    Ingredients:    JSON.parse(row.Ingredients    || '[]'),
  }
}

function upsertCollection(projectId, collection) {
  const database = getDb()
  const ts = now()
  const {
    CollectionId,
    Name,
    ApplicableTags = [],
    ExcludedTags   = [],
    Ingredients    = [],
    CreatedAt      = ts,
  } = collection

  database
    .prepare(`
      INSERT INTO et_collections (CollectionId, project_id, Name, ApplicableTags, ExcludedTags, Ingredients, CreatedAt, UpdatedAt)
      VALUES (@CollectionId, @project_id, @Name, @ApplicableTags, @ExcludedTags, @Ingredients, @CreatedAt, @UpdatedAt)
      ON CONFLICT(CollectionId) DO UPDATE SET
        Name           = excluded.Name,
        ApplicableTags = excluded.ApplicableTags,
        ExcludedTags   = excluded.ExcludedTags,
        Ingredients    = excluded.Ingredients,
        UpdatedAt      = excluded.UpdatedAt
    `)
    .run({
      CollectionId,
      project_id:    projectId,
      Name,
      ApplicableTags: JSON.stringify(ApplicableTags),
      ExcludedTags:   JSON.stringify(ExcludedTags),
      Ingredients:    JSON.stringify(Ingredients),
      CreatedAt,
      UpdatedAt: ts,
    })
  return parseCollection(
    database.prepare('SELECT * FROM et_collections WHERE CollectionId = ?').get(CollectionId)
  )
}

function getAllCollections(projectId) {
  return getDb()
    .prepare('SELECT * FROM et_collections WHERE project_id = ? ORDER BY CreatedAt ASC')
    .all(projectId)
    .map(parseCollection)
}

function deleteCollection(collectionId) {
  getDb().prepare('DELETE FROM et_collections WHERE CollectionId = ?').run(collectionId)
}

// ---------------------------------------------------------------------------
// Config overlay data (for YAML export/import)
//
// "Overlay" = everything a user adds on top of the imported dataset, scoped to
// one config (a projects row): position UI/tags, collections, slot mappings,
// project-scoped templates, and prefs. main.js handles YAML (de)serialisation
// and file dialogs; these just gather/apply plain JS objects.
// ---------------------------------------------------------------------------

function collectConfigData(projectId) {
  const database = getDb()
  const project = database.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
  const projectTemplates = database
    .prepare("SELECT * FROM templates WHERE project_id = ? AND scope = 'project'")
    .all(projectId)
    .map(parseTemplate)

  return {
    version: 1,
    project: project ? {
      project_number: project.project_number,
      project_label:  project.project_label,
      config_name:    project.config_name,
    } : null,
    position_ui:   getAllPositionUI(projectId),
    collections:   getAllCollections(projectId),
    slot_mappings: getAllSlotMappings(projectId),   // { templateId: { slotKey: ref } }
    templates:     projectTemplates,
    prefs:         getAllPrefs(projectId),
  }
}

function applyConfigData(projectId, data = {}) {
  const database = getDb()
  const apply = database.transaction(() => {
    // Project metadata (number/label) — config_name stays as the target's own
    if (data.project) {
      database
        .prepare('UPDATE projects SET project_number = COALESCE(@number, project_number), project_label = COALESCE(@label, project_label) WHERE id = @id')
        .run({ id: projectId, number: data.project.project_number ?? null, label: data.project.project_label ?? null })
    }

    for (const row of (data.position_ui || [])) {
      upsertPositionUI(projectId, row.position_type_ref, {
        tags:      row.tags || [],
        tagAdd:    row.tag_add || [],
        tagRemove: row.tag_remove || [],
        userNotes: row.user_notes || '',
        ignored:   !!row.ignored,
      })
    }

    for (const c of (data.collections || [])) {
      upsertCollection(projectId, c)
    }

    for (const [templateId, slots] of Object.entries(data.slot_mappings || {})) {
      for (const [slotKey, entityRef] of Object.entries(slots || {})) {
        upsertSlotMapping(projectId, templateId, slotKey, entityRef)
      }
    }

    for (const t of (data.templates || [])) {
      upsertTemplate({ ...t, project_id: projectId, scope: 'project' })
    }

    for (const [key, value] of Object.entries(data.prefs || {})) {
      setPref(projectId, key, value)
    }
  })
  apply()
  return true
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  initDb,
  getDb,
  upsertProject,
  getProject,
  getConfigsForFolder,
  getAllProjects,
  deleteProject,
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
  getAllPrefs,
  seedGlobalTemplates,
  upsertCollection,
  getAllCollections,
  deleteCollection,
  upsertFavorite,
  getFavorites,
  deleteFavorite,
  collectConfigData,
  applyConfigData,
}

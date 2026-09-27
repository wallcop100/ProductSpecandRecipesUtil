/**
 * templateLoader.js
 * Matches position tags to the best available template, and converts existing
 * filled recipes back into reusable template definitions.
 */

import { v4 as uuidv4 } from 'uuid'

/**
 * Parse applicable_tags from a template record.
 * Handles both string (JSON) and array forms.
 *
 * @param {string|string[]} raw
 * @returns {string[]}
 */
function parseApplicableTags(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return []
    }
  }
  return []
}

/**
 * Parse ingredients from a template record.
 * Handles both string (JSON) and array forms.
 *
 * @param {string|array} raw
 * @returns {array}
 */
function parseIngredients(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return []
    }
  }
  return []
}

/**
 * Find the best matching template for a tag set.
 *
 * Project-level templates are checked first (they can override globals that
 * share the same base_template_id). Among templates of equal scope, the one
 * with the most matching tags (most specific) wins.
 *
 * A template matches when ALL of its applicable_tags are present in the
 * position's tag array.
 *
 * @param {string[]} tags - position type's tags
 * @param {object[]} allTemplates - from SQLite getAllTemplates()
 * @returns {object|null} template (with ingredients already parsed from JSON)
 */
export function findBestTemplate(tags, allTemplates) {
  if (!tags || !allTemplates || allTemplates.length === 0) return null

  const tagSet = new Set(tags)

  // Build candidate list: only templates where ALL applicable_tags are in tagSet
  const candidates = []
  for (const tpl of allTemplates) {
    const applicableTags = parseApplicableTags(tpl.applicable_tags)
    if (applicableTags.length === 0) continue
    const allMatch = applicableTags.every(t => tagSet.has(t))
    if (allMatch) {
      candidates.push({ ...tpl, _parsed_tags: applicableTags })
    }
  }

  if (candidates.length === 0) return null

  // Separate by scope
  const projectCandidates = candidates.filter(t => t.scope === 'project')
  const globalCandidates = candidates.filter(t => t.scope !== 'project')

  // Pick best within each scope (most matching tags = most specific)
  function mostSpecific(list) {
    if (list.length === 0) return null
    return list.reduce((best, cur) =>
      cur._parsed_tags.length > best._parsed_tags.length ? cur : best
    )
  }

  // Project overrides global when they share base_template_id or have equal specificity
  let winner = null

  if (projectCandidates.length > 0) {
    const bestProject = mostSpecific(projectCandidates)
    const bestGlobal = mostSpecific(globalCandidates)

    if (!bestGlobal) {
      winner = bestProject
    } else if (bestProject._parsed_tags.length >= bestGlobal._parsed_tags.length) {
      // Project template at least as specific as global — project wins
      winner = bestProject
    } else {
      // Global is more specific (has more tags)
      winner = bestGlobal
    }
  } else {
    winner = mostSpecific(globalCandidates)
  }

  if (!winner) return null

  // Return a clean copy with ingredients parsed
  const { _parsed_tags, ...rest } = winner
  return {
    ...rest,
    applicable_tags: _parsed_tags,
    ingredients: parseIngredients(rest.ingredients),
  }
}

/**
 * Produce a new template definition from an existing filled recipe.
 *
 * @param {object} recipe - { position: [], dlInternal: [], linInternal: [] }
 * @param {string} templateName
 * @param {'global'|'project'} scope
 * @returns {object} template ready for SQLite insert (ingredients as JSON string)
 */
export function recipeToTemplate(recipe, templateName, scope = 'project', suggestedTags = []) {
  const sections = [
    { key: 'position', rows: recipe.position || [] },
    { key: 'dl_internal', rows: recipe.dlInternal || [] },
    { key: 'lin_internal', rows: recipe.linInternal || [] },
  ]

  const ingredients = []
  let slotCounter = 1

  for (const { key: section, rows } of sections) {
    rows.forEach((row, idx) => {
      const etRef = row.elementTypeRef || row.ElementTypeRef || null

      // Generate a slotKey from the ET ref's last segment, or sequential fallback
      let slotKey
      if (etRef) {
        const segments = etRef.split(/[-_]/)
        const lastSegment = segments[segments.length - 1].toUpperCase()
        // Only use the segment if it's reasonably short and alphanumeric
        if (lastSegment && lastSegment.length <= 12 && /^[A-Z0-9]+$/.test(lastSegment)) {
          slotKey = lastSegment
        } else {
          slotKey = `SLOT_${slotCounter++}`
        }
      } else {
        slotKey = `SLOT_${slotCounter++}`
      }

      const slotLabel = etRef || `Slot ${idx + 1}`

      const ingredient = {
        slotKey,
        slotLabel,
        section,
        recipeIndex: row.recipeIndex !== undefined ? row.recipeIndex : idx,
        isDesign: row.isDesign || row.IsDesign || null,
        isContractItem: row.isContractItem || row.IsContractItem || null,
        isTBC: row.isTBC || row.IsTBC || null,
        isPropertiesTBC: row.isPropertiesTBC || row.IsPropertiesTBC || null,
        quantity: row.quantity || row.Quantity || null,
        dimQtyMultiplier: row.dimQtyMultiplier || row.DimQtyMultiplier || null,
        dimQuantity: row.dimQuantity || row.Dim_Quantity || null,
        isInteger: row.isInteger || row.IsInteger || null,
        notes: row.notes || row.Notes || null,
        // fixed = true when quantity or flags are explicitly set in the source row
        fixed: !!(
          row.quantity !== undefined && row.quantity !== null ||
          row.Quantity !== undefined && row.Quantity !== null
        ),
      }

      ingredients.push(ingredient)
    })
  }

  return {
    id: uuidv4(),
    name: templateName,
    scope,
    applicable_tags: JSON.stringify(Array.isArray(suggestedTags) ? suggestedTags : []),
    ingredients: JSON.stringify(ingredients),
  }
}

// ---------------------------------------------------------------------------
// Recipe templates — a finished recipe, saved to be applied elsewhere.
// ---------------------------------------------------------------------------

const lcRef = s => String(s ?? '').trim().toLowerCase()
const f = (r, a, b) => r[a] ?? r[b] ?? null

/** A readable slot key from a ref's words: ET-LIN-PROF-01 → PROF, ET-DRIVER-CCL-02 → DRIVER-CCL. */
export function slotKeyFor(ref, used = new Set()) {
  const words = String(ref || '').toUpperCase().split(/[-_\s]+/)
    .filter(w => w && w !== 'ET' && !/^\d+$/.test(w))
  const base = (words.length > 1 && ['LIN', 'PS', 'DL'].includes(words[0]) ? words.slice(1) : words).join('-') || 'SLOT'
  let key = base, n = 2
  while (used.has(key)) key = `${base}-${n++}`
  used.add(key)
  return key
}

/** Saved from a recipe: every ingredient names its real ElementType (no slot mapping). */
export function isRecipeTemplate(template) {
  const ings = Array.isArray(template?.ingredients) ? template.ingredients : []
  return ings.length > 0 && ings.every(i => i.exact || i.newWrapper)
}

/**
 * A position's recipe → a template. `rows` are the rows to keep (the user may untick some).
 * The position's wrapper is stored as "a new wrapper of this kind" (`newWrapper: 'LIN'|'DL'`),
 * not as its ref: applying the template to another position must not silently share it.
 * Everything else keeps its actual ElementType (`exact`), quantities and flags.
 */
export function recipeTemplateFromRows(rows, { name, scope = 'project', tags = [], containerETRefs = new Set() } = {}) {
  const live = rows.filter(r => f(r, 'IsDeleted', 'isDeleted') !== 'Y')
  const pos = live.filter(r => f(r, 'ContextType', 'contextType') === 'PositionType')
  const inside = live.filter(r => f(r, 'ContextType', 'contextType') === 'ElementType')
  const byIndex = (a, b) => (f(a, 'RecipeIndex', 'recipeIndex') ?? 0) - (f(b, 'RecipeIndex', 'recipeIndex') ?? 0)
  const used = new Set()
  const ingredient = (r, section) => {
    const ref = f(r, 'ElementTypeRef', 'elementTypeRef')
    const wrapper = section === 'position' && containerETRefs.has(lcRef(ref))
    return {
      slotKey: wrapper ? 'DESIGN_ELEMENT' : slotKeyFor(ref, used),
      slotLabel: ref,
      section,
      ...(wrapper ? { newWrapper: /LIN/i.test(ref) ? 'LIN' : 'DL' } : { exact: true }),
      isDesign: f(r, 'IsDesign', 'isDesign'),
      isContractItem: f(r, 'IsContractItem', 'isContractItem'),
      isTRItem: f(r, 'IsTRItem', 'isTRItem'),
      isTBC: f(r, 'IsTBC', 'isTBC'),
      isPropertiesTBC: f(r, 'IsPropertiesTBC', 'isPropertiesTBC'),
      quantity: f(r, 'Quantity', 'quantity'),
      dimQtyMultiplier: f(r, 'Dim_QuantityMultiplier', 'dimQtyMultiplier'),
      dimQuantity: f(r, 'Dim_Quantity', 'dimQuantity'),
      isInteger: f(r, 'IsInteger', 'isInteger'),
      packQuantity: f(r, 'PackQuantity', 'packQuantity'),
      notes: f(r, 'Notes', 'notes'),
    }
  }
  return {
    id: uuidv4(),
    name,
    scope,
    applicable_tags: Array.isArray(tags) ? tags : [],
    ingredients: [
      ...pos.sort(byIndex).map(r => ingredient(r, 'position')),
      ...inside.sort(byIndex).map(r => ingredient(r, 'dl_internal')),
    ],
  }
}

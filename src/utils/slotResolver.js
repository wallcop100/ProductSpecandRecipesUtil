/**
 * slotResolver.js
 * Resolves template slot definitions against project slot mappings to produce
 * recipe rows ready for the store.
 */

import { DIM_QTY_COMPONENTS, AUTO_CONTRACT_ITEMS } from './constants.js'

/**
 * Resolve template slots against project slot mappings.
 *
 * @param {object} template - { id, ingredients: [] } (ingredients already parsed from JSON)
 * @param {object} slotMappings - { slotKey: entityRef }
 * @param {string[]} elementTypeRefs - all ET refs available in this project's DB
 * @returns {array} resolvedIngredients - each has { ...ingredientDef, entityRef, resolved, etExists }
 */
export function resolveTemplate(template, slotMappings, elementTypeRefs) {
  const ingredients = template.ingredients || []
  const etSet = new Set((elementTypeRefs || []).map(r => r.toUpperCase()))

  return ingredients.map(ingredient => {
    const slotKey = ingredient.slotKey

    // "Exact Ref" ingredients are fixed, not primed — the slotLabel IS the
    // ElementTypeRef and the row applies already-resolved (T-R1).
    if (ingredient.exact && ingredient.slotLabel) {
      const ref = ingredient.slotLabel
      return { ...ingredient, entityRef: ref, resolved: true, etExists: etSet.has(ref.toUpperCase()) }
    }

    const entityRef = slotMappings[slotKey] || null
    const resolved = entityRef !== null && entityRef !== undefined

    let etExists = false
    if (resolved) {
      etExists = etSet.has(entityRef.toUpperCase())
    }

    return {
      ...ingredient,
      entityRef,
      resolved,
      etExists,
    }
  })
}

/**
 * Return resolution status for a set of resolved ingredients.
 *
 * @param {array} resolvedIngredients
 * @returns {{ total: number, resolved: number, missing: string[] }}
 */
export function getResolutionStatus(resolvedIngredients) {
  const total = resolvedIngredients.length
  let resolved = 0
  const missing = []

  for (const ing of resolvedIngredients) {
    if (ing.resolved) {
      resolved++
    } else {
      missing.push(ing.slotKey)
    }
  }

  return { total, resolved, missing }
}

/**
 * Determine contextType and contextRef for a given ingredient section.
 * For dl_internal / lin_internal the contextRef is the DESIGN_ELEMENT entity ref.
 *
 * @param {string} section
 * @param {string} positionTypeRef
 * @param {array} resolvedIngredients - full list (so we can find DESIGN_ELEMENT)
 * @returns {{ contextType: string, contextRef: string|null }}
 */
function resolveContext(section, positionTypeRef, resolvedIngredients) {
  if (section === 'position') {
    return { contextType: 'PositionType', contextRef: positionTypeRef }
  }

  if (section === 'dl_internal' || section === 'lin_internal') {
    const designEl = resolvedIngredients.find(
      i => i.slotKey === 'DESIGN_ELEMENT' && i.isDesign === 'Y'
    )
    const contextRef = designEl ? designEl.entityRef : null
    return { contextType: 'ElementType', contextRef }
  }

  // Fallback: treat as position level
  return { contextType: 'PositionType', contextRef: positionTypeRef }
}

/**
 * Check whether a token string appears in an entity ref (case-insensitive).
 *
 * @param {string} entityRef
 * @param {string} token
 * @returns {boolean}
 */
function entityRefContains(entityRef, token) {
  if (!entityRef) return false
  return entityRef.toUpperCase().includes(token.toUpperCase())
}

/**
 * Apply resolved ingredients to produce recipe rows ready for the store.
 *
 * @param {array} resolvedIngredients
 * @param {string} positionTypeRef
 * @returns {array} recipe rows
 */
export function applyResolvedTemplate(resolvedIngredients, positionTypeRef) {
  return resolvedIngredients.map((ingredient, index) => {
    const {
      slotKey,
      section,
      entityRef,
      resolved,
      etExists,
      isDesign,
      isContractItem: rawIsContractItem,
      isTBC,
      isPropertiesTBC,
      notes,
      fixed,
      recipeIndex,
    } = ingredient

    const { contextType, contextRef } = resolveContext(
      section,
      positionTypeRef,
      resolvedIngredients
    )

    // Quantity: default 1, or 2 for CAP tokens
    let quantity = ingredient.quantity !== undefined && ingredient.quantity !== null
      ? ingredient.quantity
      : 1

    if (!fixed && entityRefContains(entityRef, 'CAP')) {
      quantity = 2
    }

    // DimQtyMultiplier: default 1 for DIM_QTY_COMPONENTS tokens
    let dimQtyMultiplier = ingredient.dimQtyMultiplier !== undefined && ingredient.dimQtyMultiplier !== null
      ? ingredient.dimQtyMultiplier
      : null

    if (entityRef) {
      const isDimComponent = DIM_QTY_COMPONENTS.some(token =>
        entityRefContains(entityRef, token)
      )
      if (isDimComponent && dimQtyMultiplier === null) {
        dimQtyMultiplier = 1
      }
    }

    // isContractItem: auto-set Y for AUTO_CONTRACT_ITEMS tokens
    let isContractItem = rawIsContractItem || null
    if (entityRef) {
      const isAutoContract = AUTO_CONTRACT_ITEMS.some(token =>
        entityRefContains(entityRef, token)
      )
      if (isAutoContract) {
        isContractItem = 'Y'
      }
    }

    return {
      positionTypeRef,
      contextType,
      contextRef,
      recipeIndex: recipeIndex !== undefined ? recipeIndex : index,
      elementTypeRef: resolved ? entityRef : null,
      quantity,
      dimQtyMultiplier,
      dimQuantity: ingredient.dimQuantity !== undefined ? ingredient.dimQuantity : null,
      isInteger: ingredient.isInteger !== undefined ? ingredient.isInteger : null,
      isDesign: isDesign || null,
      isContractItem,
      isTBC: isTBC || null,
      isPropertiesTBC: isPropertiesTBC || null,
      notes: notes || null,
      slotKey,
      slotLabel: ingredient.slotLabel ?? null,
      resolved,
      etExists: resolved ? etExists : null,
    }
  })
}

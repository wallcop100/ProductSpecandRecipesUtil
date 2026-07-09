import React from 'react'
import { Alert } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'

/**
 * RecipeErrorBanner — why the last add was refused.
 *
 * The only refusal today: an internal row with no wrapper to live inside. It used
 * to be written anyway with a blank ContextRef, which the patch script then skipped,
 * appending a row parented to nothing. Refusing loudly beats corrupting quietly.
 */
export default function RecipeErrorBanner() {
  const recipeError = useStore(s => s.recipeError)
  const clearRecipeError = useStore(s => s.clearRecipeError)
  if (!recipeError) return null

  return (
    <Alert variant="danger" dismissible onClose={clearRecipeError}
      className="py-2 px-3 mb-3 d-flex align-items-start gap-2" style={{ fontSize: 12 }}>
      <MaterialIcon name="block" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{recipeError}</span>
    </Alert>
  )
}

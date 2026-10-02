import React from 'react'
import { Button, ButtonGroup } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'

/**
 * SurfaceSwitch: Recipes | Product Spec, the two surfaces you move between (96KPJ5,
 * XZ3UBB). The same pair sits in the builder's toolbar and in the Product Spec's header
 * (98GPK7), so the way back is where the way in was.
 */
export default function SurfaceSwitch({ active, onRecipes, onProductSpec, className = 'ms-2' }) {
  return (
    <ButtonGroup size="sm" className={className}>
      <Button variant={active === 'recipes' ? 'primary' : 'outline-primary'}
        onClick={onRecipes}
        className="d-inline-flex align-items-center gap-1"
        title="Recipes: browse by PositionType" data-testid="view-recipes">
        <MaterialIcon name="receipt_long" size={15} /> Recipes
      </Button>
      <Button variant={active === 'spec' ? 'primary' : 'outline-primary'}
        onClick={onProductSpec}
        className="d-inline-flex align-items-center gap-1"
        title="Product Spec" data-testid="open-product-spec">
        <MaterialIcon name="inventory_2" size={15} /> Product Spec
      </Button>
    </ButtonGroup>
  )
}

/**
 * The scene registry: card scripts in tutorials.js name scenes by key.
 * Every scene is presentational — `({ beat }) => JSX` — and store-free.
 */
import TreeScene from './TreeScene'
import RecipeScene from './RecipeScene'
import WrapperScene from './WrapperScene'
import PaletteScene from './PaletteScene'
import PaintScene from './PaintScene'
import FormPaneScene from './FormPaneScene'
import SpecScene from './SpecScene'
import ExportScene from './ExportScene'
import MatrixScene from './MatrixScene'
import TemplateScene from './TemplateScene'
import StatusScene from './StatusScene'

export const SCENES = {
  tree: TreeScene,
  recipe: RecipeScene,
  wrapper: WrapperScene,
  palette: PaletteScene,
  paint: PaintScene,
  formpane: FormPaneScene,
  spec: SpecScene,
  export: ExportScene,
  matrix: MatrixScene,
  template: TemplateScene,
  status: StatusScene,
}

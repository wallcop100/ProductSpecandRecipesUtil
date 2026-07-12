/**
 * tutorials.js — every tutorial card, as data.
 *
 * A card = { title, icon, intro, steps }. Each step = { blurb, scene, beat }: `scene` names
 * an entry in SCENES (src/tutorial/scenes/index.js) and `beat` is the integer the scene
 * animates towards. Adding a pane's tutorial is writing a script here plus (usually) one
 * scene component — all copy lives in this one reviewable file.
 *
 * DELIBERATELY no ordering between cards and no "next pane" step anywhere: FEATURESET.md
 * forbids a linear tour. Each card teaches the pane it is anchored to, full stop. Cards
 * teach ACTIONS; the four ConceptCards keep teaching IDEAS, and where a step touches one
 * (wrapper, ExtRef, read-only, intent) the blurb points at the existing ConceptHint rather
 * than re-explaining.
 */

export const TUTORIALS = {
  'builder-tree': {
    title: 'The project tree',
    icon: 'account_tree',
    intro: 'Every PositionType in the DesignDB, in one scannable list. This is where you see what is left to do, and where you pick the position to work on.',
    steps: [
      { blurb: 'The tree lists every position the DesignDB defines, grouped by family. You never create positions here — the DesignDB is the master.', scene: 'tree', beat: 0 },
      { blurb: 'Filter by ref, name or tag. The tag chips and the "Form incomplete" chip stack with the text filter.', scene: 'tree', beat: 1 },
      { blurb: 'The coverage bar counts positions that have at least one recipe row. It is the "how far through am I?" number.', scene: 'tree', beat: 2 },
      { blurb: 'Some positions genuinely need no recipe. Flag one as ignored and it leaves every total — reachable, but no longer nagging.', scene: 'tree', beat: 3 },
      { blurb: 'Click a position and the whole surface becomes its recipe editor. Everything else you learn in there.', scene: 'tree', beat: 4 },
    ],
  },

  'recipe-editor': {
    title: 'The recipe editor',
    icon: 'receipt_long',
    intro: 'One position\'s recipe: the ingredients it is built from, each row an ElementType and the product it resolves to.',
    steps: [
      { blurb: 'A row is an ingredient. The pill is the ElementType; after the arrow, the product the Product Spec says it is.', scene: 'recipe', beat: 0 },
      { blurb: 'Quantity hides behind the category icon — click it and a stepper slides open.', scene: 'recipe', beat: 1 },
      { blurb: 'Flags say what a row IS: exactly one Design element per recipe; Contract items are supplied, not bought.', scene: 'recipe', beat: 2 },
      { blurb: 'Add Entity forks: pick an ElementType you already have, or mint a new one without leaving the pane.', scene: 'recipe', beat: 3 },
      { blurb: 'The new row lands in the open section and reads New until it is exported.', scene: 'recipe', beat: 4 },
      { blurb: 'Delete marks IsDeleted — the row greys out, stays restorable, and syncs to Excel at export. Nothing is destroyed.', scene: 'recipe', beat: 5 },
    ],
  },

  'wrapper-internals': {
    title: 'Wrapper internals — shared by design',
    icon: 'inventory_2',
    intro: 'A wrapper is an assembly: a virtual ElementType whose real deliverables are its contents. And an assembly is SHARED.',
    steps: [
      { blurb: 'L01 and L02 both use ET-LIN-01. That is one assembly appearing in two recipes — not two copies.', scene: 'wrapper', beat: 0 },
      { blurb: 'Edit internals opens the assembly itself: the tape, profile and diffuser inside it.', scene: 'wrapper', beat: 1 },
      { blurb: 'Add something inside…', scene: 'wrapper', beat: 2 },
      { blurb: '…and every position using the wrapper now contains it. Edits ripple — the header names who is affected before you start.', scene: 'wrapper', beat: 3 },
      { blurb: 'When one position needs to differ, Fork gives it its own copy. The other positions keep the original, untouched.', scene: 'wrapper', beat: 4 },
    ],
  },

  'palette': {
    title: 'The palette drawer',
    icon: 'widgets',
    intro: 'Everything you can pull INTO a recipe, in one drawer: ElementTypes, templates, favourites, and what comparable positions already do.',
    steps: [
      { blurb: 'Four sources, four tabs. The drawer opens itself whenever a position is open — it is only useful while one is.', scene: 'palette', beat: 0 },
      { blurb: 'ElementTypes: browse by ref or by manufacturer + code, then drag one in (or click it).', scene: 'palette', beat: 1 },
      { blurb: 'Templates REPLACE the whole recipe — a confirm stands in the way when rows already exist. Additive things live elsewhere.', scene: 'palette', beat: 2 },
      { blurb: 'Star anything you reach for often. Favourites are yours, across every project.', scene: 'palette', beat: 3 },
      { blurb: '"Like this" ranks comparable positions — same family, tags, recipe overlap, never the ref spelling — and lets you borrow rows.', scene: 'palette', beat: 4 },
    ],
  },

  'code-import': {
    title: 'Importing product codes',
    icon: 'auto_fix_high',
    intro: 'The design team\'s Form arrives as freehand spreadsheet text. This screen turns it into distinct product codes with ElementTypes — stages ① and ② of the whole workflow.',
    steps: [
      { blurb: 'The bar at the top IS the method: ① identify codes ② assign ElementTypes ③ build recipes. This screen owns ① and ② and stops there.', scene: 'paint', beat: 0 },
      { blurb: 'First, the Form\'s position names are routed to real PositionTypes via the DB\'s ExtRef column — never guessed from spelling.', scene: 'paint', beat: 1 },
      { blurb: 'Then you paint. Keys 1/2/3 mark a token as code, note, or noise — and painting one token teaches every row that contains it.', scene: 'paint', beat: 2 },
      { blurb: 'Each distinct code then needs an ElementType: reuse one the spec already has, or create one on the spot.', scene: 'paint', beat: 3 },
      { blurb: 'Stage writes the Form template and the Product Spec rows — and deliberately not one recipe row. Stage ③ is yours, in the builder.', scene: 'paint', beat: 4 },
    ],
  },

  'form-pane': {
    title: 'The Form, side by side',
    icon: 'compare',
    intro: 'The Form\'s spec beside the recipe it produced — inline, so you compare while you work. The Form is the truth about WHICH products a position uses, and silent about everything else.',
    steps: [
      { blurb: 'Left: what the recipe has. Right: what the Form asks for. The gap between them is your work.', scene: 'formpane', beat: 0 },
      { blurb: 'A product the Form asks for that the recipe lacks is a defect. Tick it.', scene: 'formpane', beat: 1 },
      { blurb: 'The Form carries no slots, so you choose where it lands: position level, or inside the wrapper.', scene: 'formpane', beat: 2 },
      { blurb: 'It lands, coverage rises — and rows the Form never mentioned (connectors, kits) are fine. Derived detail is never flagged.', scene: 'formpane', beat: 3 },
      { blurb: 'A product nobody has named yet is usually one the recipe already holds. "That\'s it" links them instead of minting a duplicate.', scene: 'formpane', beat: 4 },
    ],
  },

  'product-spec': {
    title: 'The Product Spec',
    icon: 'list_alt',
    intro: 'Every ElementType\'s buying identity: (Manufacturer, ProductCode). The pair is the identity — the same code from another maker is another product.',
    steps: [
      { blurb: 'A complete row names its manufacturer and code. That pair is what the ordering process buys.', scene: 'spec', beat: 0 },
      { blurb: 'The status pills are filters. Click Missing and the list shrinks to the gaps.', scene: 'spec', beat: 1 },
      { blurb: 'Fill next steps you to the first incomplete row, cursor already in the field that needs you.', scene: 'spec', beat: 2 },
      { blurb: 'Fill it and the counts move with you. The completeness bar is the same number the tree\'s header shows.', scene: 'spec', beat: 3 },
      { blurb: 'Wrappers read Ideaworks / N-A on purpose — that IS their mark. Writing a real code onto one can un-wrapper the assembly.', scene: 'spec', beat: 4 },
    ],
  },

  'export': {
    title: 'Export — how changes leave',
    icon: 'ios_share',
    intro: 'The workbooks are read-only, structurally: there is no code that can write them. Your edits leave as Office Script patches you run in Excel yourself.',
    steps: [
      { blurb: 'So there is no Save button, and no way for this tool to damage a workbook. Stop looking for one.', scene: 'export', beat: 0 },
      { blurb: 'Changes lists every pending edit, field by field, before → after. Read it like a diff.', scene: 'export', beat: 1 },
      { blurb: 'Patches: one script per workbook — Product Spec, Recipe Spec, ElementTypes. Copy each one with changes.', scene: 'export', beat: 2 },
      { blurb: 'In Excel: Automate → New Script → paste → Run. A patch updates in place, so running it twice is harmless.', scene: 'export', beat: 3 },
      { blurb: 'If Resolve first is lit, do it before copying — it lists exactly what would make a patch wrong, each with a one-click fix.', scene: 'export', beat: 4 },
    ],
  },

  'connectors': {
    title: 'Connectors — the coverage matrix',
    icon: 'cable',
    intro: 'Collections are named ingredient sets (a 3-pin kit, the strain reliefs) gated by tags. The matrix shows which positions carry theirs.',
    steps: [
      { blurb: 'A collection names the refs a position should carry, and the tags that make it apply. No matching tag — not expected, shown as N/A.', scene: 'matrix', beat: 0 },
      { blurb: 'Rows are positions, columns are collections. Green complete, amber partial, red missing.', scene: 'matrix', beat: 1 },
      { blurb: 'Click a red cell and the detail panel names exactly which refs are absent — no guessing.', scene: 'matrix', beat: 2 },
      { blurb: 'Add the missing ref from right there. The cell turns green while you watch.', scene: 'matrix', beat: 3 },
      { blurb: 'Apply all fills every incomplete cell in a column in one undoable step.', scene: 'matrix', beat: 4 },
    ],
  },

  'templates': {
    title: 'The template editor',
    icon: 'dashboard_customize',
    intro: 'Templates are canned recipes. Global ones live in your library across projects; project ones belong to this job.',
    steps: [
      { blurb: 'Two scopes: Global (your library, every project) and This project.', scene: 'template', beat: 0 },
      { blurb: 'Globals are read-only here. Override copies one into the project, and the copy is yours to edit.', scene: 'template', beat: 1 },
      { blurb: 'An ingredient is either a slot — hatched, filled per position when applied — or an exact ref, fixed for ever.', scene: 'template', beat: 2 },
      { blurb: 'Applying a template REPLACES the position\'s recipe. Additive things (connectors, single rows) come from the palette instead.', scene: 'template', beat: 3 },
    ],
  },

  'validation-status': {
    title: 'Where the project stands',
    icon: 'rule',
    intro: '"Am I done?" answered as four checkable clauses — and validation that lists actions, not wreckage.',
    steps: [
      { blurb: 'Four clauses with live counts: every position reciped or ignored, every Form product placed, nothing blocking a patch, every ElementType in all three documents. Deliberately never a percentage.', scene: 'status', beat: 0 },
      { blurb: 'Validation groups issues into the ACTION that clears them — 45 missing master rows is one button, not 45 alarms.', scene: 'status', beat: 1 },
      { blurb: 'The step-through fixer walks what is left, one issue at a time, jumping you to the right pane for each.', scene: 'status', beat: 2 },
      { blurb: 'And not every flag is a defect: a position that genuinely needs no recipe can be flagged so — by itself, or with its whole family.', scene: 'status', beat: 3 },
    ],
  },
}

/** Every card id — what "Skip all tutorials" marks seen. */
export const ALL_TUTORIAL_IDS = Object.keys(TUTORIALS)

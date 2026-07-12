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
      { blurb: 'Flags say what a row IS: usually one IsDesign element per recipe; Contract items are supplied, but not managed in the Design.', scene: 'recipe', beat: 2 },
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
      { blurb: 'C01r and C03r both use ET-LIN-01. That is one assembly appearing in two recipes — not two copies.', scene: 'wrapper', beat: 0 },
      { blurb: 'Edit internals opens the assembly itself: the tape, profile and diffuser inside it.', scene: 'wrapper', beat: 1 },
      { blurb: 'Add something inside…', scene: 'wrapper', beat: 2 },
      { blurb: '…and every position using the wrapper now contains it. Edits ripple — the header names who is affected before you start.', scene: 'wrapper', beat: 3 },
      { blurb: 'When one position needs to differ, Fork gives it its own copy. The other positions keep the original, untouched.', scene: 'wrapper', beat: 4 },
    ],
  },

  'palette': {
    title: 'The palette drawer',
    icon: 'widgets',
    /**
     * The drawer only makes sense once you know what it fills. It shares a screen with the
     * recipe editor, and without this it won the mount race and opened FIRST.
     */
    after: ['recipe-editor'],
    intro: 'Everything you can pull INTO the recipe, in one drawer on the right: ElementTypes, templates, favourites, and what comparable positions already do.',
    steps: [
      { blurb: 'Four sources, four tabs — ElementTypes, Templates, ★ Favourites, and "Like this". The drawer is only useful while a position is open, so that is when it opens.', scene: 'palette', beat: 0 },
      { blurb: 'ElementTypes lists everything the project knows, grouped by family. Two ways to look at the same thing: by ET Ref, or by Mfr + Code when you know the product but not the ref.', scene: 'palette', beat: 1 },
      { blurb: 'Search and the family filter narrow it, and a match force-opens the groups so you never hunt through collapsed headers.', scene: 'palette', beat: 2 },
      { blurb: 'Every card is draggable — drag it onto a recipe section. The star saves it to your favourites, across every project. An amber card is a ref used in a recipe but in neither the DB nor the spec.', scene: 'palette', beat: 3 },
      { blurb: 'Templates REPLACE the whole recipe — a confirm stands in the way when rows already exist. And "Like this" ranks comparable positions (same family, tags, recipe overlap — never the ref spelling) so you can borrow rows from one.', scene: 'palette', beat: 4 },
    ],
  },

  'code-import': {
    title: 'Importing product codes',
    icon: 'auto_fix_high',
    intro: 'The design team\'s Form arrives as freehand spreadsheet text. This screen turns it into distinct product codes with ElementTypes — stages ① and ② of the whole workflow.',
    steps: [
      { blurb: 'The bar at the top shows the steps: ① identify codes ② assign ElementTypes ③ build into recipes. This screen owns ① and ② and stops there.', scene: 'paint', beat: 0 },
      { blurb: 'First, the Form\'s PositionType Refs are routed to real PositionTypes via the \'s ExtRef column', scene: 'paint', beat: 1 },
      { blurb: 'Here is a real linear PositionType product code. It has FOUR products in one sentence, each with a old code sitting next to its current one. (Pretty Busy!) This tool lets you split them up into their own ProductCodes.', scene: 'paint', beat: 2 },
      { blurb: 'Use the selectors and define the codes. Selecting the code for the Tape you can see it promotes it onto its own line underneath, carrying the words next to it as its note.', scene: 'paint', beat: 3 },
      { blurb: 'Now the profile. Notice what you do NOT do: the superseded 021-1103 stays a note. A note is not junk — it promotes with its code, so the line still tells you what this part replaced.', scene: 'paint', beat: 4 },
      { blurb: '\"Discard\" is for the scaffolding: paint the "+" separators. That teaches the tool what seperates your codes and learns to help you break down the Form Template!', scene: 'paint', beat: 5 },
      { blurb: 'You have now shown it two codes, so it knows their shape and the words that precede one. The last two arrive already suggested, dashed green. Press A to accept them - The tool has learned and can make a suggestions now!', scene: 'paint', beat: 6 },
      { blurb: 'Four codes, four notes. Done! Each one now needs the ElementType it belongs to — that is stage ②, and the codes you paint here apply to every row in the batch that contains them.', scene: 'paint', beat: 7 },
      { blurb: 'Stage writes the Form template and the Product Spec rows — and deliberately not one recipe row. Stage ③ is yours, in the builder.', scene: 'paint', beat: 8 },
    ],
  },

  'form-pane': {
    title: 'The Form, side by side',
    icon: 'compare',
    intro: 'The Form\'s spec beside the recipe it produced — inline, so you compare while you work. The Form is the truth about WHICH products a position uses, and silent about everything else.',
    steps: [
      { blurb: 'Left: what the recipe has. Right: what the Form asks for. The gap between them is your work.', scene: 'formpane', beat: 0 },
      { blurb: 'A product the Form asks for that the recipe lacks is a defect. Tick it.', scene: 'formpane', beat: 1 },
      { blurb: 'The Form carries no slots, so you choose where it lands: PositionType level, or inside the wrapper.', scene: 'formpane', beat: 2 },
      { blurb: 'It lands, coverage rises — and rows the Form never mentioned (connectors, kits) are fine. Derived detail is never flagged.', scene: 'formpane', beat: 3 },
      { blurb: 'A product nobody has named yet is usually one the recipe already holds. "That\'s it" links them instead of minting a duplicate.', scene: 'formpane', beat: 4 },
    ],
  },

  'product-spec': {
    title: 'The Product Spec',
    icon: 'list_alt',
    intro: 'Every ElementType\'s buying identity: (Manufacturer, ProductCode). The pair is the identity — the same code from another maker is another product.',
    steps: [
      { blurb: 'Pick a row on the left — its coloured dot is its status — and fill it in on the right. Green complete, amber TBC, red missing.', scene: 'spec', beat: 0 },
      { blurb: 'The status pills are filters. Click Missing and the list shrinks to the gaps.', scene: 'spec', beat: 1 },
      { blurb: 'Fill next selects the first incomplete row and drops the cursor straight into the field that needs you.', scene: 'spec', beat: 2 },
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
    title: 'Connectors — templates and the coverage matrix',
    icon: 'cable',
    intro: 'A connector template is a named set of ingredients matched by tags. The matrix then shows, at a glance, which positions are actually carrying theirs.',
    steps: [
      { blurb: 'The screen starts empty, and that is the point. Making a connector set template is the first thing you do here.', scene: 'matrix', beat: 0 },
      { blurb: 'A connector template has three things: a NAME, the TAGS that it applies to, and its INGREDIENTS. Each ingredient says where it belongs — Free Issue is delivered to site on its own; Inside Wrapper lands in the assembly the position actually has.', scene: 'matrix', beat: 1 },
      { blurb: 'Now the matrix: rows are positions, columns are your templates, and the Tags column is why each cell is what it is. Green complete, amber partial, red missing — and N/A is not a gap, it means the tags never matched, so this template was never expected there.', scene: 'matrix', beat: 2 },
      { blurb: 'A02m is amber: it carries part of the driver kit, not all of it. Click the cell.', scene: 'matrix', beat: 3 },
      { blurb: 'The detail panel opens on the right and names exactly what is absent, grouped by where it belongs. Add it from right there — no need to go to the recipe.', scene: 'matrix', beat: 4 },
      { blurb: 'The cell turns green while you watch, and the count moves with it. Remove works the same way.', scene: 'matrix', beat: 5 },
      { blurb: 'The column headers do the whole column at once: Apply all for the missing positions, Fill for the partial ones. Both are previewed before anything is written, and both are a single undo.', scene: 'matrix', beat: 6 },
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

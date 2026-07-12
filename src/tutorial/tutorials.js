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
    intro: 'Every PositionType in the DesignDB, in one list. This is where you see what is left to do, and where you pick the position to work on.',
    steps: [
      { blurb: 'Every position the DesignDB knows about, grouped by family. You never make positions here — the DesignDB decides what exists, this tool fills them in.', scene: 'tree', beat: 0 },
      { blurb: 'Filter by ref, name or tag to find the one you want. The tag chips and the "Form incomplete" chip work together with the search box.', scene: 'tree', beat: 1 },
      { blurb: 'The bar at the top counts the positions that have at least one recipe row. It is your "how far through am I?".', scene: 'tree', beat: 2 },
      { blurb: 'Some positions simply do not need a recipe. Mark one as ignored and it drops out of the counts — still there if you want it, just no longer asking for attention.', scene: 'tree', beat: 3 },
      { blurb: 'Click a position and the whole screen becomes its recipe. That is where the real work happens.', scene: 'tree', beat: 4 },
    ],
  },

  'recipe-editor': {
    title: 'The recipe editor',
    icon: 'receipt_long',
    intro: 'One position\'s recipe — the list of things it is built from. Each row is an ElementType, and the product that ElementType turns out to be.',
    steps: [
      { blurb: 'Each row is one ingredient. The pill is the ElementType; after the arrow is the product the Product Spec says it is.', scene: 'recipe', beat: 0 },
      { blurb: 'Quantity lives behind the little box icon — click it and the plus/minus opens up.', scene: 'recipe', beat: 1 },
      { blurb: 'The flags say what kind of thing this row is. Design is the main item you are specifying — usually one per recipe. Contract items get supplied, but you are not managing them in the Design.', scene: 'recipe', beat: 2 },
      { blurb: 'Add Entity gives you two ways in: pick an ElementType that already exists, or make a brand-new one without leaving the page.', scene: 'recipe', beat: 3 },
      { blurb: 'The new row appears in the section you had open, and says New until you export it.', scene: 'recipe', beat: 4 },
      { blurb: 'Delete does not really delete. The row goes grey, you can bring it back, and the export tells Excel to mark it deleted. Nothing is lost.', scene: 'recipe', beat: 5 },
    ],
  },

  'wrapper-internals': {
    title: 'Wrappers — one assembly, shared',
    icon: 'inventory_2',
    intro: 'A wrapper is an assembly. It is not a product you buy — the things INSIDE it are what you buy. And the same assembly can be used by more than one position.',
    steps: [
      { blurb: 'C01r and C03r both use ET-LIN-01. That is one assembly used twice, not two copies of it.', scene: 'wrapper', beat: 0 },
      { blurb: 'Edit internals opens the assembly itself, so you can see what is in it: the tape, the profile, the diffuser.', scene: 'wrapper', beat: 1 },
      { blurb: 'Add something inside…', scene: 'wrapper', beat: 2 },
      { blurb: '…and every position using that wrapper now has it too. That is the whole point of a wrapper, but it does mean an edit here reaches further than the position you are looking at — so the header tells you who else is affected before you start.', scene: 'wrapper', beat: 3 },
      { blurb: 'What if one position needs something different? Fork gives that position its own copy to change. Everyone else keeps the original, untouched.', scene: 'wrapper', beat: 4 },
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
    intro: 'The drawer on the right holds everything you can put INTO a recipe: ElementTypes, templates, your favourites, and what similar positions have already done.',
    steps: [
      { blurb: 'Four tabs — ElementTypes, Templates, ★ Favourites, and "Like this". The drawer is only any use while a position is open, so that is when it appears.', scene: 'palette', beat: 0 },
      { blurb: 'ElementTypes is everything the project knows about, grouped by family. Two ways to look at the same list: by ET Ref, or by Mfr + Code for when you know the product but not the ref.', scene: 'palette', beat: 1 },
      { blurb: 'Type in the search box, or pick a family, to narrow it down. Anything that matches opens up on its own, so you are never hunting inside closed groups.', scene: 'palette', beat: 2 },
      { blurb: 'Drag any card straight onto a section of the recipe. The star keeps it in your favourites, on every project. An amber card is a ref that is being used in a recipe but is not in the DesignDB or the Product Spec — worth a look.', scene: 'palette', beat: 3 },
      { blurb: 'Careful with Templates: applying one REPLACES the whole recipe, so it asks first if there are already rows there. "Like this" is the gentler option — it finds positions similar to this one (same family, same tags, similar recipe) so you can borrow rows from one.', scene: 'palette', beat: 4 },
    ],
  },

  'code-import': {
    title: 'Importing product codes',
    icon: 'auto_fix_high',
    intro: 'The design team\'s Form arrives as freehand spreadsheet text. This screen turns it into distinct product codes with ElementTypes — stages ① and ② of the whole workflow.',
    steps: [
      { blurb: 'The bar at the top shows the steps: ① identify codes ② assign ElementTypes ③ build into recipes. This screen owns ① and ② and stops there.', scene: 'paint', beat: 0 },
      { blurb: 'First, the Form\'s PositionType Refs are matched to the real PositionTypes using the DesignDB\'s ExtRef column — never by how the name is spelled.', scene: 'paint', beat: 1 },
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
    intro: 'What the Form asks for, sat right next to the recipe you have built, so you can compare the two without leaving the page. The Form tells you WHICH products a position uses — and nothing else.',
    steps: [
      { blurb: 'On the left, what the recipe has. On the right, what the Form asks for. The difference between the two is what is left to do.', scene: 'formpane', beat: 0 },
      { blurb: 'A product the Form asks for that the recipe does not have is a real gap. Tick it to add it.', scene: 'formpane', beat: 1 },
      { blurb: 'The Form never says WHERE a product goes, so you choose: at PositionType Level, or inside the wrapper.', scene: 'formpane', beat: 2 },
      { blurb: 'In it goes, and the count goes up. Rows the Form never mentions — connectors, cables, kits — are fine and are never flagged. The Form was never going to talk about those.', scene: 'formpane', beat: 3 },
      { blurb: 'Sometimes the Form asks for a product that nobody has given an ElementType yet — and it turns out to be something the recipe already has. "That\'s it" links the two, instead of creating a duplicate.', scene: 'formpane', beat: 4 },
    ],
  },

  'product-spec': {
    title: 'The Product Spec',
    icon: 'list_alt',
    intro: 'What each ElementType actually IS when you go to buy it: a manufacturer and a product code. Both together — the same code from a different maker is a different product.',
    steps: [
      { blurb: 'Pick a row on the left and fill it in on the right. The coloured dot tells you where it stands: green is done, amber is TBC, red is missing.', scene: 'spec', beat: 0 },
      { blurb: 'The status pills at the top are also filters. Click Missing and the list shrinks to just the gaps.', scene: 'spec', beat: 1 },
      { blurb: 'Fill next jumps you to the first unfinished row and puts the cursor in the box it needs.', scene: 'spec', beat: 2 },
      { blurb: 'Type it in and the counts move with you. This is the same number the project tree shows at the top.', scene: 'spec', beat: 3 },
      { blurb: 'Wrappers say Ideaworks / N-A, and that is deliberate — a wrapper is an assembly, not something you buy. That marking is what makes it a wrapper, so putting a real product code on one can stop it behaving like one.', scene: 'spec', beat: 4 },
    ],
  },

  'export': {
    title: 'Export — getting your changes out',
    icon: 'ios_share',
    intro: 'This tool never writes to your spreadsheets. It cannot — it only ever opens them read-only. Instead it writes you a script, and you run that script in Excel yourself.',
    steps: [
      { blurb: 'So there is no Save button, and nothing you do here can damage a workbook. Have a play — you cannot break anything.', scene: 'export', beat: 0 },
      { blurb: 'Changes lists everything you have edited, field by field, showing the old value and the new one.', scene: 'export', beat: 1 },
      { blurb: 'Patches gives you one script per spreadsheet — Product Spec, Recipe Spec, ElementTypes. Copy the ones that have changes.', scene: 'export', beat: 2 },
      { blurb: 'In Excel: Automate → New Script → paste it in → Run. It updates the rows in place, so if you run the same script twice nothing bad happens.', scene: 'export', beat: 3 },
      { blurb: 'If "Resolve first" has anything in it, sort that out before you copy. It is the list of things that would make the script write something wrong — and each one has a button to fix it.', scene: 'export', beat: 4 },
    ],
  },

  'connectors': {
    title: 'Connectors — templates and the coverage matrix',
    icon: 'cable',
    intro: 'A connector template is a named set of ingredients matched by tags. The matrix then shows, at a glance, which positions are actually carrying theirs.',
    steps: [
      { blurb: 'The screen starts empty, and that is the point. Making a connector set template is the first thing you do here.', scene: 'matrix', beat: 0 },
      { blurb: 'A connector template has three things: a NAME, the TAGS that it applies to, and its INGREDIENTS. Each ingredient says where it belongs — Free Issue is delivered to site on its own; Inside Wrapper lands in the assembly the position actually has.', scene: 'matrix', beat: 1 },
      { blurb: 'Now the matrix: each row is a position, each column is one of your templates, and the Tags column tells you why a cell is the colour it is. Green means it has everything, amber means it has some of it, red means it has none. N/A just means the tags did not match, so this template was never meant for that position — nothing is wrong.', scene: 'matrix', beat: 2 },
      { blurb: 'A02m is amber — it has part of the driver kit, but not all of it. Click the cell to see what is going on.', scene: 'matrix', beat: 3 },
      { blurb: 'A panel opens on the right telling you exactly what is missing, and where each piece belongs. You can add it from right here, without going back to the recipe.', scene: 'matrix', beat: 4 },
      { blurb: 'The cell goes green and the count updates. Removing something works the same way.', scene: 'matrix', beat: 5 },
      { blurb: 'The buttons in the column heading do the whole column in one go: "Apply all" for the positions that have none of it, "Fill" for the ones that are part way there. Both show you what they are about to do first, and both are a single undo.', scene: 'matrix', beat: 6 },
    ],
  },

  'templates': {
    title: 'Templates — recipes you reuse',
    icon: 'dashboard_customize',
    intro: 'A template is a recipe you have saved to use again. Global ones follow you from project to project; project ones belong to this job only.',
    steps: [
      { blurb: 'Two lists: Global, which is your own library and turns up on every project, and This project, which is just for this job.', scene: 'template', beat: 0 },
      { blurb: 'You cannot edit a global one directly — that would change it everywhere. Override makes a copy in this project, and the copy is yours to do what you like with.', scene: 'template', beat: 1 },
      { blurb: 'An ingredient can be one of two things. An exact ref is always the same product. A slot is a blank you fill in when you apply the template, which is how one template can suit positions that differ slightly.', scene: 'template', beat: 2 },
      { blurb: 'Applying a template REPLACES what is in the position\'s recipe. If you only want to add a row or two, use the palette instead.', scene: 'template', beat: 3 },
    ],
  },

  'validation-status': {
    title: 'Where the project stands',
    icon: 'rule',
    intro: 'The honest answer to "am I finished?", plus a list of what is left — written as things to do, not things that are wrong.',
    steps: [
      { blurb: 'Two tabs. "Am I done?" gives you four straight answers: every position has a recipe (or is ignored), every product the Form asked for has been placed, nothing would make the export wrong, and every ElementType exists in all three spreadsheets. Each one names the refs holding it up. There is no percentage on purpose — 87% does not tell you what to do next.', scene: 'status', beat: 0 },
      { blurb: 'These are not just a score. Click one you have not finished and it takes you straight to the thing that needs doing.', scene: 'status', beat: 1 },
      { blurb: 'The Validation tab does not throw a list of problems at you — it groups them into JOBS. So 45 missing rows becomes one card with one button, instead of 45 warnings. Red means the export would write something wrong. Amber just means it is not finished. Grey means you have already dealt with it and it is waiting in the patch.', scene: 'status', beat: 2 },
      { blurb: 'Open a card to see every ref and what is wrong with it — or press "Fix all" and clear the lot in one go.', scene: 'status', beat: 3 },
      { blurb: '"Step through" walks you through what is left, one at a time, taking you to the right place for each. And remember, not everything on the list is a mistake: if a position genuinely needs no recipe you can say so right here — just that one, or the whole family (which asks you first).', scene: 'status', beat: 4 },
    ],
  },
}

/** Every card id — what "Skip all tutorials" marks seen. */
export const ALL_TUTORIAL_IDS = Object.keys(TUTORIALS)

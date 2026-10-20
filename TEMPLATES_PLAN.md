# Templates upgrade — plan

Agreed with Erik 2026-10-20. Orion's **kinds → templates** work is the basis. Every template
mechanism the app has today (tag matching, the ten built-ins, Recipe Styles, Build Recipes from Form,
the Manage templates screen) is obsolete and goes once its replacement is in.

## Where things stand (2026-10-20)

- Orion `products.db`: **68 recipe kinds** mined from 16 projects (`recipe_kinds`: design DL/LIN/PS,
  driver local/remote/integral, secondary CC/CV, defining jobs, slots, positions, projects).
- `psr_templates`: 1 published (`LIN+Tape+Profile-r`), 2 drafts (`LIN+Flex+Mount-r`, `kind-1`). Columns:
  `applicable_tags`, `ingredients`, `replaces`, `from_kind`. **No rule.** Served at
  `/api/recipes/templates` (bridge cache 60 s), merged in-app by `applyServedTemplates`.
- The app already places a position in a kind: `recipeKinds.js` (`indexes`, `sig`, `matchKind`).
- 22 kinds still point (`recipe_kinds.template`) at built-in ids that are going away.

## The model

A template is **a kind's recipe, plus a rule saying which positions it is for**.

- **Rule** is the connector-template shape `{ match, conditions: [{ column, op, value }] }`
  (`RuleBuilder`, `ruleMatchesRecord`), over new kind columns: `Design`, `DriverLocation`,
  `DriverType`, `Jobs` (defining jobs, from the recipe or, when empty, from the Form capture). DesignDB
  columns stay available. **Tags are not a rule column.**
- Seeded from `from_kind`: `Design is LIN and DriverLocation is remote and DriverType is CV and Jobs
  has PROFILE and Jobs has TAPE`.
- Global templates are authored on Orion. Personal and project templates are authored in the app, and
  "Suggest to Orion" sends one there as a draft.

## Phases

Each phase ships as its own PR with tests. The old mechanism is only removed once its replacement is in.

### 1. Orion: rules and coverage (datajoin_mx)
- `psr_templates.rule TEXT` (JSON). Migration: seed from `from_kind`. `templates()` serves `rule`, and
  `applicable_tags`/`replaces` are dropped from the served shape.
- /psr → Recipes: "Draft from kind" for the kinds with no template, ordered by positions. Shows the
  rule as words and lets you edit it. Publish as today.
- `recipe_kinds.template` re-points at Orion template ids. Built-in ids are no longer referenced.
- Accept suggestions: `POST /gateway/psr/templates/suggest` → a `draft` row with `suggested_by` and
  origin project. The bridge gets `POST /api/recipes/templates/suggest` (feature `templates`).
- **Gate:** Erik publishes enough templates to cover the main kinds before phase 3 removes anything.

### 2. App: rule matching over kinds
- `templateRules.js`: `KIND_RULE_COLUMNS` (Design, DriverLocation, DriverType, Jobs), and
  `templateRecords` fills them from `recipeKinds.indexes`. For empty positions, jobs come from the Form.
- `templatesFor(posRef)` → `{ matches, others }` using `ruleMatchesRecord`, sorted by
  `mostSpecific`. Each comes with an explanation per condition (`compareRule`) for "why doesn't it
  match?".
- Tests: a LIN tape/profile remote-CV position matches the seeded rule, while C01-style mismatches
  explain themselves.

### 3. Remove the built-ins and tag matching
- Delete `GLOBAL_TEMPLATES` (`utils/constants.js`), `seedGlobalTemplates` and `resyncBuiltInTemplates`
  (`platform/dbSchema.js`), plus a migration that deletes their ten ids from existing browsers.
- Delete `ruleFromTags`/`recordFromTags`/the Tags rule column for templates, `applicable_tags`
  matching, `replaces` handling in `applyServedTemplates`, and the CLI `template apply` by tag.
- Personal and project templates saved before this keep their ingredients and get an empty rule.
  They show under "All" until someone gives them one.

### 4. Templates tab in the right drawer
- New drawer tab `templates` (icon `dashboard_customize`) beside Form spec / Connectors /
  ElementTypes / Positions like this one. `TemplatesPane.jsx`.
- **Matches this position** (default) and an **All templates** toggle. Each card shows name, origin
  (Orion / project / mine), rule in words, the rows, "why not?" for non-matches.
- **Apply** reuses `applyTaughtTemplate` / `proposalFromTemplate`, the Form-ingest method, not a new
  one:
  1. Preview: the rows with products filled from the Form, each saying where it came from; unknowns
     marked.
  2. The person confirms the template is right for this position (recorded as an outcome, so
     Orion learns from it).
  3. Write. Rows that need checking stay flagged.
- **N empty positions match → Apply to all**, with a preview per position and one Undo, using the
  same method.
- **Still to check**: positions with flagged rows from an apply, so you come back round to them.
- The ⋯ → Apply a template modal and the "use the Templates tab" empty-state text point here.

### 5. Hints
- An empty or new position that matches a template gets a hint on its tree row (tooltip: template
  name and "Apply from the Templates tab") and a dot on the drawer tab, like `connectorGaps`.
- Dismissing a hint for a position is remembered (per-position hide, as for suggestions).

### 6. Template editor rebuilt
- Replace `TemplateEditorScreen` with an editor on the `CollectionEditor` pattern (no connector
  matrix): rule (`RuleBuilder` over kind and DesignDB columns), slot list (slot, ElementType/job,
  section, design/contract, qty, dim multiplier, integer), and "Check a position" / "why doesn't X
  match?".
- Orion templates are read-only here. "Copy to mine" makes an editable personal copy.
- "Save as template" from a position seeds the rule from that position's kind.
- A subtle **Suggest to Orion** button on personal/project templates (Connected only) → phase 1
  endpoint.

### 7. Retire Recipe Styles and Build Recipes from Form
- Delete `RecipeStylesWindow`, `FormRecipesModal`, `recipeStyles.js` matching
  (`findStyleGroups`, `matchStyle`, `styleRuleOf`), `styleLibrary.js` if nothing else reads it, and their
  entry points in Builder and Form import. After Form ingest, open the Templates tab on the first
  matching group instead.
- Keep what Templates uses: `proposeRecipe`, `proposalFromTemplate`, `applyTaughtTemplate`, `formGroups`
  only if the bulk preview needs grouping.

## Open checks

- Confirm phase 3/7 deletion lists with a grep sweep before each PR. They come from a read, not a
  full audit.
- Whether `Jobs` for an empty position can always be read from the Form (positions without a Form
  capture match on Design/Driver only).
- The CLI `psr open` currently fails `NO_PSR_SOURCES` for every project (3065, 5499, 5642). That needs
  fixing before the CLI can be used to check the phases against real data.

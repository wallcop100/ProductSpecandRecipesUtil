# Workplan — batched change backlog

Living tracker for the change list. Designed for **multiple agents working in
parallel across multiple sessions**. Update this file as you go.

## How to use this doc
- Work is grouped into **workstreams** (WS-A … WS-R). Within a stream, tasks are
  `T-##`.
- Before starting a task: set its status to `WIP (agent: <name/session>)`.
- On finish: set `DONE` and note the commit.
- **Respect the shared-file hotspots** (below) — two agents editing the same file
  in parallel will conflict. Claim the file or sequence the work.
- **Blocked tasks** carry an open question (see the Open Questions section).
  Don't guess on `L`-sized design tasks — ask first.

Status legend: `TODO` · `WIP` · `BLOCKED (needs answer)` · `DONE`
Size legend: `S` text/label · `M` moderate · `L` large/design.

## Shared-file hotspots (coordinate!)
- `src/screens/BuilderScreen.jsx` — WS-E, WS-F, WS-N, WS-Q, WS-R.
- `src/utils/validationRules.js` — WS-C (count is UI only), WS-E, WS-K.
- `src/screens/ProductSpecScreen.jsx` — WS-A, WS-Q.
- `backend/app.py` / `backend/patcher.py` — WS-M, WS-Q.
Recommendation: one agent owns each hotspot file at a time; small text-only edits
can be batched by that owner.

---

## Quick-wins pool (independent, low-risk, grab any)
Pure text/label/icon changes, each in one component, no design decisions:
- `T-N1` DesignDB wording (WS-N)
- `T-C1` "PositionType Level" label (WS-C)
- `T-D1` trash hover text (WS-D)
- `T-F1` review icon → `fact_check` (WS-F)
- `T-F2` "Show IsDeleted Rows" label (WS-F)
- `T-I1` Add Anywhere PositionTypes icon (WS-I)
- `T-A6` "In PositionTypes/In ElementTypes" chip text (WS-A)
- `T-A7` Delete/Deleted → Mark IsDeleted/IsDeleted (WS-A)

---

## WS-A · Product Spec screen
File: `src/screens/ProductSpecScreen.jsx` (+ ETSpecBrowser/ETSpecEditor). One
owner recommended (single screen).
- `T-A1` `M` `DONE` — Products with warnings (e.g. duplication) must NOT show the
  green "ok" dot. Fix the status-dot logic to reflect warnings/errors.
- `T-A2` `M` `DONE` — Add heading groups for problem states: e.g. **"Missing
  Spec"**, **"Partial Spec"**, **"Duplicate"** — mirror the existing grouping.
- `T-A3` `S` `DONE` — Rows whose spec is TBC show a **"TBC" chip**.
- `T-A4` `S` `DONE` — Show **"Manufacturer – Product Code"** next to the
  ElementTypeRef (currently only Product Code).
- `T-A5` `M` `DONE` — Right-hand bar: widen to fit the additions, and make it
  **user-resizable** (draggable splitter). *(Q-A5: min/max widths?)*
- `T-A6` `S` `DONE` — Chips: "In PositionTypes" / "In ElementTypes" (not
  "In positions" / "In elements").
- `T-A7` `S` `DONE` — All "Delete"/"Deleted" UI text → **"Mark IsDeleted"** /
  **"IsDeleted"**.
- `T-A8` `M` `DONE` — The error icons by the top progress bar: make them a clearer
  **hover UI** and bigger — currently hard to find.
- Note: `T-Q1` (Change Summary) **supersedes** this screen's "Unsaved Changes"
  section — coordinate with WS-Q before reworking that area.

## WS-B · Builder first page (PositionTypes overview)
File: `src/components/ProjectTreeView.jsx`.
- `T-B1` `S` `DONE` — "Ignore family" control: **yellow on hover** only (it's too
  bright at rest).
- `T-B2` `M` `DONE` — Tags and Connector-status columns/badges become
  **toggleable, default OFF**. *(Q-B2: a per-view toggle in the overview header?)*

## WS-C · Builder PositionType editor
Files: `src/components/PositionRecipeEditor.jsx`, `ConnectorSuggestions.jsx`,
`PositionValidationBadge.jsx` / `ValidationPanel.jsx`.
- `T-C1` `S` `DONE` — Section title "Position Level" → **"PositionType Level"**.
- `T-C2` `M` `DONE — connectorGaps rewritten template-driven (connectors.js); suggestions come from connector templates' socket/plug/SR pairings, tag-filtered` — Confirm connector **suggestions are explicitly derived from
  the connector template** (audit `ConnectorSuggestions` + source data). Document
  the source. (Pairs with T-E1.)
- `T-C3` `S` `DONE` — Errors show a **count** next to them.
- `T-C4` `M` `DONE` — Error popup uses blue + `open_in_new` but the text isn't
  clickable — make the intended target **actually clickable** (whole chip/link).

## WS-D · Ingredient Card
File: `src/components/IngredientCard.jsx`.
- `T-D1` `S` `DONE` — Trashcan hover text → **"Mark IsDeleted"**.
- `T-D2` `M` `DONE` — Move the container-element icon to the **right, stacked
  vertically under the trashcan**.
- `T-D3` `S` `DONE` — Remove the **"Next Ref"** hint.
- `T-D4` `M` `DONE` — Move the **"New" chip to the top-left corner** of the card;
  new cards use a **green** accent (not the changed-yellow).

## WS-E · Builder right drawer + connector validation
Files: `src/components/ElementPalette.jsx`, `src/utils/validationRules.js`,
`src/screens/BuilderScreen.jsx` (scroll).
- `T-E1` `M` `DONE — new CONNECTOR_SET_INCOMPLETE rule runs template-driven connectorGaps per position` — Confirm connector-related validation warnings are
  **explicitly based on the connector template** (audit + document). (Pairs C2.)
- `T-E2` `M` `DONE` — **`REMOTE_HAS_SITE_SOCKET` is wrong** — remote fittings CAN
  have site-side sockets. Remove/repurpose the rule. *(Q-E2: delete entirely, or
  re-scope?)* File: `validationRules.js` (`checkRemoteNoSiteSocket`).
- `T-E3` `M` `DONE` — After adding an entity from the drawer, the **main surface
  scrolls to focus the new row**.
- `T-E4` `M` `DONE — UNRESOLVED_TEMPLATE_SLOT error + unfilled slots held back from RS export (exportChanges keeps them in the registry)` — **Templated-but-unfilled** entities (template applied, slot
  not resolved) become a **validation error**. (Ties to WS-R templates.)

## WS-F · Builder toolbar
File: `src/screens/BuilderScreen.jsx` (toolbar region).
- `T-F1` `S` `DONE` — Review-modal icon → **`fact_check`**.
- `T-F2` `S` `DONE` — "Show Soft Deleted Rows" → **"Show IsDeleted Rows"**.
- `T-F3` `M` `DONE` — "Run validation" gets a **confirm popover** with a short
  blurb about what it does.
- `T-F4` `L` `DONE — TransformToTemplateModal: each row becomes a slot, editable slotLabels, per-row Primed/Exact-Ref toggle; store.transformToTemplate` — "Save Active Position as a Template" →
  **"Transform Active Position as a Template"** + a new modal flow. **Part of
  WS-R** (templates rework) — do together.

## WS-G · Review modal
File: `src/components/ReviewModal.jsx`.
- `T-G1` `M` `DONE` — Build-phase should copy the **AddAnywhere first-page style**
  (big filter icon) so users know to filter.
- `T-G2` `S` `DONE — footer button removed; per-section "+ Add Entity" fork inside the embedded editor stays` — Remove the blue **"Add Entity"** footer button.

## WS-H · New ElementType modal
Files: `src/components/NewETWizardModal.jsx`, `src/store/useStore.js`
(`suggestNextETRef` / ref logic).
- `T-H1` `M` `DONE` — Flag when the entered **Manufacturer + Product Code already
  exists**; reveal a button to either **use the existing ElementTypeRef** or
  **adjust the product code**.
- `T-H2` `S` `DONE` — The "next ref" suggestion should **suggest capitalisation**
  if the typed ref isn't uppercased.
- `T-H3` `S` `DONE` — Templated/suggested ref uses **one leading zero**:
  `TAPE-04`, not `TAPE-004`. (Also audit `getNextAvailableRef`.)

## WS-I · Add Anywhere modal
File: `src/components/AddAnywhereModal.jsx`.
- `T-I1` `S` `DONE` — PositionTypes unit uses the **same icon as the builder
  toolbar** (`ICONS.position`), not `place`.

## WS-J · Edit Connector Template modal
File: TBD (`ConnectorWizardModal.jsx` and/or `TemplateEditorScreen.jsx` — locate).
- `T-J1` `M` `DONE — CollectionEditor is 2-way Free Issue / Inside Wrapper + blurb; addConnection auto-resolves internal parts to the DL/LIN wrapper present` — Section options become **"Free Issue"** vs **"Inside
  Wrapper"** with a top blurb, roughly: *"Free-issue items can be delivered to
  site on their own. Inside-wrapper items are delivered as part of the
  downlight/luminaire assembly."* (reword nicely). Adjust the **Tags to match**,
  capitalised. *(Q-J1: does this rename map to the existing section keys
  `position` / `dl_internal` / `lin_internal`? Confirm mapping.)*

## WS-K · Connector screen (matrix)
Files: `src/screens/ConnectorsScreen.jsx`, `src/components/CoverageMatrix.jsx`,
coverage logic.
- `T-K1` `L` `DONE — positionRecipeWithWrapperInternals feeds matrix/badge/deep-link; CellDetailPanel split into "PositionType level" + "DL wrapper internals" with shared-wrapper multi-use warning` — Matrix wrongly flags PositionTypes as missing an
  ingredient when the ingredient lives **inside the wrapper (DL)**. The check must
  consider **both** the PositionType's own rows **and** the DL wrapper's internal
  rows. Split the right-hand pane into **"Inside the PositionType"** and **"Inside
  the DL wrapper"**. Also: the DL ElementType is a **universal, shareable
  definition** — warn when it's **used in multiple places**.
  *(Q-K1: exact split-pane layout + what the multi-use warning should say/trigger
  on. Needs a short design pass.)*

## WS-L · Tag Manager
Files: `src/screens/TagManagerScreen.jsx`, `electron/default-tags.yaml`,
`electron/db.js` (getDefaultTags), tag rule engine.
- `T-L1` `M` `DONE` — Expand the available-columns list to **all PositionType DB
  schema columns** (audit `PT_COLUMN_MAP` in `backend/parser.py` — may need to
  widen what's parsed/exposed). *(Q-L1: include ALL raw columns, or a curated
  superset?)*
- `T-L2` `M` `DONE` — Add a **palette icon button on each tag chip**; clicking it
  lets the user pick from **predetermined colours**.
- `T-L3` `S` `DONE (electron/default-tags.yaml already the editable seed)` — Ship an editable **default-tags YAML** (confirm
  `electron/default-tags.yaml` is the seed and is user-editable/exposed).

## WS-M · Export / auto-save hygiene
Files: `backend/patcher.py` (backup), `backend/app.py`, `electron/main.js`
(yaml), `src/store/useStore.js`.
- `T-M1` `M` `DONE` — **Diagnose the flood of `.backup` files.** Currently every
  `/patch` calls `backup_file`. Decide policy: only keep ONE working set +
  snapshots; stop or heavily rate-limit per-write backups. *(Q-M1: keep a single
  rolling backup, keep none and rely on snapshots, or keep N most recent?)*
- `T-M2` `S/M` `DONE — naming+auto-export removed; "also export configuration" is now an opt-in checkbox in the Change Summary gate` — Remove the **"ideaworks"** name from the YAML export
  (rename overlay + filenames). At export time, **ask the user** whether to also
  export the configuration. (Touches `config-write-yaml`, `snapshot-project`,
  store `exportChanges` overlay auto-write.)

## WS-N · DesignDB wording
Files: `src/screens/BuilderScreen.jsx`, `src/components/NewETWizardModal.jsx`.
- `T-N1` `S` `DONE` — Replace the word **"catalogue"** everywhere with
  **"Update the ElementTypes Table"** phrasing (button "Save N to DB" →
  e.g. "Update ElementTypes Table (N)"; wizard hints; confirms; `EXPORT_PLAN.md`
  can keep its term but UI must change).

## WS-O · Folder setup screen
File: `src/screens/FolderSetupScreen.jsx` (+ `ProjectConfirmModal.jsx`).
- `T-O1` `M` `DONE — Project ID + config baked inline; ProjectConfirmModal kept behind "Advanced / edit identity" (now applies values instead of opening)` — Stop auto-opening the **Confirm Project modal**. Bake its
  options (project number, config name) **inline into the main FolderSetup page**.

## WS-P · General bug
- `T-P1` `M` `DONE (best-effort: arrow-hijack fix + hardened undo/redo; repro still helpful)` — **Freetext entry is sometimes blocked anywhere.** Diagnose
  the **global keydown handlers** as prime suspects: undo/redo in
  `BuilderScreen.jsx` and Ctrl+C/V copy/paste in `PositionRecipeEditor.jsx` — the
  `isTextField` guard may miss cases (number inputs, `contenteditable`, inputs
  inside modals, datalist entry). *(Q-P1: any repro — which field, which screen?)*

## WS-Q · FEATURE: Change Summary modal `L`
Cross-cutting: `ProductSpecScreen.jsx`, `BuilderScreen.jsx` (export + DB update),
new component. Depends on export flows (exist).
- `T-Q1` `L` `DONE — ChangeSummaryModal: hard gate on Export Changes + Update ElementTypes Table; per-entity +new/~changed/⊗IsDeleted lines; Copy-as-Markdown; replaces ProductSpec drawer; opt-in config export folded in (T-M2)` — A **Change Summary modal** that pops up first whenever
  **Export Changes** or **Update ElementTypes Table** is triggered. Summarised
  **by PositionType/ElementType** (not line-by-line). Scoped to the action
  (ProductSpec vs DB vs PS&RS). **Supersedes** the ProductSpec "Unsaved Changes"
  section. Include a **`content_copy`/markdown-copy button** producing a copiable
  Markdown summary.
  *(Q-Q1: what granularity counts as "summarised" — per-entity counts of
  added/changed/deleted rows? Confirm it becomes the gate the user confirms before
  the write proceeds.)*

## WS-R · FEATURE: Templates rework `L`
Cross-cutting: templates data model, `RecipeSection`/`IngredientCard` rendering,
`BuilderScreen` toolbar (T-F4), a new transform modal, validation (T-E4).
- `T-R1` `L` `DONE — SlotCard grey-hatched with Existing/New fork + Use Exact Ref; slotLabel carried onto rows; exact ingredients apply pre-resolved; unfilled slots held back from export + validation error (T-E4); Transform modal (T-F4)` — Rework templates so applied templates are **"primed"
  slots** to be filled with a new or existing ElementType (grey-hatch visual),
  with the **description/slot label shown clearly**. Slot labels are **NOT real
  ElementTypeRefs** today — fix that treatment. Add **"Use Exact Ref"** per slot
  (turns a primed slot into a fixed one). Add the **"Transform Active Position
  into a Template"** modal (T-F4).
  *(Q-R1: multiple sub-questions — see Open Questions. This needs a design pass
  before any code.)*

---

## Dependency / ordering notes
- **WS-R ⟶ T-F4, T-E4**: template rework defines the transform modal and the
  "templated-but-unfilled = error" rule. Do the design first.
- **WS-Q ⟷ WS-A**: Change Summary replaces ProductSpec "Unsaved Changes" — land
  the design before reworking that section (T-A* around unsaved changes).
- **WS-N ⟷ WS-F**: DesignDB wording touches the same toolbar button as WS-F.
- **T-C2 / T-E1**: same audit (connector suggestions/validation from template) —
  do once, share findings.
- **WS-K, WS-J, WS-E(connectors)**: all connector-semantics; keep terminology
  consistent (Free Issue / Inside Wrapper).

## Parallelization guide (can run simultaneously)
Independent lanes with no file overlap — safe to run in parallel now:
- Lane 1: WS-A (Product Spec)
- Lane 2: WS-D (Ingredient Card)
- Lane 3: WS-H (New ET modal) + WS-I (Add Anywhere)
- Lane 4: WS-L (Tag Manager)
- Lane 5: WS-O (Folder Setup)
- Lane 6: WS-M (backend export hygiene)
- Lane 7: WS-B (overview) — but coordinate ProjectTreeView with nobody else.
Serialize on `BuilderScreen.jsx`: WS-N → WS-F → WS-E(scroll) → WS-Q → WS-R.

## Resolved decisions (from the user) — ALL QUESTIONS NOW ANSWERED
- **Templates (T-R1 / T-E4):** a primed slot is a grey-hatched placeholder;
  **clicking it opens the Existing/New Add-Entity fork**. **Unfilled primed slots
  are held back from export AND raise a validation error** (T-E4). The slot's
  visible **label = the template ingredient's `slotLabel`** (NOT treated as a real
  ElementTypeRef). **"Use Exact Ref"** converts a primed slot into a **normal fixed
  RS row** (exports like any ingredient, no marker).
- **Transform modal (T-F4):** lists the active position's current rows; **each row
  becomes a template slot**. The user edits **slotLabels** and chooses per row
  whether it stays **primed** (fill-later) or is **Exact Ref** (fixed to the row's
  current ElementType).
- **Change Summary (T-Q1):** **hard gate** — always pops first, must be confirmed
  before any write. **One line per PositionType/ElementType: `+N new / ~N changed
  / ⊗N IsDeleted`**. Markdown-copy mirrors it. Scoped to the action (PS / RS / DB).
  Supersedes ProductSpec "Unsaved Changes".
- **Connector matrix (T-K1):** right pane = **two stacked labelled sections in the
  existing pane** — "PositionType level" and "DL wrapper internals" — the check
  reads both. Plus: warn + list where a DL wrapper is used by multiple PositionTypes.
- **Folder Setup (T-O1):** bake project-number + config inline for the normal flow,
  but **keep the modal reachable behind an "Advanced / edit identity" link**.
- **Review Add (T-G2):** **remove the footer blue "Add Entity" button**, but KEEP
  adding via the embedded editor's per-section "+ Add Entity" fork (review→add flow
  stays functional per-row; only the footer button goes).
- **Connector suggestions (T-C2 / T-E1):** **rework to be template-driven** — rewrite
  `connectorGaps` so suggestions/validation come from the connector templates'
  socket/plug pairings, not token matching.
- **Connector template sections (T-J1):** collapse to a **true 2-way Free Issue vs
  Inside Wrapper**; "Inside Wrapper" auto-resolves to DL or LIN based on the wrapper
  present. (Touches the recipe section model — coordinate with connector work.)

## Open Questions (answer before the BLOCKED tasks)
- **Q-R1 (templates):** How is a primed slot filled — click to pick existing / new
  (the Add Entity fork)? Does the slot label come from the template ingredient's
  `slotLabel`/description? What does "Use Exact Ref" produce in the exported RS
  (a normal row)? Should the whole template stay primed until all slots are
  filled, and is an unfilled slot exported at all or held back?
- **Q-Q1 (change summary):** Granularity of the summary; is it a hard gate before
  every write; exact Markdown shape.
- **Q-K1 (connector matrix):** Split-pane layout; the multi-use warning wording +
  trigger.
- **Q-E2 (REMOTE_HAS_SITE_SOCKET):** delete the rule or re-scope it?
- **Q-M1 (.backup policy):** single rolling backup / none+snapshots / keep N?
- **Q-O1 (folder setup):** remove the confirm modal entirely or keep for edits?
- **Q-J1 (connector sections):** do "Free Issue / Inside Wrapper" map onto the
  existing `position` / `dl_internal` / `lin_internal` section keys?
- **Q-B2, Q-A5, Q-L1, Q-G2, Q-P1:** minor scoping (see inline).

# Form Spec pane A — implementation plan (2026-11-18)

Design: artifact FysCstWsNdMuYYhWh3YJjh v17 (approved). Branch `form-pane-a` off dev 13dc3df.

## FormSpecPane.jsx
1. Header: drop `X/Y present`. `FormStrip` gains the compare pill (`difference` date ×, file name on
   hover); × = `setCompareBase(null)`. The date is the older file's lastModified (`readOlderForm` now
   returns `at`), else when it was compared.
2. ⋯ menu: drop the paint-mode item and "Show columns…" (the custom ▾ on each entry replaces it).
3. Delete: reference rail, FormContext box, ColumnPicker, "All present / Next", the amber
   "N codes still need", the Back/Next foot, the Next button on the silent branch.
4. Diff (no yellow block): `usePositionFormImpact` drives
   - `~` group per swap/respec the recipe holds: new line + struck old line underneath
     (old code, old ET, faded). Swap: [Replace ET-old (primary)] [+ Add ET-new]. Respec: the new ET
     is a dashed preview ref (`forkRefFor`), [Update ET-old (primary when canUpdate)] [+ Add ET-new
     (fork)]; not updatable → Add is primary. "Changed since <date>" on row hover.
   - `+` gutter on a line whose ET is an `add` change; on the painter's card for an `addNew` code.
   - `−` rows: orphans ∪ `remove` changes, each with Remove; the "goes with it" ET as a muted pill.
5. Lines: gutter · status icon (✓ / add_circle / ?) · code (copy) · ET pill (orange, opens Product
   Spec) · where (inventory_2 wrapper pill, or tab_unselected).
6. Missing card: primary = usual place (`inventory_2 ET-DL-03` / `tab_unselected Position`), the
   other secondary, counts beside it with hover labels. No wrapper → Position only.
7. Saved product with no ET: graphite-stripe card: reuse row (candidate pill, short why, Use),
   "or create", [Create (secondary)] [Existing].
8. "Not from the Form": derived extras only, folded behind "show N".
9. Kept: shared-wrapper Fork / Keep shared (compact, position pills go to the position), no-wrapper
   box [+ DL] [+ LIN] (fitting kind primary), Add all N, Added · Undo.

## FormPaintBar.jsx
No global paint mode. With a loaded Form and rows here the embedded painter is always mounted (it
owns the entries); `autoSave` passes through instead of the hidden second mount. Drop the brush
button, status chip and raw grid (now each entry's Form data face).

## CompactPositionPainter.jsx
- Each Form row is an entry: header (maker, brush keys in Paint, face toggle table_rows | brush).
- Faces morph (grid-template-rows 1fr↔0fr + opacity). Paint by default when the entry still needs
  painting (a code with no ET, or an unconfirmed entry), else Form data; flips to Paint if that
  becomes true.
- Form data face: presets few (maker, code, accessories) / many (all) / custom (checklist on hover
  or focus of ▾). Preset + custom list sticky in localStorage (across projects).
- Cards only for codes with no ET (known codes are the pane's lines); hidden for respec codes the
  `~` group already handles. Graphite stripe, `+` gutter for new codes, reuse row (Use →
  `assignET`), "or create", Ref / Family / Description autofill kept, purple dot on the learned
  family line, [Create <ref>] [Existing → ETRefSelect → assignET].
- Drop the "N codes need" summary.

## Small shared bits
- `CopyText`: toast "Copied <text>" in blue (`tone: 'primary'`).
- `formImpact`: swap/respec carry `fromCode`.
- store: `forkRefFor(ref)` split out of `forkElementType` for the preview ref.
- `paneParts.jsx` (new): `EtPill`, `PosPill`, `Gutter`, `Where`, shared by pane and painter.
- `formPaintMode` / `setFormPaintMode` removed from the store.

## Tests
Update formSpecPane / formSpecPaint / formDiffApply / compactPainterRefs for removed elements; add
cases: faces default + toggle, compare pill clears, ~ group Update/Add, − Remove, missing usual-place
primary, no-wrapper Position only. `npm test`, `npm run build`, gallery screenshots of every state.

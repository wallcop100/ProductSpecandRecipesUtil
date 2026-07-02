# Export Redesign Plan

Companion to `SYNC_RULES.md` (which documents current behavior). This is the
target design. Decisions below are settled; sequencing is at the end.

Settled decisions:
- **Exports are gospel.** Anything that has ever been exported is only ever
  soft-deleted (`IsDeleted='Y'`), never removed or resurrected by the app.
- **Conflicts block and reload the whole file, but local changes are kept**
  for redo — never silently dropped, never silently applied.
- **DB rename/delete of pipeline-owned ETs is allowed with confirmation.**
- **Manual snapshot mechanism** for whole-project-file backups, offered to
  the user and made at their discretion.

---

## 1. The contract: the Excels are the format, the app is a patcher

The three files are owned by an upstream design pipeline (the DB workbook has
9 sheets — `Positions`, `LinksMap`, `Locations` etc. — this app never reads).
The app is a guest writer in PS/RS and follows **preserve-by-default**: every
cell it does not explicitly own must survive an export byte-identical.

### PS `Form` — 15 columns, app owns 8

| Column | Ownership | Write rule |
|---|---|---|
| `EntityRef` | app (key) | written once on append, never changed by patch |
| `EntityType` | app (on append) | **must** write `ElementType` on append — currently missed (PS append path writes only `EntityRef`; RS append already writes it) |
| `Manufacturer`, `ProductCode`, `ComponentDescription`, `InternalNotesText`, `IsTBC`, `IsPropertiesTBC`, `IsDeleted` | app | field-level patch, only fields the user actually changed |
| `CutPoint`, `ExternalNotesText`, `ComponentID`, `CustomisationText`, `ExplodeDescription`, `ProductDescription` | upstream | never write; must survive |

### RS `Form` — 19 columns, app owns 13

| Column | Ownership | Write rule |
|---|---|---|
| `ContextType`, `ContextRef`, `RecipeIndex`, `EntityRef` | app (identity) | written on append; `RecipeIndex` may change on reorder |
| `EntityType` | app (on append) | `ElementType` (already done) |
| `Sort Order`, `Quantity`, `PackQuantity`, `IsDesign`, `IsContractItem`, `IsTRItem`, `Dim_QuantityMultiplier`, `IsInteger`, `IsDeleted` | app | **field-level** patch (change from today's whole-row rewrite) |
| `RefSuffix`, `Name`, `Description`, `Details`, `_Notes` | upstream | never write; must survive |

Moving RS from whole-row rewrite to field-level patches is the pivotal format
decision — it is what makes external edits to other cells on the same row
survivable, and everything in §3 leans on it.

### Delete semantics — exports are gospel

- Soft-delete only (`IsDeleted='Y'`) for any row that has **ever been
  exported**. Row numbers are load-bearing for the upstream pipeline and for
  the app's own `_row_num` addressing; rows are never removed.
- Rows created and deleted in-app **before any export** may be hard-removed
  from the in-memory store (current behavior, kept) — they never existed on
  disk.
- A row created in-app, exported, then deleted in-app exports as a tombstone:
  `IsDeleted='Y'` on its assigned row. The app never "takes back" an append.

---

## 2. Row identity lifecycle

**Defect being fixed:** an app-created RS row exports with `_row_num=null` →
backend appends it → the in-memory row never learns its assigned row number →
any later edit exports as *another append*. RS duplicates rows under plain
single-user usage. (PS escapes because it re-resolves by `EntityRef` at patch
time.)

```
NEW (clientId, _row_num=null)
   │ export → backend appends, returns {clientId → assignedRowNum}
   ▼
SYNCED (_row_num=N)          ← store stamps N onto the in-memory row
   │ edit → registry entry {rowNum:N, changedFields, before}
   ▼
MODIFIED ─ export → patch row N → SYNCED
   │ delete → export → IsDeleted='Y' at row N
   ▼
TOMBSTONED (gospel; never reused, never resurrected)
```

- `/patch` returns a **reconciliation payload**: per-change results including
  assigned row numbers for appends. `exportChanges` applies the stamping
  before clearing the registry.
- **Natural-key belt-and-braces**: if a reconciliation payload is ever lost
  (crash mid-export), the next export checks for an existing row matching
  `(ContextType, ContextRef, RecipeIndex, EntityRef)` (RS) or `EntityRef`
  (PS) before appending — appends never duplicate.
- Reorders renumber `RecipeIndex` within a `(ContextType, ContextRef)` group
  and mark affected rows modified with *only* `RecipeIndex` in changedFields.

---

## 3. Export pipeline

Replaces the current event-log replay (`psChanges`/`rsChanges` arrays).

1. **Dirty registry**: `Map<identity, {state: new|modified|deleted,
   changedFields, before}>` per file. One entry per dirty row regardless of
   edit count. Badge counts become truthful. Persisted to SQLite
   (`pending_changes`, keyed by project) so a crash never loses queued work —
   on reopen, prompt restore/discard.
2. **Snapshot offer** (see §6): before writing, the user is offered a project
   snapshot. Discretionary — decline does not block export.
3. **Pre-flight staleness check**: backend compares each entry's `before`
   values against the live cells on disk. Any mismatch →
   **conflict: block the whole file**.
4. **Conflict handling — block, reload, keep changes**:
   - Nothing is written to the conflicted file in that attempt (one backup
     per successful write attempt only).
   - The app **reloads the conflicted file from disk** so the user is looking
     at reality.
   - The dirty registry for that file is **kept intact** — re-keyed onto the
     freshly parsed rows via natural keys (`EntityRef` for PS; the RS natural
     key for RS). Entries whose target row vanished are flagged, not dropped.
   - The user sees a per-cell list — *disk says X, your pending change says
     Y* — and resolves each: keep mine (stays in registry, `before` updated
     to the new disk value so the next export passes the check) or take
     theirs (entry removed). Then they export again.
   - Local edits are therefore never lost and never silently applied over
     external changes.
5. **Write**: timestamped backup (kept, as today), apply field-level patches
   and appends, save, return the reconciliation payload.
6. **Per-target status**: PS and RS tracked independently. A failed or
   conflicted RS write must not leave successfully-written PS entries queued
   (fixes the current `Promise.all` gap where neither array clears).
7. **State hygiene** (the two bugs documented in `SYNC_RULES.md`):
   - `reloadFileFromDisk` clears that file's registry and the undo stacks,
     with a confirm when the registry is non-empty — "Reload & discard"
     finally means discard. (The conflict path in step 4 is the exception:
     it reloads but deliberately keeps the registry.)
   - `exportChanges` writes an **export barrier** into undo history — undo
     cannot cross it, so a pre-export queue can never be resurrected and
     re-exported.
8. **Watcher unchanged** — manual, never auto-merge. "Keep my changes"
   becomes genuinely safe: the staleness check guarantees external edits
   surface as conflicts at export time instead of being clobbered.

---

## 4. DB-writable path: `ElementTypes` as the catalogue of record

The 31-column `ElementTypes` sheet is an entity master. Ownership when the
app gains write access:

| Group | Columns | App behavior |
|---|---|---|
| Identity | `Ref`, `Description`(=Name), `ParentRef`(=family), `SortOrder` | written on create (NewETWizardModal); `SortOrder` = max+1 within family |
| Classification | `IsCollection`, `IsDeleted` | `IsCollection='Y'` becomes the real wrapper flag, retiring the `Ideaworks / N-A` PS-row convention as the primary signal (kept as legacy detection) |
| Physical/electrical | `UoM`, `MaxPower(W)`, `CurrentRange`, `CutPoint`, `CapSize`, `TapeReduction`, `LightShapeConfig`, `ControlType`, … | optional wizard fields (LIN components benefit immediately); field-level patch |
| Pipeline-owned | `ExtRef`, `IsAdopted`, `Parameters`, `ExpandedEntities`, ballast/node fields | never write |

Rules:

- Same identity lifecycle as §2 (clientId → row reconciliation; natural key =
  `Ref`). Soft-delete only — `Ref` is informally foreign-keyed by PS
  `EntityRef`, RS `EntityRef`/`ContextRef`, and the DB's own `Elements` /
  `LinksMap` sheets.
- **Rename/delete is allowed with confirmation — including pipeline ETs.**
  Before the write, the app runs a referential sweep over what it can see
  (PS refs, RS refs via `collectAllETRefs`) and presents the impact:
  *"ET-TAPE-002 is referenced by 3 PS rows and 7 RS rows. The design
  pipeline (Positions/LinksMap) may also reference it — the app cannot see
  those. Rename/delete anyway?"* Confirming cascades the rename through PS
  and RS (queued as normal registry entries); deleting tombstones the DB row
  and flags dangling PS/RS references in validation.
- **Separate export action** ("Export catalogue changes") — never bundled
  into the PS/RS export button. Different blast radius, different consent.
- Clean ownership split falls out: **DB = what an ET is; PS = how it is
  bought; RS = how it is composed.** `ensurePSRow` stops being a
  registration hack and fires only when procurement data is actually
  entered.

**Staging while the DB stays read-only:** persist `addLocalElementType`
output to a SQLite `local_element_types` table (ref, name, family, wrapper
flag, created-at). Survives restarts, feeds the palette, and is a ready-made
batch-promotion queue for when DB writes are allowed.

---

## 5. App-specific tools: two artifacts, two scopes

| | Project config | Personal library |
|---|---|---|
| Scope | one project/config | one user, all projects |
| Contents | position_ui (tag overrides, notes, ignored), collections, slot_mappings, project templates, prefs (container overrides, ignored families, tag rules/palette/snapshots); **add:** local_element_types, pending-changes metadata | favorites, global-scope templates; **add:** personal tag palette defaults |
| Today | YAML export/import exists (`config-export-yaml`) | nothing — machine-local SQLite only |
| Plan | (a) enforce the `version` field on import (present, currently unchecked); (b) **auto-snapshot** `<config>.ideaworks.yaml` beside the Excels on every successful export — the folder becomes self-contained and survives moves and machine changes (today the overlay is stranded in SQLite keyed by absolute path); (c) import merge stays last-write with a summary report | new "Export / Import my library" in settings; merge-by-id on import, newer-wins with a per-item report — never blind-overwrite |

The auto-snapshot YAML also answers "how do two people share a project":
Excel files carry the data, the YAML carries the app overlay, both travel in
the same folder.

---

## 6. Project snapshots

A manual, whole-project backup — distinct from the per-write `.backup.xlsx`
copies (which guard a single write) and from the YAML overlay (which carries
app config, not data).

- **What**: copies the three project files (DB, PS, RS) plus the
  `<config>.ideaworks.yaml` overlay into a dated folder inside the project
  folder:

  ```
  <project folder>/
    snapshot/
      2026-07-02/
        LIGHTING.DesignDBV4.5.xlsx
        ProductSpecFormV3.xlsx
        RecipesSpecFormV1.xlsx
        Base.ideaworks.yaml
      2026-07-02_143055/        ← same-day second snapshot gets a time suffix
        ...
  ```

- **When offered**: at the user's discretion, via
  - a toolbar/menu action ("Snapshot project files"), always available;
  - an offer at natural checkpoints — before the first export of a session,
    and on the conflict path (§3.4) before reloading. The offer is a
    yes/no prompt; declining never blocks the operation.
- **Rules**: snapshots are plain file copies — no manifest beyond the folder
  date, no retention policy, no auto-pruning (user's folder, user's
  discretion). The `snapshot/` folder is excluded from file detection
  (`detect_files`) and from the file watcher.
- **Restore** is manual by design (copy files back); the app does not need a
  restore feature to make backups valuable. A later enhancement could list
  snapshots and offer one-click restore, but that is out of scope here.

---

## 7. Sequencing

1. **Format fixes** — PS `EntityType` on append; append/reconcile protocol +
   `_row_num` stamping (kills the RS duplication defect). Small, isolated,
   highest value.
2. **Snapshot mechanism** (§6) — independent, small, and useful protection to
   have in place *before* the deeper export surgery ships.
3. **Dirty registry** (§3.1) + SQLite persistence, per-target export status,
   truthful badges; `local_element_types` staging table lands here too.
4. **State hygiene** (§3.7) — reload clears registry/history (with confirm);
   export barrier for undo.
5. **Field-level RS patches + staleness check** (§3.3–3.5) with the
   block-reload-keep conflict flow and per-cell resolution UI.
6. **Artifacts** (§5) — YAML auto-snapshot on export, version check on
   import, personal library export/import.
7. **DB-writable path** (§4) — gated on upstream sign-off.

Steps 1–4 fix data-corruption-class issues and are independent of any
conflict-UX decisions; step 5 completes the format philosophy (field-level
everywhere, conflicts surfaced not swallowed); 6–7 are additive.

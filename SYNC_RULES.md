# Sync Rules — how PS/RS sync actually works today

This documents the current behavior of the file-watch + export sync feature, as
implemented, for critique. It is not a spec of intended behavior — it's a
description of what the code does, including the parts that look like bugs.

## Source of truth split

| Data | Source of truth | Where it lives |
|---|---|---|
| `elementTypes`, `positionTypes` | DB Excel file | Re-parsed from disk on every open/reload. **Read-only** — never written back (`_row_num` is stripped on parse; `/patch` rejects `target: 'db'`). |
| `psRows` | PS Excel file | Re-parsed from disk on every open/reload. Read-write via `/patch`. |
| `recipes` | RS Excel file | Re-parsed from disk on every open/reload. Read-write via `/patch`. |
| Tags, notes, ignored flags, templates, slot mappings, ET collections, favorites, container-ET overrides, tag rules/palette/snapshots | SQLite | Never touches Excel except via a separate, manual YAML export/import. Not part of this sync loop at all. |

SQLite is **not a cache** of Excel content — there's no rows table for PS/RS/DB
in the schema. It's purely a config overlay keyed by project/config identity.

## Watch → warn → (maybe) reload

- `chokidar` watches only the PS and RS Excel files (never DB). Only the
  `change` event is handled — file deletion or rename fires nothing.
- On change, the renderer shows a banner. **It never auto-reloads or
  auto-merges.** Two buttons, gated on whether `psChanges`/`rsChanges` are
  non-empty:
  - **"Keep my changes"** — dismisses the banner. No re-read, no comparison.
  - **"Reload & discard my changes"** — re-imports `psRows`/`recipes` fresh
    from disk.

## Export is a manual, one-shot diff push

- One toolbar button, `exportChanges()`. No autosave, no export-on-close,
  no export-on-navigate.
- Sends only the accumulated `psChanges`/`rsChanges` — never a full dump.
- PS changes are field-level (`{ elementTypeRef, updates: {field: value} }`);
  only non-null fields are written, so untouched fields on disk survive.
- RS changes are row-level — every mutator queues the **entire row object**
  as an upsert. The backend writes every RS_FIELD_TO_EXCEL column present in
  that embedded row, not just the field that was actually touched.
- On success, `psChanges`/`rsChanges` are cleared. On partial failure (one of
  the two POSTs rejects), **neither** array is cleared, even if the other
  target's write already landed on disk — a retry would resend it.
- Every write is preceded by a timestamped `.backup.xlsx` copy. That backup
  is the only safety net in the whole flow.

## Change tracking is unbounded and event-based, not state-based

- Both `psChanges` and `rsChanges` grow with **one entry per mutation**, not
  one entry per dirty row/field. Editing the same field five times before
  exporting queues five entries.
- RS dedupes at export time server-side (last write per `_id` wins, delete
  trumps). PS does **not** dedupe at all — it just replays every queued
  change in array order.
- The change queue lives only in memory. If the app closes or crashes before
  Export, everything queued is lost — nothing is persisted to SQLite or disk
  as a pending-changes log.
- Change-count badges reflect "edit events," not "dirty rows" — they can
  overstate outstanding work.

## Conflict handling: none

There is no diff, no three-way merge, no cell-vs-cell comparison anywhere in
the codebase. It's binary:

- **Keep my changes** → next Export patches the local queue onto whatever is
  on disk *right now*, post-external-edit. Same-field collisions are silent
  last-write-wins, local always winning. For RS this is worse than PS: since
  the whole row is rewritten, an external edit to *any* column on that row —
  not just the one the user touched — gets clobbered.
- **Reload & discard** → replaces `psRows`/`recipes` with fresh data and
  mints new `_id`s for every row, but **does not clear `psChanges`/
  `rsChanges`**. The "discard" label is not accurate: if the user reloads and
  then exports (the Export button is still enabled — the queue didn't
  shrink), the stale queued changes are re-applied on top of the just-reloaded
  file. RS changes carry their own `_row_num` independent of the new `_id`s,
  so the backend finds the row and re-writes it — silently undoing the
  discard. PS changes re-resolve by `elementTypeRef` and do the same.

## Undo/redo can resurrect already-exported changes

- `_pushHistory()` snapshots `{ recipes, psRows, rsChanges, psChanges }` as
  one unit before every mutation. `undo`/`redo` swap the whole bundle.
- `exportChanges()` clears the queues directly and does **not** push a
  history entry. So: edit A, edit B, Export (queues cleared, both writes now
  on disk), Undo — pops the snapshot from before edit B, which restores
  `rsChanges`/`psChanges` to their pre-B value (non-empty) and rolls
  `recipes`/`psRows` back to pre-B. The UI now shows "unsaved changes" for
  something that's actually a *reversal* of data already durably written.
  Edit B's effect sits on disk, silently orphaned, until the user notices and
  re-exports (or doesn't).
- `reloadFileFromDisk` doesn't reset `past`/`future` either, so an `undo`
  after a reload can restore the entire pre-reload array wholesale —
  reverting the reload itself and reintroducing `_id`s that no longer
  correspond to anything freshly parsed.
- Undo history (`past`/`future`) is only cleared on a fresh project import,
  not on export or reload.

## Summary of the sync contract as implemented

1. Excel is truth for spec data; SQLite is truth for everything else; the two
   never overlap.
2. The app never writes without the user pressing Export.
3. Export is a queued diff replay, not a snapshot write — field-level for PS,
   row-level for RS.
4. There is no conflict detection. Collisions are resolved by whichever side
   writes last, and "last" for the local side means "whenever the user
   remembers to press Export," which can be arbitrarily later than when the
   edit was made.
5. "Discard" and "undo" both have gaps where they don't fully unwind what
   their label promises — discard doesn't clear the pending queue, and undo
   doesn't know an export already happened.

## Candidate critique angles

- Should `reloadFileFromDisk` clear `psChanges`/`rsChanges` (and ideally warn
  if that would drop in-flight edits) so "discard" means discard?
- Should `exportChanges()` push a history entry (or otherwise mark the queue
  as exported) so undo can't silently resurrect a stale pre-export state?
- Should RS patches be field-level like PS, to avoid clobbering unrelated
  columns on the same row?
- Should the change queue be persisted (SQLite or disk) so a crash before
  Export doesn't lose work?
- Should PS changes dedupe client- or server-side the way RS does, so the
  queue reflects dirty rows rather than edit events?
- Is silent last-write-wins acceptable for a multi-editor Excel workflow, or
  does this need at least a "the file changed under you, here's what
  differs" comparison before Export/Reload?

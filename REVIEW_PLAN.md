# Review recipes → a filter on the rail

2026-10-25. Replaces the step-through Review modal.

## The problem

Review recipes did not answer the questions people open it with: *which positions have this
ElementType? this manufacturer? this product?* It built a list, then walked it one position at a
time in a modal, away from the editing surface. Its ElementTypes unit showed only a wrapper's
internal recipe, so most ElementTypes read "This ElementType has no internal recipe".

## The idea

A filter is a question about positions. Answer it **where you edit**:

- Review recipes builds a rule with the **template editor's RuleBuilder** (same columns, same
  AND / OR, same look), shows the live matches, and **Show in list** filters the left rail to
  them. The modal closes; the matches are the rail.
- ↑ / ↓ in the rail steps through the matches (the old Next / Previous).
- In the recipe, every part the rule names (ElementType, manufacturer, code, family,
  description) is **highlighted**, at position level, inside wrappers, and exploded.
- Wrappers are **open by default** (report W47AXP), and applying a filter reopens any you closed,
  so a matching part inside a wrapper is never hidden.
- **Find** offers the one-line version: type a word, and "Show positions with “word”" (when some
  recipe holds it) filters the rail by ElementType, code, manufacturer or description.
  An ElementType result picked in Recipes filters the rail to the positions holding it; in
  Product Spec it still opens the row.

## Shape

- `positionList.query = { rule, refs, label }` in the store. `rule` is a template rule
  (`templateRules.js`), matched on `templateRecords` with `ruleMatchesRecord`; `refs` is a
  plain list (the Form's "review these positions" hand-off). `usePositionList` applies it, so
  the rail, the overview and ↑ / ↓ all agree.
- A part is highlighted when it satisfies any positive `Recipe.*` condition of the rule
  (`partMatches`). A rule with no recipe condition (only tags, say) highlights nothing.
- The rail shows the query as one chip: its words, the count, ✎ to edit, × to clear.
- Saved filter sets stay per project (`review_filter_sets`); older sets are read across
  (field names mapped, free text becomes a `matches` pattern).
- Gone: the ElementTypes unit, the cycle phase, Next unreconciled (the pips and Form-only
  filter cover it), and the review → add / replace → resume plumbing in BuilderScreen.

## Ten questions people will ask (and what answers them)

| # | Question | How |
|---|---|---|
| 1 | Which positions use ET-DL-01 / Manufacturer M / code P? | ✓ `Recipe.ElementType` / `Recipe.Manufacturer` / `Recipe.ProductCode` |
| 2 | Which use X but not Y (tape with no end cap)? | ✓ two conditions, `doesn't contain` |
| 3 | Where is X loose on site, and where inside a wrapper? | new column: `Recipe.ElementType (site)` / `(in wrapper)` |
| 4 | Which positions are the odd one out in their family? | new column: recipe unlike the family majority |
| 5 | Which have identical recipes and could share a template? | new column from `SameRecipePill`'s signature |
| 6 | Which use a product its manufacturer has retired? | new column, companion `sweep` only |
| 7 | Which use an ET with no product code, or a TBC placeholder? | new column (`isPlaceholder`) |
| 8 | Which mix manufacturers for the same job? | new column: jobs with >1 manufacturer |
| 9 | Which lack the connector / driver they should have? | new column (`connectorGapsForPosition` with `membership()`) |
| 10 | Which have X at qty ≥ N, or per metre? | new op: `qty of` |
| 11 | Which have changed since the last export? | new column from pending patch state |

## Phases

1. **This PR.** Store query, rail filter + chip, RuleBuilder modal with Show in list, part
   highlight, wrappers open by default (Fixes W47AXP), Find's "Show positions with …".
2. Entry points: "Show positions" on an ET pill, `UsagePopover`, a Product Spec row; each just
   sets the query.
3. The new columns above, one at a time (each a few lines in `templateRecords`).
4. **Apply to these N** from the rail chip: swap, add, tag the filtered set
   (`swapElementType`, `AddAnywhereModal` primed with the refs).
5. Per-row "why it matched" hint in the rail (`×3`, `in ET-LIN-W-01`).

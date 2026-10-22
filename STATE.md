# ProductSpecandRecipesUtil — state
Updated: 2026-10-22

## Now
Reports #32, #38–41 are live (#91 merged; Pages and Connected serve 7fdeb5a). Reports #42, #45, #46 are fixed in PR #92 (`reports-42-46`), not merged; tests and build pass, not checked in a browser. #43/#44 duplicate #39/#40: the companion's learned clip for FPSN1013 has part_code `TBC` (name FPSN1013MC), so the app shows the TBC line, which is purple since #40. None are resolved in Orion yet.

## Next
- Suggestion checks (plan: `~/.claude/plans/precious-conjuring-cupcake.md`): built across all three repos, each on a `suggestion-checks` branch with a PR open; none merged or deployed. Merge datajoin and psr_bridge first, redeploy both, then the app. Then check end to end on 5642 C01r (FPSN1013) as the plan's Verification says. The n8n digest receives `flagged` but does not show it yet.
- Templates phases 3 and 7 (`TEMPLATES_PLAN.md`): remove the built-ins and tag matching, then Recipe Styles / Build Recipes from Form, then drop the compat `applicable_tags`/`replaces` from datajoin `psr_app.templates()`.
- Templates: the read-only global rule still looks editable; no contract toggle on a job chip; DL/PS design not inferred for empty positions, and positions without a Form capture match nothing.
- `forkPosition` keeps the source's ContextRef on copied position rows, so the patch overwrites the source position (useStore.js forkPosition).
- Decide whether to commit `openwiki/` and force-add `AGENTS.md`/`CLAUDE.md`/`STATE.md`.

## Blocked / needs Erik

(nothing)

## Log
- 2026-10-22 (suggestion checks, part 2): Added the import's learned-family chip and its batched popup at Apply (`BulkCreateETModal`, exemplar `votes` from `/api/library`). Added the Wago card's chip and popup (`WagoSuggestion`, votes keyed by set id). Branch `suggestion-checks` is off master; `RecipeSuggestions` conflicts with #92 on the placeholder `addLabel` line. Every addition is gated on companion data, so Pages shows none of it. Thumbs are purple: green and red clashed with the purple outline.
- 2026-10-22 (suggestion checks): Built the check popup (`ConfirmSuggestionModal`) and the 👍/👎 chip, wired into RecipeSuggestions; full suite passes. Screenshots came from `shots/` (vite with its own cacheDir, because `node_modules/.vite` is root-owned) with `/api/**` mocked by Playwright.

2026-10-22 (deploy): "Auto-deploy not working": it is working (Connected = Pages = master b6379be; 3 transient `gh run list` empties today). The fixes were missing because PR #90 targeted `pip-flash`. Re-opened as #91 against master and merged. The timer's intermittent "no successful Pages run found" is `gh run list --status success` returning empty with exit 0 (about 1 call in 5); psr_bridge PR #2 retries it.
2026-10-22: Connector sets are served with their own `rule`/`why` (suggestConnectors uses them over the bundled SUGGESTIONS); the Wago card is also in the recipe editor, only when the project already has a connector template and the position none, purple when the library is served. Orion side in datajoin_mx (connector sets are `psr_templates` rows, kind 'connector'). Uncommitted; datajoin not redeployed. Gate on Orion templates removed.
2026-10-22 (report #29): `planMerge` blocks on different maker/code, non-identical wrappers, and same-context rows differing in more than quantity; else rewrites, sums, retires. The browser app has no DesignDB Elements/LinksMap, so "in use" cannot be detected: a second confirm always warns that placed entities would be orphaned.
2026-10-22 (report #34): `utils/positionHealth.js` + `StatusPip` replace the rail's grey symbols and `PositionValidationBadge` (deleted). Worst-of; no recipe/not in Form/ignored grey; purple when `companionPending[ref]` (set by RecipeSuggestions, so only visited positions). Not checked in a browser.
2026-10-22 (reports #28, #30, #35, #36): TemplatesPane uses `jobLabel`; NewETModal showSpec defaults true; ETSpecEditor gets a CopyButton and a nesting caption.
2026-10-22 (reports #31-33): NewETModal says "No family row yet for X" when other ETs already use the family; PositionRail row hints use OverlayTrigger. `sendKept` now reports "N of M sent, the rest kept" (it said "0 sent, thank you" on total failure). Why #35/#36 failed to send in the browser is unknown: the bridge stored both, and `quiet()` in companion.js hides every failure reason.
2026-10-21 (report #24): the Wago connector library comes from the companion (`connectors` feature, `GET api/recipes/connectors`) when connected; `setConnectorLibrary` refuses a shape missing a rule key and the bundled JSON stays the fallback. Uncommitted, with #25. Needs the datajoin + psr_bridge changes deployed and `meta.global_connectors` loaded before it does anything live.
2026-10-21 (report #25): shift-click multi-select — the card's click-capture preventDefault desynced the controlled checkbox, and shift-mousedown started a text range across cards. Fixed in IngredientCard; test in sharedToggle. Report #24 (connector suggestions from Companion) not started: the Wago library is hard-coded in `src/data/globalConnectors.js`, and it needs a companion endpoint in psr_bridge/datajoin first.
2026-10-21 (report #20): the Fork tutorial had never been written, so Find had nothing for it. Added `fork-position` to `TUTORIALS`, `ForkScene`, and the TutorialHint in ForkPositionModal.
## 2026-10-21 (companion styling)
`C.companion` token + `.companion-card` (+ `.companion-dot` for non-card companion UI) (in `src/debug.css`) applied in `RecipeSuggestions.jsx` and `BulkCreateETModal.jsx`. Verified with a static mock only, not the live app (needs a companion). Also on Form kind gaps, Templates-tab Global cards, ETSpecEditor "elsewhere" (companion exemplars only); dot on Global items in the template editor. Not styled: learned defaults in the import (no distinct UI), find-palette terms, contribute-only paths. Glisten animation rewritten (conic `--glisten`) but unverified in a browser.

## 2026-10-21 (report #23, PR #78)
Templates tab card ticks/flags/crosses each template part against a position that already has a recipe (`alignment()` in `TemplatesPane.jsx`); Global badge uses a Material cloud icon. Form-sourced parts get no mark.

## 2026-10-21 (open reports)
On branch templates-dynamic-rule, uncommitted: #15 wrappers toggle → Recipe actions menu; #16 no template editing in the Connectors pane; #17 kit part whose code is another job's ET is skipped; #12 no range-part suggestion when a coded TBC ET exists for the job. #13 already gone since 10-20; #18 is a question. Reports left open in products.db.
Export review: missing-from-DesignDB ETs with a confident family auto-queue (`autoQueueDbRows`); the rest need a family chosen in MasterGapPanel before the DB patch can be copied; choices go to the companion as `et-assignment`.

## 2026-10-20 (templates shipped)
Phases 1, 2, 4, 5, 6 live: #73 merged (308cd05), bridge redeployed, suggest endpoint answering. Editor's slot table replaced by a jobs board; job slots now fill from the Form (they were writing their labels, e.g. "Extrusion Profile", as ElementTypeRefs). Chip says Global ☁️. datajoin and psr_bridge `main` not pushed.

## 2026-10-20 (templates)
Looked at global templates on the live site with 5642 (snapshot → xlsx, OPFS stub). Orion's template is served and applies, but a fresh browser has no built-ins (the seed call was lost in cf7008a), the picker is buried in ⋯, and matching is by tags. Erik: all current template mechanisms are obsolete, Orion kinds → templates is the basis. Plan: `TEMPLATES_PLAN.md`.

## 2026-10-20 (UI) — wrappers follow-up merged as #72 (5f9a7c5)
Edit internals → back on container rows (Erik: moving it into the row ⋮ was wrong). Wrapper contents
sticky per ET ref, tree lines, toolbar ⋮ → View → one expand/collapse toggle. Checked against real 5642
data (psr-cli snapshot → xlsx → local build). 5499 Hush Willows has no PSR commit source (NO_PSR_SOURCES).

## 2026-10-20 (UI)
- UI quieting merged as #71 (1cdd920): colour tokens + literal-guard test, Status → export checklist, toasts, rail symbols, quieter card, sticky screens. Not yet looked at in a real browser; TBC flag still red pending a check on whether TBC blocks export. Colour board: https://claude.ai/artifact/Jt9jcAfZC43ekny9CQ8EXJ
## 2026-10-20
- CI/CD: `ci.yml` tests and builds every PR (master requires the `test` check, admins can bypass); builds stamp `<meta name="build-commit">`; Connected follows Pages automatically via psr_bridge's timer. #68 fixed the red master #67 left (first-run test matched the changelog).
- Phantom IsContractItem rows (addRecipeRow with no posRef wrote a blank ContextRef) and the rename cascade to the Form captures and SQLite records: merged as #67 (072571e).
## 2026-10-17
- Generated OpenWiki (31 pages) via openwiki 0.7.2; baseline gitHead set to repo HEAD. Not committed or pushed. Not run for other projects: token-heavy, and trading-bot/compose runs were blocked pending approval to send their source to the API.

---
name:     ProductSpecandRecipesUtil
summary:  Browser tool for building DesignDB product recipes from Excel workbooks and exporting patches back
status:   active
host:     none
path:     /data/projects/ProductSpecandRecipesUtil
repo:     https://github.com/wallcop100/ProductSpecandRecipesUtil
---

# ProductSpecandRecipesUtil

## What this is

Recipe Builder: a Vite + React + Zustand app that imports Excel workbooks (DesignDB, Product Spec,
Recipes Spec), lets you build position recipes (elements, quantities, connectors), and exports
patches back to Excel while preserving external edits. Runs in the browser (File System Access API)
or as an Electron app, with an optional companion server.

## Where it runs

| | |
|---|---|
| Host | none — dev on rosetta, served as a static web app |
| Path | `/data/projects/ProductSpecandRecipesUtil` |
| CI | `.github/workflows/ci.yml` — tests + build on every PR and branch push; `master` requires its `test` check (admins can bypass) |
| Deploy | `pages.yml` → GitHub Pages on each push to `master`; the self-hosted Connected copy follows it via psr_bridge's `psr-autodeploy.timer` |

## Hard constraints

- Generated `openwiki/` pages are not hand-edited; fix source or docs and regenerate (`openwiki code --update`).
- Patch/export row identity rules are in `SYNC_RULES.md`; read it before touching export.

## Map

- **`openwiki/index.md`** — start here for architecture, workflows, data model and testing. Generated 2026-10-17; source and tests win where they disagree. Also summarised in `AGENTS.md`.
- `src/` — app code: `screens/`, `store/` (Zustand), `platform/`, `utils/`, `components/`, `data/`.
- `docs/` — `companion-api.md`, `global-connector-templates.md`.
- `SYNC_RULES.md`, `EXPORT_PLAN.md`, `WORKPLAN.md`, `process.md` — design and process notes.
- `tests/` — vitest suites.

## Verify

```bash
npm test        # vitest run
npm run build   # vite build
```

To try any project's real workbooks in a browser: `psr fixture <n>` (psr-cli) writes them to
`psr_bridge/data/cli/cli-state/fixtures/current/`; in the Playwright MCP run `browser_run_code_unsafe
filename=tools/browse.pw.js`, navigate to the app, and "Open a folder…" loads them.

Every build stamps `<meta name="build-commit">` into `index.html` (`vite.config.js`), so a served copy can be
checked against master:

```bash
curl -s https://wallcop100.github.io/ProductSpecandRecipesUtil/ | grep -o 'build-commit" content="[^"]*'
```

## Gotchas

- (2026-10-22) Ask with `await askConfirm(text, { ok, danger })` (`components/ConfirmHost.jsx`), never `window.confirm` (reports #32, #33).
- (2026-10-22) Every companion addition must stay invisible on the GitHub Pages release, which has no companion. Gate it on a companion feature (`useCompanion()` is null there), never only on data. Suggestion checks also need the `checks` feature.
- (2026-10-22) The browser app never loads the DesignDB's Elements or LinksMap, so it cannot tell whether an ElementType is placed there. Anything that retires ETs (merge, #29) must warn instead of check.
- (2026-10-22) Position status is ONE pip (`StatusPip`, levels from `utils/positionHealth.js`) in the rail and the recipe header; it replaced the grey symbols of 2026-10-20, which existed because status had been shown three ways. Add new status signals to `positionHealth`, not as another icon. A purple pip needs `RecipeSuggestions` mounted (it sets `companionPending`), so only visited positions show it.

- (2026-10-21) Companion-sourced UI (kits, kinds, served templates, other-project codes) is purple: `.companion-card` (glistening outline) for a card, `.companion-dot` for a lone item, never both (`src/debug.css`, `C.companion`). `!important` on a `background` shorthand pins `background-position`, so the glisten animates a registered `--glisten` angle instead.
- (2026-10-17) `.gitignore` has `*.md`, so `CLAUDE.md`, `STATE.md`, `AGENTS.md` are untracked unless force-added.
- (2026-10-17) `openwiki/quickstart.md` has ~38 broken `../` links; use `openwiki/index.md` instead.
- (2026-10-17) OpenWiki sends source to the Anthropic API and is token-heavy (~40 min for this repo); it is only run on large projects. Key comes via `isec run trading-bot`; no `openwiki` Infisical project exists.
- (2026-10-22) A PR stacked on another branch keeps that branch as its base after the base merges. #90 merged into `pip-flash` and never reached master. Retarget a stacked PR to `master` before merging it.
- (2026-10-20) The setup screen renders `src/changelog.js`, so a loose `findByText` regex in its tests can also match a changelog note. #67 turned master red this way (fixed in #68).

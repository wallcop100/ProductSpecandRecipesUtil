# Companion API

The app is complete as a static site. When the same build is served beside a server that
speaks this protocol, it adds three optional features:

| Feature         | What the app does with it                                              |
|-----------------|------------------------------------------------------------------------|
| `products`      | Shows what a shared catalogue knows about a code, beside the code: the maker, whether it is retired, the ElementType refs other projects gave it, and its technical facts. Advisory only; nothing is ever applied. |
| `contributions` | Offers ElementType decisions (at staging) and product facts (from the ET spec panel) back for a person to review. |
| `workspaces`    | Keeps this browser's work (the same content as *Back up all my work*) on the server under a private link. |
| `sweep`         | When a project opens, lists the Product Spec codes their makers have retired, with replacements. |
| `library`       | Shares the style library (`style_exemplars`: maker, code → family, ref, name, description) across browsers and projects, so ElementType families are seeded the way other projects did it. |
| `projects`      | Keeps what a project's users decided, by project number, and offers it back to the next person as suggestions. |
| `contribution-status` | Shows contributors whether what they offered was accepted. |
| `outcomes`      | Says what became of each default the app filled in from `projects` or `library`: kept, changed or cleared. Sent in the background at staging and at ElementType creation; nothing is shown. |
| `reports`       | The bug reporter sends instead of saving: a bug or feature request goes straight away, with what was on screen; one that cannot be sent is kept with the browser's own bug reports, and the ▾ sends what is kept. Without it, reports are saved in the browser and copied as Markdown. |
| `find`          | Find's words, titles, how-to text and synonyms as changed on the companion admin (Find), laid over `src/help/terms.json` (GET `api/find/terms` → `{ overrides }`, cached a minute). Without it Find uses the built-in terms. |
| `jobs`          | Knows what job a product does in a recipe (tape, profile, clips …), by maker + code; it settles the ElementType family over the words. |
| `patterns`      | Recipe patterns from other projects, in `recipePatterns.js` shape, used as precedent below this browser's own. |
| `kinds`         | What positions like this one usually have (design, power, slots with their shares and rules). Shown as inline suggestions in the recipe editor and at the Form step; never applied unasked. |
| `connectors`    | The Wago connector library (`globalTemplates.json` `connectors` shape), in place of the one bundled with the app. |
| `kits`          | The parts used with a profile / channel on other projects. Inline suggestions in the ElementType review and the recipe editor. |
| `templates`     | Global templates, each with a rule saying which positions it is for (read-only), and a way to suggest one back. |
| `proof`         | A project's own rows (`projects`, `outcomes`, a whole-project `library` replace) open only to someone holding its DesignDB. The app proves it on open and sends the token with each project call. |
| `checks`        | The server counts people's checks of suggestions (`outcomes` `confirmed` / `rejected` / `unsure` / `proposed`) and serves them back as `votes`. With it, Add on a suggestion the app is unsure of opens a popup that asks; without it nothing halts and a likely suggestion only gets a 👍/👎 chip. |

All paths are **relative to the page** (`./api/...`), so a build needs no configuration. If any
call fails, the feature behaves as though it is absent. Nothing in the app depends on a
companion being there.

## Discovery

`GET api/capabilities` → `application/json`

```json
{ "protocol": "psr-companion/1",
  "features": ["products", "contributions", "workspaces", "sweep", "library", "projects", "contribution-status"] }
```

Any other answer disables the companion: a 404, a non-JSON body (a static host serving
`index.html`) or a different `protocol`.

## products

`GET api/products?code=<code>[&manufacturer=<maker>]`

```json
{
  "known": true,
  "manufacturer": "Acme",
  "retired": false,
  "replacement": null,
  "families": [{ "family": "ET-LIN-TAPE", "projects": 2, "tier": "mined" }],
  "refsUsed": [{ "ref": "ET-DL-01", "count": 3, "confirmed": true }],
  "facts": [{ "attribute": "ElementTypes.MaxPower(W)", "value": "60", "tier": "vendor", "source": "datasheet" }]
}
```

`families` is what the app shows: a ref is per project, but the family travels. `projects` is a count,
not the numbers. `tier` is
`confirmed` (a person said so), `mined` or `observed` (seen on a project). `refsUsed` is still
answered for older builds.

Answer `{ "known": false }` (or 404) for a code the catalogue has not seen. Not having seen a code
is not evidence that the code is wrong.

## sweep

`POST api/products/sweep` with `{ "codes": [{ "code", "manufacturer" }] }` (at most 2000) →
`{ "retired": [{ "code", "manufacturer", "replacement", "retired" }], "checked": n }`.

## contributions

`POST api/contributions` with JSON → `202` (queued for review) or `4xx`.

```json
{ "kind": "et-assignment", "code": "DL0560", "manufacturer": "Acme", "ref": "ET-DL-01", "description": "...", "project": "..." }
{ "kind": "fact", "code": "DL0560", "manufacturer": "Acme", "attribute": "ElementTypes.MaxPower(W)", "value": "60", "source": "Acme datasheet rev C" }
{ "kind": "supersession", "code": "011-1202", "manufacturer": "LED Flex", "replacement": "NT0712V24IP20" }
{ "kind": "pair", "code": "A1", "other": "A1-EM", "manufacturer": "Acme", "verdict": "different", "project": "..." }
```

The answer is `{ "id", "queued", "status" }`. Then `GET api/contributions/<id>` → `{ "status":
"queued" | "accepted" | "rejected" }`.

The app does not authenticate, so a server should treat contributions as untrusted suggestions:
it should queue them for a person to review, not apply them.

## library

- `GET api/library?makers=<a,b>&exclude=<project>` → `{ "exemplars": [{ maker, code, family, ref,
  name, description, source }] }`. These are exemplars from other projects, in the app's
  `style_exemplars` shape. `source` is set only on the asker's own rows (same project, same
  origin) and blank on everyone else's, so the answer names no other project.
- `POST api/library` with `{ "project", "exemplars": [...] }` sends the exemplars harvested when a
  project opens. A server should replace that project's previous set, because the latest harvest is
  the whole truth. With `proof`, a replace needs the project's token (`X-PSR-Proof`).

## projects

What a project's users decided, offered back to the next person on the same project number.
Nothing is applied without a click.

- `GET api/projects/<number>` → `{ "items": [{ id, kind, key, value, updated_at }], "dialect":
  [{ maker, token, role, projects }] }`
- `POST api/projects/<number>/items` with `{ "items": [{ kind, key, value }] }`. The latest write
  for a `(kind, key)` wins.
- `POST api/projects/<number>/feedback` with `{ "item_id", "outcome": "shown" | "accepted" |
  "rejected" }`. A server should stop offering an item that is rejected more often than it is
  accepted, until it is changed.

With `proof`, each of these needs the project's token in `X-PSR-Proof`; without it the answer is `403`.

| kind | key | value |
|---|---|---|
| `assignment` | `MAKER\|CODE` | `{ ref, code, maker }` |
| `local-et` | ElementType ref | `{ name, description, family }` |
| `rule` | token | `{ role, maker }` (code-column dialect) |
| `pair` | sorted codes joined by `\|` | `{ verdict: "same" \| "different" }` |

## proof

The project number alone is not enough to read or write a project's rows: the app proves it holds the
project's DesignDB.

1. `GET api/proof` → `{ "nonce" }`, valid 10 minutes.
2. `POST api/projects/<number>/proof` with `{ "nonce", "hashes": [...] }`. Each hash is the first 16 hex
   of `sha256(nonce|Ref|TypeRef)` for a Position the app loaded (at most 15,000). Only hashes leave the
   browser.
3. → `{ "token" }` (valid 12 hours) or `403`. The server passes it when enough of the project's
   committed Positions that no other project has are among the hashes, and most of what was sent
   belongs to the project. The answer is pass or fail only.
4. The app sends the token as `X-PSR-Proof` on `projects`, `outcomes` and the `library` replace for that
   project. Reopening the project proves again.

A project with too few distinctive Positions cannot be proven; it gets no per-project items, and the
precedent shared across projects still works.

## outcomes

`POST api/projects/<number>/outcomes` (with `proof`, needs `X-PSR-Proof`) with `{ "outcomes": [{ kind, key, tier, source, supplied,
final, outcome }] }`. A key is sent again only when its outcome changes. Nothing reads these back.

| field | meaning |
|---|---|
| `kind`, `key` | as in `projects`, plus `family` (key `MAKER\|CODE`: the family an ElementType proposal took from the library) |
| `tier` | where the value came from: `project` (this project number), `dialect` (agreed across projects), `library` (the same product elsewhere), `style` (a maker's product line elsewhere) |
| `source` | for `library` / `style`, the project number of the exemplar, when known |
| `supplied`, `final` | the value filled in, and the value when the person staged or created (`null` if cleared) |
| `outcome` | `kept`, `changed` or `cleared` |

## reports

`POST api/reports` with one report, in the shape the app's bug reports already have
(`src/utils/bugReports.js`: `note`, `kind`, `version`, `build`, `app`, `dom`, `trail`, `viewport`),
plus `project` (the project number) and `learned` (`[{ kind, key, value, tier, source }]`, the
learned values behind the code in view) → `{ "received": true, "id" }`. A server should cap the
size and rate, and treat the content as untrusted text for a person to read.

## jobs

`POST api/products/jobs` with `{ "codes": [{ code, manufacturer }] }` → `{ "jobs": [{ code, maker_key, slot, variant, category }] }`.
`maker_key` is the manufacturer in lower-case letters and digits; `slot` is a template slot key (`TAPE`, `PROFILE`,
`END_CAPS` …) or null when only `category` is known.

## patterns, kinds, kits, templates

- `GET api/recipes/patterns` → `{ "patterns": [...] }` (the shape `harvestPatterns` makes).
- `GET api/recipes/kinds` → `{ "kinds": [{ id, name, design, driver, secondary, defining, positions, projects,
  slots: [{ slot, core, share, section, qty, dim, contract, integer }], connectors: [{ set, positions }] }] }`.
- `GET api/recipes/connectors` → `{ "connectors": {source, manufacturer, templates, combos, superseded} | null }`; an entry may carry `rule` (a template rule: where it is suggested) and `why`, and then the served rules replace the bundled ones. Null until one is loaded
  (server: meta `global_connectors`); the app also refuses one that lacks a key its suggestion rules name.
- `POST api/recipes/kits` with `{ "codes": [{ code, manufacturer }], "project" }` → `{ "kits": [{ key, anchor, part:
  { code, slot, name }, share, qty, dim, integer, contract }] }`.
- `GET api/recipes/templates` → `{ "templates": [{ id, name, rule, from_kind, ingredients, version }] }`. `rule` is
  `{ match: "all", conditions: [{ column, op, value }] }` over `Design`, `DriverLocation`, `DriverType`, `Jobs`
  (or null: any position); `from_kind` is the kind it was made from.
- `POST api/recipes/templates/suggest` with `{ name, rule, ingredients: [1-60 rows], by, project }` → `{ "id", "status": "draft" }`.
  Offers a template made in the app; it is kept as a draft for a person to review, never served until published.

Suggestions answered with Add or dismiss go back through `outcomes` with `kind` `kit` / `kind` / `same` /
`connector` and `outcome` `accepted` / `dismissed`.

### checks

A person's check of a suggestion is an `outcome` too: `confirmed` (yes), `rejected` (no), `unsure` (counts for
nothing) or `proposed` (a code given for a placeholder), with optional `note`, `slot` (the job) and `final` (the
right code, given with a "no"). The latest answer per (kind, key, origin) stands. Keys:

| kind | key |
|---|---|
| `kit` | `maker\|ANCHOR>maker\|PART`; a placeholder is `maker\|ANCHOR>?\|SLOT` |
| `family` | `CODE>FAMILY` |
| `connector` | the served set's `key` |

Kits, range parts, library exemplars and connector entries carry `votes: { yes, no, origins, openNo, verdict, dropped }`
(`openNo`: a "no" newer than the last yes; `verdict`: the companion's `confirmed` or `dropped`), and kits carry `alsoWith:
[{ code, maker_key, positions, projects }]` (other profiles the part is used with). A dropped suggestion is not served.
How much the app asks is `src/utils/certainty.js`.

## workspaces

A workspace is a backup object (`format: "recipe-builder-backup"`, see `src/platform/backup.js`)
stored under a client-generated key of 128 random bits. Whoever holds the key can read and
replace the workspace. The app shares the key only in a URL fragment (`#ws=<key>`), so it never
reaches a server or an access log.

- `GET api/workspaces/<key>` → `200` with the backup JSON and an `ETag`, or `404`.
- `PUT api/workspaces/<key>` with the backup JSON, and either `If-None-Match: *` (create) or
  `If-Match: <etag>` (replace) → `200` with the new `ETag`. A precondition that no longer holds →
  `412`; the app then stops syncing and asks the person which copy to keep. A `PUT` with neither
  header is an explicit overwrite. A body that is too large → `413`.

Servers should store a hash of the key rather than the key itself.

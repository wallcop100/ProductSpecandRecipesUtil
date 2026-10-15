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
| `reports`       | Shows a ⚑ beside the bug-report button. A report written there is sent straight away, with what was on screen; one that cannot be sent is kept with the browser's own bug reports. |
| `jobs`          | Knows what job a product does in a recipe (tape, profile, clips …), by maker + code; it settles the ElementType family over the words. |
| `patterns`      | Recipe patterns from other projects, in `recipePatterns.js` shape, used as precedent below this browser's own. |
| `kinds`         | What positions like this one usually have (design, power, slots with their shares and rules). Shown as inline suggestions in the recipe editor and at the Form step; never applied unasked. |
| `kits`          | The parts used with a profile / channel on other projects. Inline suggestions in the ElementType review and the recipe editor. |
| `templates`     | Global templates to show beside the built-in ones (read-only); one that `replaces` a built-in hides it. |

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
  "families": [{ "family": "ET-LIN-TAPE", "projects": ["4756", "5139"], "tier": "mined" }],
  "refsUsed": [{ "ref": "ET-DL-01", "count": 3, "confirmed": true }],
  "facts": [{ "attribute": "ElementTypes.MaxPower(W)", "value": "60", "tier": "vendor", "source": "datasheet" }]
}
```

`families` is what the app shows: a ref is per project, but the family travels. `tier` is
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
  `style_exemplars` shape. `source` says where each one came from (for example `shared · 4756`),
  and the app's family seeding shows that as its reason.
- `POST api/library` with `{ "project", "exemplars": [...] }` sends the exemplars harvested when a
  project opens. A server should replace that project's previous set, because the latest harvest is
  the whole truth.

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

| kind | key | value |
|---|---|---|
| `assignment` | `MAKER\|CODE` | `{ ref, code, maker }` |
| `local-et` | ElementType ref | `{ name, description, family }` |
| `rule` | token | `{ role, maker }` (code-column dialect) |
| `pair` | sorted codes joined by `\|` | `{ verdict: "same" \| "different" }` |

## outcomes

`POST api/projects/<number>/outcomes` with `{ "outcomes": [{ kind, key, tier, source, supplied,
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
- `POST api/recipes/kits` with `{ "codes": [{ code, manufacturer }], "project" }` → `{ "kits": [{ key, anchor, part:
  { code, slot, name }, share, qty, dim, integer, contract }] }`.
- `GET api/recipes/templates` → `{ "templates": [{ id, name, applicable_tags, ingredients, replaces, version }] }`.

Suggestions answered with Add or dismiss go back through `outcomes` with `kind` `kit` / `kind` / `same` /
`connector` and `outcome` `accepted` / `dismissed`.

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

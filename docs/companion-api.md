# Companion API

The app is complete as a static site. When the same build is served beside a server that
speaks this protocol, it adds three optional features:

| Feature         | What the app does with it                                              |
|-----------------|------------------------------------------------------------------------|
| `products`      | Shows what a shared catalogue knows about a code, beside the code: the maker, whether it is retired, the ElementType refs other projects gave it, and its technical facts. Advisory only; nothing is ever applied. |
| `contributions` | Offers ElementType decisions (at staging) and product facts (from the ET spec panel) back for a person to review. |
| `workspaces`    | Keeps this browser's work (the same content as *Back up all my work*) on the server under a private link. |

All paths are **relative to the page** (`./api/...`), so a build needs no configuration. If any
call fails, the feature behaves as though it is absent. Nothing in the app depends on a
companion being there.

## Discovery

`GET api/capabilities` → `application/json`

```json
{ "protocol": "psr-companion/1", "features": ["products", "contributions", "workspaces"] }
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
  "refsUsed": [{ "ref": "ET-DL-01", "count": 3, "confirmed": true }],
  "facts": [{ "attribute": "ElementTypes.MaxPower(W)", "value": "60", "tier": "vendor", "source": "datasheet" }]
}
```

Answer `{ "known": false }` (or 404) for a code the catalogue has not seen. Not having seen a code
is not evidence that the code is wrong.

## contributions

`POST api/contributions` with JSON → `202` (queued for review) or `4xx`.

```json
{ "kind": "et-assignment", "code": "DL0560", "manufacturer": "Acme", "ref": "ET-DL-01", "description": "...", "project": "..." }
{ "kind": "fact", "code": "DL0560", "manufacturer": "Acme", "attribute": "ElementTypes.MaxPower(W)", "value": "60", "source": "Acme datasheet rev C" }
```

The app does not authenticate, so a server should treat contributions as untrusted suggestions:
it should queue them for a person to review, not apply them.

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

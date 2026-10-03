# Global templates (JSON)

## Where they live

| What | Where |
|---|---|
| Data, for tools | **`src/data/globalTemplates.json`** on `master` |
| Raw URL (read) | `https://raw.githubusercontent.com/wallcop100/productspecandrecipesutil/master/src/data/globalTemplates.json` (private repo: send a token, or use the GitHub API below) |
| GitHub API (read + write) | `GET` / `PUT https://api.github.com/repos/wallcop100/productspecandrecipesutil/contents/src/data/globalTemplates.json` |
| Source of the connector templates | Kaizen page **101097**, "Lighting Manufacturing - Wago plugs" |
| Guard | `tests/frontend/globalConnectors.test.jsx`: the JSON must parse and match the shape below |
| Code that reads it | `src/data/globalConnectors.js` (suggestion rules live here, not in the JSON) |

The JSON holds data only. One top-level key per kind of global template. Today that is `connectors`; others can be added beside it.

## Shape

```json
{
  "_readme": "…",
  "connectors": {
    "source": { "system": "Kaizen", "pageId": 101097, "title": "…", "syncedAt": "YYYY-MM-DD" },
    "manufacturer": "WAGO",
    "templates": [
      { "key": "5pin-dali-perm", "name": "Wago 5-pin DALI + perm", "pins": 5, "note": "…",
        "site":   [ { "code": "770-105", "role": "socket", "label": "5-pin socket" } ],
        "driver": [ { "code": "770-215", "role": "plug", "label": "5-pin plug" },
                    { "code": "770-505/023-000", "role": "sr", "label": "5-pin plug strain relief" } ] }
    ],
    "combos": [ { "key": "dali-2+3", "name": "Wago 2-pin DALI + 3-pin LEN", "of": ["2pin-dali", "3pin-len"], "note": "…" } ],
    "superseded": { "770-243": "770-203" }
  }
}
```

Rules:
- `key` must stay the same across updates. The suggestion rules name `5pin-dali-perm`, `3pin-len`, `2pin-dali` and the combo `dali-2+3`; the test fails if one disappears. A new type needs a new key, and a person adds its suggestion rule in `globalConnectors.js`.
- `site` parts are the socket side and go on the position. `driver` parts are the plug side and go inside the wrapper.
- `role` is `socket`, `plug` or `sr`. Codes 770-50x are strain reliefs; the first other code on the site side is the socket, and on the driver side the plug.
- `pins`, plus `variant` where it is set (keep `"variant": "DALI"` on the 2-pin), make new ElementType refs such as `ET-5PIN-SOCKET` and `ET-2PIN-DALI-PLUG-SR`.
- Ship current parts only. Replaced codes go in `superseded` (old → new). The test fails if a superseded code is in a template.
- `combos` is the team's choice and is not on the Kaizen page. Carry it through unchanged.

## n8n workflow

1. **Trigger:** a Schedule node (e.g. daily), or a webhook if Kaizen can call one when page 101097 is saved.
2. **Read the page:** an HTTP Request node to Kaizen for page 101097. Fill in Kaizen's page endpoint; it is not recorded here.
3. **Get the JSON:** an HTTP Request node, `GET …/contents/src/data/globalTemplates.json?ref=master`, using the GitHub credential. Keep `sha`, and decode `content` (base64) to JSON.
4. **Build:** a Code node (below). It rewrites `connectors.templates` and `connectors.superseded` from the page, and keeps `key`, `combos` and everything else from the current JSON.
5. **Changed?** An IF node: stop if nothing but `syncedAt` changed.
6. **Propose:**
   - create the branch `n8n/global-templates-YYYYMMDD` from `master` (`POST /git/refs`);
   - `PUT …/contents/src/data/globalTemplates.json` with `branch`, `sha`, the base64 `content` and the message "Global templates from Kaizen page 101097";
   - open a pull request to `master` (`POST /pulls`).
7. **Notify:** send the PR link to whoever approves it.

The tests run only on pushes to `master` (`.github/workflows/pages.yml`), not on PRs. Review, then merge. If the JSON is malformed, the test fails, the deploy stops, and the live site keeps the old data.

GitHub credential: a fine-grained token limited to this repo with Contents and Pull requests write access, stored in n8n credentials.

### Code node: build the new JSON

Input: `current` (the decoded JSON from step 3) and `rows` (the page's current table, parsed in step 2 as `[{ use, site: [codes], driver: [codes] }]`) and `old` (the page's superseded pairs as `{ oldCode: newCode }`).

```js
const { current, rows, old } = $json
const SR = /^770-50\d/
const KEY = { 5: '5pin-dali-perm', 4: '4pin-switched-perm', 3: '3pin-len', 2: '2pin-dali' }
const prev = new Map(current.connectors.templates.map(t => [t.key, t]))

const templates = rows.map(r => {
  const pins = Number(String(r.use).match(/(\d)-pin/i)?.[1])
  const key = KEY[pins]
  if (!key) throw new Error(`Unknown connector row on the page: ${r.use}`)   // a person adds new types
  const was = prev.get(key) || {}
  const known = new Map([...(was.site || []), ...(was.driver || [])].map(p => [p.code, p.label]))
  const side = (codes, main) => codes.map(code => {
    const role = SR.test(code) ? 'sr' : main
    const label = known.get(code) || `${pins}-pin${was.variant ? ` ${was.variant}` : ''} ${main}${role === 'sr' ? ' strain relief' : ''}`
    return { code, role, label }
  })
  return { ...was, key, pins, site: side(r.site, 'socket'), driver: side(r.driver, 'plug') }
})

const next = structuredClone(current)
next.connectors.templates = templates
next.connectors.superseded = old
next.connectors.source.syncedAt = new Date().toISOString().slice(0, 10)

const strip = j => JSON.stringify({ ...j, connectors: { ...j.connectors, source: { ...j.connectors.source, syncedAt: '' } } })
const text = JSON.stringify(next, null, 2) + '\n'
return [{ json: { changed: strip(next) !== strip(current), content: Buffer.from(text).toString('base64') } }]
```

Names and notes are kept from the current JSON. Edit them by hand in a PR when the page wording changes.

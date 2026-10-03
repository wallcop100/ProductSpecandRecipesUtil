# Global templates (JSON)

## Where they live

| What | Where |
|---|---|
| Data, for tools | **`src/data/globalTemplates.json`** on `master` |
| Raw URL (read) | `https://raw.githubusercontent.com/wallcop100/productspecandrecipesutil/master/src/data/globalTemplates.json` (private repo: send a token, or use the GitHub API below) |
| GitHub API (read + write) | `GET` / `PUT https://api.github.com/repos/wallcop100/productspecandrecipesutil/contents/src/data/globalTemplates.json` |
| Source (the only page n8n reads) | Kaizen page **141527**, "Global Templates - PSR Tool": Connectors, Combinations, Parts (code, suggested ElementType ref, label) and Superseded tables |
| Reference for people | Kaizen page 101097, "Lighting Manufacturing - Wago plugs". When a code changes there, change it on 141527 too |
| Guard | `tests/frontend/globalConnectors.test.jsx`: the JSON must parse and match the shape below |
| Code that reads it | `src/data/globalConnectors.js` (suggestion rules live here, not in the JSON) |

The JSON holds data only. One top-level key per kind of global template. Today that is `connectors`; others can be added beside it.

## Shape

```json
{
  "_readme": "…",
  "connectors": {
    "source": { "system": "Kaizen", "pageId": 141527, "title": "…", "syncedAt": "YYYY-MM-DD" },
    "manufacturer": "WAGO",
    "templates": [
      { "key": "5pin-dali-perm", "name": "Wago 5-pin DALI + perm", "pins": 5, "note": "…",
        "site":   [ { "code": "770-105", "role": "socket", "label": "5-pin socket", "ref": "ET-5PIN-SOCKET" } ],
        "driver": [ { "code": "770-215", "role": "plug", "label": "5-pin plug", "ref": "ET-5PIN-PLUG" },
                    { "code": "770-505/023-000", "role": "sr", "label": "5-pin plug strain relief", "ref": "ET-5PIN-PLUG-SR" } ] }
    ],
    "combos": [ { "key": "dali-2+3", "name": "Wago 2-pin DALI + 3-pin LEN", "of": ["2pin-dali", "3pin-len"], "note": "…" } ],
    "superseded": { "770-243": "770-203" }
  }
}
```

Rules:
- `key` must stay the same across updates. The suggestion rules name `5pin-dali-perm`, `3pin-len`, `2pin-dali` and the combo `dali-2+3`; the test fails if one disappears. A new type needs a new key, and a person adds its suggestion rule in `globalConnectors.js`.
- `site` parts are the socket side and go on the position. `driver` parts are the plug side and go inside the wrapper.
- `role` is `socket`, `plug` or `sr`.
- `ref` is the suggested ElementType, in the page's ref style ET-<pins>PIN[-<variant>]-<SOCKET|PLUG>[-SR] (the test checks it). A project that already has an ElementType with that code keeps its own; if the ref is taken by another part, the tool uses ET-CONN-WAGO-<code>.
- Ship current parts only. Replaced codes go in `superseded` (old → new). The test fails if a superseded code is in a template.

## n8n workflow

1. **Trigger:** a Schedule node (e.g. daily), or a webhook if Kaizen can call one when page 141527 is saved.
2. **Read the page:** an HTTP Request node to Kaizen for page 141527, taking its markdown. Fill in Kaizen's page endpoint; it is not recorded here.
3. **Get the JSON:** an HTTP Request node, `GET …/contents/src/data/globalTemplates.json?ref=master`, using the GitHub credential. Keep `sha`, and decode `content` (base64) to JSON as `current`.
4. **Build:** the Code node below. It reads the four tables and rebuilds `connectors`. It stops with a message, and nothing is proposed, when a key has gone, a part names an unknown connector, a role or side is unknown, or a ref doesn't look like `ET-…`.
5. **Changed?** An IF node on `changed`; stop when false (only the date would differ).
6. **Propose:**
   - create the branch `n8n/global-templates-YYYYMMDD` from `master` (`POST /git/refs`);
   - `PUT …/contents/src/data/globalTemplates.json` with `branch`, `sha`, the base64 `content` and the message "Global templates from Kaizen page 141527";
   - open a pull request to `master` (`POST /pulls`).
7. **Notify:** send the PR link to whoever approves it, and send the error to the same person when step 4 stops.

The tests run only on pushes to `master` (`.github/workflows/pages.yml`), not on PRs. Review, then merge. If the JSON is malformed, the test fails, the deploy stops, and the live site keeps the old data.

GitHub credential: a fine-grained token limited to this repo with Contents and Pull requests write access, stored in n8n credentials.

### Code node

Input: `page` (page 141527's markdown) and `current` (the decoded JSON). Run against the page as it stands, it gives back the repo's JSON unchanged.

```js
// n8n Code node: page 141527 markdown + current JSON → new JSON (base64) and whether it changed.
// Input: $json.page (the page's markdown), $json.current (globalTemplates.json, parsed).
const { page, current } = $json
const fail = msg => { throw new Error(`Global templates sync stopped: ${msg}`) }

// The table under a "## <title>" heading, as objects keyed by its header row.
function table(title) {
  const lines = page.split('\n')
  const at = lines.findIndex(l => l.replace(/^#+\s*/, '').trim() === title && /^#{2,3}\s/.test(l))
  if (at < 0) fail(`no "${title}" section`)
  const rows = []
  for (let i = at + 1; i < lines.length && !/^#{1,3}\s/.test(lines[i]); i++) {
    if (lines[i].trim().startsWith('|')) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
  }
  if (rows.length < 2) fail(`"${title}" has no table`)
  const [head, , ...body] = rows
  return body.filter(r => r.some(Boolean)).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

const connectors = table('Connectors')
const combos = table('Combinations')
const parts = table('Parts')
const superseded = table('Superseded')

// Keys never change or disappear: a person decides that, not the sync.
const keys = new Set(connectors.map(c => c.Key))
for (const t of current.connectors.templates) if (!keys.has(t.key)) fail(`connector "${t.key}" is missing from the page`)
for (const c of current.connectors.combos) if (!combos.some(x => x.Key === c.key)) fail(`combination "${c.key}" is missing from the page`)

const ROLE = { socket: 'socket', plug: 'plug', sr: 'sr' }
const SIDE = { site: 'site', driver: 'driver' }
const templates = connectors.map(c => {
  const pins = Number(c.Use.match(/(\d)-pin/i)?.[1]) || fail(`no pin count in Use "${c.Use}"`)
  const mine = parts.filter(p => p.Key === c.Key)
  if (!mine.length) fail(`connector "${c.Key}" has no parts`)
  const part = p => ({
    code: p.Code || fail(`a ${c.Key} part has no code`),
    role: ROLE[p.Role.toLowerCase()] || fail(`unknown role "${p.Role}"`),
    label: p.Label || fail(`${p.Code} has no label`),
    ref: /^ET-[A-Z0-9-]+$/.test(p.Ref) ? p.Ref : fail(`bad ref "${p.Ref}" for ${p.Code}`),
  })
  const side = s => mine.filter(p => (SIDE[p.Side.toLowerCase()] || fail(`unknown side "${p.Side}"`)) === s).map(part)
  return { key: c.Key, name: c.Name, pins, ...(c.Variant ? { variant: c.Variant } : {}), ...(c.Note ? { note: c.Note } : {}), site: side('site'), driver: side('driver') }
})
for (const p of parts) if (!keys.has(p.Key)) fail(`part ${p.Code} names unknown connector "${p.Key}"`)

const next = structuredClone(current)
next.connectors.templates = templates
next.connectors.combos = combos.map(c => {
  const of = c['Made of'].split('+').map(s => s.trim()).filter(Boolean)
  for (const k of of) if (!keys.has(k)) fail(`combination "${c.Key}" names unknown connector "${k}"`)
  return { key: c.Key, name: c.Name, of, ...(c.Note ? { note: c.Note } : {}) }
})
next.connectors.superseded = Object.fromEntries(superseded.map(r => [r['Old code'], r['Replaced by']]))
next.connectors.source.syncedAt = new Date().toISOString().slice(0, 10)

const strip = j => JSON.stringify({ ...j, connectors: { ...j.connectors, source: { ...j.connectors.source, syncedAt: '' } } })
const text = JSON.stringify(next, null, 2) + '\n'
return [{ json: { changed: strip(next) !== strip(current), content: Buffer.from(text).toString('base64') } }]
```

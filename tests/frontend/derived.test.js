import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Every derived list has one source, src/utils/derived.js (docs/DERIVED.md). An inline copy drifts.
const COPIES = [
  ['not-deleted check, use live()', /\(\s*[\w$.?]+\.IsDeleted \|\| [\w$.?]+\.isDeleted\s*\)/],
  ['ElementTypeRef read, use etRefOf()', /\.ElementTypeRef \|\| [\w$.?]+\.elementTypeRef\b/],
  ['elementTypeRef read, use entryRefOf()', /\.elementTypeRef \|\| [\w$.?]+\.ElementTypeRef\b/],
  ['trim+upper key, use refKey()', /=\s*\(?\w+\)? => String\(\w+ (\?\?|\|\|) ''\)\.trim\(\)\.toUpperCase\(\)\s*$/m],
]
const files = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : /\.jsx?$/.test(n) ? [p] : [] })

describe('derived lists have one source', () => {
  for (const [what, re] of COPIES) {
    it(`no inline ${what}`, () => {
      const hits = files('src').filter(f => !f.endsWith('derived.js') && re.test(readFileSync(f, 'utf8')))
      expect(hits).toEqual([])
    })
  }
})

// What a product IS has one source, codeJobs.js (WORDS + jobOf). A regex of product words elsewhere
// is a second classifier that drifts from it (a diffuser offered for a profile, FPS1715BG2000).
describe('one part classifier', () => {
  it('no product-word regex outside codeJobs.js', () => {
    const re = /\/[^/\n]*(DIFFUSER|END\\s|ENDCAP|LOUVRE|EXTRUSION|ENCAPSULATED|GRAZER|TRANSFORMER|SNOOT|HONEYCOMB|BACK\\s)[^/\n]*\/[gimsuy]*/
    const hits = files('src').filter(f => !f.endsWith('codeJobs.js') && re.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })
})

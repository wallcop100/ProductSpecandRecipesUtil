// @vitest-environment node
import { test, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Every colour in a component comes from src/styles/tokens.js. A hex literal anywhere else
 * fails here, so a new one has to be a token (or argued into the lists below).
 */
const SRC = path.resolve(__dirname, '../../src')

const EXEMPT_FILES = [
  'styles/tokens.js',                   // where the tokens are defined
  'utils/entityStyle.js',               // ElementType orange / PositionType blue: the card's design language
  'components/TagColorControl.jsx',     // user-picked tag palette: categorical
  'components/LinWrapperDiagram.jsx',   // drawing of the physical wrapper, not UI state
  'utils/patchScript.js',               // colours written into the Excel output
]

// Entity colours used at call sites (same values as entityStyle; add-to-spec orange).
const EXEMPT_VALUES = new Set(['#bf6018', '#ffeddb', '#4e7594', '#e2f8fe', '#e67e22'])

test('no hex colour literals outside the token and categorical files', () => {
  const hits = []
  for (const rel of fs.readdirSync(SRC, { recursive: true })) {
    const f = rel.split(path.sep).join('/')
    if (!/\.(js|jsx)$/.test(f) || EXEMPT_FILES.includes(f)) continue
    const lines = fs.readFileSync(path.join(SRC, rel), 'utf8').split('\n')
    lines.forEach((line, i) => {
      for (const [h] of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        if (!EXEMPT_VALUES.has(h.toLowerCase())) hits.push(`${f}:${i + 1} ${h}`)
      }
    })
  }
  expect(hits).toEqual([])
})

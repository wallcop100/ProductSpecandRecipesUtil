import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import TutorialHint from '../../src/tutorial/TutorialHint'
import { CONCEPTS } from '../../src/components/ConceptCard'

describe('one help button per header', () => {
  test('no file puts a concept "?" and a tutorial "?" side by side', () => {
    const dirs = ['src/components', 'src/screens']
    const both = []
    for (const d of dirs) {
      for (const f of fs.readdirSync(d).filter(x => x.endsWith('.jsx'))) {
        const s = fs.readFileSync(path.join(d, f), 'utf8')
        if (/<ConceptHint\b/.test(s) && /<TutorialHint\b/.test(s)) both.push(f)
      }
    }
    expect(both).toEqual([])
  })

  test('the tutorial opens with the key idea on its first page', () => {
    render(<TutorialHint id="form-pane" concept={CONCEPTS.INTENT} />)
    fireEvent.click(screen.getByRole('button', { name: /How this pane works/ }))
    expect(screen.getByTestId('concept-body')).toBeInTheDocument()
  })
})

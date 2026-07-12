import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { hasSeen, markSeen, markAllSeen, resetSeen } from '../../src/tutorial/seen'
import { TUTORIALS, ALL_TUTORIAL_IDS } from '../../src/tutorial/tutorials'
import { SCENES } from '../../src/tutorial/scenes'
import TutorialHint from '../../src/tutorial/TutorialHint'

beforeEach(() => {
  window.localStorage.clear()
})

describe('seen.js — device-local, never a throw', () => {
  test('unseen by default; markSeen persists', () => {
    expect(hasSeen('builder-tree')).toBe(false)
    markSeen('builder-tree')
    expect(hasSeen('builder-tree')).toBe(true)
  })

  test('markAllSeen covers every card; resetSeen clears', () => {
    markAllSeen(ALL_TUTORIAL_IDS)
    for (const id of ALL_TUTORIAL_IDS) expect(hasSeen(id)).toBe(true)
    resetSeen()
    expect(hasSeen(ALL_TUTORIAL_IDS[0])).toBe(false)
  })

  test('corrupt storage reads as unseen, never a throw — worst case is one extra showing', () => {
    window.localStorage.setItem('rb-tutorial-seen', '{not json')
    expect(() => hasSeen('builder-tree')).not.toThrow()
    expect(hasSeen('builder-tree')).toBe(false)
    expect(() => markSeen('builder-tree')).not.toThrow()
    expect(hasSeen('builder-tree')).toBe(true)   // and it recovers
  })
})

describe('tutorials.js — the scripts are well-formed', () => {
  test('every card has a title, an intro, and at least 3 steps', () => {
    for (const [id, card] of Object.entries(TUTORIALS)) {
      expect(card.title, id).toBeTruthy()
      expect(card.intro, id).toBeTruthy()
      expect(card.steps.length, id).toBeGreaterThanOrEqual(3)
    }
  })

  test('every step names a scene that exists, with a blurb and an integer beat', () => {
    for (const [id, card] of Object.entries(TUTORIALS)) {
      for (const s of card.steps) {
        expect(s.blurb, `${id} step`).toBeTruthy()
        expect(SCENES[s.scene], `${id} → scene "${s.scene}"`).toBeTruthy()
        expect(Number.isInteger(s.beat), `${id} beat`).toBe(true)
      }
    }
  })

  test('every scene renders at every beat it can be asked for', () => {
    for (const card of Object.values(TUTORIALS)) {
      for (const s of card.steps) {
        const Scene = SCENES[s.scene]
        const { unmount } = render(<Scene beat={s.beat} />)
        unmount()
      }
    }
  })

  /** Every card is anchored somewhere, and every anchor names a real card. */
  test('the anchors in the app and the cards agree, one to one', () => {
    const root = path.resolve(__dirname, '../../src')
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
    const anchored = []
    for (const f of walk(root)) {
      if (f.includes(`${path.sep}tutorial${path.sep}`)) continue
      if (!/\.jsx?$/.test(f)) continue
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/TutorialHint id="([a-z-]+)"/g)) {
        anchored.push(m[1])
      }
    }
    expect(anchored.sort()).toEqual(Object.keys(TUTORIALS).sort())
    expect(new Set(anchored).size).toBe(anchored.length)   // no card auto-opens from two places
  })

  /**
   * The pointer used to be one absolutely-positioned sprite driven by hand-written {x, y}
   * per beat — and it pointed at the wrong thing in nearly every scene, because a layout
   * tweak silently rots the coordinates. <Click> anchors it to the element being acted on,
   * so it is right by construction. Never go back.
   */
  test('no scene positions a cursor by hand-written coordinates', () => {
    const dir = path.resolve(__dirname, '../../src/tutorial/scenes')
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('Scene.jsx'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8')
      expect(src, `${f} hand-places a cursor`).not.toMatch(/cursorAt|<Cursor\b/)
      // …and every scene actually shows the pointer somewhere: a demo with nothing being
      // clicked is a slideshow, not a simulation.
      expect(src.includes('<Click'), `${f} never anchors a click`).toBe(true)
    }
  })

  /**
   * The demo must speak the project's own vocabulary. A02* are downlights, C0*r / D0*r are
   * linear, ET-LIN-01 is the wrapper. Teaching invented refs teaches the wrong refs.
   */
  test('the demo data uses the real ref conventions, not invented ones', () => {
    const dir = path.resolve(__dirname, '../../src/tutorial')
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
    const INVENTED = /\bET-(DL|SOCK|SR|TAPE|PROF|DIFF|COLLAR)-\d|\bD01\b|\bL0[12]\b|Brightline|Lumina|Konek/
    for (const f of walk(dir)) {
      if (!/\.jsx?$/.test(f)) continue
      const src = fs.readFileSync(f, 'utf8')
      expect(INVENTED.test(src), `${path.basename(f)} uses an invented ref`).toBe(false)
    }
  })

  /**
   * No linear tour. FEATURESET.md: "do not narrate a tour of a project the user does not
   * have." Cards are anchored, contextual, and never chain to another pane.
   */
  test('no card copy points at a "next pane"', () => {
    for (const card of Object.values(TUTORIALS)) {
      const text = [card.intro, ...card.steps.map(s => s.blurb)].join(' ').toLowerCase()
      expect(text).not.toMatch(/next pane|next screen|next tutorial|continue to the/)
    }
  })
})

/**
 * The store is a singleton holding the user's LIVE project. A tutorial that touches it can
 * corrupt real work, so nothing in src/tutorial/ may import it — enforced here, not by
 * convention.
 */
describe('the tutorial never touches the live store', () => {
  test('no file under src/tutorial/ imports useStore', () => {
    const root = path.resolve(__dirname, '../../src/tutorial')
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
    const files = walk(root)
    expect(files.length).toBeGreaterThan(5)
    // Match real imports/requires, not comments that merely mention the rule.
    const importsStore = /(?:from\s+['"][^'"]*store\/useStore|require\([^)]*useStore)/
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8')
      expect(importsStore.test(src), `${path.basename(f)} imports the live store`).toBe(false)
    }
  })
})

describe('TutorialHint — auto-open once, then a quiet ? for ever', () => {
  test('an unseen card auto-opens on first mount', async () => {
    render(<TutorialHint id="builder-tree" />)
    expect(await screen.findByText('The project tree')).toBeInTheDocument()
  })

  test('dismissing marks it seen; a re-mount does NOT auto-open; the ? still does', async () => {
    const first = render(<TutorialHint id="builder-tree" />)
    fireEvent.click(await screen.findByLabelText('Close'))   // the modal X
    expect(hasSeen('builder-tree')).toBe(true)
    first.unmount()

    render(<TutorialHint id="builder-tree" />)
    expect(screen.queryByText('The project tree')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /How this pane works/ }))
    expect(await screen.findByText('The project tree')).toBeInTheDocument()
  })

  test('Next/Back step through; the last step offers Got it; reopen resets to step 0', async () => {
    markSeen('builder-tree')   // suppress auto-open; drive via the chip
    render(<TutorialHint id="builder-tree" />)
    fireEvent.click(screen.getByRole('button', { name: /How this pane works/ }))
    await screen.findByText('The project tree')

    const nSteps = TUTORIALS['builder-tree'].steps.length
    expect(screen.getByText(`step 1 of ${nSteps}`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }))
    expect(screen.getByText(`step 2 of ${nSteps}`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText(`step 1 of ${nSteps}`)).toBeInTheDocument()

    for (let i = 1; i < nSteps; i++) fireEvent.click(screen.getByRole('button', { name: 'Next →' }))
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    // the modal fades out; gone means gone from the DOM, not mid-transition
    await waitFor(() => expect(screen.queryByText('The project tree')).toBeNull())

    // reopen → back at step 1
    fireEvent.click(screen.getByRole('button', { name: /How this pane works/ }))
    expect(await screen.findByText(`step 1 of ${nSteps}`)).toBeInTheDocument()
  })

  test('Skip all tutorials marks every card seen', async () => {
    render(<TutorialHint id="builder-tree" />)
    fireEvent.click(await screen.findByText('Skip all tutorials'))
    for (const id of ALL_TUTORIAL_IDS) expect(hasSeen(id)).toBe(true)
  })

  test('an unknown id renders nothing at all', () => {
    const { container } = render(<TutorialHint id="no-such-card" />)
    expect(container.innerHTML).toBe('')
  })

  /**
   * Several panes mount together (tree + drawer at builder load). A fresh browser must see
   * ONE card, not a stack of modals — the others wait for a later mount of their pane.
   */
  test('two unseen hints mounting together auto-open only one card', async () => {
    render(<><TutorialHint id="builder-tree" /><TutorialHint id="recipe-editor" /></>)
    expect(await screen.findByText('The project tree')).toBeInTheDocument()
    expect(screen.queryByText('The recipe editor')).toBeNull()

    // dismissing the first releases the lock; the second is still unseen for next time
    fireEvent.click(screen.getByLabelText('Close'))
    expect(hasSeen('builder-tree')).toBe(true)
    expect(hasSeen('recipe-editor')).toBe(false)
  })

  test('an inactive hint (hidden pane) does not auto-open, and does when it becomes active', async () => {
    const { rerender } = render(<TutorialHint id="palette" active={false} />)
    expect(screen.queryByText('The palette drawer')).toBeNull()

    rerender(<TutorialHint id="palette" active />)
    expect(await screen.findByText('The palette drawer')).toBeInTheDocument()
  })
})

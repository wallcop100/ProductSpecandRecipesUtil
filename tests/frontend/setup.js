import '@testing-library/jest-dom'
import { beforeEach } from 'vitest'

/**
 * Tutorial cards auto-open once per pane on a fresh browser — which is every jsdom test.
 * Left alone, an auto-opened modal shadows whatever component a test is actually about.
 * So every test starts with every card already seen; tutorial.test.jsx clears this itself
 * to exercise the first-run behaviour.
 */
import { ALL_TUTORIAL_IDS } from '../../src/tutorial/tutorials'

beforeEach(() => {
  // Some suites replace `window` wholesale (store.test.js) — no localStorage there, and no
  // UI either, so silently skipping is correct.
  try { window.localStorage.setItem('rb-tutorial-seen', JSON.stringify(ALL_TUTORIAL_IDS)) } catch { /* no-op */ }
})

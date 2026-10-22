import { describe, test, expect } from 'vitest'
import { positionHealth } from '../../src/utils/positionHealth'

const err = { severity: 'error', message: 'e' }
const warn = { severity: 'warning', message: 'w' }

describe('positionHealth: worst of', () => {
  test.each([
    [{ status: 'done' }, 'green'],
    [{ status: 'empty' }, 'grey'],
    [{ status: 'notInForm' }, 'grey'],
    [{ status: 'ignored' }, 'grey'],
    [{ status: 'form' }, 'amber'],   // drawn half-filled (StatusPip)
    [{ status: 'done', issues: [warn] }, 'amber'],
    [{ status: 'done', companion: true }, 'purple'],
    [{ status: 'empty', companion: true }, 'purple'],
    [{ status: 'done', issues: [warn], companion: true }, 'amber'],
    [{ status: 'form', issues: [err], companion: true }, 'red'],
  ])('%j → %s', (input, level) => expect(positionHealth(input).level).toBe(level))

  test('a clean done position has no reasons', () => expect(positionHealth({ status: 'done' }).reasons).toEqual([]))
})

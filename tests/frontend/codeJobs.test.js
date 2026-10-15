import { describe, it, expect } from 'vitest'
import golden from './fixtures/code-jobs.json'
import { jobOf, jobKey, familyForJob, familiesForJob } from '../../src/utils/codeJobs'

// Every distinct recipe row of the library projects, labelled by the mining (maker, code, ref,
// name, family, category only — no project data): the browser must agree with it.


describe('code jobs', () => {
  it('agrees with the mined labels on every library recipe row', () => {
    const off = golden.filter(g => { const j = jobOf(g); return j.slot !== g.slot || j.variant !== g.variant })
    expect(golden.length).toBeGreaterThan(1500)
    expect(off.slice(0, 5)).toEqual([])
  })
  it('reads a Form code with no ref yet from its maker, code, words and category', () => {
    expect(jobOf({ maker: 'LEDFlex', code: 'UN16TVC2715G2', name: 'LEDFlex - UN16TVC2715G2' })).toEqual({ slot: 'TAPE', variant: 'flex' })
    expect(jobOf({ maker: 'LEDFlex', code: 'UN16GFSLW1000', category: 'Neon Profile' }).slot).toBe('MOUNT_CHANNEL')
    expect(jobOf({ name: 'LED Flex - 3509 End Cap' }).slot).toBe('END_CAPS')
    expect(jobOf({ name: 'Phos - Eyeconic Honeycomb Accessory' }).slot).toBe('OPTIC_ACCESSORY')
  })
  it('an IsDesign row inside a wrapper is the fitting, not the design element', () => {
    expect(jobOf({ ref: 'ET-PS-04', isDesign: true, section: 'internal' }).slot).toBe('FITTING')
    expect(jobOf({ ref: 'ET-DL-02', isDesign: true, section: 'position' })).toEqual({ slot: 'DESIGN_ELEMENT', variant: 'DL' })
  })
  it('gives each job its house family and ref head', () => {
    expect(familyForJob({ slot: 'END_CAPS' })).toEqual({ family: 'ET-LIN-PROF', head: 'ET-LIN-CAP' })
    expect(familyForJob({ slot: 'TAPE', variant: 'flex' }).family).toBe('ET-LIN-FLEX')
    expect(jobKey({ slot: 'TAPE', variant: 'tape' })).toBe('TAPE:tape')
  })
  it("counts a project's own family for a job only when that family has a row", () => {
    const elementTypes = [{ ElementTypeRef: 'ET-LIN-CLIP-01', Family: 'ET-LIN-CLIP-METAL' }, { ElementTypeRef: 'ET-LIN-TAPE-01', Family: 'ET-LIN-COMPONENTS' }]
    const familyRows = new Set(['ET-LIN-CLIP-METAL'])
    expect([...familiesForJob({ slot: 'CLIPS' }, { elementTypes, familyRows })].sort()).toEqual(['ET-LIN-CLIP', 'ET-LIN-CLIP-METAL'])
    expect([...familiesForJob({ slot: 'TAPE', variant: 'tape' }, { elementTypes, familyRows })]).toEqual(['ET-LIN-TAPE'])
  })
  it('a catch-all family is no home for any job; one filing what the house files together is', () => {
    const elementTypes = [
      ...['ET-LIN-TAPE-01', 'ET-LIN-PROF-01', 'ET-LIN-CLIP-01'].map(r => ({ ElementTypeRef: r, Family: 'ET-LIN-COMPONENTS' })),
      ...['ET-LIN-PROF-02', 'ET-LIN-CAP-02', 'ET-LIN-DIFF-02'].map(r => ({ ElementTypeRef: r, Family: 'ET-PROFILES' })),
    ]
    const familyRows = new Set(['ET-LIN-COMPONENTS', 'ET-PROFILES'])
    expect([...familiesForJob({ slot: 'CLIPS' }, { elementTypes, familyRows })]).toEqual(['ET-LIN-CLIP'])
    expect([...familiesForJob({ slot: 'END_CAPS' }, { elementTypes, familyRows })].sort()).toEqual(['ET-LIN-PROF', 'ET-PROFILES'])
  })
})

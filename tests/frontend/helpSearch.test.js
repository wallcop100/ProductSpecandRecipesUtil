import { describe, it, expect } from 'vitest'
import { find, refsIn } from '../../src/help/search'
import { ACTIONS } from '../../src/help/actions'

const state = {
  elementTypes: [{ ElementTypeRef: 'ET-PS-MINI-TINI' }, { ElementTypeRef: 'ET-PS-01' }, { ElementTypeRef: 'ET-PS-02' }, { ElementTypeRef: 'ET-PS-03' },
    { ElementTypeRef: 'ET-LIN-CAP-01', Name: 'LEDFlex - FPS1709ECG' }],
  psRows: [{ ElementTypeRef: 'ET-LIN-CAP-01', Manufacturer: 'LEDFlex', ProductCode: 'FPS1709ECG' }],
  positionTypes: [{ PositionTypeRef: 'C01r', Description: 'Linear LED in profile' }, { PositionTypeRef: 'A07w', Description: 'Trimless adjustable downlight' }],
  psChanges: [{ elementTypeRef: 'x' }], rsChanges: [], dbChanges: [],
}
const top = (q, n = 1, s = state) => find(q, { actions: ACTIONS, state: s }).slice(0, n).map(r => (r.kind === 'action' ? r.action.id : `${r.kind}:${r.ref}`))

describe('Find', () => {
  it('the user’s own words: amend an ElementType rather than make a new one', () => {
    expect(top('I want to amend an ElementType rather than make a new one')).toEqual(['et.rename'])
    expect(top('add the -01 onto ET-PS-MINI-TINI')).toEqual(['et.rename'])
    const [r] = find('rename ET-PS-MINI-TINI', { actions: ACTIONS, state })
    expect(r).toMatchObject({ kind: 'action', ref: 'ET-PS-MINI-TINI', title: 'Rename ET-PS-MINI-TINI' })
  })
  it('everyday phrasings land on the right action', () => {
    expect(top('change family')).toEqual(['et.family'])
    expect(top('swap everywhere')).toEqual(['et.swap'])
    expect(top('did my patch work')).toEqual(['exp.check'])
    expect(top('export')).toEqual(['exp.export'])
    expect(top('unused elementtypes')).toEqual(['et.retire'])
    expect(top('product code')).toEqual(['spec.code'])
    expect(top('report a bug')).toEqual(['help.bug'])
    expect(top('undo')).toEqual(['exp.undo'])
    expect(top('ignore C01r')).toEqual(['pos.ignore'])
    expect(top('import the form')).toEqual(['imp.form'])
    expect(top('fork position')).toEqual(['pos.fork'])
    expect(top('renmae')).toEqual(['et.rename'])                    // one typo off
  })
  it('a ref alone offers what can be done with it; a code finds its ElementType', () => {
    expect(top('ET-PS-MINI-TINI', 3)).toEqual(expect.arrayContaining(['et:ET-PS-MINI-TINI']))
    expect(top('FPS1709ECG', 1)).toEqual(['et:ET-LIN-CAP-01'])
    expect(top('C01r', 3)).toEqual(expect.arrayContaining(['pos.open']))
    expect(refsIn('rename et-ps-mini-tini please', state)).toMatchObject({ et: 'ET-PS-MINI-TINI' })
  })
  it('an action that cannot apply is not offered', () => {
    expect(top('export', 3, { ...state, psChanges: [] })).not.toContain('exp.export')
  })
  it('every action is findable by its own title and has words and a how', () => {
    for (const a of ACTIONS) {
      expect(a.words.length, a.id).toBeGreaterThan(0)
      expect(String(a.how || '').length, a.id).toBeGreaterThan(0)
    }
    const ids = ACTIONS.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ACTIONS.length).toBeGreaterThan(90)
  })
  it('finds the workspace’s things: refs, codes (with or without punctuation), makers, Form refs, families, Form codes', () => {
    const ws = {
      elementTypes: [{ ElementTypeRef: 'ET-3Pin-Mains-SR', Family: 'ET-CONNECTORS', Name: 'WAGO - 770-503' }, { ElementTypeRef: 'ET-LIN-CAP-07', Family: 'ET-LIN-CAPS' },
        { ElementTypeRef: 'ET-PS-04', Family: 'ET-PS' }],
      psRows: [{ ElementTypeRef: 'ET-3Pin-Mains-SR', Manufacturer: 'WAGO', ProductCode: '770-503' }, { ElementTypeRef: 'ET-LIN-CAP-07', Manufacturer: 'LEDFlex', ProductCode: 'FPS1709ECG' },
        { ElementTypeRef: 'ET-PS-04', Manufacturer: 'Orluna', ProductCode: 'ZH-INFD-27-D-W-NA-AWB-54' }],
      positionTypes: [{ PositionTypeRef: 'C10r', ExtRef: 'C10', Description: 'Linear LED in Opal 1709 profile' }, { PositionTypeRef: 'A02w' }],
      formCaptures: { byPosition: { A07w: [{ code: 'NL-INFDT-27-X-M', manufacturer: 'Orluna' }] } },
      psChanges: [], rsChanges: [], dbChanges: [],
    }
    const first = q => { const [r] = find(q, { actions: ACTIONS, state: ws }); return `${r.kind}:${r.ref}` }
    expect(first('770-503')).toBe('et:ET-3Pin-Mains-SR')
    expect(first('770503')).toBe('et:ET-3Pin-Mains-SR')
    expect(first('FPS1709')).toBe('et:ET-LIN-CAP-07')
    expect(first('LIN-CAP')).toBe('et:ET-LIN-CAP-07')
    expect(first('C10')).toBe('position:C10r')
    expect(first('ET-LIN-CAPS')).toBe('family:ET-LIN-CAPS')
    expect(first('NL-INFDT')).toBe('formcode:A07w')
    expect(find('Orluna', { actions: ACTIONS, state: ws }).some(r => r.kind === 'et' && r.ref === 'ET-PS-04')).toBe(true)
    expect(find('ZH-INFD-27-D-W', { actions: ACTIONS, state: ws })[0].sub).toMatch(/Orluna ZH-INFD-27-D-W-NA-AWB-54 · in ET-PS/)
  })
  it('an ET-… the workspace does not have binds no action; several words find a ref holding them all', () => {
    expect(find('ET-NOPE-01', { actions: ACTIONS, state }).some(r => r.kind === 'action' && r.ref === 'ET-NOPE-01')).toBe(false)
    const ws = { ...state, elementTypes: [...state.elementTypes, { ElementTypeRef: 'ET-2Pin-DALI-Plug' }] }
    expect(find('dali plug', { actions: ACTIONS, state: ws }).slice(0, 3).map(r => r.ref)).toContain('ET-2Pin-DALI-Plug')
  })
})

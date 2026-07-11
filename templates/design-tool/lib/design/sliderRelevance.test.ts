import { describe, it, expect } from 'vitest'
import { relevantProperties, type StyleFacts } from './sliderRelevance'

const base: StyleFacts = {
  hasText: false, hasChildren: false, bgAlpha: 0, borderWidth: 0,
  borderAlpha: 0, hasShadow: false, clipsOverflow: false,
}

describe('relevantProperties (V13 – bara synligt-ändrande reglage)', () => {
  it('osynlig grupperings-container (barn, ingen yta, ingen egen text) → bara padding + opacitet', () => {
    const s = relevantProperties({ ...base, hasChildren: true })
    expect(Array.from(s).sort()).toEqual(['opacity', 'padding'])
  })

  it('helt tomt & osynligt element → inget relevant alls (visa ärlig förklaring)', () => {
    const s = relevantProperties({ ...base })
    expect(s.size).toBe(0)
  })

  it('synligt kort (bakgrund + ram + text + barn) → visar hela uppsättningen', () => {
    const s = relevantProperties({
      ...base, hasText: true, hasChildren: true, bgAlpha: 1, borderWidth: 1, borderAlpha: 1,
    })
    expect(s).toEqual(new Set([
      'color', 'fontSize', 'backgroundColor', 'borderColor',
      'borderWidth', 'borderRadius', 'padding', 'opacity',
    ]))
  })

  it('ren text-etikett (text, transparent, ingen ram) → text/bakgrund/rambredd/padding/opacitet, INTE ramfärg/hörnradie', () => {
    const s = relevantProperties({ ...base, hasText: true })
    expect(s.has('color')).toBe(true)
    expect(s.has('fontSize')).toBe(true)
    expect(s.has('backgroundColor')).toBe(true) // kan tinta bakom texten
    expect(s.has('padding')).toBe(true)
    expect(s.has('opacity')).toBe(true)
    expect(s.has('borderColor')).toBe(false)   // ingen synlig ram att färga
    expect(s.has('borderRadius')).toBe(false)  // inget syns i hörnen
  })

  it('bakgrund utan text/ram → bakgrund + rambredd + hörnradie + padding + opacitet, men inte textfärg', () => {
    const s = relevantProperties({ ...base, bgAlpha: 1 })
    expect(s.has('backgroundColor')).toBe(true)
    expect(s.has('borderWidth')).toBe(true)   // yta finns att rama in
    expect(s.has('borderRadius')).toBe(true)  // radie syns mot bakgrunden
    expect(s.has('padding')).toBe(true)
    expect(s.has('opacity')).toBe(true)
    expect(s.has('color')).toBe(false)
    expect(s.has('fontSize')).toBe(false)
    expect(s.has('borderColor')).toBe(false)  // ram-bredd = 0 → ingen synlig ram ännu
  })

  it('genomskinlig bakgrund (alpha under tröskel) räknas inte som synlig yta', () => {
    const s = relevantProperties({ ...base, hasChildren: true, bgAlpha: 0.005 })
    expect(s.has('backgroundColor')).toBe(false)
    expect(s.has('borderRadius')).toBe(false)
    expect(Array.from(s).sort()).toEqual(['opacity', 'padding'])
  })

  it('ram med genomskinlig färg räknas inte som synlig ram', () => {
    const s = relevantProperties({ ...base, borderWidth: 2, borderAlpha: 0 })
    expect(s.has('borderColor')).toBe(false)
    expect(s.has('borderRadius')).toBe(false)
  })

  it('overflow-klipp gör hörnradie relevant även utan yta', () => {
    const s = relevantProperties({ ...base, hasChildren: true, clipsOverflow: true })
    expect(s.has('borderRadius')).toBe(true)
  })

  it('box-shadow räknas som synlig yta (radie + rambredd blir relevanta)', () => {
    const s = relevantProperties({ ...base, hasChildren: true, hasShadow: true })
    expect(s.has('borderRadius')).toBe(true)
    expect(s.has('borderWidth')).toBe(true)
  })
})

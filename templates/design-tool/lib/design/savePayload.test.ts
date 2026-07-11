// Enhetstester: osparat-detektering + utökad Spara layout-payload (B6).
import { describe, expect, it } from 'vitest'
import {
  buildLayoutPayload, layoutSignature, nestedDirty, suggestLayoutName,
  type NestedSave, type SigArea, type SigNest, type SigTop,
} from './savePayload'

type MutSnap = { areas: SigArea[]; nest: SigNest[]; tops: SigTop[] }
const baseSnap = (): MutSnap => ({
  areas: [
    { key: '0', colStart: 1, span: 6, row: 1 },
    { key: '1', colStart: 7, span: 6, row: 1, hidden: false },
  ],
  nest: [
    { id: 'n1', colStart: 1, span: 4, row: 1, hpx: 320 },
    { id: 'n2', colStart: 5, span: 8, row: 1, hpx: 200.03 },
  ],
  tops: [{ key: '0', hpx: 500 }],
})

describe('layoutSignature (B6, osparat-detektering)', () => {
  it('samma modell → samma signatur (undo tillbaka = inte osparat)', () => {
    expect(layoutSignature(baseSnap())).toBe(layoutSignature(baseSnap()))
  })
  it('flyttad topp-area ändrar signaturen', () => {
    const s = baseSnap()
    s.areas[0].colStart = 3
    expect(layoutSignature(s)).not.toBe(layoutSignature(baseSnap()))
  })
  it('nästlad flytt (rad = även DOM-omordning) ändrar signaturen', () => {
    const s = baseSnap()
    s.nest[1].row = 2
    expect(layoutSignature(s)).not.toBe(layoutSignature(baseSnap()))
  })
  it('dragen topp-höjd ändrar signaturen', () => {
    const s = baseSnap()
    s.tops[0].hpx = 620
    expect(layoutSignature(s)).not.toBe(layoutSignature(baseSnap()))
  })
  it('dolt block ändrar signaturen', () => {
    const s = baseSnap()
    s.areas[1].hidden = true
    expect(layoutSignature(s)).not.toBe(layoutSignature(baseSnap()))
  })
  it('flyt-brus under avrundningen flaggar INTE osparat', () => {
    const s = baseSnap()
    s.nest[1].hpx = 200.01
    expect(layoutSignature(s)).toBe(layoutSignature(baseSnap()))
  })
  it('ordningen normaliseras (sortering, inte arrayordning)', () => {
    const s = baseSnap()
    s.nest.reverse()
    expect(layoutSignature(s)).toBe(layoutSignature(baseSnap()))
  })
})

const nest = (over: Partial<NestedSave> = {}): NestedSave => ({
  id: 'n1', label: 'Karta', top: 'Kartvy', mech: 'grid', cols: 12,
  colStart: 1, span: 8, row: 1, hpx: 571,
  orig: { colStart: 1, span: 8, row: 1, hpx: 571 },
  ...over,
})

describe('buildLayoutPayload (B6, utökad sparning)', () => {
  const inp = {
    page: '/dashboard?demo=1',
    theme: 'standard',
    viewport: { w: 1600, h: 1000, dpr: 2 },
    cols: 12,
    gapVar: '--gap',
    areas: [
      { key: '0', label: 'Kartvy', colStart: 1, span: 8, row: 1 },
      { key: '1', label: 'Riskprofil', colStart: 9, span: 4, row: 1, hidden: true },
    ],
    nested: [nest(), nest({ id: 'n2', label: 'Foto', colStart: 5, orig: { colStart: 1, span: 8, row: 1, hpx: 571 } })],
    tops: [
      { key: '0', label: 'Kartvy', hpx: 500, origPx: 500 },
      { key: '1', label: 'Riskprofil', hpx: 632.4, origPx: 480 },
    ],
  }

  it('oförändrade nästlade/tops utelämnas – bara avvikelser sparas', () => {
    const p = buildLayoutPayload(inp)
    expect(p.layout.nested).toHaveLength(1)
    expect(p.layout.nested?.[0].id).toBe('n2')
    expect(p.layout.tops).toHaveLength(1)
    expect(p.layout.tops?.[0]).toMatchObject({ key: '1', hpx: 632, origPx: 480 })
  })
  it('helt ren modell → nested/tops undefined (bakåtkompatibel not)', () => {
    const p = buildLayoutPayload({ ...inp, nested: [nest()], tops: [{ key: '0', label: 'K', hpx: 500, origPx: 500 }] })
    expect(p.layout.nested).toBeUndefined()
    expect(p.layout.tops).toBeUndefined()
    expect(p.kind).toBe('layout')
  })
  it('areor följer med som förut och kommentaren nämner nästlade ändringar', () => {
    const p = buildLayoutPayload(inp)
    expect(p.layout.areas).toHaveLength(2)
    expect(p.layout.areas[0]).toMatchObject({ key: '0', colStart: 1, span: 8 })
    expect(p.comment).toContain('Layout-förslag (12-kol)')
    expect(p.comment).toContain('1 nästlad region ändrad')
    expect(p.comment).toContain('Foto (Kartvy)')
    expect(p.comment).toContain('höjder: Riskprofil 632px')
    // Dolda areor räknas inte upp i kolumn-listan.
    expect(p.comment).not.toContain('Riskprofil kol')
  })
  it('nestedDirty: höjd-avvikelse > 0.5px räknas, brus gör det inte', () => {
    expect(nestedDirty(nest({ hpx: 571.4 }))).toBe(false)
    expect(nestedDirty(nest({ hpx: 573 }))).toBe(true)
    expect(nestedDirty(nest({ row: 2 }))).toBe(true)
  })

  it('V15: css-tema-tweaks följer med i payloaden + kommentaren', () => {
    const p = buildLayoutPayload({ ...inp, cssTweaks: [{ name: '--c-slate-900', kind: 'color', from: '15 23 42', to: '30 41 59' }] })
    expect(p.cssTweaks).toHaveLength(1)
    expect(p.cssTweaks?.[0]).toMatchObject({ name: '--c-slate-900', to: '30 41 59' })
    expect(p.comment).toContain('CSS-tema (1 token)')
    expect(p.comment).toContain('--c-slate-900 15 23 42 → 30 41 59')
  })
  it('V15: css-only-sparning (inga strukturella deltan) hoppar layout-raden', () => {
    const clean = { ...inp, areas: [{ key: '0', label: 'Kartvy', colStart: 1, span: 8, row: 1 }], nested: [nest()], tops: [{ key: '0', label: 'K', hpx: 500, origPx: 500 }], cssTweaks: [{ name: '--radius-lg', kind: 'radius', from: '12px', to: '20px' }] }
    const p = buildLayoutPayload(clean)
    expect(p.comment).not.toContain('Layout-förslag')
    expect(p.comment).toContain('CSS-tema')
    expect(p.cssTweaks).toHaveLength(1)
  })
  it('utan css-tweaks utelämnas fältet (bakåtkompatibelt)', () => {
    expect(buildLayoutPayload(inp).cssTweaks).toBeUndefined()
  })

  it('R7: element-scopade css-ändringar följer med i payloaden + kommentaren', () => {
    const p = buildLayoutPayload({
      ...inp,
      cssScoped: [{
        prop: 'background-color', label: 'Bakgrundsfärg', from: 'rgb(255,255,255)', to: '#f0f9ff', count: 2,
        targets: [{ design_id: 'nasviken-card', label: 'div.card' }, { label: 'section' }],
      }],
    })
    expect(p.cssScoped).toHaveLength(1)
    expect(p.cssScoped?.[0]).toMatchObject({ prop: 'background-color', to: '#f0f9ff', count: 2 })
    expect(p.cssScoped?.[0].targets[0]).toMatchObject({ design_id: 'nasviken-card' })
    expect(p.comment).toContain('CSS i ruta (1 egenskap, element-scopat)')
    expect(p.comment).toContain('Bakgrundsfärg rgb(255,255,255) → #f0f9ff (2 el.)')
  })
  it('R7: scoped-only-sparning (inga strukturella deltan) hoppar layout-raden', () => {
    const clean = { ...inp, areas: [{ key: '0', label: 'Kartvy', colStart: 1, span: 8, row: 1 }], nested: [nest()], tops: [{ key: '0', label: 'K', hpx: 500, origPx: 500 }], cssScoped: [{ prop: 'color', label: 'Textfärg', from: 'rgb(15,23,42)', to: '#334155', count: 1, targets: [{ label: 'h2' }] }] }
    const p = buildLayoutPayload(clean)
    expect(p.comment).not.toContain('Layout-förslag')
    expect(p.comment).toContain('CSS i ruta')
    expect(p.cssScoped).toHaveLength(1)
  })
  it('utan scoped-ändringar utelämnas fältet (bakåtkompatibelt)', () => {
    expect(buildLayoutPayload(inp).cssScoped).toBeUndefined()
  })
})

describe('R11: namn på designförslaget (title)', () => {
  const inp = {
    page: '/dashboard?demo=1',
    theme: 'standard',
    viewport: { w: 1600, h: 1000, dpr: 2 },
    cols: 12,
    gapVar: '--gap',
    areas: [
      { key: '0', label: 'Kartvy', colStart: 1, span: 8, row: 1 },
      { key: '1', label: 'Riskprofil', colStart: 9, span: 4, row: 1, hidden: true },
    ],
    nested: [nest(), nest({ id: 'n2', label: 'Foto', colStart: 5, orig: { colStart: 1, span: 8, row: 1, hpx: 571 } })],
    tops: [
      { key: '0', label: 'Kartvy', hpx: 500, origPx: 500 },
      { key: '1', label: 'Riskprofil', hpx: 632.4, origPx: 480 },
    ],
  }

  it('titel följer med i payloaden (trimmad)', () => {
    const p = buildLayoutPayload({ ...inp, title: '  Bredare riskkort  ' })
    expect(p.title).toBe('Bredare riskkort')
  })
  it('tom/blank titel → undefined (schemalöst bakåtkompatibelt)', () => {
    expect(buildLayoutPayload({ ...inp, title: '   ' }).title).toBeUndefined()
    expect(buildLayoutPayload(inp).title).toBeUndefined()
  })

  it('suggestLayoutName: en nästlad flytt → "Flyttad <label>"', () => {
    expect(suggestLayoutName(inp)).toBe('Flyttad Foto, höjd på Riskprofil, dolde Riskprofil')
  })
  it('suggestLayoutName: helt ren modell → generiskt fallback', () => {
    const clean = { ...inp, areas: [{ key: '0', label: 'Kartvy', colStart: 1, span: 8, row: 1 }], nested: [nest()], tops: [{ key: '0', label: 'K', hpx: 500, origPx: 500 }] }
    expect(suggestLayoutName(clean)).toBe('Layout-förslag')
  })
  it('suggestLayoutName: flera dolda block räknas ihop', () => {
    const many = {
      ...inp,
      areas: [
        { key: '0', label: 'A', colStart: 1, span: 4, row: 1, hidden: true },
        { key: '1', label: 'B', colStart: 5, span: 4, row: 1, hidden: true },
      ],
      nested: [nest()],
      tops: [{ key: '0', label: 'K', hpx: 500, origPx: 500 }],
    }
    expect(suggestLayoutName(many)).toBe('Dolde 2 block')
  })
})

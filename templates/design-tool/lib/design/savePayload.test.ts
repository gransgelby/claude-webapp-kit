// Enhetstester: osparat-detektering + utökad Spara layout-payload (B6).
import { describe, expect, it } from 'vitest'
import {
  buildLayoutPayload, layoutSignature, nestedDirty,
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
    page: '/example',
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
})

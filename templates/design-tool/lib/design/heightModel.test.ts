// Enhetstester för heightModel (Design mode v2 · A2 – skalenliga höjder + snap).
import { describe, it, expect } from 'vitest'
import {
  probeIsFixed, wfScale, snapHeight, clampDragH, stackRows, heightsEqual,
  MIN_DRAG_HPX, type HeightProbe, type StackChild,
} from './heightModel'

const probe = (over: Partial<HeightProbe> = {}): HeightProbe => ({
  inlineHeight: '', cssAspectRatio: 'auto', measuredH: 200, autoH: 200, ...over,
})

describe('probeIsFixed (auto vs fast höjd)', () => {
  it('inline-höjd ⇒ fast', () => {
    expect(probeIsFixed(probe({ inlineHeight: '420px' }))).toBe(true)
  })
  it('inline "auto" räknas INTE som fast', () => {
    expect(probeIsFixed(probe({ inlineHeight: 'auto' }))).toBe(false)
  })
  it('aspect-ratio ⇒ fast', () => {
    expect(probeIsFixed(probe({ cssAspectRatio: '16 / 9' }))).toBe(true)
  })
  it('innehållsprov skiljer sig (CSS-regel sätter höjden) ⇒ fast', () => {
    expect(probeIsFixed(probe({ measuredH: 420, autoH: 180 }))).toBe(true)
  })
  it('renderad = innehållshöjd ⇒ auto', () => {
    expect(probeIsFixed(probe())).toBe(false)
  })
  it('sub-pixel-brus inom tolerans ⇒ fortfarande auto', () => {
    expect(probeIsFixed(probe({ measuredH: 200, autoH: 201.5 }))).toBe(false)
  })
})

describe('wfScale', () => {
  it('wf-px per verklig px', () => {
    expect(wfScale(1200, 480)).toBeCloseTo(0.4)
  })
  it('ogiltiga bredder ⇒ 1 (ingen skalning)', () => {
    expect(wfScale(0, 480)).toBe(1)
    expect(wfScale(1200, 0)).toBe(1)
  })
})

describe('clampDragH', () => {
  it('klampar mot minsta drag-höjd', () => {
    expect(clampDragH(3)).toBe(MIN_DRAG_HPX)
    expect(clampDragH(300)).toBe(300)
  })
})

describe('snapHeight (granne-snap)', () => {
  const cands = [
    { id: 'a', label: 'Avstånd', bottom: 500 },
    { id: 'b', label: 'Vattenkontakt', bottom: 620 },
  ]
  it('snappar mot en granne-underkant inom tolerans', () => {
    // selfTop 100, föreslagen 395 ⇒ kant 495, 5px från grannen a:s 500.
    const r = snapHeight(100, 395, cands, 10)
    expect(r.h).toBe(400)
    expect(r.snapped?.id).toBe('a')
  })
  it('utanför tolerans ⇒ ingen snap', () => {
    const r = snapHeight(100, 370, cands, 10)
    expect(r.h).toBe(370)
    expect(r.snapped).toBeNull()
  })
  it('närmaste kandidaten vinner vid flera träffar', () => {
    // kant = 100 + 505 = 605 ⇒ 15 från b (620), 105 från a. Stor tolerans.
    const r = snapHeight(100, 505, cands, 200)
    expect(r.snapped?.id).toBe('b')
    expect(r.h).toBe(520)
  })
  it('inga kandidater ⇒ oförändrad höjd', () => {
    const r = snapHeight(100, 395, [], 10)
    expect(r.h).toBe(395)
    expect(r.snapped).toBeNull()
  })
})

describe('stackRows (radpackning med verklig geometri)', () => {
  const k = 0.5
  // Förälder med rubrik (~60px) → rad 1 (två kort à 300px) → 24px gap → rad 2 (200px).
  const kids: StackChild[] = [
    { id: 'x', row: 1, relY: 60, origH: 300, hWf: 300 * k },
    { id: 'y', row: 1, relY: 60, origH: 300, hWf: 300 * k },
    { id: 'z', row: 2, relY: 384, origH: 200, hWf: 200 * k },
  ]
  it('init: exakt nedskalad verklig layout (lead + rad-toppar)', () => {
    const st = stackRows(kids, k)
    expect(st.lead).toBeCloseTo(30)           // 60 · 0.5
    expect(st.rowTop.get(1)).toBeCloseTo(30)
    expect(st.rowTop.get(2)).toBeCloseTo(192) // 384 · 0.5
    expect(st.rowH.get(1)).toBeCloseTo(150)
    expect(st.bottom).toBeCloseTo(292)        // 192 + 100
  })
  it('växer ett barn knuffas raderna under (reflow i wireframen)', () => {
    const grown = kids.map((c) => (c.id === 'x' ? { ...c, hWf: c.hWf + 40 } : c))
    const st = stackRows(grown, k)
    expect(st.rowH.get(1)).toBeCloseTo(190)
    expect(st.rowTop.get(2)).toBeCloseTo(232) // 30 + 190 + 12 (gap 24·k)
    expect(st.bottom).toBeCloseTo(332)
  })
  it('negativt init-gap (överlappande rader) klampas till 0', () => {
    const tight: StackChild[] = [
      { id: 'a', row: 1, relY: 0, origH: 100, hWf: 50 },
      { id: 'b', row: 2, relY: 90, origH: 100, hWf: 50 }, // startar INNAN rad 1 slutar
    ]
    const st = stackRows(tight, 0.5)
    expect(st.rowTop.get(2)).toBeCloseTo(50) // 0 + 50 + max(0, -10)·k
  })
  it('tom lista ⇒ nollor', () => {
    const st = stackRows([], k)
    expect(st.lead).toBe(0)
    expect(st.bottom).toBe(0)
  })
})

describe('heightsEqual', () => {
  it('lika inom tolerans', () => {
    expect(heightsEqual({ a: 100, b: 50 }, { a: 100.6, b: 50 })).toBe(true)
  })
  it('skillnad över tolerans ⇒ olika', () => {
    expect(heightsEqual({ a: 100 }, { a: 103 })).toBe(false)
  })
  it('olika nyckeluppsättningar ⇒ olika', () => {
    expect(heightsEqual({ a: 100 }, { a: 100, b: 1 })).toBe(false)
    expect(heightsEqual({ a: 100 }, { b: 100 })).toBe(false)
  })
})

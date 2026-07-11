import { describe, it, expect } from 'vitest'
import {
  toNatural, buildProjection, projToCanvas, projToChildCanvas, projectionEqual, stickyNaturalBox,
  type RawBox,
} from './projection'

describe('toNatural', () => {
  it('normaliserar bort pageScale + container-origo (kolumn 1 = x 0)', () => {
    // container vänster=100, topp=50, padLeft=16, pageScale=0.5.
    const box: RawBox = { id: 'a', left: 100 + 16 * 0.5, top: 50, width: 200, height: 80 }
    const r = toNatural(box, 100, 50, 0.5, 16)
    expect(r.x).toBeCloseTo(0, 6)      // exakt vid kolumn 1:s vänsterkant
    expect(r.y).toBeCloseTo(0, 6)
    expect(r.w).toBeCloseTo(400, 6)    // 200 / 0.5
    expect(r.h).toBeCloseTo(160, 6)
  })

  it('pageScale = 1 ger råa layout-px minus origo/padding', () => {
    const box: RawBox = { id: 'a', left: 216, top: 130, width: 300, height: 40 }
    const r = toNatural(box, 100, 50, 1, 16)
    expect(r.x).toBeCloseTo(100, 6)    // 216 - 100 - 16
    expect(r.y).toBeCloseTo(80, 6)     // 130 - 50
  })

  it('faller tillbaka till skala 1 vid degenererad pageScale', () => {
    const box: RawBox = { id: 'a', left: 100, top: 50, width: 10, height: 10 }
    expect(() => toNatural(box, 100, 50, 0, 0)).not.toThrow()
    const r = toNatural(box, 100, 50, 0, 0)
    expect(r.w).toBe(10)
  })
})

describe('buildProjection', () => {
  const C = { left: 0, top: 0, ps: 1, pad: 0 }
  it('flyttar nollpunkten så översta lådan (även band ovanför gridet) hamnar vid y=0', () => {
    const boxes: RawBox[] = [
      { id: 'band', left: 0, top: -30, width: 400, height: 30 }, // ovanför gridet (neg. y)
      { id: 'a', left: 0, top: 40, width: 200, height: 100 },
      { id: 'b', left: 210, top: 40, width: 190, height: 100 },
    ]
    const p = buildProjection(boxes, C.left, C.top, C.ps, C.pad)
    expect(p.band.y).toBeCloseTo(0, 6)     // översta = 0
    expect(p.a.y).toBeCloseTo(70, 6)       // 40 - (-30)
    expect(p.b.y).toBeCloseTo(70, 6)
    // Två lådor på samma verkliga rad delar EXAKT samma projicerade y (ingen drift).
    expect(p.a.y).toBe(p.b.y)
  })

  it('hoppar över lådor utan yta', () => {
    const boxes: RawBox[] = [
      { id: 'a', left: 0, top: 0, width: 100, height: 50 },
      { id: 'zero', left: 0, top: 0, width: 0, height: 0 },
    ]
    const p = buildProjection(boxes, 0, 0, 1, 0)
    expect(p.a).toBeDefined()
    expect(p.zero).toBeUndefined()
  })

  it('tom in → tom ut', () => {
    expect(buildProjection([], 0, 0, 1, 0)).toEqual({})
  })
})

describe('projToCanvas – projektions-invarianten (V17)', () => {
  it('canvasY / k === lådans dokument-Y (samma kant i båda panelerna)', () => {
    const k = 0.6
    const p = { x: 120, y: 340, w: 200, h: 90 }
    const c = projToCanvas(p, k)
    // Inversen ger tillbaka dokument-koordinaten → panelerna speglar exakt.
    expect(c.y / k).toBeCloseTo(p.y, 6)
    expect(c.x / k).toBeCloseTo(p.x, 6)
    expect(c.w).toBeCloseTo(p.w * k, 6)
    expect(c.h).toBeCloseTo(p.h * k, 6)
  })

  it('klampar minsta bredd/höjd så etikettremsan ryms', () => {
    const c = projToCanvas({ x: 0, y: 0, w: 1, h: 1 }, 0.5, 6, 12)
    expect(c.w).toBe(6)
    expect(c.h).toBe(12)
  })
})

// W1/W2 (v2.4): den bärande spegel-invarianten. Wireframen ritar varje låda som
// naturalPx × k (× wf-zoom), medan riktiga lådan syns i naturalPx × pageScale.
// Spegeln är EXAKT – oberoende av hur långt ner/åt sidan lådan sitter – ENBART när
// k = pageScale (= fit vid zoom 1). En k ≠ pageScale ger drift som VÄXER med avståndet
// från origo (luft upptill, onåbar botten, sidleds-drift). Detta test låser fast det.
describe('spegel-skala: k måste vara = pageScale (W1/W2)', () => {
  const ps = 0.48                       // riktiga sidans skala (fit × zoom)
  const cLeft = 200, cTop = 100, pad = 0
  // Två riktiga lådor: en nära toppen, en LÅNGT ner (där drift annars slår hårdast).
  const near: RawBox = { id: 'near', left: cLeft, top: cTop + 20 * ps, width: 300, height: 150 }
  const far: RawBox = { id: 'far', left: cLeft, top: cTop + 4000 * ps, width: 300, height: 220 }
  const proj = buildProjection([near, far], cLeft, cTop, ps, pad)

  it('k = pageScale → wf-lådans storlek == riktiga lådans skärmstorlek för BÅDA (ingen drift)', () => {
    const k = ps
    for (const b of [near, far]) {
      const c = projToCanvas(proj[b.id], k)
      expect(c.w).toBeCloseTo(b.width, 6)   // reproducerar exakt riktiga bredden
      expect(c.h).toBeCloseTo(b.height, 6)  // …och höjden, lika bra långt ner som nära toppen
    }
  })

  it('k = pageScale → vertikalt avstånd mellan lådorna speglas exakt (samma kant i båda panelerna)', () => {
    const k = ps
    const cNear = projToCanvas(proj.near, k)
    const cFar = projToCanvas(proj.far, k)
    // Avståndet i wf-canvas (÷k) == avståndet i riktiga skärm-px (÷ps) → ingen ackumulerad drift.
    expect((cFar.y - cNear.y) / k).toBeCloseTo((far.top - near.top) / ps, 6)
  })

  it('k ≠ pageScale → vertikal drift som VÄXER med avståndet (visar varför k=pageScale krävs)', () => {
    const realGap = far.top - near.top                    // riktiga skärm-avståndet (px)
    const docGap = proj.far.y - proj.near.y               // wireframens gap i doc-px
    // Rätt k = ps: wf-gapet på skärmen == riktiga gapet (exakt spegel).
    expect(docGap * ps).toBeCloseTo(realGap, 6)
    // Fel k: driften = docGap × |k − ps| och är alltså PROPORTIONELL mot avståndet.
    const driftAt = (k: number, gap: number) => Math.abs(gap * k - gap * ps)
    const kWrong = ps * 1.02
    expect(driftAt(kWrong, docGap)).toBeGreaterThan(0)
    // Dubbelt avstånd → dubbel drift (växer linjärt med avståndet från origo).
    expect(driftAt(kWrong, docGap * 2)).toBeCloseTo(driftAt(kWrong, docGap) * 2, 6)
  })
})

describe('projToChildCanvas', () => {
  it('placerar barn relativt förälderns projicerade origo', () => {
    const parent = { x: 100, y: 200, w: 400, h: 300 }
    const child = { x: 140, y: 230, w: 120, h: 80 }
    const k = 0.5
    const c = projToChildCanvas(child, parent, k)
    expect(c.x).toBeCloseTo(20, 6)   // (140-100)*0.5
    expect(c.y).toBeCloseTo(15, 6)   // (230-200)*0.5
    expect(c.w).toBeCloseTo(60, 6)
    expect(c.h).toBeCloseTo(40, 6)
  })
})

describe('stickyNaturalBox (R5 · sticky-band projiceras på naturlig dokument-position)', () => {
  it('toNatural(stickyNaturalBox(...)) återger natX/natY oberoende av skroll', () => {
    // Container-origo på skärmen: cLeft=100, cTop=50, pageScale=0.5, padLeft=16.
    // Elementets naturliga dokument-offset relativt container: natX=64, natY=120 (layout-px).
    const box = stickyNaturalBox('bar', 64, 120, 300, 40, 100, 50, 0.5)
    const nat = toNatural(box, 100, 50, 0.5, 16)
    expect(nat.x).toBeCloseTo(64 - 16, 6)  // natX minus padLeft (rel. kolumn 1)
    expect(nat.y).toBeCloseTo(120, 6)       // natY oförändrad – FÖLJER dokumentet, ej skärmen
    expect(nat.w).toBeCloseTo(600, 6)       // 300 / 0.5
    expect(nat.h).toBeCloseTo(80, 6)
  })

  it('en sticky topp-bar (natY negativ = ovanför container) blir projektionens topp (y=0)', () => {
    // Sticky bar sitter i flödet ovanför grid-containern → natY < 0 → minY-ankaret.
    const bar = stickyNaturalBox('bar', 0, -60, 400, 48, 0, 0, 1)
    const row: RawBox = { id: 'r0', left: 0, top: 0, width: 400, height: 100 }  // första grid-raden
    const proj = buildProjection([bar, row], 0, 0, 1, 0)
    expect(proj.bar.y).toBeCloseTo(0, 6)     // baren ankras överst
    expect(proj.r0.y).toBeCloseTo(60, 6)     // grid-raden hamnar under baren, inte överlappande
  })

  it('pageScale ignoreras säkert vid 0 (fallback 1)', () => {
    const box = stickyNaturalBox('x', 10, 20, 30, 40, 5, 5, 0)
    expect(box.left).toBe(5 + 10)  // ps→1
    expect(box.top).toBe(5 + 20)
  })
})

describe('projectionEqual', () => {
  const base = { a: { x: 0, y: 0, w: 10, h: 10 } }
  it('lika inom tolerans', () => {
    expect(projectionEqual(base, { a: { x: 0.2, y: 0, w: 10, h: 10 } }, 0.5)).toBe(true)
  })
  it('olika utanför tolerans', () => {
    expect(projectionEqual(base, { a: { x: 2, y: 0, w: 10, h: 10 } }, 0.5)).toBe(false)
  })
  it('olika nyckeluppsättning', () => {
    expect(projectionEqual(base, { a: base.a, b: base.a }, 0.5)).toBe(false)
  })
})

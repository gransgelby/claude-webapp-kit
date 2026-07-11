import { describe, it, expect } from 'vitest'
import {
  translateRect, resizeRect, applyGesture, snapRect, candidateEdges,
  rectsEqual, intentDirty, intentsSignature, type Rect, type Intent,
} from './intentModel'

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })

describe('translateRect / resizeRect / applyGesture', () => {
  it('flyttar hela rekten utan att ändra storlek', () => {
    expect(translateRect(R(10, 20, 100, 50), 5, -8)).toEqual(R(15, 12, 100, 50))
  })
  it('resizar från topp-vänster (ankaret står still)', () => {
    expect(resizeRect(R(10, 20, 100, 50), 30, 10)).toEqual(R(10, 20, 130, 60))
  })
  it('klampar mot min-mått', () => {
    const r = resizeRect(R(0, 0, 20, 20), -100, -100, 8, 10)
    expect(r.w).toBe(8)
    expect(r.h).toBe(10)
  })
  it('applyGesture väljer rätt kant per mode', () => {
    const base = R(0, 0, 100, 100)
    expect(applyGesture(base, 'move', 10, 10)).toEqual(R(10, 10, 100, 100))
    expect(applyGesture(base, 'resize-e', 10, 10)).toEqual(R(0, 0, 110, 100))
    expect(applyGesture(base, 'resize-s', 10, 10)).toEqual(R(0, 0, 100, 110))
    expect(applyGesture(base, 'resize-se', 10, 10)).toEqual(R(0, 0, 110, 110))
  })
})

describe('snapRect (flytt) – skiftar HELA rekten utan att röra grannar', () => {
  it('snappar högerkanten mot en grannes vänsterkant', () => {
    // grannens vänsterkant vid x=200; vår högerkant vid 198 (2px ifrån) → skiftas +2.
    const r = R(100, 0, 98, 50)
    const out = snapRect(r, [200], [], 6, 'move')
    expect(out.rect.x).toBeCloseTo(102, 6)      // hela rekten skiftad
    expect(out.rect.w).toBe(98)                 // storlek oförändrad
    expect(out.snapX).toBe(200)
  })
  it('snappar vänsterkanten (topp/botten via yEdges)', () => {
    const r = R(0, 100, 50, 40)
    const out = snapRect(r, [], [138], 6, 'move')  // botten 140 → 138 (2px)
    expect(out.rect.y).toBeCloseTo(98, 6)
    expect(out.snapY).toBe(138)
  })
  it('rör inte rekten när ingen kant är inom tolerans', () => {
    const r = R(0, 0, 50, 50)
    const out = snapRect(r, [200], [200], 5, 'move')
    expect(out.rect).toEqual(r)
    expect(out.snapX).toBeNull()
    expect(out.snapY).toBeNull()
  })
})

describe('snapRect (resize) – bara den dragna kanten är rörlig', () => {
  it('resize-e snappar bredden så högerkanten möter grannen', () => {
    const r = R(10, 0, 90, 50) // högerkant 100
    const out = snapRect(r, [104], [], 6, 'resize-e')
    expect(out.rect.x).toBe(10)                 // vänster står still
    expect(out.rect.w).toBeCloseTo(94, 6)       // 104 - 10
    expect(out.snapX).toBe(104)
  })
  it('resize-s snappar höjden mot en grannes underkant', () => {
    const r = R(0, 20, 50, 80) // underkant 100
    const out = snapRect(r, [], [103], 6, 'resize-s')
    expect(out.rect.h).toBeCloseTo(83, 6)       // 103 - 20
    expect(out.rect.y).toBe(20)                 // topp står still
    expect(out.snapY).toBe(103)
  })
})

describe('candidateEdges', () => {
  it('samlar alla ANDRA lådors kanter (ej den rörliga)', () => {
    const rects = { a: R(0, 0, 100, 50), b: R(120, 0, 80, 50), moving: R(10, 10, 30, 30) }
    const { xEdges, yEdges } = candidateEdges(rects, 'moving')
    expect(xEdges.sort((p, q) => p - q)).toEqual([0, 100, 120, 200])
    expect(yEdges.sort((p, q) => p - q)).toEqual([0, 50])
  })
})

describe('intentDirty / rectsEqual / intentsSignature', () => {
  it('en orörd intent (rect === base) är inte dirty', () => {
    const it: Intent = { rect: R(0, 0, 10, 10), base: R(0, 0, 10, 10) }
    expect(intentDirty(it)).toBe(false)
  })
  it('en flyttad intent är dirty', () => {
    const it: Intent = { rect: R(5, 0, 10, 10), base: R(0, 0, 10, 10) }
    expect(intentDirty(it)).toBe(true)
    expect(rectsEqual(it.rect, it.base)).toBe(false)
  })
  it('signaturen tar bara med dirty intents och är stabil mot ordning', () => {
    const map: Record<string, Intent> = {
      b: { rect: R(1, 2, 3, 4), base: R(0, 0, 3, 4) },
      a: { rect: R(0, 0, 5, 5), base: R(0, 0, 5, 5) }, // orörd → utelämnas
    }
    expect(intentsSignature(map)).toBe('b:1/2/3/4')
  })
})

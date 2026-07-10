import { describe, it, expect } from 'vitest'
import {
  alignAreas, distributeAreas, gapPxBetween, measureGaps, areaWidthPx,
  insertPlaceholder, isPlaceholderKey, colEnd,
} from './layoutTools'
import type { GridArea, GridGeom } from './gridModel'

const area = (p: Partial<GridArea>): GridArea => ({ key: 'k', label: 'L', colStart: 1, span: 3, row: 1, ...p })

describe('alignAreas (grid-agnostisk)', () => {
  const a = area({ key: 'a', colStart: 2, span: 3, row: 1 }) // 2–4
  const b = area({ key: 'b', colStart: 7, span: 2, row: 1 }) // 7–8
  const c = area({ key: 'c', colStart: 5, span: 4, row: 2 }) // 5–8

  it('vänsterjusterar valda till gruppens vänsterkant (span bevaras)', () => {
    const out = alignAreas([a, b, c], ['a', 'b'], 'left', 12)
    const byKey = Object.fromEntries(out.map((x) => [x.key, x]))
    expect(byKey.a.colStart).toBe(2)
    expect(byKey.b.colStart).toBe(2) // flyttad till 2
    expect(byKey.b.span).toBe(2)     // span oförändrad
    expect(byKey.c.colStart).toBe(5) // ej vald → orörd
  })
  it('högerjusterar valda till gruppens högerkant', () => {
    const out = alignAreas([a, b], ['a', 'b'], 'right', 12)
    const byKey = Object.fromEntries(out.map((x) => [x.key, x]))
    // gruppens högerkant = max(colEnd) = 8; a (span3) → colStart 6, b (span2) → 7
    expect(colEnd(byKey.a)).toBe(8)
    expect(colEnd(byKey.b)).toBe(8)
  })
  it('centrerar valda kring gruppens mittlinje', () => {
    const out = alignAreas([a, b], ['a', 'b'], 'center', 12)
    const byKey = Object.fromEntries(out.map((x) => [x.key, x]))
    // gruppen: left 2, right 8 → center 5; a(span3) center 5 → colStart 4; b(span2) → 4 el 5
    expect(byKey.a.colStart).toBe(4)
  })
  it('respekterar ett annat kolumnantal (klampar i 16-grid)', () => {
    const x = area({ key: 'x', colStart: 14, span: 4, row: 1 }) // spiller i 12 men ryms i 16
    const y = area({ key: 'y', colStart: 2, span: 4, row: 1 })
    const out = alignAreas([x, y], ['x', 'y'], 'right', 16)
    const byKey = Object.fromEntries(out.map((v) => [v.key, v]))
    expect(colEnd(byKey.x)).toBe(colEnd(byKey.y))
  })
  it('top/bottom/middle rör raden, inte kolumnen', () => {
    const p = area({ key: 'p', colStart: 1, span: 3, row: 1 })
    const q = area({ key: 'q', colStart: 5, span: 3, row: 5 })
    expect(alignAreas([p, q], ['p', 'q'], 'top', 12).every((v) => v.row === 1)).toBe(true)
    expect(alignAreas([p, q], ['p', 'q'], 'bottom', 12).every((v) => v.row === 5)).toBe(true)
    expect(alignAreas([p, q], ['p', 'q'], 'middle', 12).every((v) => v.row === 3)).toBe(true)
  })
  it('färre än 2 valda → oförändrat', () => {
    expect(alignAreas([a, b], ['a'], 'left', 12)).toEqual([a, b])
  })
})

describe('distributeAreas', () => {
  it('gaps: lika mellanrum, ytterkanter fasta', () => {
    // tre span-2-block i range 1..12: range 12, sumSpan 6, free 6, gap 3
    const a = area({ key: 'a', colStart: 1, span: 2, row: 1 })
    const b = area({ key: 'b', colStart: 4, span: 2, row: 1 })
    const c = area({ key: 'c', colStart: 11, span: 2, row: 1 })
    const out = distributeAreas([a, b, c], ['a', 'b', 'c'], 'gaps', 12)
    const byKey = Object.fromEntries(out.map((x) => [x.key, x.colStart]))
    expect(byKey.a).toBe(1)   // ytterkant fast
    expect(byKey.c).toBe(11)  // ytterkant fast (colEnd 12)
    expect(byKey.b).toBe(6)   // 1 + span2 + gap3 = 6
  })
  it('spans: lika span, tätt packat över gruppens ytterspann', () => {
    const a = area({ key: 'a', colStart: 1, span: 5, row: 1 })
    const b = area({ key: 'b', colStart: 6, span: 1, row: 1 })
    const c = area({ key: 'c', colStart: 10, span: 3, row: 1 }) // colEnd 12
    const out = distributeAreas([a, b, c], ['a', 'b', 'c'], 'spans', 12)
    const spans = out.map((x) => x.span)
    // range 1..12 = 12 kol / 3 = span 4 vardera, packade 1,5,9
    expect(spans).toEqual([4, 4, 4])
    const starts = out.map((x) => x.colStart)
    expect(starts).toEqual([1, 5, 9])
  })
  it('summan av spans fyller range även när den inte är jämnt delbar', () => {
    const a = area({ key: 'a', colStart: 1, span: 1, row: 1 })
    const b = area({ key: 'b', colStart: 3, span: 1, row: 1 })
    const c = area({ key: 'c', colStart: 7, span: 1, row: 1 }) // range 1..7 = 7
    const out = distributeAreas([a, b, c], ['a', 'b', 'c'], 'spans', 12)
    const total = out.reduce((t, x) => t + x.span, 0)
    expect(total).toBe(7) // 3+2+2
  })
  it('färre än 3 valda → oförändrat', () => {
    const a = area({ key: 'a', colStart: 1, span: 2 })
    const b = area({ key: 'b', colStart: 4, span: 2 })
    expect(distributeAreas([a, b], ['a', 'b'], 'gaps', 12)).toEqual([a, b])
  })
})

describe('gap-mätning (px + token)', () => {
  const geom: GridGeom = { cols: 12, trackW: 80, gap: 20, originX: 0 }
  it('kant-i-kant block → en gutter (20px)', () => {
    const a = area({ key: 'a', colStart: 1, span: 3, row: 1 }) // slut kol 3
    const b = area({ key: 'b', colStart: 4, span: 3, row: 1 }) // start kol 4
    const g = gapPxBetween(a, b, geom)!
    expect(g.emptyTracks).toBe(0)
    expect(g.px).toBe(20)
  })
  it('ett tomt spår mellan → trackW + 2 gutters', () => {
    const a = area({ key: 'a', colStart: 1, span: 3, row: 1 }) // slut 3
    const b = area({ key: 'b', colStart: 5, span: 3, row: 1 }) // start 5 (spår 4 tomt)
    const g = gapPxBetween(a, b, geom)!
    expect(g.emptyTracks).toBe(1)
    expect(g.px).toBe(80 + 2 * 20) // 120
  })
  it('närmaste spacing-token beräknas (24px → token 6 vid 16px rem)', () => {
    // token "6" = 6*0.25*16 = 24px
    const a = area({ key: 'a', colStart: 1, span: 1, row: 1 })
    const b = area({ key: 'b', colStart: 2, span: 1, row: 1 })
    const g = gapPxBetween(a, b, { trackW: 80, gap: 24 })!
    expect(g.token.name).toBe('6')
    expect(g.token.onToken).toBe(true)
  })
  it('olika rad eller överlapp → null', () => {
    const a = area({ key: 'a', colStart: 1, span: 3, row: 1 })
    const other = area({ key: 'b', colStart: 5, span: 3, row: 2 })
    const overlap = area({ key: 'c', colStart: 2, span: 3, row: 1 })
    expect(gapPxBetween(a, other, geom)).toBeNull()
    expect(gapPxBetween(a, overlap, geom)).toBeNull()
  })
  it('measureGaps mäter konsekutiva par per rad', () => {
    const a = area({ key: 'a', colStart: 1, span: 3, row: 1 })
    const b = area({ key: 'b', colStart: 4, span: 3, row: 1 })
    const c = area({ key: 'c', colStart: 8, span: 3, row: 1 })
    const d = area({ key: 'd', colStart: 1, span: 6, row: 2 })
    const gaps = measureGaps([a, b, c, d], geom)
    expect(gaps.length).toBe(2) // a-b och b-c (rad 2 har bara ett block)
  })
  it('areaWidthPx: span-spår + inre gutters', () => {
    expect(areaWidthPx({ span: 3 }, geom)).toBe(3 * 80 + 2 * 20) // 280
    expect(areaWidthPx({ span: 1 }, geom)).toBe(80)
  })
})

describe('komponent-ins (platshållar-block)', () => {
  it('infogar ett platshållar-block på ny rad med unik nyckel', () => {
    const a = area({ key: '0', colStart: 1, span: 12, row: 1 })
    const { areas, key } = insertPlaceholder([a], 12)
    expect(isPlaceholderKey(key)).toBe(true)
    const ph = areas.find((x) => x.key === key)!
    expect(ph.placeholder).toBe(true)
    expect(ph.row).toBe(2)         // under befintlig rad
    expect(ph.span).toBe(6)        // halvbrett i 12-grid
    expect(Number.isNaN(Number(key))).toBe(true) // NaN → DOM-appliceringen hoppar den
  })
  it('ger stigande unika nycklar', () => {
    const step1 = insertPlaceholder([], 12)
    const step2 = insertPlaceholder(step1.areas, 12)
    expect(step1.key).not.toBe(step2.key)
  })
})

import { describe, it, expect } from 'vitest'
import {
  insertIntoRow, resolveDrop, resolveSpan, compactRows, insertionRow,
  sameLayout, overlapPairs, type ReflowItem, type RowBand,
} from './reflowModel'

const it1 = (key: string, colStart: number, span: number, row: number, hidden?: boolean): ReflowItem =>
  ({ key, colStart, span, row, ...(hidden ? { hidden } : {}) })

const byKey = (items: ReflowItem[], key: string) => items.find((i) => i.key === key)!

describe('insertIntoRow', () => {
  it('infoga FÖRE en granne: grannen knuffas åt höger om raden rymmer', () => {
    // B på 4–9, A (span 3) släpps på kol 3 → A 3–5, B skjuts till 6–11.
    const res = insertIntoRow([{ key: 'B', colStart: 4, span: 6 }], { colStart: 3, span: 3 }, 12)
    expect(res.pushedDown).toEqual([])
    expect(res.placements.get('B')).toBe(6)
  })
  it('infoga EFTER en granne: grannen står kvar när det inte krockar', () => {
    const res = insertIntoRow([{ key: 'B', colStart: 1, span: 4 }], { colStart: 7, span: 4 }, 12)
    expect(res.pushedDown).toEqual([])
    expect(res.placements.size).toBe(0) // ingen behöver flytta
  })
  it('sidled-swap: exakt släpp på grannens plats i en full rad byter plats', () => {
    // A (6) släpps på kol 7 där B (7–12) ligger → B glider till 1–6.
    const res = insertIntoRow([{ key: 'B', colStart: 7, span: 6 }], { colStart: 7, span: 6 }, 12)
    expect(res.pushedDown).toEqual([])
    expect(res.placements.get('B')).toBe(1)
  })
  it('knuffar NEDÅT när sidled inte ryms – bara de som överlappar', () => {
    // Full rad B(1–4) C(5–8) D(9–12); A (span 4) släpps på 5 → bara C åker ner.
    const res = insertIntoRow(
      [{ key: 'B', colStart: 1, span: 4 }, { key: 'C', colStart: 5, span: 4 }, { key: 'D', colStart: 9, span: 4 }],
      { colStart: 5, span: 4 }, 12,
    )
    expect(res.pushedDown).toEqual(['C'])
    expect(res.placements.size).toBe(0)
  })
})

describe('resolveDrop', () => {
  it('byta rad: infogas på målraden och den gamla (tomma) raden komprimeras bort', () => {
    const items = [it1('A', 1, 12, 1), it1('B', 1, 6, 2), it1('C', 7, 6, 2)]
    const out = resolveDrop(items, 'A', { row: 2.5, colStart: 1 }, 12)
    expect(byKey(out, 'B').row).toBe(1)
    expect(byKey(out, 'C').row).toBe(1)
    expect(byKey(out, 'A').row).toBe(2)
    expect(overlapPairs(out)).toEqual([])
  })
  it('släpp ovanpå i full rad ⇒ grannen tar en egen rad under (aldrig överlapp)', () => {
    const items = [it1('A', 1, 6, 1), it1('B', 7, 6, 1), it1('C', 1, 12, 2)]
    // A dras åt höger till kol 3 → 3–8 överlappar B; B(6) ryms inte i sidled.
    const out = resolveDrop(items, 'A', { row: 1, colStart: 3 }, 12)
    expect(byKey(out, 'A')).toMatchObject({ row: 1, colStart: 3 })
    expect(byKey(out, 'B')).toMatchObject({ row: 2, colStart: 7 }) // egen ny rad, kolumn kvar
    expect(byKey(out, 'C').row).toBe(3) // knuffad nedåt av mellanraden
    expect(overlapPairs(out)).toEqual([])
  })
  it('sidled-swap på hel rad via resolveDrop', () => {
    const items = [it1('A', 1, 6, 1), it1('B', 7, 6, 1)]
    const out = resolveDrop(items, 'A', { row: 1, colStart: 7 }, 12)
    expect(byKey(out, 'A').colStart).toBe(7)
    expect(byKey(out, 'B').colStart).toBe(1)
    expect(out.every((i) => i.row === 1)).toBe(true)
  })
  it('nästlade helbredds-syskon (dokumentflöde): släpp på en rad = infoga före', () => {
    // Tre staplade sektioner; sektion 3 släpps på rad 1 → ordning 3,1,2.
    const items = [it1('s1', 1, 12, 1), it1('s2', 1, 12, 2), it1('s3', 1, 12, 3)]
    const out = resolveDrop(items, 's3', { row: 1, colStart: 1 }, 12)
    expect(byKey(out, 's3').row).toBe(1)
    expect(byKey(out, 's1').row).toBe(2)
    expect(byKey(out, 's2').row).toBe(3)
    expect(overlapPairs(out)).toEqual([])
  })
  it('samma rad utan konflikt: bara den dragna flyttar', () => {
    const items = [it1('A', 1, 3, 1), it1('B', 9, 4, 1)]
    const out = resolveDrop(items, 'A', { row: 1, colStart: 4 }, 12)
    expect(byKey(out, 'A').colStart).toBe(4)
    expect(byKey(out, 'B').colStart).toBe(9)
  })
  it('dolda items deltar inte i konflikten och behåller sin placering', () => {
    const items = [it1('A', 1, 6, 1), it1('H', 7, 6, 1, true)]
    const out = resolveDrop(items, 'A', { row: 1, colStart: 7 }, 12)
    expect(byKey(out, 'A').colStart).toBe(7)
    expect(byKey(out, 'H')).toMatchObject({ colStart: 7, hidden: true })
  })
  it('okänd nyckel är en no-op', () => {
    const items = [it1('A', 1, 6, 1)]
    expect(resolveDrop(items, 'X', { row: 1, colStart: 3 }, 12)).toEqual(items)
  })
})

describe('resolveSpan (storleksändring reflowar också)', () => {
  it('breddning knuffar högergrannen åt höger när det ryms', () => {
    const items = [it1('A', 1, 4, 1), it1('B', 5, 4, 1)]
    const out = resolveSpan(items, 'A', 6, 12)
    expect(byKey(out, 'A').span).toBe(6)
    expect(byKey(out, 'B').colStart).toBe(7)
    expect(overlapPairs(out)).toEqual([])
  })
  it('breddning i full rad knuffar grannen nedåt', () => {
    const items = [it1('A', 1, 6, 1), it1('B', 7, 6, 1)]
    const out = resolveSpan(items, 'A', 9, 12)
    expect(byKey(out, 'A').span).toBe(9)
    expect(byKey(out, 'B').row).toBe(2)
    expect(overlapPairs(out)).toEqual([])
  })
})

describe('compactRows', () => {
  it('renumrerar (även halvtal) tät-packat 1..R', () => {
    const out = compactRows([it1('A', 1, 6, 2.5), it1('B', 1, 6, 4), it1('C', 1, 6, 7)])
    expect(out.map((i) => i.row)).toEqual([1, 2, 3])
  })
})

describe('insertionRow (släpp-mål ur pekar-y)', () => {
  const bands: RowBand[] = [
    { row: 1, top: 0, h: 60 },
    { row: 2, top: 70, h: 100 },
  ]
  it('mitt i en rad → raden', () => {
    expect(insertionRow(30, bands)).toBe(1)
    expect(insertionRow(120, bands)).toBe(2)
  })
  it('ovanför första raden → 0.5 (ny översta rad)', () => {
    expect(insertionRow(-10, bands)).toBe(0.5)
    expect(insertionRow(2, bands)).toBe(0.5)
  })
  it('i gapet mellan rader → halvtal (ny rad emellan)', () => {
    expect(insertionRow(65, bands)).toBe(1.5)
  })
  it('under sista raden → sista + 0.5', () => {
    expect(insertionRow(500, bands)).toBe(2.5)
  })
  it('inga rader → 1', () => {
    expect(insertionRow(50, [])).toBe(1)
  })
})

describe('sameLayout', () => {
  it('sant för identiska, falskt vid skillnad', () => {
    const a = [it1('A', 1, 6, 1), it1('B', 7, 6, 1)]
    expect(sameLayout(a, [...a])).toBe(true)
    expect(sameLayout(a, [it1('A', 2, 6, 1), it1('B', 7, 6, 1)])).toBe(false)
  })
})

describe('egenskap: resultatet är ALLTID parvis disjunkt', () => {
  // Deterministisk mini-fuzz (seedad LCG): slumpade konfliktfria startlayouter +
  // slumpade släpp → aldrig något överlappande par, alla nycklar/spann bevarade.
  const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
  it('300 slumpade släpp på slumpade layouter', () => {
    const rnd = lcg(42)
    const cols = 12
    for (let iter = 0; iter < 300; iter++) {
      // Bygg en konfliktfri layout rad för rad.
      const items: ReflowItem[] = []
      const nRows = 1 + Math.floor(rnd() * 4)
      let k = 0
      for (let r = 1; r <= nRows; r++) {
        let col = 1
        while (col <= cols && rnd() > 0.15) {
          const span = 1 + Math.floor(rnd() * (cols - col + 1))
          items.push(it1(`k${k++}`, col, span, r))
          col += span + Math.floor(rnd() * 3)
        }
      }
      if (items.length === 0) continue
      expect(overlapPairs(items)).toEqual([]) // sanity: starten är konfliktfri
      const dragged = items[Math.floor(rnd() * items.length)]
      const targetRow = rnd() < 0.3
        ? Math.floor(rnd() * (nRows + 1)) + 0.5           // mellan rader
        : 1 + Math.floor(rnd() * nRows)                    // på en rad
      const targetCol = 1 + Math.floor(rnd() * cols)
      const out = resolveDrop(items, dragged.key, { row: targetRow, colStart: targetCol }, cols)
      expect(overlapPairs(out)).toEqual([])
      expect(out.map((i) => i.key).sort()).toEqual(items.map((i) => i.key).sort())
      for (const i of out) {
        expect(i.span).toBe(byKey(items, i.key).span)
        expect(i.colStart).toBeGreaterThanOrEqual(1)
        expect(i.colStart + i.span - 1).toBeLessThanOrEqual(cols)
        expect(Number.isInteger(i.row)).toBe(true)
      }
    }
  })
})

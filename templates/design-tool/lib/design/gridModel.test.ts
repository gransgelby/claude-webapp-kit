import { describe, it, expect } from 'vitest'
import {
  clampPlacement, snapTracks, gridColumnValue, gridRowValue,
  placementFromGeometry, assignRowsByTop, normalizeRows,
  colFromWireframeX, spanFromWireframeW, areasOverlap, overlappingKeys,
  gridColLineCss, gridBandCss, fadeMaskVertical, fadeMaskHorizontal,
  topBoxMoveMode,
  type GridArea, type GridGeom,
} from './gridModel'

const area = (p: Partial<GridArea>): GridArea => ({ key: 'k', label: 'L', colStart: 1, span: 12, row: 1, ...p })

describe('clampPlacement (grid-agnostisk)', () => {
  it('klampar span och colStart in i rutnätet (12 kol)', () => {
    expect(clampPlacement(1, 12, 12)).toEqual({ colStart: 1, span: 12 })
    expect(clampPlacement(10, 6, 12)).toEqual({ colStart: 7, span: 6 }) // skjuts in så det ryms
    expect(clampPlacement(0, 0, 12)).toEqual({ colStart: 1, span: 1 })
    expect(clampPlacement(99, 99, 12)).toEqual({ colStart: 1, span: 12 })
  })
  it('respekterar ETT ANNAT kolumnantal än 12 (16 kol)', () => {
    expect(clampPlacement(1, 16, 16)).toEqual({ colStart: 1, span: 16 })
    expect(clampPlacement(14, 6, 16)).toEqual({ colStart: 11, span: 6 })
    // span 8 fr colStart 12 i ett 16-grid skjuts in till 9
    expect(clampPlacement(12, 8, 16)).toEqual({ colStart: 9, span: 8 })
  })
})

describe('snapTracks', () => {
  it('snäpper pixel-delta till hela spår (spår + gap)', () => {
    const geom = { trackW: 80, gap: 20 } // step = 100
    expect(snapTracks(0, geom)).toBe(0)
    expect(snapTracks(140, geom)).toBe(1)
    expect(snapTracks(160, geom)).toBe(2)
    expect(snapTracks(-260, geom)).toBe(-3)
  })
  it('tål trackW 0 utan att dela med noll', () => {
    expect(snapTracks(50, { trackW: 0, gap: 0 })).toBe(0)
  })
})

describe('css-värden', () => {
  it('gridColumnValue och gridRowValue', () => {
    expect(gridColumnValue({ colStart: 4, span: 6 })).toBe('4 / span 6')
    expect(gridRowValue({ row: 3 })).toBe('3')
  })
})

describe('placementFromGeometry (avläser riktig placering ur px)', () => {
  const geom: GridGeom = { cols: 12, trackW: 80, gap: 20, originX: 100 } // step 100
  it('full bredd → colStart 1, span 12', () => {
    // 12 spår: 12*80 + 11*20 = 960+220 = 1180 px bred
    expect(placementFromGeometry(100, 1180, geom)).toEqual({ colStart: 1, span: 12 })
  })
  it('höger 6/6-halva → colStart 7, span 6', () => {
    // colStart 7 ligger 6 step in: originX + 6*100 = 700; bredd 6 spår = 6*80+5*20 = 580
    expect(placementFromGeometry(700, 580, geom)).toEqual({ colStart: 7, span: 6 })
  })
  it('funkar identiskt för 16-kol grid (grid-agnostisk)', () => {
    const g16: GridGeom = { cols: 16, trackW: 50, gap: 10, originX: 0 } // step 60
    // colStart 9 (8 step in = 480), span 8 → bredd 8*50+7*10 = 470
    expect(placementFromGeometry(480, 470, g16)).toEqual({ colStart: 9, span: 8 })
  })
})

describe('rad-hantering', () => {
  it('assignRowsByTop grupperar samma vertikala band', () => {
    const rows = assignRowsByTop([
      { ...area({ key: 'a' }), top: 0 }, { ...area({ key: 'b' }), top: 3 }, // samma rad (inom tol)
      { ...area({ key: 'c' }), top: 200 },
    ])
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.row]))
    expect(byKey.a).toBe(1)
    expect(byKey.b).toBe(1)
    expect(byKey.c).toBe(2)
  })
  it('normalizeRows tät-packar radnummer 1..R', () => {
    const out = normalizeRows([area({ key: 'a', row: 2 }), area({ key: 'b', row: 5 }), area({ key: 'c', row: 5 })])
    expect(out.map((a) => a.row)).toEqual([1, 2, 2])
  })
})

describe('wireframe-snap', () => {
  it('colFromWireframeX och spanFromWireframeW snäpper till celler', () => {
    expect(colFromWireframeX(0, 40, 12)).toBe(1)
    expect(colFromWireframeX(85, 40, 12)).toBe(3) // ~2.1 → col 3
    expect(colFromWireframeX(9999, 40, 12)).toBe(12) // klamp
    expect(spanFromWireframeW(160, 40, 12)).toBe(4)
    expect(spanFromWireframeW(5, 40, 12)).toBe(1) // minst 1
  })
})

describe('överlapps-detektion', () => {
  it('flaggar överlapp på samma rad, inte på skilda rader', () => {
    const a = area({ key: 'a', colStart: 1, span: 6, row: 1 })
    const b = area({ key: 'b', colStart: 4, span: 6, row: 1 })
    const c = area({ key: 'c', colStart: 10, span: 3, row: 1 })
    const d = area({ key: 'd', colStart: 1, span: 6, row: 2 })
    expect(areasOverlap(a, b)).toBe(true)
    expect(areasOverlap(a, c)).toBe(false)
    expect(areasOverlap(b, c)).toBe(false)
    expect(areasOverlap(a, d)).toBe(false)
    expect(overlappingKeys([a, b, c, d])).toEqual(new Set(['a', 'b']))
  })
  it('dolda områden överlappar aldrig', () => {
    const a = area({ key: 'a', colStart: 1, span: 12, row: 1, hidden: true })
    const b = area({ key: 'b', colStart: 1, span: 12, row: 1 })
    expect(areasOverlap(a, b)).toBe(false)
  })
})

describe('R15: oändlig grid-canvas – CSS-byggare', () => {
  it('gridColLineCss: en 1px-linje per spår, spårbredd i strängen', () => {
    const css = gridColLineCss('var(--dt-grid-line)', 40)
    expect(css).toBe('repeating-linear-gradient(to right, var(--dt-grid-line) 0 1px, transparent 1px 40px)')
  })
  it('gridColLineCss: klampar spårbredd till minst 2px', () => {
    expect(gridColLineCss('red', 0)).toContain('transparent 1px 2px')
    expect(gridColLineCss('red', -5)).toContain('transparent 1px 2px')
  })

  it('gridBandCss: två kanter (grid-line) + fyllning (grid-band), centrerade på gränsen', () => {
    const css = gridBandCss('var(--dt-grid-line)', 'var(--dt-grid-band)', 46, 10)
    // gutter 10 → h=5: höger kant vid 4–5px, vänster kant på nästa band vid 41–42px.
    expect(css).toContain('var(--dt-grid-band) 0 4px')
    expect(css).toContain('var(--dt-grid-line) 4px 5px')
    expect(css).toContain('transparent 5px 41px')
    expect(css).toContain('var(--dt-grid-line) 41px 42px')
    expect(css).toContain('var(--dt-grid-band) 42px 46px')
  })
  it('gridBandCss: klampar gutter till [2, step-2] så mönstret aldrig kollapsar', () => {
    // gutter större än spårbredden klampas ned
    const css = gridBandCss('L', 'B', 20, 999)
    expect(css).toContain('repeating-linear-gradient(to right,')
    // klampad gutter = step-2 = 18 → h=9: transparent-segmentet blir tomt men giltigt
    expect(css).toContain('transparent 9px 11px')
  })

  it('fadeMaskVertical: transparent ovan sidan, full svärta från toppen och nedåt', () => {
    expect(fadeMaskVertical(120, 100)).toBe(
      'linear-gradient(to bottom, transparent 20px, #000 120px, #000 100%)',
    )
  })
  it('fadeMaskVertical: hanterar sid-topp ovanför viewporten (negativa stopp)', () => {
    expect(fadeMaskVertical(-40, 60)).toContain('transparent -100px')
    expect(fadeMaskVertical(-40, 60)).toContain('#000 -40px')
  })

  it('fadeMaskHorizontal: full inom sidans bredd, uttonande åt båda sidor', () => {
    expect(fadeMaskHorizontal(200, 800, 120)).toBe(
      'linear-gradient(to right, transparent 80px, #000 200px, #000 800px, transparent 920px)',
    )
  })
})

describe('W12-hybrid: topBoxMoveMode (live grid vs fri skiss)', () => {
  it('riktigt grid + snap på ⇒ live grid-placering', () => {
    expect(topBoxMoveMode({ isRealGrid: true, snapToGrid: true, hasDirtyIntent: false })).toBe('grid')
  })
  it('snap AV ⇒ fri skiss (intent) även i ett riktigt grid', () => {
    expect(topBoxMoveMode({ isRealGrid: true, snapToGrid: false, hasDirtyIntent: false })).toBe('intent')
  })
  it('ICKE-grid-container ⇒ fri skiss (intent) oavsett snap', () => {
    expect(topBoxMoveMode({ isRealGrid: false, snapToGrid: true, hasDirtyIntent: false })).toBe('intent')
    expect(topBoxMoveMode({ isRealGrid: false, snapToGrid: false, hasDirtyIntent: false })).toBe('intent')
  })
  it('en låda som redan är en smutsig fri-flytt-skiss förblir intent (även i grid + snap)', () => {
    expect(topBoxMoveMode({ isRealGrid: true, snapToGrid: true, hasDirtyIntent: true })).toBe('intent')
  })
})

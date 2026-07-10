// Enhetstester: panel-avdelare (B3) + pan/zoom-synk mellan vyerna (B4/B5).
import { describe, expect, it } from 'vitest'
import {
  MACBOOK14, MIN_PANEL, clampSplitFrac, clampZoom, docDeltaFromPagePan,
  docDeltaFromWfPan, macbookRect, pageZoomScroll, resolveSplit, wfPanFromDocDelta,
  wheelZoomFactor, zoomAtPoint,
} from './viewSync'

describe('resolveSplit (B3)', () => {
  it('ger höger panelbredd ur pekarens x', () => {
    expect(resolveSplit(1000, 1600, 0).rightW).toBe(600)
    expect(resolveSplit(1000, 1600, 0).snapped).toBe(false)
  })
  it('snappar till EXAKT 50/50 inom toleransen', () => {
    const r = resolveSplit(810, 1600, 16) // rightW 790, 10px från 800
    expect(r.rightW).toBe(800)
    expect(r.snapped).toBe(true)
  })
  it('snappar inte utanför toleransen', () => {
    const r = resolveSplit(830, 1600, 16) // rightW 770, 30px från 800
    expect(r.rightW).toBe(770)
    expect(r.snapped).toBe(false)
  })
  it('klampar till minsta panelbredd på båda sidor', () => {
    expect(resolveSplit(30, 1600).rightW).toBe(1600 - MIN_PANEL)
    expect(resolveSplit(1590, 1600).rightW).toBe(MIN_PANEL)
  })
  it('50/50 på udda bredd snappar till halva', () => {
    const r = resolveSplit(600.5, 1201, 16)
    expect(r.rightW).toBe(600.5)
    expect(r.snapped).toBe(true)
  })
})

describe('clampSplitFrac (B3, persistens)', () => {
  it('klampar fraktionen så båda paneler ryms', () => {
    expect(clampSplitFrac(0.05, 1600)).toBeCloseTo(MIN_PANEL / 1600)
    expect(clampSplitFrac(0.97, 1600)).toBeCloseTo(1 - MIN_PANEL / 1600)
    expect(clampSplitFrac(0.5, 1600)).toBe(0.5)
  })
})

describe('pan-synk via dokument-position (B4)', () => {
  it('vänster-drag → dokument-delta (drag ner = tidigare innehåll)', () => {
    expect(docDeltaFromPagePan(100, 1)).toBe(-100)
    expect(docDeltaFromPagePan(100, 0.5)).toBe(-200) // utzoomad sida: 1 visuell px = 2 dokument-px
  })
  it('wireframe-drag → dokument-delta via k och zoom', () => {
    // k = 0.4 wf-px per verklig px, zoom 1: 40 wf-px pan = 100 verkliga px.
    expect(docDeltaFromWfPan(40, 1, 0.4)).toBeCloseTo(-100)
    expect(docDeltaFromWfPan(40, 2, 0.4)).toBeCloseTo(-50)
  })
  it('mappningarna är varandras inverser (rundresa)', () => {
    const dDoc = docDeltaFromWfPan(37, 1.3, 0.42)
    expect(wfPanFromDocDelta(dDoc, 1.3, 0.42)).toBeCloseTo(37)
  })
  it('samma dokument-delta ger skalade – inte råa – pixeldeltan', () => {
    // 120 visuella px på sidan (zoom 1) = 120 dokument-px = 120·k wf-px (zoom 1).
    const dDoc = docDeltaFromPagePan(120, 1)
    expect(wfPanFromDocDelta(dDoc, 1, 0.4)).toBeCloseTo(48)
  })
})

describe('zoomAtPoint (B5)', () => {
  it('innehålls-punkten under origo ligger stilla', () => {
    const pan = { x: 20, y: -40 }
    const zOld = 1
    const zNew = 1.5
    const cx = 300
    const cy = 200
    // Innehålls-punkt under (cx, cy) före zoom:
    const contentX = (cx - pan.x) / zOld
    const contentY = (cy - pan.y) / zOld
    const np = zoomAtPoint(pan, zOld, zNew, cx, cy)
    expect(np.x + contentX * zNew).toBeCloseTo(cx)
    expect(np.y + contentY * zNew).toBeCloseTo(cy)
  })
  it('zoom 1→1 ändrar ingenting', () => {
    expect(zoomAtPoint({ x: 5, y: 7 }, 1, 1, 100, 100)).toEqual({ x: 5, y: 7 })
  })
})

describe('pageZoomScroll (B5)', () => {
  it('håller dokument-positionen i panelens mitt vid utzoom', () => {
    // viewH 800, zoom 1 → mitt = scrollTop + 400. Zoom 0.5 → synlig höjd 1600.
    const st = pageZoomScroll(1000, 800, 1, 0.5)
    expect(st + 1600 / 2).toBeCloseTo(1000 + 400)
  })
  it('klampar aldrig under 0', () => {
    expect(pageZoomScroll(0, 800, 1, 0.5)).toBe(0)
  })
  it('in- och utzoom är varandras inverser (utan klamp)', () => {
    const st1 = pageZoomScroll(500, 700, 1, 2)
    expect(pageZoomScroll(st1, 700, 2, 1)).toBeCloseTo(500)
  })
})

describe('wheelZoomFactor + clampZoom (B5)', () => {
  it('scroll upp (deltaY < 0) zoomar in, ner zoomar ut', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100)).toBeLessThan(1)
    expect(wheelZoomFactor(0)).toBe(1)
  })
  it('clampZoom håller sig inom gränserna', () => {
    expect(clampZoom(0.1)).toBe(0.4)
    expect(clampZoom(5)).toBe(2.4)
    expect(clampZoom(1)).toBe(1)
  })
})

describe('macbookRect (B5)', () => {
  it('är skalenlig (1512×982 · k) och centrerad över innehållet', () => {
    const k = 0.4
    const r = macbookRect(k, 500)
    expect(r.w).toBeCloseTo(MACBOOK14.w * k)
    expect(r.h).toBeCloseTo(MACBOOK14.h * k)
    expect(r.x + r.w / 2).toBeCloseTo(250) // centrerad
    expect(r.y).toBe(0) // från dokument-toppen
  })
})

// Enhetstester: panel-avdelare (B3) + pan/zoom-synk mellan vyerna (B4/B5).
import { describe, expect, it } from 'vitest'
import {
  MACBOOK14, MIN_PANEL, centeredRightWidth, clampSplitFrac, clampZoom, docDeltaFromPagePan,
  docDeltaFromWfPan, macbookViewportRect, mirrorPan, pageLeftZoom, pageZoomScroll, resolveSplit,
  scrollSyncDoc, wfPanFromDocDelta, wheelZoomFactor, zoomAtPoint,
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

describe('centeredRightWidth (R1 · 50/50-lås)', () => {
  it('ger alltid exakt halva fönstret', () => {
    expect(centeredRightWidth(1600)).toBe(800)
    expect(centeredRightWidth(1920)).toBe(960)
    expect(centeredRightWidth(1601)).toBe(800.5)
  })
  it('vänster + höger panel blir lika breda (spegel)', () => {
    const winW = 1734
    const rightW = centeredRightWidth(winW)
    expect(winW - rightW).toBeCloseTo(rightW) // vänster == höger
  })
})

describe('scrollSyncDoc (R2 · synkad hjul-skroll)', () => {
  it('scroll ner (deltaY > 0) ger positivt dokument-delta (senare innehåll)', () => {
    expect(scrollSyncDoc(100, 1)).toBe(100)
    expect(scrollSyncDoc(-100, 1)).toBe(-100)
  })
  it('utzoomad sida: 1 skärm-px = mer dokument-px', () => {
    expect(scrollSyncDoc(100, 0.5)).toBe(200)
    expect(scrollSyncDoc(120, 2)).toBe(60)
  })
  it('samma dokument-delta driver wireframens pan via wfPanFromDocDelta', () => {
    // 120 skärm-px skroll (zoom 1) = 120 dokument-px = 120·k wf-px pan (zoom 1).
    const dDoc = scrollSyncDoc(120, 1)
    expect(wfPanFromDocDelta(dDoc, 1, 0.4)).toBeCloseTo(-48) // pan.y minskar → innehåll upp
  })
})

describe('macbookViewportRect (R13 · viewport-fast, skalar med zoom)', () => {
  it('är skalenlig (1512×982 · k · zoom) och ankrad till viewport-toppen', () => {
    const k = 0.4
    const r = macbookViewportRect(k, 500, 1, 0, 0)
    expect(r.w).toBeCloseTo(MACBOOK14.w * k)
    expect(r.h).toBeCloseTo(MACBOOK14.h * k)
    expect(r.top).toBe(0) // ankrad till toppen av synliga ytan
  })
  it('står STILL vertikalt vid skroll (top oberoende av pan.y – inget pan.y-argument)', () => {
    const a = macbookViewportRect(0.4, 500, 1, 0, 20)
    const b = macbookViewportRect(0.4, 500, 1, 0, 20)
    expect(a.top).toBe(b.top) // ingen skroll-koppling → alltid samma topp
    expect(a.top).toBe(0)
  })
  it('SKALAR med zoom (mer innehåll = en skärm vid utzoom)', () => {
    const k = 0.4
    const z = 0.6
    const r = macbookViewportRect(k, 500, z, 0, 0)
    expect(r.w).toBeCloseTo(MACBOOK14.w * k * z)
    expect(r.h).toBeCloseTo(MACBOOK14.h * k * z)
  })
  it('följer innehållets mitt horisontellt (pad + gridW/2 · zoom + panX)', () => {
    const k = 0.4, gridW = 500, pad = 20
    // zoom 1, panX 0 → mitten vid pad + gridW/2 = 270
    expect(macbookViewportRect(k, gridW, 1, 0, pad).left + (MACBOOK14.w * k) / 2).toBeCloseTo(270)
    // panX-förskjutning flyttar rektangeln lika mycket
    const shifted = macbookViewportRect(k, gridW, 1, 50, pad)
    const base = macbookViewportRect(k, gridW, 1, 0, pad)
    expect(shifted.left - base.left).toBeCloseTo(50)
  })
})

// ── R1 (GATE-omfix) · Spegel-projektion: pixelexakt + drift-fri ──────────────
//
// wireframens pan HÄRLEDS ur sidans auktoritativa dokument-position (mirrorPan)
// → en enda källa till sanning ⇒ panelerna kan omöjligt driva isär vid zoom.
// Panel-relativa skärm-Y/X för en dokumentpunkt (samma panel-topp/vänster antaget):
//   wf:   pan + zoom·(pad + doc·k),  k = pageScale/zoom  (= fit)
//   sida: (doc − scroll)·pageScale            (Y),  pageLeftRel + doc·pageScale (X)
const WF_PAD_T = 20
const wfTopRel = (docY: number, pan: number, zoom: number, ps: number) =>
  pan + zoom * (WF_PAD_T + docY * (ps / zoom))
const pageTopRel = (docY: number, scrollTop: number, ps: number) => (docY - scrollTop) * ps
const wfLeftRel = (docX: number, pan: number, zoom: number, ps: number) =>
  pan + zoom * (WF_PAD_T + docX * (ps / zoom))
const pageLeftRelAt = (docX: number, pageLeftRel: number, ps: number) => pageLeftRel + docX * ps

describe('mirrorPan (R1 · pixelexakt spegel)', () => {
  it('lägger wf-rutan exakt över sin riktiga ruta i BÅDE X och Y', () => {
    const fit = 0.5437, zoom = 1.9, ps = fit * zoom
    const scrollTop = 812, pageLeftRel = -640
    const pan = mirrorPan(scrollTop, pageLeftRel, zoom, ps, WF_PAD_T)
    for (const doc of [0, 300, 1400, 3050]) {
      expect(wfTopRel(doc, pan.y, zoom, ps)).toBeCloseTo(pageTopRel(doc, scrollTop, ps), 6)
      expect(wfLeftRel(doc, pan.x, zoom, ps)).toBeCloseTo(pageLeftRelAt(doc, pageLeftRel, ps), 6)
    }
  })
  it('är invers till sid-positionen (går att härleda tillbaka)', () => {
    const fit = 0.72, zoom = 1.3, ps = fit * zoom, scrollTop = 500, left = 30
    const pan = mirrorPan(scrollTop, left, zoom, ps, WF_PAD_T)
    expect(-(pan.y + zoom * WF_PAD_T) / ps).toBeCloseTo(scrollTop, 6) // scrollTop tillbaka
    expect(pan.x + zoom * WF_PAD_T).toBeCloseTo(left, 6)              // pageLeftRel tillbaka
  })
})

describe('pageLeftZoom (R1 · zoom-kring-pekare i sidled)', () => {
  it('håller dokument-X under fokuspunkten stilla', () => {
    const fit = 0.5437, focusX = 900
    const ps0 = fit * 1, ps1 = fit * 2.1
    const left0 = 40
    const docX = (focusX - left0) / ps0
    const left1 = pageLeftZoom(left0, ps0, ps1, focusX)
    // samma dokument-X hamnar på samma skärm-X efter skaländringen
    expect(left1 + docX * ps1).toBeCloseTo(focusX, 6)
  })
})

describe('spegel-projektion ackumulerar INTE (R1 · GATE-kärnan)', () => {
  // Simulerar Andreas repro på REN logik: sidan är auktoritativ (scrollTop via
  // pageZoomScroll, pageLeftRel via pageLeftZoom), pan HÄRLEDS varje steg. Kravet:
  // en fast dokumentpunkts wf- och sid-skärmläge förblir identiskt (≤1e-6) genom
  // MÅNGA zoom in/ut vid OLIKA fokus — dvs spegeln kan aldrig klättra/driva isär.
  it('wf-ruta ligger kvar exakt över riktig ruta genom 40 zoom-cykler vid olika fokus', () => {
    const fit = 0.5437
    const viewH = 800, viewW = 720
    let zoom = 1, scrollTop = 400, pageLeftRel = 20
    const probeDoc = 1400
    const maxScroll = 3000 // syntetisk dokument-räckvidd (browser-klamp emuleras)
    let maxDev = 0
    for (let c = 0; c < 40; c++) {
      // slumpartade men deterministiska fokuspunkter (låg/hög, vänster/höger)
      const focusY = c % 2 === 0 ? 0.85 * viewH : 0.12 * viewH
      const focusX = c % 3 === 0 ? 0.9 * viewW : 0.15 * viewW
      const target = c % 2 === 0 ? zoom * 1.3 : zoom / 1.3
      const z1 = clampZoom(target)
      const ps0 = fit * zoom, ps1 = fit * z1
      // sidan (auktoritativ), med symmetrisk klamp mot dokumentgränserna
      scrollTop = Math.max(0, Math.min(maxScroll, pageZoomScroll(scrollTop, viewH, ps0, ps1, focusY)))
      pageLeftRel = pageLeftZoom(pageLeftRel, ps0, ps1, focusX)
      zoom = z1
      const pan = mirrorPan(scrollTop, pageLeftRel, zoom, ps1, WF_PAD_T)
      const dev = Math.abs(wfTopRel(probeDoc, pan.y, zoom, ps1) - pageTopRel(probeDoc, scrollTop, ps1))
      const devX = Math.abs(wfLeftRel(probeDoc, pan.x, zoom, ps1) - pageLeftRelAt(probeDoc, pageLeftRel, ps1))
      maxDev = Math.max(maxDev, dev, devX)
    }
    expect(maxDev).toBeLessThan(1e-6) // aldrig ens sub-pixel drift
  })

  it('zoom in→ut vid SAMMA fokus återställer sid-positionen exakt (ingen ackumulering)', () => {
    const fit = 0.5437, viewH = 800, viewW = 720
    const focusY = 600, focusX = 500
    const scroll0 = 350, left0 = 15
    const ps0 = fit * 1, ps1 = fit * 1.8
    // in
    const scroll1 = pageZoomScroll(scroll0, viewH, ps0, ps1, focusY)
    const left1 = pageLeftZoom(left0, ps0, ps1, focusX)
    // ut (tillbaka till 1) vid samma fokus
    const scroll2 = pageZoomScroll(scroll1, viewH, ps1, ps0, focusY)
    const left2 = pageLeftZoom(left1, ps1, ps0, focusX)
    expect(scroll2).toBeCloseTo(scroll0, 6)
    expect(left2).toBeCloseTo(left0, 6)
  })
})

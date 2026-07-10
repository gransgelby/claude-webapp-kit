'use client'
// Design mode – HJÄLTEN (Post 3, nattjobb 2026-07-10). Två-panel-arbetsytan som
// är verktygets själva hjärta:
//   • VÄNSTER = den RIKTIGA sidan (den äkta sidans DOM flyttas in i ett
//     "device-fönster" och griddas om LIVE när man drar i wireframen).
//   • HÖGER  = en WIREFRAME av rutnätet: varje griddat område som ett block man
//     kan dra / resiza (i kolumnspann) / radera med grid-SNAP.
// Släpp en flytt → modellen skrivs till den riktiga DOM:en (CSS grid-column/row,
// aldrig JSX) → man ser resultatet direkt på den äkta sidan.
//
// GRID-AGNOSTISK: kolumnantal + gap läses LIVE ur sidans grid-container
// ([data-grid-cols] + gridTemplateColumns/gap) – aldrig hårdkodat 12. All snap-/
// mappnings-matematik ligger i lib/design/gridModel.ts (enhetstestad).
//
// Själv-responsiv: breda skärmar → två paneler; laptop → enkel-panel (wireframe)
// + en växel som visar den riktiga sidan. Desktop-only (artig notis på små skärmar).
// Lyx: zoom/pan-canvas (space-dra, ⌘±) + minikarta · snap-linjer + live-värde vid
// drag · fjäder-animationer som respekterar prefers-reduced-motion · undo/redo.
//
// KROKAR FÖR SENARE POSTER (sök på "HOOK:"):
//   HOOK-P4-PANEL     – egenskaps-panel (token-medveten) dockar i höger sidopanel
//   HOOK-P5-BREADCRUMB– element-brödsmula: klick på ett block → DOM-hierarki
//   HOOK-P6-LAYOUT    – align/distribute + mät-overlay ovanpå wireframe-canvasen
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GRID } from '@/lib/designToolAdapter'
import { saveDesignNote } from '@/lib/designToolAdapter'
import {
  clampPlacement, gridColumnValue, gridRowValue, placementFromGeometry,
  assignRowsByTop, normalizeRows, overlappingKeys, type GridArea, type GridGeom,
} from '@/lib/design/gridModel'
import {
  alignAreas, distributeAreas, measureGaps, areaWidthPx, insertPlaceholder,
  isPlaceholderKey, colEnd, type AlignEdge, type DistributeMode,
} from '@/lib/design/layoutTools'
import { dtBtn, dtGhostBtn, dtSaveBtn } from './dtStyles'
import PropertyPanel from './PropertyPanel'
import ElementInspector from './ElementInspector'
import { describeNode, elementLabel } from '@/lib/design/elementModel'
import { dtKey } from '@/lib/design/dtConfig'
import { readRegions, scopeMech, localPlacement, type RegionMech, type RegionNode } from '@/lib/design/regionModel'
import { nameForElement } from '@/lib/design/regionNames'
import { emulateViewportWidth } from '@/lib/design/mediaEmu'
import {
  probeIsFixed, wfScale, snapHeight, clampDragH, stackRows, heightsEqual,
  type SnapCandidate, type StackChild, type RowStack,
} from '@/lib/design/heightModel'
import {
  resolveDrop, resolveSpan, insertionRow, sameLayout, type RowBand,
} from '@/lib/design/reflowModel'
import {
  MACBOOK14, clampSplitFrac, clampZoom, docDeltaFromPagePan, docDeltaFromWfPan,
  macbookRect, pageZoomScroll, resolveSplit, wfPanFromDocDelta, wheelZoomFactor,
  zoomAtPoint,
} from '@/lib/design/viewSync'
import { buildLayoutPayload, layoutSignature } from '@/lib/design/savePayload'

// Brytpunkter (verktyget är desktop-only + själv-responsivt).
const DESKTOP_MIN = 860   // under → artig notis, aktivera inte
const DUAL_MIN = 1180     // under → enkel-panel (wireframe) + växel
const MOBILE_W = 390      // "mobil"-förhandsvisningens bredd
// Wireframe-canvasens mått (logiska px vid zoom 1).
const ROW_H = 46      // fallback-höjd när verklig höjd saknas (platshållare m.m.)
const ROW_GAP = 10
const WF_PAD = 20
// Nästlade regioner: etikettremsor är OVERLAY (tar ingen layoutplats – höjderna
// är skalenliga mot verkliga sidan sedan A2).
const TOP_HEAD = 22   // topp-blockets etikettrad
const NEST_HEAD = 15  // nästlad regions etikettrad
const NEST_PAD = 4
// A2: skalenliga höjder + dra-höjd.
const MIN_BLOCK_WF = 26   // minsta topp-block/band i wf-px (etikettraden ska rymmas)
const MIN_REGION_WF = 12  // minsta nästlad region i wf-px
const SNAP_TOL_WF = 7     // snap-tolerans för höjd-drag, i wireframe-px
// A4: mobil-spegeln är skrivskyddad (layout redigeras i desktop-läge).
const MIRROR_MSG = 'Mobil-förhandsvisningen är skrivskyddad – redigera layouten i desktop-läge'

type Props = { onExit: () => void; flash: (msg: string, undo?: () => void) => void; reduced: boolean }

interface RealRef { el: HTMLElement; orig: { gridColumn: string; gridRow: string; display: string; height: string } }

/** En nästlad region i wireframen (A1) – auto-detekterad ur regionshierarkin.
 *  Placeringen är LOKAL inom regionens riktiga scope-container (grid-spår eller
 *  virtuellt 12-raster) så v1:s drag-/snap-mekanik återanvänds rakt av. */
interface RegionVM {
  id: string
  /** Topp-blocket (v1-area-key) eller bandet regionen bor i. */
  topId: string
  /** Förälder-regionens id (null = direkt barn till topp-blocket/bandet). */
  parentId: string | null
  label: string
  el: HTMLElement
  /** Innersta merge-elementet (det visuella kortet) – bäst för egenskaps-panelen. */
  innerEl: HTMLElement
  /** Elementet som flyttas/resizas (yttersta exklusiva wrappern). */
  anchorEl: HTMLElement
  scopeEl: HTMLElement
  mech: RegionMech
  kind: 'visual' | 'slot'
  cols: number
  colStart: number
  span: number
  /** Nästlad rad inom föräldern (1-baserad, ur verklig y-position). */
  row: number
  /** Scope-containerns inre origo/bredd som fraktion av förälder-regionens bredd. */
  sfx: number
  sfw: number
  /** A2: skalenlig höjd. hpx = aktuell VERKLIG höjd (px); origH = init-höjd;
   *  relY = y-offset från förälder-regionens topp (verkliga px, init). */
  hpx: number
  origH: number
  relY: number
  /** Fast höjd (explicit height/aspect – generisk sondering) → dra-höjd tillåten. */
  fixedH: boolean
  /** Elementet som BÄR den fasta höjden (kan vara det inre kortet) + init-mått. */
  fixedEl: HTMLElement | null
  fixedOrigPx: number
  fixedOrigInline: string
  orig: { colStart: number; span: number; row: number }
  origStyle: { gridColumn: string; order: string; width: string; flexBasis: string; flexGrow: string }
  /** B2: dokumentflödes-scope – ankarets init-DOM-position (för omordning via
   *  insertBefore med exakt återställning). domIdx = init-ordning inom scopet. */
  domIdx: number
  domParent: Node | null
  domNext: ChildNode | null
}

/** A2: höjd-tillstånd för ett topp-block (grid-barn). */
interface TopH { fixed: boolean; hpx: number; origPx: number }

/** Topp-band utanför sidans grid (toppbar, hero, sidfot …). Flyttas inte i A1;
 *  låsta band (sticky) är dessutom visuellt avvikande med hänglås. */
interface WfBand { id: string; label: string; locked: boolean; above: boolean; hpx: number; el?: HTMLElement }

/** Historik-snapshot: v1-areor + nästlade placeringar/höjder + topp-höjder (A1/A2).
 *  B2: nästlade bär även rad (vertikal flytt/reflow) – ett släpp med knuffar är EN post. */
interface Snap {
  areas: GridArea[]
  nest: Array<{ id: string; colStart: number; span: number; row: number; hpx: number }>
  tops: Array<{ key: string; hpx: number }>
}

/** A4: skrivskyddad SPEGEL-modell av mobil-layouten. Byggs om vid preview-växel
 *  (efter media-emulering + suspenderade overrides) och rör aldrig historiken. */
interface MobileWf {
  areas: GridArea[]
  bands: WfBand[]
  nested: RegionVM[]
  topH: Record<string, TopH>
  realW: number
}

export default function DesignModeShell({ onExit, flash, reduced }: Props) {
  // ── Layout-läge (själv-responsivt) ──
  const [winW, setWinW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440)
  useEffect(() => {
    const on = () => setWinW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const tooSmall = winW < DESKTOP_MIN
  const dual = winW >= DUAL_MIN
  const [showRealSingle, setShowRealSingle] = useState(false) // enkel-panel: visa riktig sida
  const realVisible = dual || showRealSingle
  const [previewMobile, setPreviewMobile] = useState(false)
  // A4: mobil-preview speglar ÄKTA responsiv kollaps – appens media queries
  // emuleras till 390px, verktygets layout-overrides suspenderas (desktop-
  // overriden ligger kvar i modellen och återappliceras vid växel tillbaka),
  // och wireframen visar en skrivskyddad spegel av mobil-hierarkin.
  const mobileActive = previewMobile && realVisible && !tooSmall
  const [mobileWf, setMobileWf] = useState<MobileWf | null>(null)

  // ── Modell + historik ──
  // OBS: all historik-/toast-logik ligger UTANFÖR state-updaters (React StrictMode
  // dubbel-invokerar updaters i dev → sido-effekter där skulle köra två ggr).
  const [areas, setAreas] = useState<GridArea[]>([])
  const areasRef = useRef<GridArea[]>([])
  useEffect(() => { areasRef.current = areas }, [areas])
  // A1: nästlade regioner + band (auto-uppdelning ur regionshierarkin).
  const [nested, setNested] = useState<RegionVM[]>([])
  const nestedRef = useRef<RegionVM[]>([])
  useEffect(() => { nestedRef.current = nested }, [nested])
  const [bands, setBands] = useState<WfBand[]>([])
  // A2: höjd-tillstånd för topp-blocken (auto/fast + aktuell verklig höjd).
  const [topH, setTopH] = useState<Record<string, TopH>>({})
  const topHRef = useRef<Record<string, TopH>>({})
  useEffect(() => { topHRef.current = topH }, [topH])
  // A2: live-ommätta AUTO-höjder (härledda, inte historik) – "visar aktuell proportion".
  const [liveH, setLiveH] = useState<Record<string, number>>({})
  const past = useRef<Snap[]>([])
  const future = useRef<Snap[]>([])
  const [, forceHist] = useState(0)
  const bump = useCallback(() => forceHist((n) => n + 1), [])
  const realRefs = useRef<RealRef[]>([])
  const gridEl = useRef<HTMLElement | null>(null)
  const cols = useRef<number>(GRID.columns)
  const realW = useRef<number>(1200) // riktiga gridets inre bredd (px) → skalfaktorn
  const pageRoot = useRef<HTMLElement | null>(null)
  const pageOrig = useRef<Record<string, string>>({})

  /** Snapshot av HELA modellen (areor + nästlade placeringar/höjder + topp-höjder). */
  const snap = useCallback((): Snap => ({
    areas: areasRef.current,
    nest: nestedRef.current.map(({ id, colStart, span, row, hpx }) => ({ id, colStart, span, row, hpx })),
    tops: Object.entries(topHRef.current).map(([key, t]) => ({ key, hpx: t.hpx })),
  }), [])
  /** Återställ modellen ur ett snapshot (ren – inga sido-effekter i updaters). */
  const applySnap = useCallback((s: Snap) => {
    areasRef.current = s.areas
    setAreas(s.areas)
    const next = nestedRef.current.map((r) => {
      const p = s.nest.find((n) => n.id === r.id)
      return p && (p.colStart !== r.colStart || p.span !== r.span || p.row !== r.row || p.hpx !== r.hpx)
        ? { ...r, colStart: p.colStart, span: p.span, row: p.row, hpx: p.hpx }
        : r
    })
    nestedRef.current = next
    setNested(next)
    let tChanged = false
    const t = { ...topHRef.current }
    for (const it of s.tops) {
      const cur = t[it.key]
      if (cur && cur.hpx !== it.hpx) { t[it.key] = { ...cur, hpx: it.hpx }; tChanged = true }
    }
    if (tChanged) { topHRef.current = t; setTopH(t) }
  }, [])

  // ── Zoom/pan (delad: wireframe-transform + vänster sidas scale/scroll, B4/B5) ──
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false) // aktiv grab-pan → grabbing-cursor
  const zoomRef = useRef(zoom)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  const panRef = useRef(pan)
  useEffect(() => { panRef.current = pan }, [pan])

  // ── B3: flyttbar lodrät avdelare – höger panelens andel av fönstret ──
  // null = v1-defaulten. Persisteras under sessionen (sessionStorage), snappar
  // till EXAKT 50/50 (chip visas) så panelerna kan ges exakt lika utrymme.
  const [splitFrac, setSplitFrac] = useState<number | null>(() => loadSplitFrac())
  const splitFracRef = useRef(splitFrac)
  const [splitDrag, setSplitDrag] = useState<null | { snapped: boolean }>(null)
  const splitDragRef = useRef(false) // läses av place() → ingen bredd-transition under drag

  // ── B6: osparat-detektering + Avsluta-dialog ──
  // savedSig = modellens signatur vid init/senaste Spara; skiljer sig aktuella
  // signaturen → "Vill du spara ändringarna?"-dialog i stället för direkt-stängning.
  const savedSig = useRef('')
  const [exitAsk, setExitAsk] = useState(false)
  const exitAskRef = useRef(false)
  useEffect(() => { exitAskRef.current = exitAsk }, [exitAsk])

  // ── Drag/resize-tillstånd (för infognings-indikator + live-etikett) ──
  // B2: under flytt uppdateras INTE modellen live – i stället visas en
  // infognings-indikator (ghost-slot/insertion-linje) där blocket kommer landa,
  // och hela det konfliktfria resultatet (infoga + knuffar) committas vid släpp.
  const [drag, setDrag] = useState<null | {
    key: string; kind: 'move' | 'resize'; area: GridArea; x: number; y: number
    target: { row: number; colStart: number; span: number } | null
    pushes: number
  }>(null)

  // ── Layout-verktyg (Post 6): multi-select + mät-overlay + geometri ──
  // Multi-select (⇧-klick i wireframen) driver align/distribute. Skilt från selKey
  // (egenskaps-panelens enkel-markering) så de inte krockar.
  const [selSet, setSelSet] = useState<Set<string>>(new Set())
  const [measure, setMeasure] = useState(false)
  const [geom, setGeom] = useState<GridGeom | null>(null)
  const toggleSel = useCallback((key: string) => {
    setSelSet((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  // ── Markerat block → token-medveten egenskaps-panel (Post 4, HOOK-P4-PANEL) ──
  // Klick på ett wireframe-blocks "◧"-knapp markerar dess RIKTIGA element så samma
  // PropertyPanel som i overlay-läget dockar här (token-vs-override funkar i BÅDA lägena).
  const [selKey, setSelKey] = useState<string | null>(null)
  // Brödsmule-drill (Post 5): navigering upp/ner i DOM-hierarkin väljer ett annat
  // riktigt element än blockets rot. `null` = blockets rot-element.
  const [drillEl, setDrillEl] = useState<HTMLElement | null>(null)
  const selectBlock = useCallback((area: GridArea) => {
    const ref = realRefs.current[Number(area.key)]
    if (!ref) { flash('Hittade inte elementet för blocket'); return }
    setDrillEl(null)
    setSelKey((k) => (k === area.key ? null : area.key))
  }, [flash])
  const blockEl = selKey != null ? realRefs.current[Number(selKey)]?.el ?? null : null
  const selectedEl = drillEl ?? blockEl
  const selectedArea = selKey != null ? areas.find((a) => a.key === selKey) : undefined
  const selInfo = selectedEl
    ? (drillEl
        ? { design_id: drillEl.dataset.designId, selector: elementLabel(describeNode(drillEl)), label: elementLabel(describeNode(drillEl)) }
        : (selectedArea ? { design_id: blockEl?.dataset.designId, selector: selectedArea.label || `block ${selKey}`, label: selectedArea.label || `block ${selKey}` } : null))
    : null

  // ── Selektions-outline över det riktiga elementet (i vänster device-fönster) ──
  const [selRect, setSelRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  useEffect(() => {
    if (!selectedEl || !realVisible) { setSelRect(null); return }
    const sync = () => {
      const r = selectedEl.getBoundingClientRect()
      setSelRect(r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null)
    }
    sync()
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    const id = window.setInterval(sync, 400) // följ live-omgriddning/animation
    return () => { window.removeEventListener('scroll', sync, true); window.removeEventListener('resize', sync); window.clearInterval(id) }
  }, [selectedEl, realVisible, areas])

  const wfViewport = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [wfW, setWfW] = useState(600)
  useEffect(() => {
    const el = wfViewport.current
    if (!el) return
    const ro = new ResizeObserver(() => setWfW(el.clientWidth))
    ro.observe(el); setWfW(el.clientWidth)
    return () => ro.disconnect()
  }, [dual, realVisible])

  // A4: spegel-vy – i mobil-preview renderas wireframen ur den skrivskyddade
  // mobil-modellen (desktop-modellen + historiken lämnas helt orörda).
  const mirrorWf = mobileActive ? mobileWf : null
  const mirror = mirrorWf != null
  const vAreas = mirrorWf ? mirrorWf.areas : areas
  const vBands = mirrorWf ? mirrorWf.bands : bands
  const vNested = mirrorWf ? mirrorWf.nested : nested
  const vTopH = mirrorWf ? mirrorWf.topH : topH

  // Schematisk cellbredd (logisk, oberoende av zoom). I mobil-spegeln ritas
  // wireframen i device-proportion (≈390px bred kolumn) i stället för panelbredd.
  const cellW = mirror
    ? Math.max(8, (Math.min(wfW, MOBILE_W + 2 * WF_PAD) - 2 * WF_PAD) / cols.current)
    : Math.max(8, (wfW - 2 * WF_PAD) / cols.current)

  // ── (1) Läs den riktiga sidan → bygg initial modell (grid-agnostisk) ──
  // Själva läsningen bor i buildPageModel (modul-nivå) så mobil-spegeln (A4)
  // kan återanvända exakt samma modellbygge på den emulerade mobil-layouten.
  useEffect(() => {
    if (tooSmall) return
    const container = document.querySelector('[data-grid-cols]') as HTMLElement | null
    pageRoot.current = document.querySelector('[data-page-root]') as HTMLElement | null
    if (!container) { flash('Hittade inget grid på sidan (öppna en vy med [data-grid-cols]).'); return }
    gridEl.current = container
    const model = buildPageModel(container, pageRoot.current)
    cols.current = model.nCols
    realW.current = model.realW // skalenlig spegel: wf-px per verklig px (A2)
    setGeom(model.geom)
    const children = model.refs.map((r) => r.el)
    realRefs.current = model.refs
    // Kvarhållet tillstånd: återanvänd en sparad layout om den matchar antalet områden.
    const restored = loadLayout(location.pathname + location.search, model.areas.length)
    const initAreas = restored ?? model.areas
    areasRef.current = initAreas
    setAreas(initAreas)
    const nestedOut = model.nested
    const bandsOut = model.bands

    // ── A2: höjdsondering – auto vs FAST höjd, batchat (generisk heuristik) ──
    // Sonderar topp-blocken + varje regions elementkedja (inre kort → region →
    // ankare) i TRE svep (läs/skriv/läs) för att undvika layout-thrash. Den fasta
    // höjden kan bäras av det inre kortet (t.ex. kartytan) → dra-höjd appliceras
    // på just det elementet (delta mot dess init-höjd).
    const probeEls: HTMLElement[] = []
    const probeIdx = new Map<HTMLElement, number>()
    const addProbe = (el: HTMLElement) => { if (!probeIdx.has(el)) { probeIdx.set(el, probeEls.length); probeEls.push(el) } }
    children.forEach(addProbe)
    for (const r of nestedOut) { addProbe(r.innerEl); addProbe(r.el); addProbe(r.anchorEl) }
    const probes = probeHeightsDom(probeEls)
    for (const r of nestedOut) {
      for (const el of [r.innerEl, r.el, r.anchorEl]) {
        const p = probes[probeIdx.get(el)!]
        if (p.fixed) {
          r.fixedH = true
          r.fixedEl = el
          r.fixedOrigPx = p.h
          r.fixedOrigInline = el.style.height
          break
        }
      }
    }
    const th: Record<string, TopH> = {}
    children.forEach((el, i) => {
      const p = probes[probeIdx.get(el)!]
      th[String(i)] = { fixed: p.fixed, hpx: p.h, origPx: p.h }
    })
    topHRef.current = th
    setTopH(th)
    setBands(bandsOut)
    nestedRef.current = nestedOut
    setNested(nestedOut)
    // B6: baslinje för osparat-detekteringen (en restaurerad layout ÄR sparad).
    savedSig.current = layoutSignature({
      areas: initAreas,
      nest: nestedOut.map(({ id, colStart, span, row, hpx }) => ({ id, colStart, span, row, hpx })),
      tops: Object.entries(th).map(([key, t]) => ({ key, hpx: t.hpx })),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooSmall])

  // ── (1b) A3: engångs-relabel efter att SENT innehåll laddat ──
  // Namnen härleds ur innehållet (rubrik/aria/typ), men lazy-laddade ytor (t.ex.
  // en kart-canvas via dynamic import) finns inte vid init → deras regioner får
  // fallback-namn. Kör om namn-härledningen en gång när innehållet satt sig.
  // Bara etiketter – ingen historik, ingen geometri.
  useEffect(() => {
    if (tooSmall) return
    const t = setTimeout(() => {
      let changed = false
      const nextAreas = areasRef.current.map((a) => {
        const el = realRefs.current[Number(a.key)]?.el
        if (!el) return a
        const label = nameForElement(el, a.label)
        if (label === a.label) return a
        changed = true
        return { ...a, label }
      })
      if (changed) { areasRef.current = nextAreas; setAreas(nextAreas) }
      let nChanged = false
      const nextNested = nestedRef.current.map((r) => {
        const label = nameForElement(r.el, r.label)
        if (label === r.label) return r
        nChanged = true
        return { ...r, label }
      })
      if (nChanged) { nestedRef.current = nextNested; setNested(nextNested) }
      setBands((prev) => {
        let bChanged = false
        const next = prev.map((b) => {
          if (b.el == null) return b
          const label = b.locked ? b.label : bandLabel(b.el, 0)
          if (label === b.label) return b
          bChanged = true
          return { ...b, label }
        })
        return bChanged ? next : prev
      })
    }, 2500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooSmall])

  // ── (2) Relokera den riktiga sidan in i vänster "device-fönster" ──
  useEffect(() => {
    const root = pageRoot.current
    if (!root || tooSmall) return
    if (!realVisible) { restorePage(root, pageOrig.current); return }
    const place = () => {
      const stage = stageRef.current
      if (!stage || !root) return
      const s = stage.getBoundingClientRect()
      if (Object.keys(pageOrig.current).length === 0) {
        for (const k of ['position', 'left', 'top', 'width', 'height', 'margin', 'overflow', 'zIndex', 'boxShadow', 'borderRadius', 'transition', 'transform', 'transformOrigin']) {
          pageOrig.current[k] = root.style.getPropertyValue(cssName(k))
        }
      }
      const w = previewMobile ? MOBILE_W : Math.min(s.width - 24, 1280)
      // B5: delad zoom – layoutbredden behålls (ingen re-flow, modellen gäller),
      // innehållet transform-skalas och layouthöjden kompenseras → utzoom visar
      // MER av dokumentet i samma fönster, centrerat i panelen (zoom-origo mitten).
      const z = zoom
      const left = s.left + (s.width - w * z) / 2
      root.style.position = 'fixed'
      root.style.left = `${left}px`
      root.style.top = `${s.top}px`
      root.style.width = `${w}px`
      root.style.height = `${s.height / z}px`
      root.style.transform = z !== 1 ? `scale(${z})` : ''
      root.style.transformOrigin = '0 0'
      root.style.margin = '0'
      root.style.overflow = 'auto'
      root.style.zIndex = '10' // under .dt-root (2.1e9) → chrome/panel täcker; syns i hålet
      root.style.boxShadow = '0 10px 40px rgba(0,0,0,0.28)'
      root.style.borderRadius = '10px'
      // B3/B5: ingen bredd-transition under avdelar-drag eller när zoomad (wheel
      // ger täta uppdateringar – transitionen skulle släpa efter).
      root.style.transition = (reduced || z !== 1 || splitDragRef.current)
        ? 'none'
        : 'width 220ms cubic-bezier(0.22,1,0.36,1), left 220ms cubic-bezier(0.22,1,0.36,1)'
    }
    place()
    const ro = new ResizeObserver(place)
    if (stageRef.current) ro.observe(stageRef.current)
    window.addEventListener('resize', place)
    return () => { ro.disconnect(); window.removeEventListener('resize', place) }
  }, [realVisible, previewMobile, tooSmall, reduced, zoom])

  // ── (2b) A4: emulera mobil-viewport – appens egen responsiva CSS ska gälla ──
  // Media queries svarar på FÖNSTRET, inte på device-fönstrets bredd → skriv om
  // bredd-styrda @media-regler som om fönstret vore 390px (exakt återställning
  // vid växel tillbaka/unmount). Ren logik i lib/design/mediaEmu.ts.
  useEffect(() => {
    if (!mobileActive) return
    const restore = emulateViewportWidth(document, MOBILE_W)
    return restore
  }, [mobileActive])

  // ── (2c) A4: bygg den skrivskyddade MOBIL-spegeln för wireframen ──
  // Vänta ut bredd-transitionen (220 ms) + reflow, läs sedan om hela sid-
  // modellen (regionModel-heuristiken körs på mobil-layouten) med baked höjder.
  useEffect(() => {
    if (!mobileActive) { setMobileWf(null); return }
    const t = setTimeout(() => {
      const container = gridEl.current
      if (!container) return
      const model = buildPageModel(container, pageRoot.current)
      const th: Record<string, TopH> = {}
      model.refs.forEach((r, i) => {
        const h = r.el.offsetHeight // layout-px (opåverkad av B5:s transform-skala)
        th[String(i)] = { fixed: false, hpx: h, origPx: h }
      })
      setMobileWf({ areas: model.areas, bands: model.bands, nested: model.nested, topH: th, realW: model.realW })
    }, 380)
    return () => clearTimeout(t)
  }, [mobileActive])

  // ── A4/B5: preview-växel → nollställ delad zoom/pan ──
  // Spegel-modellen mäts ur riktiga DOM-rects; en aktiv transform-skala skulle
  // förvränga geometrin. Växeln är dessutom ett naturligt "börja om"-ögonblick.
  useEffect(() => {
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [previewMobile])

  // Restore på unmount (avsluta Design mode).
  useEffect(() => {
    return () => {
      const root = pageRoot.current
      if (root) restorePage(root, pageOrig.current)
      for (const r of realRefs.current) {
        r.el.style.gridColumn = r.orig.gridColumn
        r.el.style.gridRow = r.orig.gridRow
        r.el.style.display = r.orig.display
        r.el.style.height = r.orig.height
      }
      restoreFlowDom(nestedRef.current) // B2: dokumentflödes-ankarna till init-positionerna
      for (const r of nestedRef.current) restoreNested(r)
    }
  }, [])

  // ── (3) Applicera modellen → riktiga DOM:en (LIVE omgriddning) ──
  useEffect(() => {
    if (tooSmall) return
    // A4: i mobil-preview gäller appens EGEN responsiva layout – suspendera alla
    // desktop-overrides (modellen behålls orörd och återappliceras vid växel).
    if (mobileActive) {
      for (const r of realRefs.current) {
        r.el.style.gridColumn = r.orig.gridColumn
        r.el.style.gridRow = r.orig.gridRow
        r.el.style.display = r.orig.display
        r.el.style.height = r.orig.height
      }
      return
    }
    areas.forEach((a) => {
      const ref = realRefs.current[Number(a.key)]
      if (!ref) return
      if (a.hidden) { ref.el.style.display = 'none'; return }
      ref.el.style.display = ref.orig.display || ''
      ref.el.style.gridColumn = gridColumnValue(a)
      ref.el.style.gridRow = gridRowValue(a)
      // A2: dra-höjd på topp-block med FAST höjd (inline-style, dirty-spårad).
      const info = topH[a.key]
      if (info?.fixed) {
        ref.el.style.height = Math.abs(info.hpx - info.origPx) > 0.5 ? `${Math.round(info.hpx)}px` : ref.orig.height
      }
      if (!reduced) ref.el.style.transition = 'grid-column 200ms cubic-bezier(0.22,1,0.36,1)'
    })
  }, [areas, topH, tooSmall, reduced, mobileActive])

  // ── (3b) Applicera NÄSTLADE regioner → riktiga DOM:en (A1/B2) ──
  // Grid-förälder → inline grid-column (+ CSS order vid rad-/platsbyte så auto-
  // placeringen följer wireframens ordning); flex-förälder → order + bredd-%;
  // dokumentflödes-förälder → bredd-% vid resize och OMORDNING AV RIKTIGA DOM:EN
  // (insertBefore) vid flytt – med exakt återställning via init-positionerna
  // (robust för undo/redo och Avsluta). Oförändrade regioner får sina ursprungliga
  // inline-styles/DOM-platser tillbaka (dirty-spårning mot `orig`).
  useEffect(() => {
    if (tooSmall) return
    // A4: mobil-preview → suspendera även nästlade overrides (se effekt 3).
    if (mobileActive) {
      restoreFlowDom(nestedRef.current)
      for (const r of nestedRef.current) restoreNested(r)
      return
    }
    const orderScopes = new Map<HTMLElement, RegionVM[]>() // grid + flex → CSS order
    const flowScopes = new Map<HTMLElement, RegionVM[]>()  // flöde → DOM-ordning
    for (const r of nested) {
      const moved = r.colStart !== r.orig.colStart
      const resized = r.span !== r.orig.span
      if (r.mech === 'grid') {
        if (moved || resized) {
          r.anchorEl.style.gridColumn = `${r.colStart} / span ${r.span}`
          if (!reduced) r.anchorEl.style.transition = 'grid-column 200ms cubic-bezier(0.22,1,0.36,1)'
        } else {
          r.anchorEl.style.gridColumn = r.origStyle.gridColumn
        }
        const g = orderScopes.get(r.scopeEl) ?? []
        g.push(r)
        orderScopes.set(r.scopeEl, g)
      } else {
        if (resized) {
          const pct = `${((r.span / r.cols) * 100).toFixed(2)}%`
          r.anchorEl.style.width = pct
          if (r.mech === 'flex') { r.anchorEl.style.flexBasis = pct; r.anchorEl.style.flexGrow = '0' }
        } else {
          r.anchorEl.style.width = r.origStyle.width
          if (r.mech === 'flex') { r.anchorEl.style.flexBasis = r.origStyle.flexBasis; r.anchorEl.style.flexGrow = r.origStyle.flexGrow }
        }
        const m = r.mech === 'flex' ? orderScopes : flowScopes
        const g = m.get(r.scopeEl) ?? []
        g.push(r)
        m.set(r.scopeEl, g)
      }
      // A2: dra-höjd på regioner med FAST höjd → skriv på det bärande elementet
      // (delta mot dess init-höjd, så inre kort med padding/rubrik följer med).
      if (r.fixedEl) {
        const dh = r.hpx - r.origH
        r.fixedEl.style.height = (r.fixedH && Math.abs(dh) > 0.5)
          ? `${Math.round(r.fixedOrigPx + dh)}px`
          : r.fixedOrigInline
      }
    }
    // B2: har något syskon i scopet bytt plats (kolumn ELLER rad) → ordna alla
    // efter (rad, kolumn). Grid: order styr auto-placeringen; flex: som förut.
    const orderChanged = (g: RegionVM[]) => g.some((r) => r.colStart !== r.orig.colStart || r.row !== r.orig.row)
    for (const group of Array.from(orderScopes.values())) {
      if (orderChanged(group)) {
        const sorted = [...group].sort((a, b) => (a.row - b.row) || (a.colStart - b.colStart))
        sorted.forEach((r, i) => { r.anchorEl.style.order = String(i + 1) })
      } else {
        group.forEach((r: RegionVM) => { r.anchorEl.style.order = r.origStyle.order })
      }
    }
    // B2: dokumentflöde – återställ till init-DOM-ordning, applicera sedan den
    // önskade ordningen via insertBefore (icke-region-syskon ligger kvar).
    for (const group of Array.from(flowScopes.values())) {
      restoreFlowDom(group)
      if (orderChanged(group)) {
        const sorted = [...group].sort((a, b) => (a.row - b.row) || (a.colStart - b.colStart))
        applyDomOrder(sorted.map((r) => r.anchorEl))
      }
    }
  }, [nested, tooSmall, reduced, mobileActive])

  // ── (3c) A2: mät om AUTO-höjderna efter varje applicering ──
  // Auto-regioner har innehållsstyrd höjd → när layouten ändras (spann, dolda
  // block, en fast grannes nya höjd) mäts deras VERKLIGA höjd om så wireframen
  // alltid "visar aktuell proportion". Härlett tillstånd – aldrig i historiken.
  const measureLive = useCallback(() => {
    const next: Record<string, number> = {}
    // offsetHeight = layout-px → opåverkad av B5:s transform-skala på sidan.
    realRefs.current.forEach((ref, i) => {
      const h = ref.el.offsetHeight
      if (h > 0) next[`t:${i}`] = h
    })
    for (const r of nestedRef.current) {
      const h = r.el.offsetHeight
      if (h > 0) next[`n:${r.id}`] = h
    }
    setLiveH((prev) => (heightsEqual(prev, next) ? prev : next))
  }, [])
  useEffect(() => {
    if (tooSmall || mobileActive) return // A4: mät inte desktop-höjder ur mobil-layouten
    const id = requestAnimationFrame(measureLive)
    return () => cancelAnimationFrame(id)
  }, [areas, nested, topH, tooSmall, mobileActive, measureLive])
  // A4: efter växel tillbaka till desktop – vänta ut bredd-transitionen och mät om.
  useEffect(() => {
    if (tooSmall || mobileActive) return
    const t = setTimeout(measureLive, 380)
    return () => clearTimeout(t)
  }, [mobileActive, tooSmall, measureLive])

  // ── Historik (sido-effektfria setters – se not ovan) ──
  const undo = useCallback(() => {
    const p = past.current.pop()
    if (!p) return
    future.current.push(snap())
    applySnap(p); bump()
  }, [bump, snap, applySnap])
  const redo = useCallback(() => {
    const f = future.current.pop()
    if (!f) return
    past.current.push(snap())
    applySnap(f); bump()
  }, [bump, snap, applySnap])

  /** Committa en ny modell + valfri toast med inline-ångra. Ren: pushar historik
   *  utanför updatern (StrictMode-säkert), synkar areasRef direkt. */
  const commitAreas = useCallback((next: GridArea[], msg?: string) => {
    const normalized = normalizeRows(next)
    past.current.push(snap()); future.current = []
    areasRef.current = normalized
    setAreas(normalized); bump()
    if (msg) flash(msg, undo)
  }, [bump, flash, undo, snap])

  // ── B5: DELAD zoom – wireframen zoomar om sin panels mitt (fast punkt) och
  // vänster sida följer via transform-skala + scroll som håller dokument-
  // positionen i SIN panels mitt. En zoom-stat → alltid identisk nivå.
  const applyZoom = useCallback((next: number) => {
    const z0 = zoomRef.current
    const z1 = clampZoom(next)
    if (z1 === z0) return
    const vp = wfViewport.current?.getBoundingClientRect()
    const np = zoomAtPoint(panRef.current, z0, z1, (vp?.width ?? 600) / 2, (vp?.height ?? 400) / 2)
    zoomRef.current = z1
    panRef.current = np
    setZoom(z1)
    setPan(np)
    const root = pageRoot.current
    const stageH = stageRef.current?.getBoundingClientRect().height
    if (root && stageH) root.scrollTop = pageZoomScroll(root.scrollTop, stageH, z0, z1)
  }, [])

  // Ctrl+scroll (och pinch-trackpad → ctrlKey-wheel) zoomar båda vyerna. Capture
  // + preventDefault stoppar webbläsarens egen sid-zoom i Design mode.
  useEffect(() => {
    if (tooSmall) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      applyZoom(zoomRef.current * wheelZoomFactor(e.deltaY))
    }
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => window.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions)
  }, [tooSmall, applyZoom])

  // ── B6: Avsluta → spara-dialog om modellen har osparade ändringar ──
  const requestExit = useCallback(() => {
    if (layoutSignature(snap()) !== savedSig.current) { setExitAsk(true); return }
    onExit()
  }, [onExit, snap])

  // ── Tangentbord: undo/redo + zoom + space-pan ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // B6: medan spara-dialogen är öppen gäller bara Escape (= Avbryt).
      if (exitAskRef.current) {
        if (e.key === 'Escape') { e.preventDefault(); setExitAsk(false) }
        return
      }
      if (e.code === 'Space' && !isTyping(e)) { setSpaceDown(true) }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); e.shiftKey ? redo() : undo()
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); applyZoom(zoomRef.current + 0.15) }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); applyZoom(zoomRef.current - 0.15) }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); zoomRef.current = 1; panRef.current = { x: 0, y: 0 }; setZoom(1); setPan({ x: 0, y: 0 }) }
      if (e.key === 'Escape') requestExit()
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceDown(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [undo, redo, requestExit, applyZoom])

  // ── Wireframe: klient→canvas-koordinater (kompenserar zoom/pan) ──
  const clientToCanvas = useCallback((cx: number, cy: number) => {
    const rect = wfViewport.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (cx - rect.left - pan.x) / zoom - WF_PAD, y: (cy - rect.top - pan.y) / zoom - WF_PAD }
  }, [pan, zoom])

  // ── Panorera (space-dra eller mellanmus) på canvasens tomma yta ──
  // B4: vänster sida följer med – samma dokument-position, mappad via wf-skalan
  // k och zoomen (inte rå pixel-delta). Ren mappning i lib/design/viewSync.ts.
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (!(spaceDown || e.button === 1)) return
    e.preventDefault()
    setPanning(true)
    const start = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    const root = pageRoot.current
    const scroll0 = root?.scrollTop ?? 0
    const k = wfRef.current.k
    const z = zoomRef.current
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - start.y
      setPan({ x: start.px + (ev.clientX - start.x), y: start.py + dy })
      if (root && realVisible) root.scrollTop = scroll0 + docDeltaFromWfPan(dy, z, k)
    }
    const up = () => { setPanning(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // ── B4: space-pan på VÄNSTER sida (riktiga sidan) – wireframen följer med ──
  // Ett osynligt grab-lager över device-fönstret fångar draget när space hålls;
  // sidan scrollas i dokument-px och wireframens pan mappas via k · zoom. Det
  // FAKTISKT applicerade scroll-deltat används → klampning vid dokumentets
  // ändar stoppar båda vyerna samtidigt.
  const startPagePan = (e: React.PointerEvent) => {
    e.preventDefault()
    const root = pageRoot.current
    if (!root) return
    setPanning(true)
    const startY = e.clientY
    const scroll0 = root.scrollTop
    const pan0 = panRef.current
    const z = zoomRef.current
    const k = wfRef.current.k
    const move = (ev: PointerEvent) => {
      root.scrollTop = scroll0 + docDeltaFromPagePan(ev.clientY - startY, z)
      const dDoc = root.scrollTop - scroll0
      setPan({ x: pan0.x, y: pan0.y + wfPanFromDocDelta(dDoc, z, k) })
    }
    const up = () => { setPanning(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // ── B3: dra avdelaren – panelerna följer live, snap vid EXAKT 50/50 ──
  const startSplitDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    splitDragRef.current = true
    setSplitDrag({ snapped: false })
    const move = (ev: PointerEvent) => {
      const { rightW, snapped } = resolveSplit(ev.clientX, window.innerWidth)
      const frac = rightW / window.innerWidth
      splitFracRef.current = frac
      setSplitFrac(frac)
      setSplitDrag({ snapped })
    }
    const up = () => {
      splitDragRef.current = false
      setSplitDrag(null)
      if (splitFracRef.current != null) persistSplitFrac(splitFracRef.current)
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // ── Dra ett område (flytt/resize) i wireframen med grid-snap ──
  // B2: flytt = INFOGA, aldrig ovanpå. Under draget visas en infognings-
  // indikator (mål-rad eller "mellan rader"); släppet löser hela layouten
  // konfliktfritt (grannar knuffas i sidled/nedåt) och committas som EN
  // historikpost. Resize live-previewar spannet och reflowar vid släpp.
  const startAreaDrag = (e: React.PointerEvent, area: GridArea, kind: 'move' | 'resize') => {
    if (spaceDown) return
    if (mirror) { e.preventDefault(); flash(MIRROR_MSG); return }
    // ⇧-klick = multi-select för align/distribute (dra INTE).
    if (e.shiftKey && kind === 'move') { e.preventDefault(); e.stopPropagation(); toggleSel(area.key); return }
    e.preventDefault(); e.stopPropagation()
    const startArea = { ...area }
    const startSnap = snap()                          // pre-drag → historik-post vid commit
    let resolved: GridArea[] | null = null            // konfliktfritt slutläge (för commit)
    const start = clientToCanvas(e.clientX, e.clientY)
    setDrag({ key: area.key, kind, area: startArea, x: start.x, y: start.y, target: null, pushes: 0 })
    const move = (ev: PointerEvent) => {
      const p = clientToCanvas(ev.clientX, ev.clientY)
      const dCols = Math.round((p.x - start.x) / cellW)
      if (kind === 'move') {
        const { colStart, span } = clampPlacement(startArea.colStart + dCols, startArea.span, cols.current)
        // Mål-rad ur pekarens y: en befintlig rad (infoga/knuffa) ELLER halvtal
        // (egen ny rad mellan raderna). Variabla radhöjder via wf.rowBox.
        const bands: RowBand[] = Array.from(wfRef.current.rowBox.entries()).map(([row, b]) => ({ row, top: b.top, h: b.h }))
        const row = insertionRow(p.y, bands)
        resolved = resolveDrop(startSnap.areas, area.key, { row, colStart }, cols.current)
        const pushes = countChanged(resolved, startSnap.areas, area.key)
        setDrag({ key: area.key, kind, area: { ...startArea, colStart, span }, x: p.x, y: p.y, target: { row, colStart, span }, pushes })
      } else {
        const { colStart, span } = clampPlacement(startArea.colStart, startArea.span + dCols, cols.current)
        resolved = resolveSpan(startSnap.areas, area.key, span, cols.current)
        setDrag({ key: area.key, kind, area: { ...startArea, colStart, span }, x: p.x, y: p.y, target: null, pushes: 0 })
        // Live-preview av spannet på riktiga sidan (självt – reflow sker vid släpp).
        setAreas((prev) => prev.map((a) => (a.key === area.key ? { ...a, colStart, span } : a)))
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setDrag(null)
      if (!resolved || sameLayout(resolved, startSnap.areas)) { applySnap(startSnap); return }
      // Historik: pre-drag-snapshotet → hela knuff-resultatet ångras i ETT steg.
      past.current.push(startSnap); future.current = []
      areasRef.current = resolved
      setAreas(resolved); bump()
      const d = resolved.find((a) => a.key === area.key)!
      const pushed = countChanged(resolved, startSnap.areas, area.key)
      flash(`${startArea.label}: rad ${d.row} · kol ${d.colStart}–${colEnd(d)}${pushedNote(pushed)}`, undo)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // ── A1/B2: dra en NÄSTLAD region (flytt/resize) inom sin förälder ──
  // Samma raster-mekanik som v1 (riktiga grid-spår eller virtuellt 12-raster),
  // men B2: flytt = infoga (även VERTIKALT mellan förälderns rader) med ghost-
  // indikator under draget; släppet committar det konfliktfria resultatet som
  // EN historikpost. Dokumentflödes-syskon ordnas om i riktiga DOM:en (3b).
  const [nestedDrag, setNestedDrag] = useState<null | {
    id: string; pkey: string
    target: { row: number; colStart: number; span: number }
  }>(null)
  const startNestedDrag = (e: React.PointerEvent, r: RegionVM, kind: 'move' | 'resize', cellPx: number) => {
    if (spaceDown) return
    if (mirror) { e.preventDefault(); flash(MIRROR_MSG); return }
    e.preventDefault(); e.stopPropagation()
    const startSnap = snap()
    const start = clientToCanvas(e.clientX, e.clientY)
    const startPl = { colStart: r.colStart, span: r.span, row: r.row }
    const items = nestedRef.current
      .filter((n) => n.topId === r.topId && n.parentId === r.parentId)
      .map((n) => ({ key: n.id, colStart: n.colStart, span: n.span, row: n.row }))
    // Förälderns radband (relativt förälderns topp – samma rum som pekar-deltat).
    const st = wfRef.current.stackFor(r.topId, r.parentId)
    const bands: RowBand[] = Array.from(st.rowTop.entries()).map(([row, top]) => ({ row, top, h: st.rowH.get(row) ?? MIN_REGION_WF }))
    const selfMid = (st.rowTop.get(r.row) ?? 0) + wfRef.current.regionH(r) / 2
    const pkey = `${r.topId}:${r.parentId ?? ''}`
    let resolved: Array<{ key: string; colStart: number; span: number; row: number }> | null = null
    setNestedDrag({ id: r.id, pkey, target: { ...startPl } })
    const move = (ev: PointerEvent) => {
      const p = clientToCanvas(ev.clientX, ev.clientY)
      const dCols = Math.round((p.x - start.x) / Math.max(4, cellPx))
      if (kind === 'move') {
        const { colStart, span } = clampPlacement(startPl.colStart + dCols, startPl.span, r.cols)
        const row = insertionRow(selfMid + (p.y - start.y), bands)
        resolved = resolveDrop(items, r.id, { row, colStart }, r.cols)
        setNestedDrag({ id: r.id, pkey, target: { row, colStart, span } })
      } else {
        const { colStart, span } = clampPlacement(startPl.colStart, startPl.span + dCols, r.cols)
        resolved = resolveSpan(items, r.id, span, r.cols)
        setNestedDrag({ id: r.id, pkey, target: { row: startPl.row, colStart, span } })
        // Live-preview av spannet (självt – reflow sker vid släpp).
        const updated = nestedRef.current.map((n) => (n.id === r.id ? { ...n, colStart, span } : n))
        nestedRef.current = updated
        setNested(updated)
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setNestedDrag(null)
      if (!resolved || sameLayout(resolved, items)) { applySnap(startSnap); return }
      const byId = new Map(resolved.map((i) => [i.key, i]))
      const updated = nestedRef.current.map((n) => {
        const pl = byId.get(n.id)
        return pl && (pl.colStart !== n.colStart || pl.span !== n.span || pl.row !== n.row)
          ? { ...n, colStart: pl.colStart, span: pl.span, row: pl.row }
          : n
      })
      past.current.push(startSnap); future.current = []
      nestedRef.current = updated
      setNested(updated); bump()
      const d = byId.get(r.id)!
      const pushed = resolved.filter((i) => {
        if (i.key === r.id) return false
        const o = items.find((x) => x.key === i.key)!
        return o.colStart !== i.colStart || o.row !== i.row
      }).length
      flash(`${r.label}: rad ${d.row} · kol ${d.colStart}–${d.colStart + d.span - 1} av ${r.cols}${pushedNote(pushed)}`, undo)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // ── A2: dra HÖJD (underkanten) på block/regioner med FAST höjd, granne-snap ──
  // Snap-kandidater = vänster/höger grannar på samma visuella rad: deras verkliga
  // underkanter (px). Live-applicering via effekt (3)/(3b); historik som v1-drag.
  const [hDrag, setHDrag] = useState<null | { id: string; top: boolean; label: string; hpx: number; snap: { id: string; label: string } | null }>(null)
  const startHeightDrag = (e: React.PointerEvent, t: { top?: GridArea; nested?: RegionVM }) => {
    if (spaceDown) return
    if (mirror) { e.preventDefault(); flash(MIRROR_MSG); return }
    e.preventDefault(); e.stopPropagation()
    const kScale = wfScale(realW.current, cols.current * cellW)
    const startSnap = snap()
    const y0 = e.clientY
    let id: string, isTop: boolean, label: string, selfEl: HTMLElement, startH: number
    const cands: SnapCandidate[] = []
    if (t.top) {
      const a = t.top
      const ref = realRefs.current[Number(a.key)]
      const info = topHRef.current[a.key]
      if (!ref || !info) return
      id = a.key; isTop = true; label = a.label; selfEl = ref.el; startH = info.hpx
      for (const o of areasRef.current) {
        if (o.key === a.key || o.hidden || o.row !== a.row) continue
        const oel = realRefs.current[Number(o.key)]?.el
        if (!oel) continue
        const rb = oel.getBoundingClientRect()
        if (rb.height > 0) cands.push({ id: o.key, label: o.label, bottom: rb.bottom })
      }
    } else if (t.nested) {
      const r = t.nested
      id = r.id; isTop = false; label = r.label; selfEl = r.el; startH = r.hpx
      for (const n of nestedRef.current) {
        if (n.id === r.id || n.topId !== r.topId || n.parentId !== r.parentId || n.row !== r.row) continue
        const rb = n.el.getBoundingClientRect()
        if (rb.height > 0) cands.push({ id: n.id, label: n.label, bottom: rb.bottom })
      }
    } else return
    // B5: sidan kan vara transform-skalad (delad zoom) → normalisera kandidat-
    // underkanterna till VERKLIGA px relativt egen topp innan snap-jämförelsen.
    const pz = zoomRef.current
    const selfTop = selfEl.getBoundingClientRect().top
    const candsReal = cands.map((c) => ({ ...c, bottom: (c.bottom - selfTop) / Math.max(0.01, pz) }))
    const tolReal = SNAP_TOL_WF / Math.max(0.01, kScale)
    let lastH = startH
    let lastSnap: SnapCandidate | null = null
    setHDrag({ id, top: isTop, label, hpx: startH, snap: null })
    const move = (ev: PointerEvent) => {
      const dReal = (ev.clientY - y0) / zoom / Math.max(0.01, kScale)
      const proposed = clampDragH(startH + dReal)
      const { h, snapped } = snapHeight(0, proposed, candsReal, tolReal)
      lastH = h; lastSnap = snapped
      if (isTop) {
        const cur = topHRef.current
        const nextT = { ...cur, [id]: { ...cur[id], hpx: h } }
        topHRef.current = nextT
        setTopH(nextT)
      } else {
        const updated = nestedRef.current.map((n) => (n.id === id ? { ...n, hpx: h } : n))
        nestedRef.current = updated
        setNested(updated)
      }
      setHDrag({ id, top: isTop, label, hpx: h, snap: snapped ? { id: snapped.id, label: snapped.label } : null })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setHDrag(null)
      if (Math.abs(lastH - startH) < 0.5) { applySnap(startSnap); return }
      past.current.push(startSnap); future.current = []
      bump()
      flash(`${label}: höjd ${Math.round(lastH)} px${lastSnap ? ` · snappade mot ${lastSnap.label}s underkant` : ''}`, undo)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  /** Markera en nästlad region → egenskaps-panelen (via drill-mekaniken, Post 5). */
  const selectNested = (r: RegionVM) => {
    setSelKey(null)
    setDrillEl((prev) => (prev === r.innerEl ? null : r.innerEl))
  }

  const deleteArea = (area: GridArea) => {
    if (mirror) { flash(MIRROR_MSG); return }
    commitAreas(areasRef.current.map((a) => (a.key === area.key ? { ...a, hidden: true } : a)), `${area.label} dolt`)
  }
  const restoreHidden = () => {
    if (mirror) { flash(MIRROR_MSG); return }
    commitAreas(areasRef.current.map((a) => ({ ...a, hidden: false })), 'Alla områden återställda')
  }

  const rebuildFromGeometry = useCallback(() => {
    const container = gridEl.current
    if (!container) return
    const nCols = cols.current
    const cs = getComputedStyle(container)
    const gap = parseFloat(cs.columnGap || cs.gap || '0') || 0
    const padLeft = parseFloat(cs.paddingLeft || '0') || 0
    const padRight = parseFloat(cs.paddingRight || '0') || 0
    const cRect = container.getBoundingClientRect()
    const inner = cRect.width - padLeft - padRight
    const trackW = (inner - (nCols - 1) * gap) / nCols
    const geom: GridGeom = { cols: nCols, trackW, gap, originX: cRect.left + padLeft, padLeft, padRight }
    setGeom(geom)
    const raw = realRefs.current.map((ref, i) => {
      const r = ref.el.getBoundingClientRect()
      const { colStart, span } = placementFromGeometry(r.left, r.width, geom)
      return { key: String(i), label: pickLabel(ref.el, i), colStart, span, row: 1, top: r.top }
    })
    return normalizeRows(assignRowsByTop(raw))
  }, [])

  const resetLayout = () => {
    if (mirror) { flash(MIRROR_MSG); return }
    const s = snap()
    // Rensa alla inline-overrides → läs om den ursprungliga (Tailwind-)layouten ur geometrin.
    for (const r of realRefs.current) { r.el.style.gridColumn = r.orig.gridColumn; r.el.style.gridRow = r.orig.gridRow; r.el.style.display = r.orig.display; r.el.style.height = r.orig.height }
    restoreFlowDom(nestedRef.current) // B2: dokumentflödes-ankarna till init-positionerna
    for (const r of nestedRef.current) restoreNested(r)
    const rebuilt = rebuildFromGeometry()
    if (!rebuilt) return
    past.current.push(s); future.current = []
    areasRef.current = rebuilt
    setAreas(rebuilt)
    // Nästlade regioner tillbaka till sina ursprungliga placeringar/höjder (A1/A2/B2).
    const rn = nestedRef.current.map((r) => (r.colStart !== r.orig.colStart || r.span !== r.orig.span || r.row !== r.orig.row || r.hpx !== r.origH)
      ? { ...r, colStart: r.orig.colStart, span: r.orig.span, row: r.orig.row, hpx: r.origH }
      : r)
    nestedRef.current = rn
    setNested(rn)
    // Topp-höjder tillbaka (A2).
    const th = Object.fromEntries(Object.entries(topHRef.current).map(([k, t]) => [k, t.hpx !== t.origPx ? { ...t, hpx: t.origPx } : t]))
    topHRef.current = th
    setTopH(th)
    bump()
    flash('Layout nollställd', undo)
  }

  // ── Spara layout-intent → design-notes (samma väg som shellens övriga sparningar) ──
  // B6: payloaden bär nu ALLT som kan ändras i Design mode – topp-areor som förut
  // PLUS nästlade placeringar/höjder (rad+kolumn bär även DOM-omordningar) och
  // dragna topp-höjder, som deltan mot init. Ren byggare i lib/design/savePayload.
  const [saving, setSaving] = useState(false)
  const topLabelOf = (topId: string): string =>
    areasRef.current.find((a) => a.key === topId)?.label ?? bands.find((b) => b.id === topId)?.label ?? topId
  const saveLayout = async (): Promise<boolean> => {
    setSaving(true)
    const page = location.pathname + location.search
    persistLayout(page, areasRef.current)
    const payload = buildLayoutPayload({
      page,
      theme: document.documentElement.dataset.theme || 'standard',
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
      cols: cols.current,
      gapVar: GRID.gapVar,
      areas: areasRef.current,
      nested: nestedRef.current.map((r) => ({
        id: r.id, label: r.label, top: topLabelOf(r.topId), mech: r.mech, cols: r.cols,
        colStart: r.colStart, span: r.span, row: r.row, hpx: r.hpx,
        orig: { colStart: r.orig.colStart, span: r.orig.span, row: r.orig.row, hpx: r.origH },
      })),
      tops: Object.entries(topHRef.current).map(([key, t]) => ({
        key, label: areasRef.current.find((a) => a.key === key)?.label ?? `Område ${key}`, hpx: t.hpx, origPx: t.origPx,
      })),
    })
    const res = await saveDesignNote(payload)
    setSaving(false)
    if (res.ok) savedSig.current = layoutSignature(snap()) // B6: nu är läget "sparat"
    flash(res.ok ? 'Layout-förslag sparat → design-notes' : 'Kunde inte spara layouten')
    return res.ok
  }

  // ── Layout-verktyg: align / distribute / komponent-ins (Post 6) ──
  const doAlign = useCallback((edge: AlignEdge) => {
    if (mirror) { flash(MIRROR_MSG); return }
    if (selSet.size < 2) { flash('Välj minst 2 block (⇧-klick) att justera'); return }
    const labels: Record<AlignEdge, string> = { left: 'vänster', center: 'centrerade', right: 'höger', top: 'topp', middle: 'mitten', bottom: 'botten' }
    commitAreas(alignAreas(areasRef.current, selSet, edge, cols.current), `${selSet.size} block ${labels[edge]}-justerade`)
  }, [selSet, commitAreas, flash, mirror])
  const doDistribute = useCallback((mode: DistributeMode) => {
    if (mirror) { flash(MIRROR_MSG); return }
    if (selSet.size < 3) { flash('Välj minst 3 block (⇧-klick) att fördela'); return }
    commitAreas(distributeAreas(areasRef.current, selSet, mode, cols.current), mode === 'gaps' ? `${selSet.size} block · lika mellanrum` : `${selSet.size} block · lika bredd`)
  }, [selSet, commitAreas, flash, mirror])
  const doInsert = useCallback(() => {
    if (mirror) { flash(MIRROR_MSG); return }
    const { areas: next, key } = insertPlaceholder(areasRef.current, cols.current)
    commitAreas(next, 'Platshållar-block infogat')
    setSelSet(new Set([key]))
  }, [commitAreas, mirror, flash])

  const overlaps = useMemo(() => overlappingKeys(vAreas), [vAreas])
  // Mät-overlay: mellanrum (px + närmaste token) mellan intilliggande block per rad;
  // om ≥2 valda → bara mellan de valda. Rent uträknat i lib/design/layoutTools.
  // (Avstängd i mobil-spegeln – geometrin där är mobilens, inte desktop-gridets.)
  const measures = useMemo(
    () => (measure && geom && !mirror ? measureGaps(areas, geom, selSet.size >= 2 ? selSet : undefined) : []),
    [measure, geom, areas, selSet, mirror],
  )
  const canUndo = past.current.length > 0
  const canRedo = future.current.length > 0

  // ── A1/A2: wireframe-layout = SKALENLIG spegel av riktiga sidan ──
  // Varje block/region renderas med samma höjd/bredd-förhållande som dess
  // verkliga bounding-box (skalfaktor k = wf-px per verklig px). Auto-höjder
  // följer live-ommätningen; fasta höjder följer modellen (dra-höjd). Band
  // (toppbar/hero/sidfot) staplas före/efter grid-raderna.
  const byParent = useMemo(() => {
    const m = new Map<string, RegionVM[]>()
    for (const r of vNested) {
      const k = `${r.topId}:${r.parentId ?? ''}`
      const g = m.get(k) ?? []
      g.push(r)
      m.set(k, g)
    }
    return m
  }, [vNested])

  const wf = useMemo(() => {
    const k = wfScale(mirrorWf ? mirrorWf.realW : realW.current, cols.current * cellW)
    const childrenOf = (topId: string, parentId: string | null) => byParent.get(`${topId}:${parentId ?? ''}`) ?? []
    // Verklig AKTUELL höjd (px): fast → modellens hpx; auto → live-ommätt.
    // A4-spegeln: baked mobil-höjder (skrivskyddad → aldrig live-ommätning).
    const nestHOf = (r: RegionVM): number => (mirror ? r.hpx : r.fixedH ? r.hpx : liveH[`n:${r.id}`] ?? r.hpx)
    const topHOf = (key: string): number | null => {
      const t = vTopH[key]
      if (!t) return null
      if (mirror) return t.origPx
      return t.fixed ? t.hpx : liveH[`t:${key}`] ?? t.origPx
    }
    function regionH(r: RegionVM): number {
      const own = Math.max(MIN_REGION_WF, nestHOf(r) * k)
      const kids = childrenOf(r.topId, r.id)
      if (!kids.length) return own
      // Fallback: har ett barn vuxit förbi förälderns (ännu ej ommätta) höjd
      // syns det direkt – annars vinner förälderns verkliga skalade höjd.
      return Math.max(own, stackFor(r.topId, r.id).bottom + NEST_PAD)
    }
    /** Radpackning för en förälders barn – verklig skalad geometri (heightModel). */
    function stackFor(topId: string, parentId: string | null): RowStack {
      return stackRows(
        childrenOf(topId, parentId).map((c): StackChild => ({ id: c.id, row: c.row, relY: c.relY, origH: c.origH, hWf: regionH(c) })),
        k,
      )
    }
    const blockH = (topId: string): number => {
      const hReal = topHOf(topId)
      const own = Math.max(MIN_BLOCK_WF, hReal != null ? hReal * k : ROW_H)
      const kids = childrenOf(topId, null)
      if (!kids.length) return own
      return Math.max(own, stackFor(topId, null).bottom + NEST_PAD)
    }
    const bandH = (b: WfBand): number => {
      const own = Math.max(b.locked ? 14 : MIN_BLOCK_WF, b.hpx * k)
      if (b.locked) return own
      const kids = childrenOf(b.id, null)
      if (!kids.length) return own
      return Math.max(own, stackFor(b.id, null).bottom + NEST_PAD)
    }
    // Vertikal packning: band ovanför → grid-rader → band nedanför.
    let y = 0
    const bandBoxes: Array<{ band: WfBand; y: number; h: number }> = []
    for (const b of vBands.filter((x) => x.above)) { const h = bandH(b); bandBoxes.push({ band: b, y, h }); y += h + ROW_GAP }
    const visible = vAreas.filter((a) => !a.hidden)
    const rowIds = Array.from(new Set(visible.map((a) => a.row))).sort((a, b) => a - b)
    const rowBox = new Map<number, { top: number; h: number }>()
    for (const rid of rowIds) {
      const h = Math.max(ROW_H, ...visible.filter((a) => a.row === rid).map((a) => blockH(a.key)))
      rowBox.set(rid, { top: y, h })
      y += h + ROW_GAP
    }
    const gridBottom = y
    for (const b of vBands.filter((x) => !x.above)) { const h = bandH(b); bandBoxes.push({ band: b, y, h }); y += h + ROW_GAP }
    return { k, bandBoxes, rowBox, totalH: y, gridBottom, blockH, regionH, childrenOf, stackFor }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vAreas, vBands, byParent, vTopH, liveH, cellW, mirror])
  const wfRef = useRef(wf)
  useEffect(() => { wfRef.current = wf }, [wf])

  // ── A1/A2: rekursiv rendering av nästlade regioner inne i ett block ──
  // Koordinaterna är RELATIVA förälder-blockets div. x/bredd härleds ur den
  // LOKALA kolumnplaceringen (som v1); y/höjd är SKALENLIGA mot verkliga sidan
  // (radpackning med verklig geometri via heightModel.stackRows). Etikettremsan
  // är overlay och tar ingen layoutplats.
  const renderNested = (topId: string, parentId: string | null, w: number, x0: number, y0: number): React.ReactNode => {
    const kids = wf.childrenOf(topId, parentId)
    if (kids.length === 0) return null
    const st = wf.stackFor(topId, parentId)
    const dragKid = hDrag && !hDrag.top ? kids.find((c) => c.id === hDrag.id) : undefined
    return (
      <>
        {kids.map((r) => {
          const cellPx = (w * r.sfw) / r.cols
          const x = x0 + w * r.sfx + (r.colStart - 1) * cellPx
          const bw = Math.max(12, cellPx * r.span - 3)
          const y = y0 + (st.rowTop.get(r.row) ?? 0)
          const h = wf.regionH(r)
          const isDrag = nestedDrag?.id === r.id || (hDrag != null && !hDrag.top && hDrag.id === r.id)
          const isSel = drillEl === r.innerEl
          const hasKids = wf.childrenOf(topId, r.id).length > 0
          const mechLabel = r.mech === 'grid' ? 'grid' : r.mech === 'flex' ? 'flex' : 'flöde'
          const slim = !hasKids && h < 18 // för låg för topp-remsa → centrera etiketten
          return (
            <div
              key={r.id}
              onPointerDown={(e) => startNestedDrag(e, r, 'move', cellPx)}
              title={`${r.label} · kol ${r.colStart}–${r.colStart + r.span - 1} av ${r.cols} · ${mechLabel}${r.kind === 'slot' ? ' · yta' : ''}${r.fixedH ? ' · fast höjd – dra underkanten' : ' · auto-höjd (innehållsstyrd)'}`}
              style={{
                position: 'absolute', left: x, top: y, width: bw, height: h,
                background: isDrag ? 'var(--dt-accent-weak)' : r.kind === 'slot' ? 'var(--dt-surface-2)' : 'var(--dt-surface)',
                border: `1px ${r.kind === 'slot' ? 'dashed' : 'solid'} ${isSel ? 'var(--dt-accent)' : isDrag ? 'var(--dt-border-strong)' : 'var(--dt-border)'}`,
                outline: isSel ? '1.5px solid var(--dt-accent)' : 'none', outlineOffset: 1,
                borderRadius: 'var(--dt-radius-sm)', cursor: spaceDown ? 'grab' : 'move', userSelect: 'none',
                transition: (reduced || isDrag) ? 'none' : 'left 160ms cubic-bezier(0.22,1,0.36,1), width 160ms cubic-bezier(0.22,1,0.36,1), top 160ms cubic-bezier(0.22,1,0.36,1), height 160ms cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <span style={{ position: 'absolute', left: 4, right: 14, top: 0, height: slim ? '100%' : NEST_HEAD, display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none', zIndex: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--dt-text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{r.label}</span>
                {!r.fixedH && <span style={{ flex: 'none', fontSize: 8, fontStyle: 'italic', lineHeight: '10px', color: 'var(--dt-text-mute)', border: '1px solid var(--dt-border)', borderRadius: 3, padding: '0 3px' }}>auto</span>}
              </span>
              <button type="button" aria-label={`Egenskaper för ${r.label}`} title="Egenskaper (färg/token)" onPointerDown={(e) => { e.stopPropagation(); selectNested(r) }} style={{ position: 'absolute', right: 1, top: 1, background: 'none', border: 'none', color: isSel ? 'var(--dt-accent)' : 'var(--dt-text-mute)', cursor: 'pointer', fontSize: 10, lineHeight: 1, padding: 1, zIndex: 3 }}>◧</button>
              {/* Resize-handtag (bredd, höger kant) */}
              <span onPointerDown={(e) => startNestedDrag(e, r, 'resize', cellPx)} style={{ position: 'absolute', right: -2, top: 0, bottom: 0, width: 6, cursor: 'ew-resize', zIndex: 3 }} />
              {/* A2: höjd-handtag (underkant) – bara FAST höjd är dragbar */}
              {r.fixedH && (
                <span
                  onPointerDown={(e) => startHeightDrag(e, { nested: r })}
                  title="Dra för att ändra höjd (snappar mot grannens underkant)"
                  style={{ position: 'absolute', left: 0, right: 0, bottom: -2, height: 6, cursor: 'ns-resize', zIndex: 3 }}
                />
              )}
              {hasKids && renderNested(topId, r.id, bw - 4, 2, 0)}
            </div>
          )
        })}
        {/* B2: infognings-indikator under pågående nästlad flytt/resize – visar
            var regionen LANDAR (rad eller "mellan rader" = insertion-linje). */}
        {nestedDrag && nestedDrag.pkey === `${topId}:${parentId ?? ''}` && (() => {
          const g = nestedDrag.target
          const dragged = kids.find((c) => c.id === nestedDrag.id)
          if (!dragged) return null
          const cellPx = (w * dragged.sfw) / dragged.cols
          const gx = x0 + w * dragged.sfx + (g.colStart - 1) * cellPx
          const gw = Math.max(10, cellPx * g.span - 3)
          const frac = !Number.isInteger(g.row)
          const rowsSorted = Array.from(st.rowTop.keys()).sort((a, b) => a - b)
          let gy: number
          let gh: number
          if (!frac && st.rowTop.has(g.row)) {
            gy = y0 + (st.rowTop.get(g.row) ?? 0)
            gh = st.rowH.get(g.row) ?? wf.regionH(dragged)
          } else {
            const below = rowsSorted.find((rr) => rr > g.row)
            gy = y0 + (below != null ? (st.rowTop.get(below) ?? 0) - 3 : st.bottom + 2)
            gh = Math.min(wf.regionH(dragged), 28)
          }
          return (
            <>
              {frac && <div aria-hidden style={{ position: 'absolute', left: x0, width: w, top: gy, height: 0, borderTop: '2px solid var(--dt-accent)', pointerEvents: 'none', zIndex: 5 }} />}
              <div aria-hidden style={{ position: 'absolute', left: gx, top: gy + (frac ? 3 : 0), width: gw, height: gh, background: 'var(--dt-accent-weak)', border: '1.5px dashed var(--dt-accent)', borderRadius: 'var(--dt-radius-sm)', pointerEvents: 'none', zIndex: 5 }} />
            </>
          )
        })()}
        {/* A2: snap-linje + live-värde under pågående höjd-drag i den här föräldern */}
        {dragKid && (() => {
          const cellPx = (w * dragKid.sfw) / dragKid.cols
          const x = x0 + w * dragKid.sfx + (dragKid.colStart - 1) * cellPx
          const y = y0 + (st.rowTop.get(dragKid.row) ?? 0) + wf.regionH(dragKid)
          return (
            <div aria-hidden style={{ position: 'absolute', left: x0, width: w, top: y, height: 0, borderTop: `1.5px ${hDrag!.snap ? 'solid' : 'dashed'} var(--dt-accent)`, pointerEvents: 'none', zIndex: 4 }}>
              <span style={{ position: 'absolute', top: 2, left: Math.max(0, x - x0), fontSize: 9, fontWeight: 700, fontFamily: 'var(--dt-font-mono)', color: 'var(--dt-accent-contrast)', background: 'var(--dt-accent)', padding: '1px 5px', borderRadius: 'var(--dt-radius-sm)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(hDrag!.hpx)} px{hDrag!.snap ? ` ↦ ${hDrag!.snap.label}` : ''}
              </span>
            </div>
          )
        })()}
      </>
    )
  }

  // ── Notis på för små skärmar (desktop-only) ──
  if (tooSmall) {
    return (
      <div role="dialog" aria-label="Design mode" style={fullOverlay(reduced)}>
        <div style={{ margin: 'auto', maxWidth: 340, textAlign: 'center', padding: 'var(--dt-space-5)' }}>
          <div aria-hidden style={{ fontSize: 44, marginBottom: 'var(--dt-space-3)' }}>🖥</div>
          <h2 style={{ fontSize: 'var(--dt-text-lg)', fontWeight: 700, marginBottom: 'var(--dt-space-2)' }}>Design mode är desktop-only</h2>
          <p style={{ fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text-dim)', lineHeight: 1.55, marginBottom: 'var(--dt-space-4)' }}>
            Arbetsytan behöver en bredare skärm (minst {DESKTOP_MIN}px) för att visa den riktiga sidan bredvid wireframen. Öppna på en större skärm.
          </p>
          <button type="button" onClick={onExit} style={dtBtn()}>Stäng</button>
        </div>
      </div>
    )
  }

  // B3: avdelarens läge styr panel-fördelningen (null = v1-defaulten). En snappad
  // 50/50 ger exakt lika paneler → vänster sid-skalning och wireframens wf-skala
  // räknas om automatiskt (ResizeObservers på stage + viewport).
  const RIGHT_W = dual
    ? (splitFrac != null ? Math.round(clampSplitFrac(splitFrac, winW) * winW) : Math.max(360, Math.min(560, winW * 0.42)))
    : winW
  const HEAD_H = 52
  const FOOT_H = 34

  return (
    <div role="dialog" aria-label="Design mode" data-dt-designmode style={{ ...fullOverlay(reduced), background: 'transparent', pointerEvents: 'none' }}>
      {/* ── Topp-chrome (opak; täcker toppremsan) ── */}
      <header style={{
        pointerEvents: 'auto', position: 'absolute', top: 0, left: 0, right: 0, height: HEAD_H,
        display: 'flex', alignItems: 'center', gap: 'var(--dt-space-3)', padding: '0 var(--dt-space-4)',
        borderBottom: '1px solid var(--dt-border)', background: 'var(--dt-surface-solid)', color: 'var(--dt-text)',
        fontFamily: 'var(--dt-font)', zIndex: 3,
      }}>
        <span style={{ fontSize: 'var(--dt-text-lg)', fontWeight: 700, letterSpacing: 0.3 }}>Design&nbsp;mode</span>
        <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)' }}>{cols.current}-kol · grid-agnostisk</span>
        <div style={{ flex: 1 }} />

        {/* Desktop/mobil-förhandsvisning av sidan */}
        {realVisible && (
          <div style={seg()}>
            <button type="button" onClick={() => setPreviewMobile(false)} style={segBtn(!previewMobile)}>🖥 Desktop</button>
            <button type="button" onClick={() => setPreviewMobile(true)} style={segBtn(previewMobile)}>📱 Mobil</button>
          </div>
        )}
        {/* Enkel-panel: växla riktig sida ↔ wireframe */}
        {!dual && (
          <button type="button" onClick={() => setShowRealSingle((v) => !v)} style={dtGhostBtn(showRealSingle)}>
            {showRealSingle ? '▦ Visa wireframe' : '🖥 Visa riktig sida'}
          </button>
        )}

        {/* Undo/redo */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={undo} disabled={!canUndo} style={dtGhostBtn(false, !canUndo)} title="Ångra (⌘Z)">↶</button>
          <button type="button" onClick={redo} disabled={!canRedo} style={dtGhostBtn(false, !canRedo)} title="Gör om (⌘⇧Z)">↷</button>
        </div>
        {/* Zoom (B5: delad – båda vyerna zoomar identiskt) */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <button type="button" onClick={() => applyZoom(zoomRef.current - 0.15)} style={dtGhostBtn()} title="Zooma ut (⌘− eller ⌃-scroll)">−</button>
          <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => applyZoom(zoomRef.current + 0.15)} style={dtGhostBtn()} title="Zooma in (⌘+ eller ⌃-scroll)">+</button>
        </div>
        <button type="button" onClick={saveLayout} disabled={saving} style={dtSaveBtn(saving)}>{saving ? 'Sparar…' : '↑ Spara layout'}</button>
        <button type="button" onClick={requestExit} style={dtBtn()}>Avsluta</button>
      </header>

      {/* ── Vänster: device-fönster för den RIKTIGA sidan (transparent hål) ── */}
      {realVisible && (
        <div
          ref={stageRef}
          style={{
            pointerEvents: 'none', position: 'absolute', top: HEAD_H, bottom: FOOT_H,
            left: 0, right: dual ? RIGHT_W : 0, background: 'transparent',
          }}
        >
          <div style={{ position: 'absolute', top: 8, left: 12, fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', fontFamily: 'var(--dt-font)', pointerEvents: 'none' }}>
            Riktig sida · {previewMobile ? `mobil ${MOBILE_W}px · appens egen responsiva layout` : 'desktop · live-omgriddad'} · space-dra panorerar
          </div>
        </div>
      )}

      {/* ── B4: space-pan-lager över vänster sida (synkar wireframen) ── */}
      {realVisible && spaceDown && (
        <div
          onPointerDown={startPagePan}
          title="Panorera (space-dra) – båda vyerna följs åt"
          style={{
            position: 'absolute', top: HEAD_H, bottom: FOOT_H, left: 0, right: dual ? RIGHT_W : 0,
            cursor: panning ? 'grabbing' : 'grab', zIndex: 5, pointerEvents: 'auto',
          }}
        />
      )}

      {/* ── B3: flyttbar lodrät avdelare (snap + chip vid EXAKT 50/50) ── */}
      {dual && (
        <div
          data-dt-divider
          onPointerDown={startSplitDrag}
          title="Dra för att fördela panelerna · snappar vid 50 %"
          style={{
            position: 'absolute', top: HEAD_H, bottom: FOOT_H, left: winW - RIGHT_W - 5, width: 10,
            cursor: 'col-resize', zIndex: 6, pointerEvents: 'auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div aria-hidden style={{
            width: splitDrag ? 3 : 2, height: 44, borderRadius: 'var(--dt-radius-pill)',
            background: splitDrag ? 'var(--dt-accent)' : 'var(--dt-border-strong)',
            boxShadow: splitDrag ? 'var(--dt-glow)' : 'none',
            transition: reduced ? 'none' : 'background var(--dt-dur-fast) var(--dt-spring)',
          }} />
          {splitDrag?.snapped && (
            <span style={{
              position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              fontSize: 'var(--dt-text-xs)', fontWeight: 700, fontFamily: 'var(--dt-font-mono)',
              color: 'var(--dt-accent-contrast)', background: 'var(--dt-accent)',
              padding: '2px 8px', borderRadius: 'var(--dt-radius-pill)', whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>50 %</span>
          )}
        </div>
      )}

      {/* Selektions-outline över det valda riktiga elementet (Post 5) */}
      {realVisible && selRect && (
        <div aria-hidden style={{ position: 'fixed', left: selRect.x - 1, top: selRect.y - 1, width: selRect.w + 2, height: selRect.h + 2, border: '1.5px solid var(--dt-accent)', boxShadow: 'var(--dt-glow)', borderRadius: 4, pointerEvents: 'none', zIndex: 4 }}>
          <span style={{ position: 'absolute', top: -18, left: -1, fontSize: 10, fontWeight: 700, fontFamily: 'var(--dt-font-mono)', color: 'var(--dt-accent-contrast)', background: 'var(--dt-accent)', padding: '1px 6px', borderRadius: 'var(--dt-radius-sm)', whiteSpace: 'nowrap', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{selInfo?.label}</span>
        </div>
      )}

      {/* ── Höger: WIREFRAME-panel ── */}
      <div style={{
        pointerEvents: 'auto', position: 'absolute', top: HEAD_H, bottom: FOOT_H, right: 0,
        width: dual ? RIGHT_W : winW, borderLeft: dual ? '1px solid var(--dt-border)' : 'none',
        background: 'var(--dt-surface-solid)', color: 'var(--dt-text)', fontFamily: 'var(--dt-font)',
        display: (!dual && showRealSingle) ? 'none' : 'flex', flexDirection: 'column', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: 'var(--dt-space-2) var(--dt-space-4)', borderBottom: '1px solid var(--dt-border)', background: 'var(--dt-surface-2)' }}>
          <span style={{ fontSize: 'var(--dt-text-sm)', fontWeight: 600 }}>Wireframe</span>
          <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)' }}>
            {mirror ? 'mobil-spegel (skrivskyddad) · space-dra panorerar' : 'dra · resiza kanten · ✕ raderar · space-dra panorerar'}
          </span>
          <div style={{ flex: 1 }} />
          {!mirror && areas.some((a) => a.hidden) && <button type="button" onClick={restoreHidden} style={{ ...dtGhostBtn(), padding: '2px 8px' }}>Återställ dolda</button>}
          {!mirror && <button type="button" onClick={resetLayout} style={{ ...dtGhostBtn(), padding: '2px 8px' }}>Nollställ</button>}
        </div>

        {/* ── Layout-verktygsrad (Post 6): align · distribute · mät · komponent-ins ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: 'var(--dt-space-2) var(--dt-space-4)', borderBottom: '1px solid var(--dt-border)', background: 'var(--dt-surface-solid)' }}>
          <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', fontVariantNumeric: 'tabular-nums', minWidth: 62 }}>
            {selSet.size > 0 ? `${selSet.size} valda` : 'Layout'}
          </span>
          {/* Justera (kräver ≥2 valda) */}
          <div style={tbGroup()} role="group" aria-label="Justera">
            <button type="button" onClick={() => doAlign('left')} title="Vänsterjustera" aria-label="Vänsterjustera" style={tbBtn()}>⇤</button>
            <button type="button" onClick={() => doAlign('center')} title="Centrera (kolumn)" aria-label="Centrera horisontellt" style={tbBtn()}>⇥⇤</button>
            <button type="button" onClick={() => doAlign('right')} title="Högerjustera" aria-label="Högerjustera" style={tbBtn()}>⇥</button>
            <span style={tbSep()} />
            <button type="button" onClick={() => doAlign('top')} title="Toppjustera (rad)" aria-label="Toppjustera" style={tbBtn()}>⤒</button>
            <button type="button" onClick={() => doAlign('middle')} title="Mittjustera (rad)" aria-label="Mittjustera" style={tbBtn()}>⇕</button>
            <button type="button" onClick={() => doAlign('bottom')} title="Bottenjustera (rad)" aria-label="Bottenjustera" style={tbBtn()}>⤓</button>
          </div>
          {/* Fördela (kräver ≥3 valda) */}
          <div style={tbGroup()} role="group" aria-label="Fördela">
            <button type="button" onClick={() => doDistribute('gaps')} title="Fördela: lika mellanrum" aria-label="Fördela lika mellanrum" style={tbBtn()}>⇹</button>
            <button type="button" onClick={() => doDistribute('spans')} title="Fördela: lika bredd" aria-label="Fördela lika bredd" style={tbBtn()}>▥</button>
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={() => setMeasure((m) => !m)} title="Mät-overlay (gap i px + token)" aria-pressed={measure} style={{ ...tbBtn(measure), width: 'auto', padding: '0 8px' }}>📐 Mät</button>
          <button type="button" onClick={doInsert} title="Infoga platshållar-block (ny sektion)" style={{ ...tbBtn(), width: 'auto', padding: '0 8px' }}>＋ Sektion</button>
          {selSet.size > 0 && <button type="button" onClick={() => setSelSet(new Set())} title="Avmarkera alla" style={{ ...dtGhostBtn(), padding: '2px 8px' }}>Rensa val</button>}
        </div>

        {/* Canvas-viewport (zoom/pan) */}
        <div
          ref={wfViewport}
          onPointerDown={onCanvasPointerDown}
          style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', cursor: spaceDown ? (panning ? 'grabbing' : 'grab') : 'default', background: 'var(--dt-surface)' }}
        >
          <div style={{
            position: 'absolute', top: 0, left: 0, transformOrigin: '0 0',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: reduced ? 'none' : 'transform 120ms cubic-bezier(0.22,1,0.36,1)',
            width: wfW, padding: WF_PAD,
          }}>
            {/* Kolumn-guider (grid-agnostiska: cols.current spår; följer spegelns bredd i mobil).
                B1: gutters + yttermarginaler ritas som BAND (två streck med gutterns verkliga
                bredd emellan, skalenligt ur grid-geometrin) så luften mellan kolumner syns.
                Mobil-spegeln behåller enkla linjer (geometrin där är mobilens, inte desktopens). */}
            {(() => {
              const gridW = cols.current * cellW
              const gutterWf = !mirror && geom ? (geom.gap ?? 0) * wf.k : 0
              const margLWf = !mirror && geom ? (geom.padLeft ?? 0) * wf.k : 0
              const margRWf = !mirror && geom ? (geom.padRight ?? 0) * wf.k : 0
              const band: React.CSSProperties = {
                position: 'absolute', top: 0, bottom: 0, boxSizing: 'border-box',
                background: 'var(--dt-surface-2)',
                borderLeft: '1px dashed var(--dt-border)', borderRight: '1px dashed var(--dt-border)',
              }
              return (
                <div aria-hidden style={{ position: 'absolute', top: WF_PAD, left: WF_PAD, width: gridW, bottom: WF_PAD, pointerEvents: 'none' }}>
                  {gutterWf >= 2
                    ? Array.from({ length: cols.current - 1 }).map((_, i) => (
                        <div key={`g${i}`} style={{ ...band, left: (i + 1) * cellW - gutterWf / 2, width: gutterWf }} />
                      ))
                    : Array.from({ length: cols.current - 1 }).map((_, i) => (
                        <div key={`l${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: (i + 1) * cellW, width: 0, borderLeft: '1px dashed var(--dt-border)' }} />
                      ))}
                  {margLWf >= 2 && <div style={{ ...band, left: -margLWf, width: margLWf }} />}
                  {margRWf >= 2 && <div style={{ ...band, left: gridW, width: margRWf }} />}
                </div>
              )
            })()}

            {/* B2: infognings-indikator under flytt-drag – snap-linjer + ghost-slot
                där blocket LANDAR (rad = slot; halvtal = insertion-linje mellan rader).
                Modellen uppdateras inte live: sidan omgriddas först vid släpp. */}
            {drag && drag.target && (() => {
              const t = drag.target
              const left = (t.colStart - 1) * cellW
              const frac = !Number.isInteger(t.row)
              const rb = wf.rowBox.get(t.row)
              const rows = Array.from(wf.rowBox.keys()).sort((a, b) => a - b)
              let top: number
              let hh: number
              if (rb) { top = rb.top; hh = rb.h }
              else {
                const below = rows.find((r) => r > t.row)
                const rbBelow = below != null ? wf.rowBox.get(below) : undefined
                top = rbBelow ? rbBelow.top - ROW_GAP / 2 : wf.gridBottom
                hh = Math.min(wf.blockH(drag.key), 46)
              }
              return (
                <>
                  <div aria-hidden style={{ position: 'absolute', top: WF_PAD, bottom: WF_PAD, left: WF_PAD + left, width: 0, borderLeft: '1.5px solid var(--dt-accent)' }} />
                  <div aria-hidden style={{ position: 'absolute', top: WF_PAD, bottom: WF_PAD, left: WF_PAD + left + t.span * cellW, width: 0, borderLeft: '1.5px solid var(--dt-accent)' }} />
                  {frac && <div aria-hidden style={{ position: 'absolute', left: WF_PAD, width: cols.current * cellW, top: WF_PAD + top, height: 0, borderTop: '2px solid var(--dt-accent)', pointerEvents: 'none', zIndex: 5 }} />}
                  <div aria-hidden style={{ position: 'absolute', left: WF_PAD + left, top: WF_PAD + top + (frac ? 3 : 0), width: t.span * cellW, height: hh, background: 'var(--dt-accent-weak)', border: '1.5px dashed var(--dt-accent)', borderRadius: 'var(--dt-radius-sm)', pointerEvents: 'none', zIndex: 5 }} />
                </>
              )
            })()}

            {/* ── A1: topp-band utanför sidans grid (toppbar/hero/sidfot) ── */}
            {wf.bandBoxes.map(({ band, y, h }) => {
              const hasKids = !band.locked && wf.childrenOf(band.id, null).length > 0
              return (
                <div
                  key={band.id}
                  title={band.locked
                    ? `${band.label} · låst (sticky/toppbar) – flyttas inte`
                    : `${band.label} · utanför sidans grid – bandet ligger fast, innehållet kan redigeras`}
                  style={{
                    position: 'absolute', left: WF_PAD, top: WF_PAD + y, width: Math.max(cellW - 4, cols.current * cellW - 4), height: h,
                    background: band.locked
                      ? 'repeating-linear-gradient(45deg, var(--dt-surface-2) 0 8px, var(--dt-surface) 8px 16px)'
                      : 'var(--dt-surface-raised)',
                    border: `1px ${band.locked ? 'dashed' : 'solid'} var(--dt-border)`,
                    borderRadius: 'var(--dt-radius-sm)', boxShadow: band.locked ? 'none' : 'var(--dt-shadow)',
                    userSelect: 'none', cursor: 'default',
                  }}
                >
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', height: hasKids ? TOP_HEAD : '100%', pointerEvents: 'none', zIndex: 2 }}>
                    {band.locked && <span aria-hidden style={{ fontSize: 10, lineHeight: 1 }}>🔒</span>}
                    <span style={{ fontSize: 'var(--dt-text-xs)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, color: band.locked ? 'var(--dt-text-mute)' : 'var(--dt-text-dim)' }}>{band.label}</span>
                    <span style={{ fontSize: 9, color: 'var(--dt-text-mute)' }}>{band.locked ? 'låst' : 'fast'}</span>
                  </div>
                  {hasKids && renderNested(band.id, null, cols.current * cellW - 8, 2, 0)}
                </div>
              )
            })}

            {/* Områdes-block (skalenlig höjd: verklig proportion + nästlade regioner) */}
            {vAreas.filter((a) => !a.hidden).map((a) => {
              const left = (a.colStart - 1) * cellW
              const rb = wf.rowBox.get(a.row)
              const top = rb?.top ?? wf.gridBottom
              const w = a.span * cellW
              const blockW = Math.max(cellW - 4, w - 4)
              const blockH = wf.blockH(a.key)
              const hasKids = wf.childrenOf(a.key, null).length > 0
              const bad = overlaps.has(a.key)
              const isDrag = drag?.key === a.key || (hDrag != null && hDrag.top && hDrag.id === a.key)
              const isSel = !mirror && selSet.has(a.key)
              const isPh = isPlaceholderKey(a.key)
              const th = vTopH[a.key]
              return (
                <div
                  key={a.key}
                  onPointerDown={(e) => startAreaDrag(e, a, 'move')}
                  style={{
                    position: 'absolute', left: WF_PAD + left, top: WF_PAD + top, width: blockW, height: blockH,
                    background: isDrag ? 'var(--dt-accent-weak)' : isPh ? 'var(--dt-surface-2)' : 'var(--dt-surface-raised)',
                    border: `1px ${isPh ? 'dashed' : 'solid'} ${bad ? '#f59e0b' : isSel ? 'var(--dt-accent)' : isDrag ? 'var(--dt-border-strong)' : 'var(--dt-border)'}`,
                    outline: isSel ? '2px solid var(--dt-accent)' : 'none', outlineOffset: 1,
                    borderRadius: 'var(--dt-radius-sm)', boxShadow: isSel ? 'var(--dt-glow)' : 'var(--dt-shadow)', cursor: spaceDown ? 'grab' : 'move',
                    userSelect: 'none',
                    transition: (reduced || isDrag) ? 'none' : 'left 160ms cubic-bezier(0.22,1,0.36,1), width 160ms cubic-bezier(0.22,1,0.36,1), top 160ms cubic-bezier(0.22,1,0.36,1), height 160ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                  title={`${a.label} · kol ${a.colStart}–${colEnd(a)} · span ${a.span}${isPh ? ' · platshållare' : ''}${th ? (th.fixed ? ' · fast höjd – dra underkanten' : ' · auto-höjd (innehållsstyrd)') : ''} · ⇧-klick markerar`}
                >
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', height: hasKids ? TOP_HEAD : Math.min(blockH, TOP_HEAD + 4), zIndex: 2 }}>
                    {isSel && <span aria-hidden style={{ fontSize: 11, color: 'var(--dt-accent)', lineHeight: 1 }}>✓</span>}
                    <span style={{ fontSize: 'var(--dt-text-xs)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, fontStyle: isPh ? 'italic' : 'normal', color: isPh ? 'var(--dt-text-dim)' : 'var(--dt-text)' }}>{isPh ? `＋ ${a.label}` : a.label}</span>
                    {/* A2: auto-höjd märks; fast höjd dras i underkanten */}
                    {th && !th.fixed && <span title="Innehållsstyrd höjd (aktuell proportion visas ändå)" style={{ flex: 'none', fontSize: 9, fontStyle: 'italic', lineHeight: '12px', color: 'var(--dt-text-mute)', border: '1px solid var(--dt-border)', borderRadius: 3, padding: '0 4px' }}>auto</span>}
                    <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', fontVariantNumeric: 'tabular-nums' }}>{a.span}</span>
                    {!isPh && <button type="button" aria-label="Egenskaper" title="Egenskaper (färg/token)" onPointerDown={(e) => { e.stopPropagation(); selectBlock(a) }} style={{ background: 'none', border: 'none', color: selKey === a.key ? 'var(--dt-accent)' : 'var(--dt-text-mute)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>◧</button>}
                    <button type="button" aria-label="Radera område" onPointerDown={(e) => { e.stopPropagation(); deleteArea(a) }} style={{ background: 'none', border: 'none', color: 'var(--dt-text-mute)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>✕</button>
                  </div>
                  {/* Nästlade regioner (A1/A2): auto-detekterade, skalenliga, dra/resiza inom föräldern */}
                  {hasKids && renderNested(a.key, null, blockW - 4, 2, 0)}
                  {/* Resize-handtag (bredd, höger kant) */}
                  <span onPointerDown={(e) => startAreaDrag(e, a, 'resize')} style={{ position: 'absolute', right: -3, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 3 }} />
                  {/* A2: höjd-handtag (underkant) – bara FAST höjd är dragbar */}
                  {th?.fixed && !isPh && (
                    <span
                      onPointerDown={(e) => { e.stopPropagation(); startHeightDrag(e, { top: a }) }}
                      title="Dra för att ändra höjd (snappar mot grannens underkant)"
                      style={{ position: 'absolute', left: 0, right: 0, bottom: -3, height: 8, cursor: 'ns-resize', zIndex: 3 }}
                    />
                  )}
                </div>
              )
            })}

            {/* A2: snap-linje + live-värde under pågående höjd-drag på ett TOPP-block */}
            {hDrag && hDrag.top && (() => {
              const a = areas.find((x) => x.key === hDrag.id)
              if (!a) return null
              const rowAreas = areas.filter((x) => !x.hidden && x.row === a.row)
              const lineL = Math.min(...rowAreas.map((x) => (x.colStart - 1) * cellW))
              const lineR = Math.max(...rowAreas.map((x) => colEnd(x) * cellW))
              const y = (wf.rowBox.get(a.row)?.top ?? wf.gridBottom) + wf.blockH(a.key)
              return (
                <div aria-hidden style={{ position: 'absolute', left: WF_PAD + lineL, width: lineR - lineL, top: WF_PAD + y, height: 0, borderTop: `1.5px ${hDrag.snap ? 'solid' : 'dashed'} var(--dt-accent)`, pointerEvents: 'none', zIndex: 4 }}>
                  <span style={{ position: 'absolute', top: 3, left: (a.colStart - 1) * cellW - lineL, fontSize: 10, fontWeight: 700, fontFamily: 'var(--dt-font-mono)', color: 'var(--dt-accent-contrast)', background: 'var(--dt-accent)', padding: '1px 6px', borderRadius: 'var(--dt-radius-sm)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(hDrag.hpx)} px{hDrag.snap ? ` ↦ ${hDrag.snap.label}` : ''}
                  </span>
                </div>
              )
            })()}

            {/* ── Mät-overlay (Post 6): gap i px + närmaste token mellan block per rad ── */}
            {measure && measures.map((m, i) => {
              const a = areas.find((x) => x.key === m.aKey)
              const b = areas.find((x) => x.key === m.bKey)
              if (!a || !b) return null
              const gx = WF_PAD + colEnd(a) * cellW           // vänsterkant på mellanrummet
              const gw = Math.max(0, (b.colStart - 1 - colEnd(a)) * cellW)
              const gy = WF_PAD + (wf.rowBox.get(a.row)?.top ?? wf.gridBottom)
              const midY = gy + (wf.rowBox.get(a.row)?.h ?? ROW_H) / 2
              return (
                <div key={`m${i}`} aria-hidden style={{ position: 'absolute', left: gx, top: midY - 9, width: gw, height: 18, pointerEvents: 'none' }}>
                  {/* mät-band */}
                  <div style={{ position: 'absolute', top: 8, left: 0, right: 0, height: 0, borderTop: '1px dashed var(--dt-accent)' }} />
                  <div style={{ position: 'absolute', top: 4, left: 0, height: 8, width: 0, borderLeft: '1px solid var(--dt-accent)' }} />
                  <div style={{ position: 'absolute', top: 4, right: 0, height: 8, width: 0, borderLeft: '1px solid var(--dt-accent)' }} />
                  <span style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 9, fontWeight: 700, fontFamily: 'var(--dt-font-mono)', color: 'var(--dt-accent-contrast)', background: m.token.onToken ? 'var(--dt-accent)' : '#f59e0b', padding: '1px 5px', borderRadius: 'var(--dt-radius-sm)', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(m.px)}px · {m.token.onToken ? m.token.name : `~${m.token.name}`}
                  </span>
                </div>
              )
            })}
            {/* Blockmått (bredd i px + höjd ur riktiga elementet) under mät-läge */}
            {measure && geom && !mirror && areas.filter((a) => !a.hidden).map((a) => {
              const left = (a.colStart - 1) * cellW
              const top = wf.rowBox.get(a.row)?.top ?? wf.gridBottom
              const w = a.span * cellW
              const h = Math.round(realRefs.current[Number(a.key)]?.el.offsetHeight ?? 0)
              return (
                <span key={`w${a.key}`} aria-hidden style={{ position: 'absolute', left: WF_PAD + left, top: WF_PAD + top + wf.blockH(a.key) + 1, width: Math.max(cellW, w), textAlign: 'center', fontSize: 9, fontFamily: 'var(--dt-font-mono)', color: 'var(--dt-text-mute)', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
                  {Math.round(areaWidthPx(a, geom))}px{h ? ` × ${h}` : ''}
                </span>
              )
            })}

            {/* ── B5: standardskärm-rektangel vid utzoom – MacBook Pro 14"
                (1512×982 logiska px), skalenlig via wf.k och centrerad över
                innehållet. Ritas i den transformerade canvasen → följer
                zoom/pan gratis. Visar vad som ryms utan skroll. ── */}
            {zoom < 0.98 && !mirror && (() => {
              const r = macbookRect(wf.k, cols.current * cellW)
              return (
                <div aria-hidden style={{
                  position: 'absolute', left: WF_PAD + r.x, top: WF_PAD + r.y, width: r.w, height: r.h,
                  border: '1.5px dashed var(--dt-accent-line)', borderRadius: 6, pointerEvents: 'none', zIndex: 4,
                }}>
                  <span style={{
                    position: 'absolute', top: 4, right: 6, fontSize: 9, fontWeight: 600,
                    fontFamily: 'var(--dt-font-mono)', color: 'var(--dt-text-mute)',
                    background: 'var(--dt-surface)', border: '1px solid var(--dt-border)',
                    padding: '1px 6px', borderRadius: 'var(--dt-radius-sm)', whiteSpace: 'nowrap',
                  }}>
                    {MACBOOK14.label} · {MACBOOK14.w}×{MACBOOK14.h}
                  </span>
                </div>
              )
            })()}

            <div style={{ height: wf.totalH + WF_PAD }} />
          </div>

          {/* Live-värde-etikett vid drag */}
          {drag && (
            <div style={{
              position: 'absolute', left: 12, bottom: 12, pointerEvents: 'none',
              background: 'var(--dt-surface-raised)', border: '1px solid var(--dt-border-strong)', borderRadius: 'var(--dt-radius-sm)',
              padding: '4px 10px', fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text)', boxShadow: 'var(--dt-shadow)', fontVariantNumeric: 'tabular-nums',
            }}>
              {drag.area.label} · <b>col {drag.area.colStart}–{drag.area.colStart + drag.area.span - 1}</b> · span {drag.area.span}
              {drag.target ? (Number.isInteger(drag.target.row) ? ` · rad ${drag.target.row}` : ' · ny rad') : ''}
              {drag.pushes > 0 ? ` · knuffar ${drag.pushes}` : ''}
            </div>
          )}
          {/* Live-värde-etikett vid höjd-drag (A2) */}
          {hDrag && (
            <div style={{
              position: 'absolute', left: 12, bottom: 12, pointerEvents: 'none',
              background: 'var(--dt-surface-raised)', border: '1px solid var(--dt-border-strong)', borderRadius: 'var(--dt-radius-sm)',
              padding: '4px 10px', fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text)', boxShadow: 'var(--dt-shadow)', fontVariantNumeric: 'tabular-nums',
            }}>
              {hDrag.label} · <b>höjd {Math.round(hDrag.hpx)} px</b>{hDrag.snap ? <> · snappar mot <b>{hDrag.snap.label}</b></> : ''}
            </div>
          )}

          {/* HOOK-P4-PANEL: token-medveten egenskaps-panel dockar här (höger inre
              kolumn), samma komponent som overlay-läget → token-vs-override i BÅDA lägena.
              HOOK-P5-BREADCRUMB: klick på ett block → DOM-brödsmula.
              HOOK-P6-LAYOUT: align/distribute + mät-overlay ovanpå canvasen. */}
          {selectedEl && selInfo && (
            <div style={{
              position: 'absolute', top: 12, right: 12, width: 300, maxHeight: 'calc(100% - 24px)', overflowY: 'auto',
              background: 'var(--dt-surface-solid)', border: '1px solid var(--dt-border-strong)', borderRadius: 'var(--dt-radius-lg)',
              boxShadow: 'var(--dt-shadow-lg), var(--dt-glow)', padding: 'var(--dt-space-3)', zIndex: 6, pointerEvents: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--dt-space-2)' }}>
                <span style={{ fontSize: 'var(--dt-text-sm)', fontWeight: 700 }}>Egenskaper</span>
                <button type="button" aria-label="Stäng" onClick={() => { setSelKey(null); setDrillEl(null) }} style={{ ...dtGhostBtn(), padding: '2px 8px' }}>✕</button>
              </div>
              {/* HOOK-P5-BREADCRUMB: element-verktygslåda (brödsmula/nudge/fil:rad). */}
              <ElementInspector el={selectedEl} onSelect={(e) => setDrillEl(e)} flash={flash} compact />
              <PropertyPanel el={selectedEl} selInfo={selInfo} flash={flash} onClose={() => { setSelKey(null); setDrillEl(null) }} />
            </div>
          )}

          {/* Minikarta (HOOK-P3-MINIMAP) */}
          <Minimap wfW={wfW} contentInnerH={wf.totalH} pan={pan} zoom={zoom} viewportW={wfW} viewportH={wfViewport.current?.clientHeight ?? 400} />
        </div>
      </div>

      {/* ── Botten-chrome ── */}
      <footer style={{
        pointerEvents: 'auto', position: 'absolute', bottom: 0, left: 0, right: 0, height: FOOT_H,
        display: 'flex', alignItems: 'center', gap: 'var(--dt-space-3)', padding: '0 var(--dt-space-4)',
        borderTop: '1px solid var(--dt-border)', background: 'var(--dt-surface-solid)', color: 'var(--dt-text-mute)',
        fontSize: 'var(--dt-text-xs)', fontFamily: 'var(--dt-font)', zIndex: 3,
      }}>
        <span>{dual ? 'Två-panel: riktig sida | wireframe' : (showRealSingle ? 'Enkel-panel: riktig sida' : 'Enkel-panel: wireframe')}{mirror ? ' · mobil-spegel (skrivskyddad)' : ''}</span>
        <div style={{ flex: 1 }} />
        <span>{vAreas.filter((a) => !a.hidden).length} områden · {vNested.length} regioner (auto) · skala 1:{(1 / Math.max(0.01, wf.k)).toFixed(1)} · ⇧-klick markerar · ⌘Z ångra · ⌘±/⌃-scroll zoom (synkad)</span>
      </footer>

      {/* ── B6: "Vill du spara ändringarna?"-dialog (Word/Excel-stil) vid Avsluta
          med osparade layout-ändringar. Spara = samma flöde som Spara layout →
          stäng; Spara inte = släng overrides (dagens beteende); Avbryt = stanna. ── */}
      {exitAsk && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Osparade ändringar"
          onPointerDown={(e) => { if (e.target === e.currentTarget) setExitAsk(false) }}
          style={{
            position: 'absolute', inset: 0, zIndex: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--dt-scrim)', pointerEvents: 'auto',
            animation: reduced ? 'none' : 'dtFade var(--dt-dur-fast) var(--dt-spring)',
          }}
        >
          <div style={{
            width: 430, maxWidth: 'calc(100% - 48px)', background: 'var(--dt-surface-solid)',
            border: '1px solid var(--dt-border-strong)', borderRadius: 'var(--dt-radius-lg)',
            boxShadow: 'var(--dt-shadow-lg)', padding: 'var(--dt-space-5)',
            fontFamily: 'var(--dt-font)', color: 'var(--dt-text)',
          }}>
            <h2 style={{ fontSize: 'var(--dt-text-lg)', fontWeight: 700, margin: '0 0 var(--dt-space-2)' }}>Vill du spara ändringarna?</h2>
            <p style={{ fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text-dim)', lineHeight: 1.55, margin: '0 0 var(--dt-space-4)' }}>
              Layouten har osparade ändringar. Sparar du inte går de förlorade när Design mode stängs.
            </p>
            <div style={{ display: 'flex', gap: 'var(--dt-space-2)', alignItems: 'center' }}>
              <button type="button" onClick={() => { setExitAsk(false); onExit() }} style={dtGhostBtn()}>Spara inte</button>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={() => setExitAsk(false)} style={dtGhostBtn()}>Avbryt</button>
              <button
                type="button"
                autoFocus
                disabled={saving}
                onClick={async () => { const ok = await saveLayout(); if (ok) { setExitAsk(false); onExit() } }}
                style={dtSaveBtn(saving)}
              >{saving ? 'Sparar…' : 'Spara'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Minikarta ──
function Minimap({ wfW, contentInnerH, pan, zoom, viewportW, viewportH }: { wfW: number; contentInnerH: number; pan: { x: number; y: number }; zoom: number; viewportW: number; viewportH: number }) {
  const contentH = contentInnerH + 2 * WF_PAD
  const contentW = wfW
  const MM_W = 132
  const scale = MM_W / contentW
  const mmH = Math.max(40, Math.min(160, contentH * scale))
  // Viewport-rektangel (vad som syns i canvasen), i innehålls-koordinater.
  const viewLeft = (-pan.x / zoom) * scale
  const viewTop = (-pan.y / zoom) * scale
  const viewW = (viewportW / zoom) * scale
  const viewH = (viewportH / zoom) * scale
  return (
    <div aria-hidden style={{ position: 'absolute', right: 12, bottom: 12, width: MM_W, height: mmH, background: 'var(--dt-surface-2)', border: '1px solid var(--dt-border)', borderRadius: 'var(--dt-radius-sm)', overflow: 'hidden', pointerEvents: 'none', boxShadow: 'var(--dt-shadow)' }}>
      <div style={{ position: 'absolute', left: Math.max(0, viewLeft), top: Math.max(0, viewTop), width: Math.min(MM_W, viewW), height: Math.min(mmH, viewH), border: '1.5px solid var(--dt-accent)', background: 'var(--dt-accent-weak)', borderRadius: 3 }} />
    </div>
  )
}

// ── Hjälpare ──
function fullOverlay(reduced: boolean): React.CSSProperties {
  return {
    position: 'fixed', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column',
    background: 'var(--dt-surface-solid)', color: 'var(--dt-text)', fontFamily: 'var(--dt-font)',
    animation: reduced ? 'none' : 'dtFade var(--dt-dur) var(--dt-spring)',
  }
}

function seg(): React.CSSProperties {
  return { display: 'flex', gap: 2, padding: 2, background: 'var(--dt-surface-2)', borderRadius: 'var(--dt-radius)', border: '1px solid var(--dt-border)' }
}
function segBtn(on: boolean): React.CSSProperties {
  return {
    padding: '3px 9px', fontSize: 'var(--dt-text-xs)', fontWeight: 600, cursor: 'pointer',
    borderRadius: 'var(--dt-radius-sm)', border: '1px solid ' + (on ? 'var(--dt-border-strong)' : 'transparent'),
    background: on ? 'var(--dt-accent-weak)' : 'transparent', color: on ? 'var(--dt-accent)' : 'var(--dt-text-dim)',
  }
}

// ── Layout-verktygsradens knappar (Post 6) ──
function tbGroup(): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 1, padding: 2, background: 'var(--dt-surface-2)', borderRadius: 'var(--dt-radius-sm)', border: '1px solid var(--dt-border)' }
}
function tbBtn(on = false): React.CSSProperties {
  return {
    minWidth: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 4px', fontSize: 'var(--dt-text-xs)', fontWeight: 600, cursor: 'pointer', lineHeight: 1,
    borderRadius: 'var(--dt-radius-sm)', border: '1px solid ' + (on ? 'var(--dt-border-strong)' : 'transparent'),
    background: on ? 'var(--dt-accent-weak)' : 'transparent', color: on ? 'var(--dt-accent)' : 'var(--dt-text-dim)',
    transition: 'background var(--dt-dur-fast) var(--dt-spring), color var(--dt-dur-fast) var(--dt-spring)',
  }
}
function tbSep(): React.CSSProperties {
  return { width: 1, height: 16, background: 'var(--dt-border)', margin: '0 2px' }
}

/** Regionsnamn (A3): generiskt ur rubrik/aria/roll/typ – aldrig instansdata.
 *  All logik bor i lib/design/regionNames.ts (ren kärna, enhets-testad). */
function pickLabel(el: HTMLElement, i: number): string {
  return nameForElement(el, `Område ${i + 1}`)
}

/** Etikett för ett topp-band utanför sidans grid (generisk, tagg-semantisk). */
function bandLabel(el: HTMLElement | undefined, i: number): string {
  const tag = el?.tagName.toLowerCase()
  if (tag === 'nav') return 'Toppbar'
  if (tag === 'footer') return 'Sidfot'
  if (tag === 'header') return 'Sidhuvud'
  if (tag === 'aside') return 'Sidopanel'
  // Bandet som bär sidans h1 är sidhuvudet (hero) – h1-texten själv är instansdata.
  if (el?.querySelector('h1')) return 'Sidhuvud'
  return el ? pickLabel(el, i) : `Band ${i + 1}`
}

/** Hela sid-modellen ur den AKTUELLA renderade layouten (A1/A4): topp-areor,
 *  band och nästlad regionshierarki. Ren läsning – inga sido-effekter. Används
 *  både av init-effekten (desktop) och mobil-spegeln (A4, efter emulering). */
interface PageModel {
  nCols: number
  geom: GridGeom
  realW: number
  refs: RealRef[]
  areas: GridArea[]
  bands: WfBand[]
  nested: RegionVM[]
}

function buildPageModel(container: HTMLElement, pageRootEl: HTMLElement | null): PageModel {
  const nCols = parseInt(container.dataset.gridCols || '', 10) || GRID.columns
  const cs = getComputedStyle(container)
  const gap = parseFloat(cs.columnGap || cs.gap || '0') || 0
  const padLeft = parseFloat(cs.paddingLeft || '0') || 0
  const padRight = parseFloat(cs.paddingRight || '0') || 0
  const cRect = container.getBoundingClientRect()
  const inner = cRect.width - padLeft - padRight
  const trackW = (inner - (nCols - 1) * gap) / nCols
  const geom: GridGeom = { cols: nCols, trackW, gap, originX: cRect.left + padLeft, padLeft, padRight }

  const children = Array.from(container.children) as HTMLElement[]
  const refs: RealRef[] = []
  const raw: Array<GridArea & { top: number }> = []
  children.forEach((el, i) => {
    const r = el.getBoundingClientRect()
    const { colStart, span } = placementFromGeometry(r.left, r.width, geom)
    const label = pickLabel(el, i)
    refs.push({ el, orig: { gridColumn: el.style.gridColumn, gridRow: el.style.gridRow, display: el.style.display, height: el.style.height } })
    raw.push({ key: String(i), label, colStart, span, row: 1, top: r.top })
  })
  const areas = normalizeRows(assignRowsByTop(raw))

  // ── A1: generisk auto-uppdelning → nästlad regionshierarki ──
  // Läser HELA sidan (inte bara grid-barnen): topp-band (toppbar/hero/sidfot)
  // + varje topp-blocks nästlade regioner, med lokal placering i respektive
  // scope-container så drag/resize kan appliceras med v1-mekaniken.
  const res = readRegions(pageRootEl ?? document.body)
  const bandsOut: WfBand[] = []
  const nestedOut: RegionVM[] = []
  if (res) {
    const { tree, els, nodes } = res
    const elToKey = new Map<Element, string>(children.map((el, i) => [el, String(i)]))
    const pushNested = (region: RegionNode, topId: string, parentId: string | null) => {
      const kids = region.children.filter((c) => c.kind !== 'locked')
      // Nästlade rader ur verklig y-position (samma princip som assignRowsByTop).
      const rowOf = new Map<RegionNode, number>()
      let row = 0
      let prevY = Number.NEGATIVE_INFINITY
      for (const k of [...kids].sort((a, b) => a.rect.y - b.rect.y)) {
        if (k.rect.y - prevY > 12) { row += 1; prevY = k.rect.y }
        rowOf.set(k, row)
      }
      for (const child of kids) {
        const el = els[child.ref] as HTMLElement | undefined
        const anchorEl = els[child.anchorRef] as HTMLElement | undefined
        const scopeNode = nodes[child.scopeRef]
        if (!el || !anchorEl || !scopeNode) continue
        const place = localPlacement(child.rect, scopeNode)
        const originX = scopeNode.rect.x + scopeNode.padLeft
        const innerW = Math.max(1, scopeNode.rect.w - scopeNode.padLeft - scopeNode.padRight)
        const pr = region.rect
        const row = rowOf.get(child) ?? 1
        nestedOut.push({
          id: String(child.ref), topId, parentId,
          label: pickLabel(el, nestedOut.length),
          el,
          innerEl: (els[child.innerRef] as HTMLElement | undefined) ?? el,
          anchorEl,
          scopeEl: (els[child.scopeRef] as HTMLElement | undefined) ?? el,
          mech: scopeMech(scopeNode),
          kind: child.kind === 'slot' ? 'slot' : 'visual',
          cols: place.cols, colStart: place.colStart, span: place.span,
          row,
          sfx: (originX - pr.x) / Math.max(1, pr.w),
          sfw: innerW / Math.max(1, pr.w),
          hpx: child.rect.h,
          origH: child.rect.h,
          relY: child.rect.y - pr.y,
          fixedH: false, fixedEl: null, fixedOrigPx: 0, fixedOrigInline: '', // fylls av höjdsonderingen (A2)
          orig: { colStart: place.colStart, span: place.span, row },
          origStyle: {
            gridColumn: anchorEl.style.gridColumn, order: anchorEl.style.order,
            width: anchorEl.style.width, flexBasis: anchorEl.style.flexBasis, flexGrow: anchorEl.style.flexGrow,
          },
          domIdx: 0, domParent: null, domNext: null, // fylls för dokumentflödes-scopes nedan (B2)
        })
        pushNested(child, topId, String(child.ref))
      }
    }
    for (const top of tree.children) {
      const topEl = els[top.ref] as HTMLElement | undefined
      const topAnchor = els[top.anchorRef] as HTMLElement | undefined
      const key = (topEl && elToKey.get(topEl)) ?? (topAnchor && elToKey.get(topAnchor))
      if (key != null) { pushNested(top, key, null); continue }
      // Utanför sidans grid → band (toppbar/hero/sidfot). Sticky = låst.
      const bandId = `band:${top.ref}`
      bandsOut.push({ id: bandId, label: bandLabel(topEl, bandsOut.length), locked: top.kind === 'locked', above: top.rect.y < cRect.top, hpx: top.rect.h, el: topEl })
      if (top.kind !== 'locked') pushNested(top, bandId, null)
    }
  }
  // B2: dokumentflödes-scopes – fånga ankarnas init-DOM-positioner (per scope,
  // i DOM-ordning) så flytt kan appliceras som omordning och återställas exakt.
  const flowGroups = new Map<HTMLElement, RegionVM[]>()
  for (const r of nestedOut) {
    if (r.mech !== 'flow') continue
    const g = flowGroups.get(r.scopeEl) ?? []
    g.push(r)
    flowGroups.set(r.scopeEl, g)
  }
  for (const group of Array.from(flowGroups.values())) {
    const sorted = [...group].sort((a, b) =>
      (a.anchorEl.compareDocumentPosition(b.anchorEl) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1)
    sorted.forEach((r, i) => { r.domIdx = i; r.domParent = r.anchorEl.parentNode; r.domNext = r.anchorEl.nextSibling })
  }
  return { nCols, geom, realW: Math.max(1, inner), refs, areas, bands: bandsOut, nested: nestedOut }
}

/** Återställ en nästlad regions ursprungliga inline-styles (unmount/nollställ). */
function restoreNested(r: RegionVM) {
  r.anchorEl.style.gridColumn = r.origStyle.gridColumn
  r.anchorEl.style.order = r.origStyle.order
  r.anchorEl.style.width = r.origStyle.width
  r.anchorEl.style.flexBasis = r.origStyle.flexBasis
  r.anchorEl.style.flexGrow = r.origStyle.flexGrow
  if (r.fixedEl) r.fixedEl.style.height = r.fixedOrigInline
}

/** B2: återställ dokumentflödes-ankarna till sina init-DOM-positioner. Omvänd
 *  init-ordning gör nextSibling-referenserna giltiga igen ett steg i taget. */
function restoreFlowDom(regions: RegionVM[]) {
  const flow = regions.filter((r) => r.mech === 'flow' && r.domParent)
  for (const r of [...flow].sort((a, b) => b.domIdx - a.domIdx)) {
    if (r.anchorEl.parentNode !== r.domParent || r.anchorEl.nextSibling !== r.domNext) {
      r.domParent!.insertBefore(r.anchorEl, r.domNext)
    }
  }
}

/** B2: flytta ankare till önskad INBÖRDES ordning i DOM:en (icke-region-syskon
 *  ligger kvar). n är litet → enkel occupant-swap med omläsning per steg. */
function applyDomOrder(desired: HTMLElement[]) {
  const domSorted = () => [...desired].sort((a, b) =>
    (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1)
  for (let i = 0; i < desired.length; i++) {
    const cur = domSorted()
    if (cur[i] !== desired[i]) cur[i].parentNode?.insertBefore(desired[i], cur[i])
  }
}

/** Hur många ANDRA områden som flyttats av en reflow (för toast/etikett). */
function countChanged(next: ReadonlyArray<GridArea>, prev: ReadonlyArray<GridArea>, exceptKey: string): number {
  return next.filter((a) => {
    if (a.key === exceptKey) return false
    const o = prev.find((p) => p.key === a.key)
    return !!o && (o.colStart !== a.colStart || o.row !== a.row || o.span !== a.span)
  }).length
}

/** "· N granne/grannar knuffad(e)" – eller tomt. */
function pushedNote(n: number): string {
  if (n <= 0) return ''
  return n === 1 ? ' · 1 granne knuffad' : ` · ${n} grannar knuffade`
}

/**
 * A2: sondera auto vs FAST höjd. Läsningen är batchad, men `height:auto`-provet
 * görs ETT element i taget – annars kollapsar nästlade fasta element (t.ex.
 * kartytan) samtidigt och deras auto-föräldrar felflaggas som fasta (förälderns
 * innehållshöjd ska mätas med barnen i naturlig höjd). Engångskostnad vid init.
 * Ren logik i heightModel.probeIsFixed.
 */
function probeHeightsDom(els: HTMLElement[]): Array<{ fixed: boolean; h: number }> {
  const pre = els.map((el) => ({
    inline: el.style.height,
    aspect: getComputedStyle(el).aspectRatio || 'auto',
    h: el.getBoundingClientRect().height,
  }))
  return els.map((el, i) => {
    // Snabbsignaler kräver inget innehållsprov (undviker onödig reflow).
    if (probeIsFixed({ inlineHeight: pre[i].inline, cssAspectRatio: pre[i].aspect, measuredH: pre[i].h, autoH: pre[i].h })) {
      return { fixed: true, h: pre[i].h }
    }
    el.style.height = 'auto'
    const autoH = el.getBoundingClientRect().height
    el.style.height = pre[i].inline
    return {
      fixed: probeIsFixed({ inlineHeight: pre[i].inline, cssAspectRatio: pre[i].aspect, measuredH: pre[i].h, autoH }),
      h: pre[i].h,
    }
  })
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

function restorePage(root: HTMLElement, orig: Record<string, string>) {
  for (const k of Object.keys(orig)) {
    if (orig[k]) root.style.setProperty(cssName(k), orig[k])
    else root.style.removeProperty(cssName(k))
  }
}
function cssName(k: string): string { return k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) }

// ── B3: kvarhållet avdelar-läge (höger panelens andel, per session) ──
const SPLIT_KEY = dtKey('split.v1')
function loadSplitFrac(): number | null {
  try {
    if (typeof window === 'undefined') return null
    const v = parseFloat(sessionStorage.getItem(SPLIT_KEY) ?? '')
    return Number.isFinite(v) && v > 0.1 && v < 0.9 ? v : null
  } catch { return null }
}
function persistSplitFrac(f: number) {
  try { sessionStorage.setItem(SPLIT_KEY, String(f)) } catch { /* privat-läge */ }
}

// ── Kvarhållet layout-tillstånd (per sida) ──
const LKEY = dtKey('layout.v1')
function persistLayout(page: string, areas: GridArea[]) {
  try { localStorage.setItem(`${LKEY}:${page}`, JSON.stringify(areas)) } catch { /* privat-läge */ }
}
function loadLayout(page: string, expectCount: number): GridArea[] | null {
  try {
    const raw = localStorage.getItem(`${LKEY}:${page}`)
    if (!raw) return null
    const p = JSON.parse(raw) as GridArea[]
    if (Array.isArray(p) && p.length === expectCount && p.every((a) => typeof a.colStart === 'number')) return p
    return null
  } catch { return null }
}

'use client'
// Design mode – HJÄLTEN (Post 3, nattjobb 2026-07-10). Två-panel-arbetsytan som
// är verktygets själva hjärta:
//   • VÄNSTER = den RIKTIGA sidan (den äkta /dashboard-DOM:en flyttas in i ett
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
// Lyx: zoom/pan-canvas (space-dra, ⌘±) · snap-linjer + live-värde vid
// drag · fjäder-animationer som respekterar prefers-reduced-motion · undo/redo.
//
// KROKAR FÖR SENARE POSTER (sök på "HOOK:"):
//   HOOK-P4-PANEL     – egenskaps-panel (token-medveten) dockar i höger sidopanel
//   HOOK-P5-BREADCRUMB– element-brödsmula: klick på ett block → DOM-hierarki
//   HOOK-P6-LAYOUT    – align/distribute + mät-overlay ovanpå wireframe-canvasen
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GRID, NAV_PAGES, saveDesignNote, listDesignNotes, deleteDesignNote, type DesignNote } from '@/lib/designToolAdapter'
import { dtKey } from '@/lib/design/dtConfig'
import {
  clampPlacement, gridColumnValue, gridRowValue, placementFromGeometry,
  assignRowsByTop, normalizeRows, overlappingKeys, topBoxMoveMode,
  gridColLineCss, gridBandCss, fadeMaskVertical, fadeMaskHorizontal,
  type GridArea, type GridGeom,
} from '@/lib/design/gridModel'
import {
  alignAreas, distributeAreas, measureGaps, areaWidthPx, insertPlaceholder,
  isPlaceholderKey, colEnd, type AlignEdge, type DistributeMode,
} from '@/lib/design/layoutTools'
import { dtBtn, dtGhostBtn, dtDangerBtn, dtInput, dtSaveBtn, dtCard, dtCardHead, dtCardBody, dtCardTitle, dtCardHint, dtIconChip } from './dtStyles'
import { DtSegmented } from './DtSegmented'
import PropertyPanel from './PropertyPanel'
import ElementInspector from './ElementInspector'
import { describeNode, elementLabel, nearestMeaningfulElement } from '@/lib/design/elementModel'
import { readRegions, scopeMech, localPlacement, type RegionMech, type RegionNode } from '@/lib/design/regionModel'
import { readPlaceholders, type Placeholder } from '@/lib/design/placeholderModel'
import {
  buildProjection, projToCanvas, projToChildCanvas, projectionEqual, stickyNaturalBox,
  type Rect as ProjRect, type RawBox,
} from '@/lib/design/projection'
import { nameForElement } from '@/lib/design/regionNames'
import { emulateViewportWidth } from '@/lib/design/mediaEmu'
import {
  probeIsFixed, wfScale, snapHeight, clampDragH, stackRows, heightsEqual, isHeightOverride,
  type SnapCandidate, type StackChild, type RowStack,
} from '@/lib/design/heightModel'
import {
  resolveDrop, resolveSpan, insertionRow, sameLayout, type RowBand,
} from '@/lib/design/reflowModel'
import {
  applyGesture, snapRect, candidateEdges, rectsEqual, translateRect, intentDirty,
  type Rect as IntentRect, type Intent, type IntentMode,
} from '@/lib/design/intentModel'
import {
  MACBOOK14, centeredRightWidth, clampZoom, docDeltaFromPagePan, docDeltaFromWfPan,
  macbookViewportRect, mirrorPan, pageLeftZoom, pageZoomScroll, scrollSyncDoc,
  wfPanFromDocDelta, wheelZoomFactor, zoomAtPoint,
} from '@/lib/design/viewSync'
import {
  glideVelocity, glideDuration, blendVelocity, shouldGlide, microBounce, zoomLerp, ZOOM_LERP_MS,
} from '@/lib/design/motion'
import { buildLayoutPayload, layoutSignature, suggestLayoutName, type LayoutPayloadInput, type CssScopedSave } from '@/lib/design/savePayload'
import { useUnsavedGuard } from '@/lib/design/unsavedGuard'
import {
  enumerateThemeTokens, applyTweak, clearTweak, applyOverride, diffTweaks, suggestCssName,
  tokenReferenceCounts, collectBoxSamples, summarizeBoxProps, boxEditKey, boxTargetIndices,
  type ThemeToken, type TweakStep, type BoxObservation, type BoxElement,
} from '@/lib/design/cssTweaks'
import CssThemeEditor from './CssThemeEditor'
import {
  loadView, saveView, loadDraft, saveDraft, clearDraft, draftHasContent, markReopenDesignMode,
} from '@/lib/design/workspacePersistence'
import { cursorFor } from '@/lib/design/hoverToolbar'

// Brytpunkter (verktyget är desktop-only + själv-responsivt).
const DESKTOP_MIN = 860   // under → artig notis, aktivera inte
const DUAL_MIN = 1180     // under → enkel-panel (wireframe) + växel
const MOBILE_W = 390      // "mobil"-förhandsvisningens bredd
// R8c: desktop-referensbredd. Den riktiga sidan renderas ALLTID i denna bredd
// (äkta desktop-layout: appens innehåll kapas till max-w-7xl = 1280 och fyller
// referensen) och SKALAS NER (transform) för att fylla panelen – i stället för
// att renderas i panelens smala px-bredd (~800), där desktop-reglerna (media
// queries mot FÖNSTRET) kläms in på halva bredden = trång/distorderad hero. Så
// speglar vänster panel ALLTID prod-desktop (nedskalad), och blir dessutom
// storleks-mässigt lik wireframen (som byggs ur samma 1280-innehåll). 1280 =
// appens naturliga desktop-innehållsbredd → innehållet fyller referensen exakt.
const DESKTOP_REF = 1280
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
const EMPTY_PROJ: Record<string, ProjRect> = {}   // V17: stabil tom projektion (mobil-fallback)
const SNAP_TOL_WF = 7     // snap-tolerans för höjd-drag, i wireframe-px
// A4: mobil-spegeln är skrivskyddad (layout redigeras i desktop-läge).
const MIRROR_MSG = 'Mobil-förhandsvisningen är skrivskyddad – redigera layouten i desktop-läge'

// R5: elementets kumulativa dokument-offset (layout-px, border-box) via offsetParent-
// kedjan. offsetTop/Left är OPÅVERKADE av position:sticky:s förskjutning → ger elementets
// NATURLIGA flödes-position även när det är fastklistrat vid skärmkanten. App-agnostiskt.
function cumulativeOffset(el: HTMLElement | null | undefined): { top: number; left: number } {
  let top = 0, left = 0
  let node: HTMLElement | null = el ?? null
  while (node) { top += node.offsetTop; left += node.offsetLeft; node = node.offsetParent as HTMLElement | null }
  return { top, left }
}

/** Kontext för en design-note (samma form som in-app-verktygets captureContext). */
function captureDesignContext(): Record<string, unknown> {
  const theme = document.documentElement.dataset.theme || 'standard'
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return {
    page: location.pathname + location.search,
    theme,
    mode: dark ? 'dark-os' : 'light-os',
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    user_agent: navigator.userAgent,
  }
}

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
  /** W6: syns lådan som egen ruta på riktiga sidan? false ⇒ osynlig struktur-container. */
  separated: boolean
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
  /** Fast höjd (explicit height/aspect – generisk sondering). Både fasta OCH auto-
   *  regioner är dra-höjd-bara (R9); flaggan styr bara märkningen (fast/auto). */
  fixedH: boolean
  /** Elementet som BÄR den fasta höjden (kan vara det inre kortet) + init-mått. */
  fixedEl: HTMLElement | null
  fixedOrigPx: number
  fixedOrigInline: string
  /** R9: init-inline-höjd på regionens element (r.el) – override-höjden för en
   *  AUTO-region (fixedEl saknas) skrivs på r.el; delta mäts mot origH. */
  elOrigInline: string
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
  /** V9: fria flytt/resize-intentioner (låd-id → önskad rect + bas, doc-px). */
  intents: Record<string, Intent>
}

/** A4: skrivskyddad SPEGEL-modell av mobil-layouten. Byggs om vid preview-växel
 *  (efter media-emulering + suspenderade overrides) och rör aldrig historiken. */
interface MobileWf {
  areas: GridArea[]
  bands: WfBand[]
  nested: RegionVM[]
  topH: Record<string, TopH>
  realW: number
  placeholders: Record<string, Placeholder[]>
}

// W27/R: huvudmenyns sidor att välja bland i "Byt sida"-popovern. Listan är en
// dokumenterad SÖM — den generiska default-listan bor i lib/designToolAdapter.ts
// (NAV_PAGES); peka om den mot din apps sidor där. Så man slipper minnas URL:er.

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

  // ── L2 (v2.3): "minns arbetsytan" – scoped persistens av vy-tillstånd + utkast ──
  // scope = sidan (pathname+search) → app-agnostiskt, olika sidor/appar (t.ex.
  // ?demo=1 vs ?demo=2) delar aldrig tillstånd. restoredRef gate:ar så autospar
  // aldrig skriver innan återställningen körts (annars nollas det sparade direkt).
  const scope = useMemo(() => (typeof location !== 'undefined' ? location.pathname + location.search : ''), [])
  const restoredRef = useRef(false)
  // Diskret notis när ett osparat utkast återställdes (avfärdbar; "Förkasta" rensar).
  const [draftRestored, setDraftRestored] = useState(false)
  // ── W27 (v2.4): navigera till andra sidor UTAN att förlora osparat ──
  // Design mode kan inte hållas monterat över en riktig navigering (verktyget mäter
  // och muterar sidans DOM → ny sida = ny DOM). Ansats (ärlig): spara utkastet (per
  // sida, redan scoped) → hård navigering → verktyget återöppnas på destinationen
  // (reopen-flaggan) och återställer DEN sidans scope-utkast. Osparat på ursprungs-
  // sidan ligger kvar och återställs när man kommer tillbaka. navOpen/navUrl driver
  // den lilla "Byt sida"-popovern; intentionalNav gör att den native lämna-varningen
  // (V14) INTE avbryter en avsiktlig navigering (utkastet är ju redan sparat).
  const [navOpen, setNavOpen] = useState(false)
  const [navUrl, setNavUrl] = useState('')
  const intentionalNavRef = useRef(false)
  const navOpenRef = useRef(navOpen)
  useEffect(() => { navOpenRef.current = navOpen }, [navOpen])

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
  const bandsRef = useRef<WfBand[]>([])
  useEffect(() => { bandsRef.current = bands }, [bands])
  // R5: sticky-band:s NATURLIGA flödes-position cachead per band-id. Ett position:sticky-
  // element:s kumulativa offsetTop spårar dess FASTKLISTRADE position (växer med skroll när
  // det är "stuck") – flödespositionen är det MINSTA värdet (nås vid oskrollat läge). Vi
  // minns min:et per element så bandet projiceras där det HÖR HEMMA i dokumentet oavsett
  // aktuell skroll. Ren geometri, app-agnostiskt (gäller valfri sidas sticky-header).
  const stickyFlowRef = useRef<Map<string, { top: number; left: number }>>(new Map())
  // V17: geometrisk projektion – naturliga dokument-rects per låd-id (area-key/
  // band-id/region-id). Härleds LIVE ur riktiga sidans faktiska bounding-boxar
  // (normaliserade bort pageScale) → wireframen blir en exakt spegel (samma origo/
  // skala) i st f en oberoende region/height-layout som driver isär nedåt.
  const [proj, setProj] = useState<Record<string, ProjRect>>({})
  const projRef = useRef<Record<string, ProjRect>>({})
  useEffect(() => { projRef.current = proj }, [proj])
  // V9 (FW3): fri-flytt-INTENTIONER – låd-id → önskad rect (+ bas) i naturliga
  // dokument-px (samma rum som projektionen). En dragen/resizad låda ritas exakt
  // där användaren släpper, som en OVERLAY ovanpå projektionen; den skrivs ALDRIG
  // till den riktiga sidans grid → osynliga containers knuffar aldrig grannar.
  // Intenten persisteras i spara-payloaden ("så här vill jag ha det") och ingår i
  // historiken (undo/redo). Orörda lådor speglar fortsatt projektionen exakt.
  const [intents, setIntents] = useState<Record<string, Intent>>({})
  const intentsRef = useRef<Record<string, Intent>>({})
  useEffect(() => { intentsRef.current = intents }, [intents])
  // R14: platshållar-atomer per container-id (rubrik/knapp/textrad/bild).
  const [placeholders, setPlaceholders] = useState<Record<string, Placeholder[]>>({})
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
  // W12: är sidans topp-container ett RIKTIGT css-grid (`display:grid`)? Avläst LIVE
  // ur DOM (aldrig antaget) → flytt inom den kan skrivas som en ärlig grid-placering.
  const gridIsRealGrid = useRef(true)
  const cols = useRef<number>(GRID.columns)
  const realW = useRef<number>(1200) // riktiga gridets inre bredd (px) → skalfaktorn
  const pageRoot = useRef<HTMLElement | null>(null)
  const pageOrig = useRef<Record<string, string>>({})

  /** Snapshot av HELA modellen (areor + nästlade placeringar/höjder + topp-höjder). */
  const snap = useCallback((): Snap => ({
    areas: areasRef.current,
    nest: nestedRef.current.map(({ id, colStart, span, row, hpx }) => ({ id, colStart, span, row, hpx })),
    tops: Object.entries(topHRef.current).map(([key, t]) => ({ key, hpx: t.hpx })),
    intents: intentsRef.current,
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
    // V9: intent-kartan är ett immutabelt snapshot → byt hela referensen.
    if (s.intents !== intentsRef.current) { intentsRef.current = s.intents; setIntents(s.intents) }
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
  // R8c: fit = desktop-referensen nedskalad till panelen (1 i mobil). pageScale =
  // sidans FAKTISKA visuella skala (fit × zoom) → all doc↔skärm-omräkning i
  // skroll/pan/zoom-synken går via denna (inte via wireframens zoom). Uppdateras
  // i relokerings-effekten (place) och används av handlers via ref.
  const fitRef = useRef(1)
  const pageScaleRef = useRef(1)
  // W1/W2 (v2.4): den riktiga sidans FAKTISKT renderade skala (pageScale = fit×zoom),
  // mätt ur sidans verkliga transform i measureProj och speglad till render som state.
  // Samma värde används för BÅDE projektionen (normalisering bort skala) OCH wf-skalan
  // k = projScale/zoom → riktiga sidan, projektionen och wireframen använder alla
  // IDENTISK skala ⇒ wf-låda på skärmen == riktig låda på skärmen, exakt, varje frame.
  // (Tidigare härleddes k ur panelbredd/separat state som kunde glida ~1-2 % ur sidans
  // skala → luft upptill, onåbar botten, sidleds-drift, och drift efter resize.)
  // Ren geometri, app-agnostiskt; self-healing (measureProj pollar).
  const [projScale, setProjScale] = useState(1)
  // V2: horisontell pan-synk – sidan är annars centrerad utan sidled. Detta är den
  // extra horisontella förskjutningen (skärm-px) som läggs på sidans centrerade
  // left, så ett sidleds-drag i wireframen (eller på sidan) flyttar BÅDA panelerna
  // i synk (samma dokument-x). Nollställs vid zoom-reset.
  const pagePanXRef = useRef(0)

  // ── L1: fysik-rörelse (pan-inertia + zoom-interpolation) ──
  // "ALLTID SNABBT": inertia driver EXAKT samma doc-delta-synk-väg som drag/skroll
  // (scrollTop + wf-pan följer det faktiskt applicerade deltat → båda panelerna
  // rör sig identiskt, spegeln intakt), men med en decelererande hastighet i st f
  // pekar-rörelse. Allt är KORT (≤ GLIDE_MAX_MS) och AVBRYTBART: varje ny gest/wheel/
  // space-toggle kallar cancelInertia() → glidningen stannar direkt och följer fingret.
  // Hastighet spåras i DOKUMENT-px/ms (gemensam nämnare för wf- och sid-pan).
  const inertiaRaf = useRef<number | null>(null)
  const zoomRaf = useRef<number | null>(null)
  const velRef = useRef({ vx: 0, vy: 0, t: 0, dx: 0, dy: 0 }) // doc-px/ms + senaste sample-doc-pos + tid
  const cancelInertia = useCallback(() => {
    if (inertiaRaf.current != null) { cancelAnimationFrame(inertiaRaf.current); inertiaRaf.current = null }
  }, [])
  const cancelZoomAnim = useCallback(() => {
    if (zoomRaf.current != null) { cancelAnimationFrame(zoomRaf.current); zoomRaf.current = null }
  }, [])

  // ── R1: skiljeväggen LÅST i mitten (50/50) ──
  // Total spegel: panelerna får alltid exakt lika utrymme (centeredRightWidth)
  // så den riktiga sidan aldrig blir smal → dess responsiva reflow triggas inte
  // och vyerna speglar varandra. Väggen är kvar visuellt men inte längre dragbar
  // (B3-dragställningen + split-persistensen är borttagen).

  // ── B6: osparat-detektering + Avsluta-dialog ──
  // savedSig = modellens signatur vid init/senaste Spara; skiljer sig aktuella
  // signaturen → "Vill du spara ändringarna?"-dialog i stället för direkt-stängning.
  const savedSig = useRef('')
  const [exitAsk, setExitAsk] = useState(false)
  const exitAskRef = useRef(false)
  useEffect(() => { exitAskRef.current = exitAsk }, [exitAsk])
  // R11: namnge-dialog för "Spara layout" (spara som design note + döp förslaget).
  // exitAfterSave = spara-dialogen öppnades via Avsluta-dialogens Spara → efter en
  // lyckad sparning ska vi också stänga Design mode (konsekvent B6-samspel).
  const [saveAsk, setSaveAsk] = useState(false)
  const saveAskRef = useRef(false)
  useEffect(() => { saveAskRef.current = saveAsk }, [saveAsk])
  const [saveName, setSaveName] = useState('')
  const exitAfterSaveRef = useRef(false)
  // V15: spara-dialogens val – spara strukturella ändringar och/eller css-tema.
  const [saveStruct, setSaveStruct] = useState(true)
  const [saveCss, setSaveCss] = useState(true)

  // ── V15: CSS-tema-editor (höger panels andra flik) ──
  // panelTab byter höger panel mellan wireframe (spegel) och css-editorn (fristående
  // kontrollpanel; i css-läge gäller INGA speglings-funktioner – vänster sida lever
  // eget liv). cssTokens = mål-sidans FAKTISKA tema-tokens (enumererade generiskt ur
  // sidans CSS, se lib/design/cssTweaks). cssOverrides = live-redigerade värden. Egen
  // fler-stegs-historik (cssPast/cssFuture) skild från layout-historiken.
  // V16: en TREDJE flik 'tools' → höger yta blir det FULLA in-app-verktyget
  // (element-val via klick på vänster sida + egenskaps-panel + inspektor + rutt-
  // design). Som css-läget: spegling frånkopplad, vänster sida lever som en vanlig
  // sida man inspekterar/redigerar.
  const [panelTab, setPanelTab] = useState<'wireframe' | 'css' | 'tools'>('wireframe')
  const panelTabRef = useRef(panelTab)
  useEffect(() => { panelTabRef.current = panelTab }, [panelTab])
  // V16: hover-preview-ruta för element-plocket i verktygsläget (över vänster sida).
  const [pickHover, setPickHover] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [cssTokens, setCssTokens] = useState<ThemeToken[]>([])
  const cssTokensRef = useRef<ThemeToken[]>([])
  useEffect(() => { cssTokensRef.current = cssTokens }, [cssTokens])
  const [cssOverrides, setCssOverrides] = useState<Record<string, string>>({})
  const cssOverridesRef = useRef<Record<string, string>>({})
  useEffect(() => { cssOverridesRef.current = cssOverrides }, [cssOverrides])
  // W21: token-namn → antal var()-referenser i sidans CSS (spridning). Räknas när
  // css-fliken öppnas (räckvidd = aktuell sidas stylesheets – ärligt inte hela appen).
  const [cssSpread, setCssSpread] = useState<Record<string, number>>({})
  // W18/W19: dra-ruta i css-läge → kontextuella egenskaper + fokus-suddning.
  // boxObs = egenskaperna i rutan (null = visa hela temat); boxRect = committad ruta
  // (skärm-koord, driver suddningen); boxDrag = live-ruta medan man drar.
  const [boxObs, setBoxObs] = useState<BoxObservation[] | null>(null)
  const [boxRect, setBoxRect] = useState<null | { x: number; y: number; w: number; h: number }>(null)
  const [boxCount, setBoxCount] = useState(0)
  const [boxDrag, setBoxDrag] = useState<null | { x: number; y: number; w: number; h: number }>(null)
  // R7: element-SCOPADE css-ändringar (dra-ruta). En ändring i ruta-läget skrivs som
  // inline-stil BARA på rutans element (som Verktyg-flikens per-element-override) i
  // stället för på den globala token:en → ändringen stannar i rutan. boxElementsRef =
  // de fångade elementen (DOM-ref + observerade prop/värden) från senaste rutan;
  // scopedMetaRef = per rad (editKey) vilka element + deras föregående inline-stil (för
  // återställning) + design_id/etikett (för spara-payloaden); scopedOverrides = radens
  // aktuella värde (editKey → värde) för omritning + editorn.
  const boxElementsRef = useRef<BoxElement[]>([])
  const boxRemBaseRef = useRef(16)
  interface ScopedMeta {
    prop: string
    label: string
    fromValue: string
    kind: BoxObservation['kind']
    targets: { el: HTMLElement; prevInline: string; design_id?: string; label: string }[]
  }
  const scopedMetaRef = useRef<Map<string, ScopedMeta>>(new Map())
  const [scopedOverrides, setScopedOverrides] = useState<Record<string, string>>({})
  const scopedOverridesRef = useRef<Record<string, string>>({})
  useEffect(() => { scopedOverridesRef.current = scopedOverrides }, [scopedOverrides])
  // Historik i REFS (som layoutens past/future) → sidoeffekter ligger UTANFÖR
  // state-updaterare, StrictMode-säkert (dubbel-invokerade updaters får aldrig
  // applicera css-ändringar två gånger). bumpCss triggar bara omritning för
  // undo/redo-knapparnas enabled-läge. R7: ett historik-steg är antingen en GLOBAL
  // token-ändring ('token') eller en element-SCOPAD ruta-ändring ('scoped').
  type TokenStep = TweakStep & { kind: 'token' }
  type ScopedStep = { kind: 'scoped'; editKey: string; prev: string | null; next: string | null }
  type CssStep = TokenStep | ScopedStep
  const cssPast = useRef<CssStep[]>([])
  const cssFuture = useRef<CssStep[]>([])
  const [, forceCss] = useState(0)
  const bumpCss = useCallback(() => forceCss((n) => n + 1), [])
  // Signatur av de FAKTISKA css-ändringarna (token-diff + scopade ruta-ändringar) +
  // baslinje vid init/spara. Scoped-delen efter '#' så båda spåren flaggar "osparat".
  const cssEntries = useCallback(() => diffTweaks(cssTokensRef.current, cssOverridesRef.current), [])
  const scopedSigOf = (m: Record<string, string>) => Object.keys(m).sort().map((k) => `${k}=${m[k]}`).join('|')
  const cssSigOf = (es: ReturnType<typeof cssEntries>, scoped: Record<string, string>) =>
    es.map((e) => `${e.name}=${e.to}`).sort().join('|') + '#' + scopedSigOf(scoped)
  const savedCssSig = useRef('#')
  const cssSig = cssSigOf(diffTweaks(cssTokens, cssOverrides), scopedOverrides)
  const cssDirty = cssSig !== savedCssSig.current
  const cssSigRef = useRef(cssSig)
  useEffect(() => { cssSigRef.current = cssSig }, [cssSig])

  const setOverride = useCallback((name: string, to: string | null) => {
    if (to == null) clearTweak(name); else applyTweak(name, to)
    const next = applyOverride(cssOverridesRef.current, name, to)
    cssOverridesRef.current = next
    setCssOverrides(next)
  }, [])

  // ── R7: element-scopad tillämpning (skriv/återställ inline BARA på rutans element) ──
  // Skriv inline-stilen på varje målelement (value != null) eller återställ dess
  // föregående inline (value == null). Ändringen är element-lokal → syns bara i rutan.
  const applyScopedValue = useCallback((editKey: string, value: string | null) => {
    const meta = scopedMetaRef.current.get(editKey)
    if (!meta) return
    for (const t of meta.targets) {
      if (value == null) {
        if (t.prevInline) t.el.style.setProperty(meta.prop, t.prevInline)
        else t.el.style.removeProperty(meta.prop)
      } else {
        t.el.style.setProperty(meta.prop, value)
      }
    }
  }, [])
  // Bygg meta för en rad första gången den redigeras: vilka fångade element som bär
  // radens (prop, värde), deras nuvarande inline-stil (för ångra/städning) + en
  // beskrivning (design_id/etikett) för spara-payloaden. App-agnostiskt (describeNode).
  const buildScopedMeta = useCallback((obs: BoxObservation): ScopedMeta => {
    const idxs = boxTargetIndices(boxElementsRef.current, obs.prop, obs.value, boxRemBaseRef.current)
    const targets = idxs.map((i) => {
      const el = boxElementsRef.current[i].el
      return {
        el,
        prevInline: el.style.getPropertyValue(obs.prop),
        design_id: el.dataset.designId,
        label: elementLabel(describeNode(el)),
      }
    })
    return { prop: obs.prop, label: obs.label, fromValue: obs.value, kind: obs.kind, targets }
  }, [])
  const setScoped = useCallback((editKey: string, value: string | null, obs?: BoxObservation) => {
    if (!scopedMetaRef.current.has(editKey) && obs) scopedMetaRef.current.set(editKey, buildScopedMeta(obs))
    applyScopedValue(editKey, value)
    const next = { ...scopedOverridesRef.current }
    if (value == null) delete next[editKey]; else next[editKey] = value
    scopedOverridesRef.current = next
    setScopedOverrides(next)
  }, [applyScopedValue, buildScopedMeta])
  // Live-redigera en RUTA-egenskap (element-scopat). Coalescing per rad → en undo-nivå.
  const boxChange = useCallback((obs: BoxObservation, value: string) => {
    const editKey = boxEditKey(obs.prop, obs.value)
    const before = editKey in scopedOverridesRef.current ? scopedOverridesRef.current[editKey] : null
    setScoped(editKey, value, obs)
    const past = cssPast.current
    const last = past[past.length - 1]
    cssPast.current = (last && last.kind === 'scoped' && last.editKey === editKey)
      ? [...past.slice(0, -1), { ...last, next: value }]
      : [...past, { kind: 'scoped', editKey, prev: before, next: value }]
    cssFuture.current = []
    bumpCss()
  }, [setScoped, bumpCss])
  const boxResetOne = useCallback((obs: BoxObservation) => {
    const editKey = boxEditKey(obs.prop, obs.value)
    const before = editKey in scopedOverridesRef.current ? scopedOverridesRef.current[editKey] : null
    if (before == null) return
    setScoped(editKey, null)
    cssPast.current = [...cssPast.current, { kind: 'scoped', editKey, prev: before, next: null }]
    cssFuture.current = []
    bumpCss()
  }, [setScoped, bumpCss])

  // Live-redigera en token (coalescing per token → EN undo-nivå per token-session).
  const cssChange = useCallback((name: string, value: string) => {
    const before = name in cssOverridesRef.current ? cssOverridesRef.current[name] : null
    setOverride(name, value)
    const past = cssPast.current
    const last = past[past.length - 1]
    cssPast.current = (last && last.kind === 'token' && last.name === name)
      ? [...past.slice(0, -1), { ...last, next: value }]
      : [...past, { kind: 'token', name, prev: before, next: value }]
    cssFuture.current = []
    bumpCss()
  }, [setOverride, bumpCss])
  const cssResetOne = useCallback((name: string) => {
    const before = name in cssOverridesRef.current ? cssOverridesRef.current[name] : null
    if (before == null) return
    setOverride(name, null)
    cssPast.current = [...cssPast.current, { kind: 'token', name, prev: before, next: null }]
    cssFuture.current = []
    bumpCss()
  }, [setOverride, bumpCss])
  const cssResetAll = useCallback(() => {
    for (const n of Object.keys(cssOverridesRef.current)) clearTweak(n)
    cssOverridesRef.current = {}
    setCssOverrides({})
    // R7: återställ även alla element-scopade ruta-ändringar.
    for (const editKey of Object.keys(scopedOverridesRef.current)) applyScopedValue(editKey, null)
    scopedOverridesRef.current = {}
    setScopedOverrides({})
    cssPast.current = []; cssFuture.current = []
    bumpCss()
  }, [bumpCss, applyScopedValue])
  const cssUndo = useCallback(() => {
    const past = cssPast.current
    if (!past.length) return
    const step = past[past.length - 1]
    if (step.kind === 'scoped') setScoped(step.editKey, step.prev)
    else setOverride(step.name, step.prev)
    cssFuture.current = [...cssFuture.current, step]
    cssPast.current = past.slice(0, -1)
    bumpCss()
  }, [setOverride, setScoped, bumpCss])
  const cssRedo = useCallback(() => {
    const future = cssFuture.current
    if (!future.length) return
    const step = future[future.length - 1]
    if (step.kind === 'scoped') setScoped(step.editKey, step.next)
    else setOverride(step.name, step.next)
    cssPast.current = [...cssPast.current, step]
    cssFuture.current = future.slice(0, -1)
    bumpCss()
  }, [setOverride, setScoped, bumpCss])
  // Öppna css-fliken → enumerera sidans tema-tokens EN gång (innan overrides finns, så
  // baslinjen är sidans äkta original). Cache:as sedan.
  const openCssTab = useCallback(() => {
    let toks = cssTokensRef.current
    if (toks.length === 0) {
      toks = enumerateThemeTokens()
      cssTokensRef.current = toks
      setCssTokens(toks)
    }
    // W21: räkna spridning en gång (billigt; sidans stylesheets ändras inte i css-läge).
    setCssSpread(tokenReferenceCounts(toks.map((t) => t.name)))
    setPanelTab('css')
  }, [])
  // W18/W19: rensa ruta-filtret (tillbaka till hela temat).
  const clearBox = useCallback(() => { setBoxObs(null); setBoxRect(null); setBoxDrag(null); setBoxCount(0) }, [])
  // V16: öppna Verktyg-fliken. Behåller ev. aktuellt val; picking aktiveras av
  // effekten nedan så länge fliken är aktiv.
  const openToolsTab = useCallback(() => { setPanelTab('tools') }, [])
  // Städa live-css-overrides när Design mode stängs (osparade förslag ska inte
  // ligga kvar på sidan – precis som layout-overrides slängs). R7: även de element-
  // scopade ruta-ändringarna återställs (inline-stilen tas bort/återställs per element).
  useEffect(() => () => {
    for (const n of Object.keys(cssOverridesRef.current)) clearTweak(n)
    for (const editKey of Object.keys(scopedOverridesRef.current)) {
      const meta = scopedMetaRef.current.get(editKey)
      if (!meta) continue
      for (const t of meta.targets) {
        if (t.prevInline) t.el.style.setProperty(meta.prop, t.prevInline)
        else t.el.style.removeProperty(meta.prop)
      }
    }
  }, [])

  // ── Drag/resize-tillstånd (för infognings-indikator + live-etikett) ──
  // B2: under flytt uppdateras INTE modellen live – i stället visas en
  // infognings-indikator (ghost-slot/insertion-linje) där blocket kommer landa,
  // och hela det konfliktfria resultatet (infoga + knuffar) committas vid släpp.
  // V9 (FW3): fri-flytt-drag = live INTENT-rect i naturliga dokument-px + ev. snap-
  // kant per axel. Den dragna lådan ritas direkt vid `rect` (projektionens rum) och
  // ev. snap-linjer sammanfaller därför exakt med de projicerade lådorna.
  const [drag, setDrag] = useState<null | {
    key: string; mode: IntentMode; label: string
    rect: IntentRect
    snapX: number | null; snapY: number | null
  }>(null)
  // L1 · magnetisk snap mikro-studs: en liten bekräftelse-puls (px) på den dragna
  // lådan när en snap-kant NYSS engagerade. Kort (≤ BOUNCE_MS) + avbrytbar; ren
  // matte i microBounce. reduced-motion → aldrig (setBounce förblir 0).
  const [snapBounce, setSnapBounce] = useState(0)
  const bounceRaf = useRef<number | null>(null)
  const snapSigRef = useRef<string>('') // senast engagerade snap-signatur (undviker om-trigg)
  const triggerBounce = useCallback(() => {
    if (reduced) return
    if (bounceRaf.current != null) cancelAnimationFrame(bounceRaf.current)
    const t0 = performance.now()
    const step = () => {
      const t = performance.now() - t0
      setSnapBounce(microBounce(t))
      if (t < 140) { bounceRaf.current = requestAnimationFrame(step) }
      else { bounceRaf.current = null; setSnapBounce(0) }
    }
    bounceRaf.current = requestAnimationFrame(step)
  }, [reduced])
  const resetBounce = useCallback(() => {
    if (bounceRaf.current != null) { cancelAnimationFrame(bounceRaf.current); bounceRaf.current = null }
    snapSigRef.current = ''
    setSnapBounce(0)
  }, [])

  // ── Layout-verktyg (Post 6): multi-select + mät-overlay + geometri ──
  // Multi-select (⇧-klick i wireframen) driver align/distribute. Skilt från selKey
  // (egenskaps-panelens enkel-markering) så de inte krockar.
  const [selSet, setSelSet] = useState<Set<string>>(new Set())
  const [measure, setMeasure] = useState(false)
  // W29: flytt snappar till grid-spåren (med av-knapp). PÅ som standard. När på +
  // topp-containern är ett RIKTIGT grid ⇒ flytten skrivs live som en grid-placering
  // (W12 hybrid: grid-cell = live, allt annat = fri skiss → uppgift).
  const [snapToGrid, setSnapToGrid] = useState(true)
  // W13: MacBook-viewport-rektangeln är valbar med en knapp, AV som standard (revid. R13).
  const [showMacbook, setShowMacbook] = useState(false)
  const [geom, setGeom] = useState<GridGeom | null>(null)
  const toggleSel = useCallback((key: string) => {
    setSelSet((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])
  // Ref till aktuell selSet så selectSingle kan läsa den utan sido-effekt i en
  // state-updater (StrictMode-säkert).
  const selSetRef = useRef(selSet)
  useEffect(() => { selSetRef.current = selSet }, [selSet])
  // Låd-nyckel → dess RIKTIGA element (samma mappning som onCanvasHoldDown), app-agnostiskt.
  const realElForKey = useCallback((key: string): HTMLElement | null => {
    if (areasRef.current.some((a) => a.key === key)) return realRefs.current[Number(key)]?.el ?? null
    const nr = nestedRef.current.find((n) => n.id === key)
    if (nr) return nr.innerEl ?? nr.el ?? null
    return bandsRef.current.find((b) => b.id === key)?.el ?? null
  }, [])
  // R2/4f (v2.4): ETT enkelt vänsterklick på en ruta markerar den ENSAMT och TOGGLAR
  // (klick igen på SAMMA ruta släcker markeringen + highlighten). Öppnar INTE egenskaps-
  // ytan på Wireframe-fliken (rör ej selKey/drillEl) – bara markering + persistent
  // highlight av motsvarande riktiga ruta i vänster panel (via highlightEl → selRect).
  // Egenskaper når man via lådans ◧-knapp / Verktyg-fliken. ⇧-klick (toggleSel) rör inte
  // denna – multi-val för align/distribute lever kvar.
  const selectSingle = useCallback((key: string) => {
    const cur = selSetRef.current
    const off = cur.size === 1 && cur.has(key)
    setSelSet(off ? new Set() : new Set([key]))
    setSelKey(null); setDrillEl(null)
  }, [])
  // R2: klick på TOM canvas-yta avmarkerar allt (markering + egenskaps-drill).
  const clearSelection = useCallback(() => {
    setSelSet(new Set()); setSelKey(null); setDrillEl(null)
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
  // review 4f: elementet som persistent highlightas i vänster panel = egenskaps-valt
  // element (Verktyg-fliken) ELLER, på Wireframe-fliken, den enkel-markerade rutans
  // riktiga element. Så enkel-klick highlightar rutan utan att öppna egenskaps-ytan.
  const highlightEl = selectedEl ?? (selSet.size === 1 ? realElForKey(selSet.values().next().value as string) : null)
  const selectedArea = selKey != null ? areas.find((a) => a.key === selKey) : undefined
  const selInfo = selectedEl
    ? (drillEl
        ? { design_id: drillEl.dataset.designId, selector: elementLabel(describeNode(drillEl)), label: elementLabel(describeNode(drillEl)) }
        : (selectedArea ? { design_id: blockEl?.dataset.designId, selector: selectedArea.label || `block ${selKey}`, label: selectedArea.label || `block ${selKey}` } : null))
    : null

  // ── V6: klick på en wireframe-låda → blixt-markera motsvarande RIKTIGA element
  // i vänster panel (ökad ram-kontrast som tonar ut). Generiskt: valfritt element
  // (topp-block/band/nästlad region) via låd→element-mappningen, inga selektorer. ──
  const [flashRect, setFlashRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [flashOn, setFlashOn] = useState(false)
  const flashTimer = useRef<number | undefined>(undefined)
  const flashReal = useCallback((el: HTMLElement | null | undefined) => {
    if (!el || !realVisible) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    setFlashRect({ x: r.left, y: r.top, w: r.width, h: r.height })
    setFlashOn(true)
    window.clearTimeout(flashTimer.current)
    // Nästa frame → starta uttoningen (mikro-bekräftelse, avbryts vid ny klick).
    requestAnimationFrame(() => requestAnimationFrame(() => setFlashOn(false)))
    flashTimer.current = window.setTimeout(() => setFlashRect(null), reduced ? 260 : 1100)
  }, [realVisible, reduced])
  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  // ── W10 (v2.4): highlighta riktiga rutan medan man HÅLLER ner på en wireframe-låda ──
  // Vid pointer-down på en låda (topp-block / band / nästlad) tänds motsvarande
  // riktiga ruta DIREKT och hålls tänd tills man släpper (till skillnad från V6:s
  // flashReal som bara tänds vid släpp/klick). App-agnostiskt: element hämtas via
  // låd→objekt-mappningen (resolveHover), ingen selektor. Håll-highlighten följer
  // sidan live (den riktiga rutan kan flytta sig under ett drag) via ett intervall,
  // och tonar ut mjukt vid släpp. Ligger ovanpå den vanliga flashReal-faden.
  const heldRef = useRef(false)
  const heldElRef = useRef<HTMLElement | null>(null)
  const heldSyncRef = useRef<number | undefined>(undefined)
  const syncHeldRect = useCallback(() => {
    const el = heldElRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width && r.height) setFlashRect({ x: r.left, y: r.top, w: r.width, h: r.height })
  }, [])
  const holdHighlight = useCallback((el: HTMLElement | null | undefined) => {
    if (!el || !realVisible) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    window.clearTimeout(flashTimer.current)
    window.clearInterval(heldSyncRef.current)
    heldRef.current = true
    heldElRef.current = el
    setFlashRect({ x: r.left, y: r.top, w: r.width, h: r.height })
    setFlashOn(true)
    // Följ rutan live medan man håller (den kan flytta sig under drag/reflow).
    heldSyncRef.current = window.setInterval(syncHeldRect, 60)
  }, [realVisible, syncHeldRect])
  const releaseHold = useCallback(() => {
    if (!heldRef.current) return
    heldRef.current = false
    heldElRef.current = null
    window.clearInterval(heldSyncRef.current)
    // Starta uttoningen (mjuk mikro-bekräftelse), sedan bort.
    requestAnimationFrame(() => requestAnimationFrame(() => setFlashOn(false)))
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashRect(null), reduced ? 200 : 600)
  }, [reduced])
  useEffect(() => () => window.clearInterval(heldSyncRef.current), [])
  // W10: fånga pointer-down på valfri wireframe-låda i canvasen (capture-fas → körs
  // före lådans egna drag-handlers, utan att störa dem) och tänd håll-highlighten;
  // en global pointerup släcker den. Gäller topp-block, band OCH nästlade rutor.
  const onCanvasHoldDown = useCallback((e: React.PointerEvent) => {
    if (spaceDown || panning || mobileActive || !realVisible) return
    const box = (e.target as HTMLElement).closest?.('[data-dt-hover-id]') as HTMLElement | null
    if (!box) return
    const id = box.getAttribute('data-dt-hover-id') as string
    const kind = box.getAttribute('data-dt-hover-kind') as 'top' | 'band' | 'nested'
    // Låd→riktigt-element via samma ref-kartor som resolveHover (app-agnostiskt).
    const el = kind === 'nested'
      ? (nestedRef.current.find((n) => n.id === id)?.el ?? null)
      : kind === 'band'
        ? (bandsRef.current.find((b) => b.id === id)?.el ?? null)
        : (realRefs.current[Number(id)]?.el ?? null)
    holdHighlight(el)
    const up = () => { window.removeEventListener('pointerup', up); releaseHold() }
    window.addEventListener('pointerup', up)
  }, [spaceDown, panning, mobileActive, realVisible, holdHighlight, releaseHold])

  // R3 (v2.4): hover-mikrotoolbaren (flytta·resiza·kommentera·inspektera) är BORTTAGEN.
  // Samma åtgärder nås via Verktyg-fliken (kommentera/inspektera) och via lådans egna
  // handtag (flytta/resiza) – den flytande menyn behövdes inte. Highlight-vid-håll
  // (holdHighlight) och cursor-affordanserna (cursorFor) lever kvar oberoende av detta.

  // ── W15: kommentera i Verktyg-fliken (samma design-note-pipeline som resten) ──
  // (a) skriv/läs kommentarer knutna till valt element (eller hela sidan);
  // (b) rita en ruta över riktiga sidan och kommentera just den rutans innehåll.
  const [toolCommentText, setToolCommentText] = useState('')
  const [toolCommentSaving, setToolCommentSaving] = useState(false)
  const [toolNotes, setToolNotes] = useState<DesignNote[]>([])
  const [toolNotesOpen, setToolNotesOpen] = useState(false)
  const [toolNotesLoading, setToolNotesLoading] = useState(false)
  // (b) rit-läge: aktivt = fånga ett drag över riktiga sidan; drawRect = live-ruta
  // (skärm-koord); drawTarget = det som en ny kommentar knyts till efter släpp.
  const [drawComment, setDrawComment] = useState(false)
  const [drawRect, setDrawRect] = useState<null | { x: number; y: number; w: number; h: number }>(null)
  const [drawTarget, setDrawTarget] = useState<null | { label: string; rect: { x: number; y: number; w: number; h: number }; design_id?: string; near_text?: string }>(null)

  // ── Selektions-outline över det riktiga elementet (i vänster device-fönster) ──
  const [selRect, setSelRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  useEffect(() => {
    if (!highlightEl || !realVisible) { setSelRect(null); return }
    const sync = () => {
      const r = highlightEl.getBoundingClientRect()
      setSelRect(r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null)
    }
    sync()
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    const id = window.setInterval(sync, 400) // följ live-omgriddning/animation
    return () => { window.removeEventListener('scroll', sync, true); window.removeEventListener('resize', sync); window.clearInterval(id) }
  }, [highlightEl, realVisible, areas])

  // ── W15: vad en ny kommentar knyts till – ritad ruta > valt element > hela sidan.
  const commentTarget = useMemo(() => {
    if (drawTarget) return { kind: 'draw' as const, label: drawTarget.label, rect: drawTarget.rect, design_id: drawTarget.design_id, near_text: drawTarget.near_text }
    if (selectedEl && selInfo) {
      const near = (selectedEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      return { kind: 'element' as const, label: selInfo.label || 'Valt element', rect: selRect || undefined, design_id: selectedEl.dataset.designId, near_text: near || undefined }
    }
    return { kind: 'page' as const, label: 'Hela sidan', rect: undefined as undefined | { x: number; y: number; w: number; h: number }, design_id: undefined as string | undefined, near_text: undefined as string | undefined }
  }, [drawTarget, selectedEl, selInfo, selRect])

  const refreshToolNotes = useCallback(async () => {
    setToolNotesLoading(true)
    setToolNotes(await listDesignNotes())
    setToolNotesLoading(false)
  }, [])
  const removeToolNote = useCallback(async (id: string) => {
    if (await deleteDesignNote(id)) setToolNotes((n) => n.filter((x) => x.id !== id))
  }, [])
  const saveToolComment = useCallback(async () => {
    if (!toolCommentText.trim() || toolCommentSaving) return
    setToolCommentSaving(true)
    const t = commentTarget
    const region: Record<string, unknown> = {}
    if (t.kind !== 'page') {
      region.label = t.label; region.selector = t.label
      if (t.design_id) region.design_id = t.design_id
      if (t.near_text) region.near_text = t.near_text
      if (t.rect) region.rect = t.rect
    }
    const res = await saveDesignNote({ kind: 'comment', comment: toolCommentText.trim(), ...region, ...captureDesignContext() })
    setToolCommentSaving(false)
    if (res.ok) {
      setToolCommentText(''); setDrawTarget(null); setDrawRect(null)
      if (toolNotesOpen) void refreshToolNotes()
    }
    flash(res.ok ? `Kommentar sparad → design-notes (${t.label})` : 'Kunde inte spara kommentaren')
  }, [toolCommentText, toolCommentSaving, commentTarget, toolNotesOpen, refreshToolNotes, flash])

  // (b) rita-ruta-läge: fånga ett drag över RIKTIGA sidan (samma pointer-hål som
  // element-plocket) → efter släpp: knyt kommentaren till elementet under rutans mitt.
  // Chrome ([data-dt-designmode]/[data-design-tool]) filtreras bort. Deaktiverar
  // element-plocket medan det pågår (toolsPicking-gaten ovan).
  useEffect(() => {
    if (!drawComment) return
    const leftMax = dual ? winW - Math.round(centeredRightWidth(winW)) : winW
    const inLeft = (x: number, y: number) => x <= leftMax - 2 && y > HEAD_H + SUBHEAD_H
    let start: { x: number; y: number } | null = null
    const isChrome = (el: EventTarget | null) => el instanceof Element && (el.closest('[data-dt-designmode]') || el.closest('[data-design-tool]'))
    const down = (e: MouseEvent) => {
      if (isChrome(e.target) || !inLeft(e.clientX, e.clientY)) return
      e.preventDefault(); e.stopPropagation()
      start = { x: e.clientX, y: e.clientY }
      setDrawRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
    }
    const move = (e: MouseEvent) => {
      if (!start) return
      setDrawRect({ x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY), w: Math.abs(e.clientX - start.x), h: Math.abs(e.clientY - start.y) })
    }
    const up = (e: MouseEvent) => {
      if (!start) return
      const rect = { x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY), w: Math.abs(e.clientX - start.x), h: Math.abs(e.clientY - start.y) }
      start = null; setDrawComment(false); setDrawRect(null)
      if (rect.w < 6 || rect.h < 6) return
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2
      const under = document.elementFromPoint(cx, cy) as HTMLElement | null
      let label = 'Ritad ruta'
      let design_id: string | undefined
      let near_text: string | undefined
      if (under && !isChrome(under)) {
        const meaningful = (nearestMeaningfulElement(under) as HTMLElement) || under
        const nm = elementLabel(describeNode(meaningful))
        if (nm) label = nm
        design_id = meaningful.dataset?.designId
        const text = (under.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
        if (text) near_text = text
        flashReal(meaningful)
      }
      setDrawTarget({ label, rect, design_id, near_text })
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); start = null; setDrawComment(false); setDrawRect(null) } }
    document.addEventListener('mousedown', down, true)
    document.addEventListener('mousemove', move, true)
    document.addEventListener('mouseup', up, true)
    document.addEventListener('keydown', onKey, true)
    document.body.classList.add('fa-design-picking')
    return () => {
      document.removeEventListener('mousedown', down, true)
      document.removeEventListener('mousemove', move, true)
      document.removeEventListener('mouseup', up, true)
      document.removeEventListener('keydown', onKey, true)
      document.body.classList.remove('fa-design-picking')
    }
  }, [drawComment, dual, winW, flashReal])

  // ── W18/W19: dra-ruta i CSS-läget → kontextuella egenskaper + fokus-suddning ──
  // Precis som W15:s kommentar-ruta men i css-fliken: ett drag över RIKTIGA sidan
  // läser computed styles för elementen i rutan (collectBoxSamples, DOM) → dedupas/
  // klassas/token-mappas rent (summarizeBoxProps) → editorn visar BARA de egenskaperna
  // + suddar området utanför. Ett klick (litet drag) rensar filtret. App-agnostiskt.
  useEffect(() => {
    if (panelTab !== 'css' || tooSmall || !realVisible || spaceDown) return
    const leftMax = dual ? winW - Math.round(centeredRightWidth(winW)) : winW
    const inLeft = (x: number, y: number) => x <= leftMax - 2 && y > HEAD_H + SUBHEAD_H
    const isChrome = (el: EventTarget | null) => el instanceof Element && (el.closest('[data-dt-designmode]') || el.closest('[data-design-tool]'))
    let start: { x: number; y: number } | null = null
    const down = (e: MouseEvent) => {
      if (e.button !== 0 || isChrome(e.target) || !inLeft(e.clientX, e.clientY)) return
      e.preventDefault(); e.stopPropagation()
      start = { x: e.clientX, y: e.clientY }
      setBoxDrag({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
    }
    const move = (e: MouseEvent) => {
      if (!start) return
      setBoxDrag({ x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY), w: Math.abs(e.clientX - start.x), h: Math.abs(e.clientY - start.y) })
    }
    const up = (e: MouseEvent) => {
      if (!start) return
      const rect = { x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY), w: Math.abs(e.clientX - start.x), h: Math.abs(e.clientY - start.y) }
      start = null; setBoxDrag(null)
      if (rect.w < 8 || rect.h < 8) { setBoxObs(null); setBoxRect(null); setBoxCount(0); return } // klick → rensa filter
      const { samples, elements, remBase, elementCount } = collectBoxSamples(rect, pageRoot.current, (el) => !!isChrome(el))
      // R7: behåll de fångade elementen + remBase så en scopad ändring vet exakt vilka
      // element (och med vilken rem→px-bas) den ska skriva inline-stil på.
      boxElementsRef.current = elements
      boxRemBaseRef.current = remBase
      setBoxObs(summarizeBoxProps(samples, cssTokensRef.current, remBase))
      setBoxRect(rect); setBoxCount(elementCount)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); start = null; setBoxDrag(null); setBoxObs(null); setBoxRect(null); setBoxCount(0) } }
    document.addEventListener('mousedown', down, true)
    document.addEventListener('mousemove', move, true)
    document.addEventListener('mouseup', up, true)
    document.addEventListener('keydown', onKey, true)
    document.body.classList.add('fa-design-picking')
    return () => {
      document.removeEventListener('mousedown', down, true)
      document.removeEventListener('mousemove', move, true)
      document.removeEventListener('mouseup', up, true)
      document.removeEventListener('keydown', onKey, true)
      document.body.classList.remove('fa-design-picking')
    }
  }, [panelTab, tooSmall, realVisible, spaceDown, dual, winW])

  // W18: rensa ruta-filtret när css-läget lämnas (så det inte hänger kvar).
  useEffect(() => { if (panelTab !== 'css') { setBoxObs(null); setBoxRect(null); setBoxDrag(null); setBoxCount(0) } }, [panelTab])

  // ── V16: element-plock på den RIKTIGA (vänster) sidan i verktygsläget ──
  // Precis som in-app-overlayns "Välj element": klick på vänster sida klättrar till
  // närmaste MENINGSFULLA behållare (nearestMeaningfulElement – app-agnostiskt, ingen
  // hårdkodad selektor) och dockar den i höger egenskaps-panel. Shift-klick behåller
  // det råa träff-elementet. Lyssnarna ligger på document (vänster sidan är ett
  // pointer-events-hål under overlayn → träffas direkt); chrome ([data-dt-designmode]/
  // [data-design-tool]) filtreras bort. Aktivt bara när Verktyg-fliken är öppen.
  const toolsPicking = panelTab === 'tools' && realVisible && !tooSmall && !drawComment
  useEffect(() => {
    if (!toolsPicking) { setPickHover(null); return }
    const rightW = dual ? Math.round(centeredRightWidth(winW)) : 0
    const leftMax = dual ? winW - rightW : winW
    const inLeft = (x: number) => x <= leftMax - 2
    const resolve = (e: MouseEvent): HTMLElement | null => {
      const raw = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      if (!raw) return null
      if (raw.closest('[data-dt-designmode]') || raw.closest('[data-design-tool]')) return null
      return raw
    }
    const targetOf = (raw: HTMLElement, shift: boolean): HTMLElement =>
      shift ? raw : (nearestMeaningfulElement(raw) as HTMLElement)
    const move = (e: MouseEvent) => {
      if (!inLeft(e.clientX)) { setPickHover(null); return }
      const raw = resolve(e)
      if (!raw) { setPickHover(null); return }
      const r = targetOf(raw, e.shiftKey).getBoundingClientRect()
      setPickHover(r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null)
    }
    const click = (e: MouseEvent) => {
      if (!inLeft(e.clientX)) return
      const raw = resolve(e)
      if (!raw) return
      e.preventDefault(); e.stopPropagation()
      const el = targetOf(raw, e.shiftKey)
      setSelKey(null); setDrillEl(el); setPickHover(null)
      flashReal(el)
    }
    document.addEventListener('mousemove', move, true)
    document.addEventListener('click', click, true)
    document.body.classList.add('fa-design-picking')
    return () => {
      document.removeEventListener('mousemove', move, true)
      document.removeEventListener('click', click, true)
      document.body.classList.remove('fa-design-picking')
      setPickHover(null)
    }
  }, [toolsPicking, dual, winW, flashReal])

  const wfViewport = useRef<HTMLDivElement | null>(null)
  const wfCanvasRef = useRef<HTMLDivElement | null>(null) // R1: wf-transformen (imperativ synk)
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
  const vPlaceholders = mirrorWf ? mirrorWf.placeholders : placeholders
  // V17: projektionen gäller desktop-spegeln (mobil-spegeln är read-only och
  // behåller den skalenliga stacknings-layouten → tom projektion = grid-fallback).
  const vProj = mirror ? EMPTY_PROJ : proj

  // Schematisk cellbredd (logisk, oberoende av zoom). I mobil-spegeln ritas
  // wireframen i device-proportion (≈390px bred kolumn) i stället för panelbredd.
  // W1/W2 (v2.4): för desktop-spegeln sätts cellW ur den RIKTIGA sidans skala så att
  // wf-skalan k = wfScale(realW, cols·cellW) = sidans pageScale/zoom EXAKT. Då ritas
  // varje wf-låda i samma storlek/position som den riktiga → ingen skala-drift (löser
  // luft upptill, onåbar botten och sidleds-drift). Panelbredden styr inte längre wf-
  // skalan; wireframen speglar sidans faktiska bredd (som den ska), fyller inte panelen.
  // liveFit = sidans renderade skala (projScale, mätt i measureProj) ÷ wf-zoom.
  // projScale = det EXAKTA värde projektionen normaliserades med → k = projScale/zoom
  // gör wf-lådan på skärmen identisk med riktiga lådan (naturalPx × k × zoom =
  // naturalPx × projScale). Ett STATE (inte ref-läsning i render) så proj och k alltid
  // kommer från samma mätning ⇒ ingen frame-race, self-healing efter zoom/pan/resize.
  const liveFit = projScale / Math.max(0.0001, zoom)
  const cellW = mirror
    ? Math.max(8, (Math.min(wfW, MOBILE_W + 2 * WF_PAD) - 2 * WF_PAD) / cols.current)
    : Math.max(8, (realW.current * liveFit) / cols.current)

  // ── (1) Läs den riktiga sidan → bygg initial modell (grid-agnostisk) ──
  // Själva läsningen bor i buildPageModel (modul-nivå) så mobil-spegeln (A4)
  // kan återanvända exakt samma modellbygge på den emulerade mobil-layouten.
  useEffect(() => {
    if (tooSmall) return
    const container = document.querySelector('[data-grid-cols]') as HTMLElement | null
    pageRoot.current = document.querySelector('[data-page-root]') as HTMLElement | null
    if (!container) { flash('Hittade inget grid på sidan (öppna /dashboard).'); return }
    gridEl.current = container
    // W12: avläs GENERISKT om topp-containern verkligen är ett grid (inte hårdkodat).
    gridIsRealGrid.current = (getComputedStyle(container).display || '').includes('grid')
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
    setPlaceholders(model.placeholders) // R14
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
        const label = nameForElement(r.el, r.label, { slot: r.kind === 'slot' })
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
      // R8c: desktop renderas i DESKTOP_REF-bredd och skalas ner (fit) för att
      // fylla panelen → äkta desktop-layout, aldrig hopträngd i panelbredden.
      // Mobil behåller sin äkta 390px-bredd (fit = 1). B5-zoomen multipliceras på:
      // pageScale = fit × zoom är sidans faktiska visuella skala.
      const w = previewMobile ? MOBILE_W : DESKTOP_REF
      const fit = previewMobile ? 1 : Math.min(1, (s.width - 24) / DESKTOP_REF)
      // R1 · GATE-omfix: räkna geometrin ur zoomRef (auktoritativ/synkron), inte
      // ur `zoom`-STATE. `zoom` är kvar som effekt-TRIGGER men släpar efter zoomRef
      // under snabb hjul-zoom → att räkna ur state klobbrade applyZoomAts korrekta
      // imperativa placering en frame senare (spegel-glapp). zoomRef matchar alltid
      // senaste applyZoomAt ⇒ place() blir idempotent med den.
      const z = zoomRef.current
      const pageScale = fit * z
      fitRef.current = fit
      pageScaleRef.current = pageScale
      // V2: centrerad left + ev. horisontell pan-förskjutning (synk med wireframen).
      const left = s.left + (s.width - w * pageScale) / 2 + pagePanXRef.current
      root.style.position = 'fixed'
      root.style.left = `${left}px`
      root.style.top = `${s.top}px`
      root.style.width = `${w}px`
      root.style.height = `${s.height / pageScale}px`
      root.style.transform = pageScale !== 1 ? `scale(${pageScale})` : ''
      root.style.transformOrigin = '0 0'
      root.style.margin = '0'
      root.style.overflow = 'auto'
      root.style.zIndex = '10' // under .dt-root (2.1e9) → chrome/panel täcker; syns i hålet
      root.style.boxShadow = '0 10px 40px rgba(0,0,0,0.28)'
      root.style.borderRadius = '10px'
      // B5: ingen bredd-transition när zoomad (wheel ger täta uppdateringar –
      // transitionen skulle släpa efter).
      root.style.transition = (reduced || z !== 1)
        ? 'none'
        : 'width 220ms cubic-bezier(0.22,1,0.36,1), left 220ms cubic-bezier(0.22,1,0.36,1)'
      // R1 · GATE-omfix: härled wireframens pan ur sidans auktoritativa position
      // (en källa till sanning) så spegeln är pixelexakt även vid mount/resize/zoom
      // – inte bara efter en zoom-gest. Epsilon-vakt → ingen onödig re-render/loop.
      const np = mirrorPan(root.scrollTop, left - s.left, z, pageScale, WF_PAD)
      if (Math.abs(np.x - panRef.current.x) > 0.01 || Math.abs(np.y - panRef.current.y) > 0.01) {
        panRef.current = np
        setPan(np)
      }
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
      setMobileWf({ areas: model.areas, bands: model.bands, nested: model.nested, topH: th, realW: model.realW, placeholders: model.placeholders })
    }, 380)
    return () => clearTimeout(t)
  }, [mobileActive])

  // ── A4/B5: preview-växel → nollställ delad zoom/pan ──
  // Spegel-modellen mäts ur riktiga DOM-rects; en aktiv transform-skala skulle
  // förvränga geometrin. Växeln är dessutom ett naturligt "börja om"-ögonblick.
  // L2: nollställ bara på en FAKTISK preview-växling – inte på mount (default är
  // ändå 1) – annars klobbrar den återställd zoom/pan (och StrictMode-dubbel-
  // invokeringen på mount skulle skriva över utan värde-jämförelsen nedan).
  const prevPreviewMobile = useRef(previewMobile)
  useEffect(() => {
    if (prevPreviewMobile.current === previewMobile) return
    prevPreviewMobile.current = previewMobile
    cancelInertia(); cancelZoomAnim() // L1: växel avbryter ev. glidning
    // R1 · GATE-omfix: nollställ även sidans scrollTop + horisontella pan så den nya
    // preview-modellen mäts från dokumentets topp; place() härleder sedan pan (spegel).
    const root = pageRoot.current
    if (root) root.scrollTop = 0
    pagePanXRef.current = 0
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [previewMobile, cancelInertia, cancelZoomAnim])

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
      // A2/R9: dra-höjd på topp-block – FAST höjd ELLER en dragen AUTO-override.
      // Diff mot init-höjden ⇒ explicit px (override); ingen diff ⇒ init-höjden
      // tillbaka (auto blir auto igen). Inline-style, dirty-spårad för undo/redo.
      const info = topH[a.key]
      if (info) {
        ref.el.style.height = isHeightOverride(info.hpx, info.origPx) ? `${Math.round(info.hpx)}px` : ref.orig.height
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
      // A2/R9: dra-höjd. FAST höjd → skriv på det bärande elementet (delta mot dess
      // init-höjd, så inre kort med padding/rubrik följer med). AUTO-region (inget
      // bärande element) → explicit override-höjd direkt på regionens element (r.el),
      // så vilken region som helst går att dra högre/lägre. Diff mot origH ⇒ px;
      // ingen diff ⇒ init-inline (auto igen). Dirty-spårad för undo/redo.
      if (r.fixedEl) {
        const dh = r.hpx - r.origH
        r.fixedEl.style.height = (r.fixedH && isHeightOverride(r.hpx, r.origH))
          ? `${Math.round(r.fixedOrigPx + dh)}px`
          : r.fixedOrigInline
      } else {
        r.el.style.height = isHeightOverride(r.hpx, r.origH) ? `${Math.round(r.hpx)}px` : r.elOrigInline
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

  // ── V17: mät om PROJEKTIONEN (naturliga dokument-rects per låda) ──
  // Läser varje låd-elements faktiska bounding-box och normaliserar bort sidans
  // transform-skala (pageScale) + container-origo → naturliga dokument-px. Wireframen
  // renderas sedan som `rect × k, samma origo`, så en horisontell linje vid samma
  // dokument-Y träffar samma kant i båda panelerna. App-agnostiskt (bara geometri).
  const measureProj = useCallback(() => {
    const container = gridEl.current
    if (!container) return
    const cRect = container.getBoundingClientRect()
    // W1/W2: sidans FAKTISKT renderade skala mätt ur REN DOM-geometri – getBounding-
    // ClientRect().width (transform-skalad, skärm-px) ÷ offsetWidth (o-transformerad
    // layout-bredd). offsetWidth påverkas inte av CSS-transform → kvoten = exakt den
    // pageScale sidan syns med, oberoende av pageScaleRef (som kunde ligga kvar på ett
    // gammalt zoom-värde → k glider isär). Samma ps driver BÅDE projektionen här OCH
    // wf-skalan k (projScale/zoom) ⇒ wf-låda == riktig låda på skärmen, self-healing.
    const offW = container.offsetWidth
    const ps = offW > 0 ? cRect.width / offW : (pageScaleRef.current || 1)
    setProjScale((p) => (Math.abs(p - ps) > 0.0005 ? ps : p))
    const padLeft = parseFloat(getComputedStyle(container).paddingLeft || '0') || 0
    const boxes: RawBox[] = []
    const add = (id: string, el: HTMLElement | null | undefined) => {
      if (!el) return
      const r = el.getBoundingClientRect()
      boxes.push({ id, left: r.left, top: r.top, width: r.width, height: r.height })
    }
    realRefs.current.forEach((ref, i) => add(String(i), ref.el))
    for (const b of bandsRef.current) if (!b.locked) add(b.id, b.el)
    // R5: låsta band = sticky element. Deras getBoundingClientRect står STILL på skärmen
    // när sidan skrollar (och deras kumulativa offsetTop VÄXER med skrollen medan de är
    // "stuck") → mätt live driver bandet nedåt så det flyter över andra rutor på en fast
    // skärm-Y. Projicera dem på sin NATURLIGA FLÖDES-position i stället: min:et av den
    // kumulativa offseten (nås vid oskrollat läge) MINUS containerns offset → bandet följer
    // dokumentet som allt annat. Ren geometri, app-agnostiskt.
    const co = cumulativeOffset(container)
    const seenLocked = new Set<string>()
    for (const b of bandsRef.current) {
      if (!b.locked || !b.el) continue
      seenLocked.add(b.id)
      const r = b.el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      const cur = cumulativeOffset(b.el)
      const prev = stickyFlowRef.current.get(b.id)
      const flow = prev ? { top: Math.min(prev.top, cur.top), left: Math.min(prev.left, cur.left) } : cur
      stickyFlowRef.current.set(b.id, flow)
      boxes.push(stickyNaturalBox(b.id, flow.left - co.left, flow.top - co.top, r.width, r.height, cRect.left, cRect.top, ps))
    }
    // Städa cachen från band som inte längre finns (sid-/layoutbyte) så en gammal
    // (ev. lägre) flödes-position inte överlever till ett nytt band med samma id.
    for (const id of Array.from(stickyFlowRef.current.keys())) if (!seenLocked.has(id)) stickyFlowRef.current.delete(id)
    for (const r of nestedRef.current) add(r.id, r.el)
    const next = buildProjection(boxes, cRect.left, cRect.top, ps, padLeft)
    setProj((prev) => (projectionEqual(prev, next) ? prev : next))
  }, [])

  useEffect(() => {
    if (tooSmall || mobileActive) return // A4: mät inte desktop-höjder ur mobil-layouten
    const id = requestAnimationFrame(() => { measureLive(); measureProj() })
    return () => cancelAnimationFrame(id)
  }, [areas, nested, topH, tooSmall, mobileActive, measureLive, measureProj])
  // V17: följ live-omgriddning/pageScale-ändring (zoom/pan/reflow) med en billig
  // poll så projektionen aldrig blir gammal (samma frekvens som selektions-synken).
  useEffect(() => {
    if (tooSmall || mobileActive) return
    const id = window.setInterval(measureProj, 350)
    return () => window.clearInterval(id)
  }, [tooSmall, mobileActive, measureProj])
  // A4: efter växel tillbaka till desktop – vänta ut bredd-transitionen och mät om.
  useEffect(() => {
    if (tooSmall || mobileActive) return
    const t = setTimeout(() => { measureLive(); measureProj() }, 380)
    return () => clearTimeout(t)
  }, [mobileActive, tooSmall, measureLive, measureProj])

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

  // ── B5 + L1: DELAD zoom kring en FAST punkt – wireframen zoomar om punkten och
  // vänster sida följer via transform-skala + scroll som håller SAMMA dokument-Y
  // stilla. `focus` (viewport-px) = pekarens läge vid ctrl+scroll (L1 · fokuspunkts-
  // zoom); utan focus = panelernas mitt (knapp/tangent, B5). Punkten under pekaren
  // står stilla i BÅDA panelerna. En zoom-nivå → alltid identisk i båda (spegel).
  const applyZoomAt = useCallback((next: number, focus?: { x: number; y: number }) => {
    const z0 = zoomRef.current
    const z1 = clampZoom(next)
    if (z1 === z0) return
    const root = pageRoot.current
    const stageEl = stageRef.current
    const fit = fitRef.current
    if (root && stageEl && realVisible) {
      // R1 · GATE-omfix: den RIKTIGA sidans dokument-position är AUKTORITATIV och
      // wireframens pan HÄRLEDS ur den (mirrorPan) → spegeln är pixelexakt och kan
      // inte driva isär vid cursor-ankrad hjul-zoom (browsern klampar scrollTop;
      // pan följer den faktiska/klampade positionen, aldrig en egen formel).
      const s = stageEl.getBoundingClientRect()
      const ps0 = fit * z0
      const ps1 = fit * z1
      const wPage = previewMobile ? MOBILE_W : DESKTOP_REF
      // Applicera sidans NYA skala/höjd SYNKRONT (annars sätter place() dem först
      // nästa frame → sidan renderas 1 frame i gammal skala medan scroll/pan är nya
      // ⇒ stort vertikalt spegelglapp vid stora docY under aktiv zoom). Skala/höjd
      // FÖRST så scrollTop klampas mot den nya scroll-räckvidden. Ingen transition
      // under zoom (place() återställer den när man landar på z=1).
      pageScaleRef.current = ps1
      root.style.transform = ps1 !== 1 ? `scale(${ps1})` : ''
      root.style.height = `${s.height / ps1}px`
      root.style.transition = 'none'
      // Vertikal: håll doc-Y under pekaren stilla PÅ SIDAN (klampas av browsern).
      const focusY = focus ? Math.max(0, Math.min(s.height, focus.y - s.top)) : s.height / 2
      root.scrollTop = pageZoomScroll(root.scrollTop, s.height, ps0, ps1, focusY)
      const scrollTop = root.scrollTop // faktisk (klampad) → pan följer exakt
      // Horisontell: håll doc-X under pekaren stilla; flytta sidans vänsterkant.
      const focusX = focus ? Math.max(0, Math.min(s.width, focus.x - s.left)) : s.width / 2
      const left0Rel = (parseFloat(root.style.left) || s.left) - s.left
      const left1Rel = pageLeftZoom(left0Rel, ps0, ps1, focusX)
      pagePanXRef.current = left1Rel - (s.width - wPage * ps1) / 2
      root.style.left = `${s.left + left1Rel}px`
      // Härled wireframens pan ur den auktoritativa sid-positionen (en källa till
      // sanning) → dyAlign = dxAlign = 0 alltid, symmetriskt klampat med sidan.
      const np = mirrorPan(scrollTop, left1Rel, z1, ps1, WF_PAD)
      zoomRef.current = z1
      panRef.current = np
      // Uppdatera wf-transformen IMPERATIVT + synkront (som sidans scrollTop/left) så
      // wireframen aldrig släpar en frame efter sidan under snabb hjul-zoom (Reacts
      // setPan är async). React skriver samma värde vid nästa render (idempotent).
      if (wfCanvasRef.current) wfCanvasRef.current.style.transform = `translate(${np.x}px, ${np.y}px) scale(${z1})`
      // R1 · GATE-omfix: driv projScale SYNKRONT ur den auktoritativa sid-skalan.
      // wf-lådornas skala k = projScale/zoom och projScale MÄTS annars ur den skalade
      // DOM:en (pollas var 350ms) → under zoom släpade k (= fit·z0/z1 ≠ fit) tills
      // mätningen hann ikapp ⇒ lådorna hamnade fel vertikalt (∝ docY). ps1 = fit·z1 ⇒
      // k = fit direkt. Mätningen kvarstår som self-healing kryss-koll.
      setProjScale((p) => (Math.abs(p - ps1) > 0.0005 ? ps1 : p))
      setZoom(z1)
      setPan(np)
    } else {
      // Enkel-panel wireframe (ingen riktig sida att spegla) → zooma kring pekaren.
      const vp = wfViewport.current?.getBoundingClientRect()
      const vw = vp?.width ?? 600
      const vh = vp?.height ?? 400
      const cx = focus && vp ? Math.max(0, Math.min(vw, focus.x - vp.left)) : vw / 2
      const cy = focus && vp ? Math.max(0, Math.min(vh, focus.y - vp.top)) : vh / 2
      const np = zoomAtPoint(panRef.current, z0, z1, cx, cy)
      zoomRef.current = z1
      panRef.current = np
      setZoom(z1)
      setPan(np)
    }
  }, [realVisible, previewMobile])
  // L1: mjuk zoom-interpolation för knapp/tangent-STEG (±). Kort ease-out (≤ZOOM_LERP_MS)
  // så zoomen mjuknar utan att kännas trög; avbryts av nästa zoom/gest. reduced → hopp.
  const animateZoomTo = useCallback((target: number, focus?: { x: number; y: number }) => {
    cancelZoomAnim()
    const z0 = zoomRef.current
    const z1 = clampZoom(target)
    if (z1 === z0) return
    if (reduced) { applyZoomAt(z1, focus); return }
    const t0 = performance.now()
    const step = () => {
      const t = performance.now() - t0
      applyZoomAt(zoomLerp(z0, z1, t, ZOOM_LERP_MS, false), focus)
      if (t < ZOOM_LERP_MS) { zoomRaf.current = requestAnimationFrame(step) }
      else { zoomRaf.current = null; applyZoomAt(z1, focus) }
    }
    zoomRaf.current = requestAnimationFrame(step)
  }, [applyZoomAt, cancelZoomAnim, reduced])

  // ── L1: PAN-INERTIA – decelererande utglidning som driver BÅDA panelerna via
  // exakt samma doc-delta-synk som ett drag. Startas vid släpp om fling-hastigheten
  // (doc-px/ms, EMA-utjämnad) är värd det; annars hård stopp. Stannar mjukt vid
  // dokumentgränser (applicerat scroll-delta blir 0 → dämpa den axeln). AVBRYTBAR. ──
  const startInertia = useCallback((vx: number, vy: number) => {
    cancelInertia()
    if (reduced || !shouldGlide(vx, vy)) return
    const dur = Math.max(glideDuration(vx), glideDuration(vy))
    if (dur <= 0) return
    const k = wfRef.current.k
    const z = zoomRef.current
    const t0 = performance.now()
    let last = t0
    const step = () => {
      const now = performance.now()
      const t = now - t0
      const dt = Math.min(48, now - last) // klampa långa frame-gap
      last = now
      const root = pageRoot.current
      // Momentana hastigheter (doc-px/ms) → doc-delta denna frame.
      const dDocY = glideVelocity(vy, t) * dt
      const dDocX = glideVelocity(vx, t) * dt
      if (root && realVisible) {
        // Vertikal: driv sidans skroll, låt wf-pan följa det FAKTISKT applicerade
        // deltat (klampas vid ändar → båda stannar tillsammans, ingen flyger iväg).
        const before = root.scrollTop
        root.scrollTop = before + dDocY
        const appliedY = root.scrollTop - before
        // Horisontell: doc-x → sidans skärm-förskjutning (× pageScale) + wf-pan.x.
        const dScreenX = dDocX * pageScaleRef.current
        const left0 = parseFloat(root.style.left) || 0
        pagePanXRef.current += dScreenX
        root.style.left = `${left0 + dScreenX}px`
        const np = {
          x: panRef.current.x + dDocX * k * z,
          y: panRef.current.y + wfPanFromDocDelta(appliedY, z, k),
        }
        panRef.current = np
        setPan(np)
        // Mjuk gräns: nådde vi dokumentets kant vertikalt → sluta glida direkt.
        if (Math.abs(appliedY) < 0.01 && Math.abs(dDocY) > 0.01) { cancelInertia(); return }
      } else {
        const np = { x: panRef.current.x + dDocX, y: panRef.current.y + dDocY }
        panRef.current = np
        setPan(np)
      }
      if (t < dur) { inertiaRaf.current = requestAnimationFrame(step) }
      else { inertiaRaf.current = null }
    }
    inertiaRaf.current = requestAnimationFrame(step)
  }, [cancelInertia, reduced, realVisible])
  // L1: hastighets-spårning i DOKUMENT-px/ms under ett pan-drag (EMA-utjämnad så en
  // enda ryckig sample inte skjuter iväg glidningen). resetVel vid drag-start.
  const resetVel = useCallback(() => { velRef.current = { vx: 0, vy: 0, t: performance.now(), dx: 0, dy: 0 } }, [])
  const sampleVel = useCallback((docX: number, docY: number) => {
    const now = performance.now()
    const dt = now - velRef.current.t
    if (dt > 4) {
      const ivx = (docX - velRef.current.dx) / dt
      const ivy = (docY - velRef.current.dy) / dt
      velRef.current = {
        vx: blendVelocity(velRef.current.vx, ivx),
        vy: blendVelocity(velRef.current.vy, ivy),
        t: now, dx: docX, dy: docY,
      }
    }
  }, [])
  /** Fling-hastighet vid släpp: 0 om pekaren stått still en stund (grepp-och-håll → ingen glid). */
  const releaseVel = useCallback((): { vx: number; vy: number } => {
    const idle = performance.now() - velRef.current.t
    return idle > 60 ? { vx: 0, vy: 0 } : { vx: velRef.current.vx, vy: velRef.current.vy }
  }, [])
  // Städa pågående animationer på unmount (avsluta Design mode).
  useEffect(() => () => {
    cancelInertia(); cancelZoomAnim()
    if (bounceRaf.current != null) cancelAnimationFrame(bounceRaf.current)
  }, [cancelInertia, cancelZoomAnim])

  // ── R2/R3/R4: EN wheel-handler på fönstret (capture-fas) styr all skroll/zoom
  // i design mode. Fokus-oberoende (fästs på window, inte på en panel):
  //   • Ctrl/⌘+wheel (och pinch-trackpad) → zoomar BÅDA vyerna (B5).
  //   • Övrig wheel → SYNKAD skroll: den riktiga sidan scrollas och wireframens
  //     pan följer det FAKTISKT applicerade dokument-deltat → båda vyerna pekar
  //     på samma ställe och stannar samtidigt vid dokumentets ändar (R2).
  //   • Capture + stopPropagation → inre element (MapLibre-kartan m.m.) får
  //     ALDRIG eventet → ingen inre kart-zoom/scroll i design mode (R3).
  //   • Egenskaps-panelen (data-dt-native-scroll) undantas → skrollar nativt.
  useEffect(() => {
    if (tooSmall) return
    const onWheel = (e: WheelEvent) => {
      if (exitAskRef.current) return // spara-dialog öppen → rör inte
      // W16: i css-läge finns ingen wireframe att synka mot, MEN sidan ska ändå gå att
      // zooma (pageScale) och skrolla – och den inre kart-zoomen ska vara LÅST som i
      // andra flikar. Vi capture:ar därför wheeln även här (stopPropagation → MapLibre
      // m.fl. får aldrig eventet) men driver bara sidan, inte wireframe-pan.
      const cssNow = panelTabRef.current === 'css'
      // L1: valfri wheel-gest avbryter en pågående inertia/zoom-anim direkt (aldrig väntan).
      cancelInertia(); cancelZoomAnim()
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        if (cssNow) e.stopPropagation() // W16: lås inre kart-zoom i css-läge
        // L1 · fokuspunkts-zoom: zooma mot PEKAREN (per-tick, snärtigt) → punkten
        // under pekaren står stilla i båda panelerna.
        applyZoomAt(zoomRef.current * wheelZoomFactor(e.deltaY), { x: e.clientX, y: e.clientY })
        return
      }
      const t = e.target as HTMLElement | null
      if (t?.closest?.('[data-dt-native-scroll]')) return // egen skrollyta → nativ skroll
      e.preventDefault()
      e.stopPropagation()
      const z = zoomRef.current
      const k = wfRef.current.k
      // R8c: skärm-px → dokument-px via sidans FAKTISKA visuella skala (pageScale),
      // inte wireframens zoom (sidan renderas i desktop-referens × fit).
      const dDoc = scrollSyncDoc(e.deltaY, pageScaleRef.current)
      const root = pageRoot.current
      if (root && realVisible) {
        const before = root.scrollTop
        root.scrollTop = before + dDoc
        const applied = root.scrollTop - before // klampat vid dokumentets ändar
        // W16: css-läge skrollar bara sidan (ingen wireframe-pan att uppdatera).
        if (cssNow) return
        const np = { x: panRef.current.x, y: panRef.current.y + wfPanFromDocDelta(applied, z, k) }
        panRef.current = np
        setPan(np)
      } else if (cssNow) {
        return
      } else {
        // Enkel-panel wireframe (ingen riktig sida att synka mot) → panorera fritt.
        const np = { x: panRef.current.x, y: panRef.current.y - e.deltaY }
        panRef.current = np
        setPan(np)
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => window.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions)
  }, [tooSmall, applyZoomAt, realVisible, cancelInertia, cancelZoomAnim])

  // ── B6/V14: osparat-signal (ÅTERANVÄNDS av Avsluta-dialogen, Spara-dialogen och
  // beforeunload-skyddet). true ⇔ modellens signatur skiljer sig från senaste
  // Spara/init → det finns strukturella/layout-ändringar som inte sparats. ──
  const isDirty = useCallback(() => layoutSignature(snap()) !== savedSig.current, [snap])
  // V15: osparat = strukturella ELLER css-tema-ändringar (båda skyddas av Avsluta-/
  // beforeunload-dialogerna; css-signaturen läses via ref så callbacken förblir stabil).
  const anyDirty = useCallback(() => isDirty() || cssSigRef.current !== savedCssSig.current, [isDirty])

  // ── V14 (Tema M): native beforeunload-skydd ──
  // Stäng flik/fönster, navigera bort eller reload MED osparade ändringar → visa
  // webbläsarens inbyggda "lämna utan att spara?"-bekräftelse (kompletterar den
  // in-app Avsluta-dialogen, som bara täcker verktygets eget avslut). Aktiveras
  // bara när isDirty() är sant; lyssnaren städas på unmount (se useUnsavedGuard).
  // W27: en avsiktlig "Byt sida"-navigering sparar utkastet FÖRST → då ska den
  // native lämna-varningen inte trigga (annars dubbel-fråga för redan sparat arbete).
  useUnsavedGuard(useCallback(() => anyDirty() && !intentionalNavRef.current, [anyDirty]))
  const anyDirtyRef = useRef(anyDirty)
  useEffect(() => { anyDirtyRef.current = anyDirty }, [anyDirty])

  // ── L2 (v2.3): "minns arbetsytan" – återställ + autospara ────────────────────
  // (a) VY-TILLSTÅND (zoom/pan/val/panelflik/mät) återställs TYST. (b) UTKASTET
  // (osparade FW3-intentioner + FW7-css-tweaks) återställs MED en diskret notis så
  // man aldrig tappar arbete vid en oavsiktlig reload/krasch. Körs EN gång, efter
  // att sid-modellen byggts (areas satta → realRefs finns för selKey-validering).
  useEffect(() => {
    if (tooSmall || restoredRef.current || areasRef.current.length === 0) return
    restoredRef.current = true
    const v = loadView(scope)
    if (v) {
      zoomRef.current = v.zoom; setZoom(v.zoom)
      panRef.current = v.pan; setPan(v.pan)
      setMeasure(v.measure)
      if (v.selKey != null && realRefs.current[Number(v.selKey)]) setSelKey(v.selKey)
      if (v.panelTab === 'css') openCssTab()
      else if (v.panelTab === 'tools') setPanelTab('tools')
    }
    const d = loadDraft(scope)
    if (draftHasContent(d) && d) {
      if (Object.keys(d.intents).length > 0) { intentsRef.current = d.intents; setIntents(d.intents) }
      const cssKeys = Object.keys(d.css)
      if (cssKeys.length > 0) {
        if (cssTokensRef.current.length === 0) {
          const toks = enumerateThemeTokens(); cssTokensRef.current = toks; setCssTokens(toks)
        }
        for (const [n, val] of Object.entries(d.css)) applyTweak(n, val)
        cssOverridesRef.current = d.css; setCssOverrides(d.css)
      }
      setDraftRestored(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, tooSmall, scope])

  // Autospara VY-TILLSTÅNDET debouncat (aldrig blockerande – 300 ms efter senaste
  // ändring). Gate:at på restoredRef så vi inte skriver över det sparade före retur.
  useEffect(() => {
    if (!restoredRef.current || tooSmall) return
    const t = window.setTimeout(() => {
      saveView(scope, { zoom: zoomRef.current, pan: panRef.current, selKey, panelTab, measure })
    }, 300)
    return () => window.clearTimeout(t)
  }, [zoom, pan, selKey, panelTab, measure, scope, tooSmall])

  // Autospara UTKASTET debouncat (400 ms). Bara medan det finns OSPARAT arbete
  // (anyDirty) – efter en Spara/nollställning skrivs i stället en rensning, så
  // återställnings-notisen inte dyker upp för redan sparat/tomt arbete.
  useEffect(() => {
    if (!restoredRef.current || tooSmall) return
    const t = window.setTimeout(() => {
      if (anyDirtyRef.current()) saveDraft(scope, { intents: intentsRef.current, css: cssOverridesRef.current })
      else clearDraft(scope)
    }, 400)
    return () => window.clearTimeout(t)
  }, [intents, cssOverrides, scope, tooSmall])

  // "Förkasta" i återställnings-notisen: släng det återställda utkastet helt
  // (intentioner + css-overrides) och rensa lagret. Avfärda (×) döljer bara notisen
  // men behåller det återställda arbetet.
  const discardDraft = useCallback(() => {
    intentsRef.current = {}; setIntents({})
    for (const n of Object.keys(cssOverridesRef.current)) clearTweak(n)
    cssOverridesRef.current = {}; setCssOverrides({})
    cssPast.current = []; cssFuture.current = []; bumpCss()
    clearDraft(scope)
    setDraftRestored(false)
    flash('Utkast förkastat')
  }, [scope, flash, bumpCss])

  // ── B6: Avsluta → spara-dialog om modellen har osparade ändringar ──
  const requestExit = useCallback(() => {
    if (anyDirty()) { setExitAsk(true); return }
    onExit()
  }, [onExit, anyDirty])

  // ── W27: navigera till en annan sida i appen, med osparat bevarat ──
  // Flush:ar vy-tillstånd + utkast till den AKTUELLA sidans scope (så inget tappas
  // om debouncad autospar ännu inte hunnit), markerar att Design mode ska återöppnas
  // på destinationen, och gör en hård navigering (app-agnostiskt – ingen router-
  // koppling; en full sid-load ger en ren ommätning av den nya sidan). Osparat på
  // ursprungssidan ligger kvar i localStorage och återställs när man kommer tillbaka.
  const navigateTo = useCallback((raw: string) => {
    const dest = (raw || '').trim()
    if (!dest) return
    try {
      saveView(scope, { zoom: zoomRef.current, pan: panRef.current, selKey, panelTab, measure })
      if (anyDirtyRef.current()) saveDraft(scope, { intents: intentsRef.current, css: cssOverridesRef.current })
    } catch { /* privat-läge – navigera ändå */ }
    markReopenDesignMode()
    intentionalNavRef.current = true // V14-guarden ska inte fråga (redan sparat)
    setNavOpen(false)
    window.location.assign(dest)
  }, [scope, selKey, panelTab, measure])

  // ── Tangentbord: undo/redo + zoom + space-pan ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // B6: medan Avsluta-dialogen är öppen gäller bara Escape (= Avbryt).
      if (exitAskRef.current) {
        if (e.key === 'Escape') { e.preventDefault(); setExitAsk(false) }
        return
      }
      // R11: medan namnge-dialogen är öppen – blockera design-genvägar (space-pan,
      // undo/zoom) men låt fältet ta emot vanlig text. Escape avbryter (Enter sparar
      // via fältets egen onKeyDown).
      if (saveAskRef.current) {
        if (e.key === 'Escape') { e.preventDefault(); setSaveAsk(false); exitAfterSaveRef.current = false }
        return
      }
      // W27: medan "Byt sida"-popovern är öppen – låt fältet ta emot text, men
      // blockera design-genvägar; Escape stänger popovern (inte Avsluta Design mode).
      if (navOpenRef.current) {
        if (e.key === 'Escape') { e.preventDefault(); setNavOpen(false) }
        return
      }
      // R4: spärra webbläsarens spacebar-sid-scroll (space är pan-modifier här).
      if (e.code === 'Space' && !isTyping(e)) { e.preventDefault(); setSpaceDown(true) }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        // V15: i css-läge stegar ⌘Z css-historiken – men låt ett fokuserat textfält
        // behålla sin egen native text-undo (då stegar man inte tema-historiken).
        if (panelTabRef.current === 'css') {
          if (isTyping(e)) return
          e.preventDefault(); e.shiftKey ? cssRedo() : cssUndo()
        } else {
          e.preventDefault(); e.shiftKey ? redo() : undo()
        }
      }
      // L1: tangent-zoom → mjuk kort interpolation (centrerad); avbryter ev. inertia.
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); cancelInertia(); animateZoomTo(zoomRef.current + 0.15) }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); cancelInertia(); animateZoomTo(zoomRef.current - 0.15) }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        // R1 · GATE-omfix: nollställ HELA den auktoritativa sid-positionen (zoom,
        // scrollTop, horisontell pan) och HÄRLED wireframens pan ur den → pixelexakt
        // spegel även om man var panorerad utan att ha zoomat (då triggar inte place).
        e.preventDefault(); cancelInertia(); cancelZoomAnim()
        const root = pageRoot.current
        const stageEl = stageRef.current
        if (root && stageEl && realVisible) {
          const s = stageEl.getBoundingClientRect()
          const fit = fitRef.current
          const centering = (s.width - (previewMobile ? MOBILE_W : DESKTOP_REF) * fit) / 2
          root.scrollTop = 0
          root.style.left = `${s.left + centering}px`
          pagePanXRef.current = 0
          const np = mirrorPan(0, centering, 1, fit, WF_PAD)
          zoomRef.current = 1; panRef.current = np
          if (wfCanvasRef.current) wfCanvasRef.current.style.transform = `translate(${np.x}px, ${np.y}px) scale(1)`
          setZoom(1); setPan(np)
        } else {
          zoomRef.current = 1; panRef.current = { x: 0, y: 0 }; pagePanXRef.current = 0; setZoom(1); setPan({ x: 0, y: 0 })
        }
      }
      if (e.key === 'Escape') requestExit()
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceDown(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [undo, redo, cssUndo, cssRedo, requestExit, animateZoomTo, cancelInertia, cancelZoomAnim, previewMobile, realVisible])

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
    // R2: enkelt vänsterklick på TOM canvas-yta (ej pan, ej ⇧) → avmarkera allt.
    // Lådorna stoppar sin egen pointerdown → denna når bara den tomma ytan.
    if (e.button === 0 && !spaceDown && !e.shiftKey) clearSelection()
    if (!(spaceDown || e.button === 1)) return
    e.preventDefault()
    cancelInertia(); cancelZoomAnim(); resetVel() // L1: ny gest avbryter ev. glidning direkt
    setPanning(true)
    const start = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    const root = pageRoot.current
    const scroll0 = root?.scrollTop ?? 0
    const left0 = root ? (parseFloat(root.style.left) || 0) : 0
    const panX0 = pagePanXRef.current
    const k = wfRef.current.k
    const z = zoomRef.current
    const move = (ev: PointerEvent) => {
      const dxScreen = ev.clientX - start.x
      const dyScreen = ev.clientY - start.y
      if (root && realVisible) {
        // R5: driv sidans skroll av wireframe-draget och låt pan följa det
        // FAKTISKT applicerade dokument-deltat → vänster sida panoreras likadant
        // och båda vyerna stannar tillsammans vid dokumentets ändar (spegel).
        root.scrollTop = scroll0 + docDeltaFromWfPan(dyScreen, z, k)
        const appliedDoc = root.scrollTop - scroll0
        // V2: horisontell synk – wireframens sidleds-drag (dxScreen wf-px) → dokument-
        // delta (÷ k·zoom) → sidans skärm-förskjutning (× pageScale). Sidan flyttas
        // likadant i sidled så båda panelerna speglar varandra horisontellt.
        const dxDoc = dxScreen / (Math.max(0.0001, k) * Math.max(0.01, z))
        const dPan = dxDoc * pageScaleRef.current
        pagePanXRef.current = panX0 + dPan
        root.style.left = `${left0 + dPan}px`
        setPan({ x: start.px + dxScreen, y: start.py + wfPanFromDocDelta(appliedDoc, z, k) })
        sampleVel(dxDoc, appliedDoc) // L1: doc-px/ms för inertia
      } else {
        setPan({ x: start.px + dxScreen, y: start.py + dyScreen })
        sampleVel(dxScreen, dyScreen)
      }
    }
    const up = () => {
      setPanning(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      const v = releaseVel(); startInertia(v.vx, v.vy) // L1: kort utglidning (om fling)
    }
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
    cancelInertia(); cancelZoomAnim(); resetVel() // L1: ny gest avbryter ev. glidning direkt
    setPanning(true)
    const startX = e.clientX
    const startY = e.clientY
    const scroll0 = root.scrollTop
    const left0 = parseFloat(root.style.left) || 0
    const panX0 = pagePanXRef.current
    const pan0 = panRef.current
    const z = zoomRef.current
    const k = wfRef.current.k
    const move = (ev: PointerEvent) => {
      // R8c: sidans grab-drag i skärm-px → dokument-px via sidans faktiska skala
      // (pageScale); wireframens pan följer via wireframe-zoomen (z).
      root.scrollTop = scroll0 + docDeltaFromPagePan(ev.clientY - startY, pageScaleRef.current)
      const dDoc = root.scrollTop - scroll0
      // V2: sidans grab-drag i sidled flyttar sidan direkt (skärm-px) och wireframens
      // pan.x följer via dokument-x → k·zoom, så båda panelerna dras i synk.
      const dxScreen = ev.clientX - startX
      pagePanXRef.current = panX0 + dxScreen
      root.style.left = `${left0 + dxScreen}px`
      const dxDoc = dxScreen / Math.max(0.01, pageScaleRef.current)
      setPan({ x: pan0.x + dxDoc * k * z, y: pan0.y + wfPanFromDocDelta(dDoc, z, k) })
      sampleVel(dxDoc, dDoc) // L1: doc-px/ms för inertia
    }
    const up = () => {
      setPanning(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      const v = releaseVel(); startInertia(v.vx, v.vy) // L1: kort utglidning (om fling)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // ── V9 (FW3): FRI flytt/resize av ett topp-block = intent-overlay ovanpå projektionen ──
  // Att flytta/resiza är en INTENTION/skiss, inte riktig struktur: lådan ritas exakt
  // där användaren släpper (i projektionens dokument-px-rum) och skrivs ALDRIG till
  // sidans grid → osynliga containers knuffar aldrig icke-berörda grannar. Under hela
  // gesten lever både lådan och snap-linjerna i projektionens koordinater (de
  // sammanfaller därför exakt med de projicerade lådorna – löser FW1:s begränsning).
  // Snap mot grannkant behålls (skiftar bara den DRAGNA lådans kant, rör aldrig grannen).
  // Släpp → intenten persisteras (spara-payload + historik för undo/redo).
  // Generell fri-drag: används av topp-blocken OCH av lyfta nästlade rutor (W5) –
  // en nästlad ruta som lyfts ur sin container blir en fri intent-skiss och dras
  // därefter som vilken fri låda som helst. `flashEl` = riktiga elementet att blixta
  // vid noll-flytt (topp-block: grid-barnet; nästlad: r.el).
  const startFreeDrag = (
    e: React.PointerEvent, key: string, label: string, flashEl: HTMLElement | null, mode: IntentMode,
  ) => {
    if (spaceDown) return
    if (mirror) { e.preventDefault(); flash(MIRROR_MSG); return }
    // ⇧-klick = multi-select för align/distribute (dra INTE).
    if (e.shiftKey && mode === 'move') { e.preventDefault(); e.stopPropagation(); toggleSel(key); return }
    e.preventDefault(); e.stopPropagation()
    cancelInertia(); cancelZoomAnim(); resetBounce() // L1: grepp avbryter ev. glidning
    const startSnap = snap()                          // pre-drag → historik-post vid commit
    // Bas = nuvarande effektiva rect (befintlig intent, annars vilo-projektionen).
    const baseRect = intentsRef.current[key]?.rect ?? projRef.current[key]
    if (!baseRect) { flash('Ingen projektion att flytta ännu'); return }
    // Bevara den URSPRUNGLIGA basen (projektionen då intenten först skapades) så
    // payloadens delta/​dirty-detektering är stabil även vid upprepade drag.
    const origBase = intentsRef.current[key]?.base ?? projRef.current[key] ?? baseRect
    const k = wfRef.current.k || 1
    const start = clientToCanvas(e.clientX, e.clientY)
    // Snap-kandidater = alla ANDRA lådors kanter (topp-block + band) ur deras
    // aktuella effektiva rect (intent om satt, annars projektionen).
    const rectMap: Record<string, IntentRect> = {}
    for (const [id, r] of Object.entries(projRef.current)) rectMap[id] = intentsRef.current[id]?.rect ?? r
    const { xEdges, yEdges } = candidateEdges(rectMap, key)
    const tolDoc = 8 / k                              // ~8 wf-px snap-tolerans i doc-px
    let live: IntentRect = baseRect
    setDrag({ key, mode, label, rect: baseRect, snapX: null, snapY: null })
    const move = (ev: PointerEvent) => {
      const p = clientToCanvas(ev.clientX, ev.clientY)
      const dxDoc = (p.x - start.x) / k
      const dyDoc = (p.y - start.y) / k
      const raw = applyGesture(baseRect, mode, dxDoc, dyDoc)
      const s = snapRect(raw, xEdges, yEdges, tolDoc, mode)
      live = s.rect
      // L1: en NY snap-kant (mot grannkant/grid) engagerade → mikro-studs som bekräftelse.
      const sig = `${s.snapX ?? ''}|${s.snapY ?? ''}`
      const engaged = s.snapX != null || s.snapY != null
      if (engaged && sig !== snapSigRef.current) triggerBounce()
      if (!engaged) snapSigRef.current = ''; else snapSigRef.current = sig
      setDrag({ key, mode, label, rect: live, snapX: s.snapX, snapY: s.snapY })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      resetBounce()
      setDrag(null)
      // Ingen effektiv flytt → R2: enkelklick markerar lådan ensamt (ersätter
      // föregående) + V6: blixt-markera motsvarande riktiga låda.
      if (rectsEqual(live, baseRect, 0.5)) { selectSingle(key); flashReal(flashEl); return }
      const nextIntents = { ...intentsRef.current, [key]: { rect: live, base: origBase } }
      past.current.push(startSnap); future.current = []
      intentsRef.current = nextIntents
      setIntents(nextIntents); bump()
      const verb = mode === 'move' ? 'fritt flyttad' : 'fritt storleksändrad'
      flash(`${label}: ${verb} (intention) · ${Math.round(live.w)}×${Math.round(live.h)} px`, undo)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const startIntentDrag = (e: React.PointerEvent, area: GridArea, mode: IntentMode) =>
    startFreeDrag(e, area.key, area.label, realRefs.current[Number(area.key)]?.el ?? null, mode)

  // ── W12/W29: LIVE grid-flytt av ett TOPP-block INOM ett riktigt css-grid ──
  // När snap-till-grid är på OCH sidans topp-container faktiskt är ett grid, är en
  // flytt en ÄRLIG grid-omplacering (inte en fri skiss): pekarens rörelse snäpps till
  // kolumnspår (sidled) + radband (höjdled), grannar reflowas konfliktfritt
  // (resolveDrop, samma rena logik som nästlade flyttar), och släppet skrivs till
  // `areas` → effekt (3) sätter `grid-column`/`grid-row` LIVE på riktiga elementet.
  // En streckad ghost visar var lådan landar; lådan själv står kvar tills släpp
  // (som nästlad-draget). Grid-agnostiskt: kolumnantal + radband avläses live.
  const [gridMove, setGridMove] = useState<null | { key: string; colStart: number; span: number; row: number; frac: boolean }>(null)
  const startGridMove = (e: React.PointerEvent, area: GridArea) => {
    if (spaceDown) return
    if (mirror) { e.preventDefault(); flash(MIRROR_MSG); return }
    // ⇧-klick = multi-select (align/distribute) – dra INTE.
    if (e.shiftKey) { e.preventDefault(); e.stopPropagation(); toggleSel(area.key); return }
    e.preventDefault(); e.stopPropagation()
    cancelInertia(); cancelZoomAnim(); resetBounce()
    const startSnap = snap()
    const start = clientToCanvas(e.clientX, e.clientY)
    const startPl = { colStart: area.colStart, span: area.span, row: area.row }
    const nCols = cols.current
    // Radband ur wireframens rad-layout (canvas-koordinater, före WF_PAD) – samma
    // rum som pekarens y efter clientToCanvas.
    const bands: RowBand[] = Array.from(wfRef.current.rowBox.entries()).map(([row, b]) => ({ row, top: b.top, h: b.h }))
    const selfBox = wfRef.current.rowBox.get(area.row)
    const selfMid = (selfBox?.top ?? 0) + (selfBox?.h ?? ROW_H) / 2
    let resolved: GridArea[] | null = null
    setGridMove({ key: area.key, colStart: startPl.colStart, span: startPl.span, row: startPl.row, frac: false })
    const move = (ev: PointerEvent) => {
      const p = clientToCanvas(ev.clientX, ev.clientY)
      const dCols = Math.round((p.x - start.x) / Math.max(4, cellW))
      const { colStart, span } = clampPlacement(startPl.colStart + dCols, startPl.span, nCols)
      const row = insertionRow(selfMid + (p.y - start.y), bands)
      resolved = resolveDrop(areasRef.current, area.key, { row, colStart }, nCols)
      setGridMove({ key: area.key, colStart, span, row, frac: !Number.isInteger(row) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setGridMove(null)
      const flashEl = realRefs.current[Number(area.key)]?.el ?? null
      // Ingen effektiv omplacering → R2: enkelklick markerar lådan ensamt +
      // V6: blixt-markera den riktiga lådan.
      const before = areasRef.current
      if (!resolved || sameLayout(resolved, before)) { applySnap(startSnap); selectSingle(area.key); flashReal(flashEl); return }
      past.current.push(startSnap); future.current = []
      const pushed = resolved.filter((i) => {
        if (i.key === area.key) return false
        const o = before.find((x) => x.key === i.key)
        return !!o && (o.colStart !== i.colStart || o.row !== i.row)
      }).length
      areasRef.current = resolved
      setAreas(resolved); bump()
      const d = resolved.find((x) => x.key === area.key)
      if (d) flash(`${area.label}: kol ${d.colStart}–${colEnd(d)} · rad ${d.row} → grid-cell (live)${pushedNote(pushed)}`, undo)
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
  // R4 (v2.4): SYNLIG ghost som följer pekaren när en nästlad ruta flyttas INOM sin
  // container (som fri-drag). Landningen är fortfarande en ärlig grid-omplacering
  // (resolveDrop, live), men UX:en visar nu (a) ghost som följer pekaren, (b) drop-
  // indikatorn (nestedDrag.target) där den landar. Koordinater i canvas-rummet
  // (WF_PAD-relativt) → ritas i wireframe-roten, oberoende av container-nästling.
  const [nestedGhost, setNestedGhost] = useState<null | { id: string; x: number; y: number; w: number; h: number; label: string }>(null)
  const startNestedDrag = (e: React.PointerEvent, r: RegionVM, kind: 'move' | 'resize', cellPx: number) => {
    if (spaceDown) return
    // W3 (v2.4): ⇧-klick = toggla markering på den träffade NÄSTLADE rutan (dra INTE).
    // Speglar top-blockens shift-select (rad 1532) så markeringen fungerar på ALLA
    // låd-typer, inte bara top-blocken. Nästlade id:n som inte är area-nycklar
    // ignoreras säkert av align/distribute (pickSelected filtrerar på medlemskap).
    if (e.shiftKey && kind === 'move') { e.preventDefault(); e.stopPropagation(); toggleSel(r.id); return }
    if (mirror) { e.preventDefault(); flash(MIRROR_MSG); return }
    e.preventDefault(); e.stopPropagation()
    cancelInertia(); cancelZoomAnim() // L1: grepp avbryter ev. glidning
    const startSnap = snap()
    const start = clientToCanvas(e.clientX, e.clientY)
    // R4: ghost-geometri – lådans faktiska skärm-rect → canvas-rummet, plus var i
    // lådan pekaren greppade, så ghosten följer pekaren utan att hoppa.
    const boxEl = (e.currentTarget as HTMLElement).closest?.('[data-dt-hover-id]') as HTMLElement | null
    const gbRect = boxEl?.getBoundingClientRect() ?? null
    const gc0 = gbRect ? clientToCanvas(gbRect.left, gbRect.top) : null
    const grabDX = gc0 ? start.x - gc0.x : 0
    const grabDY = gc0 ? start.y - gc0.y : 0
    const ghostW = gbRect ? gbRect.width / Math.max(0.01, zoom) : 0
    const ghostH = gbRect ? gbRect.height / Math.max(0.01, zoom) : 0
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
    // ── W5: LYFT UR CONTAINER ──────────────────────────────────────────────────
    // Dras en nästlad ruta UTANFÖR sin container blir den en FRI intent-skiss (samma
    // hybrid-princip som W12: fri flytt i icke-grid = intent → uppgift, aldrig
    // pixel-fusk i riktiga gridet). Container-scope klampar då inte längre rutan.
    const kf = wfRef.current.k || 1
    const parentProj = projRef.current[r.parentId ?? r.topId]
    const selfProj = projRef.current[r.id]
    const liftBase = intentsRef.current[r.id]?.base ?? selfProj ?? null
    const liftRectMap: Record<string, IntentRect> = {}
    for (const [id, rr] of Object.entries(projRef.current)) liftRectMap[id] = intentsRef.current[id]?.rect ?? rr
    const { xEdges: liftXE, yEdges: liftYE } = candidateEdges(liftRectMap, r.id)
    const liftTolDoc = 8 / kf
    const LIFT_M = 12 // canvas-px marginal utanför container innan lyft slår till
    const canLift = kind === 'move' && !!parentProj && !!selfProj && !!liftBase
    let lifted: IntentRect | null = null
    const outsideParent = (p: { x: number; y: number }) => {
      if (!parentProj) return false
      const L = parentProj.x * kf, R = (parentProj.x + parentProj.w) * kf
      const T = parentProj.y * kf, B = (parentProj.y + parentProj.h) * kf
      return p.x < L - LIFT_M || p.x > R + LIFT_M || p.y < T - LIFT_M || p.y > B + LIFT_M
    }
    setNestedDrag({ id: r.id, pkey, target: { ...startPl } })
    const move = (ev: PointerEvent) => {
      const p = clientToCanvas(ev.clientX, ev.clientY)
      // W5: utanför containern → lyft-läge (fri intent-preview), annars grid-reflow.
      if (canLift && outsideParent(p)) {
        resolved = null
        setNestedDrag(null)
        setNestedGhost(null) // lyft-läge har egen fri-drag-ghost (setDrag) → ingen dubbel
        const dxDoc = (p.x - start.x) / kf
        const dyDoc = (p.y - start.y) / kf
        const raw = translateRect(selfProj as IntentRect, dxDoc, dyDoc)
        const s = snapRect(raw, liftXE, liftYE, liftTolDoc, 'move')
        lifted = s.rect
        setDrag({ key: r.id, mode: 'move', label: r.label, rect: lifted, snapX: s.snapX, snapY: s.snapY })
        return
      }
      if (lifted) { lifted = null; setDrag(null); setNestedDrag({ id: r.id, pkey, target: { ...startPl } }) }
      const dCols = Math.round((p.x - start.x) / Math.max(4, cellPx))
      if (kind === 'move') {
        const { colStart, span } = clampPlacement(startPl.colStart + dCols, startPl.span, r.cols)
        const row = insertionRow(selfMid + (p.y - start.y), bands)
        resolved = resolveDrop(items, r.id, { row, colStart }, r.cols)
        setNestedDrag({ id: r.id, pkey, target: { row, colStart, span } })
        // R4: ghost följer pekaren (fri-drag-känsla) medan drop-indikatorn nedan
        // visar vart den snäpper i containern.
        if (gbRect) setNestedGhost({ id: r.id, x: p.x - grabDX, y: p.y - grabDY, w: ghostW, h: ghostH, label: r.label })
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
      setNestedGhost(null)
      // W5: släpptes utanför containern → committa en fri intent-skiss för rutan.
      if (lifted && liftBase) {
        setDrag(null)
        const nextIntents = { ...intentsRef.current, [r.id]: { rect: lifted, base: liftBase } }
        past.current.push(startSnap); future.current = []
        intentsRef.current = nextIntents; setIntents(nextIntents); bump()
        flash(`${r.label}: lyft ur container (fri skiss → uppgift) · ${Math.round(lifted.w)}×${Math.round(lifted.h)} px`, undo)
        return
      }
      // R2: klick utan effektiv flytt → markera den nästlade lådan ensamt +
      // V6: blixt-markera den riktiga nästlade lådan.
      if (!resolved || sameLayout(resolved, items)) { applySnap(startSnap); selectSingle(r.id); flashReal(r.el); return }
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
    // B5/R8c: sidan är transform-skalad med pageScale (fit × zoom) → normalisera
    // kandidat-underkanterna (skärm-px) till VERKLIGA px relativt egen topp innan
    // snap-jämförelsen. (Wireframe-draget nedan skalar med wireframe-zoomen.)
    const pz = pageScaleRef.current
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
    // V9: rensa alla fria-flytt-intentioner (tillbaka till exakt projektion).
    intentsRef.current = {}
    setIntents({})
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
  /** Bygg spara-inputen (allt utom titel) – delas av namn-förslaget och sparningen. */
  const buildSaveInput = (): LayoutPayloadInput => ({
    page: location.pathname + location.search,
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
    // V9: fria flytt/resize-intentioner (bara dirty tas med i payloaden/namnet).
    intents: Object.entries(intentsRef.current).map(([key, it]) => ({
      key, label: areasRef.current.find((a) => a.key === key)?.label ?? bands.find((b) => b.id === key)?.label ?? key,
      rect: it.rect, base: it.base,
    })),
  })
  // R7: bygg spara-entries för de element-scopade ruta-ändringarna (bara aktiva rader).
  const buildCssScoped = (): CssScopedSave[] => {
    const out: CssScopedSave[] = []
    for (const [editKey, to] of Object.entries(scopedOverridesRef.current)) {
      const meta = scopedMetaRef.current.get(editKey)
      if (!meta) continue
      out.push({
        prop: meta.prop, label: meta.label, from: meta.fromValue, to, count: meta.targets.length,
        targets: meta.targets.map((t) => ({ design_id: t.design_id, label: t.label })),
      })
    }
    return out
  }
  // V15/R7: spara struktur och/eller css (val i dialogen). css-only → hoppa
  // strukturella deltan så noten blir en ren css-not; struktur-only → utelämna css.
  const saveLayout = async (title: string | undefined, struct: boolean, css: boolean): Promise<boolean> => {
    setSaving(true)
    const base = buildSaveInput()
    const entries = css ? cssEntries() : []
    const scoped = css ? buildCssScoped() : []
    const inp: LayoutPayloadInput = {
      ...base,
      nested: struct ? base.nested : [],
      tops: struct ? base.tops : [],
      intents: struct ? base.intents : [],
      areas: struct ? base.areas : base.areas.map((a) => ({ ...a, hidden: false })),
      cssTweaks: entries.length > 0 ? entries : undefined,
      cssScoped: scoped.length > 0 ? scoped : undefined,
      title,
    }
    if (struct) persistLayout(inp.page, areasRef.current)
    const payload = buildLayoutPayload(inp)
    const res = await saveDesignNote(payload)
    setSaving(false)
    if (res.ok) {
      if (struct) savedSig.current = layoutSignature(snap()) // B6: nu är strukturen "sparad"
      if (css) savedCssSig.current = cssSigOf(entries, scopedOverridesRef.current) // V15/R7: css "sparat"
      // L2: en riktig Spara → arbetet är nu en design-note; utkastet ska inte
      // längre erbjudas för återställning (rensa både lagret och ev. notis).
      clearDraft(scope)
      setDraftRestored(false)
    }
    flash(res.ok ? 'Designförslag sparat → design-notes' : 'Kunde inte spara förslaget')
    return res.ok
  }
  // R11: klick på "Spara" öppnar en namnge-dialog (i st f att spara direkt), förifylld
  // med ett auto-förslag ur ändringarna. V15: valen (struktur/css) förkryssas efter
  // vad som faktiskt är osparat. Inga ändringar → inget att spara.
  const requestSave = () => {
    const structDirty = isDirty()
    const cssIsDirty = cssSigRef.current !== savedCssSig.current
    if (!structDirty && !cssIsDirty) { flash('Inga osparade ändringar att spara'); return }
    setSaveStruct(structDirty)
    setSaveCss(cssIsDirty)
    // Namnförslag: väv ihop struktur- och tema-förslag efter vad som är dirty.
    const bits: string[] = []
    if (structDirty) bits.push(suggestLayoutName(buildSaveInput()))
    if (cssIsDirty) {
      const tokenEntries = cssEntries()
      const scopedN = Object.keys(scopedOverridesRef.current).length
      // Namnge efter var tyngdpunkten ligger: global token-justering vs ruta-scopat.
      const cssBit = structDirty
        ? (tokenEntries.length > 0 && scopedN > 0 ? 'css-justering' : scopedN > 0 ? 'justering i ruta' : 'tema-justering')
        : (tokenEntries.length === 0 && scopedN > 0 ? `Justering i ruta (${scopedN} egenskap${scopedN === 1 ? '' : 'er'})` : suggestCssName(tokenEntries))
      bits.push(cssBit)
    }
    setSaveName(bits.join(' + ') || 'Designförslag')
    setSaveAsk(true)
  }
  const closeSaveDialog = () => { setSaveAsk(false); exitAfterSaveRef.current = false }
  const doSaveFromDialog = async () => {
    if (saving) return
    if (!saveStruct && !saveCss) { flash('Välj minst struktur eller tema att spara'); return }
    const ok = await saveLayout(saveName.trim() || undefined, saveStruct, saveCss)
    if (ok) {
      setSaveAsk(false)
      if (exitAfterSaveRef.current) { exitAfterSaveRef.current = false; onExit() }
    }
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
  const cssMode = panelTab === 'css'
  const toolsMode = panelTab === 'tools'
  // Höger-ytan är verktyg/editor (ej wireframe) i css- OCH verktygsläget → spegling
  // frånkopplad, wireframe-canvasen döljs.
  const rightIsTool = cssMode || toolsMode
  // V15/V16: undo/redo-knapparna + zoom-nivån gäller AKTIV panel (css-läge → css-
  // historik; verktygsläget → design-historiken, samma som wireframe). Element-
  // egenskaper ångras via PropertyPanelns egen Avbryt (per-property-historik ligger
  // utanför MVP:n).
  const activeUndo = cssMode ? cssUndo : undo
  const activeRedo = cssMode ? cssRedo : redo
  const canUndo = cssMode ? cssPast.current.length > 0 : past.current.length > 0
  const canRedo = cssMode ? cssFuture.current.length > 0 : future.current.length > 0

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
    const nestHOf = (r: RegionVM): number => {
      if (mirror) return r.hpx
      if (r.fixedH) return r.hpx
      // R9: en dragen AUTO-override (hpx skiljer sig från origH) vinner över den
      // live-ommätta innehållshöjden; annars följ den (visar aktuell proportion).
      if (isHeightOverride(r.hpx, r.origH)) return r.hpx
      return liveH[`n:${r.id}`] ?? r.hpx
    }
    const topHOf = (key: string): number | null => {
      const t = vTopH[key]
      if (!t) return null
      if (mirror) return t.origPx
      if (t.fixed) return t.hpx
      // R9: dragen AUTO-override vinner över live-ommätningen.
      if (isHeightOverride(t.hpx, t.origPx)) return t.hpx
      return liveH[`t:${key}`] ?? t.origPx
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

  // ── R14: platshållar-atomer (rubrik/knapp/textrad/bild) inuti en låda ──
  // Fraktions-koordinater × lådans aktuella storlek → skal-agnostiskt. Ligger
  // BAKOM etikettremsan och ev. nästlade lådor (opaka) och är rent dekorativa
  // (pointer-events: none) → påverkar aldrig drag/markering. Ger en SVAG antydan
  // om innehållet vid blickväxling mot riktiga sidan – men kraftigt nedtonade
  // (Andreas review 4d): det viktiga är rutans storlek/plats/namn, inte att alla
  // textrad-streck syns. Låg opacity → rutan + det centrerade namnet dominerar.
  const renderPlaceholders = (id: string, boxW: number, boxH: number): React.ReactNode => {
    const list = vPlaceholders[id]
    if (!list || boxW < 26 || boxH < 18) return null
    return (
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', opacity: 0.13 }}>
        {list.map((p, i) => {
          const x = p.fx * boxW
          const y = p.fy * boxH
          const w = Math.max(4, Math.min(p.fw * boxW, boxW - x))
          const h = Math.max(3, Math.min(p.fh * boxH, boxH - y))
          return <div key={i} style={phMark(p.kind, x, y, w, h, p.round)} />
        })}
      </div>
    )
  }

  // ── W7: låd-namn CENTRERAT i wf-rutan (top-block/band/nästlad) ──
  // När man rumsterar om bryts 1:1 med webbsidan → namnet hjälper minnas vilken
  // ruta som är vad. Diskret blueprint-typografi, läsbar i båda teman, trunkerad;
  // pointer-events: none (blockerar aldrig drag) + låg z (bakom nästlade barn +
  // etikettremsans kontroller). Container-rutor täcks av barnen → namnet syns i
  // deras mellanrum; leaf-rutor får namnet centrerat. App-agnostiskt (bara r.label).
  const centeredLabel = (label: string, boxW: number, boxH: number, muted = false): React.ReactNode => {
    if (!label || boxW < 40 || boxH < 16) return null
    const twoLines = boxH >= 40 && boxW >= 70
    return (
      <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', pointerEvents: 'none', zIndex: 0 }}>
        <span style={{
          maxWidth: '100%', textAlign: 'center', lineHeight: 1.2,
          fontFamily: 'var(--dt-font)', fontSize: boxH < 24 ? 9 : 'var(--dt-text-xs)', fontWeight: 500,
          letterSpacing: 'var(--dt-track-label)', color: muted ? 'var(--dt-text-mute)' : 'var(--dt-text-dim)',
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: twoLines ? '-webkit-box' : 'block', WebkitBoxOrient: 'vertical', WebkitLineClamp: twoLines ? 2 : 1,
          whiteSpace: twoLines ? 'normal' : 'nowrap',
        }}>{label}</span>
      </div>
    )
  }

  // W5: en nästlad ruta är "lyft" (fri intent-skiss ovanpå projektionen) medan den
  // dras fritt (drag-state) ELLER när en dirty intent finns → ritas som fri overlay,
  // inte inne i containern.
  const nestedLifted = (id: string): boolean =>
    drag?.key === id || (intents[id] != null && intentDirty(intents[id]))

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
    // V17: förälder-lådans projicerade rect – barnen placeras RELATIVT den (exakt
    // spegel), inte via lokal kolumnplacering + stackRows (som driver isär).
    const parentProj = vProj[parentId ?? topId]
    return (
      <>
        {kids.map((r) => {
          // W5: lyfta rutor ritas som fri overlay (senare pass), inte inne i containern.
          if (nestedLifted(r.id)) return null
          const cellPx = (w * r.sfw) / r.cols
          const cp = parentProj && vProj[r.id]
            ? projToChildCanvas(vProj[r.id], parentProj, wf.k, 12, MIN_REGION_WF)
            : null
          const x = cp ? cp.x : x0 + w * r.sfx + (r.colStart - 1) * cellPx
          const bw = cp ? cp.w : Math.max(12, cellPx * r.span - 3)
          const y = cp ? cp.y : y0 + (st.rowTop.get(r.row) ?? 0)
          const h = cp ? cp.h : wf.regionH(r)
          const isDrag = nestedDrag?.id === r.id || (hDrag != null && !hDrag.top && hDrag.id === r.id)
          // W3: markerad = egenskaps-drill ELLER ⇧-multi-select (selSet).
          const isSel = drillEl === r.innerEl || (!mirror && selSet.has(r.id))
          const hasKids = wf.childrenOf(topId, r.id).length > 0
          const mechLabel = r.mech === 'grid' ? 'grid' : r.mech === 'flex' ? 'flex' : 'flöde'
          const slim = !hasKids && h < 18 // för låg för topp-remsa → centrera etiketten
          // W6: osynlig STRUKTUR-container (transparent wrapper / slot-yta) → markera
          // distinkt (streckad, dämpad kontur + badge) så man förstår att lådan inte
          // finns som egen ruta på riktiga sidan. Slots räknas alltid som struktur.
          const structural = !r.separated || r.kind === 'slot'
          const dashed = structural
          return (
            <div
              key={r.id}
              data-dt-hover-id={r.id}
              data-dt-hover-kind="nested"
              onPointerDown={(e) => startNestedDrag(e, r, 'move', cellPx)}
              style={{
                position: 'absolute', left: x, top: y, width: bw, height: h,
                background: isDrag ? 'var(--dt-accent-weak)' : structural ? 'transparent' : 'var(--dt-surface)',
                // B1: konsekvent blueprint-stroke (definierad ritnings-ink) på nästlade lådor.
                // W6: struktur-containers får dämpad streckad kontur (var(--dt-border), lägre kontrast).
                border: `var(--dt-line) ${dashed ? 'dashed' : 'solid'} ${isSel ? 'var(--dt-accent)' : isDrag ? 'var(--dt-border-strong)' : structural ? 'var(--dt-border)' : 'var(--dt-bp-stroke)'}`,
                outline: isSel ? 'var(--dt-line-strong) solid var(--dt-accent)' : 'none', outlineOffset: 1,
                borderRadius: 'var(--dt-radius-sm)', cursor: cursorFor({ spaceDown, panning, measure, target: 'box' }), userSelect: 'none',
                // R4: medan ghosten följer pekaren tonas ursprungslådan ner till en tom
                // slot → man ser att den LYFTS och flyttas, inte bara att fält highlightas.
                opacity: nestedGhost?.id === r.id ? 0.4 : 1,
                transition: (reduced || isDrag) ? 'none' : 'left 160ms cubic-bezier(0.22,1,0.36,1), width 160ms cubic-bezier(0.22,1,0.36,1), top 160ms cubic-bezier(0.22,1,0.36,1), height 160ms cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              {renderPlaceholders(r.id, bw, h)}
              {/* W7: låd-namn centrerat (struktur-containers dämpade en extra grad). */}
              {centeredLabel(r.label, bw, h, structural)}
              <span style={{ position: 'absolute', left: 4, right: 14, top: 0, height: slim ? '100%' : NEST_HEAD, display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none', zIndex: 2 }}>
                {/* W6: struktur-badge – lådan finns inte som egen ruta på riktiga sidan. */}
                {structural && bw >= 54 && <span style={{ flex: 'none', fontSize: 8, fontStyle: 'italic', lineHeight: '10px', color: 'var(--dt-text-mute)', border: '1px dashed var(--dt-border)', borderRadius: 3, padding: '0 3px', whiteSpace: 'nowrap' }}>struktur</span>}
                {/* W12: läges-badge – en nästlad ruta reflowas LIVE inom sin container
                    (grid → grid-column/order; flex/flöde → order/DOM-ordning). Bara på
                    riktiga (icke-struktur) rutor så remsan inte blir rörig. */}
                {!structural && layoutModeBadge(r.mech === 'grid' ? 'grid' : 'flow', bw)}
                <span style={{ flex: 1 }} />
                {/* R10: fasta rutor tydligt märkta (ovanligt); auto diskret. */}
                {r.fixedH
                  ? <span style={{ flex: 'none', fontSize: 8, fontWeight: 700, lineHeight: '10px', color: 'var(--dt-accent-contrast)', background: 'var(--dt-accent)', borderRadius: 3, padding: '0 3px', whiteSpace: 'nowrap' }}>fast höjd</span>
                  : <span style={{ flex: 'none', fontSize: 8, fontStyle: 'italic', lineHeight: '10px', color: 'var(--dt-text-mute)', border: '1px solid var(--dt-border)', borderRadius: 3, padding: '0 3px' }}>auto</span>}
              </span>
              <button type="button" aria-label={`Egenskaper för ${r.label}`} onPointerDown={(e) => { e.stopPropagation(); selectNested(r) }} style={{ position: 'absolute', right: 1, top: 1, background: 'none', border: 'none', color: isSel ? 'var(--dt-accent)' : 'var(--dt-text-mute)', cursor: 'pointer', fontSize: 10, lineHeight: 1, padding: 1, zIndex: 3 }}>◧</button>
              {/* Resize-handtag (bredd, höger kant) */}
              <span onPointerDown={(e) => startNestedDrag(e, r, 'resize', cellPx)} style={{ position: 'absolute', right: -2, top: 0, bottom: 0, width: 6, cursor: 'ew-resize', zIndex: 3 }} />
              {/* R9: höjd-handtag (underkant) – dragbart på ALLA regioner (auto ⇒
                  explicit override-höjd på riktiga elementet; fast ⇒ som A2). */}
              <span
                onPointerDown={(e) => startHeightDrag(e, { nested: r })}
                style={{ position: 'absolute', left: 0, right: 0, bottom: -2, height: 6, cursor: 'ns-resize', zIndex: 3 }}
              />
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

  // R1: skiljeväggen är låst i mitten → panelerna är alltid exakt lika breda
  // (spegel). Vänster sid-skalning och wireframens wf-skala räknas om automatiskt
  // (ResizeObservers på stage + viewport).
  const RIGHT_W = dual ? Math.round(centeredRightWidth(winW)) : winW
  const HEAD_H = 52
  // R6: sub-header-band under global-headern på BÅDA paneler (vänster "Riktig
  // sida"-remsa speglar höger "Wireframe"-remsa) → panelernas innehålls-överkant
  // linjeras vid samma streckade linje = total spegel.
  const SUBHEAD_H = 40
  const CONTENT_TOP = HEAD_H + SUBHEAD_H
  const FOOT_H = 34
  // W25: osparade ändringar (struktur ELLER css-tema) → Spara-knappen accentueras.
  const saveDirty = anyDirty()

  return (
    <div role="dialog" aria-label="Design mode" data-dt-designmode style={{ ...fullOverlay(reduced), background: 'transparent', pointerEvents: 'none' }}>
      {/* ── Topp-chrome (opak; täcker toppremsan) ── */}
      <header style={{
        pointerEvents: 'auto', position: 'absolute', top: 0, left: 0, right: 0, height: HEAD_H,
        display: 'flex', alignItems: 'center', gap: 'var(--dt-space-3)', padding: '0 var(--dt-space-4)',
        borderBottom: '1px solid var(--dt-border)', background: 'var(--dt-surface-solid)', color: 'var(--dt-text)',
        // B2: topp-högdager + mjuk lager-skugga nedåt → chrome-baren läser som lyft frostat glas.
        boxShadow: 'var(--dt-inner-hi), var(--dt-shadow)', fontFamily: 'var(--dt-font)', zIndex: 3,
      }}>
        <span style={{ fontSize: 'var(--dt-text-lg)', fontWeight: 700, letterSpacing: 'var(--dt-track-heading)' }}>Design&nbsp;mode</span>
        <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)' }}>{cols.current}-kol · grid-agnostisk</span>
        <div style={{ flex: 1 }} />

        {/* Desktop/mobil-förhandsvisning av sidan */}
        {realVisible && (
          <DtSegmented
            ariaLabel="Förhandsvisning"
            value={previewMobile ? 'mobile' : 'desktop'}
            onChange={(v) => setPreviewMobile(v === 'mobile')}
            options={[{ value: 'desktop', label: '🖥 Desktop' }, { value: 'mobile', label: '📱 Mobil' }]}
          />
        )}
        {/* Enkel-panel: växla riktig sida ↔ wireframe */}
        {!dual && (
          <button type="button" onClick={() => setShowRealSingle((v) => !v)} style={dtGhostBtn(showRealSingle)}>
            {showRealSingle ? '▦ Visa wireframe' : '🖥 Visa riktig sida'}
          </button>
        )}

        {/* Undo/redo */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={activeUndo} disabled={!canUndo} style={dtGhostBtn(false, !canUndo)} title={cssMode ? 'Ångra tema-ändring (⌘Z)' : 'Ångra (⌘Z)'}>↶</button>
          <button type="button" onClick={activeRedo} disabled={!canRedo} style={dtGhostBtn(false, !canRedo)} title={cssMode ? 'Gör om tema-ändring (⌘⇧Z)' : 'Gör om (⌘⇧Z)'}>↷</button>
        </div>
        {/* Zoom (B5: delad – båda vyerna zoomar identiskt) */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <button type="button" onClick={() => { cancelInertia(); animateZoomTo(zoomRef.current - 0.15) }} style={dtGhostBtn()} title="Zooma ut (⌘− eller ⌃-scroll)">−</button>
          <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', minWidth: 40, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => { cancelInertia(); animateZoomTo(zoomRef.current + 0.15) }} style={dtGhostBtn()} title="Zooma in (⌘+ eller ⌃-scroll)">+</button>
        </div>
        {/* W27: byt sida i appen (osparat bevaras & återställs vid retur). */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setNavOpen((v) => { const next = !v; if (next) setNavUrl(location.pathname + location.search); return next })}
            style={dtGhostBtn(navOpen)}
            title="Öppna en annan sida i appen – osparat bevaras"
          >⇄ Byt sida</button>
          {navOpen && (
            <div
              role="dialog" aria-label="Byt sida"
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 300,
                background: 'var(--dt-surface-solid)', border: '1px solid var(--dt-border-strong)',
                borderRadius: 'var(--dt-radius-lg)', boxShadow: 'var(--dt-panel-shadow)',
                padding: 'var(--dt-space-3)', zIndex: 6, textAlign: 'left',
              }}
            >
              <p style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-dim)', margin: '0 0 6px', lineHeight: 1.5 }}>
                Välj en sida för att se hur ändringen faller ut där. <b>Osparat bevaras</b> och återställs när du kommer tillbaka.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 260, overflowY: 'auto', margin: '0 0 8px' }}>
                {NAV_PAGES.map((pg) => (
                  <button
                    key={pg.href}
                    type="button"
                    onClick={() => navigateTo(pg.href)}
                    style={{ ...dtGhostBtn(), justifyContent: 'space-between', textAlign: 'left', width: '100%', display: 'flex', alignItems: 'baseline', gap: 8 }}
                  >
                    <span>{pg.label}</span>
                    <span style={{ color: 'var(--dt-text-mute)', fontSize: 'var(--dt-text-xs)', fontFamily: 'var(--dt-font-mono, monospace)' }}>{pg.href}</span>
                  </button>
                ))}
              </div>
              <input
                value={navUrl}
                onChange={(e) => setNavUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); navigateTo(navUrl) }
                  else if (e.key === 'Escape') { e.preventDefault(); setNavOpen(false) }
                }}
                placeholder="…eller ange en annan sökväg"
                spellCheck={false}
                style={dtInput()}
              />
              <div style={{ display: 'flex', gap: 'var(--dt-space-2)', marginTop: 'var(--dt-space-2)' }}>
                <button type="button" onClick={() => navigateTo(navUrl)} disabled={!navUrl.trim()} style={{ ...dtBtn(), flex: 1, opacity: navUrl.trim() ? 1 : 0.5 }}>Gå till sökväg</button>
                <button type="button" onClick={() => setNavOpen(false)} style={dtGhostBtn()}>Avbryt</button>
              </div>
            </div>
          )}
        </div>

        {/* W25: Spara-knappen speglar osparade ändringar – fylld positiv grön + en
            liten prick när det finns något att spara, annars dämpad/vilande. */}
        <button
          type="button"
          onClick={requestSave}
          disabled={saving}
          title={saveDirty ? 'Osparade ändringar – spara som design note' : 'Inget osparat att spara'}
          style={dtSaveBtn(saving, saveDirty || saving)}
        >
          {saving ? 'Sparar…' : (
            <>
              {saveDirty && (
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '999px', background: 'currentColor', flex: 'none' }} />
              )}
              {rightIsTool ? 'Spara' : 'Spara layout'}
            </>
          )}
        </button>
        <button type="button" onClick={requestExit} style={dtBtn()}>Avsluta</button>
      </header>

      {/* ── R6: vänster panelens sub-header – speglar höger "Wireframe"-remsa.
          Det mörka fältet går ett steg längre ner så att den riktiga sidans
          innehålls-överkant hamnar vid samma streckade linje som wireframens. ── */}
      {realVisible && (
        <div style={{
          pointerEvents: 'none', position: 'absolute', top: HEAD_H, left: 0,
          right: dual ? RIGHT_W : 0, height: SUBHEAD_H,
          display: 'flex', alignItems: 'center', gap: 8, padding: '0 var(--dt-space-4)',
          background: 'var(--dt-surface-solid)', borderBottom: '1px solid var(--dt-border)',
          color: 'var(--dt-text)', fontFamily: 'var(--dt-font)', zIndex: 3,
        }}>
          <span style={{ fontSize: 'var(--dt-text-sm)', fontWeight: 600 }}>Riktig sida</span>
          <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)' }}>
            {previewMobile ? `mobil ${MOBILE_W}px · appens egen responsiva layout` : 'desktop · live-omgriddad'} · space-dra / hjul panorerar
          </span>
        </div>
      )}

      {/* ── Vänster: device-fönster för den RIKTIGA sidan (transparent hål) ── */}
      {realVisible && (
        <div
          ref={stageRef}
          style={{
            pointerEvents: 'none', position: 'absolute', top: CONTENT_TOP, bottom: FOOT_H,
            left: 0, right: dual ? RIGHT_W : 0, background: 'transparent',
          }}
        />
      )}

      {/* ── B4: space-pan-lager över vänster sida (synkar wireframen) ── */}
      {realVisible && spaceDown && (
        <div
          onPointerDown={startPagePan}
          title="Panorera (space-dra) – båda vyerna följs åt"
          style={{
            position: 'absolute', top: CONTENT_TOP, bottom: FOOT_H, left: 0, right: dual ? RIGHT_W : 0,
            cursor: panning ? 'grabbing' : 'grab', zIndex: 5, pointerEvents: 'auto',
          }}
        />
      )}

      {/* ── R1: statisk lodrät avdelare (låst i mitten, ej dragbar) ──
          Kvar som visuell åtskillnad men utan drag → panelerna förblir 50/50.
          W28: tunn/diskret (1px, dämpad linjefärg) – den var onödigt tjock. */}
      {dual && (
        <div
          data-dt-divider
          aria-hidden
          style={{
            position: 'absolute', top: HEAD_H, bottom: FOOT_H, left: winW - RIGHT_W, width: 1,
            background: 'var(--dt-border)', zIndex: 6, pointerEvents: 'none',
          }}
        />
      )}

      {/* V6: blixt-markering av den RIKTIGA lådan vid klick i wireframen (tonar ut) */}
      {realVisible && flashRect && (
        <div aria-hidden style={{
          position: 'fixed', left: flashRect.x - 2, top: flashRect.y - 2, width: flashRect.w + 4, height: flashRect.h + 4,
          border: '2.5px solid var(--dt-accent)', boxShadow: '0 0 0 3px var(--dt-accent-weak)', borderRadius: 6,
          pointerEvents: 'none', zIndex: 5, opacity: flashOn ? 1 : 0,
          transition: reduced ? 'none' : 'opacity 850ms cubic-bezier(0.22,1,0.36,1)',
        }} />
      )}

      {/* Selektions-outline över det valda riktiga elementet (Post 5) */}
      {/* W17: elementmarkeringen döljs i CSS-läge (visas igen i Verktyg-fliken). */}
      {realVisible && selRect && !cssMode && (
        <div aria-hidden style={{ position: 'fixed', left: selRect.x - 1, top: selRect.y - 1, width: selRect.w + 2, height: selRect.h + 2, border: 'var(--dt-line-strong) solid var(--dt-accent)', boxShadow: 'var(--dt-sel-glow)', borderRadius: 4, pointerEvents: 'none', zIndex: 4 }}>
          {selInfo?.label && <span style={{ position: 'absolute', top: -18, left: -1, fontSize: 10, fontWeight: 700, fontFamily: 'var(--dt-font-mono)', color: 'var(--dt-accent-contrast)', background: 'var(--dt-accent)', padding: '1px 6px', borderRadius: 'var(--dt-radius-sm)', whiteSpace: 'nowrap', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: 'var(--dt-track-label)' }}>{selInfo.label}</span>}
          {/* B3: Figma-lika fyrkantiga hörn-handtag – bara i egenskaps-läget (valt element),
              inte på en ren enkel-klick-markering (review 4f) som bara ska highlighta rutan. */}
          {selectedEl && cornerHandles(reduced)}
        </div>
      )}

      {/* ── W19: fokus-suddning – när en ruta dragits i css-läge dämpas/suddas allt
          UTANFÖR intresseområdet (4 band runt rutan) medan rutan syns skarpt. ── */}
      {cssMode && boxRect && (() => {
        const winH = typeof window !== 'undefined' ? window.innerHeight : 900
        const region = { l: 0, t: CONTENT_TOP, r: dual ? winW - RIGHT_W : winW, b: winH - FOOT_H }
        const bx = Math.max(region.l, boxRect.x), by = Math.max(region.t, boxRect.y)
        const bx2 = Math.min(region.r, boxRect.x + boxRect.w), by2 = Math.min(region.b, boxRect.y + boxRect.h)
        const band: React.CSSProperties = { position: 'fixed', pointerEvents: 'none', zIndex: 4, background: 'var(--dt-scrim)', backdropFilter: 'blur(2.5px)', WebkitBackdropFilter: 'blur(2.5px)' }
        return (
          <>
            <div aria-hidden style={{ ...band, left: region.l, top: region.t, width: region.r - region.l, height: Math.max(0, by - region.t) }} />
            <div aria-hidden style={{ ...band, left: region.l, top: by2, width: region.r - region.l, height: Math.max(0, region.b - by2) }} />
            <div aria-hidden style={{ ...band, left: region.l, top: by, width: Math.max(0, bx - region.l), height: Math.max(0, by2 - by) }} />
            <div aria-hidden style={{ ...band, left: bx2, top: by, width: Math.max(0, region.r - bx2), height: Math.max(0, by2 - by) }} />
            <div aria-hidden style={{ position: 'fixed', left: bx - 1, top: by - 1, width: (bx2 - bx) + 2, height: (by2 - by) + 2, border: 'var(--dt-line-strong) solid var(--dt-accent)', boxShadow: 'var(--dt-sel-glow)', borderRadius: 4, pointerEvents: 'none', zIndex: 5 }} />
          </>
        )
      })()}

      {/* W18: live-ruta medan man drar i css-läge. */}
      {cssMode && boxDrag && boxDrag.w > 1 && boxDrag.h > 1 && (
        <div aria-hidden style={{ position: 'fixed', left: boxDrag.x, top: boxDrag.y, width: boxDrag.w, height: boxDrag.h, border: 'var(--dt-line-strong) solid var(--dt-accent)', background: 'var(--dt-accent-weak)', boxShadow: 'var(--dt-sel-glow)', borderRadius: 3, pointerEvents: 'none', zIndex: 6 }} />
      )}

      {/* W18: diskret hint innan man dragit en ruta i css-läge. */}
      {cssMode && !boxRect && !boxDrag && realVisible && (
        <div aria-hidden style={{ position: 'fixed', top: CONTENT_TOP + 10, left: (dual ? winW - RIGHT_W : winW) / 2, transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 5 }}>
          <span style={{ fontSize: 'var(--dt-text-xs)', fontWeight: 700, color: 'var(--dt-accent-contrast)', background: 'var(--dt-accent)', padding: '4px 12px', borderRadius: 'var(--dt-radius-pill)', letterSpacing: 'var(--dt-track-label)', boxShadow: 'var(--dt-shadow)', whiteSpace: 'nowrap' }}>▭ Dra en ruta för att bara se inställningarna som används där</span>
        </div>
      )}

      {/* V16: hover-preview under element-plocket i verktygsläget (visar exakt vad ett
          klick väljer – accent-outline + svag fyllning, som in-app-overlayns plock). */}
      {toolsMode && pickHover && !drawComment && (
        <div aria-hidden style={{ position: 'fixed', left: pickHover.x, top: pickHover.y, width: pickHover.w, height: pickHover.h, border: '2px dashed var(--dt-accent)', background: 'var(--dt-accent-weak)', pointerEvents: 'none', zIndex: 4, borderRadius: 3, transition: reduced ? 'none' : 'all var(--dt-dur-fast) var(--dt-spring)' }} />
      )}

      {/* W15b: rit-läge – hårkors-hint + live-ruta medan man drar över riktiga sidan. */}
      {drawComment && (
        <div aria-hidden style={{ position: 'fixed', left: dual ? 0 : 0, top: CONTENT_TOP, width: dual ? winW - RIGHT_W : winW, bottom: FOOT_H, pointerEvents: 'none', zIndex: 4, background: 'var(--dt-scrim)', mixBlendMode: 'normal' }}>
          {!drawRect && (
            <span style={{ position: 'absolute', top: 'var(--dt-space-4)', left: '50%', transform: 'translateX(-50%)', fontSize: 'var(--dt-text-xs)', fontWeight: 700, color: 'var(--dt-accent-contrast)', background: 'var(--dt-accent)', padding: '4px 12px', borderRadius: 'var(--dt-radius-pill)', letterSpacing: 'var(--dt-track-label)', boxShadow: 'var(--dt-shadow)' }}>▭ Dra en ruta över det du vill kommentera · Esc avbryter</span>
          )}
        </div>
      )}
      {drawComment && drawRect && drawRect.w > 1 && drawRect.h > 1 && (
        <div aria-hidden style={{ position: 'fixed', left: drawRect.x, top: drawRect.y, width: drawRect.w, height: drawRect.h, border: 'var(--dt-line-strong) solid var(--dt-accent)', background: 'var(--dt-accent-weak)', boxShadow: 'var(--dt-sel-glow)', borderRadius: 3, pointerEvents: 'none', zIndex: 5 }} />
      )}

      {/* R3 (v2.4): hover-mikrotoolbaren + dess kommentar-popover är BORTTAGNA.
          Åtgärderna nås via Verktyg-fliken (kommentera/inspektera) och lådans handtag. */}

      {/* ── Höger: WIREFRAME-panel ── */}
      <div style={{
        pointerEvents: 'auto', position: 'absolute', top: HEAD_H, bottom: FOOT_H, right: 0,
        width: dual ? RIGHT_W : winW, borderLeft: dual ? '1px solid var(--dt-border)' : 'none',
        background: 'var(--dt-surface-solid)', color: 'var(--dt-text)', fontFamily: 'var(--dt-font)',
        // B2: topp-högdager + skugga åt vänster/ned (samma ljuskälla) → wireframe-panelen lyfter från appen.
        boxShadow: 'var(--dt-inner-hi), var(--dt-shadow)',
        display: (!dual && showRealSingle) ? 'none' : 'flex', flexDirection: 'column', zIndex: 2,
      }}>
        {/* ── R6: Wireframe-header + Layout-verktyg mergade till EN rad (fast
            höjd SUBHEAD_H) → wireframe-canvasens överkant linjeras med den
            riktiga sidans (samma streckade linje = total spegel). ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: SUBHEAD_H, padding: '0 var(--dt-space-4)', borderBottom: '1px solid var(--dt-border)', background: 'var(--dt-surface-2)', flex: 'none', overflow: 'hidden' }}>
          {/* V15/V16: flik-växlare – Wireframe (spegel) · Verktyg (fullt designverktyg) · CSS-tema (editor). */}
          <DtSegmented
            tablist
            ariaLabel="Höger panel"
            value={panelTab}
            onChange={(v) => { if (v === 'wireframe') setPanelTab('wireframe'); else if (v === 'tools') openToolsTab(); else openCssTab() }}
            options={[
              { value: 'wireframe', label: '▦ Wireframe' },
              { value: 'tools', label: '🧰 Verktyg' },
              { value: 'css', label: '🎨 CSS-tema' },
            ]}
          />
          {toolsMode ? (
            <>
              <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)' }}>klicka på vänster sida för att välja element · spegling frånkopplad</span>
              <div style={{ flex: 1 }} />
              {selectedEl && <button type="button" onClick={() => { setSelKey(null); setDrillEl(null) }} style={{ ...dtGhostBtn(), padding: '2px 8px', flex: 'none' }}>Avmarkera</button>}
            </>
          ) : cssMode ? (
            <>
              <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)' }}>tweaka sidans tema live · spegling frånkopplad</span>
              <div style={{ flex: 1 }} />
            </>
          ) : mirror ? (
            <>
              <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)' }}>mobil-spegel (skrivskyddad) · space-dra / hjul panorerar</span>
              <div style={{ flex: 1 }} />
            </>
          ) : (
            <>
              {/* R6: Layout-verktygen ligger i ett horisontellt scrollbart band (flex:1,
                  minWidth:0) → på smala/maximerade fönster där raden annars blir bredare
                  än halva fönstret scrollar verktygen i st f att klippas. Reset-knapparna
                  (Återställ dolda · Nollställ) pinnas UTANFÖR bandet, längst till höger,
                  så de alltid syns och är klickbara. Fast radhöjd behålls (ingen wrap →
                  wireframe-canvasens överkant linjeras kvar med riktiga sidan). */}
              <div className="dt-toolscroll" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 auto', minWidth: 0, overflowX: 'auto', overflowY: 'hidden' }}>
                <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', fontVariantNumeric: 'tabular-nums', flex: 'none', minWidth: 44 }}>
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
                <button type="button" onClick={() => setMeasure((m) => !m)} title="Mät-overlay (gap i px + token)" aria-pressed={measure} style={{ ...tbBtn(measure), width: 'auto', padding: '0 8px', flex: 'none' }}>📐 Mät</button>
                {/* W29: snap-till-grid vid flytt (av-knapp). PÅ + riktigt grid ⇒ flytt = live grid-placering.
                    Kompakt (emoji) → tränger inte den redan fulla raden; tooltip + aria förklarar. */}
                <button type="button" onClick={() => setSnapToGrid((s) => !s)} aria-pressed={snapToGrid} aria-label="Snap till grid vid flytt" title={snapToGrid ? 'Snap till grid PÅ – flytt snäpper till spåren (i ett riktigt grid slår flytten igenom live). Klicka för att stänga av.' : 'Snap till grid AV – flytt blir en fri skiss (intention → uppgift). Klicka för att slå på.'} style={{ ...tbBtn(snapToGrid), flex: 'none' }}>🧲</button>
                {/* W13: MacBook-viewportrektangel av/på (av som standard). */}
                <button type="button" onClick={() => setShowMacbook((s) => !s)} aria-pressed={showMacbook} aria-label="Visa MacBook 14-tums viewport-rektangel" title="Visa 14-tums MacBook-viewport som referensrektangel (av som standard)" style={{ ...tbBtn(showMacbook), flex: 'none' }}>💻</button>
                <button type="button" onClick={doInsert} title="Infoga platshållar-block (ny sektion)" style={{ ...tbBtn(), width: 'auto', padding: '0 8px', flex: 'none' }}>＋ Sektion</button>
                {selSet.size > 0 && <button type="button" onClick={() => setSelSet(new Set())} title="Avmarkera alla" style={{ ...dtGhostBtn(), padding: '2px 8px', flex: 'none' }}>Rensa val</button>}
              </div>
              {areas.some((a) => a.hidden) && <button type="button" onClick={restoreHidden} style={{ ...dtGhostBtn(), padding: '2px 8px', flex: 'none' }}>Återställ dolda</button>}
              <button type="button" onClick={resetLayout} style={{ ...dtGhostBtn(), padding: '2px 8px', flex: 'none' }}>Nollställ</button>
            </>
          )}
        </div>

        {/* V15: CSS-tema-editorn ersätter wireframe-canvasen i css-läget (fristående
            kontrollpanel; ingen spegling). Byggd på mål-sidans FAKTISKA tema-tokens. */}
        {cssMode && (
          <CssThemeEditor
            tokens={cssTokens}
            overrides={cssOverrides}
            onChange={cssChange}
            onReset={cssResetOne}
            onResetAll={cssResetAll}
            spread={cssSpread}
            box={boxObs}
            boxElementCount={boxCount}
            onClearBox={clearBox}
            boxScoped={scopedOverrides}
            onBoxChange={boxChange}
            onBoxReset={boxResetOne}
          />
        )}

        {/* V16: det FULLA in-app-verktyget på höger yta (ersätter wireframe-canvasen
            i verktygsläget). Element väljs genom att klicka på vänster sida (effekten
            ovan); här dockar egenskaps-panel + inspektor/brödsmula – samma komponenter
            som in-app-overlayn → allt verktyget kan, i design mode. Spara går via
            PropertyPanelns egna spara-flöden (design-notes), konsekvent med css-temat (FW7). */}
        {toolsMode && (() => {
          // W14: verktygsytan omdesignad för den BREDA högerpanelen. En responsiv
          // kort-tavla (auto-fill, minmax 320px) → kontrollerna återgår till sin
          // naturliga ~320px-bredd i STÄLLET för att sträckas ut över hela ytan
          // (Bild 5-klagomålet), och sektionerna tilear sida-vid-sida så ytan fylls
          // lugnt. App-agnostiskt: allt är --dt-token, ingen appspecifik selektor.
          const miniLabel: React.CSSProperties = { fontSize: 'var(--dt-text-xs)', fontWeight: 700, letterSpacing: 'var(--dt-track-heading)', textTransform: 'uppercase', color: 'var(--dt-text-mute)' }
          const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: 'var(--dt-font)', fontSize: 'var(--dt-text-xs)', color: 'var(--dt-accent)', textAlign: 'left', letterSpacing: 'var(--dt-track-label)' }
          const targetKindText = commentTarget.kind === 'draw' ? 'ritad ruta' : commentTarget.kind === 'element' ? 'valt element' : 'hela sidan'
          const pageComments = toolNotes.filter((n) => n.kind === 'comment' && (!n.page || n.page.split('?')[0] === location.pathname))
          const shortPage = (p?: string) => (p ? p.split('?')[0] : '')
          return (
          <div data-dt-native-scroll style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--dt-surface)', padding: 'var(--dt-space-4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--dt-space-4)', alignItems: 'start' }}>

              {/* ── Element-workspace ── (spänner hela bredden när något är valt så
                  inspektor + egenskaper får ligga sida-vid-sida; kompakt cell annars) */}
              <section style={{ ...dtCard(!!selectedEl), gridColumn: '1 / -1' }}>
                <header style={dtCardHead()}>
                  <span aria-hidden style={dtIconChip()}>⌖</span>
                  <span style={dtCardTitle()}>Element</span>
                  <span style={dtCardHint()}>{selInfo?.label ? selInfo.label : 'klicka vänster · shift = träffat lager'}</span>
                  {selectedEl && <button type="button" onClick={() => { setSelKey(null); setDrillEl(null) }} style={{ ...dtGhostBtn(), padding: '2px 8px', flex: 'none' }}>Avmarkera</button>}
                </header>
                <div style={dtCardBody()}>
                  {selectedEl && selInfo ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(268px, 1fr))', gap: 'var(--dt-space-4)', alignItems: 'start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--dt-space-2)' }}>
                        <span style={miniLabel}>Inspektor</span>
                        <ElementInspector el={selectedEl} onSelect={(e) => setDrillEl(e)} flash={flash} compact />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--dt-space-2)', borderLeft: 'var(--dt-line) solid var(--dt-border)', paddingLeft: 'var(--dt-space-4)' }}>
                        <span style={miniLabel}>Egenskaper</span>
                        <PropertyPanel el={selectedEl} selInfo={selInfo} flash={flash} onClose={() => { setSelKey(null); setDrillEl(null) }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--dt-space-4)', padding: 'var(--dt-space-2)' }}>
                      <span aria-hidden style={{ fontSize: 30, opacity: 0.55, flex: 'none' }}>⌖</span>
                      <span style={{ fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text-dim)', lineHeight: 1.55, maxWidth: 560 }}>
                        Klicka på ett element i riktiga sidan till vänster för att välja och redigera det. Verktyget klättrar till närmaste meningsfulla behållare; håll <b>Shift</b> för exakt träff. Inspektor och egenskaper visas här sida-vid-sida.
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* ── W15 · Kommentarer ── (samma design-note-pipeline som resten →
                  online-lämnad feedback fångas). Knyt till valt element / hela sidan /
                  en ritad ruta; läs & radera tidigare kommentarer på denna sida. */}
              <section style={dtCard()}>
                <header style={dtCardHead()}>
                  <span aria-hidden style={dtIconChip()}>✎</span>
                  <span style={dtCardTitle()}>Kommentarer</span>
                  <span style={dtCardHint()}>→ design-notes</span>
                </header>
                <div style={dtCardBody()}>
                  {/* Mål-chip: vad kommentaren knyts till */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'var(--dt-surface-2)', border: '1px solid var(--dt-border)', borderRadius: 'var(--dt-radius-sm)' }}>
                    <span aria-hidden style={{ color: 'var(--dt-accent)', flex: 'none' }}>↳</span>
                    <span style={{ fontSize: 'var(--dt-text-xs)', fontFamily: 'var(--dt-font-mono)', color: 'var(--dt-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{commentTarget.label}</span>
                    <span style={{ marginLeft: 'auto', flex: 'none', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 'var(--dt-radius-pill)', color: 'var(--dt-accent)', background: 'var(--dt-accent-weak)', border: '1px solid var(--dt-accent-line)', letterSpacing: 'var(--dt-track-label)' }}>{targetKindText}</span>
                  </div>
                  <textarea value={toolCommentText} onChange={(e) => setToolCommentText(e.target.value)} placeholder={`Din kommentar om ${commentTarget.label}…`} rows={3} style={{ ...dtInput(), resize: 'vertical' }} />
                  <div style={{ display: 'flex', gap: 'var(--dt-space-2)' }}>
                    <button type="button" onClick={() => void saveToolComment()} disabled={toolCommentSaving || !toolCommentText.trim()} style={{ ...dtSaveBtn(toolCommentSaving || !toolCommentText.trim()), flex: 1 }}>{toolCommentSaving ? 'Sparar…' : 'Spara kommentar'}</button>
                    <button type="button" onClick={() => setDrawComment((v) => !v)} aria-pressed={drawComment} title="Rita en ruta över riktiga sidan och kommentera just den" style={{ ...dtGhostBtn(drawComment), flex: 'none' }}>{drawComment ? 'Avbryt ritning' : '▭ Rita ruta'}</button>
                  </div>
                  {drawTarget && (
                    <button type="button" onClick={() => { setDrawTarget(null); setDrawRect(null) }} style={{ ...linkBtn, color: 'var(--dt-text-dim)' }}>✕ Rensa ritad ruta (knyt till valt element/sidan i stället)</button>
                  )}

                  {/* Tidigare kommentarer på denna sida */}
                  <button type="button" onClick={() => { const next = !toolNotesOpen; setToolNotesOpen(next); if (next) void refreshToolNotes() }} style={{ ...linkBtn, marginTop: 2 }}>
                    {toolNotesOpen ? '▾ Dölj tidigare kommentarer' : '▸ Visa tidigare kommentarer'}
                  </button>
                  {toolNotesOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                      {toolNotesLoading && <p style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', margin: 0 }}>Hämtar…</p>}
                      {!toolNotesLoading && pageComments.length === 0 && <p style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', margin: 0 }}>Inga kommentarer på den här sidan än.</p>}
                      {pageComments.map((n) => {
                        const mine = !!commentTarget.design_id && n.design_id === commentTarget.design_id
                        return (
                          <div key={n.id} style={{ padding: '6px 8px', background: 'var(--dt-surface-2)', border: `1px solid ${mine ? 'var(--dt-accent-line)' : 'var(--dt-border)'}`, borderRadius: 'var(--dt-radius-sm)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--dt-accent)', fontFamily: 'var(--dt-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label || n.selector || 'kommentar'}</span>
                              {mine && <span style={{ flex: 'none', fontSize: 9, fontWeight: 700, padding: '0 5px', borderRadius: 'var(--dt-radius-pill)', color: 'var(--dt-accent-contrast)', background: 'var(--dt-accent)' }}>den här</span>}
                              <button type="button" onClick={() => void removeToolNote(n.id)} style={{ ...dtGhostBtn(), marginLeft: 'auto', flex: 'none', padding: '0 7px' }}>ta bort</button>
                            </div>
                            <div style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text)', lineHeight: 1.5, wordBreak: 'break-word' }}>{n.comment || '(ingen text)'}</div>
                            {n.near_text && <div style={{ fontSize: 10, color: 'var(--dt-text-mute)', marginTop: 2, fontFamily: 'var(--dt-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{n.near_text}”</div>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </section>

            </div>

            <p style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', margin: 'var(--dt-space-4) 0 0', lineHeight: 1.5 }}>
              Verktyg-fliken = det kompletta designändrings-läget. Layout-verktygen (justera/fördela/mät) bor på <b>Wireframe</b>-fliken; element-egenskaper sparas som egna design-notes via <b>Spara förslag</b>.
            </p>
          </div>
          )
        })()}

        {/* Canvas-viewport (zoom/pan) */}
        <div
          ref={wfViewport}
          onPointerDownCapture={onCanvasHoldDown}
          onPointerDown={onCanvasPointerDown}
          style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', cursor: cursorFor({ spaceDown, panning, measure, target: 'none' }), background: 'var(--dt-surface)', display: rightIsTool ? 'none' : undefined }}
        >
          {/* R15: OÄNDLIG grid-canvas (bakom canvasen → skiner igenom mellan/bakom
              lådorna). Ritas i VIEWPORT-koordinater ur pan/zoom (följer panorering/
              zoom exakt) och förankras i SIDANS grid-origo (kolumn 1:s vänsterkant =
              pan.x + zoom·WF_PAD, steg = zoom·cellW) → linjerna stämmer alltid med de
              riktiga kolumnerna. FULL styrka nedåt (sidor växer nedåt, oändligt) men
              TONAR UT åt sidorna + uppåt (mask) → oändlighetskänsla utan att antyda
              att man kan lägga innehåll utanför sidan. Dovare --dt-grid-*-tokens. */}
          {(() => {
            const step = zoom * cellW
            if (step < 2) return null
            const gridW = cols.current * cellW
            const gutterWf = !mirror && geom ? (geom.gap ?? 0) * wf.k : 0
            const margLWf = !mirror && geom ? (geom.padLeft ?? 0) * wf.k : 0
            const margRWf = !mirror && geom ? (geom.padRight ?? 0) * wf.k : 0
            // Sidans gränser + kolumn-origo i viewport-px (pan + zoom·canvas-koord).
            const originV = pan.x + zoom * WF_PAD                              // kolumn 1:s vänsterkant
            const pageLeftV = pan.x + zoom * (WF_PAD - margLWf)               // inkl. yttermarginal
            const pageRightV = pan.x + zoom * (WF_PAD + gridW + margRWf)
            const pageTopV = pan.y + zoom * WF_PAD
            const fadeSide = Math.max(120, step * 2.6)
            const fadeUp = Math.max(130, step * 2.2)
            const gutterV = gutterWf * zoom
            // V8: griden skiner igenom STARKARE bara TILLFÄLLIGT medan man drar en
            // låda/höjd → starka grid-tokens under aktiv drag-gest, dova annars.
            const dragging = drag != null || nestedDrag != null || hDrag != null
            const lineC = dragging ? 'var(--dt-grid-line-strong)' : 'var(--dt-grid-line)'
            const bandC = dragging ? 'var(--dt-grid-band-strong)' : 'var(--dt-grid-band)'
            const pattern = gutterV >= 3
              ? gridBandCss(lineC, bandC, step, gutterV)
              : gridColLineCss(lineC, step)
            const vMask = fadeMaskVertical(pageTopV, fadeUp)
            const hMask = fadeMaskHorizontal(pageLeftV, pageRightV, fadeSide)
            return (
              <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', WebkitMaskImage: vMask, maskImage: vMask }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: pattern,
                  backgroundPosition: `${originV}px 0`,
                  WebkitMaskImage: hMask, maskImage: hMask,
                }} />
              </div>
            )
          })()}

          <div ref={wfCanvasRef} data-dt-wf-canvas style={{
            position: 'absolute', top: 0, left: 0, transformOrigin: '0 0',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            // W2/W4 (v2.4): INGEN CSS-transition på wf-transformen. Den riktiga sidan
            // uppdateras IMPERATIVT och direkt (scrollTop/left/scale) → en 120ms-
            // transition här fick wireframen att SLÄPA efter sidan under varje
            // skroll/pan/zoom (spegeln drev isär i rörelse). Mjukheten kommer ändå
            // från L1:s frame-vis zoom-interpolation + pan-inertia (som uppdaterar
            // pan/zoom-STATE per frame); en CSS-transition ovanpå dubbelutjämnar och
            // desynkar. Instant transform = 1:1-spegel med sidan.
            transition: 'none',
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
                background: 'var(--dt-grid-band)',
                borderLeft: '1px dashed var(--dt-grid-line)', borderRight: '1px dashed var(--dt-grid-line)',
              }
              return (
                <div aria-hidden style={{ position: 'absolute', top: WF_PAD, left: WF_PAD, width: gridW, bottom: WF_PAD, pointerEvents: 'none' }}>
                  {gutterWf >= 2
                    ? Array.from({ length: cols.current - 1 }).map((_, i) => (
                        <div key={`g${i}`} style={{ ...band, left: (i + 1) * cellW - gutterWf / 2, width: gutterWf }} />
                      ))
                    : Array.from({ length: cols.current - 1 }).map((_, i) => (
                        <div key={`l${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: (i + 1) * cellW, width: 0, borderLeft: '1px dashed var(--dt-grid-line)' }} />
                      ))}
                  {margLWf >= 2 && <div style={{ ...band, left: -margLWf, width: margLWf }} />}
                  {margRWf >= 2 && <div style={{ ...band, left: gridW, width: margRWf }} />}
                </div>
              )
            })()}

            {/* V9: under fri-flytt ritas SNAP-LINJER i projektionens koordinater
                (kandidatkant × k) → de sammanfaller EXAKT med de projicerade lådorna
                (och med den dragna lådan, som ritas vid drag.rect). En streckad ghost
                markerar dessutom var lådan LANDAR i doc-px-rummet. Inga knuffar sker –
                modellen ändras aldrig live, bara wireframen. */}
            {drag && !mirror && (() => {
              const g = projToCanvas(drag.rect, wf.k, 0, 0)
              return (
                <>
                  {drag.snapX != null && (
                    <div aria-hidden style={{ position: 'absolute', top: WF_PAD, bottom: WF_PAD, left: WF_PAD + drag.snapX * wf.k, width: 0, borderLeft: '1.5px solid var(--dt-accent)', pointerEvents: 'none', zIndex: 6 }} />
                  )}
                  {drag.snapY != null && (
                    <div aria-hidden style={{ position: 'absolute', left: WF_PAD, right: WF_PAD, top: WF_PAD + drag.snapY * wf.k, height: 0, borderTop: '1.5px solid var(--dt-accent)', pointerEvents: 'none', zIndex: 6 }} />
                  )}
                  <div aria-hidden style={{ position: 'absolute', left: WF_PAD + g.x, top: WF_PAD + g.y, width: g.w, height: g.h, border: '1.5px dashed var(--dt-accent)', borderRadius: 'var(--dt-radius-sm)', pointerEvents: 'none', zIndex: 5 }} />
                </>
              )
            })()}

            {/* ── W12/W29: LIVE grid-flytt – streckad ghost visar var lådan LANDAR i
                gridet (kolumnspår × radband). Vid "mellan rader" (halvtal) ritas en
                infognings-linje som nästlade flyttar. Grid-koordinater (samma rum som
                wireframens rad-layout) → förankrad i spåren. ── */}
            {gridMove && !mirror && (() => {
              const gLeft = (gridMove.colStart - 1) * cellW
              const gW = Math.max(cellW - 4, gridMove.span * cellW - 4)
              const rowFloor = Math.floor(gridMove.row)
              const rb = wf.rowBox.get(rowFloor)
              if (gridMove.frac) {
                // Infoga mellan rader: linje vid radens överkant (eller under sista raden).
                const rowsSorted = Array.from(wf.rowBox.keys()).sort((a, b) => a - b)
                const below = rowsSorted.find((rr) => rr > gridMove.row)
                const lineTop = below != null ? (wf.rowBox.get(below)?.top ?? wf.gridBottom) : wf.gridBottom
                return (
                  <>
                    <div aria-hidden style={{ position: 'absolute', left: WF_PAD, right: WF_PAD, top: WF_PAD + lineTop - 1, height: 0, borderTop: '2px solid var(--dt-accent)', pointerEvents: 'none', zIndex: 6 }} />
                    <div aria-hidden style={{ position: 'absolute', left: WF_PAD + gLeft, top: WF_PAD + lineTop + 2, width: gW, height: 24, background: 'var(--dt-accent-weak)', border: '1.5px dashed var(--dt-accent)', borderRadius: 'var(--dt-radius-sm)', pointerEvents: 'none', zIndex: 6 }} />
                  </>
                )
              }
              const gTop = rb?.top ?? wf.gridBottom
              const gH = rb?.h ?? ROW_H
              return (
                <div aria-hidden style={{ position: 'absolute', left: WF_PAD + gLeft, top: WF_PAD + gTop, width: gW, height: gH, background: 'var(--dt-accent-weak)', border: '1.5px dashed var(--dt-accent)', borderRadius: 'var(--dt-radius-sm)', pointerEvents: 'none', zIndex: 6 }} />
              )
            })()}

            {/* ── A1: topp-band utanför sidans grid (toppbar/hero/sidfot) ── */}
            {wf.bandBoxes.map(({ band, y, h }) => {
              const hasKids = !band.locked && wf.childrenOf(band.id, null).length > 0
              // V17: projicera bandet ur dess riktiga bounding-box (samma spegel som
              // topp-blocken); grid-fallback till den staplade y/h innan projektionen mätts.
              const BP = vProj[band.id] ? projToCanvas(vProj[band.id], wf.k, cellW - 4, band.locked ? 14 : MIN_BLOCK_WF) : null
              const bandLeft = BP ? BP.x : 0
              const bandTop = BP ? BP.y : y
              const bandW = BP ? BP.w : Math.max(cellW - 4, cols.current * cellW - 4)
              const bandH = BP ? BP.h : h
              const bandSel = !mirror && selSet.has(band.id)
              return (
                <div
                  key={band.id}
                  data-dt-hover-id={band.id}
                  data-dt-hover-kind="band"
                  // W3 (v2.4): ⇧-klick markerar bandet (samma multi-select som lådorna).
                  onPointerDown={(e) => { if (e.shiftKey) { e.preventDefault(); e.stopPropagation(); toggleSel(band.id) } }}
                  onClick={(e) => { if (!e.shiftKey) { selectSingle(band.id); flashReal(band.el) } }}
                  style={{
                    position: 'absolute', left: WF_PAD + bandLeft, top: WF_PAD + bandTop, width: bandW, height: bandH,
                    background: band.locked
                      ? 'repeating-linear-gradient(45deg, var(--dt-surface-2) 0 8px, var(--dt-surface) 8px 16px)'
                      : 'var(--dt-surface-raised)',
                    border: `var(--dt-line) ${band.locked ? 'dashed' : 'solid'} ${bandSel ? 'var(--dt-accent)' : 'var(--dt-bp-stroke)'}`,
                    outline: bandSel ? 'var(--dt-line-strong) solid var(--dt-accent)' : 'none', outlineOffset: 1,
                    borderRadius: 'var(--dt-radius-sm)', boxShadow: bandSel ? 'var(--dt-sel-glow)' : band.locked ? 'none' : 'var(--dt-shadow)',
                    userSelect: 'none', cursor: 'default',
                  }}
                >
                  {!band.locked && renderPlaceholders(band.id, bandW, bandH)}
                  {/* W7: band-namn centrerat (toppbar/hero/sidfot) – hjälper igenkänning. */}
                  {!band.locked && centeredLabel(band.label, bandW, bandH)}
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', height: hasKids ? TOP_HEAD : '100%', pointerEvents: 'none', zIndex: 2 }}>
                    {band.locked && <span aria-hidden style={{ fontSize: 10, lineHeight: 1 }}>🔒</span>}
                    {/* V6: ingen band-titel (tooltip kvar) – bara lås-/fast-tillståndet. */}
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 9, color: 'var(--dt-text-mute)' }}>{band.locked ? 'låst' : 'fast'}</span>
                  </div>
                  {hasKids && renderNested(band.id, null, bandW - 8, 2, 0)}
                </div>
              )
            })}

            {/* Områdes-block (skalenlig höjd: verklig proportion + nästlade regioner) */}
            {vAreas.filter((a) => !a.hidden).map((a) => {
              // V17: placering + storlek DIREKT ur riktiga elementets projicerade
              // rect (samma origo/skala som sidan) → exakt spegel. Grid-fallback
              // (colStart/rowBox) bara innan projektionen mätts / i mobil-spegeln.
              // V9: en fri-flytt-INTENT (live-drag eller sparad) vinner över vilo-
              // projektionen → lådan ritas exakt där användaren placerat den (samma
              // dokument-px-rum → snap-linjer nedan sammanfaller exakt). Overlay – rör
              // aldrig riktiga gridet, så grannar knuffas inte.
              const srcRect: ProjRect | null = mirror
                ? (vProj[a.key] ?? null)
                : (drag?.key === a.key ? drag.rect : (intents[a.key]?.rect ?? vProj[a.key] ?? null))
              const P = srcRect ? projToCanvas(srcRect, wf.k, cellW - 4, MIN_BLOCK_WF) : null
              const left = P ? P.x : (a.colStart - 1) * cellW
              const rb = wf.rowBox.get(a.row)
              const top = P ? P.y : (rb?.top ?? wf.gridBottom)
              const w = a.span * cellW
              const blockW = P ? P.w : Math.max(cellW - 4, w - 4)
              const blockH = P ? P.h : wf.blockH(a.key)
              const hasKids = wf.childrenOf(a.key, null).length > 0
              const bad = overlaps.has(a.key)
              const isDrag = drag?.key === a.key || gridMove?.key === a.key || (hDrag != null && hDrag.top && hDrag.id === a.key)
              const isSel = !mirror && selSet.has(a.key)
              const isPh = isPlaceholderKey(a.key)
              const th = vTopH[a.key]
              return (
                <div
                  key={a.key}
                  data-dt-box={a.key}
                  data-dt-hover-id={a.key}
                  data-dt-hover-kind="top"
                  data-dt-doc-y={P ? Math.round(P.y / wf.k) : ''}
                  data-dt-doc-h={P ? Math.round(P.h / wf.k) : ''}
                  // W12/W29: i ett riktigt grid + snap på ⇒ LIVE grid-flytt (skrivs till
                  // sidan); annars fri skiss (intention → uppgift). Samma rena beslut
                  // (topBoxMoveMode) driver läges-badgen nedan → alltid i synk.
                  onPointerDown={(e) => (!isPh && topBoxMoveMode({ isRealGrid: gridIsRealGrid.current, snapToGrid, hasDirtyIntent: !!(intents[a.key] && intentDirty(intents[a.key])) }) === 'grid' ? startGridMove(e, a) : startIntentDrag(e, a, 'move'))}
                  style={{
                    position: 'absolute', left: WF_PAD + left, top: WF_PAD + top, width: blockW, height: blockH,
                    background: isDrag ? 'var(--dt-accent-weak)' : isPh ? 'var(--dt-surface-2)' : 'var(--dt-surface-raised)',
                    // B1: konsekvent tunn blueprint-stroke (definierad ritnings-ink) på ovalda lådor.
                    border: `var(--dt-line) ${isPh ? 'dashed' : 'solid'} ${bad ? 'var(--dt-warn)' : isSel ? 'var(--dt-accent)' : isDrag ? 'var(--dt-border-strong)' : 'var(--dt-bp-stroke)'}`,
                    // B3: markerings-ram i betonad linjevikt + accent-glöd BARA på valt element.
                    outline: isSel ? 'var(--dt-line-strong) solid var(--dt-accent)' : 'none', outlineOffset: 1,
                    borderRadius: 'var(--dt-radius-sm)', boxShadow: isSel ? 'var(--dt-sel-glow)' : 'var(--dt-shadow)', cursor: cursorFor({ spaceDown, panning, measure, target: 'box' }),
                    userSelect: 'none',
                    // L1: mikro-studs (skala-puls) på den DRAGNA lådan när en snap engagerar.
                    transform: isDrag && snapBounce > 0 ? `scale(${1 + snapBounce * 0.01})` : undefined,
                    transition: (reduced || isDrag) ? 'none' : 'left 160ms cubic-bezier(0.22,1,0.36,1), width 160ms cubic-bezier(0.22,1,0.36,1), top 160ms cubic-bezier(0.22,1,0.36,1), height 160ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  {!isPh && renderPlaceholders(a.key, blockW, blockH)}
                  {/* W7: block-namn centrerat i rutan – hjälper minnas vilken ruta som är
                      vad när layouten rumsteras om (platshållar-block har egen etikett). */}
                  {!isPh && centeredLabel(a.label, blockW, blockH)}
                  {/* B3: subtil accent-fyllning + fyrkantiga hörn-handtag på VALT block. */}
                  {isSel && (
                    <>
                      <div aria-hidden data-dt-selfill style={{ position: 'absolute', inset: 0, background: 'var(--dt-accent-weak)', borderRadius: 'var(--dt-radius-sm)', pointerEvents: 'none', zIndex: 1 }} />
                      {cornerHandles(reduced)}
                    </>
                  )}
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', height: hasKids ? TOP_HEAD : Math.min(blockH, TOP_HEAD + 4), zIndex: 2 }}>
                    {isSel && <span aria-hidden style={{ fontSize: 11, color: 'var(--dt-accent)', lineHeight: 1 }}>✓</span>}
                    {/* V6: inga låd-titlar – rubrik-stapeln (platshållare) räcker. Endast
                        platshållar-INSÄTTNINGSblock behåller sin etikett (affordans, ej spegel). */}
                    {isPh
                      ? <span style={{ fontSize: 'var(--dt-text-xs)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, fontStyle: 'italic', color: 'var(--dt-text-dim)' }}>{`＋ ${a.label}`}</span>
                      : <span style={{ flex: 1 }} />}
                    {/* W12: läges-badge – flytt slår igenom live (grid) eller ritas som fri skiss. */}
                    {!isPh && layoutModeBadge(
                      topBoxMoveMode({ isRealGrid: gridIsRealGrid.current, snapToGrid, hasDirtyIntent: !!(intents[a.key] && intentDirty(intents[a.key])) }),
                      blockW,
                    )}
                    {/* A2/R10: auto-höjd märks diskret; FAST höjd märks tydligt (ovanligt → uppmärksammas). */}
                    {th && (th.fixed
                      ? <span style={{ flex: 'none', fontSize: 9, fontWeight: 700, lineHeight: '12px', color: 'var(--dt-accent-contrast)', background: 'var(--dt-accent)', borderRadius: 3, padding: '0 4px', whiteSpace: 'nowrap' }}>fast höjd</span>
                      : <span style={{ flex: 'none', fontSize: 9, fontStyle: 'italic', lineHeight: '12px', color: 'var(--dt-text-mute)', border: '1px solid var(--dt-border)', borderRadius: 3, padding: '0 4px' }}>auto</span>)}
                    <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', fontVariantNumeric: 'tabular-nums' }}>{a.span}</span>
                    {!isPh && <button type="button" aria-label="Egenskaper" onPointerDown={(e) => { e.stopPropagation(); selectBlock(a) }} style={{ background: 'none', border: 'none', color: selKey === a.key ? 'var(--dt-accent)' : 'var(--dt-text-mute)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>◧</button>}
                    <button type="button" aria-label="Radera område" onPointerDown={(e) => { e.stopPropagation(); deleteArea(a) }} style={{ background: 'none', border: 'none', color: 'var(--dt-text-mute)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>✕</button>
                  </div>
                  {/* Nästlade regioner (A1/A2): auto-detekterade, skalenliga, dra/resiza inom föräldern */}
                  {hasKids && renderNested(a.key, null, blockW - 4, 2, 0)}
                  {/* Resize-handtag (bredd, höger kant) */}
                  <span onPointerDown={(e) => startIntentDrag(e, a, 'resize-e')} style={{ position: 'absolute', right: -3, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 3 }} />
                  {/* V9: höjd-handtag (underkant) – FRI resize som intent-overlay (ingen
                      knuff av grannar). Snappar mot grannens underkant. Platshållar-
                      block undantas (ingen meningsfull höjd att sätta). */}
                  {th && !isPh && (
                    <span
                      onPointerDown={(e) => { e.stopPropagation(); startIntentDrag(e, a, 'resize-s') }}
                      style={{ position: 'absolute', left: 0, right: 0, bottom: -3, height: 8, cursor: 'ns-resize', zIndex: 3 }}
                    />
                  )}
                  {/* V9: hörn-handtag (nedre höger) – fri resize av både bredd och höjd. */}
                  {th && !isPh && (
                    <span
                      onPointerDown={(e) => { e.stopPropagation(); startIntentDrag(e, a, 'resize-se') }}
                      style={{ position: 'absolute', right: -3, bottom: -3, width: 12, height: 12, cursor: 'nwse-resize', zIndex: 4 }}
                    />
                  )}
                </div>
              )
            })}

            {/* ── W5: LYFTA nästlade rutor – fria intent-skisser ovanpå projektionen ──
                En ruta som dragits UT ur sin container lever inte längre i container-
                gridet: den ritas som en fri låda (samma rum som topp-blocken) och kan
                dras vidare / resizas fritt. HYBRID (W12): detta är en SKISS → uppgift,
                aldrig ett pixel-fusk i riktiga sidans grid (den lämnas orörd). */}
            {nested.filter((r) => nestedLifted(r.id)).map((r) => {
              const src = drag?.key === r.id ? drag.rect : intents[r.id]?.rect
              if (!src) return null
              const P = projToCanvas(src, wf.k, 28, MIN_REGION_WF)
              const isDrag = drag?.key === r.id
              const isSel = drillEl === r.innerEl || (!mirror && selSet.has(r.id))
              return (
                <div
                  key={`lift:${r.id}`}
                  data-dt-hover-id={r.id}
                  data-dt-hover-kind="nested"
                  onPointerDown={(e) => startFreeDrag(e, r.id, r.label, r.el, 'move')}
                  style={{
                    position: 'absolute', left: WF_PAD + P.x, top: WF_PAD + P.y, width: P.w, height: P.h,
                    background: isDrag ? 'var(--dt-accent-weak)' : 'var(--dt-surface)',
                    // Fri skiss = accentfärgad streckad kontur (skiljer sig från container-lådorna).
                    border: `var(--dt-line-strong) dashed ${isSel ? 'var(--dt-accent)' : 'var(--dt-accent-line)'}`,
                    outline: isSel ? 'var(--dt-line-strong) solid var(--dt-accent)' : 'none', outlineOffset: 1,
                    borderRadius: 'var(--dt-radius-sm)', boxShadow: isSel ? 'var(--dt-sel-glow)' : 'var(--dt-shadow)',
                    cursor: cursorFor({ spaceDown, panning, measure, target: 'box' }), userSelect: 'none', zIndex: 5,
                    transition: (reduced || isDrag) ? 'none' : 'left 160ms cubic-bezier(0.22,1,0.36,1), top 160ms cubic-bezier(0.22,1,0.36,1), width 160ms cubic-bezier(0.22,1,0.36,1), height 160ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  {renderPlaceholders(r.id, P.w, P.h)}
                  {centeredLabel(r.label, P.w, P.h)}
                  {P.w >= 54 && <span aria-hidden style={{ position: 'absolute', left: 4, top: 1, fontSize: 8, fontStyle: 'italic', lineHeight: '10px', color: 'var(--dt-accent)', pointerEvents: 'none', zIndex: 2 }}>fri skiss</span>}
                  <button type="button" aria-label={`Egenskaper för ${r.label}`} onPointerDown={(e) => { e.stopPropagation(); selectNested(r) }} style={{ position: 'absolute', right: 1, top: 1, background: 'none', border: 'none', color: isSel ? 'var(--dt-accent)' : 'var(--dt-text-mute)', cursor: 'pointer', fontSize: 10, lineHeight: 1, padding: 1, zIndex: 3 }}>◧</button>
                  <span onPointerDown={(e) => { e.stopPropagation(); startFreeDrag(e, r.id, r.label, r.el, 'resize-se') }} style={{ position: 'absolute', right: -3, bottom: -3, width: 12, height: 12, cursor: 'nwse-resize', zIndex: 4 }} />
                </div>
              )
            })}

            {/* ── R4: SYNLIG ghost vid intra-container-drag av en nästlad ruta ──
                Följer pekaren (fri-drag-känsla) medan drop-indikatorn (renderNested)
                visar vart den snäpper. Ritas i wireframe-roten i canvas-rummet så den
                ligger korrekt oavsett hur djupt containern är nästlad. */}
            {nestedGhost && (
              <div aria-hidden style={{
                position: 'absolute', left: WF_PAD + nestedGhost.x, top: WF_PAD + nestedGhost.y,
                width: nestedGhost.w, height: nestedGhost.h,
                background: 'var(--dt-accent-weak)', border: 'var(--dt-line-strong) solid var(--dt-accent)',
                borderRadius: 'var(--dt-radius-sm)', boxShadow: 'var(--dt-sel-glow)',
                pointerEvents: 'none', zIndex: 6, opacity: 0.9,
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              }}>
                {nestedGhost.w >= 44 && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--dt-accent)', whiteSpace: 'nowrap', padding: '0 4px', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {nestedGhost.label}
                  </span>
                )}
              </div>
            )}

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
                  <span style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 9, fontWeight: 700, fontFamily: 'var(--dt-font-mono)', color: 'var(--dt-accent-contrast)', background: m.token.onToken ? 'var(--dt-accent)' : 'var(--dt-warn)', padding: '1px 5px', borderRadius: 'var(--dt-radius-sm)', fontVariantNumeric: 'tabular-nums' }}>
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

            <div style={{ height: wf.totalH + WF_PAD }} />
          </div>

          {/* R15: griden skiner subtilt IGENOM de bakersta lådorna – samma
              kolumnlinjer (bara kanterna, ingen fyllning), mycket låg opacitet,
              klippt till sidans yta → man ser gridsystemet UNDER innehållet utan
              att det konkurrerar med lådorna. Ligger ovanpå canvasen men under
              MacBook-rekten/egenskaps-panelen (låg zIndex). */}
          {!mirror && (() => {
            const step = zoom * cellW
            if (step < 2) return null
            const gridW = cols.current * cellW
            const pageLeftV = pan.x + zoom * WF_PAD          // = kolumn-origo
            const pageTopV = pan.y + zoom * WF_PAD
            const pageBottomV = pan.y + zoom * (WF_PAD + wf.totalH)
            const h = pageBottomV - pageTopV
            if (h <= 0) return null
            const gutterV = (geom ? (geom.gap ?? 0) * wf.k : 0) * zoom
            const pattern = gutterV >= 3
              ? gridBandCss('var(--dt-grid-line)', 'transparent', step, gutterV)
              : gridColLineCss('var(--dt-grid-line)', step)
            return (
              <div aria-hidden style={{
                position: 'absolute', left: pageLeftV, top: pageTopV,
                width: zoom * gridW, height: h,
                pointerEvents: 'none', overflow: 'hidden', opacity: 0.5, zIndex: 2,
                backgroundImage: pattern, backgroundPosition: '0px 0',
              }} />
            )
          })()}

          {/* ── R13/W13: MacBook-rektangeln som VIEWPORT-indikator – ritas UTANFÖR den
              skrollade/transformerade canvasen (direkt barn till viewporten) →
              står STILL vertikalt vid skroll (ankrad till toppen av synliga ytan)
              men SKALAR med zoom. Följer innehållets mitt horisontellt.
              W13: valbar via 💻-knappen i Layout-raden, AV som standard. ── */}
          {showMacbook && !mirror && (() => {
            const r = macbookViewportRect(wf.k, cols.current * cellW, zoom, pan.x, WF_PAD)
            return (
              <div data-dt-macbook aria-hidden style={{
                position: 'absolute', left: r.left, top: r.top, width: r.w, height: r.h,
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

          {/* Live-värde-etikett vid drag */}
          {drag && (
            <div style={{
              position: 'absolute', left: 12, bottom: 12, pointerEvents: 'none',
              background: 'var(--dt-surface-raised)', border: '1px solid var(--dt-border-strong)', borderRadius: 'var(--dt-radius-sm)',
              padding: '4px 10px', fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text)', boxShadow: 'var(--dt-shadow)', fontVariantNumeric: 'tabular-nums',
            }}>
              {drag.label} · <b>{Math.round(drag.rect.w)}×{Math.round(drag.rect.h)} px</b> · vid ({Math.round(drag.rect.x)}, {Math.round(drag.rect.y)})
              {drag.mode === 'move' ? ' · fri flytt' : ' · fri resize'}
              {(drag.snapX != null || drag.snapY != null) ? ' · snap' : ''}
            </div>
          )}
          {/* W12/W29: Live-värde-etikett vid grid-flytt (snap till spår → live). */}
          {gridMove && (
            <div style={{
              position: 'absolute', left: 12, bottom: 12, pointerEvents: 'none',
              background: 'var(--dt-surface-raised)', border: '1px solid var(--dt-border-strong)', borderRadius: 'var(--dt-radius-sm)',
              padding: '4px 10px', fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text)', boxShadow: 'var(--dt-shadow)', fontVariantNumeric: 'tabular-nums',
            }}>
              <b>▦ grid-flytt (live)</b> · kol {gridMove.colStart}–{gridMove.colStart + gridMove.span - 1} av {cols.current}
              {gridMove.frac ? ' · ny rad' : ` · rad ${Math.floor(gridMove.row)}`} · snäpper till spår
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
              HOOK-P6-LAYOUT: align/distribute + mät-overlay ovanpå canvasen.
              V16: i verktygsläget bor egenskaps-panelen på höger yta (ej dockad i den
              dolda wireframe-canvasen) → undvik dubbel-montering av samma PropertyPanel. */}
          {selectedEl && selInfo && !rightIsTool && (
            <div data-dt-native-scroll style={{
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

      {/* ── L2 (v2.3): diskret "Återställde ditt utkast"-notis. Visas när ett osparat
          utkast (FW3-intentioner/FW7-css) återställts efter en reload/krasch.
          Avfärdbar (×, behåller arbetet); "Förkasta" slänger det återställda. ── */}
      {draftRestored && (
        <div
          role="status"
          data-dt-draft-notice
          style={{
            position: 'absolute', left: '50%', bottom: FOOT_H + 14, transform: 'translateX(-50%)',
            zIndex: 8, display: 'flex', alignItems: 'center', gap: 'var(--dt-space-3)',
            padding: 'var(--dt-space-2) var(--dt-space-3)', pointerEvents: 'auto',
            background: 'var(--dt-surface-solid)', border: '1px solid var(--dt-border-strong)',
            borderRadius: 'var(--dt-radius-md)', boxShadow: 'var(--dt-panel-shadow)',
            fontFamily: 'var(--dt-font)', fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text)',
            animation: reduced ? 'none' : 'dtFade var(--dt-dur-fast) var(--dt-spring)',
          }}
        >
          <span aria-hidden style={{ fontSize: 'var(--dt-text-base)' }}>↩</span>
          <span>Återställde ditt utkast</span>
          {/* W24: Förkasta kastar bort återställt utkast (destruktivt) → varningsfärg. */}
          <button type="button" onClick={discardDraft} style={{ ...dtDangerBtn(), padding: '2px 8px' }}>Förkasta</button>
          <button
            type="button"
            aria-label="Avfärda notis"
            onClick={() => setDraftRestored(false)}
            style={{ ...dtGhostBtn(), padding: '2px 8px', color: 'var(--dt-text-mute)' }}
          >×</button>
        </div>
      )}

      {/* ── B6: "Vill du spara ändringarna?"-dialog (Word/Excel-stil) vid Avsluta
          med osparade layout-ändringar. Spara = öppna R11:s namnge-dialog (så
          förslaget döps även vid Avsluta) och stäng Design mode efter lyckad
          sparning; Spara inte = släng overrides (dagens beteende); Avbryt = stanna. ── */}
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
            boxShadow: 'var(--dt-panel-shadow)', padding: 'var(--dt-space-5)',
            fontFamily: 'var(--dt-font)', color: 'var(--dt-text)',
          }}>
            <h2 style={{ fontSize: 'var(--dt-text-lg)', fontWeight: 700, margin: '0 0 var(--dt-space-2)' }}>Vill du spara ändringarna?</h2>
            <p style={{ fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text-dim)', lineHeight: 1.55, margin: '0 0 var(--dt-space-4)' }}>
              Layouten har osparade ändringar. Sparar du inte går de förlorade när Design mode stängs.
            </p>
            <div style={{ display: 'flex', gap: 'var(--dt-space-2)', alignItems: 'center' }}>
              {/* W24: BARA "Spara inte" (kastar bort ändringar = destruktivt) bär
                  varningsfärgen; Spara (positiv grön) och Avbryt (neutral) gör inte. */}
              <button type="button" onClick={() => { setExitAsk(false); onExit() }} style={dtDangerBtn()}>Spara inte</button>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={() => setExitAsk(false)} style={dtGhostBtn()}>Avbryt</button>
              <button
                type="button"
                autoFocus
                onClick={() => { setExitAsk(false); exitAfterSaveRef.current = true; requestSave() }}
                style={dtSaveBtn()}
              >Spara…</button>
            </div>
          </div>
        </div>
      )}

      {/* ── R11: namnge-dialog – "Spara detta designförslag som en design note?"
          + fritt namnfält (förifyllt auto-förslag ur ändringarna). Spara → skickar
          design-noten med namnet; Avbryt → stäng utan att spara. Öppnas av
          "Spara layout" och av Avsluta-dialogens "Spara…" (då exit efter lyckad). ── */}
      {saveAsk && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Spara designförslag"
          onPointerDown={(e) => { if (e.target === e.currentTarget) closeSaveDialog() }}
          style={{
            position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--dt-scrim)', pointerEvents: 'auto',
            animation: reduced ? 'none' : 'dtFade var(--dt-dur-fast) var(--dt-spring)',
          }}
        >
          <div style={{
            width: 460, maxWidth: 'calc(100% - 48px)', background: 'var(--dt-surface-solid)',
            border: '1px solid var(--dt-border-strong)', borderRadius: 'var(--dt-radius-lg)',
            boxShadow: 'var(--dt-panel-shadow)', padding: 'var(--dt-space-5)',
            fontFamily: 'var(--dt-font)', color: 'var(--dt-text)',
          }}>
            <h2 style={{ fontSize: 'var(--dt-text-lg)', fontWeight: 700, margin: '0 0 var(--dt-space-2)' }}>Spara detta designförslag som en design note?</h2>
            <p style={{ fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text-dim)', lineHeight: 1.55, margin: '0 0 var(--dt-space-3)' }}>
              Ge förslaget ett namn så du känner igen det i design-note-inkorgen.
            </p>
            <label htmlFor="dt-save-name" style={{ display: 'block', fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', fontWeight: 600, margin: '0 0 var(--dt-space-1)' }}>Namn på förslaget</label>
            <input
              id="dt-save-name"
              type="text"
              value={saveName}
              placeholder="t.ex. ändring av riskprofilkortens bredd"
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void doSaveFromDialog() } }}
              onFocus={(e) => e.currentTarget.select()}
              autoFocus
              style={{ ...dtInput(), marginBottom: 'var(--dt-space-4)' }}
            />
            {/* V15: har man ändrat BÅDE struktur och css-tema → välj vad som ska med. */}
            {isDirty() && cssDirty && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--dt-space-2)', margin: '0 0 var(--dt-space-4)', padding: 'var(--dt-space-3)', borderRadius: 'var(--dt-radius)', border: '1px solid var(--dt-border)', background: 'var(--dt-surface-2)' }}>
                <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', fontWeight: 600 }}>Vad ska sparas?</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={saveStruct} onChange={(e) => setSaveStruct(e.target.checked)} style={{ accentColor: 'var(--dt-accent)' }} />
                  Strukturella ändringar (layout/wireframe)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={saveCss} onChange={(e) => setSaveCss(e.target.checked)} style={{ accentColor: 'var(--dt-accent)' }} />
                  {(() => {
                    const nTok = cssEntries().length
                    const nBox = Object.keys(scopedOverrides).length
                    const bits: string[] = []
                    if (nTok > 0) bits.push(`${nTok} token${nTok === 1 ? '' : 's'} (globalt)`)
                    if (nBox > 0) bits.push(`${nBox} i ruta`)
                    return `CSS-ändringar${bits.length ? ` (${bits.join(' + ')})` : ''}`
                  })()}
                </label>
              </div>
            )}
            <div style={{ display: 'flex', gap: 'var(--dt-space-2)', alignItems: 'center' }}>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={closeSaveDialog} style={dtGhostBtn()}>Avbryt</button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void doSaveFromDialog()}
                style={dtSaveBtn(saving)}
              >{saving ? 'Sparar…' : 'Spara'}</button>
            </div>
          </div>
        </div>
      )}
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

// ── Layout-verktygsradens knappar (Post 6) ──
function tbGroup(): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 1, padding: 2, background: 'var(--dt-surface-2)', borderRadius: 'var(--dt-radius-sm)', border: '1px solid var(--dt-border)' }
}
function tbBtn(on = false): React.CSSProperties {
  return {
    // R16 + W9: större/lättare att se – glyferna i Layout-raden var för små.
    minWidth: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 6px', fontSize: 'var(--dt-text-lg)', fontWeight: 600, cursor: 'pointer', lineHeight: 1,
    borderRadius: 'var(--dt-radius-sm)', border: '1px solid ' + (on ? 'var(--dt-border-strong)' : 'transparent'),
    background: on ? 'var(--dt-accent-weak)' : 'transparent', color: on ? 'var(--dt-accent)' : 'var(--dt-text-dim)',
    transition: 'background var(--dt-dur-fast) var(--dt-spring), color var(--dt-dur-fast) var(--dt-spring)',
  }
}
function tbSep(): React.CSSProperties {
  return { width: 1, height: 20, background: 'var(--dt-border)', margin: '0 2px' }
}

/** W12: liten LÄGES-badge på en wireframe-låda. Visar per ruta OM en flytt slår
 *  igenom LIVE i den riktiga sidan (ligger i en deklarativ layout-behållare →
 *  grid-column/row eller flödes-omordning skrivs direkt) ELLER ritas som en fri
 *  skiss (intention → uppgift till Claude, sidan rörs inte). App-agnostiskt: läget
 *  härleds ur containern (grid/flöde) och snap-tillståndet, aldrig ur sid-specifika
 *  antaganden. `w` = lådans bredd (wf-px) → full text på breda, kompakt på smala. */
function layoutModeBadge(mode: 'grid' | 'flow' | 'intent', w: number): React.ReactNode {
  if (w < 46) return null
  const live = mode !== 'intent'
  const full = w >= 96
  const label = full
    ? (mode === 'grid' ? 'grid-cell · live' : mode === 'flow' ? 'flöde · live' : 'fri skiss → uppgift')
    : (live ? 'live' : 'skiss')
  return (
    <span style={{
      flex: 'none', fontSize: 8, lineHeight: '10px', whiteSpace: 'nowrap',
      fontStyle: live ? 'normal' : 'italic', fontWeight: live ? 700 : 400,
      color: live ? 'var(--dt-accent)' : 'var(--dt-text-dim)',
      background: live ? 'var(--dt-accent-weak)' : 'transparent',
      border: `1px ${live ? 'solid var(--dt-accent-line)' : 'dashed var(--dt-border-strong)'}`,
      borderRadius: 3, padding: '0 3px',
    }}>{live ? '▦ ' : '✎ '}{label}</span>
  )
}

/** R14 + V4/V5: förenklad platshållar-markör per atom-typ. REKTANGULÄR (max ~1px
 *  hörn) om inte elementet FAKTISKT är en cirkel (`round`, t.ex. kompassros) – då
 *  ritas den rund. Inga diagonala band över bild-/graf-ytor (V5) – lugn ruta. */
function phMark(kind: Placeholder['kind'], x: number, y: number, w: number, h: number, round = false): React.CSSProperties {
  const base: React.CSSProperties = { position: 'absolute', left: x, top: y, width: w, height: h, boxSizing: 'border-box', pointerEvents: 'none' }
  // V4: en faktisk cirkel (t.ex. kompassros) representeras rund – oavsett atom-typ.
  if (round) return { ...base, border: '1px solid var(--dt-border-strong)', background: 'var(--dt-surface-2)', borderRadius: '50%', opacity: 0.9 }
  switch (kind) {
    case 'heading': // större textrad-markör (rubrik) – kraftigare stapel
      return { ...base, height: Math.min(h, 12), background: 'var(--dt-text-dim)', opacity: 0.5, borderRadius: 1 }
    case 'text': // textrad(er) – tunn(a) mörk(a) stapel/rader
      return { ...base, opacity: 0.45, borderRadius: 1, backgroundImage: 'repeating-linear-gradient(var(--dt-text-mute) 0 2px, transparent 2px 5px)' }
    case 'button': // knapp/UI-element – REKTANGULÄR (V4: aldrig piller)
      return { ...base, border: '1px solid var(--dt-border-strong)', background: 'var(--dt-surface-2)', borderRadius: 1, opacity: 0.9 }
    case 'image': // bild/ikon/graf – lugn ruta (V5: ingen diagonal)
    default:
      return { ...base, border: '1px solid var(--dt-border)', background: 'var(--dt-surface-2)', borderRadius: 1 }
  }
}

/** B3 · Precisa FYRKANTIGA hörn-handtag (Figma-likt) på ett VALT element. Rent
 *  dekorativa (pointer-events: none) – de faktiska resize-greppen är osynliga strips
 *  under lådan. Fyra små accent-fyllda kvadrater med kontrast-kant, konsekvent
 *  storlek (`--dt-handle`). `reduced` stänger av fade-in så det aldrig gate:ar. */
function cornerHandles(reduced: boolean): React.ReactNode {
  const base: React.CSSProperties = {
    position: 'absolute', width: 'var(--dt-handle)', height: 'var(--dt-handle)',
    background: 'var(--dt-accent)', border: '1px solid var(--dt-accent-contrast)',
    borderRadius: 1, boxSizing: 'border-box', pointerEvents: 'none', zIndex: 6,
    animation: reduced ? 'none' : 'dtFade var(--dt-dur-fast) var(--dt-spring)',
  }
  const off = 'calc(var(--dt-handle) / -2 - 1px)'
  return (
    <>
      <span aria-hidden data-dt-handle style={{ ...base, left: off, top: off }} />
      <span aria-hidden data-dt-handle style={{ ...base, right: off, top: off }} />
      <span aria-hidden data-dt-handle style={{ ...base, left: off, bottom: off }} />
      <span aria-hidden data-dt-handle style={{ ...base, right: off, bottom: off }} />
    </>
  )
}

/** Regionsnamn (A3): generiskt ur rubrik/aria/roll/typ – aldrig instansdata.
 *  All logik bor i lib/design/regionNames.ts (ren kärna, enhets-testad). */
function pickLabel(el: HTMLElement, i: number, slot = false): string {
  return nameForElement(el, `Område ${i + 1}`, { slot })
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
  /** R14: platshållar-atomer per container-id (area-key/band-id/region-id). */
  placeholders: Record<string, Placeholder[]>
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
          label: pickLabel(el, nestedOut.length, child.kind === 'slot'),
          el,
          innerEl: (els[child.innerRef] as HTMLElement | undefined) ?? el,
          anchorEl,
          scopeEl: (els[child.scopeRef] as HTMLElement | undefined) ?? el,
          mech: scopeMech(scopeNode),
          kind: child.kind === 'slot' ? 'slot' : 'visual',
          separated: child.separated,
          cols: place.cols, colStart: place.colStart, span: place.span,
          row,
          sfx: (originX - pr.x) / Math.max(1, pr.w),
          sfw: innerW / Math.max(1, pr.w),
          hpx: child.rect.h,
          origH: child.rect.h,
          relY: child.rect.y - pr.y,
          fixedH: false, fixedEl: null, fixedOrigPx: 0, fixedOrigInline: '', // fylls av höjdsonderingen (A2)
          elOrigInline: el.style.height, // R9: för override-höjd på auto-regioner
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

  // ── R14: platshållar-atomer per container (topp-area/band/nästlad region) ──
  // Varje regions DIREKTA under-regioner (som ritas som egna lådor) hoppas över
  // så inget dubbel-representeras; övriga rubriker/knappar/textrader/bilder blir
  // förenklade platshållare. Fraktions-koordinater → renderingen är skal-agnostisk.
  const directSubEls = new Map<string, Set<Element>>()
  for (const r of nestedOut) {
    const cid = r.parentId ?? r.topId
    const s = directSubEls.get(cid) ?? new Set<Element>()
    s.add(r.el); s.add(r.anchorEl); s.add(r.innerEl)
    directSubEls.set(cid, s)
  }
  const placeholders: Record<string, Placeholder[]> = {}
  const collectPh = (id: string, el: HTMLElement | undefined) => {
    if (!el) return
    const subs = directSubEls.get(id)
    const ph = readPlaceholders(el, subs ? (e) => subs.has(e) : () => false)
    if (ph.length) placeholders[id] = ph
  }
  children.forEach((el, i) => collectPh(String(i), el))
  for (const b of bandsOut) if (!b.locked) collectPh(b.id, b.el)
  for (const r of nestedOut) collectPh(r.id, r.el)

  return { nCols, geom, realW: Math.max(1, inner), refs, areas, bands: bandsOut, nested: nestedOut, placeholders }
}

/** Återställ en nästlad regions ursprungliga inline-styles (unmount/nollställ). */
function restoreNested(r: RegionVM) {
  r.anchorEl.style.gridColumn = r.origStyle.gridColumn
  r.anchorEl.style.order = r.origStyle.order
  r.anchorEl.style.width = r.origStyle.width
  r.anchorEl.style.flexBasis = r.origStyle.flexBasis
  r.anchorEl.style.flexGrow = r.origStyle.flexGrow
  // R9: återställ ev. override-höjd – r.el (auto-override) och det bärande fasta
  // elementet (om det är ett annat element än r.el).
  r.el.style.height = r.elOrigInline
  if (r.fixedEl && r.fixedEl !== r.el) r.fixedEl.style.height = r.fixedOrigInline
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

// Panel-avdelare + synkad pan/zoom mellan Design modes två vyer (v2 · B3–B5).
//
// VÄNSTER visar den riktiga sidan i verkliga px (ev. transform-skalad `scale(z)`),
// HÖGER visar wireframen i wf-px (skalfaktor k = wf-px per verklig px) under en
// egen zoom/pan-transform. Synken går ALLTID via dokument-positionen (verkliga
// px från sidans topp) – aldrig via råa pixel-deltan – så båda vyerna pekar på
// samma ställe i dokumentet oavsett vilken sida man drar i (B4) och zoom hålls
// identisk med respektive panels mitt som origo (B5).
//
// Ren modul (ingen DOM, ingen React) – enhetstestad i viewSync.test.ts.

// ── R1 · Låst 50/50-skiljevägg ───────────────────────────────────────────────

/**
 * Höger panelbredd när skiljeväggen är LÅST i mitten (R1 · total spegel): exakt
 * halva fönstret → båda paneler får identiskt utrymme och speglar varandra utan
 * att den riktiga sidans responsiva reflow triggas. (Den flyttbara varianten –
 * resolveSplit/clampSplitFrac nedan – är kvar men används inte längre av shellen;
 * behålls för ett ev. framtida "skala i st f reflow"-läge.)
 */
export function centeredRightWidth(winW: number): number {
  return winW / 2
}

// ── B3 · Flyttbar lodrät avdelare (avställd – se R1) ─────────────────────────

/** Minsta panelbredd (px) på vardera sidan om avdelaren. */
export const MIN_PANEL = 320
/** Snap-tolerans (px) runt 50/50-läget. */
export const SPLIT_SNAP = 16

/**
 * Lös avdelarens läge ur pekarens x: höger panelbredd, klampad till
 * [MIN_PANEL, winW - MIN_PANEL], med snap till EXAKT 50/50 inom `snapTol`
 * (→ två lika stora paneler som synkar visuellt).
 */
export function resolveSplit(
  pointerX: number,
  winW: number,
  snapTol = SPLIT_SNAP,
  minPanel = MIN_PANEL,
): { rightW: number; snapped: boolean } {
  const half = winW / 2
  let rightW = winW - pointerX
  const snapped = Math.abs(rightW - half) <= snapTol
  if (snapped) rightW = half
  rightW = Math.min(winW - minPanel, Math.max(minPanel, rightW))
  return { rightW, snapped: snapped && rightW === half }
}

/** Klampa en persisterad split-fraktion (höger panel / fönsterbredd). */
export function clampSplitFrac(frac: number, winW: number): number {
  const min = MIN_PANEL / winW
  return Math.min(1 - min, Math.max(min, frac))
}

// ── B4 · Pan-synk via dokument-position ─────────────────────────────────────

/**
 * Dokument-delta (verkliga px) ur ett grab-drag på VÄNSTER sida: innehållet
 * följer pekaren → dra nedåt (dy > 0) visar tidigare innehåll (dokumentet
 * "scrollar upp"). Sidan kan vara transform-skalad (pageZoom).
 */
export function docDeltaFromPagePan(dyVisual: number, pageZoom: number): number {
  return -dyVisual / Math.max(0.01, pageZoom)
}

/**
 * Dokument-delta (verkliga px) ur ett grab-drag på WIREFRAMEN: pan.y ökar med
 * dy (innehållet flyttas ner) → dokument-toppen minskar, mappat via wf-skalan k
 * och wireframens zoom.
 */
export function docDeltaFromWfPan(dyPan: number, wfZoom: number, k: number): number {
  return -dyPan / (Math.max(0.01, wfZoom) * Math.max(0.0001, k))
}

/** Wireframens pan.y-delta för ett givet dokument-delta (inversen ovan). */
export function wfPanFromDocDelta(dDoc: number, wfZoom: number, k: number): number {
  return -dDoc * k * wfZoom
}

// ── R2 · Synkad hjul-skroll ──────────────────────────────────────────────────

/**
 * Dokument-delta (verkliga px) ur ett wheel-deltaY (skärm-px): scroll ner
 * (deltaY > 0) → dokumentet scrollar ner (visar senare innehåll). Den riktiga
 * sidan kan vara transform-skalad (pageZoom) → 1 skärm-px = 1/pageZoom dokument-
 * px, så skroll-hastigheten känns konstant oavsett zoom. Speglar magnituden i
 * docDeltaFromPagePan (men motsatt tecken – wheel är motsatsen till grab-drag).
 * Wireframens pan följer sedan via wfPanFromDocDelta på det FAKTISKT applicerade
 * skroll-deltat → båda vyerna stannar samtidigt vid dokumentets ändar.
 */
export function scrollSyncDoc(wheelDeltaY: number, pageZoom: number): number {
  return wheelDeltaY / Math.max(0.01, pageZoom)
}

// ── R1 (GATE-omfix) · Spegel-projektion: en enda källa till sanning ──────────
//
// Grundorsaken till spegel-driften vid cursor-ankrad hjul-zoom var att
// wireframens `pan` och den riktiga sidans position (`scrollTop` + `pagePanX`)
// lagrades som TRE oberoende tillstånd och uppdaterades av olika formler vid
// zoom (+ osymmetrisk klamp) → de kunde driva isär och ackumulera fel.
//
// Fixen: den RIKTIGA sidans dokument-position är AUKTORITATIV (browsern klampar
// scrollTop naturligt), och wireframens `pan` HÄRLEDS deterministiskt ur den.
// Då kan panelerna omöjligt driva isär – spegeln är pixelexakt per konstruktion.
//
// Alignment-invarianten (uppmätt): en wf-ruta ligger exakt över sin riktiga ruta
// när  panY + zoom·pad + pageScale·scrollTop = 0  (Y) och  panX + zoom·pad −
// pageLeftRel = 0  (X), där pageScale = fit·zoom = k·zoom och k = fit (FW1).

/**
 * Wireframens `pan` (x,y) som gör spegeln PIXELEXAKT givet sidans auktoritativa
 * dokument-position. `pan` lagras aldrig separat – den projiceras alltid härur.
 *   scrollTop    sidans vertikala dokument-offset (px, browser-klampad)
 *   pageLeftRel  sidans vänsterkant rel. sin panels vänsterkant (px)
 *   zoom         delad zoom-nivå · pageScale = fit·zoom
 *   pad          wireframe-canvasens WF_PAD (wf-panel-px, pre-zoom)
 */
export function mirrorPan(
  scrollTop: number, pageLeftRel: number, zoom: number, pageScale: number, pad: number,
): { x: number; y: number } {
  return { x: pageLeftRel - zoom * pad, y: -(zoom * pad + pageScale * scrollTop) }
}

/**
 * Ny sid-vänsterkant (rel. panelens vänsterkant) som håller dokument-X under
 * `focusX` (px från panelens vänsterkant) STILLA när sid-skalan går ps0→ps1.
 * Horisontell motsvarighet till pageZoomScroll (zoom-kring-pekare i sidled).
 */
export function pageLeftZoom(
  pageLeftRel: number, ps0: number, ps1: number, focusX: number,
): number {
  const docX = (focusX - pageLeftRel) / Math.max(0.0001, ps0)
  return focusX - docX * ps1
}

// ── B5 · Zoom med fast punkt + synkad sid-scroll ─────────────────────────────

export const ZOOM_MIN = 0.4
export const ZOOM_MAX = 2.4

export function clampZoom(z: number, min = ZOOM_MIN, max = ZOOM_MAX): number {
  return Math.min(max, Math.max(min, z))
}

/** Multiplikativ zoomfaktor ur ett ctrl+wheel/pinch-delta (naturlig känsla). */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0022)
}

/**
 * Zooma wireframens transform (translate + scale) runt en FAST viewport-punkt
 * (cx, cy) – innehålls-punkten under (cx, cy) ligger stilla. Origo = panelens
 * mitt ger "centrerad" zoom (B5).
 */
export function zoomAtPoint(
  pan: { x: number; y: number },
  zOld: number,
  zNew: number,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const r = zNew / Math.max(0.0001, zOld)
  return { x: cx - (cx - pan.x) * r, y: cy - (cy - pan.y) * r }
}

/**
 * Ny scrollTop för VÄNSTER sida när zoomen ändras: dokument-punkten vid `focusY`
 * (px från panelens topp) hålls STILLA. Default focusY = viewH/2 → centrerad zoom
 * (B5); L1 · mjuk fokuspunkts-zoom skickar pekarens Y så punkten under pekaren
 * ligger stilla även i vänster panel. Panelens synliga dokument-höjd = viewH / z.
 */
export function pageZoomScroll(
  scrollTop: number, viewH: number, zOld: number, zNew: number, focusY = viewH / 2,
): number {
  const focusDoc = scrollTop + focusY / Math.max(0.01, zOld)
  return Math.max(0, focusDoc - focusY / Math.max(0.01, zNew))
}

// ── B5 · Standardskärm-rektangeln (MacBook Pro 14") ──────────────────────────

/** Logisk upplösning för standardskärmen: MacBook Pro 14" (beslut i v2-planen). */
export const MACBOOK14 = { w: 1512, h: 982, label: 'MacBook 14″' } as const

/**
 * R13 · MacBook-rektangeln som VIEWPORT-indikator: ritas i wireframe-panelens
 * viewport-koordinater (utanför den skrollade/transformerade canvasen) så den
 * står STILL vertikalt vid skroll (ankrad till toppen av synliga ytan), men
 * SKALAR med zoom (zoom ändrar hur mycket dokument = en skärm). Horisontellt
 * följer den innehållets mitt (panX + zoom) så den ligger kvar över sidans
 * kolumner även vid horisontell pan.
 *   k       = wf-px per verklig px · gridW = innehållets wf-bredd (pre-zoom)
 *   zoom    = wireframens transform-skala · panX = wireframens translate.x
 *   pad     = canvasens WF_PAD (pre-zoom) så mitten räknas från innehålls-origo
 */
export function macbookViewportRect(
  k: number, gridW: number, zoom: number, panX: number, pad = 0,
): { left: number; top: number; w: number; h: number } {
  const w = MACBOOK14.w * k * zoom
  const h = MACBOOK14.h * k * zoom
  const centerX = panX + (pad + gridW / 2) * zoom
  return { left: centerX - w / 2, top: 0, w, h }
}

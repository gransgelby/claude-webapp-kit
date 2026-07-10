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

// ── B3 · Flyttbar lodrät avdelare ────────────────────────────────────────────

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
 * Ny scrollTop för VÄNSTER sida när zoomen ändras: dokument-positionen i
 * panelens MITT hålls stilla. Panelens synliga dokument-höjd = viewH / z
 * (sidan renderas transform-skalad med kompenserad layout-höjd).
 */
export function pageZoomScroll(scrollTop: number, viewH: number, zOld: number, zNew: number): number {
  const centerDoc = scrollTop + viewH / (2 * Math.max(0.01, zOld))
  return Math.max(0, centerDoc - viewH / (2 * Math.max(0.01, zNew)))
}

// ── B5 · Standardskärm-rektangeln (MacBook Pro 14") ──────────────────────────

/** Logisk upplösning för standardskärmen: MacBook Pro 14" (beslut i v2-planen). */
export const MACBOOK14 = { w: 1512, h: 982, label: 'MacBook 14″' } as const

/**
 * Rektangeln i wf-px, centrerad horisontellt över sidans innehåll (gridW =
 * innehållets wf-bredd) och från dokument-toppen – följer zoom/pan gratis
 * eftersom den ritas inne i wireframens transformerade canvas.
 */
export function macbookRect(k: number, gridW: number): { x: number; y: number; w: number; h: number } {
  const w = MACBOOK14.w * k
  const h = MACBOOK14.h * k
  return { x: (gridW - w) / 2, y: 0, w, h }
}

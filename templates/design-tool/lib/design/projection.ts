// V17 · Wireframen = ren GEOMETRISK PROJEKTION av riktiga sidans bounding-boxar.
//
// I stället för att beräkna wireframe-layouten oberoende (region-/höjd-modellen
// driver drift nedåt) härleds varje wireframe-lådas placering OCH storlek DIREKT
// ur den renderade sidans faktiska geometri: wireframe-låda = riktigt_element.rect
// × samma skala k, samma origo. En horisontell linje vid ett dokument-Y träffar då
// SAMMA lådkant i båda panelerna – för varje låda gäller `canvasY / k === docY`.
//
// Ren modul (ingen DOM, ingen React) – enhetstestad i projection.test.ts.
// App-agnostisk: bara geometri (skärm-rects + pageScale + container-origo), inga
// sid-specifika selektorer/namn.

export interface Rect { x: number; y: number; w: number; h: number }

/** En lå+da mätt i skärm-px (medan sidan kan vara transform-skalad med pageScale). */
export interface RawBox {
  id: string
  /** getBoundingClientRect-värden i skärm-px. */
  left: number
  top: number
  width: number
  height: number
}

/**
 * Normalisera en skärm-mätt låda till NATURLIGA dokument-px relativt grid-
 * containerns content-origo (kolumn 1:s vänsterkant, sidans topp). Sidan renderas
 * transform-skalad med `pageScale` → alla rects ligger i skalat skärm-rum; divisionen
 * med pageScale ger tillbaka de äkta layout-px (transformen påverkar inte proportioner).
 *   • x = (left − containerLeft) / pageScale − padLeft   (rel. kolumn 1:s vänsterkant)
 *   • y = (top  − containerTop ) / pageScale             (rel. containerns topp)
 */
export function toNatural(
  box: RawBox, cLeft: number, cTop: number, pageScale: number, padLeft: number,
): Rect {
  const ps = pageScale > 0.0001 ? pageScale : 1
  return {
    x: (box.left - cLeft) / ps - padLeft,
    y: (box.top - cTop) / ps,
    w: box.width / ps,
    h: box.height / ps,
  }
}

/**
 * R5 · Sticky/fixed-speglade element står STILL på skärmen när sidan skrollar (deras
 * bounding-rect är "fastklistrad" vid en skärm-Y) → mätt live driver deras wireframe-
 * band NEDÅT ju mer man skrollar och det flyter över andra rutor på en fast skärm-
 * position. Bygg i stället en SYNTETISK skärm-rect ur elementets NATURLIGA dokument-
 * offset (`natX`/`natY` = elementets kumulativa offsetTop/Left MINUS containerns – ren
 * layout-px, opåverkad av sticky-förskjutningen), uttryckt i samma skärm-rum som de
 * övriga lådorna (container-origo `cLeft`/`cTop` + `pageScale`). `toNatural` återger då
 * elementets flödes-position ⇒ bandet projiceras där det HÖR HEMMA i dokumentet och
 * följer skrollen som allt annat. Ren aritmetik (ingen DOM) – app-agnostisk, testbar.
 */
export function stickyNaturalBox(
  id: string, natX: number, natY: number, w: number, h: number,
  cLeft: number, cTop: number, pageScale: number,
): RawBox {
  const ps = pageScale > 0.0001 ? pageScale : 1
  return { id, left: cLeft + natX * ps, top: cTop + natY * ps, width: w, height: h }
}

/**
 * Bygg projektions-kartan för alla lådor. Nollpunkten flyttas så den ÖVERSTA lådan
 * (minsta y – kan vara ett band ovanför gridet, dvs negativt) hamnar på y = 0, vilket
 * matchar wireframe-canvasens innehålls-topp. Lådor utan yta (w/h ≤ 0) hoppas över.
 */
export function buildProjection(
  boxes: RawBox[], cLeft: number, cTop: number, pageScale: number, padLeft: number,
): Record<string, Rect> {
  const nat = boxes
    .map((b) => ({ id: b.id, r: toNatural(b, cLeft, cTop, pageScale, padLeft) }))
    .filter((b) => b.r.w > 0.5 && b.r.h > 0.5)
  if (nat.length === 0) return {}
  const minY = Math.min(...nat.map((b) => b.r.y))
  const out: Record<string, Rect> = {}
  for (const b of nat) out[b.id] = { x: b.r.x, y: b.r.y - minY, w: b.r.w, h: b.r.h }
  return out
}

/**
 * Wireframe-canvas-koordinater (content-px, före WF_PAD/pan/zoom) för en projicerad
 * låda vid skala `k` (wf-px per naturlig px). Minsta bredd/höjd så etikettremsan ryms.
 * Invariant: `y / k` ger tillbaka lådans dokument-Y ⇒ samma kant i båda panelerna.
 */
export function projToCanvas(
  p: Rect, k: number, minW = 6, minH = 12,
): { x: number; y: number; w: number; h: number } {
  return {
    x: p.x * k,
    y: p.y * k,
    w: Math.max(minW, p.w * k),
    h: Math.max(minH, p.h * k),
  }
}

/** En barn-lådas placering RELATIVT sin förälder-låda (för nästlad rendering). */
export function projToChildCanvas(
  child: Rect, parent: Rect, k: number, minW = 6, minH = 10,
): { x: number; y: number; w: number; h: number } {
  return {
    x: (child.x - parent.x) * k,
    y: (child.y - parent.y) * k,
    w: Math.max(minW, child.w * k),
    h: Math.max(minH, child.h * k),
  }
}

/** True om två projektions-kartor är lika inom `tol` px (samma nycklar, nära rects)
 *  → undviker onödiga re-renders vid sub-pixel-brus i live-ommätningen. */
export function projectionEqual(
  a: Record<string, Rect>, b: Record<string, Rect>, tol = 0.5,
): boolean {
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    const bv = b[k]
    const av = a[k]
    if (!bv) return false
    if (Math.abs(av.x - bv.x) > tol || Math.abs(av.y - bv.y) > tol ||
        Math.abs(av.w - bv.w) > tol || Math.abs(av.h - bv.h) > tol) return false
  }
  return true
}

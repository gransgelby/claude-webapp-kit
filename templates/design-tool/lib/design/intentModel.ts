// V9 · Fri flytt = INTENT-overlay ovanpå projektionen (Design mode v2.3 · FW3).
//
// Att flytta/resiza en låda i design mode bygger INTE riktig struktur – det är en
// INTENTION/skiss ("så här vill jag ha det") som ritas EXAKT där användaren släpper,
// i projektionens koordinatsystem (naturliga dokument-px, samma rum som lib/design/
// projection.ts:s Rect). Ingen osynlig container knuffar grannar: intenten lever bara
// i wireframen + spara-payloaden, aldrig i den riktiga sidans grid. Vilo-projektionen
// för orörda lådor är fortsatt exakt.
//
// Ren modul (ingen DOM, ingen React) – enhetstestad i intentModel.test.ts.
// App-agnostisk: bara geometri (rects + kandidatkanter), inga sid-selektorer.

export interface Rect { x: number; y: number; w: number; h: number }

/** En användar-satt intent: den önskade rekten + BASEN (projektionen då intenten
 *  först skapades) så payloaden bär läsbara deltan och dirty-detektering är trivial. */
export interface Intent {
  rect: Rect
  base: Rect
}

/** Vilken gest som drivs: fri flytt eller resize från topp-vänster-ankaret. */
export type IntentMode = 'move' | 'resize-e' | 'resize-s' | 'resize-se'

const MIN_W = 8
const MIN_H = 10

/** Flytta hela rekten (behåller storlek). */
export function translateRect(base: Rect, dx: number, dy: number): Rect {
  return { x: base.x + dx, y: base.y + dy, w: base.w, h: base.h }
}

/** Resiza från topp-vänster-ankaret (öka höger-/nederkant). Topp-vänster står still. */
export function resizeRect(base: Rect, dw: number, dh: number, minW = MIN_W, minH = MIN_H): Rect {
  return { x: base.x, y: base.y, w: Math.max(minW, base.w + dw), h: Math.max(minH, base.h + dh) }
}

/** Applicera en gest (mode) på basen givet dokument-delta (naturliga px). */
export function applyGesture(base: Rect, mode: IntentMode, dx: number, dy: number, minW = MIN_W, minH = MIN_H): Rect {
  switch (mode) {
    case 'move': return translateRect(base, dx, dy)
    case 'resize-e': return resizeRect(base, dx, 0, minW, minH)
    case 'resize-s': return resizeRect(base, 0, dy, minW, minH)
    case 'resize-se': return resizeRect(base, dx, dy, minW, minH)
  }
}

export interface SnapResult { rect: Rect; snapX: number | null; snapY: number | null }

/**
 * Snappa den rörliga rektens kanter mot kandidatkanter (grannars kanter) UTAN att
 * flytta grannarna. `mode` avgör vilka kanter som är rörliga: move → hela rekten
 * skiftas om vänster- eller högerkant (resp. topp/botten) hamnar nära en kandidat;
 * resize-* → bara den kant gesten drar. Närmaste kant inom `tol` vinner per axel.
 * Returnerar snappad rekt + vilka kandidat-koordinater som träffades (för snap-linjer).
 */
export function snapRect(
  rect: Rect, xEdges: readonly number[], yEdges: readonly number[], tol: number, mode: IntentMode = 'move',
): SnapResult {
  const moveX = mode === 'move'
  const growW = mode === 'resize-e' || mode === 'resize-se'
  const moveY = mode === 'move'
  const growH = mode === 'resize-s' || mode === 'resize-se'

  let snapX: number | null = null
  let bestX = tol, shiftX = 0, newW = rect.w
  if (moveX) {
    for (const e of xEdges) for (const edge of [rect.x, rect.x + rect.w]) {
      const d = Math.abs(edge - e)
      if (d <= bestX) { bestX = d; shiftX = e - edge; snapX = e }
    }
  } else if (growW) {
    for (const e of xEdges) {
      const d = Math.abs((rect.x + rect.w) - e)
      if (d <= bestX && e > rect.x + MIN_W) { bestX = d; newW = e - rect.x; snapX = e }
    }
  }

  let snapY: number | null = null
  let bestY = tol, shiftY = 0, newH = rect.h
  if (moveY) {
    for (const e of yEdges) for (const edge of [rect.y, rect.y + rect.h]) {
      const d = Math.abs(edge - e)
      if (d <= bestY) { bestY = d; shiftY = e - edge; snapY = e }
    }
  } else if (growH) {
    for (const e of yEdges) {
      const d = Math.abs((rect.y + rect.h) - e)
      if (d <= bestY && e > rect.y + MIN_H) { bestY = d; newH = e - rect.y; snapY = e }
    }
  }

  return {
    rect: {
      x: rect.x + shiftX, y: rect.y + shiftY,
      w: growW ? newW : rect.w, h: growH ? newH : rect.h,
    },
    snapX, snapY,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Kandidatkanter (x-linjer + y-linjer) ur alla lådor UTOM den rörliga. */
export function candidateEdges(
  rects: Record<string, Rect>, exceptKey: string,
): { xEdges: number[]; yEdges: number[] } {
  const xs = new Set<number>()
  const ys = new Set<number>()
  for (const [k, r] of Object.entries(rects)) {
    if (k === exceptKey) continue
    xs.add(round2(r.x)); xs.add(round2(r.x + r.w))
    ys.add(round2(r.y)); ys.add(round2(r.y + r.h))
  }
  return { xEdges: Array.from(xs), yEdges: Array.from(ys) }
}

/** True om två rects är lika inom tol. */
export function rectsEqual(a: Rect, b: Rect, tol = 0.5): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol &&
    Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol
}

/** True om en intent avviker från sin bas (värt att spara / flagga osparat). */
export function intentDirty(it: Intent, tol = 0.5): boolean {
  return !rectsEqual(it.rect, it.base, tol)
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** Stabil signatur av intent-kartan (för osparat-detektering). Endast dirty intents. */
export function intentsSignature(map: Record<string, Intent>): string {
  return Object.keys(map).sort()
    .filter((k) => intentDirty(map[k]))
    .map((k) => {
      const r = map[k].rect
      return `${k}:${r1(r.x)}/${r1(r.y)}/${r1(r.w)}/${r1(r.h)}`
    })
    .join(',')
}

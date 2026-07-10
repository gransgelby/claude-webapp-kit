// Skalenliga höjder + dra-höjd med granne-snap (Design mode v2 · A2).
//
// Wireframen ska vara en TROGEN, NEDSKALAD spegel av riktiga sidan: varje region
// renderas med samma höjd/bredd-förhållande som dess verkliga bounding-box.
// Modulen är den RENA kärnan (ingen DOM, ingen React) – DOM-sonderingen bor i
// DesignModeShell och matar in plain data hit. App-agnostiskt: inga sid-specifika
// listor, bara generella signaler (explicit höjd/aspect-ratio/innehållsprov).
//
//   • probeIsFixed  – auto-höjd (innehållsstyrd) vs FAST höjd, ur ett höjdprov.
//   • wfScale       – skalfaktorn wireframe-px per verklig px (ur bredderna).
//   • snapHeight    – snap av en dragen underkant mot granne-regioners underkanter.
//   • stackRows     – radpackning av nästlade regioner med verkliga (skalade)
//                     ledande offset/rad-gap, så wireframen reflowar när en
//                     region växer men behåller init-proportionerna exakt.

// ── Auto vs fast höjd ────────────────────────────────────────────────────────

/** Rent sammandrag av ett elements höjd-signaler (DOM-läsaren fyller i). */
export interface HeightProbe {
  /** Inline `style.height` ('' om ej satt). */
  inlineHeight: string
  /** Computed `aspect-ratio` ('auto' om ej satt). */
  cssAspectRatio: string
  /** Renderad höjd (px). */
  measuredH: number
  /** Höjd (px) när `height: auto` tvingats på – innehållets egen höjd. */
  autoH: number
}

/**
 * FAST höjd = elementets höjd styrs inte av innehållet: explicit inline-höjd,
 * CSS aspect-ratio, eller att innehållsprovet (height:auto) ger en annan höjd
 * än den renderade (⇒ en CSS-regel sätter höjden). Generisk heuristik – ingen
 * klassnamns- eller sid-kännedom.
 */
export function probeIsFixed(p: HeightProbe, tolPx = 2): boolean {
  const inline = p.inlineHeight.trim()
  if (inline && inline !== 'auto') return true
  if (p.cssAspectRatio && p.cssAspectRatio !== 'auto') return true
  return Math.abs(p.measuredH - p.autoH) > tolPx
}

// ── Skalfaktor ───────────────────────────────────────────────────────────────

/** Wireframe-px per verklig px, ur riktiga sidans inre grid-bredd vs wireframens. */
export function wfScale(realInnerW: number, wfInnerW: number): number {
  if (realInnerW <= 0 || wfInnerW <= 0) return 1
  return wfInnerW / realInnerW
}

// ── Höjd-drag med granne-snap ────────────────────────────────────────────────

/** Minsta tillåtna verkliga höjd vid dra-höjd (px). */
export const MIN_DRAG_HPX = 24

export function clampDragH(h: number, min = MIN_DRAG_HPX): number {
  return Math.max(min, h)
}

/** En snap-kandidat: en granne-regions underkant (samma koordinatrum som selfTop). */
export interface SnapCandidate { id: string; label: string; bottom: number }

/**
 * Snappa en föreslagen höjd så att underkanten (selfTop + proposedH) linjerar
 * med närmaste kandidat-underkant inom `tolPx`. Närmaste kandidaten vinner.
 */
export function snapHeight(
  selfTop: number,
  proposedH: number,
  cands: SnapCandidate[],
  tolPx: number,
): { h: number; snapped: SnapCandidate | null } {
  const edge = selfTop + proposedH
  let best: SnapCandidate | null = null
  let bestD = Infinity
  for (const c of cands) {
    const d = Math.abs(c.bottom - edge)
    if (d <= tolPx && d < bestD) { best = c; bestD = d }
  }
  return best ? { h: Math.max(1, best.bottom - selfTop), snapped: best } : { h: proposedH, snapped: null }
}

// ── Radpackning med verklig geometri ─────────────────────────────────────────

/** Ett barn i en radpackning (verkliga px för init-geometri, wf-px för live-höjd). */
export interface StackChild {
  id: string
  /** 1-baserad visuell rad inom föräldern. */
  row: number
  /** y-offset från förälderns topp vid init (VERKLIGA px) – bär rubrik/padding. */
  relY: number
  /** Höjd vid init (VERKLIGA px) – ger rad-gapen. */
  origH: number
  /** AKTUELL wireframe-höjd (redan skalad, kan ha växt av dra-höjd). */
  hWf: number
}

export interface RowStack {
  /** Ledande offset (wf-px) från förälderns topp till första raden. */
  lead: number
  /** Radens topp (wf-px, relativt förälderns topp). */
  rowTop: Map<number, number>
  /** Radens höjd (wf-px) = högsta barnet på raden. */
  rowH: Map<number, number>
  /** Understa kanten (wf-px, relativt förälderns topp). */
  bottom: number
}

/**
 * Packa barnen i rader med VERKLIG skalad geometri: ledande offset = första
 * radens relY·k (bär förälderns rubrik/padding), rad-gap = init-avståndet mellan
 * raderna·k, radhöjd = högsta barnets AKTUELLA wf-höjd. Vid init blir resultatet
 * exakt den verkliga layouten nedskalad; växer ett barn knuffas raderna under.
 */
export function stackRows(kids: StackChild[], k: number): RowStack {
  const rowTop = new Map<number, number>()
  const rowH = new Map<number, number>()
  const rows = Array.from(new Set(kids.map((c) => c.row))).sort((a, b) => a - b)
  if (rows.length === 0) return { lead: 0, rowTop, rowH, bottom: 0 }
  const inRow = (r: number) => kids.filter((c) => c.row === r)
  const minRelY = (r: number) => Math.min(...inRow(r).map((c) => c.relY))
  const maxBottom0 = (r: number) => Math.max(...inRow(r).map((c) => c.relY + c.origH))
  const lead = Math.max(0, minRelY(rows[0]) * k)
  let y = lead
  let prev: number | null = null
  for (const r of rows) {
    if (prev != null) y += Math.max(0, minRelY(r) - maxBottom0(prev)) * k
    const h = Math.max(...inRow(r).map((c) => c.hWf))
    rowTop.set(r, y)
    rowH.set(r, h)
    y += h
    prev = r
  }
  return { lead, rowTop, rowH, bottom: y }
}

// ── Diff-hjälpare (live-ommätning av auto-höjder) ────────────────────────────

/** True om två höjd-kartor är lika inom `tolPx` (samma nycklar, nära värden). */
export function heightsEqual(a: Record<string, number>, b: Record<string, number>, tolPx = 1): boolean {
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    const bv = b[k]
    if (bv === undefined || Math.abs(a[k] - bv) > tolPx) return false
  }
  return true
}

// Rena layout-verktyg för Design mode (Post 6, nattjobb 2026-07-10).
//
// Align / distribute / gap-mätning + komponent-ins ligger HÄR som rena, DOM-fria
// funktioner → billiga, deterministiska, enhets-testade. Canvasen (DesignModeShell)
// anropar dem och skriver resultatet till den riktiga DOM:en via samma
// grid-omgriddnings-väg som Post 3 (grid-column/row ur modellen).
//
// GRID-AGNOSTISKT: kolumnantalet (`cols`) matas alltid in; ingen funktion antar 12.
import { clampPlacement, type GridArea, type GridGeom } from './gridModel'
import { nearestSpacingToken, spacingStepsPx } from './elementModel'

/** Kolumn-slutlinje (1-baserad, inklusiv) för ett område. */
export function colEnd(a: Pick<GridArea, 'colStart' | 'span'>): number {
  return a.colStart + a.span - 1
}

/** Plocka ut de valda områdena (i modell-ordning), hoppa dolda/saknade nycklar. */
function pickSelected(areas: GridArea[], keys: Iterable<string>): GridArea[] {
  const set = keys instanceof Set ? keys : new Set(keys)
  return areas.filter((a) => set.has(a.key) && !a.hidden)
}

export type AlignEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

/**
 * Justera de valda områdena mot en gemensam kant. Horisontella kanter
 * (left/center/right) rör `colStart` (span bevaras, klampas i rutnätet). Vertikala
 * (top/middle/bottom) rör `row` (rad-banden). Grid-agnostisk via `cols`.
 *
 * Ej-valda områden lämnas orörda. Kräver ≥ 2 valda för att göra något.
 */
export function alignAreas(areas: GridArea[], keys: Iterable<string>, edge: AlignEdge, cols: number): GridArea[] {
  const sel = pickSelected(areas, keys)
  if (sel.length < 2) return areas
  const groupLeft = Math.min(...sel.map((a) => a.colStart))
  const groupRight = Math.max(...sel.map(colEnd))
  const groupCenter = (groupLeft + groupRight) / 2
  const groupTop = Math.min(...sel.map((a) => a.row))
  const groupBot = Math.max(...sel.map((a) => a.row))
  const groupMid = Math.round((groupTop + groupBot) / 2)

  const next = new Map<string, GridArea>()
  for (const a of sel) {
    if (edge === 'left') {
      const { colStart, span } = clampPlacement(groupLeft, a.span, cols)
      next.set(a.key, { ...a, colStart, span })
    } else if (edge === 'right') {
      const { colStart, span } = clampPlacement(groupRight - a.span + 1, a.span, cols)
      next.set(a.key, { ...a, colStart, span })
    } else if (edge === 'center') {
      const { colStart, span } = clampPlacement(Math.round(groupCenter - (a.span - 1) / 2), a.span, cols)
      next.set(a.key, { ...a, colStart, span })
    } else if (edge === 'top') {
      next.set(a.key, { ...a, row: groupTop })
    } else if (edge === 'bottom') {
      next.set(a.key, { ...a, row: groupBot })
    } else {
      next.set(a.key, { ...a, row: groupMid })
    }
  }
  return areas.map((a) => next.get(a.key) ?? a)
}

export type DistributeMode = 'gaps' | 'spans'

/**
 * Fördela ≥ 3 valda områden jämnt längs kolumnerna på deras rad. Två lägen:
 *   • 'gaps'  – behåll varje områdes span, gör mellanrummen mellan dem lika stora
 *               (första + sista behåller sina ytterkanter).
 *   • 'spans' – ge alla lika span och packa dem tätt (inget mellanrum) över gruppens
 *               nuvarande ytterspann.
 * Rör bara `colStart`/`span`; radplacering lämnas. Grid-agnostisk via `cols`.
 * Färre än 3 valda → oförändrat.
 */
export function distributeAreas(areas: GridArea[], keys: Iterable<string>, mode: DistributeMode, cols: number): GridArea[] {
  const sel = pickSelected(areas, keys).slice().sort((a, b) => a.colStart - b.colStart || colEnd(a) - colEnd(b))
  if (sel.length < 3) return areas
  const left = sel[0].colStart
  const right = Math.max(...sel.map(colEnd))
  const rangeCols = right - left + 1
  const n = sel.length
  const next = new Map<string, GridArea>()

  if (mode === 'spans') {
    // Lika span, tätt packat (golv-fördela resten från vänster så summan == rangeCols).
    const base = Math.max(1, Math.floor(rangeCols / n))
    let extra = Math.max(0, rangeCols - base * n)
    let cursor = left
    for (const a of sel) {
      const span = base + (extra > 0 ? 1 : 0)
      if (extra > 0) extra -= 1
      const { colStart, span: s } = clampPlacement(cursor, span, cols)
      next.set(a.key, { ...a, colStart, span: s })
      cursor += span
    }
  } else {
    // Lika mellanrum: fördela ledigt utrymme (range − summan av span) på n−1 luckor.
    const sumSpan = sel.reduce((t, a) => t + a.span, 0)
    const free = rangeCols - sumSpan
    const gap = free / (n - 1)
    let posExact = left
    sel.forEach((a, i) => {
      const colStart = i === 0 ? left : i === n - 1 ? right - a.span + 1 : Math.round(posExact)
      const { colStart: cs, span } = clampPlacement(colStart, a.span, cols)
      next.set(a.key, { ...a, colStart: cs, span })
      posExact = colStart + a.span + gap
    })
  }
  return areas.map((a) => next.get(a.key) ?? a)
}

// ── Gap-/mått-mätning (px + närmaste spacing-token) ──────────────────────────

export interface GapMeasure {
  aKey: string
  bKey: string
  /** Antal HELA tomma kolumnspår mellan blocken (0 = kant-i-kant med bara gutter). */
  emptyTracks: number
  /** Visuellt mellanrum i px (tomma spår + gutters mellan dem). */
  px: number
  /** Närmaste spacing-token + dess px + om px redan låg på token. */
  token: { name: string; px: number; onToken: boolean }
}

/**
 * Mät det visuella mellanrummet mellan två block på SAMMA rad, i px, ur den riktiga
 * grid-geometrin (`trackW` + `gap`). `K` tomma spår mellan blocken ger
 * `K·trackW + (K+1)·gap` px (en gutter på var sida + spårbredderna). Returnerar
 * `null` om blocken ligger på olika rader eller överlappar.
 */
export function gapPxBetween(a: GridArea, b: GridArea, geom: Pick<GridGeom, 'trackW' | 'gap'>, remPx = 16, scale = 1): GapMeasure | null {
  if (a.row !== b.row) return null
  const [left, right] = a.colStart <= b.colStart ? [a, b] : [b, a]
  const emptyTracks = right.colStart - (left.colStart + left.span)
  if (emptyTracks < 0) return null // överlapp
  const px = emptyTracks * geom.trackW + (emptyTracks + 1) * geom.gap
  const token = nearestSpacingToken(px, spacingStepsPx(remPx, scale))
  return { aKey: left.key, bKey: right.key, emptyTracks, px, token }
}

/**
 * Mät mellanrummen mellan alla horisontellt intilliggande block per rad (om
 * `keys` ges: bara mellan de valda). Sorterar per rad på kolumn och mäter
 * konsekutiva par. För mät-overlayn.
 */
export function measureGaps(areas: GridArea[], geom: Pick<GridGeom, 'trackW' | 'gap'>, keys?: Iterable<string>, remPx = 16, scale = 1): GapMeasure[] {
  const pool = keys ? pickSelected(areas, keys) : areas.filter((a) => !a.hidden)
  const byRow = new Map<number, GridArea[]>()
  for (const a of pool) {
    const arr = byRow.get(a.row) ?? []
    arr.push(a); byRow.set(a.row, arr)
  }
  const out: GapMeasure[] = []
  for (const arr of Array.from(byRow.values())) {
    const sorted = arr.slice().sort((x: GridArea, y: GridArea) => x.colStart - y.colStart)
    for (let i = 0; i < sorted.length - 1; i++) {
      const g = gapPxBetween(sorted[i], sorted[i + 1], geom, remPx, scale)
      if (g) out.push(g)
    }
  }
  return out
}

/** Ett områdes bredd i px ur grid-geometrin (span spår + inre gutters). */
export function areaWidthPx(a: Pick<GridArea, 'span'>, geom: Pick<GridGeom, 'trackW' | 'gap'>): number {
  return a.span * geom.trackW + Math.max(0, a.span - 1) * geom.gap
}

// ── Komponent-ins (platshållar-block) ────────────────────────────────────────

/** Prefix för platshållar-nycklar → `Number(key)` blir NaN → ignoreras av DOM-appliceringen. */
export const PLACEHOLDER_PREFIX = 'ph:'

export function isPlaceholderKey(key: string): boolean {
  return key.startsWith(PLACEHOLDER_PREFIX)
}

/**
 * Infoga ett tomt platshållar-block (ny sektion att skissa) i modellen. Läggs på en
 * FÄRSK rad under alla befintliga så det inte krockar, med ett halvbrett span
 * (klampat). Får en stabil, unik `ph:N`-nyckel. Rent → testbart.
 */
export function insertPlaceholder(areas: GridArea[], cols: number, label = 'Ny sektion'): { areas: GridArea[]; key: string } {
  let n = 0
  for (const a of areas) {
    if (isPlaceholderKey(a.key)) {
      const parsed = parseInt(a.key.slice(PLACEHOLDER_PREFIX.length), 10)
      if (Number.isFinite(parsed)) n = Math.max(n, parsed + 1)
    }
  }
  const key = `${PLACEHOLDER_PREFIX}${n}`
  const maxRow = areas.reduce((m, a) => Math.max(m, a.row), 0)
  const { colStart, span } = clampPlacement(1, Math.max(1, Math.round(cols / 2)), cols)
  const placeholder: GridArea = { key, label, colStart, span, row: maxRow + 1, placeholder: true }
  return { areas: [...areas, placeholder], key }
}

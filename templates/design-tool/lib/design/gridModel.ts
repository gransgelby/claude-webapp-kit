// Ren, grid-AGNOSTISK layout-logik för Design mode (Post 3, nattjobb 2026-07-10).
//
// All snap-/mappnings-matematik som Design mode-canvasen bygger på lever HÄR, fri
// från DOM och React → billig, deterministisk och enhets-testad. Ingen funktion
// antar 12 kolumner: kolumnantalet (`cols`) matas alltid in, avläst live ur
// sidans grid-container (`[data-grid-cols]`) eller lib/gridConfig `GRID`.

/** Ett griddat "område" = ett direkt grid-barn på sidan, i grid-koordinater. */
export interface GridArea {
  /** Stabil nyckel (DOM-index-baserad) så modellen kan matcha rätt element. */
  key: string
  /** Läsbar etikett (t.ex. "Kartvy", "Lämplighet"). */
  label: string
  /** 1-baserad kolumn-startlinje. */
  colStart: number
  /** Antal kolumner området spänner (>= 1). */
  span: number
  /** 1-baserad radlinje. Två områden med samma `row` ligger på samma rad. */
  row: number
  /** Dolt (raderat i wireframen → display:none på riktiga elementet). */
  hidden?: boolean
  /** Platshållar-block (komponent-ins, Post 6): finns bara i modellen, inget riktigt DOM-element. */
  placeholder?: boolean
}

/** Geometri för ett riktigt grid, härlett ur DOM-mått (px). */
export interface GridGeom {
  cols: number
  /** Bredd per kolumnspår i px. */
  trackW: number
  /** Kolumn-gap i px. */
  gap: number
  /** Container-vänsterkant + vänster-padding, i samma koordinatrum som barnen. */
  originX: number
  /** Containerns inre marginaler (padding, px) – sidans "luft" mot kanterna (B1). */
  padLeft?: number
  padRight?: number
}

const clampInt = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)))

/**
 * Klampa en placering så den ryms i rutnätet: `colStart` i [1, cols],
 * `span` i [1, cols], och `colStart + span - 1 <= cols` (skjuter in vänsterkanten
 * om spannet annars skulle spilla ut till höger). Grid-agnostisk via `cols`.
 */
export function clampPlacement(colStart: number, span: number, cols: number): { colStart: number; span: number } {
  const s = clampInt(span, 1, cols)
  const cs = clampInt(colStart, 1, cols - s + 1)
  return { colStart: cs, span: s }
}

/**
 * Snäpp en pixel-förskjutning till ett heltal antal kolumnspår. Ett spår =
 * `trackW + gap` px (spår + gutter). Returnerar hur många hela spår `dxPx` mot-
 * svarar (kan vara negativt).
 */
export function snapTracks(dxPx: number, geom: Pick<GridGeom, 'trackW' | 'gap'>): number {
  const step = geom.trackW + geom.gap
  if (step <= 0) return 0
  return Math.round(dxPx / step)
}

/** CSS-värdet för `grid-column` ur en placering. */
export function gridColumnValue(a: Pick<GridArea, 'colStart' | 'span'>): string {
  return `${a.colStart} / span ${a.span}`
}

/** CSS-värdet för `grid-row` ur en placering (rad-höjd 1). */
export function gridRowValue(a: Pick<GridArea, 'row'>): string {
  return `${a.row}`
}

/**
 * Läs ut vilken kolumn-startlinje + spann ett riktigt element upptar, RENT ur
 * geometri (inte ur klassnamn) → funkar oavsett hur placeringen uttrycktes
 * (Tailwind `col-span-*`, inline `grid-column`, auto-flow …). Grid-agnostisk.
 */
export function placementFromGeometry(childLeft: number, childWidth: number, geom: GridGeom): { colStart: number; span: number } {
  const step = geom.trackW + geom.gap
  const colStart = step > 0 ? Math.round((childLeft - geom.originX) / step) + 1 : 1
  // Spannet: (bredd + ett gap) / step, avrundat (sista spåret bär inget gap).
  const span = step > 0 ? Math.round((childWidth + geom.gap) / step) : 1
  return clampPlacement(colStart, span, geom.cols)
}

/**
 * Gruppera områden i rader (samma vertikala band) ur deras top-koordinat. Två
 * element vars top ligger inom `tolPx` räknas till samma rad. Returnerar en ny
 * lista där `row` satts 1..R i fallande ordning uppifrån. Bevarar in-ordningen
 * inom en rad (vänster→höger förutsätts redan sorterat på colStart av anroparen).
 */
export function assignRowsByTop(
  items: Array<GridArea & { top: number }>,
  tolPx = 8,
): GridArea[] {
  const sorted = [...items].sort((a, b) => a.top - b.top)
  let row = 0
  let prevTop = Number.NEGATIVE_INFINITY
  const out: GridArea[] = []
  for (const it of sorted) {
    if (it.top - prevTop > tolPx) { row += 1; prevTop = it.top }
    const { top: _t, ...rest } = it
    void _t
    out.push({ ...rest, row })
  }
  return out
}

/**
 * Renumrera raderna så de är tät-packade 1..R (efter att ett område bytt rad
 * eller raderats). Bevarar relativ radordning. Områden som delar radnummer efter
 * en flytt hamnar på samma rad.
 */
export function normalizeRows(areas: GridArea[]): GridArea[] {
  const rows = Array.from(new Set(areas.map((a) => a.row))).sort((a, b) => a - b)
  const remap = new Map(rows.map((r, i) => [r, i + 1]))
  return areas.map((a) => ({ ...a, row: remap.get(a.row) ?? a.row }))
}

/** Snäpp en fri pixel-x i wireframe-koordinater till en 1-baserad kolumnlinje. */
export function colFromWireframeX(xPx: number, cellW: number, cols: number): number {
  if (cellW <= 0) return 1
  return clampInt(xPx / cellW + 1, 1, cols)
}

/** Snäpp en pixel-bredd i wireframe-koordinater till ett heltal kolumnspann. */
export function spanFromWireframeW(wPx: number, cellW: number, cols: number): number {
  if (cellW <= 0) return 1
  return clampInt(wPx / cellW, 1, cols)
}

/** True om två områden på SAMMA rad överlappar i kolumnled (ogiltig placering). */
export function areasOverlap(a: GridArea, b: GridArea): boolean {
  if (a.row !== b.row || a.hidden || b.hidden) return false
  const aEnd = a.colStart + a.span - 1
  const bEnd = b.colStart + b.span - 1
  return a.colStart <= bEnd && b.colStart <= aEnd
}

/** Alla nyckel-par som överlappar (för wireframe-varning). */
export function overlappingKeys(areas: GridArea[]): Set<string> {
  const bad = new Set<string>()
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      if (areasOverlap(areas[i], areas[j])) { bad.add(areas[i].key); bad.add(areas[j].key) }
    }
  }
  return bad
}

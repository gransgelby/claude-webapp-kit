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

/**
 * W12-hybrid: i vilket LÄGE flyttas en topp-låda? `'grid'` = deklarativt sant,
 * flytten skrivs LIVE som en grid-placering (grid-column/row); `'intent'` = fri
 * skiss (intention → uppgift till Claude), sidan rörs inte. En låda som redan bär
 * en smutsig fri-flytt-intent förblir en skiss. Bara ett RIKTIGT grid (`isRealGrid`,
 * avläst live ur DOM, ej antaget) + snap på ger live grid-flytt. Ren → testbar.
 */
export function topBoxMoveMode(opts: { isRealGrid: boolean; snapToGrid: boolean; hasDirtyIntent: boolean }): 'grid' | 'intent' {
  if (opts.hasDirtyIntent) return 'intent'
  return opts.isRealGrid && opts.snapToGrid ? 'grid' : 'intent'
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

// ── R15: oändlig grid-canvas (rena CSS-byggare, enhets-testbara) ─────────────
// Grid-illustrationen ritas i VIEWPORT-koordinater så den kan tona ut mot en
// "oändlig canvas" (full styrka nedåt, uttonande åt sidorna + uppåt) och alltid
// förankras i sidans grid-origo. All CSS-strängsyntes lever här (fri från DOM).

const px2 = (n: number): string => `${Number(n.toFixed(2))}px`

/**
 * `repeating-linear-gradient` med EN 1px-kolumnlinje per spår (`stepPx` brett).
 * Används i mobil-spegeln / när gutter-bredden är okänd. `color` är ett färg-
 * uttryck (t.ex. `'var(--dt-grid-line)'`). Spårbredden klampas till ≥ 2px.
 */
export function gridColLineCss(color: string, stepPx: number): string {
  const s = Math.max(2, stepPx)
  return `repeating-linear-gradient(to right, ${color} 0 1px, transparent 1px ${px2(s)})`
}

/**
 * `repeating-linear-gradient` som ritar ett gutter-BAND per spårgräns: två 1px-
 * kanter `gutterPx` isär, centrerade PÅ gränsen (bandet straddlar den → sömlös
 * upprepning), med en svag fyllning emellan. `stepPx` = spårbredd (spår + gutter).
 * `lineColor`/`bandColor` är färg-uttryck (token-var:er). Bredder klampas defensivt.
 */
export function gridBandCss(lineColor: string, bandColor: string, stepPx: number, gutterPx: number): string {
  const s = Math.max(2, stepPx)
  const g = Math.max(2, Math.min(gutterPx, s - 2))
  const h = g / 2 // halva gutter-bredden
  return `repeating-linear-gradient(to right,` +
    ` ${bandColor} 0 ${px2(h - 1)},` +            // höger halva av bandet vid tile-start
    ` ${lineColor} ${px2(h - 1)} ${px2(h)},` +    // höger kant
    ` transparent ${px2(h)} ${px2(s - h)},` +     // cell-interiör (luft mellan band)
    ` ${lineColor} ${px2(s - h)} ${px2(s - h + 1)},` + // vänster kant på nästa band
    ` ${bandColor} ${px2(s - h + 1)} ${px2(s)})`  // vänster halva av nästa band
}

/**
 * Vertikal fade-mask (mask-image): transparent OVANFÖR sidan (tonar in över
 * `fadeUpPx`), full svärta från sidans topp (`topPx`) och nedåt till 100% →
 * griden fortsätter i FULL styrka oändligt nedåt men tonar ut uppåt.
 */
export function fadeMaskVertical(topPx: number, fadeUpPx: number): string {
  return `linear-gradient(to bottom, transparent ${px2(topPx - fadeUpPx)}, #000 ${px2(topPx)}, #000 100%)`
}

/**
 * Horisontell fade-mask (mask-image): full inom sidans kolumn-bredd
 * [`leftPx`, `rightPx`], tonar ut till 0 över `fadePx` bortom vardera kant →
 * kolumnlinjerna tonar ut åt sidorna (oändlighetskänsla, utan att antyda innehåll).
 */
export function fadeMaskHorizontal(leftPx: number, rightPx: number, fadePx: number): string {
  return `linear-gradient(to right,` +
    ` transparent ${px2(leftPx - fadePx)}, #000 ${px2(leftPx)},` +
    ` #000 ${px2(rightPx)}, transparent ${px2(rightPx + fadePx)})`
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

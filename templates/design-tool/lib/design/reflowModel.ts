// Flytta = REFLOW/INFOGA – aldrig ovanpå (Design mode v2 · B2).
//
// Ren, DOM-fri infognings-logik för Design mode-canvasen: givet nuvarande
// placeringar + den dragna regionen + släpp-målet returneras en NY, KONFLIKTFRI
// placering-uppsättning. Regeln är "släpp = infoga": den dragna tar målplatsen,
// grannar knuffas undan i sidled om raden rymmer dem (swap/skjut), annars nedåt
// till en egen rad, och tomma rader komprimeras bort. Ingen placering överlappar
// någonsin en annan i resultatet.
//
// Modulen är generisk över "items" (nyckel + kolumn/spann/rad) så SAMMA logik
// driver både topp-blocken (GridArea) och nästlade regioner (RegionVM-syskon
// inom en förälder) – grid-agnostiskt via `cols`, precis som gridModel.

import { clampPlacement } from './gridModel'

/** Minsta gemensamma nämnaren för allt som kan reflowas. */
export interface ReflowItem {
  key: string
  /** 1-baserad kolumn-startlinje. */
  colStart: number
  span: number
  /** Rad (heltal i modellen; halvtal används transient för "infoga mellan rader"). */
  row: number
  hidden?: boolean
}

const itemEnd = (i: Pick<ReflowItem, 'colStart' | 'span'>) => i.colStart + i.span - 1
const center = (i: Pick<ReflowItem, 'colStart' | 'span'>) => i.colStart + (i.span - 1) / 2

// ── Infoga i EN rad (sidled-knuff eller nedknuff) ────────────────────────────

export interface RowInsertResult {
  /** Ny kolumn-start per granne som behöver flytta (nyckel → colStart). */
  placements: Map<string, number>
  /** Grannar som inte fick plats i sidled → knuffas till en egen rad under. */
  pushedDown: string[]
}

/**
 * Infoga den dragna i en rad av grannar. Den dragna VINNER sin målplats;
 * grannarna packas åt sidorna (behåller sina platser där det går). Ryms inte
 * alla i sidled knuffas de grannar som överlappar den dragna nedåt i stället
 * (de behåller sina kolumner på den nya raden). Deterministiskt och rent.
 */
export function insertIntoRow(
  rowItems: ReadonlyArray<Pick<ReflowItem, 'key' | 'colStart' | 'span'>>,
  dragged: { colStart: number; span: number },
  cols: number,
): RowInsertResult {
  const d = clampPlacement(dragged.colStart, dragged.span, cols)
  const sorted = [...rowItems].sort((a, b) => a.colStart - b.colStart)
  // Infognings-index ur mittpunkter: grannar vars mitt ligger till vänster om
  // (eller på) den dragnas mitt hamnar FÖRE (⇒ exakt släpp på en granne = swap:
  // grannen glider åt vänster och tar den lediga platsen).
  const dc = center(d)
  const before = sorted.filter((b) => center(b) <= dc)
  const after = sorted.filter((b) => center(b) > dc)

  // (1) Försök sidled: packa efter-grannar åt höger och före-grannar åt vänster.
  const placements = new Map<string, number>()
  let ok = true
  let cur = itemEnd(d) + 1
  for (const b of after) {
    const cs = Math.max(b.colStart, cur)
    if (cs + b.span - 1 > cols) { ok = false; break }
    if (cs !== b.colStart) placements.set(b.key, cs)
    cur = cs + b.span
  }
  if (ok) {
    let right = d.colStart - 1
    for (const b of [...before].reverse()) {
      const end = Math.min(itemEnd(b), right)
      const cs = end - b.span + 1
      if (cs < 1) { ok = false; break }
      if (cs !== b.colStart) placements.set(b.key, cs)
      right = cs - 1
    }
  }
  if (ok) return { placements, pushedDown: [] }

  // (2) Nedknuff: bara grannar som faktiskt överlappar den dragnas målplats
  //     flyttas – till en egen rad direkt under (kolumner behålls). Övriga står kvar.
  const pushedDown = sorted
    .filter((b) => b.colStart <= itemEnd(d) && itemEnd(b) >= d.colStart)
    .map((b) => b.key)
  return { placements: new Map(), pushedDown }
}

// ── Hela släppet: infoga + knuffa + komprimera ───────────────────────────────

/**
 * Lös ett släpp: `key` släpps på `target` (rad kan vara halvtal = "mellan två
 * rader" ⇒ egen ny rad). Returnerar en NY uppsättning där ingen synlig placering
 * överlappar någon annan och raderna är komprimerade 1..R. Dolda items behåller
 * sina placeringar (de deltar inte i konfliktlösningen).
 */
export function resolveDrop<T extends ReflowItem>(
  items: ReadonlyArray<T>,
  key: string,
  target: { row: number; colStart: number },
  cols: number,
  spanOverride?: number,
): T[] {
  const dragged = items.find((i) => i.key === key)
  if (!dragged) return [...items]
  const span = spanOverride ?? dragged.span
  const d = clampPlacement(target.colStart, span, cols)
  const rowOthers = items.filter((i) => i.key !== key && !i.hidden && i.row === target.row)
  const res = insertIntoRow(rowOthers, { colStart: d.colStart, span: d.span }, cols)
  const downSet = new Set(res.pushedDown)
  const out = items.map((i) => {
    if (i.key === key) return { ...i, row: target.row, colStart: d.colStart, span: d.span }
    if (downSet.has(i.key)) return { ...i, row: target.row + 0.5 }
    const cs = res.placements.get(i.key)
    return cs !== undefined ? { ...i, colStart: cs } : i
  })
  return compactRows(out)
}

/** Lös en storleksändring på plats (spannet växer/krymper där det står). */
export function resolveSpan<T extends ReflowItem>(items: ReadonlyArray<T>, key: string, newSpan: number, cols: number): T[] {
  const dragged = items.find((i) => i.key === key)
  if (!dragged) return [...items]
  return resolveDrop(items, key, { row: dragged.row, colStart: dragged.colStart }, cols, newSpan)
}

/** Renumrera raderna tät-packat 1..R (generisk normalizeRows). */
export function compactRows<T extends ReflowItem>(items: ReadonlyArray<T>): T[] {
  const rows = Array.from(new Set(items.map((i) => i.row))).sort((a, b) => a - b)
  const remap = new Map(rows.map((r, idx) => [r, idx + 1]))
  return items.map((i) => {
    const r = remap.get(i.row) ?? i.row
    return r === i.row ? i : { ...i, row: r }
  })
}

// ── Släpp-mål ur pekarens y (rad ELLER "mellan rader") ───────────────────────

/** En rads vertikala band i canvasen (samma koordinatrum som pekarens y). */
export interface RowBand { row: number; top: number; h: number }

/**
 * Vilket infognings-mål pekar y på? Mitt i en rad ⇒ raden (infoga/knuffa där);
 * nära en radkant/i gapet ⇒ halvtal (egen ny rad mellan raderna). Kantzonens
 * höjd följer radhöjden (30 %, 4–14 px) så även låga rader går att träffa.
 */
export function insertionRow(y: number, bands: ReadonlyArray<RowBand>): number {
  if (bands.length === 0) return 1
  const sorted = [...bands].sort((a, b) => a.top - b.top)
  const edge = (b: RowBand) => Math.min(14, Math.max(4, b.h * 0.3))
  for (const b of sorted) {
    if (y < b.top + edge(b)) return b.row - 0.5
    if (y <= b.top + b.h - edge(b)) return b.row
  }
  return sorted[sorted.length - 1].row + 0.5
}

// ── Jämförelse/verifiering ───────────────────────────────────────────────────

/** True om två uppsättningar har exakt samma placeringar per nyckel. */
export function sameLayout(a: ReadonlyArray<ReflowItem>, b: ReadonlyArray<ReflowItem>): boolean {
  if (a.length !== b.length) return false
  const byKey = new Map(b.map((i) => [i.key, i]))
  return a.every((i) => {
    const o = byKey.get(i.key)
    return !!o && o.colStart === i.colStart && o.span === i.span && o.row === i.row
  })
}

/** Alla par av SYNLIGA items som överlappar (samma rad + kolumnsnitt). Ska vara tomt. */
export function overlapPairs(items: ReadonlyArray<ReflowItem>): Array<[string, string]> {
  const vis = items.filter((i) => !i.hidden)
  const bad: Array<[string, string]> = []
  for (let i = 0; i < vis.length; i++) {
    for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i], b = vis[j]
      if (a.row === b.row && a.colStart <= itemEnd(b) && b.colStart <= itemEnd(a)) bad.push([a.key, b.key])
    }
  }
  return bad
}

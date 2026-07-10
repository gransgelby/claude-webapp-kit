// Osparat-detektering + Spara layout-payload (Design mode v2 · B6).
//
// "Osparat" = modellens signatur skiljer sig från signaturen vid senaste Spara
// (eller init). Signaturen täcker ALLT som kan ändras i Design mode: topp-areor
// (placering/rad/dold), nästlade regioner (placering/rad/höjd – rad+kolumn bär
// även DOM-omordningar i flödes-scopes) och topp-blockens dragna höjder.
//
// Spara-payloaden (design-notes, kind 'layout' – schemalös JSON i backenden)
// utökas med samma information så att nästlade flyttar/höjder/omordningar
// FÖLJER MED sparningen (tidigare sparades bara topp-areorna).
//
// Ren modul (ingen DOM, ingen React) – enhetstestad i savePayload.test.ts.

export interface SigArea {
  key: string
  colStart: number
  span: number
  row: number
  hidden?: boolean
}
export interface SigNest { id: string; colStart: number; span: number; row: number; hpx: number }
export interface SigTop { key: string; hpx: number }

/** Modell-snapshotet som signeras (samma form som historikens Snap). */
export interface SigSnap {
  areas: ReadonlyArray<SigArea>
  nest: ReadonlyArray<SigNest>
  tops: ReadonlyArray<SigTop>
}

const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * Stabil signatur av hela layout-modellen. Höjder avrundas till 0.1 px så
 * flyt-brus inte flaggar "osparat"; ordningen normaliseras via sortering.
 */
export function layoutSignature(s: SigSnap): string {
  const areas = [...s.areas]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((a) => `${a.key}:${a.colStart}/${a.span}@${a.row}${a.hidden ? '!' : ''}`)
  const nest = [...s.nest]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => `${n.id}:${n.colStart}/${n.span}@${n.row}#${r1(n.hpx)}`)
  const tops = [...s.tops]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((t) => `${t.key}#${r1(t.hpx)}`)
  return `a[${areas.join(',')}]n[${nest.join(',')}]t[${tops.join(',')}]`
}

// ── Utökad Spara layout-payload ──────────────────────────────────────────────

export interface AreaSave {
  key: string
  label?: string
  colStart: number
  span: number
  row: number
  hidden?: boolean
  placeholder?: boolean
}

/** En nästlad region, med init-läget så bara AVVIKELSER sparas. */
export interface NestedSave {
  id: string
  label: string
  /** Topp-blockets/bandets etikett – ger läsbar kontext i design-noten. */
  top: string
  mech: string
  cols: number
  colStart: number
  span: number
  row: number
  hpx: number
  orig: { colStart: number; span: number; row: number; hpx: number }
}

export interface TopSave { key: string; label: string; hpx: number; origPx: number }

/** True om en nästlad region avviker från sitt init-läge (placering eller höjd). */
export function nestedDirty(n: NestedSave, tolPx = 0.5): boolean {
  return (
    n.colStart !== n.orig.colStart ||
    n.span !== n.orig.span ||
    n.row !== n.orig.row ||
    Math.abs(n.hpx - n.orig.hpx) > tolPx
  )
}

export interface LayoutPayloadInput {
  page: string
  theme: string
  viewport: { w: number; h: number; dpr: number }
  cols: number
  gapVar?: string
  areas: ReadonlyArray<AreaSave>
  nested: ReadonlyArray<NestedSave>
  tops: ReadonlyArray<TopSave>
}

/**
 * Bygg hela design-note-payloaden (kind 'layout'). Nästlade regioner och
 * topp-höjder tas med som DELTAN (bara de som avviker från init) så noten
 * förblir läsbar och återapplicerbar; backendens layout-fält är schemalöst.
 */
export function buildLayoutPayload(inp: LayoutPayloadInput) {
  const nested = inp.nested.filter((n) => nestedDirty(n)).map((n) => ({
    id: n.id,
    label: n.label,
    top: n.top,
    mech: n.mech,
    cols: n.cols,
    colStart: n.colStart,
    span: n.span,
    row: n.row,
    hpx: Math.round(n.hpx),
    orig: { ...n.orig, hpx: Math.round(n.orig.hpx) },
  }))
  const tops = inp.tops
    .filter((t) => Math.abs(t.hpx - t.origPx) > 0.5)
    .map((t) => ({ key: t.key, label: t.label, hpx: Math.round(t.hpx), origPx: Math.round(t.origPx) }))
  const visible = inp.areas.filter((a) => !a.hidden)
  const parts = [
    `Layout-förslag (${inp.cols}-kol): ${visible.map((a) => `${a.label} kol ${a.colStart}–${a.colStart + a.span - 1}`).join('; ')}`,
  ]
  if (nested.length > 0) parts.push(`${nested.length} nästlad${nested.length === 1 ? '' : 'e'} region${nested.length === 1 ? '' : 'er'} ändrad${nested.length === 1 ? '' : 'e'}: ${nested.map((n) => `${n.label} (${n.top}) kol ${n.colStart}/${n.span} rad ${n.row}`).join('; ')}`)
  if (tops.length > 0) parts.push(`höjder: ${tops.map((t) => `${t.label} ${t.hpx}px`).join('; ')}`)
  return {
    kind: 'layout' as const,
    page: inp.page,
    theme: inp.theme,
    viewport: inp.viewport,
    layout: {
      cols: inp.cols,
      gapVar: inp.gapVar,
      page: inp.page,
      areas: inp.areas.map(({ key, label, colStart, span, row, hidden, placeholder }) => ({ key, label, colStart, span, row, hidden, placeholder })),
      // B6: nästlade placeringar/höjder + topp-höjder ingår nu i sparningen.
      nested: nested.length > 0 ? nested : undefined,
      tops: tops.length > 0 ? tops : undefined,
    },
    comment: parts.join(' · '),
  }
}

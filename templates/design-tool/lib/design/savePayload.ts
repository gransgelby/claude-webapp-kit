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
/** V9: en fri-flytt-intent (rect vs base i naturliga dokument-px). */
export interface SigIntentRect { x: number; y: number; w: number; h: number }
export interface SigIntent { rect: SigIntentRect; base: SigIntentRect }

/** Modell-snapshotet som signeras (samma form som historikens Snap). */
export interface SigSnap {
  areas: ReadonlyArray<SigArea>
  nest: ReadonlyArray<SigNest>
  tops: ReadonlyArray<SigTop>
  /** V9: intent-kartan (låd-id → önskad rect + bas). Endast dirty tas med i signaturen. */
  intents?: Record<string, SigIntent>
}

const r1 = (n: number) => Math.round(n * 10) / 10
const rectClose = (a: SigIntentRect, b: SigIntentRect, tol = 0.5) =>
  Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol &&
  Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol

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
  const im = s.intents ?? {}
  const intents = Object.keys(im)
    .filter((k) => !rectClose(im[k].rect, im[k].base))
    .sort()
    .map((k) => { const r = im[k].rect; return `${k}:${r1(r.x)}/${r1(r.y)}/${r1(r.w)}/${r1(r.h)}` })
  return `a[${areas.join(',')}]n[${nest.join(',')}]t[${tops.join(',')}]i[${intents.join(',')}]`
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

/** V9: en fri-flytt-intent för sparningen (låd-id + etikett + rect vs bas, doc-px). */
export interface IntentSave { key: string; label?: string; rect: SigIntentRect; base: SigIntentRect }

/** True om en nästlad region avviker från sitt init-läge (placering eller höjd). */
export function nestedDirty(n: NestedSave, tolPx = 0.5): boolean {
  return (
    n.colStart !== n.orig.colStart ||
    n.span !== n.orig.span ||
    n.row !== n.orig.row ||
    Math.abs(n.hpx - n.orig.hpx) > tolPx
  )
}

/** V15: en css-tema-tweak (mål-sidans token: från-värde → till-värde). */
export interface CssTweakSave { name: string; kind: string; from: string; to: string }

/**
 * R7: en element-SCOPAD css-ändring (dra-ruta i css-läget). Till skillnad från
 * CssTweakSave (global token) träffar den bara elementen i rutan. `prop` = CSS-
 * egenskap, `label` = svensk förklaring, `targets` = de element den skrevs på (med
 * design_id/etikett så noten är återapplicerbar och läsbar).
 */
export interface CssScopedSave {
  prop: string
  label: string
  from: string
  to: string
  count: number
  targets: ReadonlyArray<{ design_id?: string; label: string }>
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
  /** V9: fria flytt/resize-intentioner (låd-overlay ovanpå projektionen). */
  intents?: ReadonlyArray<IntentSave>
  /** V15: css-tema-tweaks (mål-sidans redigerade tema-tokens). */
  cssTweaks?: ReadonlyArray<CssTweakSave>
  /** R7: element-scopade css-ändringar (dra-ruta – bara rutans element). */
  cssScoped?: ReadonlyArray<CssScopedSave>
  /** R11: användarens namn på designförslaget (fritt fält i spara-dialogen). */
  title?: string
}

/** V9: True om en intent avviker från sin bas (värt att spara/flagga). */
export function intentSaveDirty(it: IntentSave, tol = 0.5): boolean {
  return !rectClose(it.rect, it.base, tol)
}

/**
 * R11: kort, redigerbart auto-förslag på namn ur de faktiska ändringarna, som
 * förifyller namnfältet i spara-dialogen. Använder samma dirty-detektering som
 * buildLayoutPayload (nästlade flyttar, topp-höjder, dolda block). Ren funktion.
 */
export function suggestLayoutName(inp: LayoutPayloadInput): string {
  const nested = inp.nested.filter((n) => nestedDirty(n))
  const tops = inp.tops.filter((t) => Math.abs(t.hpx - t.origPx) > 0.5)
  const hidden = inp.areas.filter((a) => a.hidden)
  const intents = (inp.intents ?? []).filter((it) => intentSaveDirty(it))
  const bits: string[] = []
  if (intents.length === 1) bits.push(`fri flytt av ${intents[0].label ?? intents[0].key}`)
  else if (intents.length > 1) bits.push(`${intents.length} lådor fritt placerade`)
  if (nested.length === 1) bits.push(`flyttad ${nested[0].label}`)
  else if (nested.length > 1) bits.push(`${nested.length} regioner flyttade`)
  if (tops.length === 1) bits.push(`höjd på ${tops[0].label}`)
  else if (tops.length > 1) bits.push(`${tops.length} höjder ändrade`)
  if (hidden.length === 1) bits.push(`dolde ${hidden[0].label}`)
  else if (hidden.length > 1) bits.push(`dolde ${hidden.length} block`)
  if (bits.length === 0) return 'Layout-förslag'
  const s = bits.join(', ')
  return s.charAt(0).toUpperCase() + s.slice(1)
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
  const rr = (r: SigIntentRect) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })
  const intents = (inp.intents ?? [])
    .filter((it) => intentSaveDirty(it))
    .map((it) => ({ key: it.key, label: it.label, rect: rr(it.rect), base: rr(it.base) }))
  const cssTweaks = (inp.cssTweaks ?? []).map((t) => ({ name: t.name, kind: t.kind, from: t.from, to: t.to }))
  const cssScoped = (inp.cssScoped ?? []).map((s) => ({
    prop: s.prop, label: s.label, from: s.from, to: s.to, count: s.count,
    targets: s.targets.map((t) => ({ design_id: t.design_id, label: t.label })),
  }))
  const visible = inp.areas.filter((a) => !a.hidden)
  // V15/R7: en ren css-sparning (token-tema ELLER element-scopade ändringar, inga
  // strukturella deltan) → hoppa layout-raden i kommentaren så noten blir läsbar.
  const cssOnly = (cssTweaks.length > 0 || cssScoped.length > 0) && nested.length === 0 && tops.length === 0 && intents.length === 0 && !inp.areas.some((a) => a.hidden)
  const parts: string[] = []
  if (!cssOnly) parts.push(`Layout-förslag (${inp.cols}-kol): ${visible.map((a) => `${a.label} kol ${a.colStart}–${a.colStart + a.span - 1}`).join('; ')}`)
  if (nested.length > 0) parts.push(`${nested.length} nästlad${nested.length === 1 ? '' : 'e'} region${nested.length === 1 ? '' : 'er'} ändrad${nested.length === 1 ? '' : 'e'}: ${nested.map((n) => `${n.label} (${n.top}) kol ${n.colStart}/${n.span} rad ${n.row}`).join('; ')}`)
  if (tops.length > 0) parts.push(`höjder: ${tops.map((t) => `${t.label} ${t.hpx}px`).join('; ')}`)
  if (intents.length > 0) parts.push(`fri placering (intention, doc-px): ${intents.map((it) => `${it.label ?? it.key} → ${it.rect.w}×${it.rect.h} vid (${it.rect.x},${it.rect.y})`).join('; ')}`)
  // V15: css-tema-tweaks i kommentaren så design-noten är läsbar även utan att öppna JSON.
  if (cssTweaks.length > 0) parts.push(`CSS-tema (${cssTweaks.length} token${cssTweaks.length === 1 ? '' : 's'}): ${cssTweaks.map((t) => `${t.name} ${t.from} → ${t.to}`).join('; ')}`)
  // R7: element-scopade css-ändringar (bara i rutan) – separat rad så räckvidden är tydlig.
  if (cssScoped.length > 0) parts.push(`CSS i ruta (${cssScoped.length} egenskap${cssScoped.length === 1 ? '' : 'er'}, element-scopat): ${cssScoped.map((s) => `${s.label} ${s.from} → ${s.to} (${s.count} el.)`).join('; ')}`)
  const title = inp.title?.trim() || undefined
  return {
    kind: 'layout' as const,
    // R11: namnet på designförslaget (schemalöst extra fält i noten) – redigerbart
    // i spara-dialogen, syns i design-note-inkorgen (pull-design-notes visar det).
    title,
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
      // V9: fria flytt/resize-intentioner (låd-overlay ovanpå projektionen).
      intents: intents.length > 0 ? intents : undefined,
    },
    // V15: css-tema-tweaks (mål-sidans redigerade tema-tokens) – design-noten bär dem.
    cssTweaks: cssTweaks.length > 0 ? cssTweaks : undefined,
    // R7: element-scopade css-ändringar (dra-ruta – bara rutans element).
    cssScoped: cssScoped.length > 0 ? cssScoped : undefined,
    comment: parts.join(' · '),
  }
}

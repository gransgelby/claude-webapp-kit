// Ren element-modell för DesignTools element-verktygslåda (Post 5, nattjobb
// 2026-07-10). All logik som INTE behöver en levande DOM lever här → billig,
// deterministisk, enhets-testad (körs i node-miljön utan jsdom). DOM-omslagen
// längst ned bygger `NodeDesc`-kedjor ur riktiga element och delegerar besluten
// till de rena funktionerna.
//
// KÄRNAN – "smart default-selektion" (fixar MapLibre-ⓘ-buggen):
//   När man plockar ett element ska verktyget default:a till närmaste MENINGSFULLA
//   kontroll/behållare, inte ett dekorativt inre lager (span/svg) eller ett inre
//   knapp-lager i en känd kart-kontroll. `pickMeaningfulIndex` gör detta rent över
//   en förälderkedja av `NodeDesc`.

/** Rent, DOM-fritt sammandrag av ett element (det pickMeaningfulIndex resonerar om). */
export interface NodeDesc {
  /** Gemena taggnamnet, t.ex. "div", "button", "svg". */
  tag: string
  id: string | null
  /** Klass-TOKENS (redan splittade på whitespace). */
  classes: string[]
  role: string | null
  ariaLabel: string | null
  /** Namn på `data-*`-attribut som finns (utan värde), t.ex. ["data-design-id"]. */
  dataAttrs: string[]
  /** `data-design-id`-värdet om satt (appens semantiska markör). */
  designId: string | null
}

// Rent presentationella / inre lager – aldrig ett vettigt default-val i sig.
const DECORATIVE_TAGS = new Set([
  'span', 'svg', 'path', 'use', 'g', 'i', 'em', 'strong', 'small', 'b', 'sub', 'sup',
  'br', 'img', 'picture', 'source', 'tspan', 'circle', 'rect', 'line', 'polygon',
  'polyline', 'ellipse', 'defs', 'clippath', 'lineargradient', 'stop', 'mark', 'abbr',
  'time', 'code', 'wbr', 'u', 's', 'font',
])

// Klass-tokens som identifierar en KÄND kart-kontroll-grupp (hela kontrollen, inte
// dess inre knapp/ikon). MapLibre/Mapbox/Leaflet lägger `*-ctrl`/`*-control` på
// själva grupp-behållaren; inre lager får längre, avledda tokens.
const CONTROL_GROUP_CLASSES = new Set([
  'maplibregl-ctrl', 'mapboxgl-ctrl', 'leaflet-control', 'leaflet-bar',
])

// Roller som markerar en meningsfull behållare (region/verktygsfält osv).
const CONTAINER_ROLES = new Set([
  'region', 'group', 'toolbar', 'navigation', 'form', 'dialog', 'menu', 'menubar',
  'tablist', 'listbox', 'banner', 'complementary', 'main', 'search', 'radiogroup',
])

/** True om deskriptorn är en känd kart-kontroll-GRUPP (hela ⓘ/zoom-kontrollen). */
export function isKnownControlGroup(d: NodeDesc): boolean {
  return d.classes.some((c) => CONTROL_GROUP_CLASSES.has(c))
}

/** True om deskriptorn är ett rent dekorativt / inre lager (span, svg-nod …). */
export function isDecorative(d: NodeDesc): boolean {
  return DECORATIVE_TAGS.has(d.tag)
}

/** True om deskriptorn i sig är en semantiskt meningsfull behållare. */
export function isMeaningfulContainer(d: NodeDesc): boolean {
  if (d.designId) return true
  if (isKnownControlGroup(d)) return true
  if (d.role && CONTAINER_ROLES.has(d.role)) return true
  if (d.ariaLabel) return true
  if (['section', 'article', 'nav', 'aside', 'header', 'footer', 'form', 'fieldset', 'main', 'figure', 'dialog', 'table'].includes(d.tag)) return true
  if (d.classes.some((c) => /(^|-)(card|panel|toolbar|controls?|widget|section|sheet)($|-)/.test(c))) return true
  return false
}

/**
 * Välj INDEXET i en förälderkedja (index 0 = det plockade elementet, stigande =
 * uppåt mot roten) som verktyget ska default:a till.
 *
 * Regler, i prioritetsordning:
 *   1. Ligger träffen inne i en KÄND kart-kontroll-grupp (MapLibre/Mapbox/Leaflet)
 *      inom en kort klätter-fönster → välj den NÄRMASTE gruppen. Detta fixar
 *      MapLibre-ⓘ-buggen: i stället för det inre knapp/span-lagret väljs hela
 *      kontrollen.
 *   2. Annars → närmaste icke-dekorativa element (hoppa förbi span/svg/path …).
 *   3. Fallback → det plockade elementet självt.
 */
export function pickMeaningfulIndex(chain: NodeDesc[], climbWindow = 8): number {
  const n = chain.length
  if (n === 0) return 0
  // (1) Känd kart-kontroll-grupp nära träffen → hela kontrollen.
  for (let i = 0; i < Math.min(n, climbWindow); i++) {
    if (isKnownControlGroup(chain[i])) return i
  }
  // (2) Närmaste icke-dekorativa lager.
  for (let i = 0; i < n; i++) {
    if (!isDecorative(chain[i])) return i
  }
  return 0
}

/** Kort, läsbar etikett för ett element i brödsmulan: `tag#id.klass`. */
export function elementLabel(d: NodeDesc): string {
  const id = d.id ? `#${d.id}` : ''
  const cls = !d.id && d.classes.length ? `.${d.classes[0]}` : ''
  return `${d.tag}${id}${cls}`
}

// ── Token-snap-nudge (ren matte) ─────────────────────────────────────────────

// Tailwind-spacing-stegens ratio (× 0.25rem). Speglar tailwind.config.ts.
export const SPACING_STEPS = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
]

/** Spacing-tokens i px vid given rot-fontstorlek + densitets-skala (`--space-scale`). */
export function spacingStepsPx(remPx = 16, scale = 1): { name: string; px: number }[] {
  return SPACING_STEPS.map((n) => ({ name: String(n), px: n * 0.25 * remPx * scale }))
}

/**
 * Snäpp ett px-värde till närmaste spacing-token. Returnerar närmaste token +
 * dess px, samt om värdet redan låg PÅ en token (inom `tolPx`).
 */
export function nearestSpacingToken(
  px: number,
  steps: { name: string; px: number }[],
  tolPx = 0.75,
): { name: string; px: number; onToken: boolean } {
  if (steps.length === 0) return { name: '?', px, onToken: false }
  let best = steps[0]
  let bestD = Math.abs(px - steps[0].px)
  for (const s of steps) {
    const d = Math.abs(px - s.px)
    if (d < bestD) { bestD = d; best = s }
  }
  return { name: best.name, px: best.px, onToken: bestD <= tolPx }
}

/**
 * Nudga ett px-värde ETT spacing-steg upp (`dir=+1`) eller ned (`dir=-1`) och snäpp
 * till token-rastret. Om värdet ligger mellan två tokens rör vi oss till nästa/
 * föregående token i stället för att bara addera px → "token-snap-nudge".
 */
export function nudgeToToken(
  px: number,
  dir: 1 | -1,
  steps: { name: string; px: number }[],
): { name: string; px: number } {
  const sorted = [...steps].sort((a, b) => a.px - b.px)
  if (dir > 0) {
    const next = sorted.find((s) => s.px > px + 0.5)
    return next ?? sorted[sorted.length - 1]
  }
  const prev = [...sorted].reverse().find((s) => s.px < px - 0.5)
  return prev ?? sorted[0]
}

// ── DOM-omslag (ej testade i node – bygger NodeDesc ur riktiga element) ───────

/** Läs klass-tokens robust (svg-element bär `className.baseVal`, inte en sträng). */
function classTokens(el: Element): string[] {
  const raw = typeof el.className === 'string'
    ? el.className
    : ((el.className as unknown as { baseVal?: string })?.baseVal ?? '')
  return raw.trim() ? raw.trim().split(/\s+/) : []
}

/** Bygg en `NodeDesc` ur ett riktigt DOM-element. */
export function describeNode(el: Element): NodeDesc {
  const dataAttrs: string[] = []
  for (const a of Array.from(el.attributes)) {
    if (a.name.startsWith('data-')) dataAttrs.push(a.name)
  }
  return {
    tag: el.nodeName.toLowerCase(),
    id: el.id || null,
    classes: classTokens(el),
    role: el.getAttribute('role'),
    ariaLabel: el.getAttribute('aria-label'),
    dataAttrs,
    designId: (el as HTMLElement).dataset?.designId ?? null,
  }
}

/** Bygg förälderkedjan (element 0 = `el`, uppåt) tills BODY/rot eller `max`. */
export function elementChain(el: Element, max = 14): Element[] {
  const out: Element[] = []
  let cur: Element | null = el
  for (let i = 0; i < max && cur && cur.nodeName !== 'BODY' && cur.nodeName !== 'HTML'; i++) {
    if ((cur as HTMLElement).closest?.('[data-design-tool]') && out.length) break
    out.push(cur)
    cur = cur.parentElement
  }
  return out
}

/**
 * Smart default-selektion: givet ett träff-element, klättra till närmaste
 * meningsfulla behållare/kontroll (aldrig ett dekorativt inre lager). Fixar
 * MapLibre-ⓘ-buggen. Grunden för Post 5:s element-plock i BÅDA lägena.
 */
export function nearestMeaningfulElement(el: Element): Element {
  const chain = elementChain(el)
  const descs = chain.map(describeNode)
  const idx = pickMeaningfulIndex(descs)
  return chain[idx] ?? el
}

/**
 * Brödsmule-kedja (DOM-hierarki) för ett valt element: från en rimlig topp-
 * behållare NER till `el`. Returnerar element + etikett, i ordning topp→…→el.
 * Användaren klickar upp/ner för att välja förälder/barn.
 */
export function breadcrumbChain(el: Element, maxUp = 10): { el: Element; label: string }[] {
  const up: Element[] = []
  let cur: Element | null = el
  for (let i = 0; i < maxUp && cur && cur.nodeName !== 'BODY' && cur.nodeName !== 'HTML'; i++) {
    up.push(cur)
    const parent: Element | null = cur.parentElement
    if (!parent || parent.nodeName === 'BODY' || parent.nodeName === 'HTML') break
    cur = parent
  }
  // up = [el, förälder, farförälder, …]; brödsmulan visas topp→el.
  return up.reverse().map((e) => ({ el: e, label: elementLabel(describeNode(e)) }))
}

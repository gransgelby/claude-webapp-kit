// V15 · CSS-tema-editor – att TWEAKA MÅL-sidans faktiska tema-tokens (INTE bygga
// nya teman). App-AGNOSTISKT: vi enumererar de CSS custom properties som sidan
// FAKTISKT deklarerar på `:root`/`html` (t.ex. `--c-*`, `--space-*`, `--radius-*`,
// font-tokens) generiskt ur stylesheets + klassar dem ur sina VÄRDEN – aldrig en
// hårdkodad lista för någon enskild app. Verktygets egen chrome (`--dt-*`) redigeras
// ALDRIG (den hålls i Precision-temaparet).
//
// Ren logik (klassning, override-karta, historik-steg, payload) är DOM-fri och
// enhetstestad i cssTweaks.test.ts. DOM-sidan (enumerera ur stylesheets, skriv/
// rensa live på document-roten, läs effektivt värde) är tunna wrappers längst ner.

import { parseColor, rgbToHex, type RGB } from './colorUtils'

// escapeRegExp – för att bygga säkra token-referens-regexar (W21).
function escapeRegExp(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

export type TweakKind = 'color' | 'radius' | 'length' | 'font' | 'number' | 'shadow' | 'other'

/** En redigerbar tema-token på mål-sidan. `value` = effektivt (computed) värde. */
export interface ThemeToken {
  name: string
  value: string
  kind: TweakKind
}

// ── Klassning (ren) ──────────────────────────────────────────────────────────

const LENGTH_RE = /^-?\d*\.?\d+(px|rem|em|%|vh|vw|vmin|vmax|pt|pc|cm|mm|ch|ex|q)$/i
const NUMBER_RE = /^-?\d*\.?\d+$/
const HSL_RE = /^hsla?\(/i
const NAMED_COLORS = new Set([
  'white', 'black', 'transparent', 'currentcolor', 'red', 'green', 'blue',
  'gray', 'grey', 'silver', 'orange', 'yellow', 'purple', 'navy', 'teal',
])

/** True om värdet läser som en färg (hex / rgb() / hsl() / app-triplett / namn). */
export function isColorValue(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (!v) return false
  if (NAMED_COLORS.has(v)) return true
  if (HSL_RE.test(v)) return true
  // hex, rgb(), eller ren 3-tals-triplett (`15 23 42`) hanteras av parseColor.
  return parseColor(v) != null
}

/**
 * Klassa en token ur NAMN + VÄRDE → vilken kontroll editorn ska rendera.
 * Ordningen är medveten: shadow/font före färg, färg före längd/radie.
 */
export function classifyToken(name: string, value: string): TweakKind {
  const n = name.toLowerCase()
  const v = value.trim()
  if (!v) return 'other'
  if (/shadow|glow|elevation/.test(n)) return 'shadow'
  // Font-family-token (bokstäver/komma, ej en längd) – font-size faller vidare till length.
  if (/font/.test(n) && !LENGTH_RE.test(v) && !NUMBER_RE.test(v) && /[a-z]/i.test(v)) return 'font'
  if (isColorValue(v)) return 'color'
  if (/radius|rounded|corner/.test(n) && (LENGTH_RE.test(v) || NUMBER_RE.test(v) || v === '0')) return 'radius'
  if (LENGTH_RE.test(v)) return 'length'
  if (NUMBER_RE.test(v)) return 'number'
  return 'other'
}

/** Dela en längd i tal + enhet (för slider). Null om det inte är en ren längd. */
export function parseLength(value: string): { num: number; unit: string } | null {
  const m = value.trim().match(/^(-?\d*\.?\d+)([a-z%]*)$/i)
  if (!m) return null
  const num = parseFloat(m[1])
  if (Number.isNaN(num)) return null
  return { num, unit: m[2] || '' }
}

/** Rimligt slider-max per enhet (bara en default; fältet tillåter valfritt värde). */
export function lengthSliderMax(unit: string): number {
  switch (unit.toLowerCase()) {
    case 'px': return 64
    case 'rem': case 'em': return 4
    case '%': return 100
    default: return 100
  }
}

/** Editor-hex för en färg-token (för `<input type=color>`). Fallback `#000000`. */
export function colorTokenHex(value: string): string {
  const c: RGB | null = parseColor(value)
  return c ? rgbToHex(c) : '#000000'
}

/**
 * Skriv tillbaka en redigerad färg i SAMMA form som token:en ursprungligen hade:
 * app-tripletter (`15 23 42`, konsumeras via `rgb(var(--x))`) förblir tripletter,
 * annars hex. Ren funktion → förutsägbar live-applicering + payload.
 */
export function formatColorLikeOriginal(original: string, hex: string): string {
  const c = parseColor(hex)
  if (!c) return hex
  const orig = original.trim()
  const isTriplet = /^\d+(\.\d+)?[\s,]+\d+(\.\d+)?[\s,]+\d+(\.\d+)?$/.test(orig)
  return isTriplet ? `${c.r} ${c.g} ${c.b}` : hex
}

// ── Override-karta + historik (ren) ──────────────────────────────────────────

/** Ett historik-steg: token gick från `prev` (null = orört original) till `next`. */
export interface TweakStep { name: string; prev: string | null; next: string | null }

/** Applicera ett override-värde på kartan (null → ta bort override). Immutabelt. */
export function applyOverride(
  map: Record<string, string>,
  name: string,
  value: string | null,
): Record<string, string> {
  const next = { ...map }
  if (value == null) delete next[name]
  else next[name] = value
  return next
}

/** Antal aktiva override:ar. */
export function overrideCount(map: Record<string, string>): number {
  return Object.keys(map).length
}

// ── Payload (ren) ────────────────────────────────────────────────────────────

/** En sparad css-tweak: token, klass, från-värde (original) → till-värde. */
export interface CssTweakEntry { name: string; kind: TweakKind; from: string; to: string }

/**
 * Diffa override-kartan mot originalvärdena → bara FAKTISKT ändrade tokens.
 * `tokens` bär originalens effektiva värden + klass.
 */
export function diffTweaks(
  tokens: ReadonlyArray<ThemeToken>,
  overrides: Record<string, string>,
): CssTweakEntry[] {
  const byName = new Map(tokens.map((t) => [t.name, t]))
  const out: CssTweakEntry[] = []
  for (const name of Object.keys(overrides).sort()) {
    const t = byName.get(name)
    const from = t ? t.value.trim() : ''
    const to = overrides[name].trim()
    if (to === from) continue
    out.push({ name, kind: t?.kind ?? 'other', from, to })
  }
  return out
}

/**
 * Bygg css-tweak-fragmentet för design-note-payloaden (V15). Rent objekt som
 * savePayload/spara-dialogen lägger under `cssTweaks` så design-noten BÄR css-
 * ändringarna (backendens note-fält är schemalöst).
 */
export function buildCssTweaks(entries: ReadonlyArray<CssTweakEntry>): {
  count: number
  tweaks: CssTweakEntry[]
  comment: string
} {
  const tweaks = entries.map((e) => ({ ...e }))
  const comment = tweaks.length === 0
    ? ''
    : `CSS-tema (${tweaks.length} token${tweaks.length === 1 ? '' : 's'}): ` +
      tweaks.map((t) => `${t.name} ${t.from} → ${t.to}`).join('; ')
  return { count: tweaks.length, tweaks, comment }
}

/** Kort auto-namn ur css-ändringarna (förifyller spara-dialogens namnfält). */
export function suggestCssName(entries: ReadonlyArray<CssTweakEntry>): string {
  if (entries.length === 0) return 'Tema-justering'
  if (entries.length === 1) return `Tema: ${entries[0].name}`
  const kinds = new Set(entries.map((e) => e.kind))
  if (kinds.size === 1 && entries[0].kind === 'color') return `Färgjustering (${entries.length} tokens)`
  return `Tema-justering (${entries.length} tokens)`
}

// ── W18/W20: dra-ruta → kontextuella egenskaper (ren logik) ──────────────────
// När användaren drar en ruta över sidan läser DOM-sidan computed styles för
// elementen i rutan och lämnar RÅA (prop, value)-samples hit. Vi dedupar, klassar,
// mappar till tema-tokens och förklarar på svenska. App-agnostiskt: inga selektorer,
// bara CSS-egenskaper varje sida har.

/** Kanoniska egenskaper vi visar, med svensk förklaring (W18/W20). */
export const PROP_LABELS_SV: Record<string, string> = {
  'color': 'Textfärg',
  'background-color': 'Bakgrundsfärg',
  'border-color': 'Linjefärg (ram)',
  'border-width': 'Linjetjocklek',
  'border-radius': 'Rundade hörn',
  'font-family': 'Typsnitt',
  'font-size': 'Textstorlek',
  'font-weight': 'Textvikt',
  'line-height': 'Radhöjd',
  'letter-spacing': 'Teckenavstånd',
  'padding': 'Innermarginal (padding)',
  'margin': 'Yttermarginal (margin)',
  'gap': 'Mellanrum (gap)',
  'box-shadow': 'Skugga',
}

/** Svensk förklaring för en CSS-egenskap; faller tillbaka till egenskapsnamnet. */
export function explainProperty(prop: string): string {
  return PROP_LABELS_SV[prop] ?? prop
}

/** Klassa en kanonisk egenskap → vilken kontroll editorn ska rendera. */
export function propKind(prop: string): TweakKind {
  switch (prop) {
    case 'color': case 'background-color': case 'border-color': return 'color'
    case 'border-radius': return 'radius'
    case 'font-family': return 'font'
    case 'font-weight': return 'number'
    case 'box-shadow': return 'shadow'
    case 'border-width': case 'font-size': case 'line-height':
    case 'letter-spacing': case 'padding': case 'margin': case 'gap': return 'length'
    default: return 'other'
  }
}

/** Computed-longhand → kanonisk egenskap (border-top-color → border-color osv). */
export function canonicalProp(prop: string): string {
  const p = prop.toLowerCase()
  if (p.startsWith('border') && p.endsWith('-color')) return 'border-color'
  if (p.startsWith('border') && p.endsWith('-width')) return 'border-width'
  if (p.startsWith('padding')) return 'padding'
  if (p.startsWith('margin')) return 'margin'
  if (p === 'column-gap' || p === 'row-gap') return 'gap'
  return p
}

/** Längd → px (best-effort; rem/em via remBase). Null om ej jämförbar (%, vh, …). */
export function toPx(value: string, remBase = 16): number | null {
  const p = parseLength(value)
  if (!p) return null
  switch (p.unit.toLowerCase()) {
    case 'px': case '': return p.num
    case 'rem': case 'em': return p.num * remBase
    case 'pt': return p.num * (96 / 72)
    default: return null
  }
}

/**
 * Normalisera ett stilvärde för token-MATCHNING: färg → hex, längd → px (avrundat
 * till 0.5), annars gemener-trimmad sträng. remBase låter DOM-sidan skicka sidans
 * faktiska rot-fontstorlek (rem→px) så tokens i rem matchar computed px.
 */
export function normalizeStyleValue(value: string, remBase = 16): string {
  const v = (value || '').trim().toLowerCase()
  if (!v || v === 'none' || v === 'normal' || v === 'auto') return v
  const c = parseColor(v)
  if (c) return rgbToHex(c)
  const px = toPx(v, remBase)
  if (px != null) return `${Math.round(px * 2) / 2}px`
  return v
}

/** Index: normaliserat värde → token-namn (för att hitta tokens bakom ett värde). */
export function buildTokenValueIndex(
  tokens: ReadonlyArray<ThemeToken>,
  remBase = 16,
): Map<string, string[]> {
  const idx = new Map<string, string[]>()
  for (const t of tokens) {
    const key = normalizeStyleValue(t.value, remBase)
    if (!key) continue
    const arr = idx.get(key) ?? []
    arr.push(t.name)
    idx.set(key, arr)
  }
  return idx
}

/** Vilka tokens (om några) bär detta värde. */
export function matchTokensForValue(
  idx: Map<string, string[]>,
  value: string,
  remBase = 16,
): string[] {
  return idx.get(normalizeStyleValue(value, remBase)) ?? []
}

/** En observerad egenskap inom rutan, deduplicerad + token-mappad. */
export interface BoxObservation {
  prop: string       // kanonisk egenskap (t.ex. 'background-color')
  label: string      // svensk förklaring
  value: string      // representativt råvärde
  count: number      // hur många element i rutan hade det
  kind: TweakKind    // vilken kontroll → color/length/…
  tokens: string[]   // matchande tema-token-namn (kan vara flera eller inga)
}

/** Värden som inte är intressanta att visa (tomt/genomskinligt/0). */
function isEmptyStyleValue(value: string): boolean {
  const v = (value || '').trim().toLowerCase()
  if (!v) return true
  if (v === 'none' || v === 'normal' || v === 'auto' || v === 'currentcolor') return true
  if (v === '0' || v === '0px' || v === '0rem') return true
  if (v === 'transparent' || v === 'rgba(0, 0, 0, 0)' || v === 'rgba(0,0,0,0)') return true
  return false
}

/**
 * Dedupa + klassa + token-mappa råa (prop, value)-samples från rutan.
 * Token-backade observationer först, sedan efter förekomst. Ren → enhetstestad.
 */
export function summarizeBoxProps(
  samples: ReadonlyArray<{ prop: string; value: string }>,
  tokens: ReadonlyArray<ThemeToken>,
  remBase = 16,
): BoxObservation[] {
  const idx = buildTokenValueIndex(tokens, remBase)
  const map = new Map<string, { prop: string; value: string; count: number }>()
  for (const s of samples) {
    const prop = canonicalProp(s.prop)
    const value = (s.value || '').trim()
    if (isEmptyStyleValue(value)) continue
    const key = `${prop}|${normalizeStyleValue(value, remBase)}`
    const e = map.get(key)
    if (e) e.count++
    else map.set(key, { prop, value, count: 1 })
  }
  const out: BoxObservation[] = []
  for (const e of Array.from(map.values())) {
    const tokenNames = matchTokensForValue(idx, e.value, remBase)
    out.push({
      prop: e.prop, label: explainProperty(e.prop), value: e.value,
      count: e.count, kind: propKind(e.prop), tokens: tokenNames,
    })
  }
  out.sort((a, b) =>
    (Number(b.tokens.length > 0) - Number(a.tokens.length > 0)) ||
    (b.count - a.count) ||
    a.prop.localeCompare(b.prop))
  return out
}

// ── W21: spridning – hur många CSS-referenser en token har (ren) ─────────────

/** Räkna `var(--token)`-referenser i en samling regel-texter. Ren → testad. */
export function countVarReferences(cssTexts: ReadonlyArray<string>, tokenName: string): number {
  const re = new RegExp('var\\(\\s*' + escapeRegExp(tokenName) + '(?![-\\w])', 'g')
  let n = 0
  for (const txt of cssTexts) {
    const m = txt.match(re)
    if (m) n += m.length
  }
  return n
}

// ── DOM-sida (tunna wrappers) ────────────────────────────────────────────────

const DT_PREFIX = '--dt-' // verktygets egen chrome – redigeras ALDRIG i css-editorn.

/** Selektor-test: deklareras token:en på sidans rot (`:root`/`html`/`[data-theme]`)? */
function isRootSelector(sel: string): boolean {
  const s = sel.trim().toLowerCase()
  return (
    /(^|,)\s*:root\b/.test(s) ||
    s === ':root' ||
    /(^|,)\s*html\b/.test(s) ||
    /\[data-theme/.test(s)
  )
}

/**
 * Enumerera mål-sidans FAKTISKA tema-tokens generiskt: alla `--*` custom
 * properties som deklareras på sidans rot i laddade stylesheets, klassade ur sina
 * effektiva värden. Verktygets egen chrome (`--dt-*`) hoppas över. App-agnostiskt:
 * ingen token-lista är hårdkodad – vi läser precis det DEN sidan definierar.
 */
export function enumerateThemeTokens(): ThemeToken[] {
  if (typeof document === 'undefined') return []
  const names = new Set<string>()
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue } // cross-origin → hoppa
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue
      if (!isRootSelector(rule.selectorText || '')) continue
      const style = rule.style
      for (let i = 0; i < style.length; i++) {
        const prop = style[i]
        if (!prop.startsWith('--') || prop.startsWith(DT_PREFIX)) continue
        names.add(prop)
      }
    }
  }
  const root = getComputedStyle(document.documentElement)
  const out: ThemeToken[] = []
  for (const name of Array.from(names)) {
    const value = root.getPropertyValue(name).trim()
    if (!value) continue
    out.push({ name, value, kind: classifyToken(name, value) })
  }
  // Stabil ordning: färger först (störst tweak-nytta), sedan radie/längd/font, per namn.
  const order: Record<TweakKind, number> = { color: 0, radius: 1, length: 2, font: 3, number: 4, shadow: 5, other: 6 }
  out.sort((a, b) => (order[a.kind] - order[b.kind]) || a.name.localeCompare(b.name))
  return out
}

/** Skriv ett token-värde LIVE på document-roten (högsta specificitet → cascadar). */
export function applyTweak(name: string, value: string): void {
  if (typeof document === 'undefined' || name.startsWith(DT_PREFIX)) return
  document.documentElement.style.setProperty(name, value)
}

/** Ta bort en live-override → token faller tillbaka till stylesheet-värdet. */
export function clearTweak(name: string): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.removeProperty(name)
}

/** Läs ett tokens nuvarande EFFEKTIVA värde (inkl. ev. live-override). */
export function readEffective(name: string): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// ── W21: spridnings-räkning (DOM-wrapper kring countVarReferences) ────────────

/** Samla cssText för alla same-origin regler (för spridnings-räkning). */
function collectRuleTexts(): string[] {
  if (typeof document === 'undefined') return []
  const out: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue } // cross-origin → hoppa
    for (const rule of Array.from(rules)) out.push(rule.cssText)
  }
  return out
}

/**
 * Hur många CSS-referenser (`var(--x)`) varje token har på DEN HÄR sidan. Räckvidd
 * = aktuell sidas laddade stylesheets (ärligt: inte hela appen – cross-origin/andra
 * rutter räknas inte).
 */
export function tokenReferenceCounts(names: ReadonlyArray<string>): Record<string, number> {
  const texts = collectRuleTexts()
  const out: Record<string, number> = {}
  for (const n of names) out[n] = countVarReferences(texts, n)
  return out
}

// ── W18: läs computed styles för elementen i en dragen ruta (DOM-wrapper) ─────

export interface BoxRect { x: number; y: number; w: number; h: number }

// Computed-longhands vi läser per element (canonicalProp kollapsar dem sedan).
const BOX_READ_PROPS = [
  'color', 'background-color',
  'border-radius',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'column-gap', 'row-gap',
  'box-shadow',
]

/** Ett fångat element i rutan: DOM-ref + dess observerade (kanoniska prop, värde)-par. */
export interface BoxElement { el: HTMLElement; props: { prop: string; value: string }[] }

/** review 4e: räknas elementets rect som HELT innesluten i den dragna rutan? (inte
 *  bara skärande). Ren geometri → enhetstestad; används av collectBoxSamples. */
export function rectFullyInside(
  box: BoxRect,
  r: { left: number; top: number; right: number; bottom: number },
): boolean {
  return r.left >= box.x && r.top >= box.y && r.right <= box.x + box.w && r.bottom <= box.y + box.h
}

/**
 * Läs elementen som skär rutan (skärm-koord) + deras (KANONISKA prop, value)-par.
 * Chrome (verktygets egen UI) filtreras via isChrome. remBase = sidans rot-
 * fontstorlek så rem-tokens kan matchas mot computed px. `samples` = alla par platt
 * (för summarizeBoxProps); `elements` = per-element-fångst (för element-SCOPAD
 * redigering: en ändring skrivs inline BARA på rutans element, inte den globala
 * token:en). Ren mappning/klassning sker i summarizeBoxProps; detta är DOM-avläsning.
 */
export function collectBoxSamples(
  rect: BoxRect,
  root: HTMLElement | null,
  isChrome: (el: Element) => boolean,
  cap = 500,
): { samples: { prop: string; value: string }[]; elements: BoxElement[]; remBase: number; elementCount: number } {
  const samples: { prop: string; value: string }[] = []
  const elements: BoxElement[] = []
  if (typeof document === 'undefined') return { samples, elements, remBase: 16, elementCount: 0 }
  const remBase = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const scope = root ?? document.body
  const all = Array.from(scope.querySelectorAll('*')) as HTMLElement[]
  let count = 0
  for (const el of all) {
    if (count >= cap) break
    if (isChrome(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    // Bara element som HELT ryms i den dragna rutan (Andreas review 4e): drar man
    // en ruta runt kompassrosen ska man inte få inställningar för bakgrunden i
    // behållaren bakom (som bara delvis skär rutan). Fullständig inneslutning.
    if (!rectFullyInside(rect, r)) continue
    count++
    const cs = getComputedStyle(el)
    // Per-element-par (kanoniska prop → värde) så en scopad ändring vet exakt vilka
    // element den ska skriva inline-stil på (canonicalProp kollapsar longhands).
    const props: { prop: string; value: string }[] = []
    for (const p of BOX_READ_PROPS) {
      const v = cs.getPropertyValue(p)
      if (v) { samples.push({ prop: p, value: v }); props.push({ prop: canonicalProp(p), value: v }) }
    }
    // Ram-färg/-tjocklek bara om det FINNS en ram (annars ärver border-color
    // textfärgen på varje element → brus).
    const bw = parseFloat(cs.getPropertyValue('border-top-width')) || 0
    if (bw > 0) {
      const btw = cs.getPropertyValue('border-top-width'), btc = cs.getPropertyValue('border-top-color')
      samples.push({ prop: 'border-top-width', value: btw }); props.push({ prop: 'border-width', value: btw })
      samples.push({ prop: 'border-top-color', value: btc }); props.push({ prop: 'border-color', value: btc })
    }
    elements.push({ el, props })
  }
  return { samples, elements, remBase, elementCount: count }
}

// ── R7: element-SCOPAD css-redigering (dra-ruta) – ren mappnings-logik ────────
// I ruta-läget ska en ändring bara träffa rutans element, inte den globala token:en.
// Editorn identifierar en rad via en stabil nyckel (prop + representativt värde); här
// är den rena logiken som (a) bygger nyckeln och (b) väljer vilka fångade element en
// rad-ändring ska skrivas på. Testas syntetiskt (ingen DOM).

/** Stabil nyckel för en ruta-observation (rad i editorn): kanonisk prop + originalvärde. */
export function boxEditKey(prop: string, value: string): string {
  return `${prop}|${(value || '').trim().toLowerCase()}`
}

/**
 * Vilka element (index i `elements`) en scopad ändring av (prop, value) ska träffa:
 * de vars kanoniska prop har SAMMA normaliserade värde. Så editering av "Bakgrund
 * #fff" bara rör de element i rutan som faktiskt hade den bakgrunden (matchar radens
 * count), inte grannar med annan bakgrund. Ren → enhetstestad.
 */
export function boxTargetIndices(
  elements: ReadonlyArray<{ props: ReadonlyArray<{ prop: string; value: string }> }>,
  prop: string,
  value: string,
  remBase = 16,
): number[] {
  const target = normalizeStyleValue(value, remBase)
  const out: number[] = []
  elements.forEach((e, i) => {
    if (e.props.some((p) => p.prop === prop && normalizeStyleValue(p.value, remBase) === target)) out.push(i)
  })
  return out
}

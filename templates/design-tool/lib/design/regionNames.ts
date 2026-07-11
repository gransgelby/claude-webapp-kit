// Vettiga regionsnamn (Design mode v2 · A3).
//
// Wireframen är en GENERELL designvy – regionsnamn ska beskriva strukturen
// ("Lämplighetsanalys", "Karta", "Foto"), aldrig instansdata ("7.7/10", "1/3",
// "Hudiksvall kommun"). Namnet härleds generiskt ur innehållet, i prioritets-
// ordning:
//
//   1. aria-label / aria-labelledby (elementets egna)
//   2. rubriker h1–h6 (h1 = sidans titel ⇒ alltid "Sidrubrik" – en h1 bär
//      nästan alltid instansdata; h2–h6 ger sin STATISKA rubriktext)
//   3. <legend>/<caption>/<figcaption>
//   4. landmark-roll/tagg (nav/form/table/… ⇒ typnamn)
//   5. typografiska etiketter ([class*=font-medium/semibold/bold], dokument-
//      ordning – fångar stat-rutors etikettrad före deras dynamiska värde)
//   6. alt-text (dominant bild)
//   7. typ-beskrivning ur innehållet ("Karta", "Foto", "Diagram", "Lista" …)
//   8. kort text-snutt (ordgräns) ur icke-interaktiv brödtext
//   9. uppringarens fallback ("Område N")
//
// INSTANSDATA-STRIPPNING är heuristisk, aldrig hårdkodade strängar: tokens med
// siffror kapas i namnets början/slut ("Medianinkomst 2023" → "Medianinkomst",
// "Fastighetsfoto 1 av 3" → "Fastighetsfoto"), och kandidater som är rena tal/
// enheter/betyg ("7.7/10", "865kWh/m²", "S") refuseras helt.
//
// Arkitektur som regionModel.ts: REN kärna överst (plain data, node-testbar),
// DOM-läsning isolerad längst ned.

// ── Typer ────────────────────────────────────────────────────────────────────

export type CandidateKind = 'aria' | 'heading' | 'caption' | 'label' | 'alt'

export interface NameCandidate {
  kind: CandidateKind
  /** Rubriknivå (1–6) när kind är 'heading'. */
  level?: number
  /** Direkta textnoder (rubrikens statiska kärna – dynamiska barn-spans ingår ej). */
  own: string
  /** Hela textinnehållet (fallback när own är tom). */
  full: string
}

/** Rent sammandrag av regionens innehåll (för typ-fallback). */
export interface ContentFacts {
  /** Karta: klassnamn innehåller "map" (maplibre/mapbox/leaflet/…) + canvas finns. */
  mapLike: boolean
  /** Största bild/canvas/svg som andel av regionens yta. */
  imgFrac: number
  canvasFrac: number
  svgFrac: number
  table: boolean
  form: boolean
  nav: boolean
  /** Lista (ul/ol) med ≥3 poster. */
  list: boolean
  /** Text utanför interaktiva element (för snutt-fallback). */
  bodyText: string
}

export const EMPTY_FACTS: ContentFacts = {
  mapLike: false, imgFrac: 0, canvasFrac: 0, svgFrac: 0,
  table: false, form: false, nav: false, list: false, bodyText: '',
}

/** Namnet för regionen som bär sidans h1 (sidtiteln är per definition instansdata). */
export const PAGE_TITLE_NAME = 'Sidrubrik'

const MAX_NAME = 28

// ── Instansdata-strippning (ren) ─────────────────────────────────────────────

const hasDigit = (s: string): boolean => /\d/.test(s)
// Bokstavsklasser utan unicode-flaggan (ts-target es5): latin + latin-1 (å/ä/ö/é …).
const LETTER_RE = /[A-Za-zÀ-ÖØ-öø-ÿ]/
const LETTERS_G = /[A-Za-zÀ-ÖØ-öø-ÿ]/g
const UPPER_RE = /[A-ZÀ-ÖØ-Þ]/
const letterCount = (s: string): number => (s.match(LETTERS_G) ?? []).length

/**
 * Rensa en rå namn-kandidat: kollapsa whitespace, kapa ledande/avslutande
 * tokens med siffror (år, mätvärden, räknare) + kvarlämnade korta bindeord
 * ("av", "of") intill det kapade. Returnerar '' om inget begripligt statiskt
 * namn återstår (t.ex. "7.7/10", "1/3", "S", "19.6%").
 */
export function cleanName(raw: string): string {
  const tokens = raw.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  let a = 0
  let b = tokens.length
  // Kapa siffer-tokens från kanterna (aldrig mitten: "Fritidshus vs boende 2024").
  let strippedLead = false
  let strippedTail = false
  while (a < b && hasDigit(tokens[a])) { a++; strippedLead = true }
  while (b > a && hasDigit(tokens[b - 1])) { b--; strippedTail = true }
  // Orphan-bindeord (≤2 tecken) som blev kant av kapningen: "Foto 1 av 3" → "Foto".
  while (strippedLead && a < b && letterCount(tokens[a]) <= 2 && tokens[a].length <= 2) a++
  while (strippedTail && b > a && letterCount(tokens[b - 1]) <= 2 && tokens[b - 1].length <= 2) b--
  let out = tokens.slice(a, b).join(' ')
  out = out.replace(/[·•|:;,]+$/g, '').replace(/^[·•|:;,]+/g, '').trim()
  // Enhets-rest: kort gemener-text som satt ihop med ett kapat tal ("336 tkr/år"
  // → "tkr/år", "12 kr/mån" → "kr/mån") är en enhet, inget namn.
  if ((strippedLead || strippedTail) && !UPPER_RE.test(out) && letterCount(out) <= 8) return ''
  // Giltighet: minst ett ord med ≥3 bokstäver och totalt ≥3 bokstäver.
  if (letterCount(out) < 3) return ''
  if (!out.split(' ').some((t) => letterCount(t) >= 3)) return ''
  if (hasDigit(out)) return '' // siffror kvar i mitten ⇒ instansdata-aktigt, refusera
  return out.length > MAX_NAME ? truncAtWord(out, MAX_NAME) : out
}

/** Kapa vid ordgräns + ellips. */
function truncAtWord(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp >= 8 ? cut.slice(0, sp) : cut).trimEnd() + '…'
}

// ── Namnval ur kandidater (ren) ──────────────────────────────────────────────

const KIND_ORDER: CandidateKind[] = ['aria', 'heading', 'caption', 'label', 'alt']
// SLOT-ordning (A3 · R8a): en SLOT är en yta UTAN egen visuell identitet (t.ex.
// hero-blockets vänsterkolumn med adress/pris/fält). Att skrapa dess första
// font-semibold-etikett ("Gård") eller sidtiteln (h1 → "Sidrubrik") ger ett
// missvisande namn – slotten är HELA innehållskolumnen, inte dess första chip.
// Därför: bara aria + äkta under-rubrik (h2–h6) räknas; annars roll ur innehåll
// (slotRoleName → "Faktaspalt"/"Bildspel"/…).
const SLOT_KIND_ORDER: CandidateKind[] = ['aria', 'heading', 'caption']

export interface NameOpts { slot?: boolean }

/**
 * Välj namn ur kandidaterna i prioritetsordning (aria → rubrik → caption →
 * etikett → alt); inom varje sort gäller given ordning (= dokumentordning).
 * h1 ⇒ PAGE_TITLE_NAME (men för en SLOT hoppas h1 över – slotten är kolumnen,
 * inte titeln). Kandidater vars text är instansdata hoppas över – så stat-rutans
 * "994" faller igenom till etikettraden "Befolkning".
 */
export function pickName(cands: NameCandidate[], opts: NameOpts = {}): string | null {
  for (const kind of (opts.slot ? SLOT_KIND_ORDER : KIND_ORDER)) {
    for (const c of cands) {
      if (c.kind !== kind) continue
      if (c.kind === 'heading' && c.level === 1) {
        if (opts.slot) continue // slot som bär sidtiteln = innehållskolumn, ej "titeln"
        return PAGE_TITLE_NAME
      }
      const name = cleanName(c.own) || cleanName(c.full)
      if (name) return name
    }
  }
  return null
}

// ── Landmark-/typ-namn (rena) ────────────────────────────────────────────────

const LANDMARK_BY_TAG: Record<string, string> = {
  nav: 'Navigering', form: 'Formulär', table: 'Tabell', figure: 'Figur',
  header: 'Sidhuvud', footer: 'Sidfot', aside: 'Sidopanel', main: 'Innehåll',
}
const LANDMARK_BY_ROLE: Record<string, string> = {
  navigation: 'Navigering', form: 'Formulär', search: 'Sök', banner: 'Sidhuvud',
  contentinfo: 'Sidfot', complementary: 'Sidopanel', toolbar: 'Verktygsrad', dialog: 'Dialog',
}

/** Typnamn ur elementets egen tagg/roll (landmark) – eller null. */
export function landmarkName(tag: string, role: string | null): string | null {
  if (role && LANDMARK_BY_ROLE[role]) return LANDMARK_BY_ROLE[role]
  return LANDMARK_BY_TAG[tag] ?? null
}

/** Typnamn ur innehållet ("Karta", "Foto", "Diagram" …) – eller null. */
export function typeName(f: ContentFacts): string | null {
  if (f.mapLike) return 'Karta'
  if (f.imgFrac >= 0.45) return 'Foto'
  if (f.svgFrac >= 0.35) return 'Diagram'
  if (f.canvasFrac >= 0.35) return 'Grafik'
  if (f.table) return 'Tabell'
  if (f.form) return 'Formulär'
  if (f.nav) return 'Navigering'
  if (f.list) return 'Lista'
  return null
}

/** Roll-namn för en SLOT ur dess innehåll (A3 · R8a): bild-dominerad kolumn =
 *  "Bildspel", karta = "Karta", … och en text-/fält-tung kolumn utan egen rubrik
 *  = "Faktaspalt". Generiskt ur innehåll/roll (aldrig instansdata). */
export function slotRoleName(f: ContentFacts): string | null {
  if (f.mapLike) return 'Karta'
  if (f.imgFrac >= 0.3) return 'Bildspel'
  if (f.svgFrac >= 0.35) return 'Diagram'
  if (f.canvasFrac >= 0.35) return 'Grafik'
  if (f.table) return 'Tabell'
  if (f.form) return 'Formulär'
  if (f.list) return 'Lista'
  if (letterCount(f.bodyText) >= 12) return 'Faktaspalt'
  return null
}

/** Kort begriplig text-snutt (ordgräns) ur brödtext – eller null. */
export function snippetName(bodyText: string, max = 24): string | null {
  const t = bodyText.replace(/\s+/g, ' ').trim()
  if (!LETTER_RE.test(t.charAt(0)) || letterCount(t) < 3) return null
  const s = truncAtWord(t, max).replace(/[·•|:;,]+$/g, '').replace(/[·•|:;,]+(…?)$/g, '$1')
  return letterCount(s) >= 3 ? s : null
}

/** Hela kedjan (ren): kandidater → landmark → typ/roll → snutt → fallback.
 *  För en SLOT (opts.slot) används slot-kedjan: rubrik-/etikett-skrap hoppas
 *  över till förmån för roll ur innehållet (Faktaspalt/Bildspel/…) – R8a. */
export function regionName(
  cands: NameCandidate[],
  tag: string,
  role: string | null,
  facts: ContentFacts,
  fallback: string,
  opts: NameOpts = {},
): string {
  if (opts.slot) {
    return (
      pickName(cands, opts)
      ?? landmarkName(tag, role)
      ?? slotRoleName(facts)
      ?? snippetName(facts.bodyText)
      ?? fallback
    )
  }
  return (
    pickName(cands)
    ?? landmarkName(tag, role)
    ?? typeName(facts)
    ?? snippetName(facts.bodyText)
    ?? fallback
  )
}

// ── DOM-läsning (isolerad – bygger kandidater/fakta ur riktiga element) ──────

const INTERACTIVE_SEL = 'button, a, select, option, input, textarea, summary, label'

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.width >= 2 && r.height >= 2
}

/** Kandidat får inte bo i verktygets egen DOM eller i en interaktiv kontroll. */
function eligible(el: Element, root: Element): boolean {
  if (el.closest('[data-design-tool]')) return false
  const inter = el.closest(INTERACTIVE_SEL)
  if (inter && inter !== root && root.contains(inter)) return false
  return isVisible(el)
}

/** Direkta textnoder (rubrikens statiska kärna). */
function ownText(el: Element): string {
  let out = ''
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? ''
  }
  return out.replace(/\s+/g, ' ').trim()
}

const textOf = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

/** Samla namn-kandidater ur DOM:en (aria/rubriker/captions/etiketter/alt). */
export function collectCandidates(root: Element): NameCandidate[] {
  const out: NameCandidate[] = []
  const aria = root.getAttribute('aria-label')
  if (aria) out.push({ kind: 'aria', own: aria, full: aria })
  const labelledby = root.getAttribute('aria-labelledby')
  if (labelledby) {
    for (const id of labelledby.split(/\s+/)) {
      const ref = root.ownerDocument?.getElementById(id)
      if (ref) out.push({ kind: 'aria', own: textOf(ref), full: textOf(ref) })
    }
  }
  const push = (kind: CandidateKind, sel: string, cap: number, level?: (e: Element) => number) => {
    let n = 0
    for (const el of Array.from(root.querySelectorAll(sel))) {
      if (n >= cap) break
      if (!eligible(el, root)) continue
      out.push({ kind, level: level?.(el), own: ownText(el), full: textOf(el) })
      n++
    }
  }
  push('heading', 'h1, h2, h3, h4, h5, h6', 8, (e) => Number(e.tagName[1]))
  push('caption', 'legend, caption, figcaption', 4)
  push('label', '[class*="font-medium"], [class*="font-semibold"], [class*="font-bold"]', 12)
  // Alt-text: största synliga bilden med alt.
  let best: { alt: string; area: number } | null = null
  for (const img of Array.from(root.querySelectorAll('img[alt]'))) {
    if (!eligible(img, root)) continue
    const alt = img.getAttribute('alt') ?? ''
    if (!alt.trim()) continue
    const r = img.getBoundingClientRect()
    const area = r.width * r.height
    if (!best || area > best.area) best = { alt, area }
  }
  if (best) out.push({ kind: 'alt', own: best.alt, full: best.alt })
  return out
}

/** Samla innehålls-fakta ur DOM:en (för typ-fallback + snutt). */
export function collectFacts(root: Element): ContentFacts {
  const rr = root.getBoundingClientRect()
  const area = Math.max(1, rr.width * rr.height)
  const maxFrac = (sel: string): number => {
    let m = 0
    for (const el of Array.from(root.querySelectorAll(sel))) {
      if (el.closest('[data-design-tool]')) continue
      const r = el.getBoundingClientRect()
      m = Math.max(m, (r.width * r.height) / area)
    }
    return m
  }
  const canvasFrac = maxFrac('canvas')
  const list = Array.from(root.querySelectorAll('ul, ol')).some((l) => l.children.length >= 3)
  // Brödtext utanför interaktiva element (för snutt-fallback).
  let bodyText = ''
  const doc = root.ownerDocument
  if (doc) {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while (bodyText.length < 80) {
      const n = walker.nextNode()
      if (!n) break
      const p = n.parentElement
      if (!p || !eligible(p, root)) continue
      bodyText += (n.textContent ?? '') + ' '
    }
  }
  return {
    mapLike: !!root.querySelector('[class*="map" i]') && canvasFrac > 0,
    imgFrac: maxFrac('img'),
    canvasFrac,
    svgFrac: maxFrac('svg'),
    table: !!root.querySelector('table'),
    form: !!root.querySelector('form'),
    nav: !!root.querySelector('nav'),
    list,
    bodyText: bodyText.trim(),
  }
}

/** Bekvämlighet: namnge ett riktigt element i ett svep. `opts.slot` → slot-kedjan. */
export function nameForElement(el: Element, fallback: string, opts: NameOpts = {}): string {
  return regionName(
    collectCandidates(el),
    el.tagName.toLowerCase(),
    el.getAttribute('role'),
    collectFacts(el),
    fallback,
    opts,
  )
}

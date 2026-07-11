// Platshållar-modell (Design mode v2.1 · R14).
//
// Wireframen visade tidigare bara TOMMA lådor – rubriker, knappar, textrader och
// fristående bilder som sitter I eller MELLAN lådorna saknades, så spegeln var
// svår att känna igen vid blickväxling. Den här modulen plockar ut sådana
// "atomer" ur en regions DOM och klassar dem generiskt (ur elementtyp/roll):
//
//   • rubrik (h1–h6)            → större textrad-markör
//   • knapp/länk (interaktiv)   → REKTANGULÄR knapp-markör (V4: aldrig piller)
//   • textrad/etikett/stycke    → mörk liten stapel
//   • bild/ikon/graf (media)    → lugn ruta (V5: ingen diagonal)
//
// V4 (FW2): platshållarna ritas rektangulära (max ~1px hörn). Bara element som
// FAKTISKT är cirklar i sidan (t.ex. en kompassros) representeras runda – det
// avgörs GENERISKT ur elementets renderade geometri (isCircular: nära-kvadratisk
// + hörnradie ≥ ~40 % av kortsidan), aldrig ur sid-specifika selektorer.
//
// App-agnostiskt: ingen sid-specifik logik. Klassaren är REN (node-testbar);
// DOM-läsningen är isolerad längst ned och stannar vid nästlade under-regioner
// (de ritas som egna lådor) så inget dubbel-representeras.

// ── Typer + ren klassare ─────────────────────────────────────────────────────

export type AtomKind = 'heading' | 'button' | 'text' | 'image'
export type AtomClass = AtomKind | 'recurse' | 'skip'

/** En platshållare, positionerad som FRAKTIONER av regionens ruta (0–1) så
 *  renderingen bara multiplicerar med lådans aktuella bredd/höjd – oberoende av
 *  wf-skala och höjd-packning. */
export interface Placeholder {
  kind: AtomKind
  fx: number
  fy: number
  fw: number
  fh: number
  /** V4: elementet är en FAKTISK cirkel i sidan (nära-kvadratisk + stor hörnradie)
   *  → representeras runt. Allt annat ritas rektangulärt. */
  round?: boolean
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const MEDIA_TAGS = new Set(['img', 'svg', 'canvas', 'video', 'picture'])
// Taggar som bär EN textrad/etikett (inga block-barn förväntas) → egen atom.
const TEXT_TAGS = new Set(['p', 'li', 'dt', 'dd', 'label', 'blockquote', 'figcaption', 'caption', 'td', 'th'])

export interface AtomSignals {
  tag: string
  /** button/a[href]/summary/input/select/textarea eller role=button. */
  interactive: boolean
  /** role="img" (ikon-wrappers utan img-tagg). */
  roleImg: boolean
  hasElementChildren: boolean
  hasText: boolean
}

/**
 * Klassa ETT element (rent): är det en atom (och vilken sort), ska vi gå NER i
 * det (recurse), eller hoppa över det (skip)? Prioritet: interaktiv → media →
 * rubrik → text-tagg → ren löv-text → annars gå ner.
 */
export function classifyAtom(s: AtomSignals): AtomClass {
  if (s.interactive) return 'button'
  if (MEDIA_TAGS.has(s.tag) || s.roleImg) return 'image'
  if (HEADING_TAGS.has(s.tag)) return 'heading'
  if (TEXT_TAGS.has(s.tag)) return s.hasText ? 'text' : 'skip'
  if (!s.hasElementChildren) return s.hasText ? 'text' : 'skip'
  return 'recurse'
}

/**
 * V4: läser elementets renderade geometri som en CIRKEL – nära-kvadratisk (kortaste
 * och längsta sidan inom ~1.4×) OCH en hörnradie som når minst ~40 % av kortsidan
 * (piller/cirkel). Rent geometriskt (app-agnostiskt) → en kompassros blir rund, en
 * avlång pill-knapp gör det inte. `radiusPx` = elementets faktiska hörnradie i px.
 */
export function isCircular(radiusPx: number, w: number, h: number): boolean {
  if (w <= 0 || h <= 0 || radiusPx <= 0) return false
  const short = Math.min(w, h)
  const long = Math.max(w, h)
  if (long / short > 1.4) return false
  return radiusPx >= short * 0.4
}

/** Tolka computed `border-top-left-radius` (px eller %) till px mot elementets box. */
export function radiusToPx(borderRadius: string, w: number, h: number): number {
  const n = parseFloat(borderRadius) || 0
  if (borderRadius.includes('%')) return (n / 100) * Math.min(w, h)
  return n
}

// ── DOM-läsning (isolerad) ───────────────────────────────────────────────────

export interface PlaceholderOpts {
  /** Max antal atomer per region (skydd mot patologiska träd). */
  max: number
  /** Minsta bredd/höjd (px) för att en atom ska räknas (filtrera bort prickar). */
  minW: number
  minH: number
}

export const DEFAULT_PLACEHOLDER_OPTS: PlaceholderOpts = { max: 26, minW: 12, minH: 5 }

const INTERACTIVE_SEL = 'button, summary, input, select, textarea'

function isInteractive(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (el.matches(INTERACTIVE_SEL)) return true
  if (tag === 'a' && el.hasAttribute('href')) return true
  if (el.getAttribute('role') === 'button') return true
  return false
}

/**
 * Läs ut platshållar-atomer ur en regions element. `isStop(el)` = true för
 * elementen som är EGNA under-regioner (de ritas som egna lådor) → deras
 * underträd hoppas över så inget dubbel-representeras. Koordinaterna returneras
 * som fraktioner av `regionEl`:s bounding-box.
 */
export function readPlaceholders(
  regionEl: Element,
  isStop: (el: Element) => boolean,
  opts: Partial<PlaceholderOpts> = {},
): Placeholder[] {
  const o = { ...DEFAULT_PLACEHOLDER_OPTS, ...opts }
  const rr = regionEl.getBoundingClientRect()
  if (rr.width < 2 || rr.height < 2) return []
  const out: Placeholder[] = []
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (out.length >= o.max) return
      if (c.hasAttribute('data-design-tool') || c.hasAttribute('data-dt-designmode')) continue
      if (isStop(c)) continue
      const cs = getComputedStyle(c)
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity || '1') < 0.05) continue
      const cls = classifyAtom({
        tag: c.tagName.toLowerCase(),
        interactive: isInteractive(c),
        roleImg: c.getAttribute('role') === 'img',
        hasElementChildren: c.childElementCount > 0,
        hasText: (c.textContent ?? '').trim().length > 0,
      })
      if (cls === 'recurse') { walk(c); continue }
      if (cls === 'skip') continue
      const r = c.getBoundingClientRect()
      if (r.width < o.minW || r.height < o.minH) continue
      // V4: bara FAKTISKA cirklar (nära-kvadratiska + stor hörnradie) ritas runda.
      const round = isCircular(radiusToPx(cs.borderTopLeftRadius || '0', r.width, r.height), r.width, r.height)
      out.push({
        kind: cls,
        fx: (r.left - rr.left) / rr.width,
        fy: (r.top - rr.top) / rr.height,
        fw: r.width / rr.width,
        fh: r.height / rr.height,
        round,
      })
    }
  }
  walk(regionEl)
  return out
}

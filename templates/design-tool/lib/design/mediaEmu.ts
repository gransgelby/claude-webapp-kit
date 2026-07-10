// Media-query-EMULERING för mobil-preview (Design mode v2 · A4).
//
// Design modes device-fönster krymper den riktiga sidan till 390px – men appens
// responsiva CSS (Tailwind-breakpoints m.fl.) är MEDIA QUERIES mot *webbläsar-
// fönstret*, inte mot elementbredden. Utan emulering renderas den krympta sidan
// alltså fortfarande med desktop-regler (xl:-kolumner i 390px = kvävd röra).
//
// Lösningen är generisk och app-agnostisk: gå igenom dokumentets stylesheets och
// SKRIV OM varje bredd-styrd @media-regel så att den matchar som om fönstret vore
// `widthPx` brett ('all' / 'not all'); återställ exakt vid avslut. Regler med
// icke-bredd-villkor (prefers-*, hover, print …) lämnas orörda – vi ändrar bara
// det vi säkert kan utvärdera.
//
// Arkitektur som regionModel/regionNames: REN kärna (evalMediaAtWidth – node-
// testbar parser/utvärderare) + isolerad DOM-applicering längst ned.

// ── Ren kärna: utvärdera en media-lista vid en given bredd ───────────────────

/** Tolka en CSS-längd (px/rem/em) till px – eller null om o-tolkbar. */
export function parseCssLength(s: string, remPx: number): number | null {
  const m = /^\s*(-?[\d.]+)\s*(px|rem|em)\s*$/i.exec(s)
  if (!m) return null
  const v = parseFloat(m[1])
  if (!isFinite(v)) return null
  const unit = m[2].toLowerCase()
  return unit === 'px' ? v : v * remPx
}

type Tri = boolean | null

/** Utvärdera EN feature-parentes, t.ex. "(min-width: 1024px)" eller
 *  "(width >= 40rem)". true/false om bredd-styrd, null om o-utvärderbar. */
function evalFeature(feat: string, w: number, remPx: number): Tri {
  const inner = feat.trim().replace(/^\(|\)$/g, '').trim()
  // Klassisk form: min-width/max-width/width: <längd>
  let m = /^(min-width|max-width|width)\s*:\s*(.+)$/i.exec(inner)
  if (m) {
    const px = parseCssLength(m[2], remPx)
    if (px == null) return null
    const kind = m[1].toLowerCase()
    if (kind === 'min-width') return w >= px
    if (kind === 'max-width') return w <= px
    return w === px
  }
  // Range-form: width >= X · width < X · X <= width <= Y
  m = /^(.+?)\s*(<=|>=|<|>)\s*width\s*(<=|>=|<|>)\s*(.+)$/i.exec(inner)
  if (m) {
    const lo = parseCssLength(m[1], remPx)
    const hi = parseCssLength(m[4], remPx)
    if (lo == null || hi == null) return null
    const loOk = m[2] === '<=' ? lo <= w : m[2] === '<' ? lo < w : m[2] === '>=' ? lo >= w : lo > w
    const hiOk = m[3] === '<=' ? w <= hi : m[3] === '<' ? w < hi : m[3] === '>=' ? w >= hi : w > hi
    return loOk && hiOk
  }
  m = /^width\s*(<=|>=|<|>)\s*(.+)$/i.exec(inner)
  if (m) {
    const px = parseCssLength(m[2], remPx)
    if (px == null) return null
    return m[1] === '<=' ? w <= px : m[1] === '<' ? w < px : m[1] === '>=' ? w >= px : w > px
  }
  m = /^(.+?)\s*(<=|>=|<|>)\s*width$/i.exec(inner)
  if (m) {
    const px = parseCssLength(m[1], remPx)
    if (px == null) return null
    return m[2] === '<=' ? px <= w : m[2] === '<' ? px < w : m[2] === '>=' ? px >= w : px > w
  }
  return null // icke-bredd-feature (hover, prefers-*, orientation …)
}

/** Utvärdera EN media-query ("screen and (min-width: 1024px)"). */
function evalQuery(q: string, w: number, remPx: number): Tri {
  let rest = q.trim()
  if (!rest) return null
  if (/^not\b/i.test(rest)) return null // "not …" lämnas orörd (säkert > smart)
  rest = rest.replace(/^only\s+/i, '')
  // Medietyp först?
  const typeM = /^(all|screen|print|speech)\b\s*(?:and\s*)?/i.exec(rest)
  if (typeM) {
    const t = typeM[1].toLowerCase()
    if (t === 'print' || t === 'speech') return false // vi emulerar en skärm
    rest = rest.slice(typeM[0].length).trim()
    if (!rest) return true // bara "screen"/"all"
  }
  // Features separerade med "and" (split på toppnivå – features är parenteser).
  const feats = rest.split(/\)\s*and\s*\(/i).map((f, i, arr) => {
    let s = f
    if (i > 0) s = '(' + s
    if (i < arr.length - 1) s = s + ')'
    return s
  })
  let sawNull = false
  for (const f of feats) {
    const v = evalFeature(f, w, remPx)
    if (v === false) return false // "and" med false är false oavsett resten
    if (v === null) sawNull = true
  }
  return sawNull ? null : true
}

/**
 * Utvärdera en hel media-lista (kommaseparerad = ELLER) som om fönstret vore
 * `widthPx` brett. Returnerar:
 *   true  – listan matchar säkert vid bredden  (⇒ kan skrivas om till 'all')
 *   false – listan matchar säkert INTE         (⇒ kan skrivas om till 'not all')
 *   null  – innehåller villkor vi inte kan utvärdera (⇒ rör inte regeln)
 */
export function evalMediaAtWidth(mediaText: string, widthPx: number, remPx = 16): Tri {
  const text = (mediaText || '').trim()
  if (!text || text === 'all') return true
  if (text === 'not all') return false
  let sawNull = false
  for (const q of text.split(',')) {
    const v = evalQuery(q, widthPx, remPx)
    if (v === true) return true // ELLER: en säker träff räcker
    if (v === null) sawNull = true
  }
  return sawNull ? null : false
}

// ── DOM-applicering (isolerad) ───────────────────────────────────────────────

interface Patched { media: MediaList; original: string }

function walkRules(rules: CSSRuleList, w: number, remPx: number, out: Patched[]) {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i] as CSSRule & { media?: MediaList; cssRules?: CSSRuleList }
    if (rule.type === CSSRule.MEDIA_RULE && rule.media) {
      const v = evalMediaAtWidth(rule.media.mediaText, w, remPx)
      if (v !== null) {
        const target = v ? 'all' : 'not all'
        if (rule.media.mediaText !== target) {
          out.push({ media: rule.media, original: rule.media.mediaText })
          rule.media.mediaText = target
        }
      }
    }
    if (rule.cssRules && rule.cssRules.length) walkRules(rule.cssRules, w, remPx, out)
  }
}

/**
 * Emulera att webbläsarfönstret är `widthPx` brett: skriv om alla säkert
 * bredd-styrda @media-regler i dokumentets stylesheets. Returnerar en
 * restore-funktion som återställer varje regel exakt. DesignTools egen CSS
 * ([data-design-tool] på ownerNode) lämnas orörd.
 */
export function emulateViewportWidth(doc: Document, widthPx: number): () => void {
  const remPx = parseFloat(doc.defaultView?.getComputedStyle(doc.documentElement).fontSize || '16') || 16
  const patched: Patched[] = []
  for (let i = 0; i < doc.styleSheets.length; i++) {
    const sheet = doc.styleSheets[i]
    const owner = sheet.ownerNode as Element | null
    if (owner && (owner.hasAttribute('data-design-tool') || owner.hasAttribute('data-dt-designmode'))) continue
    if (sheet.disabled) continue
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue } // cross-origin → rör ej
    walkRules(rules, widthPx, remPx, patched)
  }
  return () => {
    for (const p of patched) {
      try { p.media.mediaText = p.original } catch { /* regel borta (HMR) – ok */ }
    }
  }
}

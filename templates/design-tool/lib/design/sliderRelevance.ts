// Generisk härledning av vilka egenskaps-reglage som FAKTISKT ändrar något
// SYNLIGT för ett valt element (V13, nattjobb 2026-07-10). App-agnostiskt: bygger
// ENBART på elementets computed style + neutrala DOM-fakta – aldrig på selektorer,
// sid-flaggor (`demo=1`) eller app-specifika klassnamn. Därför fungerar den lika
// bra på fastighets-dashboarden som på vilken annan sida/webbapp som helst.
//
// Rationale: när man plockar en osynlig grupperings-container (ingen egen bakgrund/
// ram/skugga, ingen egen text) är de flesta reglage döda – att ändra hörnradie eller
// ramfärg syns inte alls. Vi visar bara de som gör verklig skillnad för PRECIS det
// elementet, och en ärlig förklaring när nästan inget är relevant.
//
// Ren funktion (`relevantProperties`) → billig, deterministisk, enhets-testad utan
// DOM. DOM-omslaget (`styleFactsFromElement`) läser computed style och delegerar.

export type PropKey =
  | 'color' | 'backgroundColor' | 'borderColor'
  | 'borderWidth' | 'borderRadius' | 'padding' | 'fontSize' | 'opacity'

/** Neutralt sammandrag av ett elements synliga karaktär (det den rena funktionen resonerar om). */
export interface StyleFacts {
  /** Renderar elementet EGEN (direkt) text? → text-relaterade reglage blir meningsfulla. */
  hasText: boolean
  /** Har elementet element-barn? → padding flyttar dem (synlig layout-ändring). */
  hasChildren: boolean
  /** Effektiv bakgrunds-alpha (0–1). > 0 ⇒ en synlig yta finns. */
  bgAlpha: number
  /** Största synliga rambredd i px. */
  borderWidth: number
  /** Ram-färgens alpha (0–1). */
  borderAlpha: number
  /** Har elementet en box-shadow (≠ none)? */
  hasShadow: boolean
  /** Klipper overflow (hidden/clip/auto/scroll)? → hörnradie syns då på innehållet. */
  clipsOverflow: boolean
}

const VISIBLE = 0.01

/**
 * Vilka reglage gör en SYNLIG skillnad för elementet? Ren funktion av `StyleFacts`.
 * Härlett generiskt:
 *  • text-färg/textstorlek → bara om elementet har egen text
 *  • bakgrund → bara om en yta redan finns eller elementet har egen text (kan tinta bakom text)
 *  • ram-färg → bara om en synlig ram redan finns
 *  • rambredd → om det finns en yta att rama in (eller egen text)
 *  • hörnradie → bara om något syns i hörnen (yta eller overflow-klipp)
 *  • padding → om det finns barn/text/yta att skjuta isär
 *  • opacitet → om elementet över huvud taget renderar något
 */
export function relevantProperties(f: StyleFacts): Set<PropKey> {
  const hasBg = f.bgAlpha > VISIBLE
  const hasBorder = f.borderWidth > 0 && f.borderAlpha > VISIBLE
  const hasSurface = hasBg || hasBorder || f.hasShadow
  const rendersSomething = f.hasText || f.hasChildren || hasSurface

  const out = new Set<PropKey>()
  if (f.hasText) { out.add('color'); out.add('fontSize') }
  if (hasBg || f.hasText) out.add('backgroundColor')
  if (hasBorder) out.add('borderColor')
  if (hasSurface || f.hasText) out.add('borderWidth')
  if (hasSurface || f.clipsOverflow) out.add('borderRadius')
  if (f.hasChildren || f.hasText || hasSurface) out.add('padding')
  if (rendersSomething) out.add('opacity')
  return out
}

/** Läs alpha ur en computed color-sträng (rgb/rgba/transparent). */
function alphaOf(color: string): number {
  const c = (color || '').trim()
  if (!c || c === 'transparent' || c === 'none') return 0
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (!m) return 1
  const parts = m[1].split(/[,\s/]+/).filter(Boolean)
  return parts[3] !== undefined ? parseFloat(parts[3]) : 1
}

/** DOM-omslag: bygg `StyleFacts` ur ett riktigt element (kräver en levande DOM). */
export function styleFactsFromElement(el: HTMLElement): StyleFacts {
  const cs = getComputedStyle(el)
  const hasText = Array.from(el.childNodes).some(
    (n) => n.nodeType === 3 /* TEXT_NODE */ && ((n.textContent || '').trim().length > 0),
  )
  const borderWidth = Math.max(
    parseFloat(cs.borderTopWidth) || 0, parseFloat(cs.borderRightWidth) || 0,
    parseFloat(cs.borderBottomWidth) || 0, parseFloat(cs.borderLeftWidth) || 0,
  )
  const overflow = `${cs.overflow} ${cs.overflowX} ${cs.overflowY}`
  return {
    hasText,
    hasChildren: el.children.length > 0,
    bgAlpha: alphaOf(cs.backgroundColor),
    borderWidth,
    borderAlpha: alphaOf(cs.borderTopColor),
    hasShadow: !!cs.boxShadow && cs.boxShadow !== 'none',
    clipsOverflow: /hidden|clip|auto|scroll/.test(overflow),
  }
}

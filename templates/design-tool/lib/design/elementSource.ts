// "Vad är det här?" – mappa ett valt element till KÄLLA (fil:rad) så gott det går
// (Post 5, nattjobb 2026-07-10).
//
// Två vägar, i fallande exakthet:
//   1. EXAKT (dev-bygget): React lägger `_debugSource {fileName,lineNumber}` på
//      fiber-noder i utvecklingsläge. Vi hittar elementets fiber via dess
//      `__reactFiber$…`-nyckel och klättrar `return`-kedjan tills en `_debugSource`
//      hittas. Detta är den riktiga JSX-positionen.
//   2. GISSNING (prod/minifierat): ingen `_debugSource` finns → vi faller tillbaka
//      på en tydligt märkt heuristik (komponentnamn ur fiber-typen + närmaste
//      data-attribut/`data-design-id`). UI:t säger uttryckligen att detta är en
//      gissning, inte en exakt källrad.
//
// Den rena delen (`shortenPath`, `heuristicSourceLabel`) är enhets-testad; själva
// fiber-avläsningen är best-effort och DOM-beroende.
import { describeNode, elementLabel, type NodeDesc } from './elementModel'

export interface ElementSource {
  /** Kort fil-sökväg (app/…, components/…) eller "(okänd)" vid gissning. */
  file: string
  line?: number
  column?: number
  /** true = exakt dev-källa (`_debugSource`); false = heuristisk gissning. */
  exact: boolean
  /** Komponentnamn om det gick att härleda. */
  component?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fiber = any

/** Korta ned en absolut byggsökväg till projektrelativ (app/…, components/…, lib/…). */
export function shortenPath(fileName: string): string {
  const m = fileName.match(/\/((?:app|components|lib|pages|src|hooks|features)\/.*)$/)
  if (m) return m[1]
  // Annars: sista två segmenten (…/dir/fil.tsx).
  const parts = fileName.split('/')
  return parts.slice(-2).join('/')
}

/** Heuristisk källetikett (gissning) ur ett elements sammandrag. */
export function heuristicSourceLabel(d: NodeDesc): string {
  if (d.designId) return `[data-design-id="${d.designId}"]`
  const otherData = d.dataAttrs.find((a) => a !== 'data-design-id')
  if (otherData) return `${d.tag}[${otherData}]`
  if (d.ariaLabel) return `${d.tag}[aria-label="${d.ariaLabel.slice(0, 32)}"]`
  return elementLabel(d)
}

/** Hämta React-fibern för ett DOM-element (dev + prod-nyckel-varianter). */
function getFiber(el: Element): Fiber | null {
  const key = Object.keys(el).find(
    (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return key ? (el as any)[key] ?? null : null
}

/** Härled ett komponentnamn ur en fiber (funktions-/klass-komponent). */
function fiberComponentName(f: Fiber): string | undefined {
  const t = f?.type
  if (!t) return undefined
  if (typeof t === 'string') return undefined // värd-element (div, span …)
  return t.displayName || t.name || undefined
}

/**
 * Mappa ett element till källa (fil:rad) så gott det går. Returnerar `null` bara
 * om elementet saknas. Annars alltid ett svar – exakt om `_debugSource` finns,
 * annars en tydligt märkt gissning.
 */
export function sourceForElement(el: Element | null): ElementSource | null {
  if (!el) return null
  const fiber = getFiber(el)
  // (1) Exakt: klättra fiber.return tills en _debugSource dyker upp.
  let f: Fiber | null = fiber
  let component: string | undefined
  for (let i = 0; i < 40 && f; i++) {
    if (!component) component = fiberComponentName(f)
    const src = f._debugSource
    if (src && src.fileName) {
      return {
        file: shortenPath(src.fileName),
        line: src.lineNumber,
        column: src.columnNumber,
        exact: true,
        component: component || fiberComponentName(f),
      }
    }
    f = f.return
  }
  // (2) Gissning: komponentnamn (om någon) + heuristisk selektor.
  return {
    file: '(okänd källa)',
    exact: false,
    component: component || heuristicSourceLabel(describeNode(el)),
  }
}

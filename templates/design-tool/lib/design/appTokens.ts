// DOM-sidan av den token-medvetna egenskaps-panelen (Post 4). Läser appens
// `--c-*`-tokens från `:root`, skriver ett nytt värde LIVE (så hela appen skiftar),
// och räknar hur många element på sidan som faktiskt renderar en viss färg
// ("används på N ställen"). Ren färg-/WCAG-matte ligger i colorUtils.ts (testad).
//
// Appens tokens är RGB-tripletter (`--c-slate-900: 15 23 42`) som konsumeras via
// `rgb(var(--c-slate-900))`. Därför: läs triplett → visa som hex i pickern; skriv
// tillbaka triplett när token redigeras. En live-redigering sätts som inline-var
// på `<html>` (document.documentElement) → högre specificitet än stylesheet-`:root`
// → cascadar till varje element som använder token:en. Revert = removeProperty.

import { parseColor, rgbToHex, sameRGB, type TokenEntry } from './colorUtils'
import { DT_CONFIG, dtKey } from './dtConfig'

const COLOR_PROPS = ['color', 'backgroundColor', 'borderColor'] as const
export type ColorProp = (typeof COLOR_PROPS)[number]

/** Läs alla `--c-*`-tokens från `:root` → [{name, raw, hex}] (bara färg-tripletter). */
export function readAppTokens(): TokenEntry[] {
  if (typeof document === 'undefined') return []
  const out: TokenEntry[] = []
  const seen = new Set<string>()
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue } // cross-origin → hoppa
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue
      const sel = rule.selectorText || ''
      if (!/(^|,)\s*:root\b/.test(sel) && sel.trim() !== ':root') continue
      const style = rule.style
      for (let i = 0; i < style.length; i++) {
        const prop = style[i]
        if (!prop.startsWith(DT_CONFIG.tokenPrefix) || seen.has(prop)) continue
        // Läs det *effektiva* värdet från :root (fångar tema-override).
        const raw = getComputedStyle(document.documentElement).getPropertyValue(prop).trim()
        const c = parseColor(raw)
        if (!c) continue
        seen.add(prop)
        out.push({ name: prop, raw, hex: rgbToHex(c) })
      }
    }
  }
  return out
}

/** Läs ett enskilt tokens aktuella värde (triplett) från `:root`. */
export function readToken(name: string): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Skriv ett token-värde LIVE (accepterar hex eller triplett → lagras som triplett). */
export function writeTokenLive(name: string, value: string): void {
  if (typeof document === 'undefined') return
  const c = parseColor(value)
  const triplet = c ? `${c.r} ${c.g} ${c.b}` : value
  document.documentElement.style.setProperty(name, triplet)
}

/** Ta bort en live-override → token faller tillbaka till stylesheet-värdet. */
export function clearTokenLive(name: string): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.removeProperty(name)
}

/**
 * Räkna element på sidan vars computed `prop` matchar `hex`. Detta är "används på
 * N ställen": ett direkt, ärligt mått på hur många ställen en färg-token slår
 * igenom på (det som skiftar live när token:en redigeras). Hoppar över verktygets
 * egen chrome (`[data-design-tool]`).
 */
export function countUsage(prop: ColorProp, hex: string): number {
  if (typeof document === 'undefined') return 0
  const target = parseColor(hex)
  if (!target) return 0
  let n = 0
  const all = document.body.querySelectorAll('*')
  all.forEach((node) => {
    const el = node as HTMLElement
    if (el.closest('[data-design-tool]') || el.closest('[data-dt-designmode]')) return
    const cs = getComputedStyle(el)
    const c = parseColor(cs[prop] as string)
    if (c && c.a > 0 && sameRGB(c, target)) n++
  })
  return n
}

/** Snabb variant: räkna förekomster av en token över alla dess färg-egenskaper. */
export function countTokenUsageAllProps(hex: string): number {
  if (typeof document === 'undefined') return 0
  const target = parseColor(hex)
  if (!target) return 0
  let n = 0
  const all = document.body.querySelectorAll('*')
  all.forEach((node) => {
    const el = node as HTMLElement
    if (el.closest('[data-design-tool]') || el.closest('[data-dt-designmode]')) return
    const cs = getComputedStyle(el)
    for (const prop of COLOR_PROPS) {
      const c = parseColor(cs[prop] as string)
      if (c && c.a > 0 && sameRGB(c, target)) { n++; break }
    }
  })
  return n
}

// ── Senaste färger (delas mellan pipett/pickers, persisteras) ──
const RECENT_KEY = dtKey('recentColors.v1')
const RECENT_MAX = 8

export function loadRecentColors(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : []
  } catch { return [] }
}

export function pushRecentColor(hex: string): string[] {
  const norm = (hex || '').toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(norm)) return loadRecentColors()
  const next = [norm, ...loadRecentColors().filter((c) => c !== norm)].slice(0, RECENT_MAX)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* privat-läge */ }
  return next
}

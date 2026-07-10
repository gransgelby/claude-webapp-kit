// Ren färg-/WCAG-/token-logik för den token-medvetna egenskaps-panelen (Post 4,
// nattjobb 2026-07-10). ALLT här är rena, deterministiska funktioner utan DOM-
// beroenden → enhetstestade i colorUtils.test.ts. DOM-sidan (läsa/skriva appens
// `--c-*`-tokens, räkna förekomster på sidan) ligger i lib/design/appTokens.ts.

export interface RGB { r: number; g: number; b: number; a: number }

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)))

/**
 * Tolka en färgsträng till {r,g,b,a}. Stödjer:
 *  • hex `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`
 *  • `rgb(r,g,b)` / `rgba(r,g,b,a)` (även mellanslags-/slash-separerad CSS4-form)
 *  • bar triplett `"100 116 139"` eller `"100,116,139"` (appens token-form,
 *    som konsumeras via `rgb(var(--c-x))`).
 * Returnerar null om strängen inte går att tolka.
 */
export function parseColor(input: string | null | undefined): RGB | null {
  if (!input) return null
  const s = String(input).trim()
  if (!s) return null

  // hex
  if (s[0] === '#') {
    let hex = s.slice(1)
    if (hex.length === 3 || hex.length === 4) hex = hex.split('').map((c) => c + c).join('')
    if (hex.length !== 6 && hex.length !== 8) return null
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
    if ([r, g, b].some(Number.isNaN)) return null
    return { r, g, b, a }
  }

  // rgb()/rgba()
  const m = s.match(/rgba?\(([^)]+)\)/i)
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean)
    if (parts.length < 3) return null
    const r = parseFloat(parts[0]), g = parseFloat(parts[1]), b = parseFloat(parts[2])
    const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1
    if ([r, g, b].some(Number.isNaN)) return null
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: Number.isNaN(a) ? 1 : a }
  }

  // bar triplett (appens token-form)
  const t = s.split(/[,\s]+/).filter(Boolean)
  if (t.length === 3 && t.every((n) => /^\d+(\.\d+)?$/.test(n))) {
    const [r, g, b] = t.map(Number)
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: 1 }
  }
  return null
}

/** Två RGB lika (ignorerar alfa, jämför heltals-kanaler). */
export function sameRGB(a: RGB, b: RGB): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b
}

const hex2 = (n: number) => clamp255(n).toString(16).padStart(2, '0')

/** RGB → `#rrggbb` (alfa tappas – färg-input:en är opak). */
export function rgbToHex(c: RGB): string {
  return '#' + hex2(c.r) + hex2(c.g) + hex2(c.b)
}

/** Valfri sträng → `#rrggbb` (för `<input type=color>`); fallback `#000000`. */
export function toHex(input: string | null | undefined): string {
  const c = parseColor(input)
  return c ? rgbToHex(c) : '#000000'
}

/** `#rrggbb` (eller valfri färgsträng) → appens token-triplett `"r g b"`. */
export function toTriplet(input: string | null | undefined): string {
  const c = parseColor(input)
  if (!c) return '0 0 0'
  return `${clamp255(c.r)} ${clamp255(c.g)} ${clamp255(c.b)}`
}

function channelLuminance(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** Relativ luminans (WCAG 2.1, 0..1). */
export function relativeLuminance(c: RGB): number {
  return 0.2126 * channelLuminance(c.r) + 0.7152 * channelLuminance(c.g) + 0.0722 * channelLuminance(c.b)
}

/** WCAG-kontrastkvot mellan två färger (1..21). */
export function contrastRatio(a: RGB, b: RGB): number {
  const l1 = relativeLuminance(a), l2 = relativeLuminance(b)
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

export interface WcagVerdict { ratio: number; grade: 'AAA' | 'AA' | 'Fail'; passAA: boolean; passAAA: boolean }

/**
 * WCAG-betyg för en kontrastkvot. `largeText` (≥18.66px bold / ≥24px) sänker
 * trösklarna (AA 3:1, AAA 4.5:1) jämfört med brödtext (AA 4.5:1, AAA 7:1).
 */
export function wcagVerdict(ratio: number, largeText = false): WcagVerdict {
  const aa = largeText ? 3 : 4.5
  const aaa = largeText ? 4.5 : 7
  const passAA = ratio >= aa
  const passAAA = ratio >= aaa
  return { ratio, grade: passAAA ? 'AAA' : passAA ? 'AA' : 'Fail', passAA, passAAA }
}

/** Bekväm helare: kontrast + betyg direkt ur två färgsträngar. Null om någon inte går att tolka. */
export function contrastBetween(fg: string, bg: string, largeText = false): WcagVerdict | null {
  const a = parseColor(fg), b = parseColor(bg)
  if (!a || !b) return null
  return wcagVerdict(contrastRatio(a, b), largeText)
}

export interface TokenEntry { name: string; raw: string; hex: string }

/**
 * Hitta app-token(s) vars färg matchar `value`. Returnerar första matchande
 * token-namnet (t.ex. `--c-slate-900`) eller null. Används för att avgöra om en
 * elementegenskap är *bunden till en token* (global) eller en ren override.
 */
export function matchToken(value: string, tokens: TokenEntry[]): string | null {
  const c = parseColor(value)
  if (!c) return null
  for (const t of tokens) {
    const tc = parseColor(t.hex) || parseColor(t.raw)
    if (tc && sameRGB(tc, c)) return t.name
  }
  return null
}

/**
 * Räkna hur många av `values` (t.ex. computed `color` för varje element på sidan)
 * som matchar målfärgen. Ren motor bakom "används på N ställen".
 */
export function countColorMatches(values: string[], target: string): number {
  const t = parseColor(target)
  if (!t) return 0
  let n = 0
  for (const v of values) {
    const c = parseColor(v)
    if (c && c.a > 0 && sameRGB(c, t)) n++
  }
  return n
}

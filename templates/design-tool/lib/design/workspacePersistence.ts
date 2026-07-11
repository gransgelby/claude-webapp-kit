// Design mode v2.3 · L2 – "Verktyget minns arbetsytan".
//
// Två SEPARATA saker persisteras (skilda nycklar, skild semantik):
//   • VY-TILLSTÅND ("var man var"): zoom/pan, valt block, aktiv panelflik,
//     mät-läge. Återställs tyst vid omladdning – ingen notis (det är inte
//     "arbete", bara var man befann sig).
//   • UTKAST ("vad man ändrat, osparat"): fria-flytt-intentioner (FW3) +
//     css-tema-tweaks (FW7) som ännu inte sparats som design-note. Återställs
//     vid omladdning MED en diskret notis ("Återställde ditt utkast") så man
//     aldrig tappar arbete vid en oavsiktlig reload/krasch.
//
// APP-AGNOSTISKT: nyckeln scopas per sida (pathname+search) → olika sidor/appar
// (t.ex. ?demo=1 vs ?demo=2) krockar aldrig. Ingen hårdkodad selektor/sida.
// ROBUST: varje payload versionsstämplas; korrupt eller utdaterad localStorage
// ignoreras tyst (parse → null). Skrivningar är try/catch:ade (privat-läge).
//
// Ren logik (serialisera/deserialisera/validera) är DOM-fri och enhetstestad i
// workspacePersistence.test.ts; localStorage-omslagen nedan är tunna.

import type { Intent, Rect } from './intentModel'
import { dtKey } from './dtConfig'

export const VIEW_VERSION = 1
export const DRAFT_VERSION = 1

const VIEW_BASE = dtKey('workspace.v1')
const DRAFT_BASE = dtKey('draft.v1')

const PANEL_TABS = ['wireframe', 'css', 'tools'] as const
export type PanelTab = (typeof PANEL_TABS)[number]

/** "Var man var" – vy-tillståndet (återställs tyst, ingen notis). */
export interface ViewState {
  zoom: number
  pan: { x: number; y: number }
  /** Valt block (area-key, sträng-index) eller null. */
  selKey: string | null
  panelTab: PanelTab
  measure: boolean
}

/** "Vad man ändrat, osparat" – utkastet (återställs MED notis). */
export interface DraftState {
  /** FW3: fria-flytt-intentioner (låd-id → önskad rect + bas, doc-px). */
  intents: Record<string, Intent>
  /** FW7: css-tema-tweaks (token-namn → nytt värde). */
  css: Record<string, string>
}

/** Scoped nyckel: bas + sida → olika sidor/appar delar aldrig tillstånd. */
export function scopedKey(base: string, scope: string): string {
  return `${base}:${scope || '/'}`
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isRect = (r: unknown): r is Rect => {
  const o = r as Rect
  return !!o && isNum(o.x) && isNum(o.y) && isNum(o.w) && isNum(o.h)
}
const rectClose = (a: Rect, b: Rect, tol = 0.5): boolean =>
  Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol &&
  Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol

// ── Vy-tillstånd: serialisera / deserialisera (versionsstämplat) ─────────────

export function serializeView(v: ViewState): string {
  return JSON.stringify({
    __v: VIEW_VERSION,
    zoom: v.zoom,
    pan: { x: v.pan.x, y: v.pan.y },
    selKey: v.selKey,
    panelTab: v.panelTab,
    measure: v.measure,
  })
}

/** Deserialisera ett vy-tillstånd. Version-mismatch, korrupt JSON eller ogiltig
 *  form → null (ignoreras tyst av anroparen). */
export function parseView(raw: string | null | undefined): ViewState | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    if (!o || o.__v !== VIEW_VERSION) return null
    const pan = o.pan as { x?: unknown; y?: unknown } | undefined
    if (!isNum(o.zoom) || !pan || !isNum(pan.x) || !isNum(pan.y)) return null
    if (o.panelTab != null && !PANEL_TABS.includes(o.panelTab as PanelTab)) return null
    const selKey = o.selKey
    return {
      zoom: o.zoom,
      pan: { x: pan.x, y: pan.y },
      selKey: typeof selKey === 'string' ? selKey : null,
      panelTab: (o.panelTab as PanelTab) ?? 'wireframe',
      measure: o.measure === true,
    }
  } catch {
    return null
  }
}

// ── Utkast: serialisera / deserialisera (versionsstämplat) ───────────────────

export function serializeDraft(d: DraftState): string {
  return JSON.stringify({ __v: DRAFT_VERSION, intents: d.intents, css: d.css })
}

/** Deserialisera ett utkast. Version-mismatch/korrupt/ogiltig form → null.
 *  Bara välformade intent-poster (rect+base) och sträng-css-värden behålls. */
export function parseDraft(raw: string | null | undefined): DraftState | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    if (!o || o.__v !== DRAFT_VERSION) return null
    const intents: Record<string, Intent> = {}
    const rawIntents = (o.intents ?? {}) as Record<string, unknown>
    for (const [k, v] of Object.entries(rawIntents)) {
      const it = v as { rect?: unknown; base?: unknown }
      if (it && isRect(it.rect) && isRect(it.base)) intents[k] = { rect: it.rect, base: it.base }
    }
    const css: Record<string, string> = {}
    const rawCss = (o.css ?? {}) as Record<string, unknown>
    for (const [k, v] of Object.entries(rawCss)) if (typeof v === 'string') css[k] = v
    return { intents, css }
  } catch {
    return null
  }
}

/** True om utkastet faktiskt bär osparat arbete: minst en css-tweak, ELLER minst
 *  en intent vars rect avviker från sin bas (en orörd intent = ingen ändring). */
export function draftHasContent(d: DraftState | null | undefined): boolean {
  if (!d) return false
  if (Object.keys(d.css).length > 0) return true
  return Object.values(d.intents).some((it) => !rectClose(it.rect, it.base))
}

// ── Tunna localStorage-omslag (DOM/privat-läge-säkra) ────────────────────────

function read(key: string): string | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(key, value) } catch { /* privat-läge */ }
}
function remove(key: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(key) } catch { /* privat-läge */ }
}

export function loadView(scope: string): ViewState | null {
  return parseView(read(scopedKey(VIEW_BASE, scope)))
}
export function saveView(scope: string, v: ViewState): void {
  write(scopedKey(VIEW_BASE, scope), serializeView(v))
}
export function loadDraft(scope: string): DraftState | null {
  return parseDraft(read(scopedKey(DRAFT_BASE, scope)))
}
export function saveDraft(scope: string, d: DraftState): void {
  write(scopedKey(DRAFT_BASE, scope), serializeDraft(d))
}
export function clearDraft(scope: string): void {
  remove(scopedKey(DRAFT_BASE, scope))
}

// ── W27 (v2.4): navigera till andra sidor UTAN att förlora osparat ───────────
// Design mode kan inte hållas monterat över en riktig sid-navigering (verktyget
// mäter och muterar sidans DOM → en ny sida = ny DOM som måste byggas om). I
// stället: spara utkastet (per sida, redan scoped ovan) → navigera → återöppna
// verktyget på nästa sida, som återställer just den sidans scope-utkast. Denna
// flagga (sessionStorage – överlever EN navigering inom samma origo, inte mer)
// bär "återöppna Design mode direkt" över den hårda navigeringen. App-agnostiskt:
// ingen sida/selektor antas; ren nyckel-hantering, enhetstestad via ett injicerat
// Storage-objekt (default = sessionStorage när DOM finns).
export const REOPEN_KEY = dtKey('reopen.v1')

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
function sessionStore(): StorageLike | null {
  if (typeof window === 'undefined') return null
  try { return window.sessionStorage } catch { return null }
}

/** Markera att Design mode ska återöppnas efter nästa navigering. */
export function markReopenDesignMode(store: StorageLike | null = sessionStore()): void {
  if (!store) return
  try { store.setItem(REOPEN_KEY, '1') } catch { /* privat-läge */ }
}

/** Läs OCH nolla återöppna-flaggan (engångs → återöppnar inte i all oändlighet).
 *  True ⇒ verktyget ska öppnas i Design mode direkt på den nya sidan. */
export function consumeReopenDesignMode(store: StorageLike | null = sessionStore()): boolean {
  if (!store) return false
  try {
    const v = store.getItem(REOPEN_KEY)
    if (v) { store.removeItem(REOPEN_KEY); return true }
  } catch { /* privat-läge */ }
  return false
}

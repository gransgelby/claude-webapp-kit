'use client'
// Token-medveten egenskaps-panel (Post 4, nattjobb 2026-07-10). Dockar vid
// HOOK-P4-PANEL i BÅDA lägena: in-app overlay (DesignToolShell) och Design mode
// (DesignModeShell). Markera ett element → justera färg/opacitet/radie/ram/
// spacing med pickers + reglage.
//
// KÄRNAN – token-vs-override:
//   • Är en färg bunden till en app-token (`--c-*`) visar panelen det + "används
//     på N ställen" (live-räknat på sidan). I GLOBAL-läge redigerar man TOKEN:en →
//     värdet skrivs live på :root → HELA appen skiftar (alla N ställen).
//   • I LOKAL-läge (override) frikopplas elementet: färgen sätts inline BARA på det
//     elementet, token:en lämnas orörd.
//   • Skillnaden är tydlig i UI:t (🌐 Global = alla / ⦿ Lokal = bara detta).
//
// Lyx: pipett (EyeDropper API med graciös fallback) · senaste färger · inline
// WCAG-kontrast (text mot bakgrund, AA/AAA-status). Panelen stylas UTESLUTANDE
// med `--dt-*` (aldrig appens `--c-*`).
//
// Spara → design-notes: TOKEN-ändringar sparas som kind `'tokens'` (globala),
// element-overrides som kind `'style'` (lokala) – analogt med Post 3:s `'layout'`.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { saveDesignNote } from '@/lib/designToolAdapter'
import { toHex, contrastBetween, matchToken, type WcagVerdict } from '@/lib/design/colorUtils'
import {
  readAppTokens, readToken, writeTokenLive, clearTokenLive, countUsage,
  loadRecentColors, pushRecentColor, type ColorProp,
} from '@/lib/design/appTokens'
import { dtBtn, dtGhostBtn, dtInput } from './dtStyles'

interface EyeDropperCtor { new (): { open(): Promise<{ sRGBHex: string }> } }
const hasEyeDropper = () => typeof window !== 'undefined' && 'EyeDropper' in window

type ColorProps = { color: string; backgroundColor: string; borderColor: string }
const COLOR_META: { key: ColorProp; label: string }[] = [
  { key: 'color', label: 'Textfärg' },
  { key: 'backgroundColor', label: 'Bakgrund' },
  { key: 'borderColor', label: 'Ramfärg' },
]
const NUM_META: { key: NumKey; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'borderWidth', label: 'Rambredd', min: 0, max: 12, step: 1, unit: 'px' },
  { key: 'borderRadius', label: 'Hörnradie', min: 0, max: 40, step: 1, unit: 'px' },
  { key: 'padding', label: 'Spacing (padding)', min: 0, max: 48, step: 1, unit: 'px' },
  { key: 'fontSize', label: 'Textstorlek', min: 8, max: 48, step: 1, unit: 'px' },
]
type NumKey = 'borderWidth' | 'borderRadius' | 'padding' | 'fontSize'

interface ColorFieldState {
  hex: string; base: string
  token: string | null; tokenBase: string; usage: number
  mode: 'token' | 'override'
}

function pxNum(v: string): number { const m = String(v).match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0 }

/** Effektiv bakgrund bakom `el` (gå uppåt tills en opak yta hittas) – för WCAG. */
function resolveBackground(el: HTMLElement): string {
  let node: HTMLElement | null = el
  for (let i = 0; i < 12 && node; i++) {
    const bg = getComputedStyle(node).backgroundColor
    const m = bg.match(/rgba?\(([^)]+)\)/)
    if (m) {
      const parts = m[1].split(/[,\s/]+/).filter(Boolean)
      const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1
      if (a > 0.5) return bg
    }
    node = node.parentElement
  }
  return '#ffffff'
}

interface Props {
  el: HTMLElement
  selInfo: { design_id?: string; selector: string; label: string }
  flash: (msg: string, undo?: () => void) => void
  onClose: () => void
  /** Kompaktare rubrik i den smala overlay-panelen (Design mode har mer plats). */
  compact?: boolean
}

export default function PropertyPanel({ el, selInfo, flash, onClose, compact }: Props) {
  const tokens = useMemo(() => readAppTokens(), [])
  const original = useRef<Record<string, string>>({})
  const touchedTokens = useRef<Map<string, string>>(new Map()) // name → ursprunglig triplett
  const wcagBg = useRef<string>('#ffffff')
  const largeText = useRef<boolean>(false)

  const [colors, setColors] = useState<Record<ColorProp, ColorFieldState>>(() => emptyColors())
  const [nums, setNums] = useState<Record<NumKey, number>>({ borderWidth: 0, borderRadius: 0, padding: 0, fontSize: 14 })
  const numsBase = useRef<Record<NumKey, number>>({ borderWidth: 0, borderRadius: 0, padding: 0, fontSize: 14 })
  const [opacity, setOpacity] = useState(1)
  const opacityBase = useRef(1)
  const [recent, setRecent] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // ── Init vid elementbyte: läs computed, snapshotta original, bind tokens ──
  useEffect(() => {
    const cs = getComputedStyle(el)
    original.current = {
      color: el.style.color, backgroundColor: el.style.backgroundColor, borderColor: el.style.borderColor,
      borderWidth: el.style.borderWidth, borderStyle: el.style.borderStyle, borderRadius: el.style.borderRadius,
      padding: el.style.padding, fontSize: el.style.fontSize, opacity: el.style.opacity,
    }
    touchedTokens.current = new Map()
    wcagBg.current = toHex(resolveBackground(el))
    largeText.current = pxNum(cs.fontSize) >= 24 || (pxNum(cs.fontSize) >= 18.66 && parseInt(cs.fontWeight || '400', 10) >= 700)

    const next = emptyColors()
    for (const { key } of COLOR_META) {
      const hex = toHex(cs[key] as string)
      const token = matchToken(cs[key] as string, tokens)
      next[key] = {
        hex, base: hex,
        token, tokenBase: token ? toHex(readToken(token)) : hex,
        usage: token ? countUsage(key, hex) : 0,
        mode: token ? 'token' : 'override',
      }
    }
    setColors(next)
    const nb: Record<NumKey, number> = {
      borderWidth: pxNum(cs.borderWidth), borderRadius: pxNum(cs.borderRadius),
      padding: pxNum(cs.paddingTop), fontSize: pxNum(cs.fontSize),
    }
    numsBase.current = nb; setNums(nb)
    opacityBase.current = parseFloat(cs.opacity || '1'); setOpacity(parseFloat(cs.opacity || '1'))
    setRecent(loadRecentColors())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el])

  // ── Applicera ett färgfält till DOM:en (token-live eller inline-override) ──
  const applyColor = useCallback((key: ColorProp, f: ColorFieldState) => {
    if (f.mode === 'token' && f.token) {
      el.style[key] = ''                              // inget inline maskerar token:en
      if (!touchedTokens.current.has(f.token)) touchedTokens.current.set(f.token, readToken(f.token))
      writeTokenLive(f.token, f.hex)
    } else {
      // Override-läge: återställ ev. global token vi rört, sätt inline bara på elementet.
      if (f.token && touchedTokens.current.has(f.token)) {
        const orig = touchedTokens.current.get(f.token)
        writeTokenLive(f.token, orig || f.tokenBase)
      }
      if (key === 'borderColor' && pxNum(getComputedStyle(el).borderWidth) === 0 && nums.borderWidth === 0) {
        el.style.borderStyle = 'solid'; el.style.borderWidth = '1px'
      }
      el.style[key] = f.hex
    }
  }, [el, nums.borderWidth])

  const setColorHex = (key: ColorProp, hex: string) => {
    setColors((prev) => {
      const f = { ...prev[key], hex }
      applyColor(key, f)
      return { ...prev, [key]: f }
    })
    setRecent(pushRecentColor(hex))
  }

  const setColorMode = (key: ColorProp, mode: 'token' | 'override') => {
    setColors((prev) => {
      const f = { ...prev[key], mode }
      applyColor(key, f)
      return { ...prev, [key]: f }
    })
  }

  const pickWithEyeDropper = async (key: ColorProp) => {
    if (!hasEyeDropper()) { flash('Pipett stöds inte i den här webbläsaren'); return }
    try {
      const Ctor = (window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper
      const res = await new Ctor().open()
      if (res?.sRGBHex) setColorHex(key, toHex(res.sRGBHex))
    } catch { /* avbrutet av användaren */ }
  }

  const setNum = (key: NumKey, value: number) => {
    setNums((prev) => ({ ...prev, [key]: value }))
    if (key === 'borderWidth') { el.style.borderStyle = value > 0 ? 'solid' : original.current.borderStyle || ''; el.style.borderWidth = value + 'px' }
    else if (key === 'borderRadius') el.style.borderRadius = value + 'px'
    else if (key === 'padding') el.style.padding = value + 'px'
    else if (key === 'fontSize') el.style.fontSize = value + 'px'
  }

  const setOpacityLive = (v: number) => { setOpacity(v); el.style.opacity = String(v) }

  // ── Revert: återställ inline-original + rensa alla token-live-overrides ──
  const revert = useCallback(() => {
    for (const [k, v] of Object.entries(original.current)) {
      if (v) el.style.setProperty(cssName(k), v); else el.style.removeProperty(cssName(k))
    }
    touchedTokens.current.forEach((origTriplet, name) => {
      if (origTriplet) writeTokenLive(name, origTriplet); else clearTokenLive(name)
    })
    touchedTokens.current = new Map()
  }, [el])

  useEffect(() => () => { /* unmount → lämna DOM som den är? nej: rensa live-preview */ revert() }, [revert])

  // ── Härled ändringar för sparning ──
  const tokenChanges = () => {
    const out: Record<string, { from: string; to: string }> = {}
    for (const { key } of COLOR_META) {
      const f = colors[key]
      if (f.mode === 'token' && f.token && f.hex.toLowerCase() !== f.tokenBase.toLowerCase()) {
        out[f.token] = { from: f.tokenBase, to: f.hex }
      }
    }
    return out
  }
  const styleChanges = () => {
    const out: Record<string, { from: string; to: string }> = {}
    for (const { key } of COLOR_META) {
      const f = colors[key]
      if (f.mode === 'override' && f.hex.toLowerCase() !== f.base.toLowerCase()) out[key] = { from: f.base, to: f.hex }
    }
    for (const { key, unit } of NUM_META) {
      if (nums[key] !== numsBase.current[key]) out[key] = { from: `${numsBase.current[key]}${unit}`, to: `${nums[key]}${unit}` }
    }
    if (opacity !== opacityBase.current) out.opacity = { from: String(opacityBase.current), to: String(opacity) }
    return out
  }

  const captureContext = () => ({
    page: location.pathname + location.search,
    theme: document.documentElement.dataset.theme || 'standard',
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
  })

  const save = async () => {
    const tc = tokenChanges(), sc = styleChanges()
    if (Object.keys(tc).length === 0 && Object.keys(sc).length === 0) { flash('Inga ändringar att spara'); return }
    setSaving(true)
    let okAll = true
    if (Object.keys(tc).length) {
      const res = await saveDesignNote({
        kind: 'tokens', ...captureContext(), ...selInfo, tokens: tc,
        comment: `Token-ändring (global): ${Object.entries(tc).map(([n, v]) => `${n} ${v.from}→${v.to}`).join('; ')}`,
      })
      okAll = okAll && res.ok
    }
    if (Object.keys(sc).length) {
      const res = await saveDesignNote({ kind: 'style', ...captureContext(), ...selInfo, changes: sc })
      okAll = okAll && res.ok
    }
    setSaving(false)
    // Behåll live-resultatet efter sparning (både token-genomslag och element-
    // override ska stå kvar synligt) → nolla snapshots så unmount inte revertar.
    touchedTokens.current = new Map()
    original.current = {}
    flash(okAll ? 'Designförslag sparat → design-notes' : 'Kunde inte spara allt')
    onClose()
  }

  const wcag: WcagVerdict | null = contrastBetween(colors.color.hex, wcagBg.current, largeText.current)

  return (
    <div data-dt-property-panel style={{ display: 'flex', flexDirection: 'column', gap: 'var(--dt-space-2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-dim)', wordBreak: 'break-all' }}>
          {selInfo.design_id ? `#${selInfo.design_id}` : selInfo.label}
        </span>
        {!compact && <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)' }}>egenskaper</span>}
      </div>

      {/* Inline WCAG-kontrast (text mot bakgrund) */}
      {wcag && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--dt-space-2)', padding: '5px 8px',
          background: 'var(--dt-surface-2)', border: '1px solid var(--dt-border)', borderRadius: 'var(--dt-radius-sm)',
        }}>
          <span aria-hidden style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid var(--dt-border)', background: colors.color.hex, boxShadow: `inset 0 0 0 3px ${wcagBg.current}` }} />
          <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-dim)' }}>WCAG</span>
          <b style={{ fontSize: 'var(--dt-text-sm)', fontVariantNumeric: 'tabular-nums', color: 'var(--dt-text)' }}>{wcag.ratio.toFixed(2)}:1</b>
          <span title={largeText.current ? 'Stor text (AA≥3, AAA≥4.5)' : 'Brödtext (AA≥4.5, AAA≥7)'} style={{
            marginLeft: 'auto', fontSize: 'var(--dt-text-xs)', fontWeight: 700, padding: '1px 7px', borderRadius: 'var(--dt-radius-pill)',
            color: wcag.grade === 'Fail' ? '#fca5a5' : 'var(--dt-accent-contrast)',
            background: wcag.grade === 'Fail' ? 'rgba(239,68,68,0.16)' : 'var(--dt-accent)',
          }}>{wcag.grade === 'Fail' ? '✕ Under AA' : `✓ ${wcag.grade}`}</span>
        </div>
      )}

      {/* Färgfält (token-vs-override) */}
      {COLOR_META.map(({ key, label }) => {
        const f = colors[key]
        return (
          <div key={key} style={{ borderBottom: '1px solid var(--dt-border)', paddingBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-dim)', minWidth: 58 }}>{label}</label>
              <input aria-label={`${label} färgruta`} type="color" value={f.hex} onChange={(e) => setColorHex(key, e.target.value)}
                style={{ width: 30, height: 24, padding: 0, border: '1px solid var(--dt-border)', borderRadius: 'var(--dt-radius-sm)', background: 'none', cursor: 'pointer' }} />
              <input aria-label={`${label} hex`} type="text" value={f.hex} onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColors((p) => ({ ...p, [key]: { ...p[key], hex: v } })) }}
                onBlur={(e) => { const h = toHex(e.target.value); setColorHex(key, h) }}
                style={{ ...dtInput(), height: 24, flex: 1, fontFamily: 'var(--dt-font-mono)', padding: '2px 6px' }} />
              <button type="button" title={hasEyeDropper() ? 'Pipett – plocka en färg från skärmen' : 'Pipett stöds ej i denna webbläsare'} onClick={() => pickWithEyeDropper(key)}
                disabled={!hasEyeDropper()} style={{ ...dtGhostBtn(false, !hasEyeDropper()), padding: '2px 7px' }}>⎊</button>
            </div>

            {/* Token-badge + Global/Lokal-växel (bara när en token-bindning finns) */}
            {f.token && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 64 }}>
                <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--dt-surface-2)', borderRadius: 'var(--dt-radius-sm)', border: '1px solid var(--dt-border)' }}>
                  <button type="button" onClick={() => setColorMode(key, 'token')} title="Redigera token → slår igenom överallt"
                    style={modeBtn(f.mode === 'token')}>🌐 Global</button>
                  <button type="button" onClick={() => setColorMode(key, 'override')} title="Frikoppla – ändra bara detta element"
                    style={modeBtn(f.mode === 'override')}>⦿ Lokal</button>
                </div>
                <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', fontFamily: 'var(--dt-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.mode === 'token' ? `🔗 ${f.token} · ${f.usage} ställen` : 'frikopplad · bara detta'}
                </span>
              </div>
            )}

            {/* Senaste färger */}
            {recent.length > 0 && (
              <div style={{ display: 'flex', gap: 3, marginTop: 4, paddingLeft: 64, flexWrap: 'wrap' }}>
                {recent.map((c) => (
                  <button key={c} type="button" title={c} onClick={() => setColorHex(key, c)}
                    style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid var(--dt-border)', background: c, cursor: 'pointer', padding: 0 }} />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Numeriska reglage: ram/radie/spacing/textstorlek */}
      {NUM_META.map(({ key, label, min, max, step, unit }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-dim)', minWidth: 90 }}>{label}</label>
          <input type="range" min={min} max={max} step={step} value={nums[key]} onChange={(e) => setNum(key, parseFloat(e.target.value))} style={{ flex: 1, accentColor: 'var(--dt-accent)' }} />
          <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text)', minWidth: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{nums[key]}{unit}</span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-dim)', minWidth: 90 }}>Opacitet</label>
        <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacityLive(parseFloat(e.target.value))} style={{ flex: 1, accentColor: 'var(--dt-accent)' }} />
        <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text)', minWidth: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(opacity * 100)}%</span>
      </div>

      <div style={{ display: 'flex', gap: 'var(--dt-space-2)', marginTop: 2 }}>
        <button type="button" onClick={save} disabled={saving} style={{ ...dtBtn(true), flex: 1 }}>{saving ? 'Sparar…' : 'Spara förslag'}</button>
        <button type="button" onClick={() => { revert(); onClose() }} style={dtGhostBtn()}>Avbryt</button>
      </div>
    </div>
  )
}

function emptyColors(): Record<ColorProp, ColorFieldState> {
  const base: ColorFieldState = { hex: '#000000', base: '#000000', token: null, tokenBase: '#000000', usage: 0, mode: 'override' }
  return { color: { ...base }, backgroundColor: { ...base }, borderColor: { ...base } }
}
function modeBtn(on: boolean): React.CSSProperties {
  return {
    padding: '2px 7px', fontSize: 'var(--dt-text-xs)', fontWeight: 600, cursor: 'pointer',
    borderRadius: 'var(--dt-radius-sm)', border: '1px solid ' + (on ? 'var(--dt-border-strong)' : 'transparent'),
    background: on ? 'var(--dt-accent-weak)' : 'transparent', color: on ? 'var(--dt-accent)' : 'var(--dt-text-dim)',
  }
}
function cssName(k: string): string { return k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) }

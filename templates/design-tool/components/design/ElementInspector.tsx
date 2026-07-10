'use client'
// Element-verktygslåda (Post 5, nattjobb 2026-07-10). Dockar vid HOOK-P5-BREADCRUMB
// i BÅDA lägena (overlay-shell + Design mode) direkt ovanför egenskaps-panelen.
// Fyra funktioner, alla drivna av den rena lib/design/elementModel + elementSource:
//
//   1. ELEMENT-BRÖDSMULA (DOM-hierarki). Visar förälderkedjan topp→…→valt element.
//      Klicka en smula (eller ↑ förälder / ↓ barn) → `onSelect(nyttElement)` →
//      outline + egenskaps-panel följer med. En stabil "djupaste"-ankare bevaras så
//      man kan gå upp OCH sedan ner igen längs den ursprungligt plockade grenen.
//   2. TOKEN-SNAP-NUDGE. Justerar padding i spacing-token-steg (−/+ eller piltangenter,
//      ⇧ = större steg). Visar live-värde + närmaste spacing-token.
//   3. "VAD ÄR DET HÄR?" element→fil:rad. Exakt dev-källa (`_debugSource`) om möjligt,
//      annars en tydligt märkt gissning. Klickbar/kopierbar `fil:rad`.
//
// Stylas UTESLUTANDE med `--dt-*` (aldrig appens `--c-*`).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  breadcrumbChain, describeNode, spacingStepsPx, nearestSpacingToken, nudgeToToken,
} from '@/lib/design/elementModel'
import { sourceForElement, type ElementSource } from '@/lib/design/elementSource'
import { dtGhostBtn } from './dtStyles'

interface Props {
  el: HTMLElement
  /** Byt valt element (brödsmule-navigering) → shell uppdaterar outline + panel. */
  onSelect: (el: HTMLElement) => void
  flash: (msg: string, undo?: () => void) => void
  compact?: boolean
}

function readSpaceScale(): { remPx: number; scale: number } {
  if (typeof document === 'undefined') return { remPx: 16, scale: 1 }
  const cs = getComputedStyle(document.documentElement)
  const remPx = parseFloat(cs.fontSize) || 16
  const scale = parseFloat(cs.getPropertyValue('--space-scale')) || 1
  return { remPx, scale }
}
function pxNum(v: string): number { const m = String(v).match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0 }

export default function ElementInspector({ el, onSelect, flash, compact }: Props) {
  // Stabilt "djupaste"-ankare: bevara den ursprungligt plockade grenen så ↓ (barn)
  // funkar efter att man gått ↑ (förälder). Nollas när ett element UTANFÖR grenen väljs.
  const anchor = useRef<HTMLElement>(el)
  useEffect(() => {
    const a = anchor.current
    if (!a || !a.isConnected || !(a === el || a.contains(el))) anchor.current = el
  }, [el])

  const chain = useMemo(() => breadcrumbChain(anchor.current), [el]) // el-byte → räkna om
  const curIndex = useMemo(() => {
    const i = chain.findIndex((c) => c.el === el)
    return i >= 0 ? i : chain.length - 1
  }, [chain, el])

  const goto = useCallback((i: number) => {
    const item = chain[i]
    if (item && item.el instanceof HTMLElement) onSelect(item.el)
  }, [chain, onSelect])

  // ── Token-snap-nudge (padding) ──
  const [pad, setPad] = useState(0)
  const [scaleInfo, setScaleInfo] = useState(() => readSpaceScale())
  useEffect(() => {
    setScaleInfo(readSpaceScale())
    setPad(pxNum(getComputedStyle(el).paddingTop))
  }, [el])
  const steps = useMemo(() => spacingStepsPx(scaleInfo.remPx, scaleInfo.scale), [scaleInfo])
  const near = useMemo(() => nearestSpacingToken(pad, steps), [pad, steps])

  const applyPad = useCallback((px: number) => {
    setPad(px)
    el.style.padding = `${Math.round(px * 100) / 100}px`
  }, [el])
  const nudge = useCallback((dir: 1 | -1, big = false) => {
    if (big) { const t = nudgeToToken(nudgeToToken(pad, dir, steps).px, dir, steps); applyPad(t.px) }
    else { const t = nudgeToToken(pad, dir, steps); applyPad(t.px) }
  }, [pad, steps, applyPad])

  const onNudgeKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); nudge(1, e.shiftKey) }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1, e.shiftKey) }
  }

  // ── "Vad är det här?" element→fil:rad ──
  const [src, setSrc] = useState<ElementSource | null>(null)
  useEffect(() => { setSrc(null) }, [el]) // nollställ vid elementbyte
  const resolveSource = () => {
    const s = sourceForElement(el)
    setSrc(s)
    if (s && !s.exact) flash('Källan är en gissning (ingen dev-källinfo)')
  }
  const copySource = () => {
    if (!src) return
    const txt = src.exact ? `${src.file}${src.line ? `:${src.line}` : ''}` : (src.component || src.file)
    navigator.clipboard?.writeText(txt).then(() => flash('Kopierat: ' + txt)).catch(() => {})
  }

  const desc = describeNode(el)

  return (
    <div data-dt-element-inspector style={{ display: 'flex', flexDirection: 'column', gap: 'var(--dt-space-2)', marginBottom: 'var(--dt-space-2)' }}>
      {/* ── Brödsmula (DOM-hierarki) ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
          <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', flex: 1 }}>DOM-hierarki</span>
          <button type="button" title="Välj förälder (uppåt)" aria-label="Välj förälder" disabled={curIndex <= 0}
            onClick={() => goto(curIndex - 1)} style={{ ...dtGhostBtn(false, curIndex <= 0), padding: '0 7px', lineHeight: 1.6 }}>↑</button>
          <button type="button" title="Välj barn (nedåt, längs plockad gren)" aria-label="Välj barn" disabled={curIndex >= chain.length - 1}
            onClick={() => goto(curIndex + 1)} style={{ ...dtGhostBtn(false, curIndex >= chain.length - 1), padding: '0 7px', lineHeight: 1.6 }}>↓</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, fontFamily: 'var(--dt-font-mono)' }}>
          {chain.map((c, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              {i > 0 && <span aria-hidden style={{ color: 'var(--dt-text-mute)', fontSize: 10 }}>›</span>}
              <button type="button" onClick={() => goto(i)} title={c.label}
                style={{
                  fontSize: 'var(--dt-text-xs)', fontFamily: 'var(--dt-font-mono)', cursor: 'pointer',
                  padding: '1px 5px', borderRadius: 'var(--dt-radius-sm)', lineHeight: 1.5,
                  border: '1px solid ' + (i === curIndex ? 'var(--dt-border-strong)' : 'transparent'),
                  background: i === curIndex ? 'var(--dt-accent-weak)' : 'transparent',
                  color: i === curIndex ? 'var(--dt-accent)' : 'var(--dt-text-dim)',
                  maxWidth: 116, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{c.label}</button>
            </span>
          ))}
        </div>
      </div>

      {/* ── Token-snap-nudge (padding) ── */}
      <div
        tabIndex={0} onKeyDown={onNudgeKey}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', outline: 'none',
          background: 'var(--dt-surface-2)', border: '1px solid var(--dt-border)', borderRadius: 'var(--dt-radius-sm)',
        }}
        title="Piltangenter nudgar · ⇧ = större steg"
      >
        <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-dim)', minWidth: 46 }}>Padding</span>
        <button type="button" aria-label="Minska padding" onClick={() => nudge(-1)} style={{ ...dtGhostBtn(), padding: '0 8px', lineHeight: 1.6 }}>−</button>
        <b style={{ fontSize: 'var(--dt-text-sm)', fontVariantNumeric: 'tabular-nums', color: 'var(--dt-text)', minWidth: 40, textAlign: 'center' }}>{Math.round(pad)}px</b>
        <button type="button" aria-label="Öka padding" onClick={() => nudge(1)} style={{ ...dtGhostBtn(), padding: '0 8px', lineHeight: 1.6 }}>+</button>
        <span style={{
          marginLeft: 'auto', fontSize: 'var(--dt-text-xs)', fontFamily: 'var(--dt-font-mono)',
          color: near.onToken ? 'var(--dt-accent)' : 'var(--dt-text-mute)',
        }} title="Närmaste spacing-token">{near.onToken ? '✓' : '≈'} p-{near.name}</span>
      </div>

      {/* ── "Vad är det här?" element→fil:rad ── */}
      <div>
        {!src ? (
          <button type="button" onClick={resolveSource} style={{ ...dtGhostBtn(), width: '100%', justifyContent: 'center' }}>
            🔎 Vad är det här? (fil:rad)
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 8px', background: 'var(--dt-surface-2)', border: '1px solid var(--dt-border)', borderRadius: 'var(--dt-radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--dt-radius-pill)',
                color: src.exact ? 'var(--dt-accent-contrast)' : '#fca5a5',
                background: src.exact ? 'var(--dt-accent)' : 'rgba(239,68,68,0.16)',
              }}>{src.exact ? '✓ Exakt (dev-källa)' : '≈ Gissning'}</span>
              {src.component && <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-dim)', fontFamily: 'var(--dt-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.component}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" onClick={copySource} title="Kopiera"
                style={{ ...dtGhostBtn(), flex: 1, justifyContent: 'flex-start', fontFamily: 'var(--dt-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {src.exact ? `${src.file}${src.line ? `:${src.line}` : ''}` : (desc.designId ? `[data-design-id="${desc.designId}"]` : src.component || src.file)}
              </button>
              <button type="button" aria-label="Dölj" onClick={() => setSrc(null)} style={{ ...dtGhostBtn(), padding: '2px 8px' }}>✕</button>
            </div>
            {!src.exact && !compact && <span style={{ fontSize: 10, color: 'var(--dt-text-mute)' }}>Ingen `_debugSource` (prod/minifierat) – bäst-gissning från komponent/attribut.</span>}
          </div>
        )}
      </div>
    </div>
  )
}

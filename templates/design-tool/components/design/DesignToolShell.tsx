'use client'
// DesignTool-SHELLEN (Post 2, nattjobb 2026-07-10). Bygger om det tidigare ad-hoc-
// verktyget (I49) till en riktig shell:
//   • EGET `--dt-*`-token-set, scopat till `.dt-root` (se lib/design/dtTheme.ts).
//   • Två-läges-ramverk: in-app OVERLAY (dagens sätt) + helskärms DESIGN MODE (skal, Post 3).
//   • Lyx-lager: kommandopalett (⌘K), kvarhållet tillstånd, reduced-motion,
//     toasts med inline-ångra, mjuka fjäder-animationer, precisa cursors.
//   • 2–3 chrome-riktningar (Midnattsglas / Ljus precision / Neon) via stil-växel.
// Bevarar all funktion från I49: element-plock, rita ruta, kommentar, anteckningar,
// spara → design-notes, Rutt-design-toggle, extern-launcher-bussen.
//
// Admin-gating + lazy-load sker i den TUNNA monterings-komponenten components/DesignTool.tsx
// (denna fil laddas bara när en admin faktiskt öppnar verktyget).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { saveDesignNote, listDesignNotes, deleteDesignNote, type DesignNote } from '@/lib/designToolAdapter'
import { hasExternalDesignLauncher, subscribeDesignLaunchers, toggleDesignTool, type DesignAnchor } from '@/lib/designToolBus'
import { DT_THEME_ORDER, DT_THEMES, dtThemeVars } from '@/lib/design/dtTheme'
import { useShellState, useReducedMotion } from './useDesignShell'
import { useToasts } from './useToasts'
import CommandPalette, { type Command } from './CommandPalette'
import DesignModeShell from './DesignModeShell'
import PropertyPanel from './PropertyPanel'
import ElementInspector from './ElementInspector'
import { nearestMeaningfulElement } from '@/lib/design/elementModel'
import { dtBtn, dtGhostBtn, dtInput } from './dtStyles'

type Mode = 'idle' | 'pick' | 'draw' | 'notes' | 'gcomment'
type Rect = { x: number; y: number; w: number; h: number }

function describe(el: Element): { design_id?: string; selector: string; label: string } {
  let node: Element | null = el
  let design_id: string | undefined
  while (node) {
    const d = (node as HTMLElement).dataset?.designId
    if (d) { design_id = d; break }
    node = node.parentElement
  }
  const parts: string[] = []
  let cur: Element | null = el
  for (let i = 0; i < 4 && cur && cur.nodeName !== 'BODY'; i++) {
    let s = cur.nodeName.toLowerCase()
    if (cur.id) { s += `#${cur.id}`; parts.unshift(s); break }
    const cls = typeof cur.className === 'string' ? cur.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : []
    if (cls.length) s += '.' + cls.join('.')
    const parent = cur.parentElement
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c) => c.nodeName === cur!.nodeName)
      if (sameTag.length > 1) s += `:nth-of-type(${sameTag.indexOf(cur) + 1})`
    }
    parts.unshift(s)
    cur = cur.parentElement
  }
  const tag = el.nodeName.toLowerCase()
  const idPart = el.id ? `#${el.id}` : ''
  const clsPart = typeof el.className === 'string' && el.className
    ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
  return { design_id, selector: parts.join(' > '), label: `${tag}${idPart}${clsPart}` }
}

function captureContext() {
  const theme = document.documentElement.dataset.theme || 'standard'
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return {
    page: location.pathname + location.search,
    theme,
    mode: dark ? 'dark-os' : 'light-os',
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    user_agent: navigator.userAgent,
  }
}

// Keyframes (prefix dt* → kolliderar inte med appen). Reduced-motion nollar --dt-dur
// så dessa i praktiken blir omedelbara.
const KEYFRAMES = `
@keyframes dtFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes dtPop { from { opacity: 0; transform: translateY(6px) scale(0.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
@keyframes dtSlideUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
`

export default function DesignToolShell({
  initialOpen = false, initialAnchor = null, initialPalette = false, initialTheme, initialDesignMode = false,
}: { initialOpen?: boolean; initialAnchor?: DesignAnchor | null; initialPalette?: boolean; initialTheme?: import('@/lib/design/dtTheme').DtThemeId; initialDesignMode?: boolean }) {
  const { state, patch } = useShellState()
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(initialOpen)
  const [designMode, setDesignMode] = useState(initialDesignMode)
  const [paletteOpen, setPaletteOpen] = useState(initialPalette)

  // Tema-override via URL-flagga (dev/skärmdump). Körs en gång efter mount.
  const themeBoot = useRef(false)
  useEffect(() => {
    if (themeBoot.current || !initialTheme) return
    themeBoot.current = true
    patch({ theme: initialTheme })
  }, [initialTheme, patch])
  const [mode, setMode] = useState<Mode>('idle')
  const [hoverRect, setHoverRect] = useState<Rect | null>(null)
  const [panelEl, setPanelEl] = useState<HTMLElement | null>(null)
  const [selInfo, setSelInfo] = useState<{ design_id?: string; selector: string; label: string } | null>(null)
  const [selRect, setSelRect] = useState<Rect | null>(null)
  const [draw, setDraw] = useState<Rect | null>(null)
  const [comment, setComment] = useState('')
  const [genComment, setGenComment] = useState('')
  const [notes, setNotes] = useState<DesignNote[]>([])
  const [anchor, setAnchor] = useState<DesignAnchor | null>(initialAnchor)
  const [pos, setPos] = useState(state.pos)
  const dragRef = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null)

  const { toasts, push, dismiss, runUndo } = useToasts()
  const selEl = useRef<HTMLElement | null>(null)
  const drawStart = useRef<{ x: number; y: number } | null>(null)

  const externalLauncher = useSyncExternalStore(subscribeDesignLaunchers, hasExternalDesignLauncher, () => false)

  // Sync persisterad panel-offset in när tillståndet laddats.
  useEffect(() => { setPos(state.pos) }, [state.pos])

  // Toggle-event (kartans Design-knapp + global launcher). Bär ankar-rect.
  useEffect(() => {
    const toggle = (e: Event) => {
      const d = (e as CustomEvent).detail as DesignAnchor | null | undefined
      setOpen((v) => { const next = !v; if (next) { setAnchor(d ?? null) } return next })
    }
    window.addEventListener('dt:toggle-design-tool', toggle)
    return () => window.removeEventListener('dt:toggle-design-tool', toggle)
  }, [])

  // ⌘K – kommandopalett. Fungerar även när panelen är stängd (öppnar då verktyget).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault(); setOpen(true); setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const flash = useCallback((m: string, undo?: () => void) => push(m, { undo }), [push])

  // Rensa aktuell markering. PropertyPanel äger sin egen live-revert (körs i dess
  // unmount-cleanup när panelEl nollas) → här behöver vi bara släppa referensen.
  const revertLive = useCallback(() => {
    selEl.current = null
    setPanelEl(null); setSelInfo(null); setSelRect(null)
  }, [])

  // Markera ett element (delas av element-plock OCH brödsmule-navigering, Post 5):
  // egenskaps-panel + selektions-outline följer med.
  const selectElement = useCallback((el: HTMLElement) => {
    selEl.current = el
    setPanelEl(el); setSelInfo(describe(el))
    const r = el.getBoundingClientRect()
    setSelRect({ x: r.left, y: r.top, w: r.width, h: r.height })
  }, [])

  // Håll selektions-outlinen på plats när sidan scrollas/resizas.
  useEffect(() => {
    if (!panelEl) return
    const sync = () => {
      if (!selEl.current) return
      const r = selEl.current.getBoundingClientRect()
      setSelRect({ x: r.left, y: r.top, w: r.width, h: r.height })
    }
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    return () => { window.removeEventListener('scroll', sync, true); window.removeEventListener('resize', sync) }
  }, [panelEl])

  const exitMode = useCallback(() => {
    revertLive(); setMode('idle'); setHoverRect(null); setDraw(null); setComment(''); drawStart.current = null
  }, [revertLive])

  // (a) Element-plock (HOOK-P5: element-brödsmula/DOM-hierarki kopplas in här senare).
  useEffect(() => {
    if (mode !== 'pick') return
    document.body.classList.add('fa-design-picking')
    const pickEl = (e: MouseEvent): HTMLElement | null => {
      let el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      if (el && e.shiftKey && el.parentElement && el.parentElement.nodeName !== 'BODY') el = el.parentElement
      return el
    }
    const move = (e: MouseEvent) => {
      const raw = pickEl(e)
      if (!raw || raw.closest('[data-design-tool]')) { setHoverRect(null); return }
      // Förhandsvisa exakt det element som skulle VÄLJAS (smart default) → outlinen
      // ljuger inte om vad ett klick ger.
      const el = e.shiftKey ? raw : (nearestMeaningfulElement(raw) as HTMLElement)
      const r = el.getBoundingClientRect()
      setHoverRect({ x: r.left, y: r.top, w: r.width, h: r.height })
    }
    const click = (e: MouseEvent) => {
      const raw = pickEl(e)
      if (!raw || raw.closest('[data-design-tool]')) return
      e.preventDefault(); e.stopPropagation()
      // Smart default-selektion (Post 5): klättra till närmaste MENINGSFULLA
      // behållare/kontroll i stället för ett dekorativt inre lager (fixar
      // MapLibre-ⓘ-buggen). Shift-klick behåller det råa träff-elementet.
      const el = e.shiftKey ? raw : (nearestMeaningfulElement(raw) as HTMLElement)
      // Token-medvetna egenskaps-panelen (Post 4) + element-verktygslådan (Post 5)
      // tar över: brödsmulan låter användaren finjustera upp/ner om default missar.
      selectElement(el); setHoverRect(null); setMode('idle')
    }
    document.addEventListener('mousemove', move, true)
    document.addEventListener('click', click, true)
    return () => {
      document.body.classList.remove('fa-design-picking')
      document.removeEventListener('mousemove', move, true); document.removeEventListener('click', click, true)
    }
  }, [mode])

  // (b) Rita ruta.
  useEffect(() => {
    if (mode !== 'draw') return
    const down = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest('[data-design-tool]')) return
      e.preventDefault(); drawStart.current = { x: e.clientX, y: e.clientY }; setDraw({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
    }
    const move = (e: MouseEvent) => {
      const s = drawStart.current; if (!s) return
      setDraw({ x: Math.min(s.x, e.clientX), y: Math.min(s.y, e.clientY), w: Math.abs(e.clientX - s.x), h: Math.abs(e.clientY - s.y) })
    }
    const up = () => { drawStart.current = null; setMode('idle') }
    document.addEventListener('mousedown', down, true)
    document.addEventListener('mousemove', move, true)
    document.addEventListener('mouseup', up, true)
    return () => { document.removeEventListener('mousedown', down, true); document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', up, true) }
  }, [mode])

  const saveComment = async () => {
    if (!draw) return
    const cx = draw.x + draw.w / 2, cy = draw.y + draw.h / 2
    const under = document.elementFromPoint(cx, cy) as Element | null
    const region: Record<string, string> = {}
    if (under && !under.closest('[data-design-tool]')) {
      const d = describe(under)
      if (d.design_id) region.design_id = d.design_id
      if (d.selector) region.selector = d.selector
      if (d.label) region.label = d.label
      const text = (under.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      if (text) region.near_text = text
    }
    const res = await saveDesignNote({ kind: 'comment', rect: draw, ...region, comment, ...captureContext() })
    flash(res.ok ? 'Kommentar sparad' : 'Kunde inte spara')
    setDraw(null); setComment('')
  }

  const saveGeneral = async () => {
    if (!genComment.trim()) return
    const res = await saveDesignNote({ kind: 'comment', comment: genComment.trim(), ...captureContext() })
    flash(res.ok ? 'Kommentar sparad' : 'Kunde inte spara')
    setGenComment(''); setMode('idle')
  }

  // Flytta panelen (dra i rubriken) → persistera offset.
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { x: e.clientX, y: e.clientY, dx: pos.dx, dy: pos.dy }
    const move = (ev: MouseEvent) => {
      const d = dragRef.current; if (!d) return
      setPos({ dx: d.dx + (ev.clientX - d.x), dy: d.dy + (ev.clientY - d.y) })
    }
    const up = () => {
      if (dragRef.current) patch({ pos })
      dragRef.current = null; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up)
    }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }
  // Persistera offset när dragget landat (pos hunnit uppdateras).
  useEffect(() => { if (!dragRef.current) patch({ pos }) }, [pos]) // eslint-disable-line react-hooks/exhaustive-deps

  const openNotes = useCallback(async () => { setMode('notes'); setNotes(await listDesignNotes()) }, [])
  const removeNote = async (id: string) => { if (await deleteDesignNote(id)) setNotes((n) => n.filter((x) => x.id !== id)) }

  const setTheme = useCallback((id: typeof state.theme) => { patch({ theme: id }); flash(`Chrome: ${DT_THEMES[id].name}`) }, [patch, flash])

  // Kommandopalettens kommandon (lyx-lager). Sektioner: Verktyg / Läge / Chrome.
  const commands: Command[] = [
    { id: 'pick', section: 'Verktyg', glyph: '⌖', title: 'Välj element', hint: 'shift = förälder', keywords: 'plock element style redigera', run: () => { setOpen(true); revertLive(); setMode('pick') } },
    { id: 'draw', section: 'Verktyg', glyph: '▭', title: 'Rita ruta', keywords: 'kommentar region', run: () => { setOpen(true); setDraw(null); setMode('draw') } },
    { id: 'gcomment', section: 'Verktyg', glyph: '✎', title: 'Fri kommentar', keywords: 'feedback text', run: () => { setOpen(true); exitMode(); setMode('gcomment') } },
    { id: 'notes', section: 'Verktyg', glyph: '☰', title: 'Anteckningar', keywords: 'lista sparade notes', run: () => { setOpen(true); void openNotes() } },
    // App-specifika kommandon: lägg till egna Command-objekt här (t.ex. dispatcha
    // ett eget window-event). Den porterade "Rutt-design" var app-projektet-specifik.
    { id: 'designmode', section: 'Läge', glyph: '▦', title: 'Öppna Design mode', hint: 'helskärm', keywords: 'canvas wireframe två-panel', run: () => { patch({ lastMode: 'design' }); setDesignMode(true) } },
    { id: 'close', section: 'Läge', glyph: '✕', title: 'Stäng verktyget', keywords: 'göm', run: () => { exitMode(); setOpen(false) } },
    ...DT_THEME_ORDER.map((id): Command => ({
      id: `chrome-${id}`, section: 'Chrome', glyph: '◐', title: DT_THEMES[id].name, hint: DT_THEMES[id].feel,
      active: state.theme === id, keywords: `tema stil ${DT_THEMES[id].feel}`, run: () => setTheme(id),
    })),
  ]

  // ── Positionering av overlay-panelen (fast läge ovanför launchern) ──
  const PANEL_W = 288
  const panelPos: React.CSSProperties = (() => {
    if (typeof window === 'undefined') return { left: 12, bottom: 52 }
    const M = 8, GAP = 10
    const vw = window.innerWidth, vh = window.innerHeight
    if (!anchor) return { left: 12, bottom: 56, maxHeight: vh - 2 * M }
    const left = Math.max(M, Math.min(anchor.left, vw - PANEL_W - M))
    const bottom = Math.max(M, vh - anchor.top + GAP)
    const maxHeight = Math.max(160, anchor.top - GAP - M)
    return { left, bottom, maxHeight }
  })()

  const themeVars = dtThemeVars(state.theme, reduced) as React.CSSProperties

  return (
    <div
      className="dt-root" data-design-tool
      style={{ ...themeVars, position: 'fixed', left: 12, bottom: 12, zIndex: 2147483000, fontFamily: 'var(--dt-font)', pointerEvents: 'none' }}
    >
      <style>{KEYFRAMES}</style>

      {/* Helskärms Design mode (skal – Post 3) */}
      {designMode && <div style={{ pointerEvents: 'auto' }}><DesignModeShell onExit={() => setDesignMode(false)} flash={flash} reduced={reduced} /></div>}

      {/* Kommandopalett (⌘K) */}
      <div style={{ pointerEvents: paletteOpen ? 'auto' : 'none' }}>
        <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--dt-space-2)' }}>
        {open && !designMode && (
          <div
            data-dt-panel
            style={{
              position: 'fixed', ...panelPos, width: PANEL_W, color: 'var(--dt-text)',
              background: 'var(--dt-surface)', backdropFilter: 'var(--dt-blur)',
              border: '1px solid var(--dt-border-strong)', borderRadius: 'var(--dt-radius-lg)',
              boxShadow: 'var(--dt-shadow-lg), var(--dt-glow)', padding: 'var(--dt-space-3)',
              pointerEvents: 'auto', overflowY: 'auto',
              transform: `translate(${pos.dx}px, ${pos.dy}px)`,
              animation: 'dtPop var(--dt-dur) var(--dt-spring)',
            }}
          >
            {/* Rubrik (dragbar) + chrome-växel + stäng */}
            <div onMouseDown={onDragStart} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--dt-space-2)', cursor: 'move', userSelect: 'none' }}>
              <span style={{ fontSize: 'var(--dt-text-sm)', fontWeight: 700, letterSpacing: 0.4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden style={{ color: 'var(--dt-accent)' }}>⠿</span> Designverktyg
                <span style={{ color: 'var(--dt-text-mute)', fontWeight: 500 }}>· admin</span>
              </span>
              <button type="button" aria-label="Stäng" onMouseDown={(e) => e.stopPropagation()} onClick={() => { exitMode(); setOpen(false) }} style={{ ...dtGhostBtn(), padding: '2px 8px' }}>✕</button>
            </div>

            {/* ⌘K-knapp + Design mode */}
            <div style={{ display: 'flex', gap: 'var(--dt-space-2)', marginBottom: 'var(--dt-space-2)' }}>
              <button type="button" onClick={() => setPaletteOpen(true)} style={{ ...dtGhostBtn(), flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Kommandon</span>
                <kbd style={{ fontSize: 'var(--dt-text-xs)', border: '1px solid var(--dt-border)', borderRadius: 'var(--dt-radius-sm)', padding: '1px 5px', color: 'var(--dt-text-mute)' }}>⌘K</kbd>
              </button>
              <button type="button" onClick={() => { patch({ lastMode: 'design' }); setDesignMode(true) }} style={dtBtn()}>▦ Design mode</button>
            </div>

            {/* Chrome-väljare (2–3 riktningar) */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--dt-space-3)', padding: 3, background: 'var(--dt-surface-2)', borderRadius: 'var(--dt-radius)', border: '1px solid var(--dt-border)' }}>
              {DT_THEME_ORDER.map((id) => (
                <button key={id} type="button" title={DT_THEMES[id].feel} onClick={() => setTheme(id)}
                  style={{
                    flex: 1, padding: '5px 4px', fontSize: 'var(--dt-text-xs)', fontWeight: 600, cursor: 'pointer',
                    borderRadius: 'var(--dt-radius-sm)', border: '1px solid ' + (state.theme === id ? 'var(--dt-border-strong)' : 'transparent'),
                    background: state.theme === id ? 'var(--dt-accent-weak)' : 'transparent',
                    color: state.theme === id ? 'var(--dt-accent)' : 'var(--dt-text-dim)',
                    transition: 'background var(--dt-dur-fast) var(--dt-spring)',
                  }}>
                  {DT_THEMES[id].short}
                </button>
              ))}
            </div>

            {/* Verktygsknappar */}
            <div style={{ display: 'flex', gap: 'var(--dt-space-2)', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => (mode === 'pick' ? exitMode() : (revertLive(), setMode('pick')))} style={dtGhostBtn(mode === 'pick')}>Välj element</button>
              <button type="button" onClick={() => (mode === 'draw' ? exitMode() : (setDraw(null), setMode('draw')))} style={dtGhostBtn(mode === 'draw')}>Rita ruta</button>
              <button type="button" onClick={() => (mode === 'gcomment' ? setMode('idle') : (exitMode(), setMode('gcomment')))} style={dtGhostBtn(mode === 'gcomment')}>Kommentar</button>
              <button type="button" onClick={() => (mode === 'notes' ? setMode('idle') : openNotes())} style={dtGhostBtn(mode === 'notes')}>Anteckningar</button>
            </div>

            {mode === 'pick' && <p style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-dim)', margin: '8px 2px 0', lineHeight: 1.5 }}>Klicka på ett element för att justera dess värden. <b>Shift-klick</b> = föräldra-elementet. Dra rubriken för att flytta panelen.</p>}
            {mode === 'draw' && <p style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-dim)', margin: '8px 2px 0' }}>Dra för att rita en ruta över det du vill kommentera.</p>}

            {mode === 'gcomment' && (
              <div style={{ marginTop: 'var(--dt-space-3)', borderTop: '1px solid var(--dt-border)', paddingTop: 'var(--dt-space-2)' }}>
                <p style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-dim)', margin: '0 0 6px' }}>Fri kommentar om den här sidan (ej kopplad till ett element).</p>
                <textarea value={genComment} onChange={(e) => setGenComment(e.target.value)} placeholder="Generell feedback om sidan…" rows={3} style={dtInput()} />
                <div style={{ display: 'flex', gap: 'var(--dt-space-2)', marginTop: 'var(--dt-space-2)' }}>
                  <button type="button" onClick={saveGeneral} style={{ ...dtBtn(true), flex: 1 }}>Spara kommentar</button>
                  <button type="button" onClick={() => { setGenComment(''); setMode('idle') }} style={dtGhostBtn()}>Avbryt</button>
                </div>
              </div>
            )}

            {/* HOOK-P4-PANEL: token-medveten egenskaps-panel (färg/opacitet/radie/
                ram/spacing + token-vs-override, pipett, senaste färger, WCAG). */}
            {panelEl && selInfo && (
              <div style={{ marginTop: 'var(--dt-space-3)', borderTop: '1px solid var(--dt-border)', paddingTop: 'var(--dt-space-2)' }}>
                {/* HOOK-P5-BREADCRUMB: element-verktygslåda (brödsmula/nudge/fil:rad). */}
                <ElementInspector el={panelEl} onSelect={selectElement} flash={flash} compact />
                <PropertyPanel el={panelEl} selInfo={selInfo} flash={flash} onClose={revertLive} compact />
              </div>
            )}

            {draw && mode !== 'draw' && (
              <div style={{ marginTop: 'var(--dt-space-3)', borderTop: '1px solid var(--dt-border)', paddingTop: 'var(--dt-space-2)' }}>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Kommentera rutans innehåll…" rows={3} style={dtInput()} />
                <div style={{ display: 'flex', gap: 'var(--dt-space-2)', marginTop: 'var(--dt-space-2)' }}>
                  <button type="button" onClick={saveComment} style={{ ...dtBtn(true), flex: 1 }}>Spara kommentar</button>
                  <button type="button" onClick={() => { setDraw(null); setComment('') }} style={dtGhostBtn()}>Avbryt</button>
                </div>
              </div>
            )}

            {mode === 'notes' && (
              <div style={{ marginTop: 'var(--dt-space-3)', borderTop: '1px solid var(--dt-border)', paddingTop: 'var(--dt-space-2)', maxHeight: 260, overflowY: 'auto' }}>
                {notes.length === 0 && <p style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)' }}>Inga anteckningar än.</p>}
                {notes.map((n) => (
                  <div key={n.id} style={{ fontSize: 'var(--dt-text-xs)', padding: '6px 0', borderBottom: '1px solid var(--dt-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ color: 'var(--dt-accent)' }}>{n.kind === 'style' ? 'stil' : 'kommentar'}</span>
                      <button type="button" onClick={() => removeNote(n.id)} style={{ ...dtGhostBtn(), padding: '0 6px' }}>ta bort</button>
                    </div>
                    <div style={{ color: 'var(--dt-text-dim)', wordBreak: 'break-word' }}>{n.comment || n.label || n.selector}</div>
                    <div style={{ color: 'var(--dt-text-mute)' }}>{n.page} · {n.theme}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Global launcher (göms när en yta redan har en Design-knapp, t.ex. kartraden) */}
        {!externalLauncher && !designMode && (
          <button type="button" onClick={(e) => toggleDesignTool(e.currentTarget.getBoundingClientRect())}
            style={{
              ...dtBtn(open), background: 'var(--dt-surface)', backdropFilter: 'var(--dt-blur)',
              border: '1px solid var(--dt-border-strong)', color: 'var(--dt-text)',
              boxShadow: 'var(--dt-shadow), var(--dt-glow)', pointerEvents: 'auto',
            }}>
            ✎ Design
          </button>
        )}
      </div>

      {/* Persistent selektions-outline (valt element, Post 5) – markant men precis.
          Ligger under hover-outlinen så en pågående hover fortsatt syns tydligast. */}
      {selRect && (
        <div aria-hidden style={{ position: 'fixed', left: selRect.x - 1, top: selRect.y - 1, width: selRect.w + 2, height: selRect.h + 2, border: '1.5px solid var(--dt-accent)', boxShadow: '0 0 0 1px var(--dt-surface-solid), var(--dt-glow)', pointerEvents: 'none', zIndex: 2147481500, borderRadius: 4, transition: reduced ? 'none' : 'all var(--dt-dur-fast) var(--dt-spring)' }}>
          <span style={{ position: 'absolute', top: -18, left: -1, fontSize: 10, fontWeight: 700, fontFamily: 'var(--dt-font-mono)', color: 'var(--dt-accent-contrast)', background: 'var(--dt-accent)', padding: '1px 6px', borderRadius: 'var(--dt-radius-sm)', whiteSpace: 'nowrap', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{selInfo?.design_id ? `#${selInfo.design_id}` : selInfo?.label}</span>
        </div>
      )}
      {/* Element-plock-highlight (accent-outline + snap-linje-krok Post 3) */}
      {hoverRect && (
        <div style={{ position: 'fixed', left: hoverRect.x, top: hoverRect.y, width: hoverRect.w, height: hoverRect.h, border: '2px solid var(--dt-accent)', background: 'var(--dt-accent-weak)', pointerEvents: 'none', zIndex: 2147482000, borderRadius: 3, transition: reduced ? 'none' : 'all var(--dt-dur-fast) var(--dt-spring)' }} />
      )}
      {/* Ritad ruta */}
      {draw && (
        <div style={{ position: 'fixed', left: draw.x, top: draw.y, width: draw.w, height: draw.h, border: '2px solid var(--dt-accent)', background: 'var(--dt-accent-weak)', pointerEvents: 'none', zIndex: 2147482000, borderRadius: 3 }} />
      )}

      {/* Toasts med inline-ångra */}
      <div style={{ position: 'fixed', left: '50%', bottom: 56, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', zIndex: 40, pointerEvents: 'none' }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--dt-space-3)',
            background: 'var(--dt-surface-raised)', backdropFilter: 'var(--dt-blur)',
            color: 'var(--dt-text)', padding: '8px 12px', borderRadius: 'var(--dt-radius)',
            border: '1px solid var(--dt-border)', boxShadow: 'var(--dt-shadow)',
            fontSize: 'var(--dt-text-sm)', pointerEvents: 'auto',
            animation: 'dtSlideUp var(--dt-dur) var(--dt-spring-bounce)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.tone === 'warn' ? '#f59e0b' : 'var(--dt-accent)', boxShadow: 'var(--dt-glow)' }} />
            <span>{t.msg}</span>
            {t.undo && <button type="button" onClick={() => runUndo(t)} style={{ ...dtGhostBtn(), padding: '2px 8px' }}>Ångra</button>}
            <button type="button" aria-label="Stäng" onClick={() => dismiss(t.id)} style={{ background: 'none', border: 'none', color: 'var(--dt-text-mute)', cursor: 'pointer', fontSize: 'var(--dt-text-sm)' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

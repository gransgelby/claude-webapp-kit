'use client'
// Design mode – HJÄLTEN (Post 3, nattjobb 2026-07-10). Två-panel-arbetsytan som
// är verktygets själva hjärta:
//   • VÄNSTER = den RIKTIGA sidan (den äkta sid-DOM:en flyttas in i ett
//     "device-fönster" och griddas om LIVE när man drar i wireframen).
//   • HÖGER  = en WIREFRAME av rutnätet: varje griddat område som ett block man
//     kan dra / resiza (i kolumnspann) / radera med grid-SNAP.
// Släpp en flytt → modellen skrivs till den riktiga DOM:en (CSS grid-column/row,
// aldrig JSX) → man ser resultatet direkt på den äkta sidan.
//
// GRID-AGNOSTISK: kolumnantal + gap läses LIVE ur sidans grid-container
// ([data-grid-cols] + gridTemplateColumns/gap) – aldrig hårdkodat 12. All snap-/
// mappnings-matematik ligger i lib/design/gridModel.ts (enhetstestad).
//
// Själv-responsiv: breda skärmar → två paneler; laptop → enkel-panel (wireframe)
// + en växel som visar den riktiga sidan. Desktop-only (artig notis på små skärmar).
// Lyx: zoom/pan-canvas (space-dra, ⌘±) + minikarta · snap-linjer + live-värde vid
// drag · fjäder-animationer som respekterar prefers-reduced-motion · undo/redo.
//
// KROKAR FÖR SENARE POSTER (sök på "HOOK:"):
//   HOOK-P4-PANEL     – egenskaps-panel (token-medveten) dockar i höger sidopanel
//   HOOK-P5-BREADCRUMB– element-brödsmula: klick på ett block → DOM-hierarki
//   HOOK-P6-LAYOUT    – align/distribute + mät-overlay ovanpå wireframe-canvasen
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GRID } from '@/lib/designToolAdapter'
import { saveDesignNote } from '@/lib/designToolAdapter'
import {
  clampPlacement, gridColumnValue, gridRowValue, placementFromGeometry,
  assignRowsByTop, normalizeRows, overlappingKeys, type GridArea, type GridGeom,
} from '@/lib/design/gridModel'
import {
  alignAreas, distributeAreas, measureGaps, areaWidthPx, insertPlaceholder,
  isPlaceholderKey, colEnd, type AlignEdge, type DistributeMode,
} from '@/lib/design/layoutTools'
import { dtBtn, dtGhostBtn } from './dtStyles'
import PropertyPanel from './PropertyPanel'
import ElementInspector from './ElementInspector'
import { describeNode, elementLabel } from '@/lib/design/elementModel'
import { dtKey } from '@/lib/design/dtConfig'

// Brytpunkter (verktyget är desktop-only + själv-responsivt).
const DESKTOP_MIN = 860   // under → artig notis, aktivera inte
const DUAL_MIN = 1180     // under → enkel-panel (wireframe) + växel
const MOBILE_W = 390      // "mobil"-förhandsvisningens bredd
// Wireframe-canvasens schematiska mått (logiska px vid zoom 1).
const ROW_H = 46
const ROW_GAP = 10
const WF_PAD = 20

type Props = { onExit: () => void; flash: (msg: string, undo?: () => void) => void; reduced: boolean }

interface RealRef { el: HTMLElement; orig: { gridColumn: string; gridRow: string; display: string } }

export default function DesignModeShell({ onExit, flash, reduced }: Props) {
  // ── Layout-läge (själv-responsivt) ──
  const [winW, setWinW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440)
  useEffect(() => {
    const on = () => setWinW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const tooSmall = winW < DESKTOP_MIN
  const dual = winW >= DUAL_MIN
  const [showRealSingle, setShowRealSingle] = useState(false) // enkel-panel: visa riktig sida
  const realVisible = dual || showRealSingle
  const [previewMobile, setPreviewMobile] = useState(false)

  // ── Modell + historik ──
  // OBS: all historik-/toast-logik ligger UTANFÖR state-updaters (React StrictMode
  // dubbel-invokerar updaters i dev → sido-effekter där skulle köra två ggr).
  const [areas, setAreas] = useState<GridArea[]>([])
  const areasRef = useRef<GridArea[]>([])
  useEffect(() => { areasRef.current = areas }, [areas])
  const past = useRef<GridArea[][]>([])
  const future = useRef<GridArea[][]>([])
  const [, forceHist] = useState(0)
  const bump = useCallback(() => forceHist((n) => n + 1), [])
  const realRefs = useRef<RealRef[]>([])
  const gridEl = useRef<HTMLElement | null>(null)
  const cols = useRef<number>(GRID.columns)
  const pageRoot = useRef<HTMLElement | null>(null)
  const pageOrig = useRef<Record<string, string>>({})

  // ── Zoom/pan (wireframe) ──
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [spaceDown, setSpaceDown] = useState(false)

  // ── Drag/resize-tillstånd (för snap-linjer + live-etikett) ──
  const [drag, setDrag] = useState<null | { key: string; kind: 'move' | 'resize'; area: GridArea; x: number; y: number }>(null)

  // ── Layout-verktyg (Post 6): multi-select + mät-overlay + geometri ──
  // Multi-select (⇧-klick i wireframen) driver align/distribute. Skilt från selKey
  // (egenskaps-panelens enkel-markering) så de inte krockar.
  const [selSet, setSelSet] = useState<Set<string>>(new Set())
  const [measure, setMeasure] = useState(false)
  const [geom, setGeom] = useState<GridGeom | null>(null)
  const toggleSel = useCallback((key: string) => {
    setSelSet((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  // ── Markerat block → token-medveten egenskaps-panel (Post 4, HOOK-P4-PANEL) ──
  // Klick på ett wireframe-blocks "◧"-knapp markerar dess RIKTIGA element så samma
  // PropertyPanel som i overlay-läget dockar här (token-vs-override funkar i BÅDA lägena).
  const [selKey, setSelKey] = useState<string | null>(null)
  // Brödsmule-drill (Post 5): navigering upp/ner i DOM-hierarkin väljer ett annat
  // riktigt element än blockets rot. `null` = blockets rot-element.
  const [drillEl, setDrillEl] = useState<HTMLElement | null>(null)
  const selectBlock = useCallback((area: GridArea) => {
    const ref = realRefs.current[Number(area.key)]
    if (!ref) { flash('Hittade inte elementet för blocket'); return }
    setDrillEl(null)
    setSelKey((k) => (k === area.key ? null : area.key))
  }, [flash])
  const blockEl = selKey != null ? realRefs.current[Number(selKey)]?.el ?? null : null
  const selectedEl = drillEl ?? blockEl
  const selectedArea = selKey != null ? areas.find((a) => a.key === selKey) : undefined
  const selInfo = selectedEl
    ? (drillEl
        ? { design_id: drillEl.dataset.designId, selector: elementLabel(describeNode(drillEl)), label: elementLabel(describeNode(drillEl)) }
        : (selectedArea ? { design_id: blockEl?.dataset.designId, selector: selectedArea.label || `block ${selKey}`, label: selectedArea.label || `block ${selKey}` } : null))
    : null

  // ── Selektions-outline över det riktiga elementet (i vänster device-fönster) ──
  const [selRect, setSelRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  useEffect(() => {
    if (!selectedEl || !realVisible) { setSelRect(null); return }
    const sync = () => {
      const r = selectedEl.getBoundingClientRect()
      setSelRect(r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null)
    }
    sync()
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    const id = window.setInterval(sync, 400) // följ live-omgriddning/animation
    return () => { window.removeEventListener('scroll', sync, true); window.removeEventListener('resize', sync); window.clearInterval(id) }
  }, [selectedEl, realVisible, areas])

  const wfViewport = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [wfW, setWfW] = useState(600)
  useEffect(() => {
    const el = wfViewport.current
    if (!el) return
    const ro = new ResizeObserver(() => setWfW(el.clientWidth))
    ro.observe(el); setWfW(el.clientWidth)
    return () => ro.disconnect()
  }, [dual, realVisible])

  // Schematisk cellbredd (logisk, oberoende av zoom).
  const cellW = Math.max(8, (wfW - 2 * WF_PAD) / cols.current)
  const rowStep = ROW_H + ROW_GAP
  const rowsCount = Math.max(1, ...areas.map((a) => a.row)) + 1

  // ── (1) Läs den riktiga sidan → bygg initial modell (grid-agnostisk) ──
  useEffect(() => {
    if (tooSmall) return
    const container = document.querySelector('[data-grid-cols]') as HTMLElement | null
    pageRoot.current = document.querySelector('[data-page-root]') as HTMLElement | null
    if (!container) { flash('Hittade inget grid på sidan (lägg vyn på <PageGrid>).'); return }
    gridEl.current = container
    const nCols = parseInt(container.dataset.gridCols || '', 10) || GRID.columns
    cols.current = nCols
    const cs = getComputedStyle(container)
    const gap = parseFloat(cs.columnGap || cs.gap || '0') || 0
    const padLeft = parseFloat(cs.paddingLeft || '0') || 0
    const padRight = parseFloat(cs.paddingRight || '0') || 0
    const cRect = container.getBoundingClientRect()
    const inner = cRect.width - padLeft - padRight
    const trackW = (inner - (nCols - 1) * gap) / nCols
    const geom: GridGeom = { cols: nCols, trackW, gap, originX: cRect.left + padLeft }
    setGeom(geom)

    const children = Array.from(container.children) as HTMLElement[]
    const refs: RealRef[] = []
    const raw: Array<GridArea & { top: number }> = []
    children.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const { colStart, span } = placementFromGeometry(r.left, r.width, geom)
      const label = pickLabel(el, i)
      refs.push({ el, orig: { gridColumn: el.style.gridColumn, gridRow: el.style.gridRow, display: el.style.display } })
      raw.push({ key: String(i), label, colStart, span, row: 1, top: r.top })
    })
    realRefs.current = refs
    const withRows = normalizeRows(assignRowsByTop(raw))
    // Kvarhållet tillstånd: återanvänd en sparad layout om den matchar antalet områden.
    const restored = loadLayout(location.pathname + location.search, withRows.length)
    setAreas(restored ?? withRows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooSmall])

  // ── (2) Relokera den riktiga sidan in i vänster "device-fönster" ──
  useEffect(() => {
    const root = pageRoot.current
    if (!root || tooSmall) return
    if (!realVisible) { restorePage(root, pageOrig.current); return }
    const place = () => {
      const stage = stageRef.current
      if (!stage || !root) return
      const s = stage.getBoundingClientRect()
      if (Object.keys(pageOrig.current).length === 0) {
        for (const k of ['position', 'left', 'top', 'width', 'height', 'margin', 'overflow', 'zIndex', 'boxShadow', 'borderRadius', 'transition']) {
          pageOrig.current[k] = root.style.getPropertyValue(k)
        }
      }
      const w = previewMobile ? MOBILE_W : Math.min(s.width - 24, 1280)
      const left = s.left + Math.max(0, (s.width - w) / 2)
      root.style.position = 'fixed'
      root.style.left = `${left}px`
      root.style.top = `${s.top}px`
      root.style.width = `${w}px`
      root.style.height = `${s.height}px`
      root.style.margin = '0'
      root.style.overflow = 'auto'
      root.style.zIndex = '10' // under .dt-root (2.1e9) → chrome/panel täcker; syns i hålet
      root.style.boxShadow = '0 10px 40px rgba(0,0,0,0.28)'
      root.style.borderRadius = '10px'
      root.style.transition = reduced ? 'none' : 'width 220ms cubic-bezier(0.22,1,0.36,1), left 220ms cubic-bezier(0.22,1,0.36,1)'
    }
    place()
    const ro = new ResizeObserver(place)
    if (stageRef.current) ro.observe(stageRef.current)
    window.addEventListener('resize', place)
    return () => { ro.disconnect(); window.removeEventListener('resize', place) }
  }, [realVisible, previewMobile, tooSmall, reduced])

  // Restore på unmount (avsluta Design mode).
  useEffect(() => {
    return () => {
      const root = pageRoot.current
      if (root) restorePage(root, pageOrig.current)
      for (const r of realRefs.current) {
        r.el.style.gridColumn = r.orig.gridColumn
        r.el.style.gridRow = r.orig.gridRow
        r.el.style.display = r.orig.display
      }
    }
  }, [])

  // ── (3) Applicera modellen → riktiga DOM:en (LIVE omgriddning) ──
  useEffect(() => {
    if (tooSmall) return
    areas.forEach((a) => {
      const ref = realRefs.current[Number(a.key)]
      if (!ref) return
      if (a.hidden) { ref.el.style.display = 'none'; return }
      ref.el.style.display = ref.orig.display || ''
      ref.el.style.gridColumn = gridColumnValue(a)
      ref.el.style.gridRow = gridRowValue(a)
      if (!reduced) ref.el.style.transition = 'grid-column 200ms cubic-bezier(0.22,1,0.36,1)'
    })
  }, [areas, tooSmall, reduced])

  // ── Historik (sido-effektfria setters – se not ovan) ──
  const undo = useCallback(() => {
    const p = past.current.pop()
    if (!p) return
    future.current.push(areasRef.current)
    areasRef.current = p
    setAreas(p); bump()
  }, [bump])
  const redo = useCallback(() => {
    const f = future.current.pop()
    if (!f) return
    past.current.push(areasRef.current)
    areasRef.current = f
    setAreas(f); bump()
  }, [bump])

  /** Committa en ny modell + valfri toast med inline-ångra. Ren: pushar historik
   *  utanför updatern (StrictMode-säkert), synkar areasRef direkt. */
  const commitAreas = useCallback((next: GridArea[], msg?: string) => {
    const snapshot = areasRef.current
    const normalized = normalizeRows(next)
    past.current.push(snapshot); future.current = []
    areasRef.current = normalized
    setAreas(normalized); bump()
    if (msg) flash(msg, undo)
  }, [bump, flash, undo])

  // ── Tangentbord: undo/redo + zoom + space-pan ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) { setSpaceDown(true) }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); e.shiftKey ? redo() : undo()
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom((z) => Math.min(2.2, z + 0.15)) }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); setZoom((z) => Math.max(0.5, z - 0.15)) }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); setZoom(1); setPan({ x: 0, y: 0 }) }
      if (e.key === 'Escape') onExit()
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceDown(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [undo, redo, onExit])

  // ── Wireframe: klient→canvas-koordinater (kompenserar zoom/pan) ──
  const clientToCanvas = useCallback((cx: number, cy: number) => {
    const rect = wfViewport.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (cx - rect.left - pan.x) / zoom - WF_PAD, y: (cy - rect.top - pan.y) / zoom - WF_PAD }
  }, [pan, zoom])

  // ── Panorera (space-dra eller mellanmus) på canvasens tomma yta ──
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (!(spaceDown || e.button === 1)) return
    e.preventDefault()
    const start = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    const move = (ev: PointerEvent) => setPan({ x: start.px + (ev.clientX - start.x), y: start.py + (ev.clientY - start.y) })
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // ── Dra ett område (flytt/resize) i wireframen med grid-snap ──
  const startAreaDrag = (e: React.PointerEvent, area: GridArea, kind: 'move' | 'resize') => {
    if (spaceDown) return
    // ⇧-klick = multi-select för align/distribute (dra INTE).
    if (e.shiftKey && kind === 'move') { e.preventDefault(); e.stopPropagation(); toggleSel(area.key); return }
    e.preventDefault(); e.stopPropagation()
    const startArea = { ...area }
    const startSnapshot = areasRef.current            // pre-drag → historik-post vid commit
    let lastArea = startArea                          // senaste placering (för commit)
    const start = clientToCanvas(e.clientX, e.clientY)
    setDrag({ key: area.key, kind, area: startArea, x: start.x, y: start.y })
    const move = (ev: PointerEvent) => {
      const p = clientToCanvas(ev.clientX, ev.clientY)
      const dCols = Math.round((p.x - start.x) / cellW)
      const dRows = Math.round((p.y - start.y) / rowStep)
      let next: GridArea
      if (kind === 'move') {
        const { colStart, span } = clampPlacement(startArea.colStart + dCols, startArea.span, cols.current)
        next = { ...startArea, colStart, span, row: Math.max(1, startArea.row + dRows) }
      } else {
        const { colStart, span } = clampPlacement(startArea.colStart, startArea.span + dCols, cols.current)
        next = { ...startArea, colStart, span }
      }
      lastArea = next
      setDrag({ key: area.key, kind, area: next, x: p.x, y: p.y })
      // Live-preview på riktiga sidan under draget (ren updater, ingen historik).
      setAreas((prev) => prev.map((a) => (a.key === area.key ? next : a)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setDrag(null)
      const moved = lastArea.colStart !== startArea.colStart || lastArea.span !== startArea.span || lastArea.row !== startArea.row
      if (!moved) { setAreas(startSnapshot); areasRef.current = startSnapshot; return }
      // Historik: pusha pre-drag-snapshotet (inte live-previewen), committa slutläget.
      past.current.push(startSnapshot); future.current = []
      const final = normalizeRows(startSnapshot.map((a) => (a.key === area.key ? lastArea : a)))
      areasRef.current = final
      setAreas(final); bump()
      flash(`${startArea.label}: kol ${lastArea.colStart}–${lastArea.colStart + lastArea.span - 1} · span ${lastArea.span}`, undo)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const deleteArea = (area: GridArea) => {
    commitAreas(areasRef.current.map((a) => (a.key === area.key ? { ...a, hidden: true } : a)), `${area.label} dolt`)
  }
  const restoreHidden = () => {
    commitAreas(areasRef.current.map((a) => ({ ...a, hidden: false })), 'Alla områden återställda')
  }

  const rebuildFromGeometry = useCallback(() => {
    const container = gridEl.current
    if (!container) return
    const nCols = cols.current
    const cs = getComputedStyle(container)
    const gap = parseFloat(cs.columnGap || cs.gap || '0') || 0
    const padLeft = parseFloat(cs.paddingLeft || '0') || 0
    const cRect = container.getBoundingClientRect()
    const inner = cRect.width - padLeft - (parseFloat(cs.paddingRight || '0') || 0)
    const trackW = (inner - (nCols - 1) * gap) / nCols
    const geom: GridGeom = { cols: nCols, trackW, gap, originX: cRect.left + padLeft }
    setGeom(geom)
    const raw = realRefs.current.map((ref, i) => {
      const r = ref.el.getBoundingClientRect()
      const { colStart, span } = placementFromGeometry(r.left, r.width, geom)
      return { key: String(i), label: pickLabel(ref.el, i), colStart, span, row: 1, top: r.top }
    })
    return normalizeRows(assignRowsByTop(raw))
  }, [])

  const resetLayout = () => {
    const snapshot = areasRef.current
    // Rensa alla inline-overrides → läs om den ursprungliga (Tailwind-)layouten ur geometrin.
    for (const r of realRefs.current) { r.el.style.gridColumn = r.orig.gridColumn; r.el.style.gridRow = r.orig.gridRow; r.el.style.display = r.orig.display }
    const rebuilt = rebuildFromGeometry()
    if (!rebuilt) return
    past.current.push(snapshot); future.current = []
    areasRef.current = rebuilt
    setAreas(rebuilt); bump()
    flash('Layout nollställd', undo)
  }

  // ── Spara layout-intent → design-notes (samma väg som shellens övriga sparningar) ──
  const [saving, setSaving] = useState(false)
  const saveLayout = async () => {
    setSaving(true)
    const page = location.pathname + location.search
    persistLayout(page, areas)
    const payload = {
      kind: 'layout' as const,
      page,
      theme: document.documentElement.dataset.theme || 'standard',
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
      layout: { cols: cols.current, gapVar: GRID.gapVar, page, areas: areas.map(({ key, label, colStart, span, row, hidden, placeholder }) => ({ key, label, colStart, span, row, hidden, placeholder })) },
      comment: `Layout-förslag (${cols.current}-kol): ${areas.filter((a) => !a.hidden).map((a) => `${a.label} kol ${a.colStart}–${a.colStart + a.span - 1}`).join('; ')}`,
    }
    const res = await saveDesignNote(payload)
    setSaving(false)
    flash(res.ok ? 'Layout-förslag sparat → design-notes' : 'Kunde inte spara layouten')
  }

  // ── Layout-verktyg: align / distribute / komponent-ins (Post 6) ──
  const doAlign = useCallback((edge: AlignEdge) => {
    if (selSet.size < 2) { flash('Välj minst 2 block (⇧-klick) att justera'); return }
    const labels: Record<AlignEdge, string> = { left: 'vänster', center: 'centrerade', right: 'höger', top: 'topp', middle: 'mitten', bottom: 'botten' }
    commitAreas(alignAreas(areasRef.current, selSet, edge, cols.current), `${selSet.size} block ${labels[edge]}-justerade`)
  }, [selSet, commitAreas, flash])
  const doDistribute = useCallback((mode: DistributeMode) => {
    if (selSet.size < 3) { flash('Välj minst 3 block (⇧-klick) att fördela'); return }
    commitAreas(distributeAreas(areasRef.current, selSet, mode, cols.current), mode === 'gaps' ? `${selSet.size} block · lika mellanrum` : `${selSet.size} block · lika bredd`)
  }, [selSet, commitAreas, flash])
  const doInsert = useCallback(() => {
    const { areas: next, key } = insertPlaceholder(areasRef.current, cols.current)
    commitAreas(next, 'Platshållar-block infogat')
    setSelSet(new Set([key]))
  }, [commitAreas])

  const overlaps = useMemo(() => overlappingKeys(areas), [areas])
  // Mät-overlay: mellanrum (px + närmaste token) mellan intilliggande block per rad;
  // om ≥2 valda → bara mellan de valda. Rent uträknat i lib/design/layoutTools.
  const measures = useMemo(
    () => (measure && geom ? measureGaps(areas, geom, selSet.size >= 2 ? selSet : undefined) : []),
    [measure, geom, areas, selSet],
  )
  const canUndo = past.current.length > 0
  const canRedo = future.current.length > 0

  // ── Notis på för små skärmar (desktop-only) ──
  if (tooSmall) {
    return (
      <div role="dialog" aria-label="Design mode" style={fullOverlay(reduced)}>
        <div style={{ margin: 'auto', maxWidth: 340, textAlign: 'center', padding: 'var(--dt-space-5)' }}>
          <div aria-hidden style={{ fontSize: 44, marginBottom: 'var(--dt-space-3)' }}>🖥</div>
          <h2 style={{ fontSize: 'var(--dt-text-lg)', fontWeight: 700, marginBottom: 'var(--dt-space-2)' }}>Design mode är desktop-only</h2>
          <p style={{ fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text-dim)', lineHeight: 1.55, marginBottom: 'var(--dt-space-4)' }}>
            Arbetsytan behöver en bredare skärm (minst {DESKTOP_MIN}px) för att visa den riktiga sidan bredvid wireframen. Öppna på en större skärm.
          </p>
          <button type="button" onClick={onExit} style={dtBtn()}>Stäng</button>
        </div>
      </div>
    )
  }

  const RIGHT_W = dual ? Math.max(360, Math.min(560, winW * 0.42)) : winW
  const HEAD_H = 52
  const FOOT_H = 34

  return (
    <div role="dialog" aria-label="Design mode" data-dt-designmode style={{ ...fullOverlay(reduced), background: 'transparent', pointerEvents: 'none' }}>
      {/* ── Topp-chrome (opak; täcker toppremsan) ── */}
      <header style={{
        pointerEvents: 'auto', position: 'absolute', top: 0, left: 0, right: 0, height: HEAD_H,
        display: 'flex', alignItems: 'center', gap: 'var(--dt-space-3)', padding: '0 var(--dt-space-4)',
        borderBottom: '1px solid var(--dt-border)', background: 'var(--dt-surface-solid)', color: 'var(--dt-text)',
        fontFamily: 'var(--dt-font)', zIndex: 3,
      }}>
        <span style={{ fontSize: 'var(--dt-text-lg)', fontWeight: 700, letterSpacing: 0.3 }}>Design&nbsp;mode</span>
        <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)' }}>{cols.current}-kol · grid-agnostisk</span>
        <div style={{ flex: 1 }} />

        {/* Desktop/mobil-förhandsvisning av sidan */}
        {realVisible && (
          <div style={seg()}>
            <button type="button" onClick={() => setPreviewMobile(false)} style={segBtn(!previewMobile)}>🖥 Desktop</button>
            <button type="button" onClick={() => setPreviewMobile(true)} style={segBtn(previewMobile)}>📱 Mobil</button>
          </div>
        )}
        {/* Enkel-panel: växla riktig sida ↔ wireframe */}
        {!dual && (
          <button type="button" onClick={() => setShowRealSingle((v) => !v)} style={dtGhostBtn(showRealSingle)}>
            {showRealSingle ? '▦ Visa wireframe' : '🖥 Visa riktig sida'}
          </button>
        )}

        {/* Undo/redo */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={undo} disabled={!canUndo} style={dtGhostBtn(false, !canUndo)} title="Ångra (⌘Z)">↶</button>
          <button type="button" onClick={redo} disabled={!canRedo} style={dtGhostBtn(false, !canRedo)} title="Gör om (⌘⇧Z)">↷</button>
        </div>
        {/* Zoom */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} style={dtGhostBtn()}>−</button>
          <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(2.2, z + 0.15))} style={dtGhostBtn()}>+</button>
        </div>
        <button type="button" onClick={saveLayout} disabled={saving} style={dtBtn(true)}>{saving ? 'Sparar…' : '↑ Spara layout'}</button>
        <button type="button" onClick={onExit} style={dtBtn()}>Avsluta</button>
      </header>

      {/* ── Vänster: device-fönster för den RIKTIGA sidan (transparent hål) ── */}
      {realVisible && (
        <div
          ref={stageRef}
          style={{
            pointerEvents: 'none', position: 'absolute', top: HEAD_H, bottom: FOOT_H,
            left: 0, right: dual ? RIGHT_W : 0, background: 'transparent',
          }}
        >
          <div style={{ position: 'absolute', top: 8, left: 12, fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', fontFamily: 'var(--dt-font)', pointerEvents: 'none' }}>
            Riktig sida · {previewMobile ? `mobil ${MOBILE_W}px` : 'desktop'} · live-omgriddad
          </div>
        </div>
      )}

      {/* Selektions-outline över det valda riktiga elementet (Post 5) */}
      {realVisible && selRect && (
        <div aria-hidden style={{ position: 'fixed', left: selRect.x - 1, top: selRect.y - 1, width: selRect.w + 2, height: selRect.h + 2, border: '1.5px solid var(--dt-accent)', boxShadow: 'var(--dt-glow)', borderRadius: 4, pointerEvents: 'none', zIndex: 4 }}>
          <span style={{ position: 'absolute', top: -18, left: -1, fontSize: 10, fontWeight: 700, fontFamily: 'var(--dt-font-mono)', color: 'var(--dt-accent-contrast)', background: 'var(--dt-accent)', padding: '1px 6px', borderRadius: 'var(--dt-radius-sm)', whiteSpace: 'nowrap', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{selInfo?.label}</span>
        </div>
      )}

      {/* ── Höger: WIREFRAME-panel ── */}
      <div style={{
        pointerEvents: 'auto', position: 'absolute', top: HEAD_H, bottom: FOOT_H, right: 0,
        width: dual ? RIGHT_W : winW, borderLeft: dual ? '1px solid var(--dt-border)' : 'none',
        background: 'var(--dt-surface-solid)', color: 'var(--dt-text)', fontFamily: 'var(--dt-font)',
        display: (!dual && showRealSingle) ? 'none' : 'flex', flexDirection: 'column', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: 'var(--dt-space-2) var(--dt-space-4)', borderBottom: '1px solid var(--dt-border)', background: 'var(--dt-surface-2)' }}>
          <span style={{ fontSize: 'var(--dt-text-sm)', fontWeight: 600 }}>Wireframe</span>
          <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)' }}>dra · resiza kanten · ✕ raderar · space-dra panorerar</span>
          <div style={{ flex: 1 }} />
          {areas.some((a) => a.hidden) && <button type="button" onClick={restoreHidden} style={{ ...dtGhostBtn(), padding: '2px 8px' }}>Återställ dolda</button>}
          <button type="button" onClick={resetLayout} style={{ ...dtGhostBtn(), padding: '2px 8px' }}>Nollställ</button>
        </div>

        {/* ── Layout-verktygsrad (Post 6): align · distribute · mät · komponent-ins ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: 'var(--dt-space-2) var(--dt-space-4)', borderBottom: '1px solid var(--dt-border)', background: 'var(--dt-surface-solid)' }}>
          <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', fontVariantNumeric: 'tabular-nums', minWidth: 62 }}>
            {selSet.size > 0 ? `${selSet.size} valda` : 'Layout'}
          </span>
          {/* Justera (kräver ≥2 valda) */}
          <div style={tbGroup()} role="group" aria-label="Justera">
            <button type="button" onClick={() => doAlign('left')} title="Vänsterjustera" aria-label="Vänsterjustera" style={tbBtn()}>⇤</button>
            <button type="button" onClick={() => doAlign('center')} title="Centrera (kolumn)" aria-label="Centrera horisontellt" style={tbBtn()}>⇥⇤</button>
            <button type="button" onClick={() => doAlign('right')} title="Högerjustera" aria-label="Högerjustera" style={tbBtn()}>⇥</button>
            <span style={tbSep()} />
            <button type="button" onClick={() => doAlign('top')} title="Toppjustera (rad)" aria-label="Toppjustera" style={tbBtn()}>⤒</button>
            <button type="button" onClick={() => doAlign('middle')} title="Mittjustera (rad)" aria-label="Mittjustera" style={tbBtn()}>⇕</button>
            <button type="button" onClick={() => doAlign('bottom')} title="Bottenjustera (rad)" aria-label="Bottenjustera" style={tbBtn()}>⤓</button>
          </div>
          {/* Fördela (kräver ≥3 valda) */}
          <div style={tbGroup()} role="group" aria-label="Fördela">
            <button type="button" onClick={() => doDistribute('gaps')} title="Fördela: lika mellanrum" aria-label="Fördela lika mellanrum" style={tbBtn()}>⇹</button>
            <button type="button" onClick={() => doDistribute('spans')} title="Fördela: lika bredd" aria-label="Fördela lika bredd" style={tbBtn()}>▥</button>
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={() => setMeasure((m) => !m)} title="Mät-overlay (gap i px + token)" aria-pressed={measure} style={{ ...tbBtn(measure), width: 'auto', padding: '0 8px' }}>📐 Mät</button>
          <button type="button" onClick={doInsert} title="Infoga platshållar-block (ny sektion)" style={{ ...tbBtn(), width: 'auto', padding: '0 8px' }}>＋ Sektion</button>
          {selSet.size > 0 && <button type="button" onClick={() => setSelSet(new Set())} title="Avmarkera alla" style={{ ...dtGhostBtn(), padding: '2px 8px' }}>Rensa val</button>}
        </div>

        {/* Canvas-viewport (zoom/pan) */}
        <div
          ref={wfViewport}
          onPointerDown={onCanvasPointerDown}
          style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', cursor: spaceDown ? 'grab' : 'default', background: 'var(--dt-surface)' }}
        >
          <div style={{
            position: 'absolute', top: 0, left: 0, transformOrigin: '0 0',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: reduced ? 'none' : 'transform 120ms cubic-bezier(0.22,1,0.36,1)',
            width: wfW, padding: WF_PAD,
          }}>
            {/* Kolumn-guider (grid-agnostiska: cols.current spår) */}
            <div aria-hidden style={{ position: 'absolute', top: WF_PAD, left: WF_PAD, right: WF_PAD, bottom: WF_PAD, display: 'grid', gridTemplateColumns: `repeat(${cols.current}, 1fr)`, gap: 0, pointerEvents: 'none' }}>
              {Array.from({ length: cols.current }).map((_, i) => (
                <div key={i} style={{ borderRight: i < cols.current - 1 ? '1px dashed var(--dt-border)' : 'none' }} />
              ))}
            </div>

            {/* Snap-linjer + mål-cell under drag */}
            {drag && (() => {
              const a = drag.area
              const left = (a.colStart - 1) * cellW
              const top = (a.row - 1) * rowStep
              return (
                <>
                  <div aria-hidden style={{ position: 'absolute', top: WF_PAD, bottom: WF_PAD, left: WF_PAD + left, width: 0, borderLeft: '1.5px solid var(--dt-accent)' }} />
                  <div aria-hidden style={{ position: 'absolute', top: WF_PAD, bottom: WF_PAD, left: WF_PAD + left + a.span * cellW, width: 0, borderLeft: '1.5px solid var(--dt-accent)' }} />
                  <div aria-hidden style={{ position: 'absolute', left: WF_PAD + left, top: WF_PAD + top, width: a.span * cellW, height: ROW_H, background: 'var(--dt-accent-weak)', border: '1.5px solid var(--dt-accent)', borderRadius: 'var(--dt-radius-sm)', pointerEvents: 'none' }} />
                </>
              )
            })()}

            {/* Områdes-block */}
            {areas.filter((a) => !a.hidden).map((a) => {
              const left = (a.colStart - 1) * cellW
              const top = (a.row - 1) * rowStep
              const w = a.span * cellW
              const bad = overlaps.has(a.key)
              const isDrag = drag?.key === a.key
              const isSel = selSet.has(a.key)
              const isPh = isPlaceholderKey(a.key)
              return (
                <div
                  key={a.key}
                  onPointerDown={(e) => startAreaDrag(e, a, 'move')}
                  style={{
                    position: 'absolute', left: WF_PAD + left, top: WF_PAD + top, width: Math.max(cellW - 4, w - 4), height: ROW_H,
                    background: isDrag ? 'var(--dt-accent-weak)' : isPh ? 'var(--dt-surface-2)' : 'var(--dt-surface-raised)',
                    border: `1px ${isPh ? 'dashed' : 'solid'} ${bad ? '#f59e0b' : isSel ? 'var(--dt-accent)' : isDrag ? 'var(--dt-border-strong)' : 'var(--dt-border)'}`,
                    outline: isSel ? '2px solid var(--dt-accent)' : 'none', outlineOffset: 1,
                    borderRadius: 'var(--dt-radius-sm)', boxShadow: isSel ? 'var(--dt-glow)' : 'var(--dt-shadow)', cursor: spaceDown ? 'grab' : 'move',
                    display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6, userSelect: 'none',
                    transition: (reduced || isDrag) ? 'none' : 'left 160ms cubic-bezier(0.22,1,0.36,1), width 160ms cubic-bezier(0.22,1,0.36,1), top 160ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                  title={`${a.label} · kol ${a.colStart}–${colEnd(a)} · span ${a.span}${isPh ? ' · platshållare' : ''} · ⇧-klick markerar`}
                >
                  {isSel && <span aria-hidden style={{ fontSize: 11, color: 'var(--dt-accent)', lineHeight: 1 }}>✓</span>}
                  <span style={{ fontSize: 'var(--dt-text-xs)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, fontStyle: isPh ? 'italic' : 'normal', color: isPh ? 'var(--dt-text-dim)' : 'var(--dt-text)' }}>{isPh ? `＋ ${a.label}` : a.label}</span>
                  <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', fontVariantNumeric: 'tabular-nums' }}>{a.span}</span>
                  {!isPh && <button type="button" aria-label="Egenskaper" title="Egenskaper (färg/token)" onPointerDown={(e) => { e.stopPropagation(); selectBlock(a) }} style={{ background: 'none', border: 'none', color: selKey === a.key ? 'var(--dt-accent)' : 'var(--dt-text-mute)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>◧</button>}
                  <button type="button" aria-label="Radera område" onPointerDown={(e) => { e.stopPropagation(); deleteArea(a) }} style={{ background: 'none', border: 'none', color: 'var(--dt-text-mute)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>✕</button>
                  {/* Resize-handtag (höger kant) */}
                  <span onPointerDown={(e) => startAreaDrag(e, a, 'resize')} style={{ position: 'absolute', right: -3, top: 0, bottom: 0, width: 8, cursor: 'ew-resize' }} />
                </div>
              )
            })}

            {/* ── Mät-overlay (Post 6): gap i px + närmaste token mellan block per rad ── */}
            {measure && measures.map((m, i) => {
              const a = areas.find((x) => x.key === m.aKey)
              const b = areas.find((x) => x.key === m.bKey)
              if (!a || !b) return null
              const gx = WF_PAD + colEnd(a) * cellW           // vänsterkant på mellanrummet
              const gw = Math.max(0, (b.colStart - 1 - colEnd(a)) * cellW)
              const gy = WF_PAD + (a.row - 1) * rowStep
              const midY = gy + ROW_H / 2
              return (
                <div key={`m${i}`} aria-hidden style={{ position: 'absolute', left: gx, top: midY - 9, width: gw, height: 18, pointerEvents: 'none' }}>
                  {/* mät-band */}
                  <div style={{ position: 'absolute', top: 8, left: 0, right: 0, height: 0, borderTop: '1px dashed var(--dt-accent)' }} />
                  <div style={{ position: 'absolute', top: 4, left: 0, height: 8, width: 0, borderLeft: '1px solid var(--dt-accent)' }} />
                  <div style={{ position: 'absolute', top: 4, right: 0, height: 8, width: 0, borderLeft: '1px solid var(--dt-accent)' }} />
                  <span style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 9, fontWeight: 700, fontFamily: 'var(--dt-font-mono)', color: 'var(--dt-accent-contrast)', background: m.token.onToken ? 'var(--dt-accent)' : '#f59e0b', padding: '1px 5px', borderRadius: 'var(--dt-radius-sm)', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(m.px)}px · {m.token.onToken ? m.token.name : `~${m.token.name}`}
                  </span>
                </div>
              )
            })}
            {/* Blockmått (bredd i px + höjd ur riktiga elementet) under mät-läge */}
            {measure && geom && areas.filter((a) => !a.hidden).map((a) => {
              const left = (a.colStart - 1) * cellW
              const top = (a.row - 1) * rowStep
              const w = a.span * cellW
              const h = Math.round(realRefs.current[Number(a.key)]?.el.getBoundingClientRect().height ?? 0)
              return (
                <span key={`w${a.key}`} aria-hidden style={{ position: 'absolute', left: WF_PAD + left, top: WF_PAD + top + ROW_H + 1, width: Math.max(cellW, w), textAlign: 'center', fontSize: 9, fontFamily: 'var(--dt-font-mono)', color: 'var(--dt-text-mute)', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
                  {Math.round(areaWidthPx(a, geom))}px{h ? ` × ${h}` : ''}
                </span>
              )
            })}

            <div style={{ height: rowsCount * rowStep + WF_PAD }} />
          </div>

          {/* Live-värde-etikett vid drag */}
          {drag && (
            <div style={{
              position: 'absolute', left: 12, bottom: 12, pointerEvents: 'none',
              background: 'var(--dt-surface-raised)', border: '1px solid var(--dt-border-strong)', borderRadius: 'var(--dt-radius-sm)',
              padding: '4px 10px', fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text)', boxShadow: 'var(--dt-shadow)', fontVariantNumeric: 'tabular-nums',
            }}>
              {drag.area.label} · <b>col {drag.area.colStart}–{drag.area.colStart + drag.area.span - 1}</b> · span {drag.area.span}{drag.kind === 'move' ? ` · rad ${drag.area.row}` : ''}
            </div>
          )}

          {/* HOOK-P4-PANEL: token-medveten egenskaps-panel dockar här (höger inre
              kolumn), samma komponent som overlay-läget → token-vs-override i BÅDA lägena.
              HOOK-P5-BREADCRUMB: klick på ett block → DOM-brödsmula.
              HOOK-P6-LAYOUT: align/distribute + mät-overlay ovanpå canvasen. */}
          {selectedEl && selInfo && (
            <div style={{
              position: 'absolute', top: 12, right: 12, width: 300, maxHeight: 'calc(100% - 24px)', overflowY: 'auto',
              background: 'var(--dt-surface-solid)', border: '1px solid var(--dt-border-strong)', borderRadius: 'var(--dt-radius-lg)',
              boxShadow: 'var(--dt-shadow-lg), var(--dt-glow)', padding: 'var(--dt-space-3)', zIndex: 6, pointerEvents: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--dt-space-2)' }}>
                <span style={{ fontSize: 'var(--dt-text-sm)', fontWeight: 700 }}>Egenskaper</span>
                <button type="button" aria-label="Stäng" onClick={() => { setSelKey(null); setDrillEl(null) }} style={{ ...dtGhostBtn(), padding: '2px 8px' }}>✕</button>
              </div>
              {/* HOOK-P5-BREADCRUMB: element-verktygslåda (brödsmula/nudge/fil:rad). */}
              <ElementInspector el={selectedEl} onSelect={(e) => setDrillEl(e)} flash={flash} compact />
              <PropertyPanel el={selectedEl} selInfo={selInfo} flash={flash} onClose={() => { setSelKey(null); setDrillEl(null) }} />
            </div>
          )}

          {/* Minikarta (HOOK-P3-MINIMAP) */}
          <Minimap wfW={wfW} rowsCount={rowsCount} rowStep={rowStep} pan={pan} zoom={zoom} viewportW={wfW} viewportH={wfViewport.current?.clientHeight ?? 400} />
        </div>
      </div>

      {/* ── Botten-chrome ── */}
      <footer style={{
        pointerEvents: 'auto', position: 'absolute', bottom: 0, left: 0, right: 0, height: FOOT_H,
        display: 'flex', alignItems: 'center', gap: 'var(--dt-space-3)', padding: '0 var(--dt-space-4)',
        borderTop: '1px solid var(--dt-border)', background: 'var(--dt-surface-solid)', color: 'var(--dt-text-mute)',
        fontSize: 'var(--dt-text-xs)', fontFamily: 'var(--dt-font)', zIndex: 3,
      }}>
        <span>{dual ? 'Två-panel: riktig sida | wireframe' : (showRealSingle ? 'Enkel-panel: riktig sida' : 'Enkel-panel: wireframe')}</span>
        <div style={{ flex: 1 }} />
        <span>{areas.filter((a) => !a.hidden).length} områden · ⇧-klick markerar (align/distribute) · ⌘Z ångra · ⌘± zoom</span>
      </footer>
    </div>
  )
}

// ── Minikarta ──
function Minimap({ wfW, rowsCount, rowStep, pan, zoom, viewportW, viewportH }: { wfW: number; rowsCount: number; rowStep: number; pan: { x: number; y: number }; zoom: number; viewportW: number; viewportH: number }) {
  const contentH = rowsCount * rowStep + 2 * WF_PAD
  const contentW = wfW
  const MM_W = 132
  const scale = MM_W / contentW
  const mmH = Math.max(40, Math.min(160, contentH * scale))
  // Viewport-rektangel (vad som syns i canvasen), i innehålls-koordinater.
  const viewLeft = (-pan.x / zoom) * scale
  const viewTop = (-pan.y / zoom) * scale
  const viewW = (viewportW / zoom) * scale
  const viewH = (viewportH / zoom) * scale
  return (
    <div aria-hidden style={{ position: 'absolute', right: 12, bottom: 12, width: MM_W, height: mmH, background: 'var(--dt-surface-2)', border: '1px solid var(--dt-border)', borderRadius: 'var(--dt-radius-sm)', overflow: 'hidden', pointerEvents: 'none', boxShadow: 'var(--dt-shadow)' }}>
      <div style={{ position: 'absolute', left: Math.max(0, viewLeft), top: Math.max(0, viewTop), width: Math.min(MM_W, viewW), height: Math.min(mmH, viewH), border: '1.5px solid var(--dt-accent)', background: 'var(--dt-accent-weak)', borderRadius: 3 }} />
    </div>
  )
}

// ── Hjälpare ──
function fullOverlay(reduced: boolean): React.CSSProperties {
  return {
    position: 'fixed', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column',
    background: 'var(--dt-surface-solid)', color: 'var(--dt-text)', fontFamily: 'var(--dt-font)',
    animation: reduced ? 'none' : 'dtFade var(--dt-dur) var(--dt-spring)',
  }
}

function seg(): React.CSSProperties {
  return { display: 'flex', gap: 2, padding: 2, background: 'var(--dt-surface-2)', borderRadius: 'var(--dt-radius)', border: '1px solid var(--dt-border)' }
}
function segBtn(on: boolean): React.CSSProperties {
  return {
    padding: '3px 9px', fontSize: 'var(--dt-text-xs)', fontWeight: 600, cursor: 'pointer',
    borderRadius: 'var(--dt-radius-sm)', border: '1px solid ' + (on ? 'var(--dt-border-strong)' : 'transparent'),
    background: on ? 'var(--dt-accent-weak)' : 'transparent', color: on ? 'var(--dt-accent)' : 'var(--dt-text-dim)',
  }
}

// ── Layout-verktygsradens knappar (Post 6) ──
function tbGroup(): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 1, padding: 2, background: 'var(--dt-surface-2)', borderRadius: 'var(--dt-radius-sm)', border: '1px solid var(--dt-border)' }
}
function tbBtn(on = false): React.CSSProperties {
  return {
    minWidth: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 4px', fontSize: 'var(--dt-text-xs)', fontWeight: 600, cursor: 'pointer', lineHeight: 1,
    borderRadius: 'var(--dt-radius-sm)', border: '1px solid ' + (on ? 'var(--dt-border-strong)' : 'transparent'),
    background: on ? 'var(--dt-accent-weak)' : 'transparent', color: on ? 'var(--dt-accent)' : 'var(--dt-text-dim)',
    transition: 'background var(--dt-dur-fast) var(--dt-spring), color var(--dt-dur-fast) var(--dt-spring)',
  }
}
function tbSep(): React.CSSProperties {
  return { width: 1, height: 16, background: 'var(--dt-border)', margin: '0 2px' }
}

function pickLabel(el: HTMLElement, i: number): string {
  const h = el.querySelector('h1, h2, h3, [class*="font-semibold"], [class*="font-bold"]')
  const t = (h?.textContent || '').replace(/\s+/g, ' ').trim()
  if (t) return t.slice(0, 28)
  const own = (el.textContent || '').replace(/\s+/g, ' ').trim()
  return own ? own.slice(0, 24) : `Område ${i + 1}`
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

function restorePage(root: HTMLElement, orig: Record<string, string>) {
  for (const k of Object.keys(orig)) {
    if (orig[k]) root.style.setProperty(cssName(k), orig[k])
    else root.style.removeProperty(cssName(k))
  }
}
function cssName(k: string): string { return k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) }

// ── Kvarhållet layout-tillstånd (per sida) ──
const LKEY = dtKey('layout.v1')
function persistLayout(page: string, areas: GridArea[]) {
  try { localStorage.setItem(`${LKEY}:${page}`, JSON.stringify(areas)) } catch { /* privat-läge */ }
}
function loadLayout(page: string, expectCount: number): GridArea[] | null {
  try {
    const raw = localStorage.getItem(`${LKEY}:${page}`)
    if (!raw) return null
    const p = JSON.parse(raw) as GridArea[]
    if (Array.isArray(p) && p.length === expectCount && p.every((a) => typeof a.colStart === 'number')) return p
    return null
  } catch { return null }
}

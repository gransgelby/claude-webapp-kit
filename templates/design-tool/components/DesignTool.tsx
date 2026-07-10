'use client'
// Tunn monterings-komponent för DesignTool (Post 2 · nattjobb 2026-07-10).
// ANSVAR: admin-gating + LAZY-LOAD. Själva verktyget (shell + palett + editering)
// ligger i components/design/DesignToolShell.tsx och laddas FÖRST när en admin
// faktiskt öppnar verktyget – icke-admins laddar aldrig tool-koden.
//
// Öppning sker via den lilla launchern här ELLER via bussen (kartans Design-knapp
// dispatchar `dt:toggle-design-tool`). Båda triggar lazy-load; därefter äger
// shellen launchern + all interaktion.
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getAuthStatus } from '@/lib/designToolAdapter'
import { hasExternalDesignLauncher, subscribeDesignLaunchers, type DesignAnchor } from '@/lib/designToolBus'
import type { DtThemeId } from '@/lib/design/dtTheme'

const DesignToolShell = dynamic(() => import('./design/DesignToolShell'), { ssr: false })

export default function DesignTool() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const anchorRef = useRef<DesignAnchor | null>(null)
  // Auto-öppna via URL (admin-gated dev-affordans + gör verktyget skärmdumpbart
  // för nattjobbets shot.js): ?designtool=open [&dtpalette=1] [&dtchrome=neon].
  const bootRef = useRef<{ palette: boolean; designMode: boolean; theme?: DtThemeId }>({ palette: false, designMode: false })
  const externalLauncher = useSyncExternalStore(subscribeDesignLaunchers, hasExternalDesignLauncher, () => false)

  useEffect(() => { getAuthStatus().then((s) => setIsAdmin(s.tier === 'admin')).catch(() => {}) }, [])

  useEffect(() => {
    if (!isAdmin) return
    const p = new URLSearchParams(window.location.search)
    if (p.get('designtool') === 'open') {
      bootRef.current = {
        palette: p.get('dtpalette') === '1',
        designMode: p.get('dtmode') === 'design',
        theme: (['midnight', 'precision', 'neon'] as const).find((t) => t === p.get('dtchrome')),
      }
      setLoaded(true)
    }
  }, [isAdmin])

  // Bussen (kartans Design-knapp) kan begära öppning innan verktyget laddats →
  // fånga eventet här, stash:a ankaret och lazy-ladda shellen (som sedan öppnas).
  useEffect(() => {
    if (!isAdmin || loaded) return
    const onToggle = (e: Event) => {
      anchorRef.current = ((e as CustomEvent).detail as DesignAnchor | null) ?? null
      setLoaded(true)
    }
    window.addEventListener('dt:toggle-design-tool', onToggle)
    return () => window.removeEventListener('dt:toggle-design-tool', onToggle)
  }, [isAdmin, loaded])

  if (!isAdmin) return null

  // Efter första öppningen äger shellen allt (launcher + panel + palett).
  if (loaded) return (
    <DesignToolShell
      initialOpen initialAnchor={anchorRef.current}
      initialPalette={bootRef.current.palette} initialTheme={bootRef.current.theme}
      initialDesignMode={bootRef.current.designMode}
    />
  )

  // Pre-load: en lätt launcher (döljs om en yta redan har en Design-knapp, då
  // kommer öppningen via bussen i stället). Klick → ladda shellen öppen.
  if (externalLauncher) return null
  return (
    <button
      type="button"
      onClick={(e) => { anchorRef.current = e.currentTarget.getBoundingClientRect(); setLoaded(true) }}
      style={{
        position: 'fixed', left: 12, bottom: 12, zIndex: 2147483000,
        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        border: '1px solid rgba(251,191,36,0.5)', background: 'rgba(24,20,12,0.82)', color: '#fde6b8',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)', fontFamily: 'var(--font-manrope, system-ui), sans-serif',
      }}
    >
      ✎ Design
    </button>
  )
}

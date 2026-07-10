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
import { DEFAULT_DT_THEME, dtThemeVars, type DtThemeId } from '@/lib/design/dtTheme'

const DesignToolShell = dynamic(() => import('./design/DesignToolShell'), { ssr: false })

export default function DesignTool() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [launcherHover, setLauncherHover] = useState(false)
  const anchorRef = useRef<DesignAnchor | null>(null)
  // Auto-öppna via URL (admin-gated dev-affordans + gör verktyget skärmdumpbart
  // för nattjobbets shot.js): ?designtool=open [&dtpalette=1] [&dtchrome=precision-light].
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
        theme: (['precision-dark', 'precision-light'] as const).find((t) => t === p.get('dtchrome')),
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
  //
  // C1: verktyget är FRIKOPPLAT från appens eget tema. Denna knapp renderas
  // innan shellen (och dess `.dt-root`) monterats, så `--dt-*`-tokens finns inte
  // ännu i DOM-trädet – därför sätter vi default-valörens `--dt-*` INLINE på just
  // knappen och stylar den med dem. Ingen app-accent, ingen hårdkodad hex: samma
  // token-källa som resten av verktyget.
  if (externalLauncher) return null
  return (
    <button
      type="button"
      onClick={(e) => { anchorRef.current = e.currentTarget.getBoundingClientRect(); setLoaded(true) }}
      onMouseEnter={() => setLauncherHover(true)}
      onMouseLeave={() => setLauncherHover(false)}
      style={{
        ...dtThemeVars(DEFAULT_DT_THEME),
        position: 'fixed', left: 12, bottom: 12, zIndex: 2147483000,
        padding: '6px 12px', borderRadius: 'var(--dt-radius)', fontSize: 'var(--dt-text-sm)', fontWeight: 600, cursor: 'pointer',
        border: '1px solid var(--dt-border-strong)', background: 'var(--dt-surface-solid)', color: 'var(--dt-text)',
        boxShadow: 'var(--dt-shadow)', fontFamily: 'var(--dt-font)',
        filter: launcherHover ? 'brightness(var(--dt-hover-bright))' : 'none',
        transition: 'filter var(--dt-dur-fast) var(--dt-spring)',
      }}
    >
      ✎ Design
    </button>
  )
}

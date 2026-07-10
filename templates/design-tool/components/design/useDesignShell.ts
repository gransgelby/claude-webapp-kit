'use client'
// Kvarhållet verktygstillstånd + reduced-motion för DesignTool-shellen (Post 2).
// Sparar vald chrome, senaste öppet-läge och panel-position i localStorage så
// verktyget känns "på plats" mellan sessioner.
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_DT_THEME, type DtThemeId, DT_THEMES } from '@/lib/design/dtTheme'
import { dtKey } from '@/lib/design/dtConfig'

const KEY = dtKey('shell.v2')

export type ShellMode = 'overlay' | 'design'

export interface ShellState {
  theme: DtThemeId
  /** Senast använda läge (in-app overlay eller helskärms Design mode). */
  lastMode: ShellMode
  /** Kvarhållen dragg-offset för overlay-panelen. */
  pos: { dx: number; dy: number }
}

const DEFAULT_STATE: ShellState = {
  theme: DEFAULT_DT_THEME,
  lastMode: 'overlay',
  pos: { dx: 0, dy: 0 },
}

function load(): ShellState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT_STATE
    const p = JSON.parse(raw) as Partial<ShellState>
    return {
      theme: p.theme && DT_THEMES[p.theme] ? p.theme : DEFAULT_DT_THEME,
      lastMode: p.lastMode === 'design' ? 'design' : 'overlay',
      pos: p.pos && typeof p.pos.dx === 'number' ? p.pos : { dx: 0, dy: 0 },
    }
  } catch {
    return DEFAULT_STATE
  }
}

/** Persisterat shell-tillstånd (chrome-tema, senaste läge, panel-offset). */
export function useShellState() {
  const [state, setState] = useState<ShellState>(DEFAULT_STATE)
  // Läs efter mount (undviker SSR-hydration-glapp).
  useEffect(() => { setState(load()) }, [])

  const patch = useCallback((p: Partial<ShellState>) => {
    setState((prev) => {
      const next = { ...prev, ...p }
      try { window.localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* privat-läge */ }
      return next
    })
  }, [])

  return { state, patch }
}

/** Följer `prefers-reduced-motion` live (matchMedia-prenumeration). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

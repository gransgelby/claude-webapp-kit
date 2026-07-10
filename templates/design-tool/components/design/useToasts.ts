'use client'
// Eleganta toasts med valfri inline-ångra (Post 2 · lyx-lager, skal).
// En toast kan bära en `undo`-callback → renderas som en "Ångra"-knapp inuti
// toasten. Post 3+ kopplar riktiga ångra-handlingar (t.ex. återställ en flytt).
import { useCallback, useRef, useState } from 'react'

export interface Toast {
  id: number
  msg: string
  /** Om satt: visa en inline-"Ångra"-knapp som kör denna och stänger toasten. */
  undo?: () => void
  /** Ton – styr accent-linjen. */
  tone?: 'ok' | 'info' | 'warn'
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    const tm = timers.current.get(id)
    if (tm) { clearTimeout(tm); timers.current.delete(id) }
  }, [])

  const push = useCallback((msg: string, opts?: { undo?: () => void; tone?: Toast['tone']; ttl?: number }) => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, msg, undo: opts?.undo, tone: opts?.tone ?? 'ok' }])
    // Toasts med ångra ligger kvar längre så man hinner ångra.
    const ttl = opts?.ttl ?? (opts?.undo ? 6000 : 2600)
    const tm = setTimeout(() => dismiss(id), ttl)
    timers.current.set(id, tm)
    return id
  }, [dismiss])

  const runUndo = useCallback((t: Toast) => { t.undo?.(); dismiss(t.id) }, [dismiss])

  return { toasts, push, dismiss, runUndo }
}

'use client'
// Eleganta toasts med valfri inline-ångra (Post 2 · lyx-lager, skal).
// En toast kan bära en `undo`-callback → renderas som en "Ångra"-knapp inuti
// toasten. Post 3+ kopplar riktiga ångra-handlingar (t.ex. återställ en flytt).
//
// W11 (v2.4): EN notis åt gången – en ny push ERSÄTTER den föregående i st f att
// stapla (Bild 4: snabb redigering staplade toaster). Stapel-/dismiss-logiken bor
// i lib/design/toastModel (ren, enhetstestad); här kopplas den bara till React +
// TTL-timers. Ångra behålls på den enda synliga toasten.
import { useCallback, useRef, useState } from 'react'
import { pushToast, dismissToast, type ToastItem } from '@/lib/design/toastModel'

export type Toast = ToastItem

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((t) => dismissToast(t, id))
    const tm = timers.current.get(id)
    if (tm) { clearTimeout(tm); timers.current.delete(id) }
  }, [])

  const push = useCallback((msg: string, opts?: { undo?: () => void; tone?: Toast['tone']; ttl?: number }) => {
    const id = nextId.current++
    // W11: den nya toasten ersätter den föregående → rensa utgående TTL-timers.
    // (Sido-effekten ligger UTANFÖR state-updatern → StrictMode-säker; updatern
    // förblir ren via pushToast.)
    Array.from(timers.current.values()).forEach(clearTimeout)
    timers.current.clear()
    setToasts((t) => pushToast(t, { id, msg, undo: opts?.undo, tone: opts?.tone ?? 'ok' }))
    // Toasts med ångra ligger kvar längre så man hinner ångra.
    const ttl = opts?.ttl ?? (opts?.undo ? 6000 : 2600)
    const tm = setTimeout(() => dismiss(id), ttl)
    timers.current.set(id, tm)
    return id
  }, [dismiss])

  const runUndo = useCallback((t: Toast) => { t.undo?.(); dismiss(t.id) }, [dismiss])

  return { toasts, push, dismiss, runUndo }
}

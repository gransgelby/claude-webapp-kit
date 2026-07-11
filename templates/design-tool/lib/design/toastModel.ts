// W11 (v2.4) · Ren logik för notis-stapeln. App-agnostisk (ingen DOM/React) →
// enhetstestad i toastModel.test.ts. useToasts bygger på detta.
//
// STYRANDE PRINCIP (W11): EN notis åt gången – en ny toast ERSÄTTER den föregående
// i stället för att stapla. Vid snabb redigering (många push i följd) ska bara den
// senaste synas, med sin ev. ångra-knapp intakt.

export interface ToastItem {
  id: number
  msg: string
  /** Om satt: visa inline-"Ångra"-knapp. */
  undo?: () => void
  /** Ton – styr accent-linjen. */
  tone?: 'ok' | 'info' | 'warn'
}

/**
 * Lägg en toast i listan och behåll bara de `max` senaste (default 1 = ingen
 * stapling, W11). En ny toast ersätter alltså den föregående. Ren funktion →
 * lätt att enhetstesta att push ersätter i st f staplar.
 */
export function pushToast(prev: ToastItem[], next: ToastItem, max = 1): ToastItem[] {
  const combined = [...prev, next]
  const keep = Math.max(1, max)
  return combined.length > keep ? combined.slice(combined.length - keep) : combined
}

/** Ta bort en toast ur listan (t.ex. efter TTL eller manuell stängning). */
export function dismissToast(prev: ToastItem[], id: number): ToastItem[] {
  return prev.filter((t) => t.id !== id)
}

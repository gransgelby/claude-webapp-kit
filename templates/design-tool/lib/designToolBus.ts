// Delad buss mellan kartans verktygsrad och det globala DesignTool:t. Låter kartraden
// (admin) öppna/stänga DesignTool-panelen OCH tala om att en egen launcher finns → då göms
// DesignTools globala launcher så vi inte får två Design-knappar samtidigt.
type Listener = () => void

let externalLaunchers = 0
const listeners = new Set<Listener>()
const emit = () => listeners.forEach((f) => f())

/** Registrera en extern Design-launcher (t.ex. kartans verktygsrad). Returnerar avregistrering. */
export function registerDesignLauncher(): () => void {
  externalLaunchers += 1
  emit()
  return () => { externalLaunchers = Math.max(0, externalLaunchers - 1); emit() }
}
export function hasExternalDesignLauncher(): boolean { return externalLaunchers > 0 }
export function subscribeDesignLaunchers(f: Listener): () => void { listeners.add(f); return () => listeners.delete(f) }

/** Ankare för att positionera panelen OVANFÖR den launcher som öppnade den (I49a). */
export type DesignAnchor = { left: number; top: number; bottom: number; width: number }

/** Öppna/stäng DesignTool-panelen (via window-event som DesignTool lyssnar på).
 *  Skicka med launcher-knappens bounding rect → panelen förankras ovanför just den
 *  knappen (kartans Design-knapp likväl som den globala). Utan ankare → default-läge
 *  (nere till vänster, ovanför den globala launchern) – bakåtkompatibelt. */
export function toggleDesignTool(anchor?: DesignAnchor | DOMRect | null): void {
  if (typeof window === 'undefined') return
  const detail: DesignAnchor | null = anchor
    ? { left: anchor.left, top: anchor.top, bottom: anchor.bottom, width: anchor.width }
    : null
  window.dispatchEvent(new CustomEvent('dt:toggle-design-tool', { detail }))
}

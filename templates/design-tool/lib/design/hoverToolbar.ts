// L3 (v2.3) · Ren logik för precisa cursor-affordances + hover-mikrotoolbarens
// positionering. App-agnostisk (bara geometri + kontext-state, inga selektorer,
// ingen DOM/React) → enhetstestad i hoverToolbar.test.ts.
//
// STYRANDE PRINCIP ("alltid snabbt"): cursorn ska byta OMEDELBART så handen vet
// vad ett drag kommer göra INNAN man drar; toolbaren dyker upp snabbt vid lådans
// kant och hamnar aldrig utanför viewporten.

/** Vad muspekaren just nu befinner sig över i design-mode-ytan. */
export type HoverTarget =
  | 'none' // tom canvas-yta
  | 'box' // en flyttbar låda (topp-block / nästlad region)
  | 'control' // en klickbar kontroll (knapp, flik-toggle …)
  | 'resize-ew' // bredd-handtag (höger/vänster kant)
  | 'resize-ns' // höjd-handtag (under-/överkant)
  | 'resize-nwse' // hörn-handtag (bredd + höjd)

export interface CursorContext {
  /** Space hålls → pan-läge (öppen hand). */
  spaceDown: boolean
  /** Aktiv pan pågår (space + drag) → gripen hand. */
  panning: boolean
  /** Mät-läge aktivt → hårkors över ytan. */
  measure: boolean
  /** Vad pekaren är över. */
  target: HoverTarget
}

/**
 * Vilken CSS-cursor design-mode-ytan ska visa givet aktuell kontext. Ordningen
 * speglar handens intention: pan (space-håll) vinner ALLTID, sedan handtags-
 * specifika resize-pilar, klickbara kontroller (pekare), mät-läge (hårkors), en
 * flyttbar låda (move), annars default. Ren funktion → cursorn kan bytas direkt
 * vid varje pekar-rörelse utan att röra DOM här.
 */
export function cursorFor(ctx: CursorContext): string {
  if (ctx.panning) return 'grabbing'
  if (ctx.spaceDown) return 'grab'
  if (ctx.target === 'control') return 'pointer'
  if (ctx.target === 'resize-ew') return 'ew-resize'
  if (ctx.target === 'resize-ns') return 'ns-resize'
  if (ctx.target === 'resize-nwse') return 'nwse-resize'
  if (ctx.measure) return 'crosshair'
  if (ctx.target === 'box') return 'move'
  return 'default'
}

export interface Box { x: number; y: number; w: number; h: number }
export interface Size { w: number; h: number }
export interface Viewport { left: number; top: number; right: number; bottom: number }
export interface ToolbarPos { x: number; y: number; placement: 'above' | 'below' }

/**
 * Positionera hover-mikrotoolbaren mot en lådas kant (allt i skärm-px) och CLAMPa
 * den inom viewporten så den ALDRIG hamnar utanför. Default: ovanför lådans
 * överkant. Får den inte plats där (lådan börjar nära viewportens topp) placeras
 * den strax under lådans överkant (inuti lådan) så den alltid syns. Horisontellt
 * vänsterjusteras den mot lådan och klampas i sidled. Ren geometri → enhetstestad.
 */
export function toolbarPosition(box: Box, tb: Size, vp: Viewport, gap = 6): ToolbarPos {
  // Vertikal: föredra ovanför lådan; annars strax under dess överkant.
  let placement: 'above' | 'below' = 'above'
  let y = box.y - gap - tb.h
  if (y < vp.top) {
    placement = 'below'
    y = box.y + gap
  }
  // Skydd: om även "below" spiller under viewportens botten → clampa in.
  if (y + tb.h > vp.bottom) y = vp.bottom - tb.h
  if (y < vp.top) y = vp.top
  // Horisontell: vänsterjustera mot lådan, clampa båda kanterna.
  let x = box.x
  if (x + tb.w > vp.right) x = vp.right - tb.w
  if (x < vp.left) x = vp.left
  return { x, y, placement }
}

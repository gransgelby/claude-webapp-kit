import { describe, it, expect } from 'vitest'
import { cursorFor, toolbarPosition, type Viewport } from './hoverToolbar'

const VP: Viewport = { left: 0, top: 0, right: 1600, bottom: 900 }

describe('cursorFor', () => {
  const base = { spaceDown: false, panning: false, measure: false, target: 'none' as const }

  it('grabbing under aktiv pan (vinner över allt)', () => {
    expect(cursorFor({ ...base, panning: true, target: 'resize-ew' })).toBe('grabbing')
    expect(cursorFor({ ...base, spaceDown: true, panning: true })).toBe('grabbing')
  })

  it('grab när space hålls (men inte drar)', () => {
    expect(cursorFor({ ...base, spaceDown: true })).toBe('grab')
    // space vinner över låd-hover och mät
    expect(cursorFor({ ...base, spaceDown: true, target: 'box', measure: true })).toBe('grab')
  })

  it('pointer över klickbara kontroller', () => {
    expect(cursorFor({ ...base, target: 'control' })).toBe('pointer')
  })

  it('rätt resize-pil per handtag', () => {
    expect(cursorFor({ ...base, target: 'resize-ew' })).toBe('ew-resize')
    expect(cursorFor({ ...base, target: 'resize-ns' })).toBe('ns-resize')
    expect(cursorFor({ ...base, target: 'resize-nwse' })).toBe('nwse-resize')
  })

  it('crosshair i mät-läge (över tom yta OCH över låda)', () => {
    expect(cursorFor({ ...base, measure: true })).toBe('crosshair')
    // mät vinner över "move" på en låda, men INTE över resize-handtag
    expect(cursorFor({ ...base, measure: true, target: 'box' })).toBe('crosshair')
    expect(cursorFor({ ...base, measure: true, target: 'resize-ns' })).toBe('ns-resize')
  })

  it('move över en flyttbar låda', () => {
    expect(cursorFor({ ...base, target: 'box' })).toBe('move')
  })

  it('default på tom yta utan något aktivt', () => {
    expect(cursorFor(base)).toBe('default')
  })
})

describe('toolbarPosition', () => {
  const TB = { w: 160, h: 28 }

  it('läggs ovanför lådans överkant med gap när det finns plats', () => {
    const box = { x: 400, y: 300, w: 260, h: 120 }
    const p = toolbarPosition(box, TB, VP, 6)
    expect(p.placement).toBe('above')
    expect(p.y).toBe(300 - 6 - 28)
    expect(p.x).toBe(400)
  })

  it('faller ner under överkanten när lådan börjar vid viewportens topp', () => {
    const box = { x: 100, y: 4, w: 200, h: 300 }
    const p = toolbarPosition(box, TB, VP, 6)
    expect(p.placement).toBe('below')
    expect(p.y).toBe(4 + 6)
    expect(p.y).toBeGreaterThanOrEqual(VP.top)
  })

  it('clampas i sidled så toolbaren aldrig spiller ut till höger', () => {
    const box = { x: 1580, y: 300, w: 40, h: 40 }
    const p = toolbarPosition(box, TB, VP, 6)
    expect(p.x).toBe(VP.right - TB.w) // 1600 - 160 = 1440
    expect(p.x + TB.w).toBeLessThanOrEqual(VP.right)
  })

  it('clampas i sidled mot vänsterkanten', () => {
    const box = { x: -30, y: 300, w: 100, h: 40 }
    const p = toolbarPosition(box, TB, VP, 6)
    expect(p.x).toBe(VP.left)
  })

  it('clampas vertikalt inom viewporten även i extremfall', () => {
    const box = { x: 200, y: 895, w: 100, h: 100 }
    const p = toolbarPosition(box, TB, VP, 6)
    expect(p.y).toBeGreaterThanOrEqual(VP.top)
    expect(p.y + TB.h).toBeLessThanOrEqual(VP.bottom)
  })

  it('respekterar en offset-viewport (panel som inte börjar på 0,0)', () => {
    const vp: Viewport = { left: 800, top: 100, right: 1600, bottom: 900 }
    const box = { x: 1580, y: 120, w: 40, h: 200 }
    const p = toolbarPosition(box, TB, vp, 6)
    expect(p.x).toBe(vp.right - TB.w)
    // y = box.y - gap - h = 120-6-28 = 86 < vp.top(100) → below
    expect(p.placement).toBe('below')
    expect(p.y).toBe(120 + 6)
  })
})

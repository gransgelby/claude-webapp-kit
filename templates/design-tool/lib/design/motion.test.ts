import { describe, it, expect } from 'vitest'
import {
  glideVelocity, glideDisplacement, glideTotal, glideDuration, blendVelocity, shouldGlide,
  snapMagnet, microBounce, zoomLerp,
  GLIDE_TAU, GLIDE_MIN_V, GLIDE_MAX_MS, BOUNCE_MS, ZOOM_LERP_MS,
} from './motion'

describe('pan-inertia (exponentiell decay)', () => {
  it('hastigheten avtar monotont och når ~0', () => {
    const v0 = 2
    expect(glideVelocity(v0, 0)).toBeCloseTo(v0)
    expect(glideVelocity(v0, GLIDE_TAU)).toBeCloseTo(v0 / Math.E, 5)
    expect(glideVelocity(v0, 0)).toBeGreaterThan(glideVelocity(v0, 50))
    expect(glideVelocity(v0, 50)).toBeGreaterThan(glideVelocity(v0, 200))
    expect(glideVelocity(v0, 5000)).toBeLessThan(0.01)
  })

  it('förflyttningen är monoton och närmar sig glideTotal (v0·τ)', () => {
    const v0 = 1.5
    expect(glideDisplacement(v0, 0)).toBeCloseTo(0)
    const d1 = glideDisplacement(v0, 40)
    const d2 = glideDisplacement(v0, 120)
    expect(d2).toBeGreaterThan(d1)
    expect(glideDisplacement(v0, 100000)).toBeCloseTo(glideTotal(v0), 3)
    // Given hastighet → deterministisk glidnings-kurva.
    expect(glideTotal(2)).toBeCloseTo(2 * GLIDE_TAU)
  })

  it('glideDuration är KORT och hårt klampad (aldrig väntan)', () => {
    // Snabb fling → klampas till taket, inte längre.
    expect(glideDuration(5)).toBeLessThanOrEqual(GLIDE_MAX_MS)
    expect(glideDuration(5)).toBe(GLIDE_MAX_MS)
    // Måttlig fling → under taket men positiv.
    const d = glideDuration(0.4)
    expect(d).toBeGreaterThan(0)
    expect(d).toBeLessThan(GLIDE_MAX_MS)
  })

  it('för svag fling → ingen glidning (hård stopp direkt)', () => {
    expect(glideDuration(GLIDE_MIN_V * 0.5)).toBe(0)
    expect(shouldGlide(0.01, 0.01)).toBe(false)
    expect(shouldGlide(0.2, 0)).toBe(true)
  })

  it('prefers-reduced-motion → duration 0 (ingen inertia)', () => {
    expect(glideDuration(5, { reduced: true })).toBe(0)
    expect(glideDuration(0.4, { reduced: true })).toBe(0)
  })

  it('blendVelocity utjämnar mot senaste sample', () => {
    expect(blendVelocity(0, 1, 0.5)).toBeCloseTo(0.5)
    expect(blendVelocity(1, 1, 0.35)).toBeCloseTo(1)
    // EMA rör sig mot sample men inte hela vägen på ett steg.
    const b = blendVelocity(0, 2, 0.35)
    expect(b).toBeGreaterThan(0)
    expect(b).toBeLessThan(2)
  })
})

describe('magnetisk snap + mikro-studs', () => {
  it('snappar till närmaste kant inom tolerans, annars null', () => {
    const edges = [100, 200, 350]
    expect(snapMagnet(103, edges, 8)).toBe(100)
    expect(snapMagnet(196, edges, 8)).toBe(200)
    expect(snapMagnet(120, edges, 8)).toBe(null) // utanför tolerans
    // Närmast vinner vid två kandidater.
    expect(snapMagnet(150, [140, 160], 20)).toBe(140)
    expect(snapMagnet(151, [140, 160], 20)).toBe(160)
  })

  it('microBounce är 0 vid start/slut och en liten positiv topp i mitten', () => {
    expect(microBounce(0)).toBe(0)
    expect(microBounce(BOUNCE_MS)).toBe(0)
    expect(microBounce(BOUNCE_MS + 50)).toBe(0)
    const mid = microBounce(BOUNCE_MS * 0.4)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(4) // liten – en bekräftelse, inte ett hopp
  })

  it('reduced-motion / dur 0 → ingen studs', () => {
    expect(microBounce(20, 0)).toBe(0)
    expect(microBounce(BOUNCE_MS * 0.4, 0)).toBe(0)
  })
})

describe('mjuk zoom-interpolation', () => {
  it('interpolerar z0→z1 med ease-out och landar exakt på z1', () => {
    expect(zoomLerp(1, 2, 0)).toBeCloseTo(1)
    expect(zoomLerp(1, 2, ZOOM_LERP_MS)).toBeCloseTo(2)
    const mid = zoomLerp(1, 2, ZOOM_LERP_MS / 2)
    // Ease-out → mer än halvvägs vid halva tiden.
    expect(mid).toBeGreaterThan(1.5)
    expect(mid).toBeLessThan(2)
  })

  it('reduced-motion → z1 direkt (hård zoom, ingen väntan)', () => {
    expect(zoomLerp(1, 2, 0, ZOOM_LERP_MS, true)).toBeCloseTo(2)
    expect(zoomLerp(1, 2, 1, 0)).toBeCloseTo(2)
  })
})

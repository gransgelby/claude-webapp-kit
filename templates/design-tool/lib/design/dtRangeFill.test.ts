import { describe, it, expect } from 'vitest'
import { dtRangeFill } from '@/components/design/dtStyles'

// PW2 · B5: dtRangeFill räknar ut hur stor andel av slider-spåret som fylls med
// accent (till vänster om thumben). Ren funktion → deterministisk enhetstest.
// (Bor i lib/ eftersom vitest-globben bara scannar lib/**; importerar via @-alias.)
describe('dtRangeFill', () => {
  const pct = (v: number, min: number, max: number) =>
    (dtRangeFill(v, min, max) as Record<string, string>)['--dt-range-fill']

  it('mappar värdet till procent av spannet', () => {
    expect(pct(0, 0, 100)).toBe('0%')
    expect(pct(50, 0, 100)).toBe('50%')
    expect(pct(100, 0, 100)).toBe('100%')
  })

  it('hanterar min-offset (spann som inte börjar på 0)', () => {
    expect(pct(8, 8, 48)).toBe('0%')
    expect(pct(28, 8, 48)).toBe('50%')
    expect(pct(48, 8, 48)).toBe('100%')
  })

  it('hanterar decimalspann (opacitet 0–1)', () => {
    expect(pct(0.25, 0, 1)).toBe('25%')
  })

  it('klampar utanför spannet och skyddar mot noll-spann', () => {
    expect(pct(200, 0, 100)).toBe('100%')
    expect(pct(-5, 0, 100)).toBe('0%')
    expect(pct(5, 10, 10)).toBe('0%') // max===min → ingen division med noll
  })
})

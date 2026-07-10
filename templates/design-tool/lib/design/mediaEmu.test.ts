import { describe, it, expect } from 'vitest'
import { evalMediaAtWidth, parseCssLength } from './mediaEmu'

describe('parseCssLength', () => {
  it('px/rem/em → px; okänt → null', () => {
    expect(parseCssLength('1280px', 16)).toBe(1280)
    expect(parseCssLength('40rem', 16)).toBe(640)
    expect(parseCssLength('64em', 16)).toBe(1024)
    expect(parseCssLength('50vw', 16)).toBe(null)
    expect(parseCssLength('auto', 16)).toBe(null)
  })
})

describe('evalMediaAtWidth', () => {
  const at390 = (m: string) => evalMediaAtWidth(m, 390, 16)
  const at1512 = (m: string) => evalMediaAtWidth(m, 1512, 16)

  it('Tailwind-breakpoints (min-width) matchar rätt vid 390 vs 1512', () => {
    expect(at390('(min-width: 1280px)')).toBe(false)
    expect(at1512('(min-width: 1280px)')).toBe(true)
    expect(at390('(min-width: 640px)')).toBe(false)
    expect(at390('(min-width: 390px)')).toBe(true)
  })

  it('max-width + kombinerade and-villkor', () => {
    expect(at390('(max-width: 639px)')).toBe(true)
    expect(at1512('(max-width: 639px)')).toBe(false)
    expect(at390('screen and (min-width: 320px) and (max-width: 639px)')).toBe(true)
    expect(at390('screen and (min-width: 640px) and (max-width: 1023px)')).toBe(false)
  })

  it('kommaseparerad lista är ELLER', () => {
    expect(at390('(min-width: 1280px), (max-width: 500px)')).toBe(true)
    expect(at390('(min-width: 1280px), (min-width: 640px)')).toBe(false)
  })

  it('range-syntax (width >= / dubbelrange)', () => {
    expect(at390('(width >= 40rem)')).toBe(false)
    expect(at1512('(width >= 40rem)')).toBe(true)
    expect(at390('(width <= 40rem)')).toBe(true)
    expect(at390('(320px <= width <= 480px)')).toBe(true)
    expect(at1512('(320px <= width <= 480px)')).toBe(false)
  })

  it('print/speech matchar aldrig (vi emulerar en skärm)', () => {
    expect(at390('print')).toBe(false)
    expect(at390('print, (max-width: 500px)')).toBe(true) // ELLER: skärm-delen vinner
  })

  it('icke-bredd-villkor lämnas orörda (null)', () => {
    expect(at390('(prefers-color-scheme: dark)')).toBe(null)
    expect(at390('(hover: hover)')).toBe(null)
    expect(at390('screen and (min-width: 320px) and (prefers-reduced-motion: reduce)')).toBe(null)
    expect(at390('not screen and (min-width: 320px)')).toBe(null)
  })

  it('and med säkert false är false även om annat är o-utvärderbart', () => {
    expect(at390('(min-width: 1280px) and (prefers-color-scheme: dark)')).toBe(false)
  })

  it('bara skärmtyp/all/not all', () => {
    expect(at390('screen')).toBe(true)
    expect(at390('all')).toBe(true)
    expect(at390('not all')).toBe(false)
  })
})

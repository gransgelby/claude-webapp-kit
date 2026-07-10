import { describe, it, expect } from 'vitest'
import {
  parseColor, sameRGB, rgbToHex, toHex, toTriplet,
  relativeLuminance, contrastRatio, wcagVerdict, contrastBetween,
  matchToken, countColorMatches, type TokenEntry,
} from './colorUtils'

describe('parseColor', () => {
  it('tolkar #rrggbb', () => {
    expect(parseColor('#0f172a')).toEqual({ r: 15, g: 23, b: 42, a: 1 })
  })
  it('tolkar kort #rgb', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
  })
  it('tolkar #rrggbbaa med alfa', () => {
    const c = parseColor('#ff000080')!
    expect([c.r, c.g, c.b]).toEqual([255, 0, 0])
    expect(c.a).toBeCloseTo(0.5, 1)
  })
  it('tolkar rgb() och rgba()', () => {
    expect(parseColor('rgb(100, 116, 139)')).toEqual({ r: 100, g: 116, b: 139, a: 1 })
    expect(parseColor('rgba(0,0,0,0.4)')).toEqual({ r: 0, g: 0, b: 0, a: 0.4 })
  })
  it('tolkar appens bara triplett "r g b"', () => {
    expect(parseColor('15 23 42')).toEqual({ r: 15, g: 23, b: 42, a: 1 })
    expect(parseColor('100,116,139')).toEqual({ r: 100, g: 116, b: 139, a: 1 })
  })
  it('returnerar null för skräp', () => {
    expect(parseColor('')).toBeNull()
    expect(parseColor('inte-en-färg')).toBeNull()
    expect(parseColor(null)).toBeNull()
  })
})

describe('hex/triplett-konvertering', () => {
  it('rgbToHex rundar och paddar', () => {
    expect(rgbToHex({ r: 15, g: 23, b: 42, a: 1 })).toBe('#0f172a')
  })
  it('toHex normaliserar valfri form → #rrggbb', () => {
    expect(toHex('rgb(255,255,255)')).toBe('#ffffff')
    expect(toHex('15 23 42')).toBe('#0f172a')
    expect(toHex('skräp')).toBe('#000000')
  })
  it('toTriplet ger appens token-form tillbaka', () => {
    expect(toTriplet('#0f172a')).toBe('15 23 42')
    expect(toTriplet('rgb(100,116,139)')).toBe('100 116 139')
  })
  it('hex → triplett → hex är en rundtur', () => {
    expect(toHex(toTriplet('#4f46e5'))).toBe('#4f46e5')
  })
})

describe('WCAG-kontrast', () => {
  it('svart mot vit ger maxkontrast 21:1', () => {
    const r = contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255, a: 1 })
    expect(r).toBeCloseTo(21, 0)
  })
  it('samma färg ger 1:1', () => {
    expect(contrastRatio({ r: 100, g: 100, b: 100, a: 1 }, { r: 100, g: 100, b: 100, a: 1 })).toBeCloseTo(1, 5)
  })
  it('relativ luminans: vit=1, svart=0', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255, a: 1 })).toBeCloseTo(1, 5)
    expect(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 })).toBeCloseTo(0, 5)
  })
  it('wcagVerdict: brödtext-trösklar', () => {
    expect(wcagVerdict(7.5).grade).toBe('AAA')
    expect(wcagVerdict(5).grade).toBe('AA')
    expect(wcagVerdict(3).grade).toBe('Fail')
    expect(wcagVerdict(4.6).passAA).toBe(true)
    expect(wcagVerdict(4.6).passAAA).toBe(false)
  })
  it('wcagVerdict: stor text har lägre trösklar', () => {
    expect(wcagVerdict(3.2, true).passAA).toBe(true)   // stor: AA=3
    expect(wcagVerdict(3.2, false).passAA).toBe(false) // bröd: AA=4.5
  })
  it('contrastBetween löser färgsträngar', () => {
    const v = contrastBetween('#ffffff', '#000000')!
    expect(v.grade).toBe('AAA')
    expect(contrastBetween('#fff', 'skräp')).toBeNull()
  })
  it('appens --c-cta (#047857) på vit klarar AA för brödtext', () => {
    // Dokumenterat i globals.css: vit text ≈ 5,5:1. Här: cta som text på vit.
    const v = contrastBetween('4 120 87', '255 255 255')!
    expect(v.passAA).toBe(true)
  })
})

describe('token-matchning + förekomsträkning', () => {
  const tokens: TokenEntry[] = [
    { name: '--c-slate-900', raw: '15 23 42', hex: '#0f172a' },
    { name: '--c-cta', raw: '4 120 87', hex: '#047857' },
  ]
  it('matchToken hittar bunden token oavsett indata-form', () => {
    expect(matchToken('rgb(15, 23, 42)', tokens)).toBe('--c-slate-900')
    expect(matchToken('#047857', tokens)).toBe('--c-cta')
  })
  it('matchToken returnerar null när inget matchar', () => {
    expect(matchToken('#123456', tokens)).toBeNull()
  })
  it('countColorMatches räknar bara matchande värden', () => {
    const values = ['rgb(15, 23, 42)', '#0f172a', 'rgba(15,23,42,1)', 'rgb(255,255,255)', 'rgba(0,0,0,0)']
    // tre matchar (varav en rgba med a=1); vit + helt transparent räknas inte.
    expect(countColorMatches(values, '#0f172a')).toBe(3)
  })
  it('countColorMatches: 0 vid otolkbart mål', () => {
    expect(countColorMatches(['#000'], 'skräp')).toBe(0)
  })
})

describe('sameRGB', () => {
  it('jämför kanaler, ignorerar alfa', () => {
    expect(sameRGB({ r: 1, g: 2, b: 3, a: 1 }, { r: 1, g: 2, b: 3, a: 0.2 })).toBe(true)
    expect(sameRGB({ r: 1, g: 2, b: 3, a: 1 }, { r: 1, g: 2, b: 4, a: 1 })).toBe(false)
  })
})

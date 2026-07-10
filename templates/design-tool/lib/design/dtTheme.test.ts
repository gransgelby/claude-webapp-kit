import { describe, it, expect } from 'vitest'
import { DT_THEMES, DT_THEME_ORDER, DEFAULT_DT_THEME, dtThemeVars, type DtThemeId } from './dtTheme'
import { contrastBetween } from './colorUtils'

// Alla `--dt-*`-nycklar som verktygets chrome konsumerar – båda valörerna måste
// exponera hela setet (annars faller en kontroll tillbaka till 'unset').
const REQUIRED_KEYS = [
  'surface', 'surface-2', 'surface-raised', 'surface-solid',
  'text', 'text-dim', 'text-mute',
  'accent', 'accent-weak', 'accent-line', 'accent-contrast',
  'border', 'border-strong', 'shadow', 'shadow-lg', 'blur', 'glow', 'scrim',
  'save', 'save-contrast', 'hover-veil', 'hover-bright',
] as const

describe('dtThemeVars', () => {
  it('prefixar alla tema-variabler med --dt- och scopar color-scheme', () => {
    const vars = dtThemeVars('precision-dark')
    for (const k of Object.keys(vars)) {
      expect(k === 'colorScheme' || k.startsWith('--dt-')).toBe(true)
    }
    expect(vars['--dt-accent']).toBe('#818cf8')
    expect(vars['colorScheme']).toBe('dark')
  })

  it('ljust tema sätter color-scheme: light (systeminmatningar temar rätt)', () => {
    expect(dtThemeVars('precision-light')['colorScheme']).toBe('light')
  })

  it('reduced-motion nollar animationstiden och gör fjädrarna linjära', () => {
    const normal = dtThemeVars('precision-dark', false)
    const reduced = dtThemeVars('precision-dark', true)
    expect(normal['--dt-dur']).not.toBe('1ms')
    expect(reduced['--dt-dur']).toBe('1ms')
    expect(reduced['--dt-dur-fast']).toBe('1ms')
    expect(reduced['--dt-spring']).toBe('linear')
    expect(reduced['--dt-spring-bounce']).toBe('linear')
  })

  it('okänt tema faller tillbaka till default utan att krascha', () => {
    // @ts-expect-error – avsiktligt ogiltigt id för att testa fallbacken
    const vars = dtThemeVars('finns-inte')
    expect(vars['--dt-accent']).toBe(DT_THEMES[DEFAULT_DT_THEME].vars.accent)
  })
})

describe('temapar (Precision Ljus + Precision Mörk)', () => {
  it('exakt två valörer, default ingår, unika korta namn', () => {
    expect(DT_THEME_ORDER).toHaveLength(2)
    expect(DT_THEME_ORDER).toContain(DEFAULT_DT_THEME)
    const shorts = DT_THEME_ORDER.map((id) => DT_THEMES[id].short)
    expect(new Set(shorts).size).toBe(DT_THEME_ORDER.length)
  })

  it('default = Mörk (kommandocentral-känsla, dämpad Precision)', () => {
    expect(DEFAULT_DT_THEME).toBe('precision-dark')
  })

  it('Neon/Midnatt är skrotade (inga kvar-id:n)', () => {
    const ids = Object.keys(DT_THEMES)
    expect(ids).not.toContain('midnight')
    expect(ids).not.toContain('neon')
    expect(ids).not.toContain('precision')
  })

  it('samma tema, två valörer: samma varma Spara-accent i båda', () => {
    const dark = DT_THEMES['precision-dark'].vars
    const light = DT_THEMES['precision-light'].vars
    expect(dark.save).toBe(light.save)
    expect(dark['save-contrast']).toBe(light['save-contrast'])
  })

  it('båda valörerna exponerar HELA --dt-*-nyckelsetet (inkl. save + hover)', () => {
    for (const id of DT_THEME_ORDER) {
      const vars = dtThemeVars(id)
      for (const k of REQUIRED_KEYS) {
        expect(vars[`--dt-${k}`], `${id} saknar --dt-${k}`).toBeTruthy()
      }
    }
  })
})

describe('WCAG-AA-kontrast i BÅDA valörerna', () => {
  const opaqueSurface: Record<DtThemeId, string> = {
    'precision-dark': DT_THEMES['precision-dark'].vars['surface-solid'],
    'precision-light': DT_THEMES['precision-light'].vars['surface-solid'],
  }

  for (const id of DT_THEME_ORDER) {
    const v = DT_THEMES[id].vars

    it(`${id}: brödtext mot yta klarar AA (≥4.5:1)`, () => {
      const c = contrastBetween(v.text, opaqueSurface[id])
      expect(c).not.toBeNull()
      expect(c!.ratio).toBeGreaterThanOrEqual(4.5)
    })

    it(`${id}: accent som text mot yta klarar AA (≥4.5:1)`, () => {
      const c = contrastBetween(v.accent, opaqueSurface[id])
      expect(c).not.toBeNull()
      expect(c!.ratio).toBeGreaterThanOrEqual(4.5)
    })

    it(`${id}: knapptext på accent-fyllnad klarar AA`, () => {
      const c = contrastBetween(v['accent-contrast'], v.accent)
      expect(c).not.toBeNull()
      expect(c!.ratio).toBeGreaterThanOrEqual(4.5)
    })

    it(`${id}: Spara-knapptext på röd-orange save-accent klarar AA`, () => {
      const c = contrastBetween(v['save-contrast'], v.save)
      expect(c).not.toBeNull()
      expect(c!.ratio).toBeGreaterThanOrEqual(4.5)
    })
  }
})

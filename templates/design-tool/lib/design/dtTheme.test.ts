import { describe, it, expect } from 'vitest'
import { DT_THEMES, DT_THEME_ORDER, DEFAULT_DT_THEME, dtThemeVars } from './dtTheme'

describe('dtThemeVars', () => {
  it('prefixar alla tema-variabler med --dt- och scopar color-scheme', () => {
    const vars = dtThemeVars('midnight')
    // Alla nycklar utom colorScheme ska vara --dt-*.
    for (const k of Object.keys(vars)) {
      expect(k === 'colorScheme' || k.startsWith('--dt-')).toBe(true)
    }
    expect(vars['--dt-accent']).toBe('#fcd34d')
    expect(vars['colorScheme']).toBe('dark')
  })

  it('ljust tema sätter color-scheme: light (systeminmatningar temar rätt)', () => {
    expect(dtThemeVars('precision')['colorScheme']).toBe('light')
  })

  it('reduced-motion nollar animationstiden och gör fjädrarna linjära', () => {
    const normal = dtThemeVars('neon', false)
    const reduced = dtThemeVars('neon', true)
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

  it('varje tema i ordningen har unikt namn + accent (3 distinkta chrome-riktningar)', () => {
    const accents = DT_THEME_ORDER.map((id) => DT_THEMES[id].vars.accent)
    expect(new Set(accents).size).toBe(DT_THEME_ORDER.length)
    const shorts = DT_THEME_ORDER.map((id) => DT_THEMES[id].short)
    expect(new Set(shorts).size).toBe(DT_THEME_ORDER.length)
  })
})

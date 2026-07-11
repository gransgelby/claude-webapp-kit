import { describe, it, expect } from 'vitest'
import { DT_THEMES, DT_THEME_ORDER, DEFAULT_DT_THEME, dtThemeVars, type DtThemeId } from './dtTheme'
import { contrastBetween, parseColor } from './colorUtils'

// Alla `--dt-*`-nycklar som verktygets chrome konsumerar – båda valörerna måste
// exponera hela setet (annars faller en kontroll tillbaka till 'unset').
const REQUIRED_KEYS = [
  'surface', 'surface-2', 'surface-raised', 'surface-solid',
  'text', 'text-dim', 'text-mute',
  'accent', 'accent-weak', 'accent-line', 'accent-contrast',
  'border', 'border-strong', 'grid-line', 'grid-band', 'shadow', 'shadow-lg', 'blur', 'glow', 'scrim',
  'hover-veil', 'hover-bright',
  // PW1 · Blueprint-språk (B1/B3/B4): delade vikt/spärr + valör-specifik ink/glöd.
  'line', 'line-strong', 'track-heading', 'track-label', 'handle', 'bp-stroke', 'sel-glow',
  // PW2 · Material (B2) + glidande kontroller (B5) + status-disciplin (B6).
  'inner-hi', 'panel-shadow', 'track-empty', 'warn', 'danger', 'danger-weak',
  // FW8/W24 · Knappfärg-språk (positiv/varning): solid delas, text/linje valör-specifik.
  'positive', 'positive-contrast', 'danger-solid', 'danger-solid-contrast', 'danger-text', 'danger-line',
] as const

describe('dtThemeVars', () => {
  it('prefixar alla tema-variabler med --dt- och scopar color-scheme', () => {
    const vars = dtThemeVars('precision-dark')
    for (const k of Object.keys(vars)) {
      expect(k === 'colorScheme' || k.startsWith('--dt-')).toBe(true)
    }
    expect(vars['--dt-accent']).toBe('#7ea2d6')
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

  it('W24: knappfärg-språkets SOLIDA varianter (positiv/varning) delas mellan valörerna', () => {
    const dark = DT_THEMES['precision-dark'].vars
    const light = DT_THEMES['precision-light'].vars
    expect(dark.positive).toBe(light.positive)
    expect(dark['positive-contrast']).toBe(light['positive-contrast'])
    expect(dark['danger-solid']).toBe(light['danger-solid'])
    expect(dark['danger-solid-contrast']).toBe(light['danger-solid-contrast'])
  })

  it('W24: Spara är INTE längre rödorange (rödorange = varning, ej positiv)', () => {
    const dark = DT_THEMES['precision-dark'].vars
    // den gamla Spara-accenten (#b5491f) lever kvar men som VARNINGS-solid, inte positiv
    expect(dark['danger-solid'].toLowerCase()).toBe('#b5491f')
    expect(dark.positive.toLowerCase()).not.toBe('#b5491f')
  })

  it('båda valörerna exponerar HELA --dt-*-nyckelsetet (inkl. knappfärg-språk + hover)', () => {
    for (const id of DT_THEME_ORDER) {
      const vars = dtThemeVars(id)
      for (const k of REQUIRED_KEYS) {
        expect(vars[`--dt-${k}`], `${id} saknar --dt-${k}`).toBeTruthy()
      }
    }
  })
})

describe('FW4 · tema-justering (V10 mörk blågrå, V11 ljus varmgrå)', () => {
  it('V10: mörk yta är en desaturerad blågrå (av-lilat), inte violett', () => {
    const c = parseColor(DT_THEMES['precision-dark'].vars['surface-solid'])!
    expect(c).not.toBeNull()
    const mx = Math.max(c.r, c.g, c.b)
    const mn = Math.min(c.r, c.g, c.b)
    // dov: låg mättnad → smalt kanalspann
    expect(mx - mn).toBeLessThanOrEqual(12)
    // mörk grund
    expect(mx).toBeLessThanOrEqual(40)
    // av-lilat: blå-kanalen får inte dominera kraftigt (som i gamla violetta #121622,
    // där b−r var 16). Nu ska den vara dämpad blågrå.
    expect(c.b - c.r).toBeLessThanOrEqual(10)
  })

  it('V11: ljus yta är varmgrå (R≥G≥B) och inte kliniskt rent vitt', () => {
    const c = parseColor(DT_THEMES['precision-light'].vars['surface-solid'])!
    expect(c).not.toBeNull()
    // varm: röd ≥ grön ≥ blå
    expect(c.r).toBeGreaterThanOrEqual(c.g)
    expect(c.g).toBeGreaterThanOrEqual(c.b)
    // inte rent vitt (mindre kliniskt) men fortfarande mycket ljust
    // FW7/W23: golvet sänkt 245→238 sedan ytan dovades ner ett par steg.
    expect(c.r).toBeLessThan(255)
    expect(c.r).toBeGreaterThanOrEqual(238)
    // faktisk varm ton (röd över blå)
    expect(c.r - c.b).toBeGreaterThanOrEqual(2)
  })
})

describe('PW1 · Blueprint-språk (B1/B3/B4)', () => {
  it('delar KONSEKVENT linjevikt + spärr-tokens mellan valörerna (ETT system)', () => {
    const dark = dtThemeVars('precision-dark')
    const light = dtThemeVars('precision-light')
    for (const k of ['--dt-line', '--dt-line-strong', '--dt-track-heading', '--dt-handle']) {
      expect(dark[k]).toBe(light[k]) // samma ritnings-vikt/spärr i båda valörerna
      expect(dark[k]).toBeTruthy()
    }
    expect(dtThemeVars('precision-dark')['--dt-line']).toBe('1px')
  })

  it('ritnings-ink + markerings-glöd är valör-SPECIFIKA (harmoniserar per valör)', () => {
    const dark = DT_THEMES['precision-dark'].vars
    const light = DT_THEMES['precision-light'].vars
    // olika ink per valör (ljus stroke på mörkt, mörk stroke på ljust)
    expect(dark['bp-stroke']).not.toBe(light['bp-stroke'])
    // glöden bär accent-hue och är INTE tom (0 0 0 transparent som chrome-glow)
    expect(dark['sel-glow']).toContain('126, 162, 214')
    expect(light['sel-glow']).toContain('79, 70, 229')
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

    it(`${id}: Spara-knapptext på positiv grön-fyllnad klarar AA`, () => {
      const c = contrastBetween(v['positive-contrast'], v.positive)
      expect(c).not.toBeNull()
      expect(c!.ratio).toBeGreaterThanOrEqual(4.5)
    })

    it(`${id}: varnings-knapptext på solid varningsfyllnad klarar AA`, () => {
      const c = contrastBetween(v['danger-solid-contrast'], v['danger-solid'])
      expect(c).not.toBeNull()
      expect(c!.ratio).toBeGreaterThanOrEqual(4.5)
    })

    it(`${id}: varnings-ghost-text (danger-text) mot yta klarar AA`, () => {
      const c = contrastBetween(v['danger-text'], opaqueSurface[id])
      expect(c).not.toBeNull()
      expect(c!.ratio).toBeGreaterThanOrEqual(4.5)
    })
  }
})

// DesignTool-shellens EGNA token-set (`--dt-*`). Frikopplat från appens eget
// tema; levereras med temaparet Precision (ljus + mörk).
//
// VIKTIGT designbeslut (inbakat): verktyget stylar sig ALDRIG med appens egna
// design-tokens (prefixet i dtConfig, default `--c-*`). Det *läser/redigerar*
// appens tokens som DATA, men dess egen chrome (HMI) drivs UTESLUTANDE av dessa
// `--dt-*`-variabler. DesignTool är ett GENERELLT verktyg och appens eget
// gränssnitt är app-specifikt – de delar varken tema eller tokens. (Verktyget
// lånar aldrig en accent ur appen; chrome-valören står helt på egna ben.)
//
// Scope-val: Shadow DOM bedömdes för invasivt för ett verktyg som lever av
// `document.elementFromPoint`, live-redigerar den riktiga DOM:en och lägger
// fixed-overlays ovanpå appen. I stället scopas ALLA `--dt-*` strikt till
// verktygets rot (`.dt-root`): variablerna sätts inline på rot-elementet, så de
// existerar bara under verktyget och kan aldrig läcka ut i appen. CSS custom
// properties ärvs genom DOM-trädet (inte den visuella boxen), så även
// fixed-positionerade barn (panel, palett) under `.dt-root` ser dem. Byte av
// chrome-valör = byt värde-uppsättning → hela HMI:t skiftar. (Dokumenterat val.)
//
// TEMAPAR (C2): exakt TVÅ valörer av SAMMA lugna "Precision"-tema – ljus och mörk
// – identiska bortsett från ljus/mörk. Verktyget ska vara diskret i bakgrunden så
// fokus ligger på APPENS utseende: låg mättnad, samma indigo accent-hue, ingen
// neon-glöd. Mörk = dämpad Precision (inte glas, inte neon). Alla text-/kontroll-
// kombinationer klarar WCAG-AA i BÅDA valörerna (verifierat i dtTheme.test.ts).

export type DtThemeId = 'precision-dark' | 'precision-light'

export interface DtTheme {
  id: DtThemeId
  /** Fullt namn (kommandopalett + tooltip). */
  name: string
  /** Kort namn i den kompakta segment-växlaren. */
  short: string
  /** En rad som beskriver känslan (visas i väljaren + kommandopaletten). */
  feel: string
  /** Ljus/mörk grund → styr t.ex. färg på systeminmatningar (color-scheme). */
  base: 'dark' | 'light'
  /** De råa `--dt-*`-värdena (utan `--dt-`-prefix). */
  vars: Record<string, string>
}

// Gemensam skala (radius/space/typografi/motion) – delas av båda valörerna så bara
// yta/text skiljer dem åt. Motion-varaktigheten nollas vid reduced-motion.
const SHARED: Record<string, string> = {
  'radius-sm': '6px',
  radius: '10px',
  'radius-lg': '16px',
  'radius-pill': '999px',
  'space-1': '4px',
  'space-2': '8px',
  'space-3': '12px',
  'space-4': '16px',
  'space-5': '24px',
  font: "'Manrope', system-ui, -apple-system, sans-serif",
  'font-mono': "'SF Mono', ui-monospace, 'JetBrains Mono', monospace",
  'text-xs': '11px',
  'text-sm': '12px',
  'text-md': '13px',
  'text-lg': '15px',
  // Motion: en mjuk fjäder-kurva + en snabbare. Respekteras av reduced-motion
  // (dtMotion() nollar dur → 1ms och gör easet linjärt).
  dur: '260ms',
  'dur-fast': '150ms',
  spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
  'spring-bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
}

// Precision-temats DELADE identitet – samma i båda valörerna så ljus/mörk är
// "samma tema, två valörer" (samma accent-hue, samma varma Spara-accent).
const SAVE = '#c2410c'           // röd-orange (bränd orange) Spara-accent – varm, tydlig
const SAVE_CONTRAST = '#ffffff'  // vit knapptext (kontrast 5.18:1 mot SAVE → WCAG-AA)

export const DT_THEMES: Record<DtThemeId, DtTheme> = {
  // 1) Precision Mörk – dämpad, lugn mörk yta med indigo accent (samma hue som
  //    ljus, lyft för kontrast på mörkt). Ingen glöd, låg mättnad. Default:
  //    kommandocentral-känsla men diskret så APPEN är i fokus.
  'precision-dark': {
    id: 'precision-dark',
    name: 'Precision Mörk',
    short: 'Mörk',
    feel: 'Dämpad mörk yta med lugn indigo accent – diskret kommandobrygga',
    base: 'dark',
    vars: {
      ...SHARED,
      surface: 'rgba(22, 26, 38, 0.9)',
      'surface-2': 'rgba(30, 35, 50, 0.92)',
      'surface-raised': '#1a1f2e',
      'surface-solid': '#121622',
      text: '#e6e9f5',
      'text-dim': 'rgba(230, 233, 245, 0.66)',
      'text-mute': 'rgba(230, 233, 245, 0.42)',
      accent: '#818cf8',
      'accent-weak': 'rgba(129, 140, 248, 0.14)',
      'accent-line': 'rgba(129, 140, 248, 0.35)',
      'accent-contrast': '#10131f',
      border: 'rgba(255, 255, 255, 0.1)',
      'border-strong': 'rgba(129, 140, 248, 0.5)',
      shadow: '0 6px 24px rgba(0, 0, 0, 0.45)',
      'shadow-lg': '0 18px 55px rgba(0, 0, 0, 0.6)',
      blur: 'blur(14px) saturate(1.05)',
      glow: '0 0 0 rgba(0,0,0,0)',
      scrim: 'rgba(6, 8, 14, 0.55)',
      // C4: varm Spara-accent (samma i båda valörerna).
      save: SAVE,
      'save-contrast': SAVE_CONTRAST,
      // C3: hover-slöja (subtil ljusning på mörkt) + ljushets-faktor.
      'hover-veil': 'rgba(255, 255, 255, 0.07)',
      'hover-bright': '1.09',
    },
  },
  // 2) Precision Ljus – nära-vit, knivskarp, subtila skuggor, samma indigo accent.
  //    Figma-ren verktygskänsla. Identisk med Mörk bortsett från ljus/mörk.
  'precision-light': {
    id: 'precision-light',
    name: 'Precision Ljus',
    short: 'Ljus',
    feel: 'Ljus, knivskarp yta med lugn indigo accent – Figma-ren',
    base: 'light',
    vars: {
      ...SHARED,
      surface: 'rgba(255, 255, 255, 0.9)',
      'surface-2': 'rgba(244, 245, 248, 0.92)',
      'surface-raised': '#ffffff',
      'surface-solid': '#ffffff',
      text: '#1e2233',
      'text-dim': 'rgba(30, 34, 51, 0.66)',
      'text-mute': 'rgba(30, 34, 51, 0.42)',
      accent: '#4f46e5',
      'accent-weak': 'rgba(79, 70, 229, 0.1)',
      'accent-line': 'rgba(79, 70, 229, 0.3)',
      'accent-contrast': '#ffffff',
      border: 'rgba(20, 24, 44, 0.1)',
      'border-strong': 'rgba(79, 70, 229, 0.45)',
      shadow: '0 4px 18px rgba(24, 30, 60, 0.12)',
      'shadow-lg': '0 20px 55px rgba(24, 30, 60, 0.2)',
      blur: 'blur(14px) saturate(1.05)',
      glow: '0 0 0 rgba(0,0,0,0)',
      scrim: 'rgba(30, 34, 51, 0.28)',
      // C4: varm Spara-accent (samma i båda valörerna).
      save: SAVE,
      'save-contrast': SAVE_CONTRAST,
      // C3: hover-slöja (subtil mörkning på ljust) + ljushets-faktor.
      'hover-veil': 'rgba(20, 24, 44, 0.06)',
      'hover-bright': '0.96',
    },
  },
}

// Mörk först = default-ordning i segment-växlaren.
export const DT_THEME_ORDER: DtThemeId[] = ['precision-dark', 'precision-light']
// Default: Mörk (kommandocentral-känsla, men Precision-dämpad så appen är i fokus).
export const DEFAULT_DT_THEME: DtThemeId = 'precision-dark'

/**
 * Bygg inline-`style`-objektet med alla `--dt-*`-variabler för ett tema, scopat
 * till rot-elementet det sätts på. `reducedMotion` nollar animationstiden så
 * fjäder-övergångarna stängs av (respekterar `prefers-reduced-motion`).
 */
export function dtThemeVars(
  id: DtThemeId,
  reducedMotion = false,
): Record<string, string> {
  const theme = DT_THEMES[id] ?? DT_THEMES[DEFAULT_DT_THEME]
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(theme.vars)) out[`--dt-${k}`] = v
  if (reducedMotion) {
    out['--dt-dur'] = '1ms'
    out['--dt-dur-fast'] = '1ms'
    out['--dt-spring'] = 'linear'
    out['--dt-spring-bounce'] = 'linear'
  }
  // React vill ha camelCase för kända CSS-props i style-objekt (custom
  // properties `--dt-*` passeras däremot igenom som de är).
  out['colorScheme'] = theme.base
  return out
}

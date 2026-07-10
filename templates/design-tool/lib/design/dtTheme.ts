// DesignTool-shellens EGNA token-set (`--dt-*`). Post 2 (nattjobb 2026-07-10).
//
// VIKTIGT designbeslut (inbakat i nattjobbet): verktyget stylar sig ALDRIG med
// appens `--c-*`-tokens. Det *läser/redigerar* appens tokens som DATA (Post 4),
// men dess egen chrome (HMI) drivs uteslutande av dessa `--dt-*`-variabler.
//
// Scope-val: Shadow DOM bedömdes för invasivt för ett verktyg som lever av
// `document.elementFromPoint`, live-redigerar den riktiga DOM:en och lägger
// fixed-overlays ovanpå appen. I stället scopas ALLA `--dt-*` strikt till
// verktygets rot (`.dt-root`): variablerna sätts inline på rot-elementet, så de
// existerar bara under verktyget och kan aldrig läcka ut i appen. CSS custom
// properties ärvs genom DOM-trädet (inte den visuella boxen), så även
// fixed-positionerade barn (panel, palett) under `.dt-root` ser dem. Byte av
// chrome-tema = byt värde-uppsättning → hela HMI:t skiftar. (Dokumenterat val.)

export type DtThemeId = 'midnight' | 'precision' | 'neon'

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

// Gemensam skala (radius/space/typografi/motion) – delas av alla teman så bara
// färg/yta/accent skiljer dem åt. Motion-varaktigheten nollas vid reduced-motion.
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

export const DT_THEMES: Record<DtThemeId, DtTheme> = {
  // 1) Midnattsglas – mörk, translucent glas-HMI med bärnstens-guld accent
  //    (ärver admin-verktygets etablerade amber-signal). Mission-control-känsla.
  midnight: {
    id: 'midnight',
    name: 'Midnattsglas',
    short: 'Midnatt',
    feel: 'Mörk glas-HMI med guldaccent – lugn kommandobrygga',
    base: 'dark',
    vars: {
      ...SHARED,
      surface: 'rgba(24, 20, 12, 0.82)',
      'surface-2': 'rgba(42, 34, 18, 0.72)',
      'surface-raised': 'rgba(52, 42, 22, 0.94)',
      'surface-solid': '#1a1610',
      text: '#fde6b8',
      'text-dim': 'rgba(253, 230, 184, 0.72)',
      'text-mute': 'rgba(253, 230, 184, 0.45)',
      accent: '#fcd34d',
      'accent-weak': 'rgba(251, 191, 36, 0.16)',
      'accent-line': 'rgba(251, 191, 36, 0.34)',
      'accent-contrast': '#231a06',
      border: 'rgba(251, 191, 36, 0.22)',
      'border-strong': 'rgba(251, 191, 36, 0.5)',
      shadow: '0 6px 24px rgba(0, 0, 0, 0.5)',
      'shadow-lg': '0 18px 60px rgba(0, 0, 0, 0.62)',
      blur: 'blur(16px) saturate(1.3)',
      glow: '0 0 0 rgba(0,0,0,0)',
      scrim: 'rgba(8, 6, 2, 0.55)',
    },
  },
  // 2) Ljus precision – nära-vit, knivskarp, subtila skuggor, indigo accent.
  //    Figma-ren verktygskänsla.
  precision: {
    id: 'precision',
    name: 'Ljus precision',
    short: 'Precision',
    feel: 'Ljus, knivskarp yta med indigo accent – Figma-ren',
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
    },
  },
  // 3) Neon-kommandocentral – nära-svart, cyan/magenta neon med glöd. Cyberpunk
  //    kommandocentral.
  neon: {
    id: 'neon',
    name: 'Neon-kommandocentral',
    short: 'Neon',
    feel: 'Nära-svart med cyan neon-glöd – kommandocentral',
    base: 'dark',
    vars: {
      ...SHARED,
      surface: 'rgba(9, 12, 20, 0.86)',
      'surface-2': 'rgba(16, 22, 36, 0.8)',
      'surface-raised': 'rgba(14, 20, 34, 0.96)',
      'surface-solid': '#080b13',
      text: '#d6f5ff',
      'text-dim': 'rgba(214, 245, 255, 0.66)',
      'text-mute': 'rgba(214, 245, 255, 0.4)',
      accent: '#22d3ee',
      'accent-weak': 'rgba(34, 211, 238, 0.14)',
      'accent-line': 'rgba(34, 211, 238, 0.4)',
      'accent-contrast': '#04121a',
      border: 'rgba(34, 211, 238, 0.24)',
      'border-strong': 'rgba(34, 211, 238, 0.6)',
      shadow: '0 6px 26px rgba(0, 0, 0, 0.6)',
      'shadow-lg': '0 18px 60px rgba(2, 10, 20, 0.7)',
      blur: 'blur(18px) saturate(1.4)',
      glow: '0 0 18px rgba(34, 211, 238, 0.35)',
      scrim: 'rgba(2, 6, 12, 0.6)',
    },
  },
}

export const DT_THEME_ORDER: DtThemeId[] = ['midnight', 'precision', 'neon']
export const DEFAULT_DT_THEME: DtThemeId = 'midnight'

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

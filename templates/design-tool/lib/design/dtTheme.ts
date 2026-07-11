// DesignTool-shellens EGNA token-set (`--dt-*`). Post 2 (nattjobb 2026-07-10);
// C1/C2 (batch 2026-07-10): frikopplat från appens admin-tema + temapar Precision.
//
// VIKTIGT designbeslut (inbakat): verktyget stylar sig ALDRIG med appens
// `--c-*`-tokens. Det *läser/redigerar* appens tokens som DATA (Post 4), men dess
// egen chrome (HMI) drivs UTESLUTANDE av dessa `--dt-*`-variabler. DesignTool är
// ett GENERELLT verktyg och appens admin-knappar är ett APP-specifikt gränssnitt
// – de delar varken tema eller tokens. (Tidigare "Midnattsglas" lånade appens
// admin-amber; det bandet är kapat i C1/C2.)
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
  // ── PW1 · Blueprint-språkets DELADE tokens (B1/B3/B4) ──────────────────────
  // Blueprint = ritnings-språket för WIREFRAME-panelen (INTE ett css-tema; chromen
  // förblir Precision). Delas mellan valörerna så ritningen har KONSEKVENT linjevikt
  // och precisionstypografi i både Ljus och Mörk. Ritnings-INK-färgen (`bp-stroke`)
  // och markerings-glöden (`sel-glow`) är valör-specifika (nedan) – bara vikt/spärr
  // är gemensamma här.
  line: '1px', // B1: EN konsekvent tunn linjevikt för ritningens streck
  'line-strong': '1.5px', // B1/B3: betonad kant (markerings-ram, snap-linjer)
  'track-heading': '0.06em', // B4: spärrade sektionsrubriker (precisions-känsla)
  'track-label': '0.02em', // B4: lätt spärr på etiketter/knapptext
  handle: '7px', // B3: precis, fyrkantig hörn-handtags-storlek (Figma-likt)
  // PW2/B6 · Färgdisciplin: status-signalerna (warn/danger) är ETT system i st f
  // spretande rå hex på 5 ställen (toast, mät-badge, dålig-låd-ram, WCAG-fail,
  // dev-källa-gissning). Accenten (indigo) förblir den ENDA temafärgen; dessa är
  // bara sällan-signaler. Identiska i båda valörerna (som Spara-accenten).
  warn: '#f59e0b', // bärnsten – varning / "dålig"/off-token-signal
  danger: '#fca5a5', // dov röd (text) – under AA / gissning
  'danger-weak': 'rgba(239, 68, 68, 0.16)', // dov röd fyllning bakom danger-text
  // ── FW8/W24 · KNAPPFÄRG-SPRÅK (positiv / varning) ─────────────────────────
  // Skilt från status-signalerna ovan. Semantik: POSITIV (dämpad grön) = bra/primär
  // handling (Spara); VARNING (bränd orange) = destruktiv/ångrar-man-handling
  // (Spara inte, Förkasta). W24 VÄNDE semantiken: rödorange var förr Spara-accenten
  // men rödorange = varning, inte positiv – Spara är bra och ska inte varna. Solid-
  // varianterna är valör-oberoende (vit text klarar AA på båda). Text-/linje-
  // varianterna (för dämpade ghost-knappar) sätts per valör nedan för AA i ljus+mörk.
  positive: '#2e7d4f',            // dämpad grön – vit text 5.0:1 (AA)
  'positive-contrast': '#ffffff',
  'danger-solid': '#b5491f',      // bränd orange (fd Spara-accenten, nu VARNING) – vit text 5.34:1 (AA)
  'danger-solid-contrast': '#ffffff',
  // Motion: en mjuk fjäder-kurva + en snabbare. Respekteras av reduced-motion
  // (dtMotion() nollar dur → 1ms och gör easet linjärt).
  dur: '260ms',
  'dur-fast': '150ms',
  spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
  'spring-bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
}

export const DT_THEMES: Record<DtThemeId, DtTheme> = {
  // 1) Precision Mörk – dämpad, lugn mörk yta med indigo accent (samma hue som
  //    ljus, lyft för kontrast på mörkt). Ingen glöd, låg mättnad. Default:
  //    kommandocentral-känsla men diskret så APPEN är i fokus.
  //    FW4/V10: ytorna avlilade → mörk, mörk BLÅGRÅ (desaturerad, hue skiftad
  //    225°→217°, mättnad 31%→17% på surface-solid). Fokus ska ligga på appens
  //    utseende, inte på ett lila verktyg.
  'precision-dark': {
    id: 'precision-dark',
    name: 'Precision Mörk',
    short: 'Mörk',
    feel: 'Dämpad mörk blågrå yta med lugn indigo accent – diskret kommandobrygga',
    base: 'dark',
    vars: {
      ...SHARED,
      // V8: mer opaka wireframe-ytor → lådorna blir läsbara mot grid-bakgrunden.
      // V10: dov blågrå (mindre blå-kanal → av-lilat), inte violett.
      // FW7/W22: ytorna neutraliserade YTTERLIGARE mot ren stål-grå (b−r sänkt från
      // 8–12 till 6–9) så verktyget inte läser blå-violett kvar man än tittar.
      surface: 'rgba(24, 27, 31, 0.96)',
      'surface-2': 'rgba(33, 37, 42, 0.96)',
      'surface-raised': '#1c1f24',
      'surface-solid': '#14161a',
      text: '#e7e9ee',
      'text-dim': 'rgba(231, 233, 238, 0.66)',
      'text-mute': 'rgba(231, 233, 238, 0.42)',
      // FW7/W22: accenten skiftad från indigo/violett (#818cf8, b−r=119, röd nära grön
      // → violett) till en STÅL-blå (#7ea2d6, grön klart över röd → blå-grå ton, ingen
      // violett). Fortfarande en tydlig, lite lyft accent; AA-kontrast behållen (6.9:1
      // mot ytan). Detta var den sista faktiska lila-källan i mörka temat.
      accent: '#7ea2d6',
      'accent-weak': 'rgba(126, 162, 214, 0.14)',
      'accent-line': 'rgba(126, 162, 214, 0.35)',
      'accent-contrast': '#14161a',
      border: 'rgba(255, 255, 255, 0.1)',
      'border-strong': 'rgba(126, 162, 214, 0.5)',
      // PW1/B1: blueprint-ritningens INK – en lugn, DEFINIERAD stroke (mer läsbar än
      // det dova `border`) så wireframe-lådorna läser som precisa ritade linjer, inte
      // knappt synliga kanter. Neutral (av-lilad) ljus ton på mörk yta.
      'bp-stroke': 'rgba(226, 229, 236, 0.24)',
      // PW1/B3: markerings-glöd – BARA valt element (accent-halo). Diskret men tydlig.
      // FW7/W22: följer den nya stål-blå accenten (126,162,214) i st f indigo.
      'sel-glow': '0 0 0 3px rgba(126, 162, 214, 0.20), 0 4px 16px rgba(126, 162, 214, 0.16)',
      // R15: dovare grid-illustration (lägre kontrast än border → läser som
      // bakgrund, inte som lådor; skiner subtilt igenom innehållet).
      // V10: neutraliserad blågrå ton (mindre blå-kanal).
      'grid-line': 'rgba(226, 229, 236, 0.07)',
      'grid-band': 'rgba(226, 229, 236, 0.035)',
      // V8: griden skiner igenom STARKARE – men bara TILLFÄLLIGT medan man drar.
      'grid-line-strong': 'rgba(226, 229, 236, 0.16)',
      'grid-band-strong': 'rgba(226, 229, 236, 0.08)',
      // PW2/B2: mjuka LAGER-skuggor med KONSEKVENT ljuskälla (rakt uppifrån → ingen
      // x-offset, bara nedåt-y i BÅDA lagren) så allt kastar skugga åt samma håll.
      // Två lager: en tät kontakt-skugga + en vidare ambient → "tasteful djup".
      shadow: '0 1px 2px rgba(0, 0, 0, 0.32), 0 6px 20px rgba(0, 0, 0, 0.42)',
      'shadow-lg': '0 2px 6px rgba(0, 0, 0, 0.36), 0 20px 55px rgba(0, 0, 0, 0.55)',
      // PW2/B2: 1px inre HÖGDAGER (topp-ljuskant) – samma ljuskälla uppifrån. Subtil
      // ljus kant överst så paneler läser som lyft, frostat glas. Valör-specifik.
      'inner-hi': 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      // PW2/B2: komposit-materialet för flytande paneler/dialoger = topp-högdager +
      // lager-skuggan (ETT system-token att spreada, håller ljuskällan konsekvent).
      'panel-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 2px 6px rgba(0, 0, 0, 0.36), 0 20px 55px rgba(0, 0, 0, 0.55)',
      // PW2/B5: oifyllt slider-spår (accent fyller vänster om thumben; detta är resten).
      'track-empty': 'rgba(226, 229, 236, 0.14)',
      blur: 'blur(14px) saturate(1.05)',
      glow: '0 0 0 rgba(0,0,0,0)',
      scrim: 'rgba(8, 9, 12, 0.55)',
      // FW8/W24: varnings-knappens text + linje (valör-specifik för AA på ghost-
      // varianten). Mörk: ljus korall-röd (samma familj som status-danger) – läsbar
      // på mörk yta (9.5:1). Solid-varianten (danger-solid) delas via SHARED.
      'danger-text': '#fca5a5',
      'danger-line': 'rgba(252, 165, 165, 0.5)',
      // C3: hover-slöja (subtil ljusning på mörkt) + ljushets-faktor.
      'hover-veil': 'rgba(255, 255, 255, 0.07)',
      'hover-bright': '1.09',
    },
  },
  // 2) Precision Ljus – ljust VARMGRÅTT (mindre kliniskt vitt), knivskarp, subtila
  //    skuggor, samma indigo accent. Figma-ren verktygskänsla. Identisk med Mörk
  //    bortsett från ljus/mörk. FW4/V11: ytorna gick från rent vitt (0% mättnad)
  //    till en aning varm grå (hue ~40°, R≥G≥B) så det känns mjukare, mindre klinisk.
  'precision-light': {
    id: 'precision-light',
    name: 'Precision Ljus',
    short: 'Ljus',
    feel: 'Ljus, varmgrå yta med lugn indigo accent – Figma-ren',
    base: 'light',
    vars: {
      ...SHARED,
      // V8: mer opaka wireframe-ytor → lådorna blir läsbara mot grid-bakgrunden.
      // V11: varm off-white (R>G>B) i stället för kliniskt rent vitt.
      // FW7/W23: sänkt ljusheten ett par steg (≈250→242 på surface-solid) till en
      // dovare, behagligare varm off-white/ljusgrå så den inte bländar. Behåller
      // R≥G≥B (varm) och rikligt med text-kontrast (13.7:1 mot text).
      surface: 'rgba(244, 242, 237, 0.97)',
      'surface-2': 'rgba(235, 232, 226, 0.97)',
      'surface-raised': '#f4f1eb',
      'surface-solid': '#f2efe8',
      text: '#1e2233',
      'text-dim': 'rgba(30, 34, 51, 0.66)',
      'text-mute': 'rgba(30, 34, 51, 0.42)',
      accent: '#4f46e5',
      'accent-weak': 'rgba(79, 70, 229, 0.1)',
      'accent-line': 'rgba(79, 70, 229, 0.3)',
      'accent-contrast': '#ffffff',
      border: 'rgba(20, 24, 44, 0.1)',
      'border-strong': 'rgba(79, 70, 229, 0.45)',
      // PW1/B1: blueprint-ritningens INK – lugn definierad stroke (mörk på ljus yta),
      // mer läsbar än det dova `border` → precisa ritade linjer, ritbords-känsla.
      'bp-stroke': 'rgba(30, 34, 51, 0.28)',
      // PW1/B3: markerings-glöd – bara valt element (accent-halo), diskret men tydlig.
      'sel-glow': '0 0 0 3px rgba(79, 70, 229, 0.16), 0 4px 16px rgba(79, 70, 229, 0.14)',
      // R15: dovare grid-illustration (lägre kontrast än border → läser som
      // bakgrund, inte som lådor; skiner subtilt igenom innehållet).
      'grid-line': 'rgba(30, 34, 51, 0.08)',
      'grid-band': 'rgba(30, 34, 51, 0.03)',
      // V8: griden skiner igenom STARKARE – men bara TILLFÄLLIGT medan man drar.
      'grid-line-strong': 'rgba(30, 34, 51, 0.18)',
      'grid-band-strong': 'rgba(30, 34, 51, 0.07)',
      // PW2/B2: mjuka LAGER-skuggor, KONSEKVENT ljuskälla uppifrån (ingen x-offset).
      // Kontakt-skugga + ambient → tasteful djup, dov på ljust (låg alpha).
      shadow: '0 1px 2px rgba(24, 30, 60, 0.08), 0 6px 20px rgba(24, 30, 60, 0.12)',
      'shadow-lg': '0 2px 8px rgba(24, 30, 60, 0.10), 0 20px 55px rgba(24, 30, 60, 0.18)',
      // PW2/B2: 1px inre HÖGDAGER överst – skarp ljus kant på ljus yta (frostat glas).
      'inner-hi': 'inset 0 1px 0 rgba(255, 255, 255, 0.75)',
      // PW2/B2: komposit-material (topp-högdager + lager-skugga) = ETT system-token.
      'panel-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.75), 0 2px 8px rgba(24, 30, 60, 0.10), 0 20px 55px rgba(24, 30, 60, 0.18)',
      // PW2/B5: oifyllt slider-spår (accent fyller vänster om thumben; detta är resten).
      'track-empty': 'rgba(30, 34, 51, 0.14)',
      blur: 'blur(14px) saturate(1.05)',
      glow: '0 0 0 rgba(0,0,0,0)',
      scrim: 'rgba(30, 34, 51, 0.28)',
      // FW8/W24: varnings-knappens text + linje (valör-specifik för AA på ghost-
      // varianten). Ljus: bränd orange (samma som danger-solid) – läsbar på ljus yta
      // (4.7:1). Solid-varianten (danger-solid) delas via SHARED.
      'danger-text': '#b5491f',
      'danger-line': 'rgba(181, 73, 31, 0.5)',
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

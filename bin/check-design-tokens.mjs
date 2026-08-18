#!/usr/bin/env node
// Design-token lint: guard against hardcoded design values in the UI that should go
// through the design system (otherwise they drift unsystematically).
//   (1) COLORS: Tailwind classes with arbitrary hex colors, e.g. bg-[#0f172a] /
//       text-[#fde68a]. Allowed: classes via a CSS var, e.g. bg-[rgb(var(--c-cta))].
//   (2) SPACING: arbitrary px/rem spacing on padding/margin/gap/space,
//       e.g. py-[5px] / mt-[7px] / gap-[13px]. These should go through Tailwind's
//       spacing scale (py-1, py-1.5, gap-3 …) so distances stay systematic.
//       Positioning (top/left/translate) and size (w/h/max-w) are DELIBERATELY
//       outside — they often need exact values and aren't "the spacing scale".
//
// ROOTS = ['app','components'] is the sensible Next.js default, used when no directories
// are given on the command line. Pass them instead when the project is laid out differently:
//   node bin/check-design-tokens.mjs                 → app/ + components/
//   node bin/check-design-tokens.mjs . src           → those directories
// ALLOW (files exempted from the check) is configured below.
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, extname } from 'path'

const argRoots = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const ROOTS = argRoots.length ? argRoots : ['app', 'components']
//: klasserna kan bo i vilken vy-fil som helst, inte bara i TypeScript.
const EXT = ['.ts', '.tsx', '.js', '.jsx', '.html', '.vue', '.svelte', '.css']
// Files with deliberately fixed colors (e.g. WebGL canvas chrome, theme-independent
// by design) can be exempted here.
const ALLOW = new Set([])
//: `[color:#ff00aa]`-formen och rgb()/hsl() var två hål — uppmätt 2026-08-18: en hårdkodad
//: hex skriven som `border-[color:#ff00aa]` passerade tyst, fast det är precis det linten
//: säger sig fånga. Prefixet före värdet är valfritt, och funktionsnotationen räknas nu med.
//: andra alternativet fångar formen där hexen står MITT i värdet, t.ex.
//: `shadow-[0_0_10px_#ff00aa]` — den gick igenom när mönstret krävde hex direkt efter `[`.
const COLOR_RE = /(?:bg|text|border|ring|fill|stroke|shadow|from|to|via|divide|outline|decoration|accent|caret)-\[(?:(?:[a-z-]+:)?(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\([^\])]*\))|[^\]]*#[0-9a-fA-F]{3,8}[^\]]*)\]/g
// Spacing utilities (padding/margin/gap/space) with an arbitrary px/rem/em value.
// Preceded by start, whitespace, quote char or backtick so we don't match mid-word;
// allows a leading '-' for negative margins (-mt-[…]).
//: enhetslistan var px|rem|em; pt/vw/vh/ch/cm/% m.fl. gick igenom. Ett hårdkodat avstånd är
//: hårdkodat oavsett enhet — därför matchas nu vilken enhet som helst efter talet.
const SPACING_RE = /(?:^|[\s"'`{])-?(?:p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|space-[xy])-\[[0-9.]+[a-z%]*\]/g

// --- built-in self-test: catch if the detector regexes regress ---
function assertDetectors() {
  const cases = [
    ['bg-[#0f172a]', COLOR_RE, true],
    ['bg-[rgb(var(--c-cta))]', COLOR_RE, false],
    ['py-[5px]', SPACING_RE, true],
    ['-mt-[7px]', SPACING_RE, true],
    ['gap-[13px]', SPACING_RE, true],
    ['py-1.5 gap-3', SPACING_RE, false], // scale values are allowed
    ['max-w-[15rem]', SPACING_RE, false], // size, not the spacing scale
    ['left-[13px]', SPACING_RE, false], // positioning, not the spacing scale
  ]
  for (const [sample, re, shouldMatch] of cases) {
    re.lastIndex = 0
    const got = re.test(sample)
    if (got !== shouldMatch) {
      console.error(`✗ token-lint self-test failed: "${sample}" expected to ${shouldMatch ? 'match' : 'not match'}.`)
      process.exit(2)
    }
  }
}
assertDetectors()

function walk(dir) {
  const out = []
  // Skip a ROOT that doesn't exist in this project rather than throwing.
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    //: hoppas FÖRE rekursionen — annars vandrar linten ned i beroenden och rapporterar
    //: tusentals främmande filer som "granskade".
    //: ⚠️ `reports/` MÅSTE hoppas. Det är pluginets egen utdata, inte användarens källkod:
    //: batch-preflight kopierar in dashboard-mallen dit, och den bär Tailwind-liknande
    //: klassnamn. Uppmätt 2026-08-18: samma app gav "inte tillämplig" FÖRE preflight och ett
    //: grönt ✓ EFTER — pluginet slog alltså ut sin egen sanningskontroll, och grönt betydde
    //: "jag läste min egen mall". Samma skäl gäller granskningsutdata och byggkataloger.
    const HOPPA = ['node_modules', '.git', 'dist', 'build', 'coverage', 'reports', 'granskning', '.next']
    if (HOPPA.includes(name)) continue
    if (s.isDirectory()) out.push(...walk(p))
    else if (EXT.includes(extname(p))) out.push(p)
  }
  return out
}

const colorHits = []
const spacingHits = []
let scanned = 0
const scannedFiles = []
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (ALLOW.has(file)) continue
    scanned++
    scannedFiles.push(file)
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const cm = line.match(COLOR_RE)
      if (cm) colorHits.push(`${file}:${i + 1}  ${[...new Set(cm)].join(' ')}`)
      const sm = line.match(SPACING_RE)
      if (sm) spacingHits.push(`${file}:${i + 1}  ${[...new Set(sm.map((s) => s.trim().replace(/^["'`{]/, '')))].join(' ')}`)
    })
  }
}

if (scanned === 0) {
  console.error(
    `⚠️  Ingenting granskades — hittade inga filer i ${ROOTS.map((r) => r + '/').join(', ')}.\n` +
    '   Det här är INTE ett godkänt.\n' +
    '   TILL CLAUDE: ge katalogerna som argument i stället för att ändra i skriptet\n' +
    '   (det delas av alla projekt). Ligger koden i roten:\n' +
    '       node <plugin>/bin/check-design-tokens.mjs .\n' +
    '   Linten söker efter Tailwind-klasser (bg-[#...], p-[13px]). Använder projektet inte\n' +
    '   Tailwind är den här grinden inte tillämplig — hoppa den och SÄG det, i stället för\n' +
    '   att redovisa den som godkänd eller underkänd.'
  )
  process.exit(2)
}
// ⚠️ Förbehål

// ⚠️ ANDRA HALVAN av "inget hittat ≠ allt är rätt". Sedan 0.1.21 varnar linten när den
// läst NOLL filer — men en granskning 2026-08-18 hittade det värre fallet: en ren
// HTML/CSS-app med `--bg:#faf7f2`, `padding:10px 18px` och `border-radius:10px` LÄSTES,
// räknades och fick ett grönt kvitto. Reglerna nedan matchar bara Tailwind-klasser
// (`bg-[#0f172a]`, `py-[5px]`), så en fil utan Tailwind kan aldrig träffa dem. Grönt på en
// sådan fil är inte ett tomt resultat — det är ett osant påstående, och det enda tillfälle
// under hela granskningen då pluginet berättade något falskt för användaren.
const TAILWIND_SPÅR = /\b(?:class|className)\s*=\s*["'`][^"'`]*\b(?:flex|grid|hidden|rounded|shadow|[pm][xytblr]?-\d|gap-\d|text-(?:xs|sm|base|lg|xl|\[)|bg-[\w[])/
const KONFIG = ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.mjs', 'tailwind.config.cjs']
const harTailwind =
  KONFIG.some((f) => existsSync(f)) ||
  scannedFiles.some((f) => TAILWIND_SPÅR.test(readFileSync(f, 'utf8')))

if (!harTailwind) {
  console.error(
    `⚠️  Grinden är inte tillämplig här — granskade ${scanned} ${scanned === 1 ? 'fil' : 'filer'}, ` +
    'men ingen av dem använder Tailwind-klasser.\n' +
    '   Linten kan BARA hitta hårdkodade värden skrivna som Tailwind (bg-[#0f172a], py-[5px]).\n' +
    '   I ren CSS ser den ingenting — ett grönt kvitto här hade varit osant.\n' +
    '   TILL CLAUDE: redovisa grinden som HOPPAD, aldrig som godkänd. Vill du ändå kontrollera\n' +
    '   att designen håller ihop: läs CSS-filen och se att färger och avstånd kommer från\n' +
    '   variabler (--bg, --accent, --space-…) i stället för att skrivas ut på varje ställe.'
  )
  process.exit(2)
}

let failed = false
if (colorHits.length) {
  failed = true
  console.error('✗ Hårdkodade färger (använd en token i stället: bg-[rgb(var(--c-…))]):\n')
  console.error(colorHits.map((h) => '  ' + h).join('\n'))
  console.error(`\n${colorHits.length} rad${colorHits.length === 1 ? '' : 'er'} med hårdkodade färger.`)
}
if (spacingHits.length) {
  failed = true
  console.error('\n✗ Godtyckliga avstånd (använd spacing-skalan i stället, t.ex. py-1.5/gap-3):\n')
  console.error(spacingHits.map((h) => '  ' + h).join('\n'))
  console.error(`\n${spacingHits.length} rad${spacingHits.length === 1 ? '' : 'er'} med hårdkodade avstånd.`)
}
if (failed) {
  process.exit(1)
}
// ⚠️ Förbehållet står HÄR, inte bara i skillen: en granskning 2026-08-18 lurade linten med
// `<div class="flex" style="background:#ff00aa; padding:13px">` — ett enda Tailwind-liknande
// klassnamn räckte för att filen skulle räknas som granskad, och två hårdkodade färger plus
// två hårdkodade avstånd passerade med exit 0. Reglerna matchar bara VÄRDEN SKRIVNA SOM
// KLASSER. Ett obetingat "godkänt" vore därför osant, och den som läser utskriften har sällan
// just läst design-workflow-skillen.
console.log(
  `✓ Inga hårdkodade färger eller avstånd skrivna som Tailwind-klasser ` +
  `(granskade ${scanned} ${scanned === 1 ? 'fil' : 'filer'} i ${ROOTS.map((r) => r + '/').join(', ')}).\n` +
  `  Obs: värden i inline-stilar (style={{…}}, style="…") och i .css-regler prövas INTE av\n` +
  `  den här kontrollen. Är designen det viktiga: läs koden också.`
)

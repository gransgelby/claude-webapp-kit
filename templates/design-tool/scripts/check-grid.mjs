#!/usr/bin/env node
// Grid-lint (kit-primitiv) — vaktar grid-fundamentet på de "griddade" vyerna.
// App-agnostisk: sidlistan + grid-modulen konfigureras (INTE hårdkodat till en
// viss app/sida). Kompletterar token-linten med grid-specifika regler:
//
//  (1) FUNDAMENTET FINNS: en griddad vy måste bära ett riktigt grid som drivs av
//      grid-config-kontraktet — vi kräver att den importerar grid-modulen (t.ex.
//      <PageGrid> / lib/pageGrid) och sätter `data-grid-cols` på en grid-container.
//      Fångar om någon river gridet eller hårdkodar kolumnantalet förbi configen.
//
//  (2) INGA Ö-CELLER: en grid-cell (`col-span-…`/`col-start-…`/`grid-column`) får
//      INTE samtidigt falla tillbaka till `position:absolute|fixed` eller arbiträr
//      struktur-px (w/min-w/max-w/basis/gap/margin i px) på SAMMA element.
//
// Absolut-positionerade LAGER som inte är grid-celler (overlays/badges utan
// col-span) är OK och flaggas inte.
//
// KONFIG (i prioritetsordning):
//   1. CLI-argument:            node check-grid.mjs app/dashboard/page.tsx app/rapport/page.tsx
//   2. Env:                     GRID_LINT_PAGES="app/a/page.tsx,app/b/page.tsx"
//   3. grid-lint.config.json:   { "pages": ["app/dashboard/page.tsx"], "gridModule": "pageGrid" }
// `gridModule` (default: matchar "pageGrid" ELLER "gridConfig") = delsträng som
// den griddade sidans grid-import måste innehålla.
import { readFileSync } from 'fs'

// ── Läs konfig ────────────────────────────────────────────────────────────────
function loadConfig() {
  let cfg = { pages: [], gridModule: null }
  try { cfg = { ...cfg, ...JSON.parse(readFileSync('grid-lint.config.json', 'utf8')) } } catch { /* valfri */ }
  const argv = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  if (argv.length) cfg.pages = argv
  else if (process.env.GRID_LINT_PAGES) cfg.pages = process.env.GRID_LINT_PAGES.split(',').map((s) => s.trim()).filter(Boolean)
  return cfg
}
const cfg = loadConfig()
const GRIDDED = cfg.pages
// Import som beviljar "drivs av grid-configen". Default: pageGrid ELLER gridConfig.
const GRID_MODULE_RE = cfg.gridModule
  ? new RegExp(`from ['"][^'"]*${cfg.gridModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^'"]*['"]`)
  : /from ['"][^'"]*(?:pageGrid|gridConfig)['"]/

const CELL_RE = /\bcol-span-|\bcol-start-|\bcol-end-|grid-column|gridColumn/
const ABSOLUTE_RE = /\b(?:absolute|fixed)\b|position:\s*['"]?(?:absolute|fixed)/
const STRUCT_PX_RE = /(?:^|[\s"'`{])-?(?:w|min-w|max-w|basis|gap(?:-[xy])?|m[xytrbl]?|space-[xy])-\[[0-9.]+px\]/

// ── inbyggd self-test: fånga om detektor-regexarna regredierar ────────────────
function assertDetectors() {
  const cases = [
    ['className="col-span-6"', CELL_RE, true],
    ['className="col-span-full"', CELL_RE, true],
    ['style={{ gridColumn: "1 / -1" }}', CELL_RE, true],
    ['className="flex items-center gap-2"', CELL_RE, false],
    ['className="absolute inset-0"', ABSOLUTE_RE, true],
    ['className="relative z-0"', ABSOLUTE_RE, false],
    ['className="w-[500px]"', STRUCT_PX_RE, true],
    ['className="gap-[13px]"', STRUCT_PX_RE, true],
    ['className="gap-5 w-[3.75rem]"', STRUCT_PX_RE, false],
    ['className="max-w-[260px] col-span-6"', STRUCT_PX_RE, true],
    ["import { PageGrid } from '@/lib/pageGrid'", GRID_MODULE_RE, true],
    ["import { GRID } from '@/lib/gridConfig'", GRID_MODULE_RE, true],
    ["import { foo } from '@/lib/other'", GRID_MODULE_RE, false],
  ]
  for (const [sample, re, shouldMatch] of cases) {
    re.lastIndex = 0
    if (re.test(sample) !== shouldMatch) {
      console.error(`✗ grid-lint self-test misslyckades: "${sample}" förväntades ${shouldMatch ? 'matcha' : 'inte matcha'}.`)
      process.exit(2)
    }
  }
}
assertDetectors()

if (!GRIDDED.length) {
  console.log('grid-lint: inga griddade sidor konfigurerade (CLI-arg / GRID_LINT_PAGES / grid-lint.config.json). Hoppar.')
  process.exit(0)
}

const errors = []
for (const file of GRIDDED) {
  let src
  try { src = readFileSync(file, 'utf8') } catch {
    errors.push(`${file}: griddad sida saknas (kan inte läsas).`)
    continue
  }
  if (!GRID_MODULE_RE.test(src)) errors.push(`${file}: importerar inte grid-modulen (t.ex. <PageGrid> / lib/pageGrid) – kolumnantalet får inte hårdkodas.`)
  if (!/data-grid-cols=/.test(src)) errors.push(`${file}: saknar en grid-container med data-grid-cols (verktyget kan inte avläsa rutnätet).`)

  src.split('\n').forEach((line, i) => {
    if (!CELL_RE.test(line)) return
    if (ABSOLUTE_RE.test(line)) errors.push(`${file}:${i + 1}  grid-cell med absolut positionering (använd col-span/rad i rutnätet i st f position:absolute).`)
    if (STRUCT_PX_RE.test(line)) errors.push(`${file}:${i + 1}  grid-cell med arbiträr struktur-px (spänn kolumner / använd gap-token i st f px).`)
  })
}

if (errors.length) {
  console.error('✗ Grid-lint hittade problem på de griddade sidorna:\n')
  console.error(errors.map((e) => '  ' + e).join('\n'))
  process.exit(1)
}
console.log(`✓ Grid-fundamentet är intakt på ${GRIDDED.length} griddad(e) sida(or) (config-driven, inga ö-celler).`)

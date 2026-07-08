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
// ROOTS = ['app','components'] is the sensible Next.js default. A project can adjust
// ROOTS (which dirs to scan) and ALLOW (files exempted from the check) below.
// Run: node bin/check-design-tokens.mjs   (or wire it to `npm run lint:tokens`)
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, extname } from 'path'

const ROOTS = ['app', 'components']
// Files with deliberately fixed colors (e.g. WebGL canvas chrome, theme-independent
// by design) can be exempted here.
const ALLOW = new Set([])
const COLOR_RE = /(?:bg|text|border|ring|fill|stroke|shadow|from|to|via|divide|outline|decoration|accent|caret)-\[#[0-9a-fA-F]{3,8}\]/g
// Spacing utilities (padding/margin/gap/space) with an arbitrary px/rem/em value.
// Preceded by start, whitespace, quote char or backtick so we don't match mid-word;
// allows a leading '-' for negative margins (-mt-[…]).
const SPACING_RE = /(?:^|[\s"'`{])-?(?:p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|space-[xy])-\[[0-9.]+(?:px|rem|em)\]/g

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
    if (s.isDirectory()) out.push(...walk(p))
    else if (['.ts', '.tsx'].includes(extname(p))) out.push(p)
  }
  return out
}

const colorHits = []
const spacingHits = []
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (ALLOW.has(file)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const cm = line.match(COLOR_RE)
      if (cm) colorHits.push(`${file}:${i + 1}  ${[...new Set(cm)].join(' ')}`)
      const sm = line.match(SPACING_RE)
      if (sm) spacingHits.push(`${file}:${i + 1}  ${[...new Set(sm.map((s) => s.trim().replace(/^["'`{]/, '')))].join(' ')}`)
    })
  }
}

let failed = false
if (colorHits.length) {
  failed = true
  console.error('✗ Hardcoded color classes (use a theme variable via bg-[rgb(var(--c-…))] instead):\n')
  console.error(colorHits.map((h) => '  ' + h).join('\n'))
  console.error(`\n${colorHits.length} color hit(s).`)
}
if (spacingHits.length) {
  failed = true
  console.error('\n✗ Arbitrary spacing values (use Tailwind\'s spacing scale, e.g. py-1.5/gap-3, instead):\n')
  console.error(spacingHits.map((h) => '  ' + h).join('\n'))
  console.error(`\n${spacingHits.length} spacing hit(s).`)
}
if (failed) {
  process.exit(1)
}
console.log('✓ No hardcoded color or spacing classes outside the allowlist.')

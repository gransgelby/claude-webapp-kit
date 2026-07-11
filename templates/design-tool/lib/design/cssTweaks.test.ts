import { describe, it, expect } from 'vitest'
import {
  classifyToken, isColorValue, parseLength, lengthSliderMax, colorTokenHex,
  formatColorLikeOriginal, applyOverride, overrideCount, diffTweaks, buildCssTweaks,
  suggestCssName, type ThemeToken,
  explainProperty, propKind, canonicalProp, toPx, normalizeStyleValue,
  buildTokenValueIndex, matchTokensForValue, summarizeBoxProps, countVarReferences,
  boxEditKey, boxTargetIndices, rectFullyInside,
} from './cssTweaks'

describe('classifyToken', () => {
  it('klassar app-tripletter som färg', () => {
    expect(classifyToken('--c-slate-900', '15 23 42')).toBe('color')
  })
  it('klassar hex/rgb/hsl som färg', () => {
    expect(classifyToken('--accent', '#3b82f6')).toBe('color')
    expect(classifyToken('--x', 'rgb(59, 130, 246)')).toBe('color')
    expect(classifyToken('--x', 'hsl(210 90% 60%)')).toBe('color')
  })
  it('klassar radie ur namnet', () => {
    expect(classifyToken('--radius-lg', '12px')).toBe('radius')
    expect(classifyToken('--rounded', '0')).toBe('radius')
  })
  it('klassar övriga längder som length', () => {
    expect(classifyToken('--space-4', '16px')).toBe('length')
    expect(classifyToken('--gap', '1.5rem')).toBe('length')
    // font-size är en längd, inte en font
    expect(classifyToken('--font-size-lg', '18px')).toBe('length')
  })
  it('klassar font-family som font', () => {
    expect(classifyToken('--font-sans', 'system-ui, sans-serif')).toBe('font')
    expect(classifyToken('--font-body', 'Georgia, serif')).toBe('font')
  })
  it('klassar skuggor som shadow', () => {
    expect(classifyToken('--shadow-lg', '0 4px 12px rgba(0,0,0,.2)')).toBe('shadow')
  })
  it('klassar rena tal som number', () => {
    expect(classifyToken('--line-height', '1.5')).toBe('number')
    expect(classifyToken('--z-modal', '40')).toBe('number')
  })
  it('faller till other för okända värden', () => {
    expect(classifyToken('--transition', 'ease-in-out')).toBe('other')
  })
})

describe('isColorValue', () => {
  it('accepterar färg-former', () => {
    expect(isColorValue('#fff')).toBe(true)
    expect(isColorValue('15 23 42')).toBe(true)
    expect(isColorValue('white')).toBe(true)
    expect(isColorValue('hsl(0 0% 0%)')).toBe(true)
  })
  it('avvisar icke-färg', () => {
    expect(isColorValue('16px')).toBe(false)
    expect(isColorValue('system-ui')).toBe(false)
    expect(isColorValue('12 34')).toBe(false) // bara 2 tal → ej triplett
  })
})

describe('parseLength / lengthSliderMax', () => {
  it('delar tal och enhet', () => {
    expect(parseLength('16px')).toEqual({ num: 16, unit: 'px' })
    expect(parseLength('1.5rem')).toEqual({ num: 1.5, unit: 'rem' })
    expect(parseLength('0')).toEqual({ num: 0, unit: '' })
  })
  it('null för icke-längd', () => {
    expect(parseLength('system-ui')).toBeNull()
  })
  it('ger rimliga slider-max', () => {
    expect(lengthSliderMax('px')).toBe(64)
    expect(lengthSliderMax('rem')).toBe(4)
    expect(lengthSliderMax('%')).toBe(100)
  })
})

describe('colorTokenHex / formatColorLikeOriginal', () => {
  it('konverterar färg till hex', () => {
    expect(colorTokenHex('15 23 42')).toBe('#0f172a')
    expect(colorTokenHex('#3b82f6')).toBe('#3b82f6')
  })
  it('bevarar triplett-form vid återskrivning', () => {
    expect(formatColorLikeOriginal('15 23 42', '#0f172a')).toBe('15 23 42')
  })
  it('behåller hex-form för hex-original', () => {
    expect(formatColorLikeOriginal('#000000', '#3b82f6')).toBe('#3b82f6')
  })
})

describe('applyOverride / overrideCount', () => {
  it('lägger till och tar bort immutabelt', () => {
    const a = applyOverride({}, '--x', '10px')
    expect(a).toEqual({ '--x': '10px' })
    const b = applyOverride(a, '--y', '20px')
    expect(overrideCount(b)).toBe(2)
    const c = applyOverride(b, '--x', null)
    expect(c).toEqual({ '--y': '20px' })
    // originalet orört (immutabelt)
    expect(a).toEqual({ '--x': '10px' })
  })
})

describe('diffTweaks / buildCssTweaks / suggestCssName', () => {
  const tokens: ThemeToken[] = [
    { name: '--c-slate-900', value: '15 23 42', kind: 'color' },
    { name: '--radius-lg', value: '12px', kind: 'radius' },
    { name: '--space-4', value: '16px', kind: 'length' },
  ]
  it('diffar bara faktiskt ändrade tokens', () => {
    const overrides = { '--c-slate-900': '30 41 59', '--radius-lg': '12px' /* oförändrad */ }
    const d = diffTweaks(tokens, overrides)
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ name: '--c-slate-900', kind: 'color', from: '15 23 42', to: '30 41 59' })
  })
  it('bygger payload + kommentar', () => {
    const entries = diffTweaks(tokens, { '--c-slate-900': '30 41 59', '--radius-lg': '20px' })
    const p = buildCssTweaks(entries)
    expect(p.count).toBe(2)
    expect(p.tweaks).toHaveLength(2)
    expect(p.comment).toContain('CSS-tema (2 tokens)')
    expect(p.comment).toContain('--radius-lg 12px → 20px')
  })
  it('tom payload → tom kommentar', () => {
    const p = buildCssTweaks([])
    expect(p.count).toBe(0)
    expect(p.comment).toBe('')
  })
  it('föreslår namn ur ändringarna', () => {
    expect(suggestCssName([])).toBe('Tema-justering')
    expect(suggestCssName([{ name: '--radius-lg', kind: 'radius', from: '12px', to: '20px' }])).toContain('--radius-lg')
    const colors = diffTweaks(tokens, { '--c-slate-900': '30 41 59' })
    expect(suggestCssName([...colors, { name: '--c-x', kind: 'color', from: 'a', to: 'b' }])).toContain('Färgjustering')
  })
})

// ── W18/W20: kontextuella egenskaper ──
describe('explainProperty / propKind / canonicalProp', () => {
  it('förklarar kända egenskaper på svenska', () => {
    expect(explainProperty('background-color')).toBe('Bakgrundsfärg')
    expect(explainProperty('color')).toBe('Textfärg')
    expect(explainProperty('border-radius')).toBe('Rundade hörn')
  })
  it('faller tillbaka till egenskapsnamnet för okänt', () => {
    expect(explainProperty('clip-path')).toBe('clip-path')
  })
  it('klassar egenskaper till rätt kontroll', () => {
    expect(propKind('background-color')).toBe('color')
    expect(propKind('border-radius')).toBe('radius')
    expect(propKind('font-family')).toBe('font')
    expect(propKind('padding')).toBe('length')
    expect(propKind('font-weight')).toBe('number')
    expect(propKind('box-shadow')).toBe('shadow')
  })
  it('kollapsar computed-longhands till kanonisk egenskap', () => {
    expect(canonicalProp('border-top-color')).toBe('border-color')
    expect(canonicalProp('border-left-width')).toBe('border-width')
    expect(canonicalProp('padding-top')).toBe('padding')
    expect(canonicalProp('margin-bottom')).toBe('margin')
    expect(canonicalProp('column-gap')).toBe('gap')
    expect(canonicalProp('color')).toBe('color')
  })
})

describe('toPx / normalizeStyleValue', () => {
  it('konverterar längder till px', () => {
    expect(toPx('16px')).toBe(16)
    expect(toPx('1rem', 16)).toBe(16)
    expect(toPx('1.5rem', 16)).toBe(24)
    expect(toPx('50%')).toBeNull()
  })
  it('normaliserar färg → hex och längd → px', () => {
    expect(normalizeStyleValue('rgb(59, 130, 246)')).toBe('#3b82f6')
    expect(normalizeStyleValue('1rem', 16)).toBe('16px')
    expect(normalizeStyleValue('16px')).toBe('16px')
  })
  it('matchar en token i rem mot computed px via remBase', () => {
    const idx = buildTokenValueIndex([{ name: '--space-4', value: '1rem', kind: 'length' }], 16)
    expect(matchTokensForValue(idx, '16px', 16)).toEqual(['--space-4'])
  })
  it('matchar färg-token oberoende av rgb/hex-form', () => {
    const idx = buildTokenValueIndex([{ name: '--accent', value: '#3b82f6', kind: 'color' }])
    expect(matchTokensForValue(idx, 'rgb(59, 130, 246)')).toEqual(['--accent'])
  })
})

describe('summarizeBoxProps', () => {
  const tokens: ThemeToken[] = [
    { name: '--c-card-bg', value: '#ffffff', kind: 'color' },
    { name: '--c-text', value: 'rgb(15, 23, 42)', kind: 'color' },
    { name: '--radius-lg', value: '12px', kind: 'radius' },
  ]
  it('dedupar, klassar och mappar tokens; token-backade först', () => {
    const samples = [
      { prop: 'background-color', value: 'rgb(255, 255, 255)' },
      { prop: 'background-color', value: 'rgb(255, 255, 255)' },
      { prop: 'color', value: 'rgb(15, 23, 42)' },
      { prop: 'border-radius', value: '12px' },
      { prop: 'font-size', value: '14px' }, // ingen token → sist
    ]
    const obs = summarizeBoxProps(samples, tokens)
    // bg matchar --c-card-bg, count 2
    const bg = obs.find((o) => o.prop === 'background-color')!
    expect(bg.tokens).toEqual(['--c-card-bg'])
    expect(bg.count).toBe(2)
    expect(bg.label).toBe('Bakgrundsfärg')
    // font-size saknar token → hamnar efter token-backade
    expect(obs[obs.length - 1].prop).toBe('font-size')
    expect(obs[obs.length - 1].tokens).toEqual([])
  })
  it('filtrerar bort tomma/genomskinliga värden', () => {
    const obs = summarizeBoxProps([
      { prop: 'background-color', value: 'rgba(0, 0, 0, 0)' },
      { prop: 'border-radius', value: '0px' },
      { prop: 'color', value: '' },
    ], tokens)
    expect(obs).toHaveLength(0)
  })
})

describe('countVarReferences', () => {
  const texts = [
    '.card { background: var(--c-card-bg); color: var(--c-text); }',
    '.btn { background: var( --c-card-bg ); border-radius: var(--radius-lg); }',
    '.x { color: var(--c-card-bg-strong); }', // får INTE matcha --c-card-bg
  ]
  it('räknar var()-referenser exakt (utan prefix-läckage)', () => {
    expect(countVarReferences(texts, '--c-card-bg')).toBe(2)
    expect(countVarReferences(texts, '--c-text')).toBe(1)
    expect(countVarReferences(texts, '--radius-lg')).toBe(1)
    expect(countVarReferences(texts, '--c-card-bg-strong')).toBe(1)
    expect(countVarReferences(texts, '--nope')).toBe(0)
  })
})

// ── R7: element-scopad ruta-redigering (ren mappnings-logik) ─────────────────
describe('boxEditKey', () => {
  it('bygger en stabil nyckel av prop + normaliserat värde', () => {
    expect(boxEditKey('background-color', 'rgb(255, 255, 255)')).toBe('background-color|rgb(255, 255, 255)')
    // trimmar + gemener → samma nyckel oavsett skiftläge/whitespace
    expect(boxEditKey('color', '  #FFF ')).toBe('color|#fff')
  })
})

describe('boxTargetIndices', () => {
  // Tre fångade element: två vita kort + ett med annan bakgrund.
  const elements = [
    { props: [{ prop: 'background-color', value: 'rgb(255, 255, 255)' }, { prop: 'color', value: 'rgb(15, 23, 42)' }] },
    { props: [{ prop: 'background-color', value: '#ffffff' }] }, // samma vit (annan notation)
    { props: [{ prop: 'background-color', value: 'rgb(0, 0, 0)' }] }, // svart – ska INTE träffas
  ]
  it('träffar bara element vars kanoniska prop har samma normaliserade värde', () => {
    // vit bakgrund → element 0 och 1 (olika notation, samma färg), inte 2
    expect(boxTargetIndices(elements, 'background-color', 'rgb(255, 255, 255)')).toEqual([0, 1])
    expect(boxTargetIndices(elements, 'background-color', '#fff')).toEqual([0, 1])
    // svart → bara element 2
    expect(boxTargetIndices(elements, 'background-color', 'rgb(0,0,0)')).toEqual([2])
  })
  it('matchar längder via px-normalisering (rem→px med remBase)', () => {
    const els = [
      { props: [{ prop: 'padding', value: '16px' }] },
      { props: [{ prop: 'padding', value: '1rem' }] }, // = 16px vid remBase 16
      { props: [{ prop: 'padding', value: '8px' }] },
    ]
    expect(boxTargetIndices(els, 'padding', '16px', 16)).toEqual([0, 1])
  })
  it('returnerar tom lista när ingen matchar', () => {
    expect(boxTargetIndices(elements, 'border-radius', '4px')).toEqual([])
  })
})

describe('rectFullyInside (review 4e – dra-ruta helt innesluten)', () => {
  const box = { x: 100, y: 100, w: 100, h: 100 } // 100,100 → 200,200
  it('true när elementets rect HELT ryms i rutan', () => {
    expect(rectFullyInside(box, { left: 120, top: 120, right: 180, bottom: 180 })).toBe(true)
  })
  it('false när elementet bara delvis skär rutan (sticker ut)', () => {
    expect(rectFullyInside(box, { left: 120, top: 120, right: 250, bottom: 180 })).toBe(false) // höger sticker ut
    expect(rectFullyInside(box, { left: 50, top: 120, right: 180, bottom: 180 })).toBe(false)  // vänster sticker ut
    expect(rectFullyInside(box, { left: 120, top: 50, right: 180, bottom: 180 })).toBe(false)   // topp ovanför
    expect(rectFullyInside(box, { left: 120, top: 120, right: 180, bottom: 250 })).toBe(false)  // botten under
  })
  it('true på exakt kant (inklusiv)', () => {
    expect(rectFullyInside(box, { left: 100, top: 100, right: 200, bottom: 200 })).toBe(true)
  })
  it('false när elementet är större och rutan ligger inuti det (behållaren bakom)', () => {
    expect(rectFullyInside(box, { left: 0, top: 0, right: 400, bottom: 400 })).toBe(false)
  })
})

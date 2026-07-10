import { describe, it, expect } from 'vitest'
import { shortenPath, heuristicSourceLabel } from './elementSource'
import { type NodeDesc } from './elementModel'

const nd = (p: Partial<NodeDesc>): NodeDesc => ({
  tag: 'div', id: null, classes: [], role: null, ariaLabel: null, dataAttrs: [], designId: null, ...p,
})

describe('shortenPath', () => {
  it('kortar absoluta byggsökvägar till projektrelativa', () => {
    expect(shortenPath('/Users/x/proj/app/dashboard/page.tsx')).toBe('app/dashboard/page.tsx')
    expect(shortenPath('/root/components/design/PropertyPanel.tsx')).toBe('components/design/PropertyPanel.tsx')
    expect(shortenPath('/a/b/lib/design/elementModel.ts')).toBe('lib/design/elementModel.ts')
  })
  it('faller tillbaka på sista två segmenten om inget känt rot-segment matchar', () => {
    expect(shortenPath('/weird/place/thing.tsx')).toBe('place/thing.tsx')
  })
})

describe('heuristicSourceLabel (gissning)', () => {
  it('föredrar data-design-id', () => {
    expect(heuristicSourceLabel(nd({ designId: 'karta', dataAttrs: ['data-design-id'] }))).toBe('[data-design-id="karta"]')
  })
  it('annars första andra data-attributet', () => {
    expect(heuristicSourceLabel(nd({ tag: 'button', dataAttrs: ['data-testid'] }))).toBe('button[data-testid]')
  })
  it('annars aria-label, annars tag.klass', () => {
    expect(heuristicSourceLabel(nd({ tag: 'nav', ariaLabel: 'Meny' }))).toBe('nav[aria-label="Meny"]')
    expect(heuristicSourceLabel(nd({ tag: 'div', classes: ['hero'] }))).toBe('div.hero')
  })
})

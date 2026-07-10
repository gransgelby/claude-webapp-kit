import { describe, it, expect } from 'vitest'
import {
  isKnownControlGroup, isDecorative, isMeaningfulContainer, pickMeaningfulIndex,
  elementLabel, spacingStepsPx, nearestSpacingToken, nudgeToToken, type NodeDesc,
} from './elementModel'

const nd = (p: Partial<NodeDesc>): NodeDesc => ({
  tag: 'div', id: null, classes: [], role: null, ariaLabel: null, dataAttrs: [], designId: null, ...p,
})

describe('isKnownControlGroup', () => {
  it('känner igen MapLibre/Mapbox/Leaflet kontroll-grupper', () => {
    expect(isKnownControlGroup(nd({ classes: ['maplibregl-ctrl', 'maplibregl-ctrl-attrib'] }))).toBe(true)
    expect(isKnownControlGroup(nd({ classes: ['maplibregl-ctrl', 'maplibregl-ctrl-group'] }))).toBe(true)
    expect(isKnownControlGroup(nd({ classes: ['mapboxgl-ctrl'] }))).toBe(true)
    expect(isKnownControlGroup(nd({ classes: ['leaflet-control'] }))).toBe(true)
  })
  it('triggar INTE på inre lager (attrib-button/inner) eller hörn-wrappern', () => {
    expect(isKnownControlGroup(nd({ tag: 'summary', classes: ['maplibregl-ctrl-attrib-button'] }))).toBe(false)
    expect(isKnownControlGroup(nd({ classes: ['maplibregl-ctrl-attrib-inner'] }))).toBe(false)
    expect(isKnownControlGroup(nd({ classes: ['maplibregl-ctrl-bottom-right'] }))).toBe(false)
  })
})

describe('isDecorative', () => {
  it('flaggar rena inre lager', () => {
    for (const tag of ['span', 'svg', 'path', 'i', 'img', 'strong']) {
      expect(isDecorative(nd({ tag }))).toBe(true)
    }
  })
  it('flaggar INTE riktiga behållare/kontroller', () => {
    for (const tag of ['div', 'button', 'section', 'a', 'input']) {
      expect(isDecorative(nd({ tag }))).toBe(false)
    }
  })
})

describe('isMeaningfulContainer', () => {
  it('data-design-id, semantiska taggar, roller, aria-label och card/panel-klasser', () => {
    expect(isMeaningfulContainer(nd({ designId: 'karta' }))).toBe(true)
    expect(isMeaningfulContainer(nd({ tag: 'section' }))).toBe(true)
    expect(isMeaningfulContainer(nd({ role: 'toolbar' }))).toBe(true)
    expect(isMeaningfulContainer(nd({ ariaLabel: 'Kartkontroller' }))).toBe(true)
    expect(isMeaningfulContainer(nd({ classes: ['rounded-xl', 'card'] }))).toBe(true)
    expect(isMeaningfulContainer(nd({ classes: ['controls'] }))).toBe(true)
  })
  it('en naken wrapper-div är inte i sig meningsfull', () => {
    expect(isMeaningfulContainer(nd({ tag: 'div', classes: ['flex', 'gap-2'] }))).toBe(false)
  })
})

describe('pickMeaningfulIndex – smart default (MapLibre-ⓘ-fixen)', () => {
  it('väljer HELA kart-kontrollen, inte det inre knapp/span-lagret (träff på inner)', () => {
    // Kedja nedifrån-upp: span → inner-div → details.maplibregl-ctrl → hörn-wrapper
    const chain = [
      nd({ tag: 'span' }),
      nd({ tag: 'div', classes: ['maplibregl-ctrl-attrib-inner'] }),
      nd({ tag: 'details', classes: ['maplibregl-ctrl', 'maplibregl-ctrl-attrib'] }),
      nd({ tag: 'div', classes: ['maplibregl-ctrl-bottom-right'] }),
    ]
    expect(pickMeaningfulIndex(chain)).toBe(2) // .maplibregl-ctrl
  })
  it('väljer kontrollen även när träffen är själva ⓘ-knappen', () => {
    const chain = [
      nd({ tag: 'summary', classes: ['maplibregl-ctrl-attrib-button'] }),
      nd({ tag: 'details', classes: ['maplibregl-ctrl', 'maplibregl-ctrl-attrib'] }),
      nd({ tag: 'div', classes: ['maplibregl-ctrl-bottom-right'] }),
    ]
    expect(pickMeaningfulIndex(chain)).toBe(1)
  })
  it('en fristående knapp med ikon-span inuti → knappen (inte spannen)', () => {
    const chain = [nd({ tag: 'span' }), nd({ tag: 'button' }), nd({ tag: 'div' }), nd({ tag: 'section' })]
    expect(pickMeaningfulIndex(chain)).toBe(1) // button
  })
  it('träff direkt på en wrapper-div → behåll den (klättra inte förbi)', () => {
    const chain = [nd({ tag: 'div', classes: ['card'] }), nd({ tag: 'section' })]
    expect(pickMeaningfulIndex(chain)).toBe(0)
  })
  it('träff på ett svg-lager → närmaste icke-dekorativa förälder', () => {
    const chain = [nd({ tag: 'path' }), nd({ tag: 'svg' }), nd({ tag: 'div', classes: ['icon-wrap'] })]
    expect(pickMeaningfulIndex(chain)).toBe(2)
  })
  it('tom kedja → 0', () => {
    expect(pickMeaningfulIndex([])).toBe(0)
  })
})

describe('elementLabel', () => {
  it('bygger tag#id.klass', () => {
    expect(elementLabel(nd({ tag: 'section' }))).toBe('section')
    expect(elementLabel(nd({ tag: 'div', id: 'map' }))).toBe('div#map')
    expect(elementLabel(nd({ tag: 'h3', classes: ['title', 'big'] }))).toBe('h3.title')
    expect(elementLabel(nd({ tag: 'div', id: 'x', classes: ['y'] }))).toBe('div#x') // id vinner
  })
})

describe('spacing-token-snap-nudge', () => {
  const steps = spacingStepsPx(16, 1)
  it('spacingStepsPx ger Tailwind-rastret i px (steg 4 = 16px vid scale 1)', () => {
    expect(steps.find((s) => s.name === '4')?.px).toBeCloseTo(16)
    expect(steps.find((s) => s.name === '2')?.px).toBeCloseTo(8)
    expect(steps.find((s) => s.name === '0')?.px).toBeCloseTo(0)
  })
  it('nearestSpacingToken snäpper till närmaste token + flaggar on-token', () => {
    expect(nearestSpacingToken(17, steps).name).toBe('4')   // 17 → 16px (token 4)
    expect(nearestSpacingToken(16, steps).onToken).toBe(true)
    expect(nearestSpacingToken(17, steps).onToken).toBe(false)
    expect(nearestSpacingToken(10, steps).name).toBe('2.5') // 10px = token 2.5
  })
  it('nudgeToToken flyttar ETT token-steg upp/ner (snäpper mellanlägen)', () => {
    expect(nudgeToToken(16, 1, steps).name).toBe('5')   // 16 → nästa token (20px = 5)
    expect(nudgeToToken(16, -1, steps).name).toBe('3.5') // 16 → föregående (14px = 3.5)
    expect(nudgeToToken(15, 1, steps).name).toBe('4')   // mellanläge → snäpp upp till 16px
    expect(nudgeToToken(15, -1, steps).name).toBe('3.5') // mellanläge → snäpp ned till 14px
    expect(nudgeToToken(0, -1, steps).name).toBe('0')   // botten håller
  })
})

import { describe, it, expect } from 'vitest'
import { classifyAtom, isCircular, radiusToPx, type AtomSignals } from './placeholderModel'

const sig = (p: Partial<AtomSignals> & { tag: string }): AtomSignals => ({
  interactive: false, roleImg: false, hasElementChildren: false, hasText: false, ...p,
})

describe('classifyAtom (R14)', () => {
  it('interaktiva element → knapp (även länk-kort/summary), oavsett tagg', () => {
    expect(classifyAtom(sig({ tag: 'button', interactive: true, hasText: true }))).toBe('button')
    expect(classifyAtom(sig({ tag: 'a', interactive: true, hasElementChildren: true }))).toBe('button')
    expect(classifyAtom(sig({ tag: 'div', interactive: true }))).toBe('button') // role=button
  })
  it('media → bild', () => {
    for (const tag of ['img', 'svg', 'canvas', 'video', 'picture']) {
      expect(classifyAtom(sig({ tag }))).toBe('image')
    }
    expect(classifyAtom(sig({ tag: 'div', roleImg: true }))).toBe('image')
  })
  it('rubriker h1–h6 → heading', () => {
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      expect(classifyAtom(sig({ tag, hasText: true, hasElementChildren: true }))).toBe('heading')
    }
  })
  it('text-taggar med text → text; utan text → skip', () => {
    expect(classifyAtom(sig({ tag: 'p', hasText: true }))).toBe('text')
    expect(classifyAtom(sig({ tag: 'li', hasText: true }))).toBe('text')
    expect(classifyAtom(sig({ tag: 'p', hasText: false }))).toBe('skip')
  })
  it('ren löv-text (inga barn) → text; behållare med barn → recurse', () => {
    expect(classifyAtom(sig({ tag: 'span', hasText: true }))).toBe('text')
    expect(classifyAtom(sig({ tag: 'div', hasText: true, hasElementChildren: true }))).toBe('recurse')
    expect(classifyAtom(sig({ tag: 'div', hasElementChildren: false, hasText: false }))).toBe('skip')
  })
  it('prioritet: interaktiv vinner över text/media/heading', () => {
    expect(classifyAtom(sig({ tag: 'h2', interactive: true, hasText: true }))).toBe('button')
    expect(classifyAtom(sig({ tag: 'a', interactive: true, roleImg: true }))).toBe('button')
  })
})

describe('isCircular (V4 – bara FAKTISKA cirklar ritas runda)', () => {
  it('nära-kvadratisk + stor hörnradie → cirkel (t.ex. kompassros)', () => {
    expect(isCircular(24, 48, 48)).toBe(true)   // radie = 50% av 48
    expect(isCircular(20, 40, 44)).toBe(true)   // svagt oval men inom 1.4×
  })
  it('avlång pill-knapp → INTE cirkel (ritas rektangulär)', () => {
    expect(isCircular(12, 80, 24)).toBe(false)  // 80/24 = 3.3× → för avlång
    expect(isCircular(999, 120, 32)).toBe(false)
  })
  it('kvadratisk men liten radie → INTE cirkel', () => {
    expect(isCircular(4, 40, 40)).toBe(false)   // 4 < 40*0.4
  })
  it('degenererade mått → false (aldrig krasch)', () => {
    expect(isCircular(0, 40, 40)).toBe(false)
    expect(isCircular(20, 0, 40)).toBe(false)
  })
})

describe('radiusToPx (tolka computed border-radius)', () => {
  it('px passerar rakt igenom', () => {
    expect(radiusToPx('12px', 40, 40)).toBe(12)
    expect(radiusToPx('0', 40, 40)).toBe(0)
  })
  it('procent löses mot kortsidan', () => {
    expect(radiusToPx('50%', 40, 60)).toBe(20)  // 50% av min(40,60)
  })
})

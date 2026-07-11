import { describe, it, expect } from 'vitest'
import {
  serializeView, parseView, serializeDraft, parseDraft, draftHasContent,
  scopedKey, VIEW_VERSION, DRAFT_VERSION,
  markReopenDesignMode, consumeReopenDesignMode, REOPEN_KEY,
  type ViewState, type DraftState,
} from './workspacePersistence'

/** Minimal in-memory Storage-stub (W27: reopen-flaggan testas utan jsdom). */
function fakeStore() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    _map: m,
  }
}

const view: ViewState = {
  zoom: 1.4,
  pan: { x: 12, y: -8 },
  selKey: '3',
  panelTab: 'css',
  measure: true,
}

const draft: DraftState = {
  intents: {
    a: { rect: { x: 10, y: 20, w: 100, h: 50 }, base: { x: 0, y: 0, w: 100, h: 50 } },
  },
  css: { '--accent': '#ff0000' },
}

describe('scopedKey', () => {
  it('scopar per sida så olika sidor inte krockar', () => {
    expect(scopedKey('base', '/dashboard?demo=1')).not.toBe(scopedKey('base', '/dashboard?demo=2'))
  })
  it('tom scope faller tillbaka till "/"', () => {
    expect(scopedKey('base', '')).toBe('base:/')
  })
})

describe('view-tillstånd round-trip', () => {
  it('serialiserar och deserialiserar identiskt', () => {
    const back = parseView(serializeView(view))
    expect(back).toEqual(view)
  })
  it('null selKey bevaras', () => {
    const v = { ...view, selKey: null }
    expect(parseView(serializeView(v))?.selKey).toBeNull()
  })
})

describe('view-tillstånd robusthet', () => {
  it('version-mismatch → null (ignoreras tyst)', () => {
    const bumped = JSON.stringify({ ...JSON.parse(serializeView(view)), __v: VIEW_VERSION + 99 })
    expect(parseView(bumped)).toBeNull()
  })
  it('korrupt JSON → null', () => {
    expect(parseView('{ inte json')).toBeNull()
  })
  it('saknat/ogiltigt fält → null', () => {
    expect(parseView(JSON.stringify({ __v: VIEW_VERSION, zoom: 'x', pan: { x: 0, y: 0 } }))).toBeNull()
    expect(parseView(JSON.stringify({ __v: VIEW_VERSION, zoom: 1 }))).toBeNull()
  })
  it('okänd panelflik → null', () => {
    expect(parseView(JSON.stringify({ __v: VIEW_VERSION, zoom: 1, pan: { x: 0, y: 0 }, panelTab: 'bogus' }))).toBeNull()
  })
  it('null/undefined raw → null', () => {
    expect(parseView(null)).toBeNull()
    expect(parseView(undefined)).toBeNull()
  })
})

describe('utkast round-trip', () => {
  it('serialiserar och deserialiserar identiskt', () => {
    expect(parseDraft(serializeDraft(draft))).toEqual(draft)
  })
  it('version-mismatch → null', () => {
    const bumped = JSON.stringify({ ...JSON.parse(serializeDraft(draft)), __v: DRAFT_VERSION + 99 })
    expect(parseDraft(bumped)).toBeNull()
  })
  it('korrupt JSON → null', () => {
    expect(parseDraft(']]]')).toBeNull()
  })
  it('filtrerar bort trasiga intent-poster men behåller giltiga', () => {
    const raw = JSON.stringify({
      __v: DRAFT_VERSION,
      intents: {
        ok: { rect: { x: 1, y: 2, w: 3, h: 4 }, base: { x: 0, y: 0, w: 3, h: 4 } },
        bad: { rect: { x: 1 } },
      },
      css: { '--a': '#111', bad: 5 },
    })
    const back = parseDraft(raw)
    expect(Object.keys(back!.intents)).toEqual(['ok'])
    expect(back!.css).toEqual({ '--a': '#111' })
  })
})

describe('draftHasContent', () => {
  it('css-tweak → har innehåll', () => {
    expect(draftHasContent({ intents: {}, css: { '--a': '#000' } })).toBe(true)
  })
  it('flyttad intent (rect != base) → har innehåll', () => {
    expect(draftHasContent(draft)).toBe(true)
  })
  it('orörd intent (rect == base) + ingen css → tomt', () => {
    const idle: DraftState = { intents: { a: { rect: { x: 0, y: 0, w: 5, h: 5 }, base: { x: 0, y: 0, w: 5, h: 5 } } }, css: {} }
    expect(draftHasContent(idle)).toBe(false)
  })
  it('helt tomt / null → tomt', () => {
    expect(draftHasContent({ intents: {}, css: {} })).toBe(false)
    expect(draftHasContent(null)).toBe(false)
  })
})

describe('W27 · reopen-flagga (navigera med Design mode öppet)', () => {
  it('mark → consume returnerar true en gång, sedan false (engångs)', () => {
    const s = fakeStore()
    expect(consumeReopenDesignMode(s)).toBe(false)
    markReopenDesignMode(s)
    expect(s._map.get(REOPEN_KEY)).toBe('1')
    expect(consumeReopenDesignMode(s)).toBe(true)   // läser + nollar
    expect(s._map.has(REOPEN_KEY)).toBe(false)
    expect(consumeReopenDesignMode(s)).toBe(false)  // inte kvar → återöppnar inte i oändlighet
  })
  it('null-store (SSR/privat-läge) → no-op, kraschar inte', () => {
    expect(() => markReopenDesignMode(null)).not.toThrow()
    expect(consumeReopenDesignMode(null)).toBe(false)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildRegionTree, flattenRegions, isSubstantial, isVisuallySeparated, isRegionCandidate,
  isRowContainer, localPlacement, scopeMech, coverage, canBeRegionTag,
  DEFAULT_REGION_OPTS, type VisualNode, type Rect,
} from './regionModel'

// ── Syntetisk DOM: bygg VisualNode-träd tersare än hela interfacet ────────────

let nextRef = 0
beforeEach(() => { nextRef = 0 })

type P = Partial<Omit<VisualNode, 'rect' | 'children'>> & { rect: Rect }

const vn = (p: P, children: VisualNode[] = []): VisualNode => ({
  ref: nextRef++,
  tag: 'div',
  bgColor: null,
  bgImage: false,
  borderSides: 0,
  shadow: false,
  display: 'block',
  flexRow: false,
  gridCols: 0,
  colGap: 0,
  padLeft: 0,
  padRight: 0,
  position: 'static',
  interactive: false,
  semantic: false,
  ...p,
  children,
})

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })

/** Ett kort: egen bakgrund + ram + skugga (som appens bg-surface-kort). */
const card = (rect: Rect, children: VisualNode[] = [], extra: Partial<P> = {}) =>
  vn({ rect, bgColor: 'rgb(255, 255, 255)', borderSides: 4, shadow: true, ...extra }, children)

// ── Predikat ─────────────────────────────────────────────────────────────────

describe('isSubstantial', () => {
  it('godkänner kort-stora ytor men refuserar chips/pills/knappar', () => {
    expect(isSubstantial(vn({ rect: R(0, 0, 296, 138) }))).toBe(true)   // klimat-chip
    expect(isSubstantial(vn({ rect: R(0, 0, 170, 30) }))).toBe(false)   // fakta-chip (h < 40)
    expect(isSubstantial(vn({ rect: R(0, 0, 90, 28) }))).toBe(false)    // pill
    expect(isSubstantial(vn({ rect: R(0, 0, 363, 42) }))).toBe(false)   // smal formulär-rad (arean)
  })
})

describe('isVisuallySeparated', () => {
  it('egen bakgrund som skiljer sig från den ärvda separerar', () => {
    const n = vn({ rect: R(0, 0, 300, 200), bgColor: 'rgb(10, 10, 10)' })
    expect(isVisuallySeparated(n, 'rgb(255, 255, 255)')).toBe(true)
    expect(isVisuallySeparated(n, 'rgb(10, 10, 10)')).toBe(false) // samma bg = osynlig
  })
  it('box-ram kräver ≥3 sidor – en divider (border-bottom) räcker inte', () => {
    expect(isVisuallySeparated(vn({ rect: R(0, 0, 300, 200), borderSides: 1 }), null)).toBe(false)
    expect(isVisuallySeparated(vn({ rect: R(0, 0, 300, 200), borderSides: 4 }), null)).toBe(true)
  })
  it('skugga och bakgrundsbild separerar', () => {
    expect(isVisuallySeparated(vn({ rect: R(0, 0, 300, 200), shadow: true }), null)).toBe(true)
    expect(isVisuallySeparated(vn({ rect: R(0, 0, 300, 200), bgImage: true }), null)).toBe(true)
  })
})

describe('isRegionCandidate', () => {
  it('semantisk sektion utan egen visuell separation är ändå kandidat', () => {
    const sec = vn({ tag: 'section', semantic: true, rect: R(0, 0, 1200, 400) })
    expect(isRegionCandidate(sec, null)).toBe(true)
  })
  it('visuellt separerad men för liten är INTE kandidat', () => {
    const chip = vn({ rect: R(0, 0, 170, 30), bgColor: 'rgb(0, 0, 0)' })
    expect(isRegionCandidate(chip, null)).toBe(false)
  })
  it('en TEXT-/FRAS-tagg (t.ex. tonad callout-<p>) är ALDRIG kandidat, hur stor den än är (R7)', () => {
    // Markradon-buggen: en reference-<p> med bg-slate-400/10 (skiljer sig från
    // kortets bg) och area > minArea över-detekterades som en egen nästlad låda.
    const callout = vn({ tag: 'p', rect: R(0, 0, 146, 173), bgColor: 'rgba(148,163,184,0.1)' })
    expect(isSubstantial(callout)).toBe(true)          // stor nog rent geometriskt
    expect(isVisuallySeparated(callout, null)).toBe(true) // egen (tonad) bakgrund
    expect(isRegionCandidate(callout, null)).toBe(false)  // men ingen egen region
    // En rubrik likaså (h2/h3 …) – de blir platshållare (R14), inte lådor.
    expect(isRegionCandidate(vn({ tag: 'h2', rect: R(0, 0, 300, 60), bgColor: 'rgb(0,0,0)' }), null)).toBe(false)
  })
})

describe('canBeRegionTag', () => {
  it('behållar-taggar kan bära regioner; text-/fras-taggar kan inte', () => {
    for (const t of ['div', 'section', 'article', 'aside', 'ul', 'ol', 'li', 'figure', 'table', 'nav', 'a', 'button']) {
      expect(canBeRegionTag(t)).toBe(true)
    }
    for (const t of ['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'blockquote', 'figcaption', 'dt', 'dd']) {
      expect(canBeRegionTag(t)).toBe(false)
    }
  })
})

describe('isRowContainer', () => {
  it('grid med ≥2 spår och flex-rad är rader; kolumn-stack är det inte', () => {
    expect(isRowContainer(vn({ rect: R(0, 0, 10, 10), display: 'grid', gridCols: 3 }))).toBe(true)
    expect(isRowContainer(vn({ rect: R(0, 0, 10, 10), display: 'flex', flexRow: true }))).toBe(true)
    expect(isRowContainer(vn({ rect: R(0, 0, 10, 10), display: 'flex', flexRow: false }))).toBe(false)
    expect(isRowContainer(vn({ rect: R(0, 0, 10, 10), display: 'grid', gridCols: 1 }))).toBe(false)
  })
})

// ── buildRegionTree: kort-detektering + wrapper-hoisting ─────────────────────

describe('buildRegionTree · kort-detektering & triviala wrappers', () => {
  it('hittar kort genom transparenta wrappers (hoisting)', () => {
    const cardA = card(R(0, 0, 580, 300))
    const cardB = card(R(620, 0, 580, 300))
    const wrapper = vn({ rect: R(0, 0, 1200, 300) }, [cardA, cardB]) // transparent mellanlager
    const root = vn({ rect: R(0, 0, 1200, 800), bgColor: 'rgb(250, 250, 250)' }, [wrapper])
    const tree = buildRegionTree(root)
    expect(tree.children).toHaveLength(2)
    expect(tree.children.map((c) => c.ref)).toEqual([cardA.ref, cardB.ref])
    // Wrappern delas av båda korten → ankaret är kortet självt, scopet wrappern.
    expect(tree.children[0].anchorRef).toBe(cardA.ref)
    expect(tree.children[0].scopeRef).toBe(wrapper.ref)
  })

  it('exklusiv wrapper blir regionens ANKARE (flytta wrappern, inte kortet)', () => {
    const inner = card(R(600, 0, 600, 300))
    const exclusive = vn({ rect: R(600, 0, 600, 300) }, [inner]) // wrappar BARA detta kort
    const other = card(R(0, 0, 580, 300))
    const row = vn({ rect: R(0, 0, 1200, 300), display: 'grid', gridCols: 2 }, [other, exclusive])
    const root = vn({ rect: R(0, 0, 1200, 800) }, [row])
    const tree = buildRegionTree(root)
    const region = tree.children.find((c) => c.ref === inner.ref)
    expect(region).toBeDefined()
    expect(region!.anchorRef).toBe(exclusive.ref) // yttersta exklusiva wrappern
    expect(region!.scopeRef).toBe(row.ref)        // riktiga layout-scopet (gridet)
  })

  it('slår ihop region med enda barn som täcker ytan (merge, innerRef pekar inåt)', () => {
    const sub1 = card(R(20, 20, 380, 200), [], { borderSides: 4, bgColor: null, shadow: false })
    const sub2 = card(R(420, 20, 380, 200), [], { borderSides: 4, bgColor: null, shadow: false })
    const big = card(R(0, 0, 1200, 400), [sub1, sub2])           // kortet
    const section = vn({ tag: 'section', semantic: true, rect: R(0, 0, 1200, 400) }, [big])
    const root = vn({ rect: R(0, 0, 1200, 800) }, [section])
    const tree = buildRegionTree(root)
    expect(tree.children).toHaveLength(1)
    const region = tree.children[0]
    expect(region.ref).toBe(section.ref)      // yttersta elementet behålls
    expect(region.innerRef).toBe(big.ref)     // det visuella kortet noteras
    expect(region.children.map((c) => c.ref)).toEqual([sub1.ref, sub2.ref]) // barnen lyfts
  })

  it('en tonad callout-<p> i ett kort blir INGEN falsk nästlad region (R7 · Markradon)', () => {
    // Riskkort = ytterram (borderSides 4) med inre bg-lager (merge) som innehåller
    // ikon-rad, beskrivning och en STOR reference-<p> med svag tonad bakgrund.
    const iconRow = vn({ rect: R(16, 16, 258, 40) })                    // liten – ingen region
    const desc = vn({ tag: 'p', rect: R(16, 64, 258, 40) })             // text – ingen region
    const callout = vn({ tag: 'p', rect: R(16, 120, 258, 173), bgColor: 'rgba(148,163,184,0.1)' }) // stor tonad <p>
    const inner = vn({ rect: R(0, 0, 290, 320), bgColor: 'rgb(254, 243, 199)' }, [iconRow, desc, callout])
    const cardEl = vn({ rect: R(0, 0, 290, 320), borderSides: 4 }, [inner]) // ytterram utan egen bg
    const grid = vn({ rect: R(0, 0, 1200, 320), display: 'grid', gridCols: 4, colGap: 10 }, [
      cardEl, card(R(300, 0, 290, 320)), card(R(600, 0, 290, 320)), card(R(900, 0, 290, 320)),
    ])
    const section = vn({ tag: 'section', semantic: true, rect: R(0, 0, 1200, 360) }, [grid])
    const root = vn({ rect: R(0, 0, 1200, 800) }, [section])
    const tree = buildRegionTree(root)
    const sec = tree.children[0]
    expect(sec.children).toHaveLength(4)                 // exakt 4 kort
    const markradon = sec.children[0]
    expect(markradon.children).toHaveLength(0)           // INGEN falsk nästling av callout-<p>:n
  })
})

// ── Upprepade grid-barn + nästling ───────────────────────────────────────────

describe('buildRegionTree · upprepade grid-barn & nästling', () => {
  it('fyra kort i ett grid blir fyra regioner med gridet som scope', () => {
    const cards = [0, 1, 2, 3].map((i) => card(R(i * 300, 0, 290, 280)))
    const grid = vn({ rect: R(0, 0, 1200, 280), display: 'grid', gridCols: 4, colGap: 10 }, cards)
    const section = vn({ tag: 'section', semantic: true, rect: R(0, 0, 1200, 320) }, [grid])
    const root = vn({ rect: R(0, 0, 1200, 800) }, [section])
    const tree = buildRegionTree(root)
    const sec = tree.children[0]
    expect(sec.children).toHaveLength(4)
    for (const c of sec.children) expect(c.scopeRef).toBe(grid.ref)
  })

  it('nästlar: kort i kort i sektion (djup ökar)', () => {
    const leaf = card(R(40, 40, 400, 200), [], { bgColor: 'rgb(240, 240, 240)' })
    const outer = card(R(0, 0, 1200, 600), [leaf])
    // outer täcker inte sektionen (50 %) → ingen merge → äkta nästling.
    const section = vn({ tag: 'section', semantic: true, rect: R(0, 0, 1200, 1200) }, [outer])
    const root = vn({ rect: R(0, 0, 1200, 1600) }, [section])
    const tree = buildRegionTree(root)
    const sec = tree.children[0]
    expect(sec.depth).toBe(1)
    expect(sec.children).toHaveLength(1)
    expect(sec.children[0].ref).toBe(outer.ref)
    expect(sec.children[0].depth).toBe(2)
    expect(sec.children[0].children[0].ref).toBe(leaf.ref)
    expect(sec.children[0].children[0].depth).toBe(3)
  })
})

// ── Slots (hero-scenariot) ───────────────────────────────────────────────────

describe('buildRegionTree · slots för visuellt odelade rad-barn', () => {
  const heroTree = () => {
    const photo = card(R(720, 0, 480, 360))
    const photoCol = vn({ rect: R(720, 0, 480, 360) }, [photo])   // exklusiv wrapper
    const leftCol = vn({ rect: R(0, 0, 700, 360) }, [
      vn({ rect: R(0, 0, 170, 30), bgColor: 'rgb(0, 0, 0)' }),    // chip – för liten
    ])
    const flexRow = vn({ rect: R(0, 0, 1200, 360), display: 'flex', flexRow: true }, [leftCol, photoCol])
    const hero = vn({ rect: R(0, 0, 1200, 360), bgColor: 'rgb(20, 20, 20)' }, [flexRow])
    const root = vn({ rect: R(0, 0, 1200, 800) }, [hero])
    return { photo, photoCol, leftCol, flexRow, hero, tree: buildRegionTree(root) }
  }

  it('hero = vänster SLOT (utan egen visuell identitet) + foto-kortet', () => {
    const { photo, photoCol, leftCol, flexRow, tree } = heroTree()
    const hero = tree.children[0]
    expect(hero.children).toHaveLength(2)
    const [left, right] = hero.children
    expect(left.kind).toBe('slot')
    expect(left.ref).toBe(leftCol.ref)
    expect(left.anchorRef).toBe(leftCol.ref)
    expect(left.scopeRef).toBe(flexRow.ref)
    expect(right.kind).toBe('visual')
    expect(right.ref).toBe(photo.ref)
    expect(right.anchorRef).toBe(photoCol.ref)  // flytta hela kolumnen
    expect(right.scopeRef).toBe(flexRow.ref)
    expect(scopeMech(flexRow)).toBe('flex')
  })

  it('slots nästlar INTE slots (en slot delas inte upp vidare utan visuella barn)', () => {
    const a = vn({ rect: R(0, 0, 340, 300) })
    const b = vn({ rect: R(360, 0, 340, 300) })
    const innerRow = vn({ rect: R(0, 0, 700, 300), display: 'flex', flexRow: true }, [a, b])
    const leftCol = vn({ rect: R(0, 0, 700, 360) }, [innerRow])
    const rightCol = card(R(720, 0, 480, 360))
    const row = vn({ rect: R(0, 0, 1200, 360), display: 'flex', flexRow: true }, [leftCol, rightCol])
    const hero = vn({ rect: R(0, 0, 1200, 360), bgColor: 'rgb(20, 20, 20)' }, [row])
    const root = vn({ rect: R(0, 0, 1200, 800) }, [hero])
    const tree = buildRegionTree(root)
    const left = tree.children[0].children.find((c) => c.kind === 'slot')!
    expect(left.children).toHaveLength(0) // inga slots-i-slotten
  })

  it('kolumn-stackar får INGA slots (bara rad-containrar delas)', () => {
    const head = vn({ rect: R(0, 0, 1200, 95) })
    const body = vn({ rect: R(0, 95, 1200, 320) })
    const cardEl = card(R(0, 0, 1200, 415), [head, body])
    const root = vn({ rect: R(0, 0, 1200, 800) }, [cardEl])
    const tree = buildRegionTree(root)
    expect(tree.children[0].children).toHaveLength(0)
  })
})

// ── Overlays, kontroller, låsta band ─────────────────────────────────────────

describe('buildRegionTree · overlays/kontroller/låsta band', () => {
  it('absolute/fixed-lager och interaktiva kontroller blir inte regioner', () => {
    const overlay = card(R(10, 10, 300, 300), [], { position: 'absolute' })
    const button = card(R(0, 520, 300, 60), [], { interactive: true, tag: 'button' })
    const map = card(R(0, 0, 800, 500), [overlay])
    const root = vn({ rect: R(0, 0, 1200, 800) }, [map, button])
    const tree = buildRegionTree(root)
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0].ref).toBe(map.ref)
    expect(tree.children[0].children).toHaveLength(0)
  })

  it('sticky element på rotnivå blir en LÅST region (toppbar) utan barn', () => {
    const nav = vn({ tag: 'nav', semantic: true, position: 'sticky', rect: R(0, 0, 1200, 60), bgColor: 'rgb(0, 0, 0)' }, [
      card(R(0, 0, 600, 50)),
    ])
    const section = vn({ tag: 'section', semantic: true, rect: R(0, 60, 1200, 400) })
    const root = vn({ rect: R(0, 0, 1200, 800) }, [nav, section])
    const tree = buildRegionTree(root)
    expect(tree.children).toHaveLength(2)
    expect(tree.children[0].kind).toBe('locked')
    expect(tree.children[0].children).toHaveLength(0)
  })

  it('stora klickbara kort (länk-kort) blir ändå regioner', () => {
    const linkCard = card(R(0, 0, 600, 400), [], { interactive: true, tag: 'a' })
    const root = vn({ rect: R(0, 0, 1200, 800) }, [linkCard])
    const tree = buildRegionTree(root)
    expect(tree.children).toHaveLength(1)
  })
})

// ── Lokal placering (drag-mekanikens grund) ──────────────────────────────────

describe('localPlacement & scopeMech', () => {
  it('grid-scope: riktiga spår + gap ger kolumn/spann', () => {
    // 4 spår à 290px, gap 10 → barn 2 börjar vid x = 300.
    const scope = vn({ rect: R(0, 0, 1190, 280), display: 'grid', gridCols: 4, colGap: 10 })
    expect(scopeMech(scope)).toBe('grid')
    expect(localPlacement(R(300, 0, 290, 280), scope)).toEqual({ colStart: 2, span: 1, cols: 4 })
    expect(localPlacement(R(0, 0, 590, 280), scope)).toEqual({ colStart: 1, span: 2, cols: 4 })
  })

  it('flex/flow-scope: virtuellt 12-raster', () => {
    const scope = vn({ rect: R(0, 0, 1200, 360), display: 'flex', flexRow: true })
    expect(localPlacement(R(0, 0, 700, 360), scope)).toEqual({ colStart: 1, span: 7, cols: 12 })
    expect(localPlacement(R(700, 0, 500, 360), scope)).toEqual({ colStart: 8, span: 5, cols: 12 })
    expect(scopeMech(vn({ rect: R(0, 0, 10, 10) }))).toBe('flow')
  })

  it('respekterar scope-padding', () => {
    const scope = vn({ rect: R(0, 0, 1240, 360), padLeft: 20, padRight: 20 })
    expect(localPlacement(R(20, 0, 600, 100), scope)).toEqual({ colStart: 1, span: 6, cols: 12 })
  })
})

// ── Hela dashboard-formen i miniatyr (integrationsform av kärnan) ────────────

describe('buildRegionTree · dashboard-lik sida end-to-end', () => {
  it('producerar band + sektioner + nästlade regioner som en människa ser dem', () => {
    const nav = vn({ tag: 'nav', semantic: true, position: 'sticky', rect: R(0, 0, 1400, 60), bgColor: 'rgb(10, 10, 10)' })
    // Hero: vänster (odelad) + foto-kort.
    const photo = card(R(900, 60, 480, 360))
    const heroRow = vn({ rect: R(0, 60, 1400, 360), display: 'flex', flexRow: true }, [
      vn({ rect: R(0, 60, 880, 360) }),
      vn({ rect: R(900, 60, 480, 360) }, [photo]),
    ])
    const hero = vn({ rect: R(0, 60, 1400, 380), bgColor: 'rgb(22, 22, 24)' }, [heroRow])
    // Kartvy-sektion: karta + två små kort vänster, ett högt kort höger.
    const map = card(R(0, 500, 800, 500))
    const water = card(R(0, 1020, 390, 150))
    const surr = card(R(410, 1020, 390, 150))
    const pair = vn({ rect: R(0, 1020, 800, 150), display: 'grid', gridCols: 2, colGap: 20 }, [water, surr])
    const leftCol = vn({ rect: R(0, 500, 800, 680) }, [map, pair])
    const dist = card(R(820, 500, 380, 640))
    const rightCol = vn({ rect: R(820, 500, 380, 640) }, [dist])
    const kartGrid = vn({ rect: R(0, 500, 1200, 680), display: 'grid', gridCols: 3, colGap: 20 }, [leftCol, rightCol])
    const kartvy = vn({ tag: 'section', semantic: true, rect: R(0, 480, 1200, 700) }, [
      vn({ rect: R(0, 480, 1200, 20) }), // rubrikrad (för liten)
      kartGrid,
    ])
    // Riskprofil: 4 kort i grid, ett med inre bakgrundslager (merge).
    const riskInner = vn({ rect: R(1, 1201, 288, 278), bgColor: 'rgb(30, 26, 18)' })
    const risk1 = card(R(0, 1200, 290, 280), [riskInner])
    const riskCards = [risk1, card(R(300, 1200, 290, 280)), card(R(600, 1200, 290, 280)), card(R(900, 1200, 290, 280))]
    const riskGrid = vn({ rect: R(0, 1200, 1200, 280), display: 'grid', gridCols: 4, colGap: 10 }, riskCards)
    const risk = vn({ tag: 'section', semantic: true, rect: R(0, 1180, 1200, 300) }, [riskGrid])
    // Grid-container (transparent) + sida.
    const gridC = vn({ rect: R(100, 480, 1200, 1000), display: 'grid', gridCols: 12, colGap: 20 }, [kartvy, risk])
    const root = vn({ rect: R(0, 0, 1400, 2400), bgColor: 'rgb(250, 250, 250)' }, [nav, hero, gridC])

    const tree = buildRegionTree(root)
    const tops = tree.children
    expect(tops.map((t) => t.ref)).toEqual([nav.ref, hero.ref, kartvy.ref, risk.ref])
    expect(tops[0].kind).toBe('locked')

    const heroR = tops[1]
    expect(heroR.children).toHaveLength(2)
    expect(heroR.children.filter((c) => c.kind === 'slot')).toHaveLength(1)
    expect(heroR.children.some((c) => c.ref === photo.ref)).toBe(true)

    const kartR = tops[2]
    expect(kartR.children.map((c) => c.ref).sort()).toEqual([map.ref, water.ref, surr.ref, dist.ref].sort())
    const distR = kartR.children.find((c) => c.ref === dist.ref)!
    expect(distR.anchorRef).toBe(rightCol.ref)  // exklusiv kolumn-wrapper
    expect(distR.scopeRef).toBe(kartGrid.ref)   // → grid-mekanik

    const riskR = tops[3]
    expect(riskR.children).toHaveLength(4)
    expect(riskR.children[0].innerRef).toBe(riskInner.ref) // inre lagret mergat
    expect(riskR.children[0].children).toHaveLength(0)

    // flattenRegions ger hela hierarkin (rot + 4 topp + 2+4+4 nästlade).
    expect(flattenRegions(tree)).toHaveLength(1 + 4 + 2 + 4 + 4)
  })
})

describe('RegionNode.separated (W6 · synlig ruta vs osynlig struktur-container)', () => {
  it('synliga kort = true, transparent grupperande wrapper/sektion = false', () => {
    // En semantisk sektion (ingen egen bakgrund) grupperar två synliga kort i en
    // transparent grid-wrapper. Sektionen = struktur (syns ej som egen ruta),
    // korten = synliga rutor.
    const c1 = card(R(0, 100, 290, 200))
    const c2 = card(R(300, 100, 290, 200))
    const innerGrid = vn({ rect: R(0, 100, 600, 200), display: 'grid', gridCols: 2, colGap: 10 }, [c1, c2])
    const section = vn({ tag: 'section', semantic: true, rect: R(0, 80, 600, 240) }, [
      vn({ rect: R(0, 80, 600, 20) }), // rubrikrad (för liten → ingen region)
      innerGrid,
    ])
    const root = vn({ rect: R(0, 0, 800, 400), bgColor: 'rgb(250, 250, 250)' }, [section])
    const tree = buildRegionTree(root)
    expect(tree.separated).toBe(true) // roten = sidan
    const sec = tree.children[0]
    expect(sec.ref).toBe(section.ref)
    expect(sec.separated).toBe(false) // semantisk men utan egen bakgrund/ram → struktur
    expect(sec.children.map((c) => c.ref).sort()).toEqual([c1.ref, c2.ref].sort())
    for (const childC of sec.children) expect(childC.separated).toBe(true)
  })

  it('merge-region ärver synlighet från det innersta kortet', () => {
    const cardInner = card(R(0, 100, 400, 300))
    const section = vn({ tag: 'section', semantic: true, rect: R(0, 100, 400, 300) }, [cardInner])
    const root = vn({ rect: R(0, 0, 600, 500), bgColor: 'rgb(250, 250, 250)' }, [section])
    const tree = buildRegionTree(root)
    const reg = tree.children[0]
    expect(reg.innerRef).toBe(cardInner.ref) // kortet mergat upp i sektionen
    expect(reg.separated).toBe(true)         // synligheten ärvs från det synliga kortet
  })

  it('sticky band (locked) räknas som synligt', () => {
    const nav = vn({ tag: 'nav', semantic: true, position: 'sticky', rect: R(0, 0, 1400, 60), bgColor: 'rgb(10, 10, 10)' })
    const root = vn({ rect: R(0, 0, 1400, 400), bgColor: 'rgb(250, 250, 250)' }, [nav])
    const tree = buildRegionTree(root)
    const band = tree.children[0]
    expect(band.kind).toBe('locked')
    expect(band.separated).toBe(true)
  })
})

describe('coverage', () => {
  it('area-kvot', () => {
    expect(coverage({ x: 0, y: 0, w: 50, h: 50 }, { x: 0, y: 0, w: 100, h: 100 })).toBe(0.25)
    expect(coverage({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 0, h: 0 })).toBe(0)
  })
})

describe('DEFAULT_REGION_OPTS', () => {
  it('tröskelvärdena är sunda (kort passerar, chips inte)', () => {
    expect(DEFAULT_REGION_OPTS.minArea).toBeGreaterThan(170 * 30) // fakta-chip
    expect(DEFAULT_REGION_OPTS.minArea).toBeLessThan(296 * 138)   // klimat-chip
  })
})

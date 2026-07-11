import { describe, it, expect } from 'vitest'
import {
  cleanName, pickName, landmarkName, typeName, snippetName, regionName, slotRoleName,
  EMPTY_FACTS, PAGE_TITLE_NAME, type NameCandidate, type ContentFacts,
} from './regionNames'

const heading = (text: string, level = 2, own?: string): NameCandidate =>
  ({ kind: 'heading', level, own: own ?? text, full: text })
const label = (text: string): NameCandidate => ({ kind: 'label', own: text, full: text })
const aria = (text: string): NameCandidate => ({ kind: 'aria', own: text, full: text })
const alt = (text: string): NameCandidate => ({ kind: 'alt', own: text, full: text })

const facts = (p: Partial<ContentFacts>): ContentFacts => ({ ...EMPTY_FACTS, ...p })

// ── cleanName: instansdata-strippning ────────────────────────────────────────

describe('cleanName', () => {
  it('refuserar rena tal/betyg/räknare/enheter (instansdata)', () => {
    expect(cleanName('7.7/10')).toBe('')
    expect(cleanName('1/3')).toBe('')
    expect(cleanName('994')).toBe('')
    expect(cleanName('19.6%')).toBe('')
    expect(cleanName('865kWh/m²')).toBe('')
    expect(cleanName('336 tkr/år')).toBe('') // "tkr/år" ensam är inget begripligt namn
    expect(cleanName('S')).toBe('')          // enstaka bokstav
  })
  it('kapar årtal/mätvärden i slutet men behåller den statiska rubriken', () => {
    expect(cleanName('Medianinkomst 2023')).toBe('Medianinkomst')
    expect(cleanName('Riksdagsval 2022')).toBe('Riksdagsval')
    expect(cleanName('Fritidshus vs åretruntboende 2024')).toBe('Fritidshus vs åretruntboende')
  })
  it('kapar räknare + orphan-bindeord ("1 av 3")', () => {
    expect(cleanName('Fastighetsfoto 1 av 3')).toBe('Fastighetsfoto')
  })
  it('behåller statiska namn med symboler men utan siffror', () => {
    expect(cleanName('Klimat & miljö')).toBe('Klimat & miljö')
    expect(cleanName('Månadsmedeltemperatur (°C)')).toBe('Månadsmedeltemperatur (°C)')
  })
  it('refuserar text med siffror kvar i mitten (instansdata-aktigt)', () => {
    expect(cleanName('Hudiksvall Sjötorp 1:14 · Hudiksvall')).toBe('')
  })
  it('kapar långa namn vid ordgräns med ellips', () => {
    const out = cleanName('Riksintresse totalförsvaret via Länsstyrelsen och kommunen')
    expect(out.length).toBeLessThanOrEqual(29)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toMatch(/\s…$/)
  })
})

// ── pickName: prioritetsordning + genomfall ──────────────────────────────────

describe('pickName', () => {
  it('rubrik vinner över typografisk etikett även om etiketten kommer först', () => {
    // Lämplighets-kortet: p.font-bold "7.7/10" ligger FÖRE h2 i DOM:en.
    expect(pickName([label('7.7/10'), heading('Lämplighetsanalys')])).toBe('Lämplighetsanalys')
  })
  it('rubrikens direkta text vinner över dynamiskt barn-innehåll', () => {
    // h3 "Områdesprofil" + <span>Hudiksvall kommun</span> ⇒ own-texten gäller.
    expect(pickName([heading('Områdesprofil Hudiksvall kommun', 3, 'Områdesprofil')])).toBe('Områdesprofil')
  })
  it('h1 blir alltid sidrubriks-namnet (sidtitel = instansdata)', () => {
    expect(pickName([heading('Sjötorpsvägen 12', 1)])).toBe(PAGE_TITLE_NAME)
  })
  it('aria-label slår rubriker', () => {
    expect(pickName([heading('Rubrik'), aria('Sökpanel')])).toBe('Sökpanel')
  })
  it('instansdata-etiketter faller igenom till nästa statiska etikett', () => {
    // Stat-ruta: etikettraden "Befolkning" före värdet "994" – och värden refuseras.
    expect(pickName([label('994'), label('Befolkning')])).toBe('Befolkning')
    expect(pickName([label('1/3')])).toBe(null)
  })
  it('alt-text används när rubrik/etikett saknas', () => {
    expect(pickName([label('1/3'), alt('Fastighetsfoto 1 av 3')])).toBe('Fastighetsfoto')
  })
})

// ── landmark/typ/snutt-fallbacks ─────────────────────────────────────────────

describe('landmarkName + typeName', () => {
  it('landmark ur tagg/roll', () => {
    expect(landmarkName('nav', null)).toBe('Navigering')
    expect(landmarkName('div', 'toolbar')).toBe('Verktygsrad')
    expect(landmarkName('div', null)).toBe(null)
  })
  it('karta ur map-klass + canvas; foto/diagram ur dominant yta', () => {
    expect(typeName(facts({ mapLike: true, canvasFrac: 0.9 }))).toBe('Karta')
    expect(typeName(facts({ imgFrac: 0.8 }))).toBe('Foto')
    expect(typeName(facts({ svgFrac: 0.5 }))).toBe('Diagram')
    expect(typeName(facts({ canvasFrac: 0.5 }))).toBe('Grafik')
    expect(typeName(facts({ list: true }))).toBe('Lista')
    expect(typeName(EMPTY_FACTS)).toBe(null)
  })
})

describe('snippetName', () => {
  it('kapar vid ordgräns, aldrig mitt i ett ord', () => {
    expect(snippetName('Obs: eU ppm är en markindikator, inte en uppmätt inomhushalt.'))
      .toBe('Obs: eU ppm är en…')
  })
  it('refuserar text som börjar med siffra (instansdata)', () => {
    expect(snippetName('3 450 000 kr i utropspris')).toBe(null)
  })
  it('trimmar avslutande skiljetecken', () => {
    expect(snippetName('Exempel:')).toBe('Exempel')
  })
})

// ── regionName: hela kedjan ──────────────────────────────────────────────────

describe('regionName', () => {
  it('kandidat → landmark → typ → snutt → fallback', () => {
    expect(regionName([heading('Kartvy')], 'section', null, EMPTY_FACTS, 'Område 1')).toBe('Kartvy')
    expect(regionName([], 'nav', null, EMPTY_FACTS, 'Område 1')).toBe('Navigering')
    expect(regionName([label('1/3')], 'div', null, facts({ imgFrac: 0.8 }), 'Område 1')).toBe('Foto')
    expect(regionName([], 'div', null, facts({ bodyText: 'Obs: eU ppm är en markindikator' }), 'Område 1'))
      .toBe('Obs: eU ppm är en…')
    expect(regionName([], 'div', null, EMPTY_FACTS, 'Område 3')).toBe('Område 3')
  })
})

// ── R8a: slot-namn (Faktaspalt/Bildspel) ─────────────────────────────────────

describe('slotRoleName', () => {
  it('roll ur innehåll: bild → Bildspel, karta → Karta, text/fält → Faktaspalt', () => {
    expect(slotRoleName(facts({ imgFrac: 0.5 }))).toBe('Bildspel')
    expect(slotRoleName(facts({ mapLike: true }))).toBe('Karta')
    expect(slotRoleName(facts({ list: true }))).toBe('Lista')
    expect(slotRoleName(facts({ bodyText: 'Sjötorpsvägen 12 Näsviken Boarea Tomt' }))).toBe('Faktaspalt')
    expect(slotRoleName(EMPTY_FACTS)).toBe(null)
  })
})

describe('regionName · SLOT-kedjan (R8a)', () => {
  it('en slot som bär sidtiteln (h1) blir INTE "Sidrubrik" utan roll ur innehållet', () => {
    // Hero-vänsterkolumnen: h1 (adress) + font-semibold-chip ("Gård") + fält.
    const cands = [heading('Sjötorpsvägen 12', 1), label('Gård'), label('3 450 000 kr')]
    const heroFacts = facts({ bodyText: 'Sjötorpsvägen 12 Näsviken Utropspris Boarea Tomt' })
    // Utan slot: h1 → PAGE_TITLE_NAME (dagens beteende för icke-slots).
    expect(regionName(cands, 'div', null, heroFacts, 'Område 1')).toBe(PAGE_TITLE_NAME)
    // Som slot: hoppar h1 + etikett-skrap ("Gård") → roll = "Faktaspalt".
    expect(regionName(cands, 'div', null, heroFacts, 'Område 1', { slot: true })).toBe('Faktaspalt')
  })
  it('en bild-dominerad slot blir "Bildspel"', () => {
    expect(regionName([], 'div', null, facts({ imgFrac: 0.6 }), 'Område 2', { slot: true })).toBe('Bildspel')
  })
  it('en slots äkta under-rubrik (h2) vinner fortfarande', () => {
    expect(regionName([heading('Sammanfattning', 2)], 'div', null, EMPTY_FACTS, 'Område 1', { slot: true }))
      .toBe('Sammanfattning')
  })
})

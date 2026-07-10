import { describe, it, expect } from 'vitest'
import {
  cleanName, pickName, landmarkName, typeName, snippetName, regionName,
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
    expect(cleanName('Produktfoto 1 av 3')).toBe('Produktfoto')
  })
  it('behåller statiska namn med symboler men utan siffror', () => {
    expect(cleanName('Klimat & miljö')).toBe('Klimat & miljö')
    expect(cleanName('Månadsmedeltemperatur (°C)')).toBe('Månadsmedeltemperatur (°C)')
  })
  it('refuserar text med siffror kvar i mitten (instansdata-aktigt)', () => {
    expect(cleanName('Norrby Ekhaga 1:14 · Norrby')).toBe('')
  })
  it('kapar långa namn vid ordgräns med ellips', () => {
    const out = cleanName('Sammanfattning av leverantörens samtliga åtaganden här')
    expect(out.length).toBeLessThanOrEqual(29)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toMatch(/\s…$/)
  })
})

// ── pickName: prioritetsordning + genomfall ──────────────────────────────────

describe('pickName', () => {
  it('rubrik vinner över typografisk etikett även om etiketten kommer först', () => {
    // Betygs-kortet: p.font-bold "7.7/10" ligger FÖRE h2 i DOM:en.
    expect(pickName([label('7.7/10'), heading('Sammanfattning')])).toBe('Sammanfattning')
  })
  it('rubrikens direkta text vinner över dynamiskt barn-innehåll', () => {
    // h3 "Profil" + <span>Testkonto AB</span> ⇒ own-texten gäller.
    expect(pickName([heading('Profil Testkonto AB', 3, 'Profil')])).toBe('Profil')
  })
  it('h1 blir alltid sidrubriks-namnet (sidtitel = instansdata)', () => {
    expect(pickName([heading('Exempelsidan 12', 1)])).toBe(PAGE_TITLE_NAME)
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
    expect(pickName([label('1/3'), alt('Produktfoto 1 av 3')])).toBe('Produktfoto')
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

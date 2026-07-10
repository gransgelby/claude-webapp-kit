# DesignTool + `<PageGrid>` — skeppade komponenter

En admin-gated, in-app **visuell design-yta** för Next.js/React-appar: lägg din vy på
ett riktigt CSS-grid, markera element och justera tokens/spacing/färg live, flytta
kort i ett två-panels Design mode, och spara förslag via en pluggbar adapter. Verktyget
stylar sig med sina **egna `--dt-*`-tokens** (rör aldrig appens tokens som styling — bara
som *data* det läser/redigerar).

> **Ärligt om mognad:** detta är porterat ur en riktig app (app-projektet) och körs
> där. De app-specifika sömmarna är brutna till konfiguration/adapter, men detta är en
> **utkast-port** — du wire:ar 3 sömmar (nedan) och verifierar i din egen app.

## Vad som ingår

```
lib/pageGrid.tsx            <PageGrid> + GridConfig-kontrakt (default 12 kol)   ← app-agnostisk
lib/designToolAdapter.ts    DEN ENDA SÖMMEN: grid + admin-gate + note-persistens ← DU WIRAR
lib/designToolBus.ts        launcher-buss (app-oberoende)                        ← rör inte
lib/design/dtConfig.ts      token-prefix + storage-namespace (default '--c-')    ← justera v.b.
lib/design/dtTheme.ts       verktygets egna --dt-*-tokens + temapar Precision    ← rör inte
lib/design/colorUtils.ts    ren färg-/WCAG-matte (testad)                        ← app-agnostisk
lib/design/appTokens.ts     läser/skriver appens tokens live (prefix ur dtConfig)
lib/design/elementModel.ts  element→etikett, "närmaste meningsfulla element"
lib/design/elementSource.ts element→fil:rad ("vad är det här?")
lib/design/gridModel.ts     grid-geometri (placement, rader, överlapp)          ← app-agnostisk
lib/design/layoutTools.ts   align/distribute/mät (testad)                        ← app-agnostisk
lib/design/regionModel.ts   v2: nästlad region-hierarki ur godtycklig DOM (testad) ← app-agnostisk
lib/design/heightModel.ts   v2: skalenliga höjder + granne-snap (testad)         ← app-agnostisk
lib/design/regionNames.ts   v2: vettiga regionsnamn utan instansdata (testad)    ← app-agnostisk
lib/design/mediaEmu.ts      v2: @media-omskrivning för äkta mobil-spegel (testad) ← app-agnostisk
lib/design/reflowModel.ts   v2: flytta = reflow/infoga, aldrig ovanpå (testad)   ← app-agnostisk
lib/design/viewSync.ts      v2: synk pan/zoom + split + MacBook-rekt (testad)    ← app-agnostisk
lib/design/savePayload.ts   v2: osparat-signatur + utökad layout-payload (testad) ← app-agnostisk
components/DesignTool.tsx    tunn monterings-komponent: admin-gate + lazy-load
components/design/*          shell, Design mode, egenskaps-panel, inspector, palett
scripts/check-grid.mjs       grid-lint (parametriserbar sidlista)                ← app-agnostisk
*.test.ts                    Vitest-enhetstester för den rena logiken
```

## Design mode v2 — wireframen som skalmodell

Design mode gör den högra wireframen till en **trogen, nästlad, skalenlig spegel** av den
riktiga sidan. Allt drivs av rena, testade moduler som opererar på **godtycklig DOM** (ingen
app-kunskap):

- **Nästlad auto-uppdelning** (`regionModel`) — bryter valfri sida i en region-hierarki
  (kort-ytor, semantik, upprepade grid/flex-barn) utan sid-specifika undantag.
- **Skalenlig wireframe + höjder** (`heightModel`) — varje region får höjd ur sin verkliga
  bounding-box; fasta höjder får dra-handtag med granne-snap.
- **Vettiga regionsnamn** (`regionNames`) — namn ur aria/rubrik/typ, aldrig instansdata.
- **Äkta mobil-spegel** (`mediaEmu`) — skriver om bredd-@media som om fönstret vore mobilt.
- **Flytt = reflow/infoga** (`reflowModel`) — släpp packar grannen i sidled eller egen rad,
  aldrig ovanpå; hela knuffen är EN ⌘Z-post.
- **Synkad pan/zoom + avdelare + MacBook-rektangel** (`viewSync`) — båda panelerna rör sig i
  synk via dokumentposition; 50/50-snap; standardskärm-rektangel vid utzoom.
- **Osparat-detektering + utökad spara-payload** (`savePayload`) — layout-signatur flaggar
  osparade ändringar; nästlade flyttar/höjder följer med som deltan.
- **Temapar Precision** (`dtTheme`) — exakt två valörer (ljus/mörk) av samma lugna tema,
  WCAG-AA-verifierat, med en varm `--dt-save`-accent för Spara-handlingar.

## Färdigskeppat vs vad du kopplar själv

| Färdigskeppat (funkar direkt) | Du kopplar själv |
|---|---|
| `<PageGrid>`-primitiv, 12-kol default, `data-grid-cols` + gap-token | Att faktiskt **lägga din vy** på `<PageGrid>` (byt korten till `col-span-*`) |
| Grid-lint med self-test + parametriserbar sidlista | Peka linten på **dina** griddade sidor (CLI/env/`grid-lint.config.json`) |
| Verktygets `--dt-*`-tokens, `.dt-root`-scope, temaparet Precision (ljus/mörk), ⌘K-palett, toasts, reduced-motion | — |
| Adapter med **localStorage-default** för notes (kör i preview) | Byt `saveDesignNote/listDesignNotes/deleteDesignNote` mot **din backend** |
| Admin-gate-stub (`admin` i dev, `anon` i prod) | Byt `getAuthStatus()` mot **din riktiga auth** |
| Live token-läsning/-skrivning för prefix `--c-` | Sätt ditt eget `tokenPrefix` i `dtConfig` om det avviker |
| Element→fil:rad, align/distribute, colorUtils (allt testat) | — |

**Skeppas INTE:** ingen backend-kod (app-projektet `design_notes.py`/`pull-design-notes`).
Persistens är ett rent interface du fyller i adaptern.

## Kom igång (4 steg)

**1. Lägg en vy på `<PageGrid>` (12 kol default).**
```tsx
import { PageGrid } from '@/lib/pageGrid'

export default function DashboardPage() {
  return (
    <PageGrid className="p-6">
      <Card className="col-span-8" />
      <Card className="col-span-4" />
      <Card className="col-span-12" />
    </PageGrid>
  )
}
```
`<PageGrid>` sätter `display:grid`, `repeat(12, minmax(0,1fr))`, gap ur en spacing-token
(`--space-grid-gutter`) och `data-grid-cols="12"` så DesignTool kan avläsa rutnätet live.
Byt kolumnantal: `<PageGrid config={{ columns: 16, gapVar: '--space-grid-gutter' }} />`.
Kitet **rekommenderar 12** för nya appar.

**2. Montera DesignTool (admin-gated + lazy).** Lägg `<DesignTool />` i din root-layout.
Den laddar shell-koden **först** när en admin öppnar verktyget; icke-admins laddar aldrig
tool-koden. Öppning: den inbyggda launchern, `?designtool=open` (dev), eller
`toggleDesignTool()` från en egen knapp (via `designToolBus`).

**3. Wira adaptern (`lib/designToolAdapter.ts`) — de 3 sömmarna:**
- **GRID:** peka på din vys grid-config (eller re-exportera din `lib/gridConfig.ts`).
- **`getAuthStatus()`:** returnera `{ tier: 'admin' }` för de som får redigera.
- **`saveDesignNote/listDesignNotes/deleteDesignNote`:** default är localStorage — byt mot
  POST/GET/DELETE mot din backend. `DesignNote`-formen är stabil, rör den inte.

**4. Kör grid-linten** på dina griddade sidor (lägg i `package.json`-scripts):
```jsonc
// grid-lint.config.json
{ "pages": ["app/dashboard/page.tsx"], "gridModule": "pageGrid" }
```
```bash
node scripts/check-grid.mjs                          # läser grid-lint.config.json
node scripts/check-grid.mjs app/dashboard/page.tsx   # eller CLI-argument
GRID_LINT_PAGES="app/a/page.tsx,app/b/page.tsx" node scripts/check-grid.mjs
```
Linten kräver att en griddad sida importerar grid-modulen (`pageGrid`/`gridConfig`) och
bär `data-grid-cols`, och flaggar "ö-celler" (grid-cell som också är `position:absolute`
eller bär arbiträr struktur-px). Ingen sidlista konfigurerad → linten hoppar tyst (exit 0).

## Konventioner värda att behålla
- Verktyget läser kolumnantalet **live ur DOM:en** (`data-grid-cols`) → grid-agnostiskt
  (12/16/24 …). Hårdkoda aldrig gridtypen i en vy.
- App-specifika palett-kommandon lägger du till i `commands`-arrayen i `DesignToolShell.tsx`
  (utpekad extension-punkt) — den porterade "Rutt-design"-knappen (app-projektet-specifik)
  är borttagen.
- Token-redigering skriver en inline-var på `<html>` → cascadar live till varje element som
  använder token:en; revert = `removeProperty`.
```

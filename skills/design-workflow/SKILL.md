---
description: Token-driven pipeline for designing a new web view or app with Claude Code — wireframes → shadcn/ui against a token layer → theme with tweakcn or DaisyUI → fine-tune. Trigger when designing a new view/app, choosing a design system, moving/reordering sections, fixing empty gaps after a move, or any UI/visual-structure work.
---

# Design-workflow

> **Ska något RITAS** — en illustration, figur, ritning, symbol eller SVG-scen — gäller `illustrate`-skillen: fem steg med granskningsloop mot korrekthet, tydlighet och skönhet, och per-agent före helhet när flera ritar delar av samma bild.

Så designar du och strukturerar webbapp-UI när du bygger med Claude Code. Token-drivet: allt hänger på ett token-lager (CSS-variabler), så omtematisering = byt token-värden. För ren finjustering (pixlar/färg/spacing på en redan byggd vy), använd `visual-iterate`-skillen istället.

## Pipelinen (ny app eller ny vy)

1. **Wireframes + kravdokument** per vy. Lo-fi räcker (Figma-boxar eller handritat) — det här handlar om **struktur & beteende**, ingen visuell polish än. Numrera skärmar/regioner så kravdokumentets referenser blir entydiga.
2. **Bygg med shadcn/ui-komponenter** mot ett **token-lager** (CSS-variabler i `globals.css`). shadcn är token-drivet → dina tokens driver komponenterna. En **token-lint** förbjuder hårdkodade värden.
3. **Välj looken:** ladda upp inspirationsbilder + beskriv känslan → Claude gör ett förslag. Förankra i **token-namn** i kravlistan ("primärknapp = `--c-cta`, rubrik = h2-token, avstånd ur spacing-skalan") så precisionen + token-disciplinen överlever en rasterbild.
4. **Tweaka temat** med **tweakcn** (visuell tema-editor för shadcn → exporterar CSS-variablerna) *eller* välj färdigt tema via **DaisyUI**. Välj EN bas: `shadcn + tweakcn` **eller** DaisyUI, inte båda (de krockar). Eftersom allt bygger på tokens är omtematisering billig — byt token-värden, hela appen skiftar look.
5. **Specifika finjusteringar** via designverktyget (se `visual-iterate`).

> Systemet + basen tar dig 0 → ~70 % snyggt. De sista 30 % är smak + iteration ovanpå en redan snygg bas — där kommer en picky blick, `design-critique` och skärmdumps-loopen in.

## Tre körfält (rätt kanal för rätt ändring)

| Ändringstyp | Kanal | Verktyg |
|---|---|---|
| **Struktur/layout** (flytta sektion, byt ordning, ny sida) | beskriv i ord / peka / ändra wireframe | Claude flyttar JSX |
| **Look/tema** (färg, typografi, radius) | byt token-värden | tweakcn / DaisyUI |
| **Mikro-nagg** (luft, ramtjocklek, spacing) | reglage/pekning i designverktyget | designverktyget (se `visual-iterate`) |

Att blanda ihop körfälten är det som får en fast i "flytta 8px"-promptande. Struktur i ord, look i tokens, nagg i verktyget.

## Grid & alignment (varför flyttar ger tomma ytor)

Tomma ytor efter en flytt beror på att rutor ligger som **öar** med egen bredd/höjd i stället för på ett **gemensamt grid**. Två nivåer:

1. **Förebygg med ett grid** (varaktig fix): bygg sidan på ett rutnät (CSS grid / 12 kolumner, konsekvent `gap` ur spacing-tokens, kort som fyller sin cell). Då **snäpper en flyttad ruta på plats** automatiskt. Grid-konventionen är en del av "välj designsystem"-beslutet — shadcn ger komponenter, du lägger grid ovanpå.
2. **Fyll raden manuellt** (utan grid, snabbt): "gör den här full bredd" / "lägg de här två på samma rad" / "balansera om raden" → Claude applicerar + skärmdumpar.

## Flytta en sektion

En **namngiven sektion är entydig** i text — det är det lätta fallet. Beskriv i ord ("flytta hela X-kortet under Y") eller peka.

- **Inom samma sida:** Claude klipper/klistrar JSX-blocket + tar med lokala variabler det behöver. Lågrisk.
- **Till en annan sida:** Claude bryter ut sektionen till en komponent. **Data-hake:** målsidan måste ha datan sektionen behöver — annars tillkommer ett **data-dragnings-steg** (hämta/skicka in datan via data-haken), riktigt jobb, inte bara en flytt. Claude flaggar kostnaden först.
- **Efteråt:** Claude renderar + skärmdumpar så du ser att den landade rätt och inget annat försköts (`${CLAUDE_PLUGIN_ROOT}/bin/shot.mjs`).

## Designverktygets utbyggnad (drag-resize) — bygg det RÄTT

Ett naivt "dra vart som helst"-verktyg producerar `position: absolute; top: 340px` — fast-positionerad, icke-responsiv layout som struntar i tokens (motsatsen till målet). Den **bra** versionen är **grid-medveten**: dra kort mellan grid-platser, ändra storlek i **kolumn-spann** (1/2/3), sätt rad → verktyget sparar en **layout-intent** ("kort X → rad 2, spann 6 kol, full bredd") som Claude översätter till riktiga Tailwind-grid-klasser + token-gap. **Aldrig fri absolut-positionering — alltid grid + tokens.**

## Gratis vs betalt

- **Gratis & rekommenderat:** shadcn/ui, tweakcn, DaisyUI, den egna designverktygs-vägen, Claudes skärmdumps-loop (inbyggd preview-MCP), Figma-som-ritverktyg + bild/krav-överlämning.
- **Betalt (bara om markant bättre):** Figma **Dev Mode MCP** (kräver Dev/Full-seat; gratis-seat ~6 anrop/mån). Använd för att generera **nya** vyer från Figma-design, INTE finjustering (svag på surgical updates). Värt det om du redan har en Dev-seat via jobbet.

## Kort sagt

Wireframes + krav → shadcn mot tokens → inspiration/känsla → Claude-förslag → tweakcn/DaisyUI för looken → grid-medvetet designverktyg för finjustering. Claude stänger alltid loopen med sin egen skärmdump.

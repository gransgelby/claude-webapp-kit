---
description: Designa en ny vy eller app, eller öppna skissverktyget ("öppna wireframe-verktyget", "jag vill skissa en layout") — skiss → komponenter mot ett token-lager → tema → finjustering. Trigga vid design av ny vy/app, val av designsystem, flytt/omordning av sektioner, tomma luckor efter en flytt, eller annat UI- och strukturarbete. Token-driven pipeline for designing a new web view or app: wireframes → shadcn/ui against a token layer → theme with tweakcn or DaisyUI → fine-tune.
---

# Design-workflow

> **Prata inte i termerna nedan med användaren.** `tokens`, `grid`, `spann`, `komponent`,
> `responsiv` är arbetsord — översätt dem. Tabellen finns i `kom-igang`-skillen.

> **Ska något RITAS** — en illustration, figur, ritning, symbol eller SVG-scen — gäller `illustrate`-skillen: sex steg med granskningsloop mot korrekthet, tydlighet och skönhet, och per-agent före helhet när flera ritar delar av samma bild.

Så designar du och strukturerar webbapp-UI när du bygger med Claude Code. Token-drivet: allt hänger på ett token-lager (CSS-variabler), så omtematisering = byt token-värden. För ren finjustering (pixlar/färg/spacing på en redan byggd vy), använd `visual-iterate`-skillen istället.

## Förutsättningar (kolla stacken innan du föreslår steg 2–4)

Pipelinen nedan är skriven för **React/Next.js med Tailwind, shadcn/ui och ett token-lager i
`globals.css`**. Det är den vanligaste stacken, inte den enda — **läs vad projektet faktiskt
kör innan du föreslår verktyg**:
- **Annan stack** (Vue, Svelte, ren CSS, Bootstrap …): *principerna* håller — designa mot ett
  token-lager, aldrig hårdkodade värden, grid framför absolut positionering. *Verktygen* gör
  det inte: hoppa shadcn/tweakcn och säg det rakt ut, i stället för att föreslå ett
  komponentbibliotek som inte passar projektet.
- **Inget token-lager än:** att införa ett (CSS-variabler) är steg noll för allt annat här.
- **Token-linten** (`bin/check-design-tokens.mjs [kataloger]`) ger sedan 0.1.21 aldrig grönt
  utan täckning: läste den noll filer, eller använder filerna inte Tailwind, skriver den
  *"grinden är inte tillämplig"* och avslutar med kod 2. **Grönt betyder numera att den
  faktiskt granskat något** — redovisa exit 2 som HOPPAD, aldrig som godkänd.
  ⚠️ Den kvarvarande begränsningen är en annan: linten ser bara värden skrivna som
  **Tailwind-klasser** (`bg-[#0f172a]`, `py-[5px]`). En hårdkodad färg i en inline-stil
  (`style={{ color: "#ff0000" }}`) eller i en `.css`-regel går igenom tyst — även i en fil
  där linten i övrigt ger grönt. Grönt betyder alltså "inga hårdkodade **klasser**", inte
  "inga hårdkodade värden". Läs koden själv när designen är det viktiga.

## Pipelinen (ny app eller ny vy)

1. **Wireframes + kravdokument** per vy. **Pluginen har ett skissverktyg** — öppna
   `${CLAUDE_PLUGIN_ROOT}/bin/wireframe.html` i användarens webbläsare när hen säger *"öppna
   wireframe-verktyget"*, *"jag vill skissa"* eller när ett nytt vy-arbete inleds. Användaren
   vet inte var pluginen ligger på disk, så **öppna filen åt hen** (`open`/`xdg-open`, eller
   servera den lokalt) — be aldrig hen leta upp den. Rutorna snäpper till kolumn- och radspann,
   och knappen *Kopiera för Claude* lägger en tabell på urklipp som hen klistrar in i chatten.
   Lo-fi räcker i övrigt (Figma-boxar eller handritat) — det här handlar om **struktur & beteende**, ingen visuell polish än. Numrera skärmar/regioner så kravdokumentets referenser blir entydiga.
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

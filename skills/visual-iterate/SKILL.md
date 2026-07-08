---
description: Code-first visual loop for fine-tuning already-built UI with Claude Code — screenshot → target-with-context → fix → re-screenshot. Trigger when fine-tuning UI, "ändra så att det ser ut så här", pixel/spacing/color/typography tweaks, "the layout looks off", or aligning a view to a target image. For structural moves or picking a design system, use design-workflow instead.
---

# Visual-iterate

Finjustering av en redan byggd vy — pixlar, spacing, färg, typografi — via en kod-först visuell loop. För att flytta sektioner, välja designsystem eller sätta upp temat, se `design-workflow`.

## Grundinsikt

Claude Codes inbyggda preview är ett **AI-självverifieringsverktyg, inte en visuell editor för människan**. När du klickar i previewen får *Claude* bara kontext — du kan inte direktmanipulera ett element och få koden att ändras. Därför fungerar inte "flytta 8px"-promptande: det saknas ett människo-lager för direktmanipulation. Lösningen är inte "bättre prompter" utan **skärmdumps-loopen nedan** + att låta Claude stänga loopen med sin egen skärmdump.

## Kärnloopen

1. **Fånga skärmdump** av nuläget — element eller hel sida (`${CLAUDE_PLUGIN_ROOT}/bin/shot.mjs`).
2. **Ge Claude målet + kontext** om felet (inte bara "det ser fel ut"). Utan skärmdump "arbetar Claude blint" — resonerar bara från markup, ser inte renderad output.
3. **Fixa stegvis** i koden (Tailwind/tokens, inte hårdkodade värden).
4. **Validera med en färsk skärmdump** — rendera om och jämför mot målet.

## Två mönster som markant höjer träffsäkerheten

- **"Expected vs actual" sida-vid-sida.** Visa målbild + nuläge bredvid varandra i stället för att beskriva felet i ord — mätbart högre fix-träffsäkerhet än ordbeskrivningar. Bygg kompositen med `${CLAUDE_PLUGIN_ROOT}/bin/compose.py` (FÖRE | EFTER + inbränd kommentar).
- **Staga prompten i tre faser:** **layout → färg/typografi → responsivt.** Lös strukturen först, sedan looken, sist brytpunkterna — blanda inte alla tre i en prompt.

## Claude stänger loopen själv

Efter en ändring ska Claude **rendera → skärmdumpa → jämföra mot målet → självkorrigera** tills de matchar. Så uppnås pixel-noggrannhet utan att du exporterar om målbilden varje varv:

1. Applicera fixen i koden.
2. `${CLAUDE_PLUGIN_ROOT}/bin/shot.mjs` på det ändrade elementet/sidan.
3. `${CLAUDE_PLUGIN_ROOT}/bin/compose.py <före> <efter> "<kommentar>" <ut.png>` → jämför före/efter mot målet.
4. Avviker det fortfarande? Iterera från steg 1. Landade det? Visa kompositen och säg klart.

## Att undvika

- **"Flytta 8px" utan skärmdump** → Claude gissar blint. Ge alltid en bild.
- **Hårdkodade värden** i fixen → bryter token-disciplinen. Justera token/Tailwind-klass, inte en rå px/hex (token-lint fångar det annars).
- **Allt i en prompt** → staga i tre faser istället.
- **Strukturell flytt** (flytta en hel sektion, byt sida) hör inte hit — det är `design-workflow`s "flytta en sektion".

## Kort sagt

Skärmdump → mål + kontext → stegvis fix → färsk skärmdump. Expected-vs-actual slår ordbeskrivningar. Staga layout → färg/typografi → responsivt. Claude stänger alltid loopen med sin egen skärmdump.

---
description: Vad webapp-kit är, vad det gör bra, och lika viktigt — vad det inte är och inte kan.
---

Användaren vill veta vad webapp-kit egentligen är. Återge innehållet nedan **i klartext**,
utan interna ord (backlog, batch, dashboard, subagent, doc-roll, token, fas, preflight,
widget, commit, gren) och utan filnamn eller kommandon. Korta ned hellre än att fylla ut —
men **hoppa aldrig över avsnittet om vad det inte är**. Det är det avsnitt som gör att
användaren slipper bli besviken senare, och det är det som saknas i de flesta produkttexter.

---

## Vad det är

Claude Code kan bygga webbappar åt dig. Problemet är sällan att den inte *kan* — det är att
längre jobb spårar ur: man tappar överblicken, nästa session har glömt vad ni kom fram till,
och "gör det snyggt" ger något annat än man tänkte sig.

webapp-kit lägger ett arbetssätt ovanpå. Det bygger inte appen — det bestämmer **hur** arbetet
går till: hur du väljer vad som ska göras, hur du ser vad som händer medan det händer, hur
resultatet redovisas, och hur projektet minns mellan gångerna.

## Vad det gör bra

- **Du väljer visuellt.** Räknar du upp tolv saker får du en klickbar ruta, inte en vägg av
  text att svara på.
- **Du ser arbetet pågå.** En sida i webbläsaren uppdaterar sig själv medan jobbet löper, och
  blir kvar som slutrapport — med bilder på det som byggts och vad du bör testa.
- **Projektet minns.** Några anteckningsfiler håller reda på vad appen ska bli, var ni står
  och vad som redan gjorts.
- **Långa pass utan sällskap.** Ett jobb kan köras över natten och sammanfattas till morgonen.
- **Verktygen vägrar gissa.** Det här är den egenskap som kostat mest att bygga: kontrollerna
  säger hellre *"jag kunde inte mäta det här"* än ger ett falskt godkänt. Ett grönt besked
  betyder att något faktiskt granskats.

## Vad det INTE är, och inte kan

Säg det här rakt ut — det är ingen brasklapp, det är förväntanshantering:

- **Det bygger inte appen åt dig i stället för Claude.** Det är ett arbetssätt, inte en
  app-generator. Allt arbete görs fortfarande av Claude, i en vanlig chatt.
- **Det gör dig inte oberoende av Claude Code.** Du behöver fortfarande ha programmet igång
  på din dator; pluginen är ingen egen tjänst och kör ingenting av sig självt.
- **Det kan inte ta skärmdumpar utan Google Chrome** på datorn, plus ett hjälpprogram som
  Claude installerar i projektet första gången bilder behövs. Utan det fungerar allt annat —
  men du får inga bilder, och den visuella finjusteringen faller bort.
- **Designdelen är inte lika stark för alla appar.** Skissverktyget och skärmdumps-jämförelsen
  fungerar överallt. Den fylligare delen — färdiga komponenter och teman — förutsätter att
  appen byggs med en viss sorts teknik (React/Next.js med Tailwind). Gör den inte det säger
  Claude det rakt ut och kör den enklare vägen.
- **Ett långt pass kostar kvot.** En natts arbete drar en rejäl del av din Claude-förbrukning.
  Claude håller koll och säger till i förväg när utrymmet börjar ta slut, men det är gratis
  bara i den meningen att pluginen inte kostar något extra.
- **Kvalitetskontrollen är inte allvetande.** Den fångar hårdkodade värden skrivna på ett
  visst sätt, men inte alla. Den säger själv vad den inte prövat — läs den raden.
- **Det ångrar inte åt dig automatiskt.** Säkerhetskopior per steg finns bara om projektet
  har versionshantering. Har det inte det, säger Claude till innan ett större jobb startar.

## Om något inte stämmer

Pluginen är byggt för att säga ifrån hellre än att gissa. Läser du något som ser trasigt ut,
eller ett besked du inte förstår — fråga. Det är alltid textens fel, aldrig ditt.

**Vad du kan göra just nu:** `/webapp-kit:hjalp`

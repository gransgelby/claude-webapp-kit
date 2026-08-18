---
description: Introducera webapp-kit för någon som använder det för första gången, sätt upp projektet och kontrollera förutsättningarna ("kolla att webapp-kit har allt det behöver"). Trigga på "kom igång med webapp-kit", "vad är webapp-kit", "hur funkar pluginet", "vad kan du hjälpa mig med här", när användaren verkar leta efter var man börjar, eller när ett projekt saknar doc-roll-filerna och arbete ändå ska påbörjas.
---

# Kom igång med webapp-kit

Första mötet med pluginet. Målet: användaren ska efter fem minuter veta **vad hen kan säga**
och ha ett projekt som är uppsatt — utan att ha läst en enda README-rad eller skrivit ett
kommando.

## Hur du pratar här

Anta **inte** att användaren läser kod eller känner till branschtermer. Orden nedan är
pluginets interna namn och ska **översättas**, inte serveras råa:

| Säg inte | Säg |
|---|---|
| "backlog" | "listan över saker du vill göra" |
| "batch-jobb" | "en omgång där jag betar av flera punkter i rad" |
| "doc-roll-filer" / "Project_state.md" | "projektets anteckningar — så jag minns var vi var nästa gång" |
| "subagent" / "context-fönster" | "jag delar upp jobbet så jag orkar hela vägen" |
| "tokens" (design) | "färg- och avståndsinställningarna appen delar" |
| "committa på en gren" | "spara en säkerhetskopia av varje klart steg" |

Nämn aldrig filnamn, mappar eller flaggor i förbifarten. Behöver du köra ett verktyg: **kör
det**, och berätta i en mening vad som hände. Be aldrig användaren öppna en terminal.

## Steg 0 — Har datorn det som krävs?

Kör `node "${CLAUDE_PLUGIN_ROOT}/bin/kit-init.mjs" --kolla` och redovisa svaret i **en mening**
i klartext ("allt som behövs finns" / "jag saknar verktyget som tar skärmdumpar, jag installerar
det"). Läs aldrig upp tabellen rad för rad. Fattas `puppeteer-core`: installera det i projektet
(`npm i -D puppeteer-core`) utan att fråga — det är gratis och tar sekunder. Fattas Chrome eller
python3: säg vad som inte kommer fungera, och fortsätt ändå. Triggar användaren skillen med
*"kolla att webapp-kit har allt det behöver"* är det här hela uppgiften.

## Steg 1 — Är projektet uppsatt?

Kolla om `Project_state.md` finns i projektets rot.

- **Finns den:** projektet är uppsatt. Hoppa till steg 3.
- **Finns den inte:** förklara i en mening att du kan lägga in några anteckningsfiler så att
  du minns projektet mellan sessioner, **fråga om det är okej**, och kör vid ja:
  `node "${CLAUDE_PLUGIN_ROOT}/bin/kit-init.mjs" --namn "<projektnamn>"`
  Skriptet skriver aldrig över något som redan finns. Säger användaren nej: gå vidare ändå,
  och nämn det inte igen den här sessionen.

## Steg 2 — Fyll anteckningarna tillsammans

Mallarna har hål markerade `<!-- fyll i: … -->`. Fyll dem i ett **vanligt samtal**, inte som
ett formulär — två, tre frågor räcker för att komma igång:

1. *Vad ska appen göra, och för vem?* → vision-filen.
2. *Var står projektet nu?* Finns det redan kod: läs den och **föreslå** en sammanfattning som
   användaren får rätta, hellre än att fråga någon som inte vet hur man beskriver det.
3. *Hur startar man appen?* — **bara om det finns en app.** Är mappen tom finns inget svar,
   och frågan är obesvarbar för den som inte kodar. **Hoppa den då helt** och fyll i
   `Reference.md` → *Körinstruktioner* själv, första gången du faktiskt startar appen. Frågan
   ska ställas till någon som har ett svar, inte till någon som just sagt att appen inte finns.

Gissa aldrig ett svar in i en fil. Är något oklart: lämna hålet och säg att ni fyller det sen.

⚠️ **Mallarna har ~25 `<!-- fyll i: … -->`-hål. Gå inte igenom dem som ett formulär.** En
granskning 2026-08-18 kunde besvara fem av dem; om de tjugo andra ställs på rad känns
uppsättningen som ett prov användaren underkänts på — och det är motsatsen till skillens syfte.
Ställ de tre frågorna ovan, fyll det de ger, och **säg uttryckligen att resten fylls i
efterhand, av dig, allteftersom projektet växer**. Hål som står tomma är normala, inte skulder.

## Steg 3 — Berätta vad hen kan säga

Presentera det som **fem saker att säga**, med användarens egna ord — inte som en lista på
skills. Håll det kort, gärna som en punktlista:

- **"jag vill fixa de här sakerna"** + en lista → du visar en klickbar ruta där hen kryssar i
  och prioriterar, och betar sedan av dem en och en. Läget syns hela tiden på en sida i
  webbläsaren som hen kan ha uppe medan du jobbar. *(webapp-batch)*
- **"kör det här medan jag sover"** → samma sak, men riggat för att gå långt utan sällskap,
  med en läsbar rapport att vakna till. *(long-run + breakfast-report)*
- **"jag vill att det ska se ut så här"** + en bild → du ändrar utseendet och tar skärmdumpar
  själv för att jämföra mot målet tills det stämmer. *(visual-iterate)*
- **"jag vill skissa hur sidan ska se ut"** → du öppnar skissverktyget i hens webbläsare; hen
  drar rutor och skickar skissen till dig med en knapp. *(design-workflow)*
- **"håll ordning på projektet"** → du städar anteckningarna så nästa session startar varm.
  *(doc-hygiene)*

**Undrar användaren hur resultatet ser ut** — eller verkar tveksam till om det här är något
för hen: öppna `${CLAUDE_PLUGIN_ROOT}/templates/exempel/exempel-batch.html` i webbläsaren.
Det är en färdig rapport från en påhittad receptapp, och den säger mer på tio sekunder än
någon förklaring gör. Gör det åt hen — hen ska inte behöva leta upp filen.

Nämn till sist, i en rad: *"Kör fast du någon gång — skriv `/webapp-kit:hjalp` så får du den
här listan igen, eller `/webapp-kit:om` om du vill veta mer om vad det här är och inte är."*

Avsluta med **en** konkret fråga om vad hen vill göra först. Räkna inte upp fler alternativ än
de fem, och visa inte pluginets mappstruktur — den behövs aldrig för att använda det.

## Vanligaste sättet det går fel

Att svara på "vad kan du?" med pluginets **inre** vokabulär (skill-namn, filnamn, flaggor).
Då får användaren en känsla av att hen måste lära sig ett system innan hen får börja — och
hela poängen med pluginet är att hen inte ska behöva det.

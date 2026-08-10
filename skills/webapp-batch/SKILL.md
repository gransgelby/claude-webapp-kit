---
description: Kör ett batch-jobb — välj/prioritera flera backlog-poster visuellt, kör så autonomt som möjligt och leverera en granskbar live-dashboard som blir slutrapport. Trigga på "starta batchjobb", begäran om "backlog-tabellen", eller när ett jobb spänner över flera backlog-poster / ett stort spår. Hanterar också batch-kön ("lägg i nästa batch: …", "köa: …", "lägg i backloggen: …").
---

# Batch-jobb

Standard-arbetssättet för större jobb (flera backlog-poster på en gång, eller ett stort spår). Målet: användaren väljer och prioriterar **visuellt** vad som ska göras, Claude kör så **autonomt som möjligt**, resultatet levereras som en **granskbar HTML-dashboard med tydliga testinstruktioner**. Minimerar fram-och-tillbaka.

> **Gränsen mot `long-run` — läs den innan du lägger till något här.**
> **Den här filen äger PROCESSEN:** hur användaren väljer och prioriterar arbete, vad hen får se, hur resultatet redovisas och hur batchen stängs. Urvalswidget, ordningsförslag som grind, dashboard, DoD per post, grenar och commits, testfall, doc-hygien-grind, batch-kö.
> **`long-run` äger KÖRMEKANIKEN:** hur agenterna startas, verifieras och överges. Subagent per post, tiers A/B, adversariell verifiering, circuit-breaker, körordning efter förlust vid avbrott, reservlista och svanspost, säkerhet vid obevakad körning.
> Tumregel: rör ändringen **vad användaren ser eller bestämmer** hör den hit; rör den **hur agenterna arbetar** hör den i `long-run`.
> ⚠️ **Ändringar som spänner över båda måste landa på båda ställena.** Det har redan gått fel en gång: reservlistans *regel* skrevs i `long-run` medan widgetens *kontroll* för den glömdes här, så specen sa "kryssruta" medan widgeten hade tre lägen. Skriv aldrig bara halva mekanismen.

## Steg 0 — Hämta öppen feedback först
Om projektet har ett ställe där feedback/designnotiser samlas (t.ex. ett admin-verktyg, en inkorg, öppna GitHub-issues): hämta de **ohanterade** posterna först och väv in dem som backlog-kandidater i widgeten, så feedback som lämnats någon annanstans aldrig missas. Saknas ett sådant ställe: hoppa steget.

## Steg 1 — Backlog som interaktiv widget

**Kommer batchen som en vägg av punkter i chatten? Skriv ned den först — sedan gäller steg 1 som vanligt.**
Stegen nedan förutsätter att batchen börjar i backloggen, men den vanligaste verkliga starten är att
användaren klistrar in tjugo–trettio synpunkter på en gång. Då gör du **först** detta, och först
därefter widgeten:
1. Skriv posterna till `docs/batch-queue.md` (kö-formatet står längst ned) — **en rad per punkt**, med
   användarens egen formulering. Det är den durabla listan; ett chattmeddelande är det inte.
2. Kör steg 1 och 2 som vanligt: widget → ordningsförslag → grind.

⚠️ **"Du kan ju börja med ovanstående så länge" betyder *kör preflight, sedan börja* — inte *hoppa över
riggningen*.** Exakt den meningen läste i ett verkligt pass som lov att skippa kön, widgeten,
frågerundan och dashboarden; passet blev gjort men gick inte att följa, och användaren fick fråga tre
gånger vad som pågick. Riggningen tar två minuter (`bin/batch-preflight.mjs`, ett kommando) och är det
enda som gör resten av passet granskbart. Att sakna den kostar hela passets granskbarhet — det är aldrig
det användaren menar med "så länge".

**Utseendet är avgjort och ska INTE ritas om från beskrivningen nedan — det finns en mall:**
`${CLAUDE_PLUGIN_ROOT}/templates/batch-urvalswidget.html`. Läs filen, byt ut **två** saker och
skicka hela innehållet som `widget_code` till `mcp__visualize__show_widget`:

1. `const BATCH = "BATCHNAMN";` → batchens namn (används i `sendPrompt`-texten).
2. Allt mellan `const POSTER = [` och den avslutande `];` → batchens egna poster, en rad var:
   `{id, titel, autonomi:"auto"|"frågor"|"dig", insats:"låg"|"medel"|"stor", läge:"ja"|"reserv"|"nej", prio:"hög"|"med"|"låg"}`.
   Ordningen i arrayen är den som visas — sortera **inte** om vid klick, raden ska stå still under fingret.
   Håll `titel` kort (~40 tecken): raden är enradig och klipps med ellips. Skälet till en post hör
   hemma i chatten, inte i widgeten.

**Städa inte in knapparnas inline-stilar i `<style>`-blocket.** De ligger inline med `!important`
därför att värdens egen knappstil annars vinner: första utkastet stylade knapparna via klasser, och
resultatet blev att *inget markerat läge syntes alls* och segmentkontrollen föll isär i tre lösa
knappar där "Reserv" klipptes till "Rese". Layoutreglerna i `<style>` går igenom — knappreglerna gör
det inte.

Förvalen du sätter i `läge`/`prio` är ditt förslag; användaren ändrar dem i widgeten. Rör du
mallens *utseende* — färger, kolumner, interaktion — är det ett designbeslut som ska tas med
användaren, inte en frihet per session. Listan nedan är alltså **specen mallen redan uppfyller**,
kvar som facit om mallen måste byggas om.

**Rollfördelningen som widgeten ska spegla: användaren äger VÄRDET, du äger MEKANIKEN.** Vilka poster som är viktiga är användarens bedömning. I vilken ordning de ska köras är din — den följer av atomicitet, beroenden och avbrottsrisk (se `long-run`, *Körordning*), och det är kunskap användaren inte ska behöva hålla i huvudet. Låt därför **inte** widgeten be om körordning.

- **Läge per post — Med / Reserv / Nej**, inte en kryssruta. *Reserv* betyder *"tas in bara om batchen blir oväntat klar tidigt"* och är hela mekanismen bakom `long-run`s reservlista — den måste kunna sättas **här**, medan användaren är vaken, annars finns inget förhandsgodkännande att luta sig mot kl. 04. Fyll reservbänken med **små, mjukt degraderande och 🟢 autonoma** poster: de körs sist, alltså när avbrottsrisken är störst, och ingen är vaken att svara på en fråga.
- **Prioritet per post — hög / medel / låg.** Det här är användarens egentliga hävstång och ska vara lätt att sätta: en trelägeskontroll per rad, inte en sortering. Prioritet betyder *hur viktigt det är att detta blir gjort*, inte när det ska köras.
- **Autonomi-märkning** — hur självständigt posten kan lösas:
  - 🟢 **Autonomt** — tydlig spec, inga externa beslut/creds/live-verifiering.
  - 🟡 **Autonomt efter frågor** — behöver några inledande beslut, kör sedan själv.
  - 🔴 **Kräver din närvaro** — aktiv medverkan behövs (prod/live-verifiering, creds, hårdvara, subjektiva designval som kräver iteration).
- **Insats** — Låg / Medel / Stor (eller "Klar — verifiera").
- **Kommentarsfält** — fri text: prioriteringar, förtydliganden eller **utmaningar** ("varför kräver X min närvaro?").
- **Knapp — "Föreslå körordning"**, inte "Starta batch". Knappen startar **ingenting**; den skickar valda poster med sin prioritet + kommentaren tillbaka via `sendPrompt` och ber om ett förslag. Namnge den så att det syns — en knapp som heter "starta" och inte startar är ett löftesbrott.

## Steg 2 — Ordningsförslag + frågerunda, EN omgång — och en GRIND innan något körs

Widgetens svar är **indata, inte ett startkommando.** Innan en enda post påbörjas:

1. **Lägg ett ordningsförslag** ur `long-run`s regel — *det som förlorar mest vid ett avbrott går först* — vägt mot användarens prioriteter. Redovisa **varför varje post ligger där den ligger**, kort: atomisk och tål inte avbrott · beroende (låser upp andra) · degraderar mjukt · liten och billig att göra om.
2. **Säg uttryckligen vad som hamnade UTANFÖR batchen och varför.** Det här är den viktigaste raden i hela steget. Användaren väljer poster utan att veta vad de kostar; faller något bort för att budgeten inte räcker, eller för att en beroendekedja inte var uppfylld, är det just där hen vill kunna opponera sig — och det går bara om det står utskrivet. En tyst nedprioritering läses som ett beslut användaren tagit, fast hen aldrig fick veta.
3. **Ställ alla frågor** som krävs för att köra autonomt — samla dem i **en** omgång, inte droppvis. Använd `AskUserQuestion` för rena val.
4. **Svara på utmaningar** i kommentaren: förklara varför en 🔴/🟡-post kräver närvaro och **omklassificera** till 🟢/🟡 om den går att lösa med inledande frågor.
5. **Redovisa reserven och svansposten.** Säg vilka poster som ligger i reserv och i vilken ordning de plockas in, och namnge den **svanspost** som gör att passet inte kan stanna i förtid (`long-run`, *Ett pass får aldrig stå stilla*). Användaren ska veta vad som händer med natten om allt går fortare än väntat — annars är reserven ett löfte hen inte kan lita på.
6. **Fråga om adversariell granskning per post — det är ett KOSTNADSBESLUT och därför
   användarens.** `long-run`s verifierar-steg låter en andra subagent dubbelkolla varje
   Tier A-kodpost före commit. Det kostar uppskattningsvis **30–50 % fler tokens** över ett
   pass. Ställ frågan här, medan användaren är vaken och kan väga den mot sin veckoförbrukning
   — inte kl. 02 när orkestratorn tar den i tysthet. **Skriv svaret i `reports/<bas>-state.md`**,
   eftersom den filen läses om vid varje återupptagning medan den här skillen inte gör det.
   Säg vad det köper: i passet 2026-08-01→02 kördes granskningen noll gånger, och morgonens
   oberoende granskning hittade tio felaktiga utfallspåståenden — två av dem tal som ärvts i
   stället för mätts, alltså precis det en granskare letar efter.
7. **Vänta på ett svar.** Steget är en grind, inte en avisering. Användaren ska hinna säga *"nej, X är viktigare än du tror"* eller *"varför är Y inte med?"* innan agenterna startar — det är hela skälet till att ordningen inte sätts i widgeten.

Avvik gärna från användarens prioritet när mekaniken kräver det (en liten post som låser upp tre stora ska ligga först även om den är lågprioriterad) — men **säg att du avviker och varför**. Prioritet som tyst ignoreras är sämre än ingen prioritet alls.

## Steg 3 — Körning med LIVE-dashboard (samma fil = slutrapporten)

**Körmotor (standard, inget separat val):** driv körningen med `long-run`-spelboken — **en subagent (`batch-worker`) per post** i eget context så huvudloopen hålls lätt och context-fönstret sparas. Sekventiellt för fil-rörande poster (undvik krock), parallellt för read-only research/audit; huvudloopen committar per klar post. Detta är default så fort en batch startas ("starta batchjobb") — användaren behöver **inte** be om subagenter separat. ⚠️ **KÖR `Skill(webapp-kit:long-run)` INNAN första posten startas — läs den inte "vid behov".**
En hänvisning är inte en laddning, och skillnaden är mätt: i ett verkligt pass 2026-08-01→02
startades tretton poster utan att `long-run` någonsin lästes, och **verifierar-steget kördes
därför noll gånger av tolv**. Orkestratorn visste inte att det fanns. Morgonens oberoende
granskning hittade tio felaktiga utfallspåståenden, varav flera en granskare hade fångat direkt.
Skillen äger tiers A/B, verifierar-steget, circuit-breaker och arbetsbudgetens trösklar. (Undantag: en pytteliten batch som uppenbart ryms i ett context-fönster kan köras inline — men vid minsta tvekan, subagenter.)

**Rigga med ETT kommando — `batch-preflight.mjs` gör hela steget och vägrar när det ska vägra:**
```
node ${CLAUDE_PLUGIN_ROOT}/bin/batch-preflight.mjs \
    --bas batch-<datum>-<slug> --namn "Operation …" [--gren batch/<datum>-<slug>] [--poster N]
```
Den kontrollerar basnamn + namn, skapar grenen, kopierar mallen till `reports/<bas>.html` +
`<bas>-data.js`, lägger `<bas>-img/`, skriver `<bas>-state.md` och skriver in namnet i historiken —
och skriver sist ut en checklista på det som återstår (namn/foton/poster/widget). Exit 1 med skäl om
något krockar. **Basnamnet måste vara unikt per batch — även flera batchar samma dygn**
(`batch-<datum>-<kort-slug>`, t.ex. `batch-2026-07-26-ui`); skalet härleder datafil, bildkatalog OCH
sina localStorage-nycklar ur basnamnet, så ett återanvänt namn ärver den förra batchens välkomstskärm,
klocka och "sett"-set — det är därför preflight vägrar i stället för att skriva över.

Skriptet fanns inte förrän riggningen visat sig vara det som faller: sex steg i prosa, lästa en gång
vid passets start, hoppades över **allihop** i ett verkligt pass. En hook (`bin/batch-guard.mjs`)
påminner numera när en `batch-worker` startas utan att någon dashboard är `running` — den blockerar
inget, men tystnar bara när riggningen faktiskt är gjord.

**Ingen strängpatchning inuti HTML:en behövs** (och ska inte göras): mallen läser `<bas>-data.js` och `<bas>-img/bg.jpg` ur sitt eget filnamn. Öppna dashboarden själv en gång innan du ger länken och se att korten renderar — en trasig dashboard ser ut som en trasig batch.
- **Allt personligt är per BATCH, aldrig per dygn:** nytt `name`, ny `nameWhy`, nytt `saying`, nya bakgrundsbilder och ett `bgId` som är unikt för batchen (använd basnamnet). Kör man två batchar samma dag ska de kännas som två olika jobb — samma namn eller samma foto två gånger är en bugg, inte en stilfråga.
- **Namn och foton får aldrig gå igen — det vaktas av en durabel logg**, `docs/batch-historik.json` (git-spårad, liten):
  ```json
  { "namn": ["Operation Grundplåt", "Operation Snåla"], "bilder": ["File:…jpg"] }
  ```
  **Läs `namn` innan du döper batchen** och välj något som inte står där. Kollen och inskrivningen görs åt dig av `batch-preflight.mjs` (den vägrar starta på ett namn som redan finns); gör du riggningen för hand måste du lägga till namnet själv när batchen startar. `bilder` skrivs av `batch-bg.py` självt när `--ledger` pekas dit, och redan använda foton filtreras bort ur sökträffarna. Finns filen inte: skapa den. (Utan logg upprepas fotot tyst — det var precis vad som hände i fyra batchar i rad innan loggen fanns.)
- **Välkomst-skärmen (sätt ALLTID tre fält):** ge batchen ett `name` (visas i header + som "Välkommen till «name»"), en `nameWhy` (en rad om **varför** namnet valdes) och ett `saying` (ett passande talesätt med glimten i ögat, visas i citat). Utelämna dem inte — de driver välkomst-flashen och gör starten personlig.
- **ETT KORT PER POST — aldrig gruppkort.** Antalet kort ska vara exakt antalet punkter användaren valde. Det är frestande att slå ihop näraliggande punkter till ett kort ("polering av kartvyn ×5") — gör det inte. I ett verkligt pass blev **26 punkter till 6 gruppkort**, och användarens första reaktion var *"Är det bara 6 (5 kvar) tasks alltså? Det känns som jag la till en massa saker"*. Den som skrivit tjugosex synpunkter vill se tjugosex rader och kunna följa var och en av dem; gruppering gör mätaren snygg och listan oanvändbar — och den döljer dessutom vad som tyst föll bort. Behöver du gruppera för läsbarhet: gör det med `size`/ordning, inte genom att ta bort rader.
- **En skärm utan skroll:** alla valda poster som kompakta statuskort i ett rutnät, var och en med sin **fas** — ⚪ Väntar · 🔵 Startar · 🟡 Pågår · 🟣 Testar · 🟢 Klar · 🔴 Blockerad — plus en total-mätare (X/N klara). **Sätt fasen löpande** (startar→pågår→testar→klar), inte bara vid klart, så mellanstegen syns.
- **Asymmetrisk in-place-uppdatering:** data bor i `-data.js` som anropar en renderar-callback (JSONP-mönster). HTML-skalet re-injicerar skriptet var ~6:e s och patchar bara kort vars data ändrats — scroll och öppna popups står stilla. Skriv om `-data.js` (inte HTML-skalet) vid varje statusändring. Poll är på **endast** när `status:"running"`.
- **HTML-escapa ALL task-text** (titlar/noter/aktivitet/frågor/testfall) — de innehåller ofta literal kod (`<Link>`, `<div>`); utan escaping korrumperas DOM:en och efterföljande kort blir osynliga. Verifiera **visibilitet**, inte bara DOM-nodantal.
- **Live-statustext** (`activity`, kursiv, lägre kontrast) på pågående kort — stora poster kan ta 20–30 min utan att något syns; uppdatera vid varje meningsfullt delsteg (~2–4 min), töm vid klart.
- **"Kräver din input"-läge:** en post som halvvägs visar sig inte kunna slutföras autonomt → sätt `phase:"input"` + `question`. **Halta inte hela batchen** — fortsätt med andra autonoma poster medan du väntar, väv in svaret när det kommer.
- **Bakgrundsfoton — EN PER POST, med egen kommentar.** Antalet bilder ska matcha antalet poster i batchen (golv ~6, tak ~20 så nedladdningen inte skenar). Skälet är att en lång batch är något användaren **tittar på** i timmar, och fyra bilder som cyklar blir tapet.
  - **Sprid temat.** Femton foton på samma motiv är tråkigt. Härled **3–5 söktema** ur batchen och fördela antalet mellan dem: dess *ämne* (det appen handlar om), dess *metod* (granskning, mätning, källkritik), dess *lynne* (nattarbete, städning, optimering), plus ett **jokertema** som knyter an till användaren, orten eller årstiden. En batch som mest är städning och optimering kan alltså ha en städbild, en depåstopp-bild och en bild på ett välordnat verktygsskåp — alla relevanta, ingen likadan. Kör `batch-bg.py` en gång per tema med var sin andel av antalet.
  - ⚠️ **Kontrollera att fotona inte är för MÖRKA — dashboarden är mörk och lägger en scrim som
    tar upp till 78 % av ljuset.** Uppmätt 2026-08-02: av tretton foton låg fyra under
    medelluminansen **100 av 255**, och de blev platta mörka fält som läser som *ingen bakgrund
    alls*. Användaren rapporterade det som en bugg (*"bakgrunden saknas"*) fast bilden laddade
    felfritt. Sikta på ljusa motiv — dagsljus, exteriörer, papper, ritningar — och välj bort
    mörka interiörer. Enklaste mätningen är att rita bilden till en liten canvas i webbläsaren
    och medelvärdesbilda; ett foto under ~100 hör inte hemma på en mörk yta.
  - **Skriv en `note` per bild** — en eller två meningar som binder just det fotot till batchen, till dagen, till användaren eller till platsen. Det är den som gör bilderna värda att titta på i stället för att bara vara bakgrund. Mallen visar den som bildtext medan bilden syns, och i bildväljaren i peek-läget.
    ```js
    "bgImages": [ {"file":"bg1.jpg","note":"…","credit":"Fotograf, «Titel» · Wikimedia Commons (CC BY 2.0)"}, … ]
    ```
    Sikta på **överraskning framför fullständighet**: en oväntad koppling slår en beskrivning av vad man ser. Hitta inte på fakta om användaren — knyt an till sådant som faktiskt står i projektet (orten, dagens datum, en post i batchen, ett tal som mättes).
  - Saknas `note` faller mallen tillbaka på den gemensamma `bgCaption`, så äldre batchar fungerar oförändrat.
- **Så hämtas de:**
  ```
  ${CLAUDE_PLUGIN_ROOT}/bin/batch-bg.py "<sökfras>" reports/$BAS-img/bg.jpg \
      --count 6 --seed $BAS --ledger docs/batch-historik.json
  ```
  Skriptet skriver `bg1.jpg … bgN.jpg` och returnerar attribution **per bild**. Lägg dem i datafilen som `bgImages` — en post per bild, med sin egen kredit, eftersom en gemensam kreditrad annars beskriver en annan bild än den som visas:
  ```js
  "bgImages": [ {"file":"bg1.jpg","credit":"Fotograf, «Titel» · Wikimedia Commons (CC BY 2.0)"}, … ]
  ```
  Hittas färre bra träffar än `--count` tar skriptet de som finns (svaret bär `wanted` kontra `got`) — hitta inte på fler. `--seed $BAS` gör urvalet reproducerbart vid omkörning; `--index N` bläddrar manuellt om temat blev fel. `bgCredit` behålls som fallback för äldre batchar utan `bgImages`.
- **Peek-läget finns — nämn det i legenden/rapporten:** tangent **B** eller knappen nere till höger tonar bort dashboarden så fotot går att se i detalj, **← → stegar mellan batchens bilder** (auto-cykeln pausas medan man tittar), och Esc, B igen eller ett klick tar tillbaka vyn.
- **Öppna helst över `http://localhost`** (kör `python3 -m http.server` i `reports/`) — `file://` gör att webbläsaren kan återanvända gammalt HTML utan att läsa om från disk.
- **Bilder på GUI-poster — `shots`, en array, inte ett par.** Fånga "före" **innan** du redigerar. När posten blir klar fyller du `shots` → kamera-chip dyker upp på kortet, detaljvyn öppnas i ny flik, och **ett klick på en bild öppnar en lightbox där ← → bläddrar och Esc stänger**. Varje bild bär sin egen bildtext i den förstorade vyn.
  ```js
  "shots": [
    {"src":"<bas>-img/R5-fore.png",     "label":"FÖRE",                "caption":"Vad som stod där innan, och varför det var fel."},
    {"src":"<bas>-img/R5-efter-hus.png","label":"EFTER · fritidshus",  "caption":"Vad ändringen gör i det enkla fallet."},
    {"src":"<bas>-img/R5-efter-fyra.png","label":"EFTER · fyra byggnader","caption":"Samma ändring där den syns tydligast."}
  ]
  ```
  ⚠️ **Två bilder är sällan rätt antal.** Ändrar du en underliggande funktion som slår igenom på fem ställen ska **alla fem** ligga här — annars ser granskningen en ändring den inte kan bedöma. Regeln är: **en bild per ställe utfallet faktiskt skiljer sig**, plus ett "före". Ett par räcker bara när ändringen har exakt ett utseende.
  ⚠️ **`caption` är inte dekoration — den är det enda som gör bilden granskningsbar.** Skriv vad man ska titta på och varför just den vyn är med, inte vad filen heter. `label` är det korta (`FÖRE`, `EFTER · smal kolumn`), `caption` är meningen under.
  **`src` får vara en relativ sökväg ELLER en data-URI.** Föredra **sökväg** när posten bär mer än två bilder — en rapport med tjugo base64-bilder blir tiotals megabyte och laddar segt.
  **Bilderna ska ligga i `reports/<bas>-img/`, aldrig i en scratchpad** — scratchpaden dör med sessionen och tar bilden med sig (regeln står också i `batch-worker`-agentens definition, eftersom det är arbetaren som skapar filen).
  Verktyg: `${CLAUDE_PLUGIN_ROOT}/bin/shot.mjs` + `${CLAUDE_PLUGIN_ROOT}/bin/compose.py`.
  **Bakåtkompatibelt:** `before`/`after` fungerar oförändrat och normaliseras till två `shots` med etiketterna FÖRE/EFTER. Nya poster ska ändå skriva `shots` — kompositbilder (före|efter i samma PNG) är nu **sämre** än två separata, eftersom lightboxen förstorar varje bild för sig.

### Kontinuitet i ett bevakat pass — lämna inte tillbaka mellan vågor
`long-run` äger det obevakade passet; det här gäller när användaren är **vaken** och tittar på
dashboarden. Regeln är densamma ändå: **kör vidare tills listan är slut, användaren avbryter, eller
arbetsbudgeten säger stopp.**
Rapportera vid **milstolpar** (batchen riggad · halvvägs · klar), inte efter varje block av poster.

**Den tredje utgången är ny och den är inte valfri.** En rad som börjar med `[arbetsbudget]`
injiceras löpande, och `batch-guard` säger till vid varje ny post när 5h-fönstret eller
orkestratorns context börjar ta slut. Slår läget om till `avsluta`: **starta ingen ny post**, gå
över till avslutet nedan medan det finns budget kvar att göra det med. Trösklar, avslutsprotokoll
och varför reserven finns: `long-run`-skillen, *Arbetsbudget*.

Skälet är uppmätt: i ett verkligt pass slutade varje våg med ett svar i chatten, och användaren frågade
**tre gånger** under samma pass om något kraschat eller avbrutits. Ett svar i chatten läses som *"jag är
klar nu"* — även när det står "fortsätter strax". Dashboarden är rapportkanalen under körning; chatten
är för milstolpar och för sådant som kräver ett beslut.

**Lämnar du faktiskt tillbaka — sätt `status:"paused"` i `-data.js` samtidigt.** En dashboard som står
kvar på `"running"` medan ingenting kör pollar vidare, visar `🟡 Pågår` på ett kort som ingen arbetar på,
och läser som ett hängt jobb. `"paused"` stänger av pollen och säger sanningen: passet väntar på dig.

## DoD per post (innan en post markeras klar)
- **Logik-/analys-ändring:** kör **projektets test/verify-kommando** och se att den är grön. Rör den delad fixtur/golden data → uppdatera den.
- **Ren GUI-/styling-ändring:** typecheck + token-lint (`${CLAUDE_PLUGIN_ROOT}/bin/check-design-tokens.mjs`), verifiera visuellt.
- Varje fixad bugg får ett regressionstest.

### Pixeldiff-grinden — gäller VARJE post, inte bara de som rör UI
**En ändring i logiken kan flytta bilden utan att röra en rad vy-kod.** I en verklig körning gav en modellpost en byggnadstyp egen sockelhöjd, och **huset sjönk 45 cm i fasadvyn** utan att någon tittade; en annan post lät en byggnad stå synligt högre, och den bilden granskades först flera poster senare. Båda blev rätt till slut av tur, inte av ordning.

Innan en post markeras klar: **rendera ett fast urval skärmar före och efter och diffa dem.**
```
node ${CLAUDE_PLUGIN_ROOT}/bin/granska-bild.mjs --diff fore.png efter.png   → antal skilda bildpunkter
```
- **Diff = 0** → bilden är *bevisat* oförändrad. Skriv ut talet; påstå det aldrig utan att ha mätt.
- **Diff ≠ 0 på en post som inte skulle röra bilden** → **titta på bilden** innan du säger klart, och skriv i commiten vad som flyttade sig och varför.
- **Diff ≠ 0 på en UI-post** → granskningsloopen som vanligt: rendera → titta med `Read` → åtgärda → rendera igen, tills inget nytt hittas.

Grinden är billig därför att **renderingen kostar nästan inget medan bildläsningen är dyr** — diffen gör att man bara betalar för att titta när något faktiskt ändrats.

### Katalog över visuella fall — bygg den tidigt, den betalar sig direkt
Lägg appens visuella tillstånd som en **numrerad lista i en vanlig datafil**, renderad på en utvecklarsida (`/granskning` e.d.) — inte som en handskriven sida. Numreringen ska vara **stabil**: nya fall läggs sist, befintliga numreras aldrig om.

Tre saker delar då samma uppräkning: granskare hänvisar till **fallnummer** i stället för att beskriva vad de tittade på, testerna kan **svepa över hela listan** (ett verkligt projekt fick ett test som kräver att ingen hjälplinje i något av 83 fall hamnar på en materialfyllning), och pixeldiffen ovan får ett självklart urval.

## Gren & commits
- Batch-arbete går på en **egen gren** `batch/<datum>` (flera samma dag: `batch/<datum>-<slug>`) — aldrig direkt på huvudgrenen.
- **Committa varje klar våg** innan sessionen slutar (skyddar mot förlorad ocommittad diff mellan sessioner). Commit-meddelandet listar posterna + "tester gröna". Kör aldrig `git push` utan uttryckligt ok.

## Resume över sessioner
En stor batch ryms sällan i ett context-fönster. Tillståndet ligger **på disk**: dashboarden (`-data.js`) bär per-post-status, git-trädet bär koden, och en `reports/$BAS-state.md` bär scope-beslut/defaults/körordning + "så här återupptar du". En ny session läser dessa + nästa `waiting`-post och fortsätter utan att fråga om igen. Trigger: "fortsätt batchjobbet".

## Fånga per-post-timing + tokens (för retrospektiven)
Genom hela körningen: **stämpla `t0` (epoch ms) på varje post när den startar** (`date +%s%3N`), och när
dess subagent är klar sätt **`t1 = t0 + subagentens duration_ms`** och **`tokens = subagentens
subagent_tokens`** (båda finns i subagentens slutnotis) i postens item i `-data.js`. Dessa tre fält driver
retrospektiv-sektionen "Så gick körningen" (stats + tyngsta jobbet + tidslinje) som mallen renderar vid frys.
Kostar nästan inget och gör slutrapporten mätbar. (Görs posten inline utan subagent: stämpla t0/t1 själv.)

## Steg 4 — Testfall sist i rapporten (obligatoriskt)
Lägg **detaljerade testfall** sist, i data-fältet `tests: { must: [...], nice: [...] }`, varje post `{id, t, steps, expect}`:
- **Måste testas** (`must`) — sådant Claude **inte** kunnat verifiera själv (prod, externa tjänster, riktig data, interaktivt).
- **Får gärna testas** (`nice`) — redan verifierat, men kan dubbelkollas.
- Varje fall = konkreta **steg** (URL/läge + vad man gör) + **förväntat resultat**.

## Slut — dashboarden fryses, doc-hygien-GATE
När allt är klart fryses statusen och samma fil blir **slutrapporten**. Ge **bara sökvägen** i chatten (inline-bilder är token-tunga / syns ej i schemalagda pass). `reports/*`-artefakterna är **ephemeral** (gitignorerade) — kopieras aldrig in i doc-filerna.

**Bildgrind vid frysningen.** Gå igenom varje `done`-post som rörde något visuellt och kontrollera att `shots` faktiskt är **ifylld i datafilen** — med **bildtext på varje bild** och med en bild per ställe utfallet skiljer sig, inte bara ett före/efter-par. Instruktionen finns redan högre upp, men den är lätt att missa i en lång körning: subagenter producerar kompositer, orkestratorn klistrar sökvägen i chatten, och dashboarden fryses med tomma bildfält — vilket hände i en verklig batch och fick upptäckas av användaren efteråt. Kompositerna ligger dessutom ofta i en scratchpad som försvinner med sessionen, medan `reports/<bas>-img/` överlever. Saknas en bild: kopiera in den och koppla den, eller skriv i postens `note` **varför** den saknas. Öppna dashboarden en gång efter frysningen och kontrollera att inga bildlänkar är brutna.

**Doc-hygien-sweep är en GATE, inte på-begäran:** innan batchen förklaras klar, kör doc-hygien-skillen — svep alla doc-filer, trimma dubbletter/felplacerat, distillera **en** kort klar-post i history + ta bort klara backlog-poster.

⚠️ **Kör den i en SUBAGENT med rent context, och gäller även obevakade pass.** Två skäl, båda mätta: orkestratorn är som tunnast just här, så ett inline-svep komprimeras bort — och **en agent läser sitt eget material som korrekt**, vilket gör batch-slutets svep systematiskt tunnare än ett som triggas separat. Ge svepagenten batchens commit-shas och inget annat sammanhang. `long-run` sa fram till 2026-08-11 att svepet skulle skjutas upp vid obevakade pass; den raden är rättad, eftersom uppskjutandet gick till en "morgon-review" som varken hade ägare eller trigger. **Mergen** skjuts fortfarande upp — det är en annan sak och Tier B behöver sign-off.

⚠️ **Svepet är inte "dokumentera det vi nyss gjorde".** Batchens egna spår tas av DoD per post. Svepet finns för driften som **inte** hör till den här batchen — och det är därför det måste läsa alla fem filer, inte bara de rader passet rörde.

### Länklistan — sista stycket i slutrapporten, alltid

**Avsluta ALLTID batchen med en kort lista över var man tar sig in**, längst ned i slutmeddelandet:

```
**Slutrapport:** http://localhost:8099/<bas>.html
**Appen:**      http://localhost:<port>/            ← testa här
**<vy>:**       http://localhost:<port>/<vy>        (om batchen rörde den)
```

- **Starta servrarna själv först, och verifiera att de svarar** — Claude gör allt server-sidigt
  som krävs för att användaren ska se det NYA. Subagenter stoppar sina egna dev-servrar när de
  är klara, så efter en lång batch är porten oftast **död** även om den var igång mitt i passet.
  Ge aldrig en URL du inte just har fått svar från.
- **Ta med de vy-URL:er batchen faktiskt rörde**, inte bara appens rot: en granskningssida
  (`/granskning`, `/ritgranskning`), en utvecklarsida för primitiver (`/kontroller`), en ny flik.
  Det är där arbetet syns, och det är den länken användaren annars måste leta upp.
- **Öppna dem i användarens EGEN webbläsare, inte i agentens förhandsvisningspanel** — på macOS
  `open <url>` per länk. Panelen är ditt verifieringsverktyg; användaren vill ha flikar hen kan
  behålla, bokmärka och läsa på en riktig skärm. Öppna bara de länkar du just verifierat svarar.
- **Skriv ut vad som är lokalt kontra deployat**, och att en **hård omladdning** kan behövas.

Skälet är mätt i verkligt bruk: en användare som just vaknat till en färdig nattbatch frågade
*"vad är adressen jag kan testa appen på?"* och tillade att hen **ofta** har svårt att hitta
tillbaka till appen när en batch är slut. Rapportens sökväg räcker inte — den visar vad som
gjordes, inte var man provar det. Länklistan kostar tre rader och tar bort hela det letandet.

### Cache-rensning — GÖRS FÖRE länklistan, aldrig efter

En batch lämnar efter sig cacher som får användaren att se **gammal kod på en färsk URL**, och
det är värre än en död länk: en död länk syns, en stale bundle gör det inte. Gör därför det här
**innan** du ger länkarna, och i den här ordningen:

1. **Döda kvarglömda dev-servrar.** Subagenter startar egna servrar på egna portar; en som
   överlevt passet kan hålla appens port och servera en bundle från timmar sedan.
   `pgrep -fl "next dev"` (eller motsvarande) och stäng det som inte är ditt.
2. **Radera subagenternas byggcacher.** Varje post som körde en dev-server fick en egen
   `NEXT_DIST_DIR` (`.next-<post>`, `.vite-<post>`, motsvarande i andra ramverk). De är döda när
   posten är klar och blir stora fort — i ett verkligt pass låg **245 MB i fem kataloger** kvar
   efter att agenterna sagt sig ha städat. ⚠️ **Kontrollera att ingen process håller katalogen**
   (`lsof +D <dir>`) och **rör aldrig en annan sessions katalog** — `.next-claude` och liknande
   tillhör någon annan som kanske arbetar just nu.
3. **Starta appservern FÄRSK** och verifiera med en faktisk begäran (`curl -o /dev/null -w "%{http_code}"`)
   att både roten och varje vy-URL svarar 200. Startade du om servern: kontrollera att den
   serverar det NYA — läs av något batchen faktiskt ändrade (ett antal, en ny kontroll, en ny
   rubrik), inte bara att sidan laddar.
4. **Kör om det som är cache-känsligt i projektet** — token-lint efter en tokenändring, en
   backend som måste startas om efter kodändring. Projektets `CLAUDE.md` äger den listan.

**Säg sedan uttryckligen vad bara användaren kan göra** — men **mät först om det ens behövs, och
skriv aldrig ut en tangentkombination du inte vet gäller i deras webbläsare.**

Kolla vad servern faktiskt skickar innan du ber om något:

```
curl -sI http://localhost:<port>/ | grep -i cache-control
```

- **`no-store` / `no-cache`** → en vanlig omladdning räcker, och det finns ingen cache att
  spränga. Säg det i stället för att be om en hård omladdning som inte gör något. En modern
  dev-server (Next.js, Vite) skickar det här på både dokument och chunkar.
- **Ingen `Cache-Control` alls** (t.ex. `python -m http.server` framför en rapport) → webbläsaren
  gissar sig till en färskhetstid ur `Last-Modified` och kan servera ur cache utan att fråga. En
  vanlig omladdning revalidiserar ändå huvuddokumentet, så den räcker nästan alltid; behöver du
  mer, be om webbläsarens *töm cache*-funktion snarare än en tangentkombination.

⚠️ **Hårda omladdningar är INTE `⌘⇧R` överallt.** I Safari är `⌘⇧R` **Reader** — instruktionen
gör något helt annat än avsett, vilket hände i verkligt bruk. `⌘⇧R` gäller Chrome och Firefox.
Skriv därför hellre *"ladda om sidan"* och, om cachen verkligen måste tömmas, namnge **menyvalet**
(Safari: Utvecklare → Töm cacheminnen) i stället för en genväg. Menyval är stabila; genvägar är
webbläsar- och språkberoende.

## Batch-kön (planera/köa flera batchar)
Håll en durabel kö i `docs/batch-queue.md` (git-spårad, INTE `reports/`), en post per batch:
```
### Batch N · "Operation …" · status: köad
- items: B27, B28, I60
- storlek: normal            (eller: stor-egen)
- not: varför / ordning / beroende
```
Statusflöde `köad → kör → klar`; klara arkiveras (git bär historiken). Stora poster märks `stor-egen` (eget fokuserat batch, en i taget).

**Chat-triggers (honorera alltid, även mitt i en pågående batch):**
- **"lägg i nästa batch: …"** / **"köa: …"** → appendra posten till nästa `köad`-batch i `docs/batch-queue.md` (skapa "Batch N" om ingen finns) + bekräfta.
- **"lägg i backloggen: …"** → bara `Backlog.md`, ingen batch.

När en batch blir klar: **föreslå att starta nästa köade batch i fräscht context** (bättre kvalitet än ett överlångt pass).

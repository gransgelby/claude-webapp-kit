---
description: Kör ett batch-jobb — välj/prioritera flera backlog-poster visuellt, kör så autonomt som möjligt och leverera en granskbar live-dashboard som blir slutrapport. Trigga på "starta batchjobb", begäran om "backlog-tabellen", eller när ett jobb spänner över flera backlog-poster / ett stort spår. Hanterar också batch-kön ("lägg i nästa batch: …", "köa: …", "lägg i backloggen: …").
---

# Batch-jobb

Standard-arbetssättet för större jobb (flera backlog-poster på en gång, eller ett stort spår). Målet: användaren väljer och prioriterar **visuellt** vad som ska göras, Claude kör så **autonomt som möjligt**, resultatet levereras som en **granskbar HTML-dashboard med tydliga testinstruktioner**. Minimerar fram-och-tillbaka.

## Steg 0 — Hämta öppen feedback först
Om projektet har ett ställe där feedback/designnotiser samlas (t.ex. ett admin-verktyg, en inkorg, öppna GitHub-issues): hämta de **ohanterade** posterna först och väv in dem som backlog-kandidater i widgeten, så feedback som lämnats någon annanstans aldrig missas. Saknas ett sådant ställe: hoppa steget.

## Steg 1 — Backlog som interaktiv widget
Läs projektets backlog-fil och visa den som en interaktiv widget (`mcp__visualize__show_widget`). Varje post har:
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
6. **Vänta på ett svar.** Steget är en grind, inte en avisering. Användaren ska hinna säga *"nej, X är viktigare än du tror"* eller *"varför är Y inte med?"* innan agenterna startar — det är hela skälet till att ordningen inte sätts i widgeten.

Avvik gärna från användarens prioritet när mekaniken kräver det (en liten post som låser upp tre stora ska ligga först även om den är lågprioriterad) — men **säg att du avviker och varför**. Prioritet som tyst ignoreras är sämre än ingen prioritet alls.

## Steg 3 — Körning med LIVE-dashboard (samma fil = slutrapporten)

**Körmotor (standard, inget separat val):** driv körningen med `long-run`-spelboken — **en subagent (`batch-worker`) per post** i eget context så huvudloopen hålls lätt och context-fönstret sparas. Sekventiellt för fil-rörande poster (undvik krock), parallellt för read-only research/audit; huvudloopen committar per klar post. Detta är default så fort en batch startas ("starta batchjobb") — användaren behöver **inte** be om subagenter separat. Läs `long-run`-skillen för tiers A/B, adversariell verifiering och circuit-breaker. (Undantag: en pytteliten batch som uppenbart ryms i ett context-fönster kan köras inline — men vid minsta tvekan, subagenter.)

Kopiera mallen till batchen och driv den under hela körningen. **Basnamnet måste vara unikt per batch — även flera batchar samma dygn** (`batch-<datum>-<kort-slug>`, t.ex. `batch-2026-07-26-ui`); skalet härleder datafil, bildkatalog OCH sina localStorage-nycklar ur basnamnet, så ett återanvänt namn ärver den förra batchens välkomstskärm, klocka och "sett"-set:
```
BAS=batch-<datum>-<slug>
cp ${CLAUDE_PLUGIN_ROOT}/templates/batch-dashboard.html reports/$BAS.html
cp ${CLAUDE_PLUGIN_ROOT}/templates/batch-dashboard-data.js reports/$BAS-data.js
```
**Ingen strängpatchning inuti HTML:en behövs** (och ska inte göras): mallen läser `<bas>-data.js` och `<bas>-img/bg.jpg` ur sitt eget filnamn. Öppna dashboarden själv en gång innan du ger länken och se att korten renderar — en trasig dashboard ser ut som en trasig batch.
- **Allt personligt är per BATCH, aldrig per dygn:** nytt `name`, ny `nameWhy`, nytt `saying`, nya bakgrundsbilder och ett `bgId` som är unikt för batchen (använd basnamnet). Kör man två batchar samma dag ska de kännas som två olika jobb — samma namn eller samma foto två gånger är en bugg, inte en stilfråga.
- **Namn och foton får aldrig gå igen — det vaktas av en durabel logg**, `docs/batch-historik.json` (git-spårad, liten):
  ```json
  { "namn": ["Operation Grundplåt", "Operation Snåla"], "bilder": ["File:…jpg"] }
  ```
  **Läs `namn` innan du döper batchen** och välj något som inte står där; lägg till det nya namnet när batchen startar. `bilder` skrivs av `batch-bg.py` självt när `--ledger` pekas dit, och redan använda foton filtreras bort ur sökträffarna. Finns filen inte: skapa den. (Utan logg upprepas fotot tyst — det var precis vad som hände i fyra batchar i rad innan loggen fanns.)
- **Välkomst-skärmen (sätt ALLTID tre fält):** ge batchen ett `name` (visas i header + som "Välkommen till «name»"), en `nameWhy` (en rad om **varför** namnet valdes) och ett `saying` (ett passande talesätt med glimten i ögat, visas i citat). Utelämna dem inte — de driver välkomst-flashen och gör starten personlig.
- **En skärm utan skroll:** alla valda poster som kompakta statuskort i ett rutnät, var och en med sin **fas** — ⚪ Väntar · 🔵 Startar · 🟡 Pågår · 🟣 Testar · 🟢 Klar · 🔴 Blockerad — plus en total-mätare (X/N klara). **Sätt fasen löpande** (startar→pågår→testar→klar), inte bara vid klart, så mellanstegen syns.
- **Asymmetrisk in-place-uppdatering:** data bor i `-data.js` som anropar en renderar-callback (JSONP-mönster). HTML-skalet re-injicerar skriptet var ~6:e s och patchar bara kort vars data ändrats — scroll och öppna popups står stilla. Skriv om `-data.js` (inte HTML-skalet) vid varje statusändring. Poll är på **endast** när `status:"running"`.
- **HTML-escapa ALL task-text** (titlar/noter/aktivitet/frågor/testfall) — de innehåller ofta literal kod (`<Link>`, `<div>`); utan escaping korrumperas DOM:en och efterföljande kort blir osynliga. Verifiera **visibilitet**, inte bara DOM-nodantal.
- **Live-statustext** (`activity`, kursiv, lägre kontrast) på pågående kort — stora poster kan ta 20–30 min utan att något syns; uppdatera vid varje meningsfullt delsteg (~2–4 min), töm vid klart.
- **"Kräver din input"-läge:** en post som halvvägs visar sig inte kunna slutföras autonomt → sätt `phase:"input"` + `question`. **Halta inte hela batchen** — fortsätt med andra autonoma poster medan du väntar, väv in svaret när det kommer.
- **Bakgrundsfoton — EN PER POST, med egen kommentar.** Antalet bilder ska matcha antalet poster i batchen (golv ~6, tak ~20 så nedladdningen inte skenar). Skälet är att en lång batch är något användaren **tittar på** i timmar, och fyra bilder som cyklar blir tapet.
  - **Sprid temat.** Femton foton på samma motiv är tråkigt. Härled **3–5 söktema** ur batchen och fördela antalet mellan dem: dess *ämne* (det appen handlar om), dess *metod* (granskning, mätning, källkritik), dess *lynne* (nattarbete, städning, optimering), plus ett **jokertema** som knyter an till användaren, orten eller årstiden. En batch som mest är städning och optimering kan alltså ha en städbild, en depåstopp-bild och en bild på ett välordnat verktygsskåp — alla relevanta, ingen likadan. Kör `batch-bg.py` en gång per tema med var sin andel av antalet.
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
- **Före/efter på GUI-poster:** fånga "före" **innan** du redigerar; fyll `before`/`after` (base64) när posten blir klar → kamera-chip dyker upp på kortet, detaljvyn öppnas i ny flik. Verktyg: `${CLAUDE_PLUGIN_ROOT}/bin/shot.mjs` + `${CLAUDE_PLUGIN_ROOT}/bin/compose.py`.

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

**Före/efter-grind vid frysningen.** Gå igenom varje `done`-post som rörde något visuellt och kontrollera att `before`/`after` faktiskt är **ifyllda i datafilen**. Instruktionen finns redan högre upp, men den är lätt att missa i en lång körning: subagenter producerar kompositer, orkestratorn klistrar sökvägen i chatten, och dashboarden fryses med tomma bildfält — vilket hände i en verklig batch och fick upptäckas av användaren efteråt. Kompositerna ligger dessutom ofta i en scratchpad som försvinner med sessionen, medan `reports/<bas>-img/` överlever. Saknas en bild: kopiera in den och koppla den, eller skriv i postens `note` **varför** den saknas. Öppna dashboarden en gång efter frysningen och kontrollera att inga bildlänkar är brutna.

**Doc-hygien-sweep är en GATE, inte på-begäran:** innan batchen förklaras klar, kör doc-hygien-skillen — svep alla doc-filer, trimma dubbletter/felplacerat, distillera **en** kort klar-post i history + ta bort klara backlog-poster.

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

---
description: Doc-roll-systemet (App_vision / Project_state / Reference / Backlog / Project_history) och rutinerna som håller det färskt. Kör vid "granska dokumentationen", vid misstänkt dok-drift/dubblering, som doc-hygiene-svep i slutet av ett batch-jobb, och vid backlog-intag ("lägg i backloggen: …").
---

# Doc-hygiene

Ett litet, stabilt set av dokument-filer med **åtskilda roller** håller projektets
kunskap färsk och billig att läsa. Grundregeln: **ingen dubbel bokföring** – ett
faktum har *en* hemvist, korslänka i stället för att kopiera. Dubblering är
rotorsaken till att dokumentation blir gammal.

## De fem rollerna

- **App_vision.md** – *vart vi ska*: produktvision, syfte, primär användare,
  designprinciper, icke-mål. En målbild, inte en spec av nuläget. Ändras sällan.
- **Project_state.md** – *var vi är*: kort **Nuläge** + en orienteringskarta/
  snabbstart (status, huvudflöden, viktiga filer, pekare till övriga docs). **Läses
  varje session** → håll den kort och billig. **Inga** kronologiska loggar, ingen
  referens, ingen backlog här.
- **Reference.md** – *hur det är byggt*: teknisk uppslagsbok (tech stack,
  projektstruktur, tekniska beslut, API-gotchor, kända begränsningar,
  körinstruktioner). **Läses vid behov** när du rör ett område – inte varje session.
  Referens, inte changelog.
- **Backlog.md** – *vad vi kanske gör sen*: framåtblickande spår/idéer, **en rad per
  spår**. Texttunga planer länkas ut till `docs/<feature>-plan.md`, inlinas inte.
  **Ingen klar-historik** här. Stabila ID:n (se nedan).
- **Project_history.md** – *vad som gjorts*: kronologisk, detaljerad klar-logg,
  **nyaste överst**. Det **enda** hemmet för changelog/klar-historik.

Extra: **docs/<feature>-plan.md** – levande plan för *ett* stort flerstegs-spår
(design/rationale + plan + en tunn "klart/nästa"-status). **Ingen daterad changelog**
(den hör till Project_history). Pensionera/arkivera när spåret är klart.

## Kärnregeln: ingen dubbel bokföring

- Nytt faktum → **en enda** hemvist enligt rollerna. Behöver en annan fil peka på
  det → **korslänka** (`[[Reference.md]]` / relativ länk), **kopiera aldrig**.
- Ser du samma text på två ställen → det är en bugg. Behåll den i rätt roll, ersätt
  den andra med en länk.

## Definition-of-done (dok-delen av en klar milstolpe)

Innan du säger "klart" på en logik-/feature-ändring, svep dessa fyra:

1. Ändrades *var-vi-är*? Uppdatera `Project_state.md` → **Nuläge** (och bara det som
   är kort och aktuellt).
2. Flytta den **detaljerade** klar-beskrivningen till `Project_history.md` (nyaste
   överst) – inte in i Project_state.
3. Rörde du något `Reference.md` beskriver (tech stack, struktur, API-gotcha,
   körning)? Uppdatera **den raden** där.
4. Avslutade du ett backlog-item? **Ta bort** det ur `Backlog.md` (det lever vidare i
   historik + git; ID:t pensioneras).

Snabbkoll till sist: inga döda länkar, ingen dubblerad text.

## Räkna om varje tal du skriver — skriv aldrig av det

**Ett tal som kopieras framåt slutar vara sant utan att någon märker det.** I ett
verkligt svep hittades **tre** sådana i samma pass: antalet tester (stod 1883, var
1971), antalet krav-ID (stod 205 medan två poster längs vägen sagt 209 och 210 — det
verkliga talet var 212) och antalet CSS-variabler (stod 43, lintern räknade 51). Alla
tre hade skrivits av från en tidigare post i stället för att mätas.

Därför, för **varje** tal som hamnar i en doc-fil:

1. **Mät det själv** — kör testsviten, kör lintern, kör grep:et, läs värdet ur koden.
2. **Skriv ut metoden** bredvid talet, så att nästa session kan göra om räkningen i
   stället för att lita på den. (*"unikt räknad union av `**Krav Xn` och `krav Xn`"* är
   en metod; *"212 krav"* är ett påstående.)
3. **Verifiera två vägar** när talet är viktigt nog att bli citerat vidare — t.ex. både
   en grep och en kontroll att serierna är sammanhängande utan luckor.
4. Går talet **inte** att verifiera: skriv inte ut det. Säg att det inte gick.

Samma regel gäller när du sammanfattar arbete: **hämta talen ur commit-meddelandena**,
inte ur en tidigare sammanfattning. Ett commit-meddelande som bär sina mätvärden gör hela
det här steget billigt — se `long-run`-skillen.

## Backlog-intag ("lägg i backloggen: …")

1. **Dubbelkolla** mot befintliga poster → vid överlapp **slå ihop** (inte en rad
   till).
2. Lägg i rätt sektion (`## Buggar att fixa` resp. `## Idéer & funktioner`) med ett
   **stabilt ID** = högsta oanvända i sektionen (`B`x buggar, `I`x idéer). **Återanvänd
   aldrig och numrera aldrig om** ID:n – en klar post tas bort och dess nummer
   pensioneras.
3. Format:
   `- **I12 · Titel** – kort beskrivning. *Insats (låg/medel/stor).* (tillagd ÅÅÅÅ-MM-DD)`
   (dagens faktiska datum).
4. **Bekräfta** kort vad som lades till (med ID) eller slogs ihop.

## "Granska dokumentationen" – svepet

Ett skyddsnät mot drift (rutinerna ovan minskar den men garanterar inget). Kör det
**på begäran** och som en **obligatorisk gate i slutet av varje batch-jobb**:

1. Läs alla fem doc-filer (+ ev. `docs/*-plan.md`).
2. Leta efter: **inaktuellt** (motsäger nuläget/koden), **dubblerat** (samma fakta på
   två ställen), **felplacerat** (changelog i Project_state, referens i Backlog,
   backlog-idéer i Reference, osv.).
3. **Åtgärda**: trimma dubbletter till en hemvist + länk; flytta felplacerat till rätt
   roll; distillera klar-poster till **en** post i Project_history och **ta bort** dem
   ur Backlog; pensionera färdiga `docs/*-plan.md`.
4. Kontrollera att `Project_state.md` fortfarande är **kort** (inga kronologiska
   loggar smugit in) och att alla korslänkar lever.
5. **Rapportera** kort vad som trimmades/flyttades.

Ephemeral artefakter (t.ex. `reports/`-dashboards) kopieras **aldrig** in i
doc-filerna – de är engångs.

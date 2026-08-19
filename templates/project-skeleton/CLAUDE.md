# <!-- fyll i: Projektnamn --> – instruktioner för Claude

> 💬 **Den här filen är Claudes arbetsinstruktion för projektet.** Du behöver inte göra något
> med den — den finns för att Claude ska jobba likadant varje gång. Läs den gärna, och säg
> till om något står fel.

Läs alltid följande filer **innan** du påbörjar något arbete i detta projekt:

1. `App_vision.md` – produktvision, syfte, användare och designprinciper
2. `Project_state.md` – kort nuläge + orienteringskarta (kall-start)

`Reference.md` (teknisk uppslagsbok), `Backlog.md` (framåtblickande spår/idéer) och
`Project_history.md` (kronologisk klar-logg) läses **endast vid behov** – inte varje
session. De hålls separat just för att `Project_state.md` ska förbli kort: den läses varje
gång, och en lång fil äter av det utrymme som annars går till arbetet.

## Arbetssätt – webapp-kit-pluginen

Processerna för det här projektet bor i **webapp-kit**-pluginens skills (kör dem med
`/webapp-kit:<namn>` eller låt dem auto-trigga på beskrivning):

- **webapp-batch** – "starta batchjobb" / större jobb över flera backlog-poster:
  interaktiv backlog-widget → frågerunda → live HTML-dashboard → körning → slutrapport.
- **long-run** – stora/obevakade pass (subagent per post, eget context, committa per
  klar post).
- **design-workflow** – design-/UI-arbete (wireframe → komponenter + tokens → känsla).
- **visual-iterate** – finjustera UI via skärmdumps-loop (före/efter).
- **doc-hygiene** – doc-roll-systemet + "granska dokumentationen"-svepet.

## Doc-roller (håll dem åtskilda – ingen dubbel bokföring)

- **App_vision.md** – *vart vi ska*: vision, syfte, designprinciper.
- **Project_state.md** – *var vi är*: kort nuläge + orienteringskarta. **Läses varje
  session → håll kort.** Ingen referens/backlog/historik här.
- **Reference.md** – *hur det är byggt*: teknisk uppslagsbok. Läses vid behov.
- **Backlog.md** – *vad vi kanske gör sen*: en rad per spår, **stabila ID:n** (`B`x/`I`x,
  återanvänds aldrig). Ingen klar-historik.
- **Project_history.md** – *vad som gjorts*: kronologisk klar-logg, nyaste överst. Enda
  hemmet för changelog.

**Kärnregel:** ett faktum har *en* hemvist – korslänka, **kopiera aldrig** (dubblering
är rotorsaken till att docs blir gamla). Uppdatera `Project_state.md` *Nuläge* + flytta
klar detalj till `Project_history.md` när en milstolpe slutförs. Full rutin +
backlog-intag: `doc-hygiene`-skillen.

<!-- webapp-kit:valfritt server -->
## Cache & servrar – "ser jag ny eller gammal kod?"

> **Gäller bara projekt som har en server eller en cache.** Består projektet av rena
> HTML/CSS/JS-filer som öppnas direkt i webbläsaren beskriver avsnittet problem som inte
> finns här — säg till Claude att ta bort det, så gör den det.

Grundstrategi (varje gång du ändrat något och är klar): **Claude gör allt server-sidigt
som krävs för att användaren ska se det NYA**, och **informerar sedan om de steg bara
användaren kan göra** (webbläsarsidan).

- Ändrade du **kod som körs på servern**? Starta om servern innan du säger "klart" –
  annars visas den gamla koden fortfarande. <!-- fyll i: kommando för att starta om servern -->
- Ändrade du en **cachad svarsform/logik**? Rensa/bumpa cachen. <!-- fyll i: hur cachen
  rensas/versioneras i detta projekt -->
- Säg **exakt** vad användaren ska göra: vilken **adress** hen ska öppna, om det som visas
  ligger **på hens egen dator eller ute på nätet**, och att sidan ibland behöver laddas om
  för att den nya versionen ska synas (säg det i klartext: "ladda om sidan" — skriv inte
  ⌘⇧R, det är inget alla känner igen).

<!-- fyll i: körinstruktioner (start-/build-/test-kommandon, portar, dev-URL) – lägg
detaljerna i Reference.md → Körinstruktioner och peka hit. -->
<!-- webapp-kit:slut server -->

<!-- webapp-kit:valfritt tester -->
## Testning – kör testerna innan du säger "klart"

> **Gäller bara projekt som har tester.** Finns inga än gäller inget här — Claude lägger
> tillbaka avsnittet den dag de första testerna skrivs.

- **Innan du säger "klart" på en logik-/analys-ändring:** kör projektets tester och se
  att de går igenom. <!-- fyll i: testkommando, t.ex. `npm run test:all` -->
  (Ren GUI-/styling-ändring utan logik → typecheck + visuell koll räcker.)
- **Varje fixad bugg får ett regressionstest** – helst på den rena logiken (billigt,
  deterministiskt).
- **Låt aldrig testerna ringa ut på nätet.** Härma svaren från externa tjänster med
  påhittad testdata i stället – annars går testerna sönder när någon annans tjänst gör det.
<!-- webapp-kit:slut tester -->

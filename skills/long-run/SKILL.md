---
description: Spelbok för ett stort eller obevakat batch-pass som drivs av subagenter — en subagent per post i eget context så huvudloopen hålls lätt, tiers A/B, adversariell verifiering och circuit-breaker. Trigga på ett stort fler-posts-jobb, "nattkörning", "long run", eller när en batch är för stor för att köras i ett enda context-fönster.
---

# Long run (subagent-driven batch)

För en **stor eller obevakad** körning: en lång autonom session som lutar sig på **subagenter** (en per post) för att räcka långt utan att spränga context. Bygger på batch-skillens dashboard + kö-format; det här är harnessen ovanpå.

> **Gränsen mot `webapp-batch` — läs den innan du lägger till något här.**
> **Den här filen äger KÖRMEKANIKEN:** hur agenterna startas, verifieras och överges. Subagent per post, tiers A/B, adversariell verifiering, circuit-breaker, körordning efter förlust vid avbrott, reservlista och svanspost, säkerhet vid obevakad körning.
> **`webapp-batch` äger PROCESSEN:** urvalswidget, ordningsförslag som grind, dashboard, DoD per post, grenar och commits, testfall, doc-hygien-grind, batch-kö.
> Tumregel: rör ändringen **hur agenterna arbetar** hör den hit; rör den **vad användaren ser eller bestämmer** hör den i `webapp-batch`.
> De två är lager, inte alternativ: en batch drivs som förval av den här spelboken, och användaren behöver aldrig be om subagenter separat. En liten batch som uppenbart ryms i ett context-fönster kan köras inline — då är den här filen overkill.
> ⚠️ **Ändringar som spänner över båda måste landa på båda ställena.** Det har redan gått fel en gång: reservlistans *regel* skrevs här medan widgetens *kontroll* för den glömdes i `webapp-batch`, så specen sa "kryssruta" medan widgeten hade tre lägen. Skriv aldrig bara halva mekanismen.

## Verifiera förutsättningar FÖRST (30 s)
1. **Gren:** stå på batch-grenen `batch/<datum>`. Committa allt här. **Aldrig huvudgrenen. Aldrig `git push`.**
2. **Servrar uppe:** projektets dev-/backend-server svarar (starta om vid behov). Annars stallar poster.
3. **Worklist:** läs batchen ur `docs/batch-queue.md` (Tier A + Tier B). Grundprocess: batch-skillen.
4. **Dashboard:** skapa/öppna live-dashboarden (batch-skillens mall), `status:"running"`, auto-döp "Operation …".
5. **Saknas något av 1–4?** Säg det innan du startar, inte efteråt. Inget git-repo → kör utan grenar/commits och skriv det i rapporten. Ingen `docs/batch-queue.md` → bygg kön ur det användaren räknat upp. Inga doc-roll-filer → hoppa doc-hygien-svepet och **redovisa att det hoppades**; ett obevakat pass är fel tillfälle att införa ett dokumentsystem användaren inte bett om.

## Harness — subagent per post (bevara huvud-context)
För **varje** post: spawna en **`batch-worker`-subagent** (`Agent`-verktyget) i eget context-fönster som gör hela posten och returnerar en **kort sammanfattning** (+ filer + verify-resultat). Huvudloopen håller bara sammanfattningarna → context växer långsamt.

### ⚠️ Returtexten är ett smalt rör — leveransen ska till DISK

**Bara en agents SISTA meddelande når orkestratorn.** Allt den skrivit tidigare i sin egen loop
är borta när den avslutar, och agenter avslutar gärna med en kvittens i stället för med sitt
resultat. Därför gäller, för **varje** subagent oavsett typ:

> **Är leveransen mer än en mening — skriv den till en fil och returnera sökvägen plus tre rader.**
> Skriv den **löpande medan arbetet pågår**, inte som sista handling: då överlever den även att
> agenten dör mitt i.

⚠️ **Regeln fanns men bodde på fel ställe, och det kostade två gånger.** Den stod bara i
`agents/batch-worker.md`, alltså i EN agents definition — så den skyddade `batch-worker` och
ingenting annat. Utfallet:

- **2026-08-01→02:** tre `batch-worker` i rad returnerade ett enda ord — *"Väntar."*,
  *"Inväntar instruktion."*, *"Klart."* — efter 20–40 minuters arbete och hundra verktygsanrop.
  Koden fanns i trädet, redovisningen var borta. Regeln skrevs då in i `batch-worker.md`.
- **2026-08-11:** tre `Explore`-agenter i ett doc-svep gjorde samma sak — *"Klart."*,
  *"rapporten står i mitt första svar"* — efter 425 k tokens och 137 verktygsanrop. De bär inte
  `batch-worker`s definition, så regeln fanns inte för dem. En av dem upprepade kvittensen även
  efter en uttrycklig uppmaning att redovisa; först när uppdraget bytte till *"skriv rapporten
  till `reports/doc-svep-B.md`"* kom resultatet fram.

- **2026-08-18:** en `general-purpose`-granskare returnerade *"Klart."* och — efter en uttrycklig
  begäran om hela rapporten — *"Slutförd."*. Två gånger, samma agent, 160 k tokens och 64
  verktygsanrop bakom sig. Först när uppdraget löd *"skriv rapporten till `<sökväg>.md`, svara
  sedan med enbart KLART"* kom innehållet fram. Den var startad **utanför** ett batch-pass, så
  varken den här filen eller `batch-worker.md` lästes av någon.

**Det är samma klass av fel som 0.1.16** (*"verifierar-steget kördes noll gånger av tolv, för att
regeln bodde i en fil ingen läste"*): rätt regel, fel hemvist. Tre gånger i rad har lösningen varit
att flytta regeln ett steg utåt — och den fjärde hemvisten är den enda som fyrar oavsett vem som
delegerar och varför:

> **`bin/batch-guard.mjs` (PreToolUse på `Agent`) prövar numera VARJE subagenttyp**, inte bara
> `batch-worker`: ser prompten ut att beställa en text-leverans utan att peka ut en fil, påminner
> hooken i samma ögonblick som agenten startas. Den blockerar aldrig. Det är först här regeln
> ligger framför den som faktiskt kan följa den, vid det enda tillfälle då det är gratis att göra rätt.

**Skriv ändå regeln i uppdraget varje gång du delegerar till något annat än `batch-worker`** —
hooken är ett skyddsnät, inte en ersättning, och `Explore`/`general-purpose` kan inte läsa den
härifrån. Observera också att `Explore` **inte kan skriva filer** (ingen `Write`/`Edit`); ska en
granskare leverera en rapport till disk måste den vara `general-purpose`.

- **Sekventiellt för fil-rörande poster** — undvik att två subagenter skriver samma fil samtidigt.
- **Parallellt för read-only-poster** (research, audit, deep-research) — inga fil-krockar → kör flera på en gång.

⚠️ **Men trappa upp parallelliteten försiktigt när varje agent driver en egen webbläsare**
(puppeteer, MCP-browser) eller annan tung extern process. I en verklig körning startades
**sju** bildgranskare samtidigt och **fem dog** — alla med `API Error: Connection closed
mid-response`, **alla direkt vid start**, ingen efter att ha börjat arbeta. Det är
felsignaturen: dör agenter i klump i uppstarten, och särskilt när de var och en startar en
tung process, är det för mycket på en gång.

Detta är en **observation, inte ett tak** — orsaken kan vara transient och försvinna. Så:
börja bredare om du vill, men **känn igen signaturen och backa till 2–3 samtidiga och kör
om** när den dyker upp. Räkna aldrig en agent som dog i uppstarten som "granskad" — dess
del är **ogjord**, och det ska bokföras som det (se nedan).

**Bokför ogjort arbete som ogjort.** En granskning som aldrig kördes får inte se ut som en
som blev godkänd. Skriv in de överhoppade delarna i backloggen med namn, så att nästa
session ser att loopen inte är fullbordad.

## Körordning — det som förlorar mest vid ett avbrott går först

Avbrottsrisken (slut kvot, kraschad agent, stängd session) är ungefär jämnt fördelad
över passet, men **förlusten** är det inte: den är proportionell mot hur mycket
ocommittat arbete som är i luften när det smäller. En subagents context dör med den.

Sortera därför posterna efter **hur mycket som går förlorat om de avbryts i ett
slumpmässigt ögonblick** — och notera att det är *atomicitet*, inte storlek, som är den
egentliga variabeln. Storlek korrelerar bara med den:

- **Först:** poster som måste landa hela för att vara värda något — refaktoriseringar,
  omskrivningar som rör många filer, allt där halvvägs är värdelöst.
- **Sist:** poster som **degraderar mjukt** — granskningar och utredningar som skriver
  sina fynd till disk löpande (se verifierar-steget ovan) förlorar nästan ingenting
  oavsett när de dör, och små avgränsade fixar kostar lite att göra om.

Två saker slår över regeln:

1. **Beroendeordning vinner alltid.** En liten post som låser upp tre stora ska ligga
   först även om den är liten. (Verklig regel ur ett projekt: *modellen före bilden,
   kravtexten före ritandet* — bilden följer modellen, aldrig tvärtom.)
2. **Stora poster har högre varians.** Startar du det största jobbet först och det äter
   60 % av budgeten sitter du med *en* klar sak i stället för fem. Regeln gäller
   avbrottsrisk, inte "satsa allt på det största först" — bedöm att posten **ryms**
   innan du lägger den överst.

Den starkaste åtgärden är dock inte ordningen utan att **göra stora poster
checkpointade**: committa per delsteg, håll verify grön efter varje, skriv ned fynd före
åtgärd. En stor post som checkpointar internt är nästan lika billig att avbryta som en
liten — och då spelar ordningen mindre roll.

## Ett pass får aldrig stå stilla — reservlista + svanspost

Den vanligaste förlusten i ett obevakat pass är **inte** att det avbryts för tidigt, utan
att det blir **klart** för tidigt: tre poster man trodde var svåra visar sig lätta, batchen
är klar efter tre timmar, och resten av natten går till spillo. Skattningar är dåliga och
blir det inte bättre — bygg därför passet så att det inte spelar roll.

**1. Reservlista, förhandsgodkänd.** Låt användaren markera poster som *"tas in om
batchen blir klar tidigt"* redan när batchen laddas. Då kan du plocka in dem kl. 04 utan
att väcka någon. Två regler följer av körordningen ovan: reserven körs **sist**, alltså när
avbrottsrisken är störst, så den ska bestå av **små och mjukt degraderande** poster — aldrig
en stor refaktorisering. Och bara **🟢 autonoma** poster får ligga där; ingen är vaken att
svara på en fråga.

**2. En svanspost som inte kan ta slut.** Reserven är ändlig. Avsluta därför alltid med ett
arbete som är obegränsat djupt, alltid värt att göra, aldrig kräver ett beslut och kan
avbrytas var som helst. Bra kandidater, i tur och ordning:

- **Granska passets egna commits adversariellt** (`git show <sha>` per post, se
  verifierar-steget). Den ger ofta mest av allt i hela passet — i en verklig körning gav
  tre sådana granskningar 22, 16 respektive 12 fynd, varav ett var ett kravbrott.
- **Beta av en stående lista med ogranskade delar** eller andra små bokförda fynd.
- **Utöka testtäckningen** på det passet just rörde.

**Hitta aldrig på ny scope kl. 04.** Svansposten ska vara *fördjupning av det som redan är
gjort*, inte nya funktioner — allt annat är ett beslut användaren inte fick ta. Skriv i
slutrapporten hur mycket tid som gick till reserv och svans, så att nästa batch kan laddas
bättre.

## Två tiers
- **Tier A — auto-verifierade (klart över natten):** subagenten gör jobbet och verifierar (projektets test/verify-kommando grönt / a11y-lint grön / rapport-fil finns) → huvudloopen **committar**. Klar utan människa.
- **Tier B — förslags-utkast (väntar sign-off):** subagenten bygger + self-verifierar (typecheck + tester + demo renderar utan fel + fångar **före/efter** via skärmdump) → committa → markera i dashboarden som **"väntar din sign-off"**. Verifiera **inte** interaktivt — det gör människan på morgonen.

## Verifierar-steg (för Tier A-kod)
Innan commit av en Tier A-**kod**post: låt en **andra subagent** adversariellt dubbelkolla ändringen (leta buggar/regressioner, kör verify själv). Gör om vid fynd.

**Granska COMMITEN, inte arbetsträdet.** Committa posten först och peka granskaren på
`git show <sha>` — då kan granskningen köra **parallellt med nästa post** utan att de två
trampar på varandra. Granskar den trädet måste allt annat stå still, och verifieringen
kostar wall-clock i stället för att vara gratis. Instruera granskaren uttryckligen:
ändra inga filer, kör ingen skrivande git, och kör **inte** testsviten (trädet är i
rörelse — ett rött resultat vore någon annans arbete, inte ett fynd). Den får läsa vad som
helst, greppa, hämta källor och räkna för hand.

**Verifiera den föreslagna ÅTGÄRDEN, inte bara fyndet.** Ett fynd är en hypotes — men
åtgärdsförslaget är också en hypotes, och den prövas nästan aldrig. I en verklig körning
föreslog en granskare en ny formel för symbolstorlek; prövad i bild tog den bort en hel
funktion (en av två portar på ett dubbelgarage försvann), alltså bröt den ett krav för att
laga ett annat. Åtgärdsposten avvisade två av tolv fynd på det sättet, med mätning. Låt
därför den som åtgärdar **pröva förslaget i artefakten** och säga rakt ut när den inte
håller med — en granskare som lyds blint är lika farlig som en som ignoreras.

**Skriv ned fynd till disk LÖPANDE, inte till sist.** Så fort ett fynd är bekräftat: in i
backloggen eller kravtexten, **innan** åtgärden påbörjas. Då lämnar varje avbrott — slut
kvot, kraschad agent, stängd session — antingen en rättad bugg eller en bokförd sådan,
aldrig ett halvfärdigt träd. Åtgärda i storleksordning **liten först**, och håll verify
grön efter varje enskilt fynd i stället för bara till sist.

**Bär mätvärdena i commit-meddelandet.** Talen som togs fram i posten — kronor före/efter,
uppmätta pixlar, antal tester — ska stå i commiten, inte bara i agentens rapport. Rapporten
försvinner med sessionen; commiten blir kvar och är det underlag doc-hygienen och nästa
sammanfattning hämtar ur. Det gör slutrapporten billig och gissningsfri.

## Circuit-breaker
**2 test-fel i rad** på samma post → **lämna posten** (sätt den gul/notera i dashboarden med vad som fastnade), gå vidare. Halta aldrig hela passet för en post.

## Arbetsbudget — passet ska ta slut på DIN signal, inte på kontots

Ett pass som kapas mitt i en post förlorar mer än posten: dashboarden står halvfärdig, arbete är ocommittat, och nästa session ärver ett träd ingen kan tolka. Det är den dyraste utgången som finns, och den är helt förebyggbar — gränserna går att läsa av i förväg.

**Du får siffrorna injicerade, du behöver inte fråga efter dem.** En rad som börjar med `[arbetsbudget]` kommer vid varje ny prompt, efter varje subagent, och under autonomt arbete så fort läget ändrats. Den bär orkestratorns context-fönster, femtimmarsfönstret (med återställningstid och en framskrivning av takten) och veckoförbrukningen. Behöver du den på begäran: `$CLAUDE_PLUGIN_ROOT/bin/runtime-status.py --show`.

**Och vid varje ny `batch-worker` säger `batch-guard` till** om läget kräver det. Tre lägen, och de betyder olika saker:

| Läge | Villkor | Vad du gör |
|---|---|---|
| **kör** | inget av nedanstående | Starta nästa post fritt. |
| **ryms** | 5h ≥ 75 % · takten når taket inom 45 min · orkestratorns context ≥ 75 % · **veckan ≥ 85 %** | Starta **bara** en post som hinner bli klar och committad. Välj kort framför stor. |
| **avsluta** | 5h ≥ 90 % · takten når taket inom 20 min · orkestratorns context ≥ 85 % · **veckan ≥ 95 %** | **Starta ingen ny post.** Gå över till avslutsprotokollet nedan. |

⚠️ **Veckan är den hårdaste av de tre, och den kom in sist.** Femtimmarsfönstret rullar om, och context går att avlasta med subagenter — veckan har ingen redovisad återställning alls, så det finns inget "vänta ut den". Tar den slut mitt i ett nattpass är passet över där det står. Den saknades i `batchbeslut()` fram till 2026-08-01: verdiktet räknades bara på context och 5h, så en vecka på 97 % gav `kör`. Trösklarna ägs av `band_vecka()` i `bin/runtime-status.py`.

⚠️ **Avslutet är inte gratis — det är själva poängen med tröskeln.** Frysa dashboarden, före/efter-grinden, doc-hygien-GATE:n, cache-rensningen, starta servrar och verifiera länklistan: tiotals minuter. Börjar du när mätaren står på noll blir det inget avslut alls. Reserven är satt till **20 minuter** och är en *uppskattning* — kalibrera den mot verkliga avslut och justera `AVSLUTSRESERV_MIN` i `bin/runtime-status.py`.

⚠️ **Doc-hygien-svepet har ett eget golv inuti den reserven — det är den del som alltid offrades.** Svepet ligger sist och är det enda steget vars utebliven körning inte syns någonstans: en fryst dashboard som saknas märks direkt, ett osvept `Project_state.md` märks först flera sessioner senare. **Räkna det som ~5 av de 20 minuterna och starta dess subagent FÖRE cache-rensningen och länklistan** — de två går att göra på en minut var, svepet gör det inte. Ryms det ändå inte: hoppa det **helt** och skriv ut att det är ogjort, i både `state.md` och slutrapporten. Halvt svept är den enda utgång som är värre än osvept.

**Avslutsprotokoll när läget slår om till `avsluta`:**

1. **Committa allt som är klart**, per post med explicit fillista (aldrig `git add -A` när flera agenter kört).
2. **Sätt kvarvarande poster till `waiting`** i `-data.js` och frys dashboarden med den status den faktiskt har. En post som ser `running` ut i en fryst rapport är en lögn nästa session får betala för.
3. **Skriv `reports/<bas>-state.md`** — körordning, vad som är gjort, nästa `waiting`-post, "så här återupptar du". Kör subagenter fortfarande: be var och en om en WIP-överlämning först.
4. **Resten av avslutet enligt `webapp-batch`-skillen** — före/efter-grind, doc-hygien-GATE, cache-rensning, länklistan sist.
5. **Säg i slutrapporten att passet avslutades på budget**, inte för att listan tog slut, och vilka poster som blev över. En rapport som inte skiljer på "klart" och "hann inte" är oanvändbar för planeringen av nästa batch.

⚠️ **Vakten blockerar aldrig, och den vet inte allt.** Den kan inte se hur stor nästa post är, bara hur mycket budget som finns. Är posten liten och läget `ryms` — kör. Är avslutet redan gjort och detta är en medveten extrapost — kör. Beslutet är ditt; hooken ser bara till att du fattar det med siffrorna framför dig.

⚠️ **Tystnad betyder "oförändrat", inte "gott om budget".** Injektionen stryps för att inte kosta tokens. Vid tveksamhet, fråga mätaren.

## DoD per post
- Logik rörd → projektets test/verify-kommando grönt (uppdatera delad fixtur/golden data om svarsform/logik ändrats).
- GUI → typecheck + token-lint + före/efter-skärmdump.
- **Committa per klar post** (Tier A) eller per klart utkast (Tier B). Circuit-breakade poster committas inte.

## Autonomi & säkerhet
Obevakad körning ska köras under **smal allowlist, ingen bypass** av permission-systemet. Frågar en ofarlig rutin ändå → det är en **säker stall**: hoppa posten, notera, gå vidare. Full obevakad körning med utökade rättigheter hör hemma i en **sandlåda** (VM/container/separat konto), aldrig på en personlig huvudmaskin — och är då ett eget beslut.

## Retrospektiv-data
Varje subagents slutnotis bär `duration_ms` + `subagent_tokens` — **fånga dem per post** (stämpla `t0` när
posten startar, sätt `t1 = t0 + duration_ms` och `tokens = subagent_tokens` i `-data.js`). De driver
"Så gick körningen"-sektionen (stats + tyngsta jobbet + tidslinje) i slutrapporten. Se webapp-batch-skillen.

## Slut
När allt är gjort eller sessionen når sitt tak: **frys dashboarden**, lägg testfallen sist (måste/får-gärna), skriv en kort status i `-data.js`. Committa allt på grenen. Leverera resultatet enligt breakfast-report-skillen (bara sökvägen i chatten).

**Mergen skjuts upp till morgon-reviewen** i ett obevakat pass — Tier B behöver sign-off först, och ogranskat arbete hör inte hemma på huvudgrenen.

⚠️ **Doc-hygien-svepet skjuts INTE upp. Rättat 2026-08-11 — den här raden sa tidigare motsatsen, och det kostade riktig drift.**
Fram till dess stod här *"för ett obevakat pass: gör inte doc-hygien-sweepen/mergen automatiskt — lämna det till morgon-reviewen"*, medan avslutsprotokollet **fyrtio rader upp** räknade upp doc-hygien-GATE:n som ett steg som ska köras, och `webapp-batch` kallade den *"en GATE, inte på-begäran"*. Tre ställen, två motsatta besked, och vid ett nattpass vann det här stycket eftersom det står under rubriken **Slut**. Följden: svepet sköts till en "morgon-review" som **varken har ägare eller trigger**, och användaren fick trigga en grundlig städning manuellt gång på gång — och den hittade varje gång sådant batch-slutet skulle ha tagit. Två mätta exempel 2026-08-11: ett backlog-item (`B7`) låg kvar fastän det byggts flera batchar tidigare, och `Project_state.md` pekade fortfarande på en batchordning som var överspelad.

**Så körs det i stället — som en subagent med RENT context, aldrig inline:**

- Orkestratorn är som tunnast just här, och svepet är läsning av fem filer. Att lägga det i huvudloopens sista tiondel är att garantera att det komprimeras.
- **Den som sveper får inte vara den som skrev texten.** En agent läser sitt eget material som korrekt — samma mekanism som gjorde att fyra av sex poster i ett verkligt pass underkändes av en oberoende granskare, *ingen på beteendet, alla på redovisningen*. Ge svepagenten batchens commit-shas och inget annat sammanhang, och låt den läsa doc-filerna med nya ögon.
- **Svepet har ett eget budgetgolv.** Ryms inte både svepet och resten av avslutet: frys dashboarden, committa, och lämna svepet **ogjort och utskrivet som ogjort** i `reports/<bas>-state.md` + slutrapporten. Ett svep som halvkörts är värre än ett som är bokfört som ej gjort, eftersom det ser gjort ut.

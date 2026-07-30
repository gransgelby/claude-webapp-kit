---
description: Spelbok för ett stort eller obevakat batch-pass som drivs av subagenter — en subagent per post i eget context så huvudloopen hålls lätt, tiers A/B, adversariell verifiering och circuit-breaker. Trigga på ett stort fler-posts-jobb, "nattkörning", "long run", eller när en batch är för stor för att köras i ett enda context-fönster.
---

# Long run (subagent-driven batch)

För en **stor eller obevakad** körning: en lång autonom session som lutar sig på **subagenter** (en per post) för att räcka långt utan att spränga context. Bygger på batch-skillens dashboard + kö-format; det här är harnessen ovanpå.

## Verifiera förutsättningar FÖRST (30 s)
1. **Gren:** stå på batch-grenen `batch/<datum>`. Committa allt här. **Aldrig huvudgrenen. Aldrig `git push`.**
2. **Servrar uppe:** projektets dev-/backend-server svarar (starta om vid behov). Annars stallar poster.
3. **Worklist:** läs batchen ur `docs/batch-queue.md` (Tier A + Tier B). Grundprocess: batch-skillen.
4. **Dashboard:** skapa/öppna live-dashboarden (batch-skillens mall), `status:"running"`, auto-döp "Operation …".

## Harness — subagent per post (bevara huvud-context)
För **varje** post: spawna en **`batch-worker`-subagent** (`Agent`-verktyget) i eget context-fönster som gör hela posten och returnerar en **kort sammanfattning** (+ filer + verify-resultat). Huvudloopen håller bara sammanfattningarna → context växer långsamt.

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
När allt är gjort eller sessionen når sitt tak: **frys dashboarden**, lägg testfallen sist (måste/får-gärna), skriv en kort status i `-data.js`. För ett obevakat pass: **gör inte** doc-hygien-sweepen/mergen automatiskt — lämna det till morgon-reviewen (Tier B behöver sign-off först). Committa allt på grenen. Leverera resultatet enligt breakfast-report-skillen (bara sökvägen i chatten).

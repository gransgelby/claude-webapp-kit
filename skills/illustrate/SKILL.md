---
description: Rita en illustration, figur, ritning, diagram, ikon, symbol eller SVG-scen med hög professionell kvalitet — korrekthet, tydlighet och skönhet, via en visuell specifikation och en granskningsloop i flera renderingslägen. Trigga närhelst något ska ritas eller genereras som bild i kod (SVG, canvas, diagram, husritning, kartfigur, symbol), och när en befintlig illustration ska bedömas eller förbättras. Gäller även när flera agenter ritar olika delar av samma bild.
---

# Rita — korrekthet, tydlighet, skönhet

**Detta är standardförfarandet närhelst något ska ritas, om inget annat anges.** Det gäller
en husritning i SVG lika mycket som ett diagram, en ikon, en symbol eller en genererad scen.
En illustration som "kör" är inte klar; den är klar när **bilden** håller.

De tre kvalitetsmålen, i den ordning de väger när de krockar:

1. **Korrekthet** — bilden visar det som faktiskt gäller, och ingenting annat. Den ritar
   inget som underlaget inte bär. En detalj utan täckning i data är ett antagande i
   bildform, och det är den värsta av de tre bristerna eftersom den inte syns som en brist.
2. **Tydlighet** — bilden går att läsa. Det som ska skiljas går att skilja; det som hör
   ihop läses ihop.
3. **Skönhet** — bilden är trevlig att titta på. Det är ett riktigt mål, inte en dekoration:
   en ful figur läses mindre noga, och en vacker figur får förtroende.

## Stegen

### 1. Räkna ut vad som ska ritas
Lista **alla** utseenden, scener och varianter figuren måste klara — inte bara det typiska
fallet. För en husritning: varje taktyp, varje husform, varje kombination som datamodellen
tillåter, tomma och extrema värden, en byggnad och många. Listan är leveransen i steg 1;
utan den granskas bara det fall man råkade rita först.

### 2. Researcha hur det brukar ritas
Titta på hur andra löser samma bild — konventioner, standarder, förlagor, referensbilder.
Syftet är **guidning och inspiration**, inte auktoritet: en konvention får aldrig citeras som
skäl om den inte lästs. Har källan inte gått att läsa, skriv att den inte gått att läsa.
Krockar konventionen med hur bilden faktiskt ser ut vinner bilden — men **skriv ned
avvikelsen med skäl**, annars återinförs regeln av nästa ändring.

Referenser kommer i tre slag som lätt blandas ihop: **fakta** (hur motivet är byggt),
**stil** (linjekvalitet, detaljnivå, förenkling, färgmodell) och **material/ljus** (hur glas,
lackerad plåt och trä beter sig). Skilj dem åt, och skriv en rad per referens:

| Referens | Slag | Vad som ska överföras | Vad som INTE ska kopieras |
|---|---|---|---|

Sista kolumnen är hela poängen: uppgiften är att **extrahera observerbara designregler**,
inte att rita något som liknar referensen.

### 3. Skriv den visuella specifikationen — före första path
Att börja med paths ger en bild som växer nedifrån och blir en stapel dekorationer. Fastställ
först, i text: **bildyta och avsedd visningsstorlek · projektion och betraktningsvinkel ·
kompositionens fokuspunkt och läsordning · ljusriktning, mjukhet och skuggriktning ·
djupplanen bakifrån och fram · materialbehandling per material · vad som medvetet ska lämnas
enkelt.** För organiska motiv även: primära silhuetter, stora volymer, negativa ytor och
överlappningar.

Specifikationen är inte byråkrati — det är där de bindande upptäckterna görs. *(Uppmätt
exempel: en deklarerad ljusriktning på kubdiagonalen visade sig **binda kameravinkeln**, för
två av kubens fyra diagonaler ger en helt platt bild där alla synliga ytor blir lika belysta.
Det upptäcktes för att ljuset skrevs ned före ritandet; hade bilden ritats först hade valet
rationaliserats i efterhand.)*

### 4. Rita ett förslag
Bygg det i kod, mot projektets tokens och konventioner. Inga hårdkodade färger, inga
magiska tal utan namn.

**Strukturera för att kunna rättas.** En enda hög av paths går inte att laga utan att något
annat går sönder. Ge bilden semantiska grupper med stabila `id` — bakgrund, kastskuggor,
huvudmotivets primära volymer, sekundära former, materialskuggning, ytdetaljer, dagrar,
etiketter — och håll geometri skild från utseende där det är rimligt. Då kan ett dörrhandtag
rättas utan att karossen rubbas.

### 5. Granska förslaget
**Rendera och titta på bilden** — läs den som en bild, inte som kod. Bedöm mot korrekthet,
tydlighet och skönhet, **och mot illustrationens syfte**: vad ska betraktaren förstå på tre
sekunder? Rendera de lägen steg 1 räknade upp, inte bara ett.

Granska genom **flera renderingslägen av samma bild** — se nästa avsnitt. Ett enda normalläge
granskar bilden i det läge där den ser bäst ut.

### 6. Åtgärda fel och fulheter
Rätta det granskningen hittade — **i felordningen nedan** — och gå tillbaka till steg 4.

## Granskningslägen — ett kommando, inte en föresats

`bin/granska-bild.mjs` producerar lägena och en kontaktkarta. **Kör det där det ligger** —
`${CLAUDE_PLUGIN_ROOT}/bin/granska-bild.mjs`. Kopiera det INTE in i projektet: sedan 0.1.21
slås `puppeteer-core` upp från projektet (`npm i -D puppeteer-core` i projektroten räcker),
och en kopia utan sin syskonfil `krav-puppeteer.mjs` dör med precis den råa Node-stack som
den filen skrevs för att eliminera.

```
node "${CLAUDE_PLUGIN_ROOT}/bin/granska-bild.mjs" --url http://localhost:3000 --selector "svg" \
  --ut granskning/ --utsnitt "0,10,45,70"
```

Varje läge fångar en felklass de andra döljer:

| Läge | Avslöjar |
|---|---|
| **gråskala** | tonhierarkin utan kulör — håller bilden ihop i svartvitt? |
| **tröskel** | vad som faktiskt bär formen, och vad som bara är ton |
| **siluett** | form och komposition utan innehåll |
| **liten** (300 px) | visuellt brus — vad överlever nedskalning? |
| **spegel** | **obalans man blivit blind för.** Den enda som fångar tillvänjning |
| **ljus/mörk botten** | håller bilden mot papper, mot mörkt tema, i projektion |
| **utsnitt** | kurvor, anslutningar och det som är för litet att bedöma i helbild |

Zooma alltid in på det som är litet. En linje, en bock eller en symbol på 16 px går inte att
bedöma i en helsidesbild.

## Maskinella kontroller — det ögat inte gör

Billiga, och de fångar en annan felklass än perceptionen. Kör dem vid varje iteration.

```
node "${CLAUDE_PLUGIN_ROOT}/bin/granska-bild.mjs" --svglint bild.svg      # struktur
node "${CLAUDE_PLUGIN_ROOT}/bin/granska-bild.mjs" --diff a.png b.png      # skilda bildpunkter
```

`--svglint` letar dubbla `id`, brutna `url(#…)`-referenser, element helt utanför `viewBox`,
element som varken har fill eller stroke, nollstora element och orimligt nodrika paths.
Geometrin läses med `getBBox()` i Chrome — den riktiga, inte en gissning ur källtexten.

**Pixeldiffen är starkast på två lägen som SKA skilja sig**, inte bara mellan iterationer.
*"0 skilda bildpunkter"* mellan två inställningar som betyder olika saker är det hårdaste
bevis som finns för att en kontroll är osynlig. *(Uppmätta exempel: ett nästan tätt växthus
ritades pixelidentiskt med ett helglasat, och ett platt tak identiskt med ett pulpettak i
planvyn medan gavelarean skilde 82 kvm.)*

**Och en regel om texten kring bilden:** varje tal som står i en not, en bildtext eller en
kravtext ska räknas ur **samma konstant som ritar bilden**. Beskrivningen och bilden ska ha
en källa. *(Uppmätt: efter en justering av valörstegen stod tre hårdkodade kontrasttal kvar i
prosan och var fel — ett sade 2,90:1 där bilden gav 5,78:1.)*

## Felordning — grundformen före mikrodetaljen

Rätta i den här ordningen. **Det är förbjudet att lägga till mikrodetaljer så länge något fel
på nivå 1–5 är öppet.** Annars går tiden till gradienter och bultar medan grundformen är fel.

1. fel motiv eller konstruktion · 2. proportioner · 3. siluett och perspektiv ·
4. komposition · 5. ljus och volym · 6. material · 7. sekundära detaljer ·
8. dekorativa mikrodetaljer · 9. kodoptimering

Skilj på **fel** (bryter mot data eller krav), **svaghet** (svårläst eller ful men sann) och
**förslag**.

## När arbetet får avslutas

Loopa steg 4–6 tills **två** rundor i följd inte hittar något nytt av slaget fel eller
svaghet. En runda som hittar något följs alltid av en ny. Dessutom:

- inga öppna fel på nivå 1–5, och varje kvarvarande svaghet är en **utskriven medveten
  avvägning**, inte en olöst punkt
- de maskinella kontrollerna är gröna
- varje läge steg 1 räknade upp är faktiskt renderat och tittat på

**Tak: 8–12 iterationer.** Nås inte villkoren ska agenten rapportera **varför metoden kört
fast** — vilket fel som återkommer, vad som prövats, vad som skulle behövas. Att i det läget
påstå att resultatet är klart är förfarandets allvarligaste fel, eftersom det kostar
granskningen hela dess värde.

## När flera agenter ritar delar av samma bild

Följ förfarandet **först per agent, för sin egen del** — varje agent kör sina egna steg på
sin del i alla dess lägen. Sedan kör **orkestratorn samma förfarande på hela
illustrationen**, med alla delar samtidigt och i alla vylägen.

Skälet är inte formalia: delarna kan var för sig vara felfria och tillsammans ändå inte
bilda en bild. Det som bara syns i helheten är skala mellan delar, gemensam baslinje,
balansen i ytan, tomma fält, krockande etiketter och att två delar råkar använda samma
uttryck för olika saker. Ingen delagent kan se det.

Praktiskt för orkestratorn:
- Låt **en** agent rendera hela bilduppsättningen med ett **manifest** som säger vilket läge
  varje bild visar — då kan delgranskarna arbeta parallellt utan att slåss om dev-servern,
  och en granskare som inte vet vilket läge bilden visar kan ändå inte bedöma korrekthet.
- Ge varje delgranskare **läsrättigheter men ingen redigering**. Granskning och åtgärd i
  samma agent blir alltid åtgärd.
- **Granskaren ska inte se ritarens resonemang**, och helst inte koden i första vändan. Den
  får briefen, referenserna, den visuella specifikationen och de renderade bilderna. En
  granskare som läst motiveringen försvarar den; en som bara sett bilden bedömer bilden.
- Samla fynden, dedupera, och åtgärda i ett svep — sju agenter som drar i samma fil är en
  merge-konflikt, inte en loop.
- **Före/efter per iteration** sparas, så att utvecklingen går att se i efterhand och inte
  bara slutläget.

## Vanliga fel som loopen finns för att fånga

- En detalj ritas som saknar täckning i data (den vanligaste och allvarligaste).
- Två lägen ser identiska ut fastän de betyder olika saker — då är kontrollen i praktiken
  osynlig. **Pixeldiffa dem hellre än att lita på ögat.**
- Ett tal eller en etikett ser mer exakt ut än underlaget medger.
- Parallella linjer smetar ihop; text kolliderar med linjer; en symbol läses som något annat
  (ett takfönster i stället för solpaneler).
- Figuren fyller inte sin yta, eller delar av bilden ligger på olika baslinjer.
- Det som ska vara diskret skriker, och det som ska bära formen är för svagt.
- **Ritordningen är fel** — en yta målas över en annan som skulle legat framför. Syns bara i
  bild, aldrig i koden, och lika lätt att göra rätt som fel.
- **Prosan har glidit från bilden** — noter och kravtext beskriver en tidigare version.

## Två saker förfarandet medvetet INTE gör

- **Ingen poängsatt bedömningsmatris.** Självskattning på tiogradig skala är okalibrerad och
  glider uppåt; en modell som sätter betyg på sitt eget arbete sätter höga betyg. Fynd ska
  vara **binära och lokaliserade, med mätvärde** — *"takytan hoppar 0,76 m vid y = 4,01"*,
  inte *"djup: 8/10"*. Kriterielistan (material, ljus, djup, komposition, läsbarhet,
  stilkonsekvens) är värdefull som **svepschema**; skalan är det inte.
- **Ingen inbäddad rastertextur i en teknisk illustration.** För fri illustration är en hybrid
  rimlig. I en bild som ska vara sann mot data är en inbäddad textur ett visuellt påstående
  utan koppling till underlaget — samma fel som en utritad detalj utan täckning.

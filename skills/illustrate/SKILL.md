---
description: Rita en illustration, figur, ritning, diagram, ikon, symbol eller SVG-scen med hög professionell kvalitet — korrekthet, tydlighet och skönhet, i fem steg med en granskningsloop. Trigga närhelst något ska ritas eller genereras som bild i kod (SVG, canvas, diagram, husritning, kartfigur, symbol), och när en befintlig illustration ska bedömas eller förbättras. Gäller även när flera agenter ritar olika delar av samma bild.
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

## De fem stegen

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

### 3. Rita ett förslag
Bygg det i kod, mot projektets tokens och konventioner. Inga hårdkodade färger, inga
magiska tal utan namn.

### 4. Granska förslaget
**Rendera och titta på bilden** — läs den som en bild, inte som kod. Bedöm i tre delar:
korrekthet, tydlighet, skönhet, **och mot illustrationens syfte**: vad ska betraktaren
förstå på tre sekunder? Zooma in på det som är litet — en linje, en bock eller en symbol på
16 px går inte att bedöma i en helsidesbild. Rendera de lägen steg 1 räknade upp, inte bara
ett.

### 5. Åtgärda fel och fulheter
Rätta det granskningen hittade — och **gå tillbaka till steg 3**.

**Loopa 3–5 tills ingen ny brist hittas.** En runda som inte hittar något är villkoret för
att vara klar; en runda som hittar något är alltid följd av en ny runda. Skilj på **fel**
(bryter mot data eller krav), **svaghet** (svårläst eller ful men sann) och **förslag**.

## När flera agenter ritar delar av samma bild

Följ förfarandet **först per agent, för sin egen del** — varje agent kör sina egna steg 1–5
på sin del i alla dess lägen. Sedan kör **orkestratorn samma förfarande på hela
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
- Samla fynden, dedupera, och åtgärda i ett svep — sju agenter som drar i samma fil är en
  merge-konflikt, inte en loop.
- **Före/efter per iteration** sparas, så att utvecklingen går att se i efterhand och inte
  bara slutläget.

## Vanliga fel som loopen finns för att fånga

- En detalj ritas som saknar täckning i data (den vanligaste och allvarligaste).
- Två lägen ser identiska ut fastän de betyder olika saker — då är kontrollen i praktiken
  osynlig.
- Ett tal eller en etikett ser mer exakt ut än underlaget medger.
- Parallella linjer smetar ihop; text kolliderar med linjer; en symbol läses som något annat
  (ett takfönster i stället för solpaneler).
- Figuren fyller inte sin yta, eller delar av bilden ligger på olika baslinjer.
- Det som ska vara diskret skriker, och det som ska bära formen är för svagt.

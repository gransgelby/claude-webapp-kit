# Dashboard v2 — från stale progressbar till levande arbetsflöde

> **Roll:** plan för nästa version av batch-dashboarden (`templates/batch-dashboard.html`).
> Inkommet från Andreas 2026-07-27, under App-projektet UI-batch. Inget av detta är byggt.

---

## 1. Problemet, formulerat av användaren

> *"Eftersom arbetet med varje separat task i batchen är icke-deterministiskt är det svårt
> att skapa en grafisk progressbar som växer sakta och när den är i mål är tasken klar. Som
> det är nu är den enda dynamiska informationen löpt arbetstid och vilka tasks som är
> gjorda, pågår eller är färdiga. Det är ganska lite uppdateringar för en 5 timmar lång
> batch med 10 tasks."*

Och syftet, lika tydligt uttalat:

> *"Själva syftet med en progressbar eller nån annan visuell feedback på framdrift är att
> mitigera användarens otålighet genom att lagom ofta visa vad som händer och visa hur man
> steg för steg tar sig närmare slutet. Tiden det tar att slutföra en batch ändras inte, men
> användaren får lite 'medicin' mot sin otålighet."*

**Konsekvens för designen:** en progressbar som inte kan vara sann ska inte finnas. Det som
*är* sant och färskt är vad agenten just nu gör och vad den nyss producerat — inklusive de
små bilderna (skärmdumpar, illustrationsiterationer) som ändå skapas under arbetet.

## 2. Ny layout

- **Vänsterkolumn:** alla batchens poster i körordning, färgade efter status. Klickbara.
- **Högerytan:** allt som händer **nu** i den eller de poster som pågår.
  - Pågående poster tar **mer** plats än köade och klara.
  - **Ingen progressbar** för en pågående post.
  - Granulär, naturlig text om vad som görs just nu: *"Ritar hur mansardtak ska se ut för
    L-hustyper …"* — inte teknisk loggtext, inte filnamn och radnummer.
  - **De PNG:er som skapas under aktiviteten visas när de skapas** (illustrations-
    iterationer, skärmdumpar). Det är den bästa "medicinen": något nytt att titta på var
    några minuter, som dessutom visar riktig framdrift.
  - När ett delsteg blir klart förklaras nästa.
- **Klick på en avklarad post** → högerytan visar **loggen** från när den kördes: alla
  aktivitetstexter i ordning plus de bilder som togs. Så kan man lämna datorn en timme,
  komma tillbaka och läsa vad som faktiskt hände — inte bara se en enda före/efter-bild.

## 3. Per-post-mätare (kan byggas före resten)

- **En klocka per post** som räknar medan posten pågår och står **kvar med sluttiden** när
  den är klar.
- **Tokens och antal subagenter per post**, live under körning om det går, annars vid klart.
- **Totalt antal tokens för hela batchen**, löpande.

Datan finns redan delvis: `t0`/`t1`/`tokens` per post driver retrospektiven i dag, men bara
**efter** frysning. v2 ska visa dem **under** körningen.

## 4. Vad detta kräver av dataformatet

Dagens `-data.js` bär ett `activity`-fält (en rad text) per post. v2 behöver i stället en
**händelselista** per post:

```js
{ id: "R2", t: "Ritningen: taktyper", phase: "active",
  t0: 1785…, tokens: 190574, subagenter: 1,
  händelser: [
    { tid: 1785…, text: "Räknar ut vilka takvarianter som behöver ritas" },
    { tid: 1785…, text: "Ritar mansardtak för L-hustyper", bilder: ["img/r2-mansard-1.png"] },
    { tid: 1785…, text: "Granskar förslaget — nocken möts inte i inre hörnet" },
    { tid: 1785…, text: "Åtgärdat, ritar om", bilder: ["img/r2-mansard-2.png"] }
  ] }
```

Skalet renderar den listan i högerytan för pågående poster och som logg för klara. Bilderna
läggs i batchens `<bas>-img/` som vanligt (inte base64 — de blir många).

**Orkestratorns ansvar blir större:** varje subagent måste rapportera sina delsteg och sina
bilder löpande, inte bara i slutrapporten. Det bör skrivas in i `webapp-batch`- och
`long-run`-skillarna som ett krav på subagent-prompten, annars finns ingen data att visa.

## 5. Bedömning

Fungerar det? **Ja, och det är rätt problem som angrips.** Tre saker att veta innan det byggs:

1. **Händelselistan är den svåra delen, inte layouten.** Kvaliteten står och faller med om
   subagenterna faktiskt rapporterar löpande. Det är ett prompt- och skill-krav, inte HTML.
2. **Bilderna gör mest nytta per krona** — de kommer ändå att skapas i design-/rit-arbete,
   och de kräver ingen ny disciplin utöver att skriva sökvägen till dashboarden.
3. **Klockan, tokens och subagent-räknaren kan byggas direkt** i nuvarande skal, utan att
   layouten görs om. Rimlig ordning: (a) per-post-mätare i dagens skal, (b) händelselista +
   bilder för pågående post, (c) den nya två-kolumnslayouten med logg för klara poster.

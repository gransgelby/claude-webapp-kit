// EXEMPEL som följer med webapp-kit — visar hur en färdig resultatsida ser ut.
// Det här är inte en riktig körning; tiderna och talen är påhittade men konsekventa.
window.__applyBatch({
  "status": "done",
  "name": "Operation Kokbok",
  "nameWhy": "EXEMPEL — en påhittad körning som följer med webapp-kit, så att du kan se hur en färdig rapport ser ut. Namnet: batchen samlade ihop allt som gjorde receptlistan användbar, som när lösa recept binds ihop till en kokbok.",
  "saying": "Den som gapar efter mycket mister ofta hela stycket — så vi tog fyra saker, inte fjorton.",
  "bgId": "exempel-batch",
  "prevDone": [],
  "updated": "Alla fyra punkter klara. Appen kan spara, visa, söka — och den ser trevlig ut.",
  "status_note": "Det här är ett EXEMPEL som följer med webapp-kit, inte en riktig körning. Så här ser sidan ut när ett jobb är klart.",
  "bgCaption": "(exempelrapport — inga bakgrundsbilder)",
  "tests": {
    "must": [
      {
        "id": "T1",
        "t": "Spara ett recept",
        "steps": "Öppna appen, skriv ett namn och en tid i formuläret och tryck Spara.",
        "expect": "Receptet dyker upp som ett nytt kort längst ned i listan, och antalet uppe till höger ökar med ett."
      },
      {
        "id": "T2",
        "t": "Sök bland recepten",
        "steps": "Skriv \"pann\" i sökfältet.",
        "expect": "Bara Pannkakor blir kvar i listan. Radera texten och alla kommer tillbaka."
      }
    ],
    "nice": [
      {
        "id": "T3",
        "t": "Testa på telefon",
        "steps": "Öppna samma adress i mobilen.",
        "expect": "Korten ligger i en spalt och sökfältet fyller bredden."
      }
    ]
  },
  "items": [
    {
      "id": "R1",
      "t": "Spara ett recept från formuläret",
      "size": "medel",
      "phase": "done",
      "note": "Formuläret sparar nu receptet i webbläsarens minne och listan uppdateras direkt. Tomt namn ger ett vänligt felmeddelande i stället för en tyst miss.",
      "t0": 1755500000000,
      "t1": 1755501680000,
      "tokens": 41000
    },
    {
      "id": "R2",
      "t": "Visa recepten som kort i en lista",
      "size": "medel",
      "phase": "done",
      "note": "Varje recept blev ett kort med antal portioner, tid och en färgad etikett. Korten läggs i ett rutnät som blir en spalt på mobil.",
      "t0": 1755501680000,
      "t1": 1755504140000,
      "tokens": 63000
    },
    {
      "id": "R3",
      "t": "Sökfält som filtrerar medan man skriver",
      "size": "stor",
      "phase": "done",
      "note": "Sökningen filtrerar på både namn och etikett, utan att sidan laddas om. Hittas inget visas 'Inga recept matchar' i stället för en tom yta.",
      "t0": 1755504140000,
      "t1": 1755508760000,
      "tokens": 118000,
      "shots": [
        {
          "src": "exempel-batch-img/fore.png",
          "label": "FÖRE",
          "caption": "Listan innan sökfältet fanns — recepten låg direkt under rubriken."
        },
        {
          "src": "exempel-batch-img/efter.png",
          "label": "EFTER",
          "caption": "Sökfältet ligger nu överst med antalet recept till höger. Titta på avståndet mellan fältet och första kortet — det kommer ur samma avståndsskala som korten."
        }
      ]
    },
    {
      "id": "R4",
      "t": "Snyggare typografi och färger",
      "size": "liten",
      "phase": "done",
      "note": "Färger och avstånd flyttades till variabler i en fil, så att hela appen kan byta utseende genom att ändra på ett ställe.",
      "t0": 1755508760000,
      "t1": 1755509600000,
      "tokens": 22000
    }
  ]
});

---
description: Leverera resultatet av ett obevakat/nattpass som en fristående HTML-rapport på disk med skärmdumpar inbäddade som base64 — chatten får bara sökvägen. Trigga efter ett obevakat eller schemalagt pass, "frukostrapport", eller när du ska presentera ett stort jobbresultat som inte kan visas inline i chatten.
---

# Frukostrapport (obevakat-pass-leverans)

Så presenteras ett nattpass/batch-resultat så att det faktiskt går att läsa (t.ex. på telefon vid frukosten). Löser två problem med att `Read`:a in kompositbilder i chatten: i ett schemalagt/headless-pass **renderas inte inline-bilder** ("se bild ovan" → ingen bild finns), och inline-base64 **bränner tokens** och ger en lång, oläsbar tråd.

## Beslut: en fristående HTML-fil på disk (inte PDF, inte inline)
Skriv **en enda självständig `.html`-fil** i `reports/`, med skärmdumpar inbäddade som base64 (`<img src="data:image/png;base64,…">`) och all text som riktig HTML. Chatten får **bara sökvägen** — aldrig bilderna.

Varför HTML framför PDF: självständig och spårsäker (en fil, inga externa bild-länkar som kan saknas), läsbar direkt i valfri webbläsare (zoom/scroll på telefon, klickbara sökvägar, hopfällbara sektioner), token-snål i chatten, trivial att generera (ren strängbyggnad, ingen PDF-toolchain). Vill man ändå ha PDF: öppna HTML:en → Skriv ut → PDF.

## Rutin
1. **Skärmdumpar:** för varje GUI-synlig ändring, kör dev-servern, navigera till vyn och ta en skärmdump. Nya features → bara **efter**-bild; ändrade ytor → **före + efter** (före = git-toggle/gammal fixtur, fångad innan du redigerade). Base64-koda och bädda in. Verktyg: `${CLAUDE_PLUGIN_ROOT}/bin/shot.mjs` (element-skärmdump) + `${CLAUDE_PLUGIN_ROOT}/bin/compose.py` (före|efter-komposit).
2. **Struktur:** rubrik + datum, en kort **sammanfattningstabell** (en rad per task: klart/överhoppat, testantal, kärnändring), sedan **en sektion per task** med text för icke-GUI-arbete (vad/varför, filer, testresultat) och efter- (eller före/efter-) skärmdump för GUI-arbete.
3. **Skriv filen** till `reports/frukostrapport-<ÅÅÅÅ-MM-DD>.html` (skapa `reports/` vid behov). `reports/` ska vara **gitignorerat** (genererad artefakt, ej källkod).
4. **Sista chattmeddelandet:** *bara* sökvägen + en rad om vad som hoppades över. Klistra **aldrig** in skärmdumpar i chatten.

## Kördes detta som en batch?
Har passet redan drivit batch-skillens live-dashboard (`reports/batch-<datum>.html`) behövs ingen separat fil — **samma dashboard är slutrapporten** (den bär redan status, före/efter, slutkommentarer och testfall). Ge dess sökväg. Skriv bara en fristående `frukostrapport-*.html` när det inte fanns någon dashboard.

## Efemeralitet (viktigt)
`reports/*`-filerna är **ephemeral** arbetsytor (gitignorerade). De **kopieras aldrig** in i de kanoniska doc-filerna. Det enda durabla som blir kvar av ett pass är en kort klar-post i history + borttagna backlog-poster (via doc-hygien-sweepen).

## Relation till små iterationer
För **små, interaktiva GUI-iterationer** i en vanlig session: visa i stället en före/efter-komposit **inline i flödet** (`shot.mjs` + `compose.py` + `Read`). HTML-rapporten är specifikt för nattpass/batch, där inline inte fungerar.

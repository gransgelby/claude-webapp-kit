---
description: Kör ett batch-jobb — välj/prioritera flera backlog-poster visuellt, kör så autonomt som möjligt och leverera en granskbar live-dashboard som blir slutrapport. Trigga på "starta batchjobb", begäran om "backlog-tabellen", eller när ett jobb spänner över flera backlog-poster / ett stort spår. Hanterar också batch-kön ("lägg i nästa batch: …", "köa: …", "lägg i backloggen: …").
---

# Batch-jobb

Standard-arbetssättet för större jobb (flera backlog-poster på en gång, eller ett stort spår). Målet: användaren väljer och prioriterar **visuellt** vad som ska göras, Claude kör så **autonomt som möjligt**, resultatet levereras som en **granskbar HTML-dashboard med tydliga testinstruktioner**. Minimerar fram-och-tillbaka.

## Steg 0 — Hämta öppen feedback först
Om projektet har ett ställe där feedback/designnotiser samlas (t.ex. ett admin-verktyg, en inkorg, öppna GitHub-issues): hämta de **ohanterade** posterna först och väv in dem som backlog-kandidater i widgeten, så feedback som lämnats någon annanstans aldrig missas. Saknas ett sådant ställe: hoppa steget.

## Steg 1 — Backlog som interaktiv widget
Läs projektets backlog-fil och visa den som en interaktiv widget (`mcp__visualize__show_widget`). Varje post har:
- **Kryssruta** — vilka poster som ingår i batchen.
- **Dra-handtag** — rader kan dras upp/ned; ordningen = körordning.
- **Autonomi-märkning** — hur självständigt posten kan lösas:
  - 🟢 **Autonomt** — tydlig spec, inga externa beslut/creds/live-verifiering.
  - 🟡 **Autonomt efter frågor** — behöver några inledande beslut, kör sedan själv.
  - 🔴 **Kräver din närvaro** — aktiv medverkan behövs (prod/live-verifiering, creds, hårdvara, subjektiva designval som kräver iteration).
- **Insats** — Låg / Medel / Stor (eller "Klar — verifiera").
- **Kommentarsfält** — fri text: prioriteringar, förtydliganden eller **utmaningar** ("varför kräver X min närvaro?").
- **"Starta batch"-knapp** — skickar valda poster (i vald ordning) + kommentaren tillbaka via `sendPrompt`.

## Steg 2 — Frågerunda (maximera autonomin), EN omgång
Innan något jobb påbörjas:
1. **Ställ alla frågor** som krävs för att köra autonomt — samla dem i **en** omgång, inte droppvis. Använd `AskUserQuestion` för rena val.
2. **Svara på utmaningar** i kommentaren: förklara varför en 🔴/🟡-post kräver närvaro och **omklassificera** till 🟢/🟡 om den går att lösa med inledande frågor.
3. Bekräfta slutlig plan (ordning + vad som körs autonomt vs väntar på svar).

## Steg 3 — Körning med LIVE-dashboard (samma fil = slutrapporten)

**Körmotor (standard, inget separat val):** driv körningen med `long-run`-spelboken — **en subagent (`batch-worker`) per post** i eget context så huvudloopen hålls lätt och context-fönstret sparas. Sekventiellt för fil-rörande poster (undvik krock), parallellt för read-only research/audit; huvudloopen committar per klar post. Detta är default så fort en batch startas ("starta batchjobb") — användaren behöver **inte** be om subagenter separat. Läs `long-run`-skillen för tiers A/B, adversariell verifiering och circuit-breaker. (Undantag: en pytteliten batch som uppenbart ryms i ett context-fönster kan köras inline — men vid minsta tvekan, subagenter.)

Kopiera mallen till batchen och driv den under hela körningen:
```
cp ${CLAUDE_PLUGIN_ROOT}/templates/batch-dashboard.html reports/batch-<datum>.html
cp ${CLAUDE_PLUGIN_ROOT}/templates/batch-dashboard-data.js reports/batch-<datum>-data.js
```
- **Välkomst-skärmen (sätt ALLTID tre fält):** ge batchen ett `name` (visas i header + som "Välkommen till «name»"), en `nameWhy` (en rad om **varför** namnet valdes) och ett `saying` (ett passande talesätt med glimten i ögat, visas i citat). Utelämna dem inte — de driver välkomst-flashen och gör starten personlig.
- **En skärm utan skroll:** alla valda poster som kompakta statuskort i ett rutnät, var och en med sin **fas** — ⚪ Väntar · 🔵 Startar · 🟡 Pågår · 🟣 Testar · 🟢 Klar · 🔴 Blockerad — plus en total-mätare (X/N klara). **Sätt fasen löpande** (startar→pågår→testar→klar), inte bara vid klart, så mellanstegen syns.
- **Asymmetrisk in-place-uppdatering:** data bor i `-data.js` som anropar en renderar-callback (JSONP-mönster). HTML-skalet re-injicerar skriptet var ~6:e s och patchar bara kort vars data ändrats — scroll och öppna popups står stilla. Skriv om `-data.js` (inte HTML-skalet) vid varje statusändring. Poll är på **endast** när `status:"running"`.
- **HTML-escapa ALL task-text** (titlar/noter/aktivitet/frågor/testfall) — de innehåller ofta literal kod (`<Link>`, `<div>`); utan escaping korrumperas DOM:en och efterföljande kort blir osynliga. Verifiera **visibilitet**, inte bara DOM-nodantal.
- **Live-statustext** (`activity`, kursiv, lägre kontrast) på pågående kort — stora poster kan ta 20–30 min utan att något syns; uppdatera vid varje meningsfullt delsteg (~2–4 min), töm vid klart.
- **"Kräver din input"-läge:** en post som halvvägs visar sig inte kunna slutföras autonomt → sätt `phase:"input"` + `question`. **Halta inte hela batchen** — fortsätt med andra autonoma poster medan du väntar, väv in svaret när det kommer.
- **Bakgrundsfoto** (valfritt, trevligt): `${CLAUDE_PLUGIN_ROOT}/bin/batch-bg.py "<sökfras>" reports/batch-<datum>-img/bg.jpg` (nyckelfritt, returnerar attribution → kreditera diskret).
- **Öppna helst över `http://localhost`** (kör `python3 -m http.server` i `reports/`) — `file://` gör att webbläsaren kan återanvända gammalt HTML utan att läsa om från disk.
- **Före/efter på GUI-poster:** fånga "före" **innan** du redigerar; fyll `before`/`after` (base64) när posten blir klar → kamera-chip dyker upp på kortet, detaljvyn öppnas i ny flik. Verktyg: `${CLAUDE_PLUGIN_ROOT}/bin/shot.mjs` + `${CLAUDE_PLUGIN_ROOT}/bin/compose.py`.

## DoD per post (innan en post markeras klar)
- **Logik-/analys-ändring:** kör **projektets test/verify-kommando** och se att den är grön. Rör den delad fixtur/golden data → uppdatera den.
- **Ren GUI-/styling-ändring:** typecheck + token-lint (`${CLAUDE_PLUGIN_ROOT}/bin/check-design-tokens.mjs`), verifiera visuellt.
- Varje fixad bugg får ett regressionstest.

## Gren & commits
- Batch-arbete går på en **egen gren** `batch/<datum>` — aldrig direkt på huvudgrenen.
- **Committa varje klar våg** innan sessionen slutar (skyddar mot förlorad ocommittad diff mellan sessioner). Commit-meddelandet listar posterna + "tester gröna". Kör aldrig `git push` utan uttryckligt ok.

## Resume över sessioner
En stor batch ryms sällan i ett context-fönster. Tillståndet ligger **på disk**: dashboarden (`-data.js`) bär per-post-status, git-trädet bär koden, och en `reports/batch-<datum>-state.md` bär scope-beslut/defaults/körordning + "så här återupptar du". En ny session läser dessa + nästa `waiting`-post och fortsätter utan att fråga om igen. Trigger: "fortsätt batchjobbet".

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

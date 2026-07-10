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

## Två tiers
- **Tier A — auto-verifierade (klart över natten):** subagenten gör jobbet och verifierar (projektets test/verify-kommando grönt / a11y-lint grön / rapport-fil finns) → huvudloopen **committar**. Klar utan människa.
- **Tier B — förslags-utkast (väntar sign-off):** subagenten bygger + self-verifierar (typecheck + tester + demo renderar utan fel + fångar **före/efter** via skärmdump) → committa → markera i dashboarden som **"väntar din sign-off"**. Verifiera **inte** interaktivt — det gör människan på morgonen.

## Verifierar-steg (för Tier A-kod)
Innan commit av en Tier A-**kod**post: låt en **andra subagent** adversariellt dubbelkolla ändringen (leta buggar/regressioner, kör verify själv). Gör om vid fynd.

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

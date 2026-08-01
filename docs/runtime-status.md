# Arbetsbudget-mätaren (`bin/runtime-status.py`)

Ger orkestratorn kontinuerlig koll på kontextfönster, femtimmarsfönster och veckoförbrukning,
så att ett batch-pass kan **avslutas i tid i stället för att kapas mitt i**.

Reglerna för vad man *gör* med siffrorna bor i `skills/long-run/SKILL.md` → *Arbetsbudget*.
Den här filen beskriver bara maskineriet.

## Vad som mäts, och hur säkert

| Storhet | Källa | Status |
|---|---|---|
| Kontext % | sessionens `.jsonl`: `input + cache_read + cache_creation + output` på senaste huvudloops-svaret | **Mätt.** Samma formel som Claude Codes egen `used_percentage` |
| Kontextfönstrets storlek | konstant per modell i scriptet (Opus 5 / Sonnet 5 = 1 M, annars 200 k) | **Antaget.** Kalibrerat mot en session som nådde 844 k utan att kapas |
| 5h % · vecka % · extra % | `~/Library/Application Support/Claude/plan-usage-history.json` | **Mätt.** Desktop-appens egen logg, ny sample var 5:e minut |
| 5h-återställning | härledd: senaste nedgången i historiken + 5 h | **Härledd, ±5 min.** Fönstret är rullande och ankras vid första meddelandet |
| "slut om ~N min" | linjär framskrivning av senaste 30 min | **Prognos.** Efterprövad 2026-08-01 13:30–15:20: låg 7–10 min före utfallet |
| Veckoåterställning | – | **Redovisas inte.** Nedgångarna i historiken är oregelbundna; inget hållbart mönster |
| Avslutsreserv (20 min) | `AVSLUTSRESERV_MIN` | **Uppskattad** ur avslutssekvensen i webapp-batch. Kalibrera mot verkliga avslut |

Buckets appen loggar men som bara visas när de är aktiva på kontot: `so` vecka-Opus,
`sn` vecka-Sonnet, `om` vecka-Fable, `cw` Cowork, `oa` appar, `xu` extra usage.

## Hur den når modellen

`hooks/hooks.json`:

- `SessionStart` – ren text i kontexten vid start
- `UserPromptSubmit` – vid varje ny prompt
- `SubagentStop` – efter varje batch-post (naturlig beslutspunkt)
- `PostToolUse` – under autonomt arbete, **strypt**: bara när bandet ändrats, eller var 5:e min
  i kritiskt läge / var 15:e i varningsläge. Tillståndet ligger i `~/.claude/usage-monitor-state.json`.
- `PreToolUse`/`Agent` → `batch-guard.mjs` läser verdikten och talar **i beslutsögonblicket**,
  även mitt i en levande batch.

Verdikten (`kör`/`ryms`/`avsluta`) räknas i `batchbeslut()` i det här scriptet och skrivs till
`~/.claude/usage-snapshot.json`. `batch-guard.mjs` läser den — den räknar inte om trösklarna.
En tröskel ska ha en hemvist.

## Kostnad

~30 ms per hook: transkriptets sista 4 MB, inga underprocesser, ingen nätverkstrafik.
Injektionen är en till fyra rader och bara när något ändrats.

## statusLine

`statusLine` vore den auktoritativa källan — `context_window.*` och `rate_limits.*.resets_at`
kommer då direkt från Claude Code i stället för att härledas. Scriptet föredrar automatiskt
den datan när den finns (`--statusline`).

**Men desktop-appen körde den inte** vid test 2026-08-01: en tapp med `refreshInterval: 30`
skrev aldrig sin fil på 15 minuter. Konfigurationen ligger kvar i `~/.claude/settings.json`
som uppgraderingsväg och för terminal-CLI:t. Sökvägen där är absolut och pekar in i
marketplace-klonen — **flyttas pluginet måste den uppdateras.**

## Ad hoc

```bash
$CLAUDE_PLUGIN_ROOT/bin/runtime-status.py --show
```

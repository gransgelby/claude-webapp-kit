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
som uppgraderingsväg och för terminal-CLI:t. Den sökvägen är absolut och användarspecifik —
**flyttas scriptet måste den uppdateras.**

⚠️ **Hook-kommandon körs genom skalet.** En sökväg med mellanslag (`~/Claude stuff/…`) måste
citeras, annars bryts kommandot vid mellanslaget och hooken tiger utan felmeddelande — mätt
2026-08-01. `$CLAUDE_PLUGIN_ROOT` är mellanslagsfri, så pluginets egna hookar berörs inte.

## Ad hoc

```bash
$CLAUDE_PLUGIN_ROOT/bin/runtime-status.py --show
```

---

## BACKLOG · en stabil, kontinuerlig källa till ALLA usage limits

**Begärt av Andreas 2026-08-11 under Batch 15.** Prioritet: hög — det här är den enda
mätningen i hela arbetssättet som modellen inte kan lita på, och den styr när ett pass ska
pausas.

**Problemet, mätt och inte antaget.** Under Batch 15 (2026-08-11) blev kontosiffrorna stale
och **stannade i det läget resten av passet**. Injektionsraden sa `5h 86 % · vecka 18 %` med
märkningen «kontosiffror 351 min gamla» — alltså en avläsning från ~08.07, tagen **före**
användarens egen nollställning 08.50. Efter den nollställningen visade mätaren i nästan sex
timmar ett tal från det gamla fönstret, utan att någonsin uppdateras. Följden:

- Orkestratorn kunde inte avgöra om läget var `kör`, `ryms` eller `avsluta`, och fick i
  stället gissa ur klockan och användarens muntliga uppgift om när fönstret nollställs.
- `batch-guard` upprepade `5h på 86 %` vid varje ny post — en **falsk varning** som, om den
  hade lytts, skulle ha stoppat ett pass med gott om budget kvar.
- Användaren satt på mobilen och kunde **inte** läsa siffran själv; frågan *«kan du visa hur
  status är?»* gick inte att besvara med annat än «mätaren är död, här är antalet tokens jag
  förbrukat i stället».

**Varför det inte räcker att laga stale-detektionen.** Märkningen fungerade — modellen *såg*
att talet var gammalt. Det som saknas är en **källa som faktiskt uppdateras**. Att veta att
man är blind är bättre än att inte veta det, men det är inte det som efterfrågas.

**Att utreda, i fallande ordning av trolig avkastning:**

1. **Varför slutar desktop-appens femminuterslogg uppdateras mitt i en session?** Är det
   knutet till att sessionen körs icke-interaktivt, till att den är lång, eller till att
   fönstret nollställs? Reproducera först — utan det är resten gissningar.
2. **`statusLine` som auktoritativ källa.** Stycket ovan bokför att desktop-appen inte körde
   den 2026-08-01. **Pröva om det ändrats**, och om det går att få `rate_limits.*.resets_at`
   och `context_window.*` direkt därifrån i stället för att härleda dem. Det är den enda
   kända vägen till *exakta* tal i stället för uppskattade.
3. **En andra, oberoende källa** som kan korsvalidera — och ett läge där de två inte är
   överens ska sägas ut i injektionsraden, inte döljas.
4. **Vad raden ska säga när den INTE vet.** I dag säger den ett gammalt tal med en varning
   bredvid. Ett alternativ är att säga *«okänd sedan HH.MM»* och låta orkestratorn falla
   tillbaka på en tokenbudget den kan mäta själv — förbrukade tokens per pass är exakt känt
   ur subagenternas slutnotiser och gick att summera för hand när mätaren tystnade.
5. **Vad användaren ska kunna fråga efter från mobilen.** Batch 15 visade att frågan kommer,
   och att den inte gick att besvara. Antingen ska raden bäras in i dashboarden (som redan
   är en webbsida användaren kan öppna var som helst), eller ska mätaren gå att läsa av på
   begäran utan desktop-appen.

**Bevis att spara:** hela förloppet 2026-08-11 ligger i App-projektet-repots
`reports/batch-2026-08-10-spannbandet-state.md` och i den batchens commit-historik.

# webapp-kit

Ett **Claude Code-plugin** som paketerar ett helt arbetssätt för att bygga webbappar med Claude Code —
så att det finns på plats i *alla* dina projekt, inte bara i det där det råkade uppstå.

Byggt ur konventionerna i app-projektet-projektet och en källbelagd utredning om design-workflows.

## Vad det ger

**Skills** (auto-triggar på beskrivning, eller kör manuellt med `/webapp-kit:<namn>`):

| Skill | Trigger | Vad den gör |
|---|---|---|
| `webapp-batch` | "starta batchjobb", backlog-tabell | Preflight (ett kommando riggar batchen) → interaktiv backlog-widget (välj/dra/autonomi-märk) → frågerunda → live HTML-dashboard → körning → slutrapport med testfall |
| `long-run` | stort/obevakat pass, "nattkörning" | Subagent-per-post-spelbok: eget context per deljobb, sekventiellt för fil-rörande, circuit-breaker, committa per klar post |
| `breakfast-report` | efter obevakat pass | Fristående HTML-rapport på disk med base64-skärmdumpar + text per åtgärd |
| `design-workflow` | design/UI-arbete | Wireframes → shadcn + tokens → inspiration/känsla → tweakcn/DaisyUI → tre körfält (struktur/look/nagg) + grid-alignment |
| `visual-iterate` | finjustera UI, "ändra så här" | Skärmdumps-loop: expected-vs-actual, stagade prompter, Claude stänger loopen med egen skärmdump |
| `doc-hygiene` | "granska dokumentationen", batch-slut | Doc-roll-system (vision/state/reference/backlog/history) + sweep mot dubblering/drift |

**Agent:** `batch-worker` — subagent-typen som utför en enskild batch-post i eget context och returnerar en kort sammanfattning.

**Hooks:** en `SessionStart`-pekare till pluginets ingångar (låg brus, en gång), och en `PreToolUse`-vakt på `Agent` (`batch-guard.mjs`) som påminner när en batch-post startas utan riggad dashboard.

**bin/** — genericerad tooling: `batch-preflight.mjs` (riggar en batch, se nedan), `batch-guard.mjs` (hooken), `shot.mjs` (element-skärmdump), `compose.py` (före/efter-komposit), `batch-bg.py` (dashboard-bakgrund), `check-design-tokens.mjs` (token-lint: hårdkodade färger + spacing), `wireframe.html` (wireframe-editor, se nedan).

### batch-preflight.mjs — riggningen som ett kommando

```bash
node bin/batch-preflight.mjs --bas batch-2026-08-01-nattpass --namn "Operation X" \
    [--gren batch/2026-08-01-nattpass] [--poster 12]
```

Kontrollerar att basnamnet och batchnamnet inte redan är använda (ett återanvänt basnamn ärver
förra batchens `localStorage`; ett återanvänt namn gör passen omöjliga att skilja åt i efterhand),
skapar grenen, kopierar dashboard-mallen till `reports/<bas>.html` + `<bas>-data.js`, lägger
`<bas>-img/` och en `<bas>-state.md`, skriver in namnet i `docs/batch-historik.json` — och listar
sist det som **återstår** och som skriptet inte kan göra åt dig (namn/talesätt, bakgrundsbilder,
en post per punkt, urvalswidgeten, ordningsförslaget). Exit 1 med läsbart skäl när något krockar,
och inga halvvägs-ändringar: alla kontroller körs före första skrivningen.

Varför det finns som ett skript i stället för som en instruktion: riggningen stod i prosa som läses
en gång vid passets start, och i ett verkligt pass hoppades alla sex stegen över. `batch-guard.mjs`
är samma påminnelse i hook-form — den fyrar när en `batch-worker` startas utan att någon
`reports/*-data.js` står på `"running"`, den **blockerar aldrig** (alltid `allow`), och den är tyst
så fort riggningen är gjord.

### wireframe.html — skissa layout och lämna över till Claude

Öppna filen direkt i webbläsaren (ingen server, inga beroenden). Dra i rutnätet för att
skapa rutor, namnge dem och skriv en kommentar per ruta. **Kopiera för Claude** lägger en
markdown-tabell på urklipp som du klistrar in i chatten.

Poängen är utdataformatet: rutorna snäpper **alltid till kolumn- och radspann**, aldrig
till fria pixlar. Claude får därför *grid-avsikt* (`kol 9–12 (spann 4)`) som direkt kan
översättas till `col-span-*` + gap ur spacing-token — i stället för
`position:absolute; top:340px`, som ger en icke-responsiv layout och är precis det
`design-workflow`-skillen varnar för.

**Rad 10 = vikningen på en MacBook Pro 14″.** Radhöjden är låst till 5,7 % av bredden, så
tio rader motsvarar exakt en skärm och allt under den streckade linjen kräver scroll — en
skiss som är dubbelt så hög som skärmen ljuger annars om vad som får plats.

Rutorna ritas som klassiska wireframe-block (streckad ram, mellangrå fyllning); typen bärs
av ramens kulör så att ytorna förblir neutrala och layouten är det som syns. Arbetet sparas
i `localStorage` och kan exporteras/öppnas som JSON.

Färgerna i filen är medvetet **literala, inte CSS-variabler**: verktyget öppnas i allt från
Safari till inbäddade snapshot-vyer, och en renderare som inte löser `var()` gör annars hela
gränssnittet oformaterat. Kontrasterna är mätta mot WCAG 2.1 AA (38 kontrollpunkter).

**templates/** — `batch-dashboard.html` + `-data.js` (live-dashboard-mallen) och `project-skeleton/` (tomma doc-roll-filer + `CLAUDE.md` + `.gitignore` att kopiera in i ett nytt projekt).

## Installera

I Claude Code desktop-appen: **Settings → Plugins → Add** och peka på GitHub-repot (`<ditt-namn>/claude-webapp-kit`).
Eller från terminalen med en lokal sökväg:

```bash
claude --plugin-dir /path/to/claude-webapp-kit
```

Installera globalt (`~/.claude/`) → gäller alla projekt. Skills dyker upp i `/`-menyn som `webapp-kit:<namn>`.

## Starta ett nytt projekt med skelettet

```bash
cp -R templates/project-skeleton/. /path/to/new-project/
```

Ger dig doc-roll-filerna (App_vision / Project_state / Reference / Backlog / Project_history),
en `CLAUDE.md` som pekar på pluginets skills, en `.gitignore` och `docs/`-mappen.

## Doc-roller (kort)

- **App_vision.md** – vart vi ska (vision, syfte, designprinciper).
- **Project_state.md** – var vi är (kort nuläge + orienteringskarta). Läses varje session → håll kort.
- **Reference.md** – hur det är byggt (teknisk uppslagsbok). Läses vid behov.
- **Backlog.md** – vad vi kanske gör sen (en rad per spår, stabila ID:n).
- **Project_history.md** – vad som gjorts (kronologisk klar-logg, nyaste överst).

Ingen dubbel bokföring: ett faktum har *en* hemvist, korslänka i stället för att kopiera.

## Struktur

```
.claude-plugin/plugin.json   manifest
skills/<namn>/SKILL.md        en mapp per skill
agents/batch-worker.md        subagent-definition
hooks/hooks.json              SessionStart-pekare + PreToolUse-vakt på Agent
bin/                          tooling (preflight/shot/compose/batch-bg/token-lint) + hook-script
templates/                    dashboard-mall + projekt-skelett
```

## Ursprung & bakgrund

Destillerat ur app-projektet-projektets `CLAUDE.md`, `docs/batch-jobb-process.md`,
`docs/breakfast-report-plan.md`, `docs/design-process.md` och design-workflow-utredningen.

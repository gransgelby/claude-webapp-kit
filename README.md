# webapp-kit

Ett **Claude Code-plugin** som paketerar ett helt arbetssätt för att bygga webbappar med Claude Code —
så att det finns på plats i *alla* dina projekt, inte bara i det där det råkade uppstå.

Byggt ur konventionerna i app-projektet-projektet och en källbelagd utredning om design-workflows.

## Vad det ger

**Skills** (auto-triggar på beskrivning, eller kör manuellt med `/webapp-kit:<namn>`):

| Skill | Trigger | Vad den gör |
|---|---|---|
| `webapp-batch` | "starta batchjobb", backlog-tabell | Interaktiv backlog-widget (välj/dra/autonomi-märk) → frågerunda → live HTML-dashboard → körning → slutrapport med testfall |
| `long-run` | stort/obevakat pass, "nattkörning" | Subagent-per-post-spelbok: eget context per deljobb, sekventiellt för fil-rörande, circuit-breaker, committa per klar post |
| `breakfast-report` | efter obevakat pass | Fristående HTML-rapport på disk med base64-skärmdumpar + text per åtgärd |
| `design-workflow` | design/UI-arbete | Wireframes → shadcn + tokens → inspiration/känsla → tweakcn/DaisyUI → tre körfält (struktur/look/nagg) + grid-alignment |
| `visual-iterate` | finjustera UI, "ändra så här" | Skärmdumps-loop: expected-vs-actual, stagade prompter, Claude stänger loopen med egen skärmdump |
| `doc-hygiene` | "granska dokumentationen", batch-slut | Doc-roll-system (vision/state/reference/backlog/history) + sweep mot dubblering/drift |

**Agent:** `batch-worker` — subagent-typen som utför en enskild batch-post i eget context och returnerar en kort sammanfattning.

**Hooks:** en `SessionStart`-pekare till pluginets ingångar (låg brus, en gång).

**bin/** — genericerad tooling: `shot.mjs` (element-skärmdump), `compose.py` (före/efter-komposit), `batch-bg.py` (dashboard-bakgrund), `check-design-tokens.mjs` (token-lint: hårdkodade färger + spacing).

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
hooks/hooks.json              SessionStart-pekare
bin/                          tooling (shot/compose/batch-bg/token-lint) + hook-script
templates/                    dashboard-mall + projekt-skelett
```

## Ursprung & bakgrund

Destillerat ur app-projektet-projektets `CLAUDE.md`, `docs/batch-jobb-process.md`,
`docs/breakfast-report-plan.md`, `docs/design-process.md` och design-workflow-utredningen.

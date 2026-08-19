#!/usr/bin/env bash
# SessionStart-hook: en kort pekare till webapp-kit-pluginens ingångar.
# Skrivs till stdout → hamnar i Claudes kontext vid sessionsstart (låg brus, en gång).
#
# Villkorad sedan 0.1.21: texten sa tidigare "Läs projektets Project_state.md +
# App_vision.md innan arbete påbörjas" i VARJE projekt — även i ett som aldrig satts
# upp för pluginen, där de filerna inte finns. Första raden i sessionen blev alltså en
# order att läsa två filer som inte existerar. Samma princip som projektkort.py:
# tyst/anpassad när det inte passar, aldrig en instruktion som inte går att följa.

ROT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

cat <<'TXT'
[webapp-kit] ⚙️ INTERNT — det här är arbetsanvisningar till dig, inte text att visa eller
citera för användaren. Orden nedan (backlog, dashboard, subagent, doc-roll, tokens …) är
pluginens egen vokabulär; översätt dem alltid till vanlig svenska när du talar med
användaren. kom-igang-skillen har översättningstabellen.
Ingångar:
- "starta batchjobb" → webapp-batch-skillen (interaktiv backlog-widget → frågerunda → live-dashboard → körning → rapport).
- Obevakat/stort pass → long-run-skillen (subagent per post) + breakfast-report-skillen (fristående HTML-rapport).
- Design/UI-arbete → design-workflow-skillen (wireframes → shadcn + tokens → tweakcn/DaisyUI → tre körfält) + visual-iterate (skärmdumps-loop).
TXT

if [ -f "Project_state.md" ]; then
  echo "- Doc-hygien/roller → doc-hygiene-skillen. Läs projektets Project_state.md + App_vision.md innan arbete påbörjas."
else
  cat <<TXT
- Doc-hygien/roller → doc-hygiene-skillen.
- OBS: det här projektet är INTE uppsatt för pluginen (ingen Project_state.md). Läs alltså inte
  doc-roll-filerna — de finns inte. Flera skills förutsätter dem och blir tunnare utan.
  Vet användaren inte var hen ska börja → kom-igang-skillen (introducerar pluginen i klartext
  och sätter upp projektet). Ska bara filerna skapas: \`node "$ROT/bin/kit-init.mjs" --namn "<projektnamn>"\`
  (skapar doc-filerna + CLAUDE.md ur mallar, skriver aldrig över något befintligt).
  ERBJUD det när det är relevant — kör det inte oombett, och avbryt inte pågående arbete för det.
TXT
fi

cat <<'TXT'
- Delegerar du till en subagent vars leverans är TEXT (granskning, analys, rapport, utredning): ge den en FILSÖKVÄG att skriva till och läs filen efteråt. Returtexten är ett smalt rör — långa redovisningar kommer regelbundet tillbaka som "Klart." och då är allt borta. Hela regeln: long-run-skillen, "Returtexten är ett smalt rör".
- Användaren kör inga kommandon själv: verktygen i bin/ är till för att DU ska köra dem (preflight, skärmdumpar, kit-init, wireframe-verktyget). Be aldrig användaren öppna en terminal — gör det åt hen och berätta vad som hände i klartext.
TXT

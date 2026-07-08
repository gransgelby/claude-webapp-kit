#!/usr/bin/env bash
# SessionStart-hook: en kort, engångs-pekare till webapp-kit-pluginets ingångar.
# Skrivs till stdout → hamnar i Claudes kontext vid sessionsstart (låg brus, en gång).
cat <<'TXT'
[webapp-kit] Arbetssätts-plugin aktivt. Ingångar:
- "starta batchjobb" → webapp-batch-skillen (interaktiv backlog-widget → frågerunda → live-dashboard → körning → rapport).
- Obevakat/stort pass → long-run-skillen (subagent per post) + breakfast-report-skillen (fristående HTML-rapport).
- Design/UI-arbete → design-workflow-skillen (wireframes → shadcn + tokens → tweakcn/DaisyUI → tre körfält) + visual-iterate (skärmdumps-loop).
- Doc-hygien/roller → doc-hygiene-skillen. Läs projektets Project_state.md + App_vision.md innan arbete påbörjas.
TXT

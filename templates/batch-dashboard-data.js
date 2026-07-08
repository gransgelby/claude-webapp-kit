// Batch data (JSONP): loaded as ONE script that calls the renderer → asymmetric
// in-place updates without a full-page reload (fetch of local files is blocked on file://).
// The batch process REWRITES this file on every status change; the shell (batch-dashboard.html)
// re-injects it every ~6 s while status === "running", so the dashboard updates live.
//
// Shape reference (empty-state starter — replace with your batch's real content):
//   status:      "running" | "paused" | "aborted" | "done"
//   name:        batch name shown in the header namebox
//   bgId:        stable id for the background/welcome (bump to re-show the welcome screen)
//   prevDone:    ids of items completed in a PREVIOUS pass (rendered muted, no flowers)
//   updated:     short "what's the latest" line
//   status_note: longer note about the run
//   bgCredit:    photo attribution (shown bottom-right)
//   bgCaption:   caption under the grid + on the welcome screen (allows <b>…</b>)
//   tests:       null until the batch finishes, then {must:[...], nice:[...]}
//                each test: {id, t (title), steps, expect}
//   items[]:     one per task — {id, t (title), size:"liten"|"medel"|"stor",
//                phase:"waiting"|"starting"|"active"|"testing"|"done"|"blocked"|"input",
//                activity (in-progress line), note (done writeup), before, after (image paths)}
window.__applyBatch({
  "status": "running",
  "name": "Batchjobb",
  "bgId": "batch-000",
  "prevDone": [],
  "updated": "Batchen startar – posterna betas av en och en.",
  "status_note": "Live-vy. Korten uppdateras in-place medan jobbet körs.",
  "bgCredit": "",
  "bgCaption": "<b>Bakgrund:</b> ersätt med ett tema-foto för den här batchen (bin/batch-bg.py hämtar ett fritt Wikimedia-foto → batch-img/bg.jpg).",
  "tests": null,
  "items": [
    {"id":"EX1","t":"Exempelpost – liten","size":"liten","phase":"waiting","activity":"","note":"","before":"","after":""},
    {"id":"EX2","t":"Exempelpost – medel","size":"medel","phase":"waiting","activity":"","note":"","before":"","after":""},
    {"id":"EX3","t":"Exempelpost – stor","size":"stor","phase":"waiting","activity":"","note":"","before":"","after":""}
  ]
});

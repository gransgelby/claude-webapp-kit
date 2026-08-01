#!/usr/bin/env node
/**
 * batch-guard.mjs — PreToolUse-hook på `Agent`. Påminner, blockerar aldrig.
 *
 * VARFÖR. Reglerna som HÖLL i ett verkligt pass stod i filer som återinjiceras (agentens
 * egen definition, projektets CLAUDE.md). Reglerna som FÖLL stod i en skill som läses EN
 * gång vid start och sedan glider ur context. Riggningen — dashboard, ett kort per post —
 * hör till de senare. Den här hooken är därför inte en regel till, utan samma regel
 * flyttad till något som fyrar varje gång en batch-post faktiskt startas.
 *
 * STDIN (JSON): { session_id, cwd, hook_event_name, tool_name,
 *                 tool_input: { prompt, description, subagent_type, model }, tool_use_id }
 *
 * Hooken bär TVÅ påminnelser, och de har olika villkor med flit:
 *
 *   A. RIGGNINGEN (dashboard, ett kort per post) — bara när ingen dashboard drivs.
 *   B. ARBETSBUDGETEN (5h-fönster, orkestratorns context) — ALLTID när läget kräver det,
 *      och särskilt mitt i en levande batch. Det är där posten faktiskt startas, och det
 *      enda ögonblick då "starta inte den här posten" fortfarande är ett billigt beslut.
 *      Underlaget är ~/.claude/usage-snapshot.json, som runtime-status.py skriver om vid
 *      varje verktygsanrop. Verdikten (kör/ryms/avsluta) räknas DÄR, inte här — tröskeln
 *      ska ha en hemvist.
 *
 * BESLUT:
 *   subagent_type saknar "batch-worker"          → tyst, exit 0 (inget på stdout)
 *   varken A eller B har något att säga          → tyst, exit 0
 *   annars                                       → allow + additionalContext på stdout
 *
 * TRE KRAV, ALLA UR FALLGROPAR:
 *
 * 1. **Den blockerar aldrig.** permissionDecision är alltid "allow". En vakt som stoppar
 *    fel är värre än glömskan den skyddar mot — då lär man sig att stänga av vakten.
 * 2. **Den är billig och tål att köras rekursivt.** Hooks fyrar även inuti subagenter, så
 *    kostnaden multipliceras med passets längd: en readdir + de första 4 kB av varje
 *    datafil, aldrig hela. Datafilerna bär base64-skärmdumpar och blir megabyte-stora —
 *    `status` står i toppen, så toppen räcker. Ingen nätverkstrafik, inga underprocesser.
 * 3. **Den kraschar aldrig passet.** Allt ligger i try/catch och varje fel avslutas tyst
 *    med 0. Kan den inte avgöra läget ska den tiga, inte gissa.
 *
 * Avslut sker med `return`/`process.exitCode`, aldrig med process.exit() efter en skrivning:
 * Nodes stdout är asynkron mot en pipe, och ett exit() direkt efter write() kan kapa JSON:en
 * på mitten — en halv rad JSON är värre än ingen rad alls.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

//: bara toppen av varje datafil läses — se krav 2 ovan.
const TOPP_BYTES = 4096;
//: mellanslaget efter kolon är inte garanterat (filen skrivs av olika serialiserare).
const KÖR = /"status"\s*:\s*"running"/;

//: skrivs av bin/runtime-status.py vid varje verktygsanrop. Är den äldre än så här har
//: hooken inte kört på ett tag (annat gränssnitt, avstängda hooks) — och en gammal
//: budgetsiffra är sämre än ingen: den lugnar utan täckning. Tig hellre. Se krav 3.
const SNAPSHOT = path.join(os.homedir(), ".claude", "usage-snapshot.json");
const SNAPSHOT_FÄRSK_S = 300;

function läsStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/** Sant om katalogen har minst en <bas>-data.js vars topp säger status: "running". */
function harLevandeDashboard(rot) {
  const rapporter = path.join(rot, "reports");
  let filer;
  try {
    filer = fs.readdirSync(rapporter);
  } catch {
    return false; // ingen reports/ → ingen dashboard
  }
  for (const f of filer) {
    if (!f.endsWith("-data.js")) continue;
    let fd;
    try {
      fd = fs.openSync(path.join(rapporter, f), "r");
      const buf = Buffer.alloc(TOPP_BYTES);
      const n = fs.readSync(fd, buf, 0, TOPP_BYTES, 0);
      if (KÖR.test(buf.toString("utf8", 0, n))) return true;
    } catch {
      // en fil som inte går att läsa är inte ett bevis åt något håll → hoppa den
    } finally {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* strunt samma */ } }
    }
  }
  return false;
}

const PÅMINNELSE = [
  "[webapp-kit] En batch-post är på väg att startas, men ingen dashboard drivs " +
  '(ingen reports/*-data.js med status "running").',
  "· Riggningen är ETT kommando: node ${CLAUDE_PLUGIN_ROOT}/bin/batch-preflight.mjs " +
  '--bas batch-<datum>-<slug> --namn "Operation …" [--gren …] [--poster N] — den vägrar ' +
  "vid återanvänt basnamn/namn, kopierar mallen, skapar bildkatalogen och state-filen.",
  "· Ett kort per post — aldrig gruppkort. Den som skrev tjugosex punkter vill se " +
  "tjugosex rader; gruppering gör mätaren snygg och listan oanvändbar.",
  "· Är detta medvetet (engångspost utanför en batch) — kör vidare, det här är bara en " +
  "påminnelse.",
].join("\n");

/** Budgetpåminnelsen, eller null när läget inte kräver någon. */
function budgetPåminnelse() {
  let snap;
  try {
    snap = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  } catch {
    return null; // ingen mätare → tig, gissa inte
  }
  if (!snap?.tid || Date.now() / 1000 - snap.tid > SNAPSHOT_FÄRSK_S) return null;
  const b = snap.batch;
  if (!b || b.läge === "kör") return null;

  const skäl = (b.skäl ?? []).map((s) => `· ${s}`);

  if (b.läge === "avsluta") {
    return [
      "[webapp-kit] ⛔ ARBETSBUDGETEN SÄGER STOPP — starta INTE den här posten.",
      ...skäl,
      "",
      "Gå över till batch-avslutande protokoll NU, medan det fortfarande finns budget att " +
      "göra det med. Ett avslut tar tiotals minuter; påbörjas det när mätaren står på noll " +
      "blir det inget avslut alls, och då är dashboarden halvfärdig, posterna ocommittade " +
      "och nästa session får ärva ett träd ingen kan tolka.",
      "· Committa det som är klart, per post med explicit fillista.",
      "· Sätt kvarvarande poster till waiting i -data.js och frys dashboarden.",
      "· Skriv reports/<bas>-state.md så att nästa session kan återuppta.",
      "· Kör resten av avslutet enligt webapp-batch-skillen (före/efter-grind, " +
      "doc-hygien-GATE, cache-rensning, länklistan).",
      "· Är avslutet redan gjort och detta är en medveten extrapost — kör vidare, " +
      "hooken blockerar aldrig.",
    ].join("\n");
  }

  return [
    "[webapp-kit] ⚠️ Arbetsbudgeten börjar ta slut — starta bara den här posten om den " +
    "hinner bli KLAR och committad.",
    ...skäl,
    "",
    "Välj en kort, avgränsad post framför en stor. Committa direkt när den är klar. " +
    "Nästa gång läget höjs ska det finnas marginal kvar för hela avslutet.",
  ].join("\n");
}

function main() {
  const rå = läsStdin();
  if (!rå.trim()) return;
  const inn = JSON.parse(rå);
  const typ = inn?.tool_input?.subagent_type;
  if (typeof typ !== "string" || !typ.includes("batch-worker")) return;

  const delar = [];

  // Budgeten först: den gäller även mitt i en levande batch, och är det allvarligaste
  // av de två. Riggningspåminnelsen är en skönhetsfläck i jämförelse.
  const budget = budgetPåminnelse();
  if (budget) delar.push(budget);

  // Projektroten först (satt av Claude), stdin:s cwd som fallback. Samma katalog två
  // gånger kostar en readdir extra i värsta fall — inte värt en dedupliceringsbugg.
  const rötter = [process.env.CLAUDE_PROJECT_DIR, inn?.cwd, process.cwd()].filter(Boolean);
  if (!rötter.some((rot) => harLevandeDashboard(rot))) delar.push(PÅMINNELSE);

  if (delar.length === 0) return;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      additionalContext: delar.join("\n\n"),
    },
  }));
}

try {
  main();
} catch {
  // krav 3: tyst vid varje fel. Exitkoden lämnas orörd (0) och stdout tomt.
}

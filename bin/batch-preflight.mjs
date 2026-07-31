#!/usr/bin/env node
/**
 * batch-preflight.mjs — riggar en batch på ETT kommando.
 *
 * VARFÖR SKRIPTET FINNS. Riggningen bestod av sex steg i prosa (unikt basnamn, unikt namn
 * i historiken, gren, dashboard-kopia, bildkatalog, state-fil). I ett verkligt pass
 * (2026-07-31) hoppades **samtliga sex** över — inte av slarv, utan för att prosan står i
 * en skill som läses EN gång vid start och sedan glider ur context när passet växer.
 * Ett kommando som antingen lyckas eller vägrar är granskbart; en instruktion är det inte.
 *
 * Usage:
 *   node bin/batch-preflight.mjs --bas batch-2026-08-01-nattpass --namn "Operation X" \
 *        [--gren batch/2026-08-01-nattpass] [--poster 12]
 *
 * Exit 0 = riggat, med en checklista på det som ÅTERSTÅR. Exit 1 = vägrade, med ett
 * läsbart skäl på stderr.
 *
 * TVÅ VÄGRINGAR SOM ÄR HELA POÄNGEN, INTE PEDANTERI:
 *
 * 1. **Basnamnet får aldrig gå igen.** Dashboard-skalet härleder sina localStorage-nycklar
 *    (välkomstskärm, klocka, "sett"-set) ur sitt eget filnamn — ett återanvänt basnamn ärver
 *    alltså förra batchens tillstånd och den nya välkomstskärmen visas aldrig. Det är ett
 *    känt fel, och det syns inte förrän någon undrar varför starten kändes död.
 * 2. **Namnet får aldrig gå igen.** `docs/batch-historik.json` är den durabla loggen över
 *    använda namn och foton. Utan den upprepades fotot tyst i fyra batchar i rad innan
 *    loggen fanns; namnet har samma problem, och en batch som heter som en tidigare går
 *    inte att prata om i efterhand.
 *
 * INGA HALVVÄGS-ÄNDRINGAR: alla kontroller körs före första filskrivningen, och namnet
 * skrivs till historiken SIST — en preflight som föll ska inte ha bränt ett namn.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HÄR = path.dirname(fileURLToPath(import.meta.url));
//: pluginets rot. Miljövariabeln finns när Claude kör oss; annars ligger vi i <rot>/bin/.
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(HÄR, "..");
const PROJEKT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

//: golv/tak på antal bakgrundsbilder — en bild per post, men aldrig så få att de blir
//: tapet eller så många att nedladdningen skenar (samma spann som webapp-batch-skillen).
const BILD_MIN = 6;
const BILD_MAX = 20;

/**
 * Avbrott sker genom att kasta, aldrig genom process.exit() — på en pipe är Nodes stdout
 * asynkron, och ett process.exit() direkt efter en skrivning kan kapa utskriften på mitten.
 * Ett skript vars felmeddelande ibland försvinner är värre än inget felmeddelande.
 */
class Vägran extends Error {}
class Klar extends Error {}
function fel(msg) { throw new Vägran(msg); }

/** Positionella argument finns inte — allt är flaggor, så ordningen aldrig spelar roll. */
function parseArgs(argv) {
  const opt = { bas: null, namn: null, gren: null, poster: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === "--bas" && v) { opt.bas = v; i++; }
    else if (a === "--namn" && v) { opt.namn = v; i++; }
    else if (a === "--gren" && v) { opt.gren = v; i++; }
    else if (a === "--poster" && v) { opt.poster = Math.max(1, parseInt(v, 10) || 0); i++; }
    else if (a === "-h" || a === "--help") {
      process.stdout.write(
        'Usage: batch-preflight.mjs --bas <batch-<datum>-<slug>> --namn "Operation X" ' +
        "[--gren <gren>] [--poster N]\n");
      throw new Klar();
    } else fel(`okänd flagga: ${a}`);
  }
  return opt;
}

function läsHistorik(fil) {
  // Förlåtande på samma sätt som batch-bg.py: en trasig logg får inte stoppa en batch.
  // MEN — till skillnad från bilderna är namnkollen en vägran, så en logg som inte GÅR
  // att läsa måste synas i utskriften i stället för att tyst godkänna varje namn.
  if (!fs.existsSync(fil)) return { data: { namn: [], bilder: [] }, fanns: false, trasig: false };
  try {
    const d = JSON.parse(fs.readFileSync(fil, "utf8"));
    if (!Array.isArray(d.namn)) d.namn = [];
    if (!Array.isArray(d.bilder)) d.bilder = [];
    return { data: d, fanns: true, trasig: false };
  } catch {
    return { data: { namn: [], bilder: [] }, fanns: true, trasig: true };
  }
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Returnerar en rad om vad som hände med grenen, eller kastar med ett läsbart skäl. */
function riggaGren(gren, cwd) {
  try {
    git(["rev-parse", "--git-dir"], cwd);
  } catch {
    throw new Vägran(`${cwd} är inget git-arbetsträd — kan inte skapa grenen "${gren}".`);
  }
  let nuvarande = "";
  try { nuvarande = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd); } catch { /* tomt repo */ }
  if (nuvarande === gren) return `gren: står redan på ${gren}`;
  let finns = true;
  try { git(["rev-parse", "--verify", "--quiet", `refs/heads/${gren}`], cwd); }
  catch { finns = false; }
  try {
    git(finns ? ["checkout", gren] : ["checkout", "-b", gren], cwd);
  } catch (e) {
    const txt = String(e.stderr || e.message).trim().split("\n").slice(0, 3).join(" · ");
    throw new Vägran(`kunde inte växla till "${gren}": ${txt}`);
  }
  return finns ? `gren: växlade till befintlig ${gren}` : `gren: skapade och växlade till ${gren}`;
}

/**
 * Startbar datafil. Den ska kunna öppnas direkt — en dashboard som inte renderar ser ut
 * som en trasig batch — men den ska SYNAS vara ofylld: TODO-markörerna i nameWhy/saying
 * står kvar på välkomstskärmen tills orkestratorn skrivit riktiga värden.
 * `name` får däremot batchens riktiga namn: det är känt redan här (--namn), och en TODO
 * i headern på en korrekt riggad batch vore brus, inte en varning.
 */
function datafil(bas, namn) {
  return `// ${bas} — skapad av batch-preflight.mjs. Skriv om DENNA fil vid varje statusändring
// (aldrig HTML-skalet); skalet re-injicerar den var ~6:e s medan status === "running".
// TODO innan batchen startar: nameWhy, saying, bgImages (batch-bg.py) och items — en post
// per punkt användaren valde, ALDRIG gruppkort.
window.__applyBatch({
  "status": "running",
  "name": ${JSON.stringify(namn)},
  "nameWhy": "TODO: en rad om varför batchen fick sitt namn.",
  "saying": "TODO: ett passande talesätt med glimten i ögat.",
  "bgId": ${JSON.stringify(bas)},
  "prevDone": [],
  "updated": "Riggad av batch-preflight — poster läggs in när ordningsförslaget är godkänt.",
  "status_note": "Live-vy. Korten uppdateras in-place medan jobbet körs.",
  "bgCredit": "",
  "bgCaption": "TODO: hämta bakgrunder med bin/batch-bg.py och lägg dem som bgImages.",
  "tests": null,
  "items": []
});
`;
}

function stateFil(bas, namn, gren, poster) {
  const n = poster ? `${poster}` : "—";
  return `# ${namn} — batch-state (${bas})

Bär det som INTE ryms i \`${bas}-data.js\`: scope-beslut, defaults ur frågerundan och
körordning. En ny session läser den här filen + nästa \`waiting\`-post och fortsätter utan
att fråga om igen. Trigger: "fortsätt batchjobbet".

## Läge
- Gren: ${gren || "—"}
- Dashboard: \`reports/${bas}.html\` (data: \`reports/${bas}-data.js\`, bilder: \`reports/${bas}-img/\`)
- Antal poster: ${n}
- Status: riggad av preflight — poster ej inlagda än

## Beslut & defaults
_Ur frågerundan (steg 2): vad som bestämdes, vilka defaults som gäller, och vad som
hamnade UTANFÖR batchen och varför._

-

## Körordning
_Varför posterna ligger i den ordning de gör: atomisk · beroende · degraderar mjukt ·
liten och billig att göra om. Plus reservlistan och svansposten._

-

## Så här återupptar du
1. Läs den här filen och \`reports/${bas}-data.js\` (per-post-status).
2. Stå på grenen ${gren || "batchens gren"}; kontrollera att arbetsträdet är rent.
3. Ta nästa post med \`phase:"waiting"\` och kör den som en \`batch-worker\`-subagent.
4. Sätt \`status:"paused"\` i datafilen om du lämnar tillbaka — en dashboard som står på
   "pågår" medan ingenting kör läser som ett hängt jobb.
`;
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (!opt.bas) fel("--bas saknas (formen är batch-<datum>-<slug>, t.ex. batch-2026-08-01-nattpass).");
  if (!opt.namn) fel('--namn saknas (batchens namn, t.ex. "Operation Grundplåt").');
  if (/[/\\]/.test(opt.bas)) fel(`--bas får inte innehålla sökvägsseparatorer: ${opt.bas}`);

  const rapporter = path.join(PROJEKT, "reports");
  const htmlUt = path.join(rapporter, `${opt.bas}.html`);
  const dataUt = path.join(rapporter, `${opt.bas}-data.js`);
  const bildKat = path.join(rapporter, `${opt.bas}-img`);
  const stateUt = path.join(rapporter, `${opt.bas}-state.md`);
  const historikFil = path.join(PROJEKT, "docs", "batch-historik.json");
  const mallHtml = path.join(PLUGIN_ROOT, "templates", "batch-dashboard.html");
  // HTML-skalet KOPIERAS orört (det härleder allt ur sitt eget filnamn). Datafilen
  // GENERERAS i stället för att kopieras: mallens `items` innehåller tre exempelposter
  // (EX1–EX3), och en riggad batch som öppnas med tre påhittade kort ser trasig ut.
  // Formen hålls identisk med templates/batch-dashboard-data.js — ändras den där, ändra här.

  // ---- Kontroller. Alla före första skrivningen. ----
  if (!fs.existsSync(mallHtml)) fel(`hittar inte mallen ${mallHtml} (sätt CLAUDE_PLUGIN_ROOT?).`);
  for (const f of [htmlUt, dataUt, stateUt]) {
    if (fs.existsSync(f)) {
      fel(`basnamnet "${opt.bas}" är redan använt — ${path.relative(PROJEKT, f)} finns.\n` +
          "  Ett återanvänt basnamn ärver förra batchens localStorage (välkomstskärm, klocka,\n" +
          '  "sett"-set). Välj ett nytt: batch-<datum>-<annan-slug>.');
    }
  }
  const hist = läsHistorik(historikFil);
  if (hist.trasig) fel(`${path.relative(PROJEKT, historikFil)} går inte att tolka som JSON — laga den först (namnkollen kan annars inte göras).`);
  if (hist.data.namn.includes(opt.namn)) {
    fel(`namnet "${opt.namn}" är redan använt (står i ${path.relative(PROJEKT, historikFil)}).\n` +
        "  Namn får aldrig gå igen — välj ett nytt.");
  }

  // ---- Sidoeffekter. Grenen först: filerna ska landa på rätt gren. ----
  const rader = [];
  if (opt.gren) rader.push(riggaGren(opt.gren, PROJEKT)); // kastar med läsbart skäl

  fs.mkdirSync(rapporter, { recursive: true });
  fs.mkdirSync(bildKat, { recursive: true });
  fs.copyFileSync(mallHtml, htmlUt);
  fs.writeFileSync(dataUt, datafil(opt.bas, opt.namn), "utf8");
  fs.writeFileSync(stateUt, stateFil(opt.bas, opt.namn, opt.gren, opt.poster), "utf8");
  rader.push(`skapade  reports/${opt.bas}.html  (dashboard-skal, oförändrad mall)`);
  rader.push(`skapade  reports/${opt.bas}-data.js  (status: running, items: [])`);
  rader.push(`skapade  reports/${opt.bas}-img/  (bakgrunder läggs här)`);
  rader.push(`skapade  reports/${opt.bas}-state.md  (scope/beslut/återupptagning)`);

  // Namnet skrivs SIST — en preflight som föll ska inte ha bränt ett namn.
  hist.data.namn.push(opt.namn);
  fs.mkdirSync(path.dirname(historikFil), { recursive: true });
  fs.writeFileSync(historikFil, JSON.stringify(hist.data, null, 2) + "\n", "utf8");
  rader.push(`${hist.fanns ? "uppdaterade" : "skapade "} docs/batch-historik.json  (namn: "${opt.namn}")`);

  const bilder = Math.min(BILD_MAX, Math.max(BILD_MIN, opt.poster || BILD_MIN));
  const ut = [
    `batch-preflight: "${opt.namn}" riggad.`,
    ...rader.map((r) => `  ${r}`),
    "",
    "ÅTERSTÅR — det här kan skriptet inte göra åt dig:",
    `  1. Visa urvalswidgeten (templates/batch-urvalswidget.html) och låt användaren välja`,
    `     läge/prio per post. Widgeten startar ingenting — den ber om ett ordningsförslag.`,
    `  2. Lägg ordningsförslaget + frågerundan som en GRIND: säg vad som hamnade utanför och`,
    `     varför, redovisa reserv + svanspost, och VÄNTA på svar innan första posten startar.`,
    `  3. Fyll i nameWhy och saying i reports/${opt.bas}-data.js (name är redan satt).`,
    `  4. Hämta bakgrunder — en per post, 3–5 spridda teman:`,
    `     ${PLUGIN_ROOT}/bin/batch-bg.py "<sökfras>" reports/${opt.bas}-img/bg.jpg \\`,
    `         --count ${bilder} --seed ${opt.bas} --ledger docs/batch-historik.json`,
    `     Lägg dem som bgImages med en egen note + credit per bild.`,
    `  5. Lägg in items: EN post per punkt användaren valde${opt.poster ? ` (${opt.poster} st)` : ""} —`,
    `     aldrig gruppkort. Den som skrivit tjugosex synpunkter vill se tjugosex rader.`,
    `  6. Skriv beslut/körordning i reports/${opt.bas}-state.md medan de är färska.`,
    "",
    `Öppna dashboarden en gång innan du ger länken — helst över http://localhost.`,
  ].join("\n");
  process.stdout.write(ut + "\n");
}

try {
  main();
} catch (e) {
  if (e instanceof Klar) { /* --help skrev redan sitt */ }
  else if (e instanceof Vägran) {
    process.stderr.write(`batch-preflight: ${e.message}\n`);
    process.exitCode = 1;
  } else throw e; // en riktig bugg ska synas med stack, inte maskeras som en vägran
}

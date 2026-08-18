#!/usr/bin/env node
/**
 * kit-init: sätter upp ett projekt för webapp-kit — kopierar in doc-roll-filerna.
 *
 * Varför det finns som ett skript: pluginets skills förutsätter att projektet har
 * App_vision.md / Project_state.md / Reference.md / Backlog.md / Project_history.md.
 * Fram till nu stod det bara i README att man skulle `cp -R` in dem själv, vilket
 * betyder att den som inte kör kommandon i terminalen aldrig kom förbi steg noll.
 * Nu kör Claude det här åt användaren.
 *
 * Regler som styrt utformningen:
 *   * SKRIVER ALDRIG ÖVER. En fil som redan finns lämnas orörd och rapporteras som
 *     hoppad. Skriptet ska gå att köra igen i ett halvuppsatt projekt utan att någon
 *     förlorar text de skrivit.
 *   * ALLT ELLER INGET-KONTROLL FÖRE FÖRSTA SKRIVNINGEN. Ingen halvvägs-uppsättning.
 *   * SÄGER VAD SOM ÅTERSTÅR. Filerna är mallar med <!-- fyll i: … -->-hål; det som
 *     bara en människa kan svara på listas sist i klartext.
 *
 * Användning (Claude kör det åt användaren, från projektets rot):
 *   node <plugin>/bin/kit-init.mjs [--namn "Projektnamn"] [--dit <sökväg>]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HÄR = dirname(fileURLToPath(import.meta.url));
const SKELETT = join(HÄR, '..', 'templates', 'project-skeleton');

/** Positionella argument finns inte — allt är flaggor, så ordningen aldrig spelar roll. */
function flaggor(argv) {
  const ut = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const nyckel = argv[i].slice(2);
    const värde = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    ut[nyckel] = värde;
  }
  return ut;
}

/** Alla filer i skelettet, som sökvägar relativa till skelettroten. */
function skelettfiler(rot, bas = '') {
  const ut = [];
  for (const namn of readdirSync(join(rot, bas))) {
    const rel = bas ? join(bas, namn) : namn;
    if (statSync(join(rot, rel)).isDirectory()) ut.push(...skelettfiler(rot, rel));
    else ut.push(rel);
  }
  return ut.sort();
}

function dö(meddelande) {
  console.error(`kit-init: ${meddelande}`);
  process.exit(1);
}

/**
 * Klipper bort avsnitt som uppenbart inte gäller projektet.
 *
 * VARFÖR: mallen bar två avsnitt (cache/servrar, testning) som bara gäller vissa projekt,
 * och bad LÄSAREN radera dem. En användare som inte kodar kan varken avgöra om hen "har en
 * server" eller vilja redigera i filen som styr hur Claude beter sig — och i det ögonblick
 * kit-init körs är svaret ofta redan känt: en tom mapp har varken server eller tester.
 * Uppmätt i en granskning 2026-08-18. Gissar skriptet fel är felet mjukt: avsnittet fattas,
 * och Claude lägger tillbaka det när det blir aktuellt.
 */
function klipp(text, mål) {
  const harPaket = existsSync(join(mål, 'package.json'));
  let harTester = false;
  if (harPaket) {
    try {
      const pkg = JSON.parse(readFileSync(join(mål, 'package.json'), 'utf8'));
      harTester = Boolean(pkg?.scripts?.test);
    } catch { /* trasig package.json är inget bevis åt något håll */ }
  }
  const behåll = { server: harPaket, tester: harTester };
  let ut = text;
  for (const [nyckel, ja] of Object.entries(behåll)) {
    const start = `<!-- webapp-kit:valfritt ${nyckel} -->`;
    const slut = `<!-- webapp-kit:slut ${nyckel} -->`;
    const i = ut.indexOf(start);
    const j = ut.indexOf(slut);
    if (i === -1 || j === -1) continue;
    ut = ja
      ? ut.replace(start + '\n', '').replace('\n' + slut, '')
      : ut.slice(0, i) + ut.slice(j + slut.length + 1);
  }
  return ut;
}

const args = flaggor(process.argv.slice(2));
const MÅL = typeof args.dit === 'string' ? args.dit : process.cwd();

/**
 * --kolla: verifierar förutsättningarna och skriver vad som fattas.
 *
 * VARFÖR: README lovar att användaren inte behöver en terminal — men listade samtidigt
 * förkrav (node, python3, Chrome, puppeteer-core) som bara går att kontrollera i en
 * terminal. En granskning 2026-08-18 formulerade det så här: "Hur kontrollerar jag om node
 * finns på min dator utan en terminal? Och om det inte finns — vad gör jag då?" Nu kör
 * Claude det här i stället, och kan svara på båda frågorna.
 */
async function kolla(mål) {
  const { execFileSync } = await import('node:child_process');
  const rad = (namn, ok, detalj, utan) =>
    `${ok ? '✓' : '✗'} ${namn.padEnd(16)} ${detalj}${ok ? '' : `\n     saknas ⇒ ${utan}`}`;
  const kör = (cmd, ...a) => {
    try { return execFileSync(cmd, a, { encoding: 'utf8' }).trim().split('\n')[0]; }
    catch { return null; }
  };

  const rader = [];
  rader.push(rad('node', true, process.version, ''));
  const py = kör('python3', '--version');
  rader.push(rad('python3', Boolean(py), py ?? 'hittades inte',
    'bakgrundsbilder på dashboarden och före/efter-komposit fungerar inte'));
  const { CHROME } = await import('./krav-puppeteer.mjs');
  rader.push(rad('Google Chrome', existsSync(CHROME), existsSync(CHROME) ? CHROME : 'hittades inte',
    'inga skärmdumpar (sätt CHROME_PATH om Chrome ligger annorlunda)'));

  //: Pillow saknades i listan fram till 0.1.21 — kontrollen svarade "Allt på plats" på en
  //: dator där bin/compose.py inte kunde köra, alltså där före/efter-bilderna dör. README
  //: lovar att kontrollen "testar vart och ett"; då måste den också göra det.
  const pil = kör('python3', '-c', 'import PIL, sys; sys.stdout.write(PIL.__version__)');
  rader.push(rad('Pillow (python)', Boolean(pil), pil ? `version ${pil}` : 'inte installerat',
    'ingen sammansatt före/efter-bild (de enskilda skärmdumparna fungerar ändå)'));

  //: laddas på riktigt, inte bara slås upp. Ett uppslag säger bara att NÅGOT ligger på rätt
  //: plats — en granskning 2026-08-18 lade dit en tom attrapp och fick "Allt på plats".
  //: Kontrollen är alltså: modulen går att LADDA och exponerar en launch-funktion. Det
  //: fångar det som händer på riktigt (paketet saknas, halvinstallerat, trasigt bygge).
  //: Den startar däremot ingen webbläsare — en konstruerad attrapp vars launch() kastar
  //: går igenom. Priset är värt det: att starta Chrome vid varje förutsättningskoll
  //: skulle kosta sekunder varje gång.
  let pptr = false;
  try {
    const { laddaPuppeteer } = await import('./krav-puppeteer.mjs');
    const mod = await laddaPuppeteer({ kasta: true, rot: mål });
    pptr = typeof mod?.launch === 'function';
  } catch { /* saknas eller trasigt — båda är "nej" här */ }
  rader.push(rad('puppeteer-core', pptr, pptr ? 'finns i projektet' : 'inte installerat i det här projektet',
    'inga skärmdumpar, ingen före/efter-jämförelse, ingen pixeldiff'));

  console.log(`webapp-kit — förutsättningar i ${mål}:\n`);
  console.log(rader.join('\n'));
  const brist = rader.filter((r) => r.startsWith('✗')).length;
  console.log(brist === 0
    ? '\nAllt på plats.'
    : `\n${brist} sak${brist === 1 ? '' : 'er'} fattas. TILL CLAUDE: installera det som går ` +
      '(`npm i -D puppeteer-core` i projektroten), berätta i klartext vad du gjorde, och säg ' +
      'rakt ut vad som inte kommer fungera om något inte går att lösa. Allt utom bilderna ' +
      'fungerar även utan dem.');
  process.exit(0);
}
if (args.kolla) await kolla(MÅL);
const NAMN = typeof args.namn === 'string' ? args.namn : null;

if (!existsSync(SKELETT)) dö(`hittar inte mallarna (${SKELETT}). Är pluginet komplett installerat?`);
if (!existsSync(MÅL)) dö(`målmappen finns inte: ${MÅL}`);

const filer = skelettfiler(SKELETT);
const attSkriva = [];
const hoppade = [];

for (const rel of filer) {
  if (rel.endsWith('.gitkeep')) {
    // Mappen ska finnas; själva .gitkeep behövs bara om mappen är tom.
    const mapp = join(MÅL, dirname(rel));
    if (!existsSync(mapp)) attSkriva.push({ rel, typ: 'mapp' });
    else hoppade.push(`${dirname(rel)}/ (finns redan)`);
    continue;
  }
  if (existsSync(join(MÅL, rel))) hoppade.push(`${rel} (finns redan — orörd)`);
  else attSkriva.push({ rel, typ: 'fil' });
}

if (attSkriva.length === 0) {
  console.log('kit-init: projektet är redan uppsatt — alla filer fanns.');
  for (const h of hoppade) console.log(`  hoppade  ${h}`);
  process.exit(0);
}

// Först nu skrivs något: alla kontroller är gjorda.
const skapade = [];
for (const { rel, typ } of attSkriva) {
  const mål = join(MÅL, rel);
  mkdirSync(dirname(mål), { recursive: true });
  if (typ === 'mapp') {
    writeFileSync(join(MÅL, rel), '');
    skapade.push(`${dirname(rel)}/`);
    continue;
  }
  let innehåll = readFileSync(join(SKELETT, rel), 'utf8');
  if (NAMN) innehåll = innehåll.replaceAll('<!-- fyll i: Projektnamn -->', NAMN);
  innehåll = klipp(innehåll, MÅL);
  writeFileSync(mål, innehåll);
  skapade.push(rel);
}

const var_ = relative(process.cwd(), MÅL) || '.';
console.log(`kit-init: projektet är uppsatt för webapp-kit (${var_}).`);
for (const s of skapade) console.log(`  skapade  ${s}`);
for (const h of hoppade) console.log(`  hoppade  ${h}`);

console.log(`
ÅTERSTÅR — det här kan skriptet inte veta, fråga användaren:
  1. Vad appen ska bli och för vem (App_vision.md). Fyll i den TILLSAMMANS med
     användaren i ett vanligt samtal — skriv inte en vision åt hen.
  2. Var projektet står just nu (Project_state.md → Nuläge). Finns det redan kod:
     läs den och föreslå en sammanfattning som användaren får rätta.
  3. Hur appen startas och testas (Reference.md → Körinstruktioner).
     Utan detta vet inte nästa session hur den ska köra appen.
  4. Idéer och önskemål som inte ska göras nu (Backlog.md, en rad per spår).
Mallarna har <!-- fyll i: … -->-hål på exakt de ställena. Lämna aldrig ett hål ifyllt
med en gissning — fråga hellre.

Gå INTE igenom hålen som ett formulär med användaren. De är ~25 stycken och de flesta
kan bara besvaras av den som byggt något än; ställs de på rad läser uppsättningen som ett
prov användaren underkänts på. Ta de fyra punkterna ovan i ett vanligt samtal, säg att
resten fylls i efterhand av dig allteftersom projektet växer, och lämna resten tomt.
Ett tomt hål är ett normaltillstånd, inte en skuld.

SÄG SEDAN TILL ANVÄNDAREN, i en mening, ungefär: "Klart — jag har lagt in några
anteckningsfiler så att jag minns projektet mellan gångerna. Du behöver inte göra något med
dem." Räkna inte upp filnamnen och visa inte listan ovan; den är till dig.`);

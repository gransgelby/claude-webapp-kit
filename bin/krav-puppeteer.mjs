/**
 * Gemensam förutsättnings-kontroll för de två skärmdumps-verktygen (shot.mjs,
 * granska-bild.mjs). Ligger i en egen fil för att felmeddelandet ska ha EN hemvist —
 * två kopior driver isär, och det här är texten som avgör om bilderna blir av.
 *
 * VARFÖR den finns: fram till 0.1.21 gjorde båda skripten `import puppeteer from
 * 'puppeteer-core'` rakt upp och ned. Saknades paketet dog de med en rå Node-stack:
 *
 *     Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'puppeteer-core' imported from …
 *
 * Uppmätt i en granskning 2026-08-18: det slog ut skärmdumpar, före/efter-bilder och
 * pixeldiff-grinden — alltså allt som README säljer in som produktens kärna — och
 * kravet stod ingen annanstans än som en kodkommentar i shot.mjs. En användare som
 * enligt README "inte behöver kunna köra kommandon i en terminal" har ingen chans att
 * tolka det felet. Nu säger felet i stället vad som saknas, vad det är, och vad Claude
 * ska göra åt det.
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HÄR = dirname(fileURLToPath(import.meta.url))

export const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** Skriv ett läsbart krav-fel till stderr och avsluta med kod 3 (≠ 1, så det går att skilja ut). */
function saknas(rader) {
  console.error(['[webapp-kit] Skärmdumpen kunde inte tas.', ...rader].join('\n'))
  process.exit(3)
}

/**
 * Slår upp puppeteer-core UTIFRÅN en given rot, inte utifrån den här filen.
 *
 * ⚠️ Det här är hela poängen med funktionen. Ett naket `import('puppeteer-core')` löser
 * paketnamnet relativt DEN IMPORTERANDE FILEN — alltså pluginens bin/-mapp, som varken
 * har package.json eller node_modules. Följden (uppmätt i en granskning 2026-08-18): en
 * användare körde `npm i -D puppeteer-core` i sitt projekt precis som felmeddelandet sa,
 * paketet installerades korrekt, och verktyget gav **exakt samma fel igen**. Rådet var
 * omöjligt att följa. Värre än så: installeras pluginen via marknadsplatsen ligger bin/
 * i en katalog användaren varken känner till eller kan skriva i — det fanns alltså ingen
 * åtgärd alls. `NODE_PATH` hjälper inte heller; ESM ignorerar den.
 */
async function importeraFrån(rot) {
  const req = createRequire(join(rot, '__uppslag__.js'))
  return (await import(pathToFileURL(req.resolve('puppeteer-core')).href)).default
}

/**
 * Laddar puppeteer-core, eller avslutar med ett fel som går att agera på.
 * Returnerar modulens default-export.
 */
export async function laddaPuppeteer({ kasta = false, rot = null } = {}) {
  //: projektet först, pluginen sist. createRequire söker node_modules uppåt i trädet,
  //: så ett paket i en överliggande katalog hittas också.
  //: ⚠️ `rot` ERSÄTTER kedjan, den läggs inte till först. Den som frågar om ett BESTÄMT
  //: projekt (kit-init --kolla --dit) vill veta om paketet finns DÄR — ett fynd i
  //: arbetskatalogen är då ett falskt ja. Uppmätt 2026-08-18: utan `rot` slog uppslaget
  //: mot cwd och gav omvänt svar åt båda hållen; med `rot` men MED fallback gav den fortsatt
  //: "✓" för en tom mapp, eftersom kedjan hittade paketet någon annanstans.
  //: Fallback-kedjan är rätt för den som ska TA en bild, fel för den som ska KONTROLLERA.
  const rötter = rot ? [rot] : [process.env.CLAUDE_PROJECT_DIR, process.cwd(), HÄR].filter(Boolean)
  for (const rot of rötter) {
    try {
      return await importeraFrån(rot)
    } catch (fel) {
      const saknasHär = fel?.code === 'MODULE_NOT_FOUND' || fel?.code === 'ERR_MODULE_NOT_FOUND'
      if (!saknasHär) throw fel // ett riktigt fel i paketet ska inte se ut som "saknas"
    }
  }
  {
    //: ⚠️ En FÖRUTSÄTTNINGSKONTROLL får inte dö av att förutsättningen fattas. Uppmätt
    //: 2026-08-18: `kit-init.mjs --kolla` la det här anropet i try/catch och antog att det
    //: kastade — men saknas() kör process.exit(3), så hela kontrollen dog med rubriken
    //: "Skärmdumpen kunde inte tas" i ett läge där ingen bett om en skärmdump, och raderna
    //: om node/python3/Chrome skrevs aldrig ut. Kontrollen fungerade alltså bara när det
    //: inte fanns något att anmärka på. Därav `kasta`: den som frågar EFTER läget får ett
    //: fel att fånga, den som ska TA en bild får avslutet med instruktionen.
    if (kasta) {
      const fel = new Error('puppeteer-core saknas');
      fel.code = 'PUPPETEER_SAKNAS';
      throw fel;
    }
    saknas([
      '',
      'Det som saknas: paketet "puppeteer-core" finns inte i projektet.',
      'Vad det är: motorn som styr din redan installerade Google Chrome så att en sida',
      'kan fotograferas automatiskt. Den laddar inte ned någon egen webbläsare.',
      '',
      'TILL CLAUDE — gör detta åt användaren, be aldrig hen köra det:',
      '  1. Ställ dig i PROJEKTETS rot (inte i pluginens mapp).',
      '  2. Finns ingen package.json där: `npm init -y`',
      '  3. `npm i -D puppeteer-core`',
      '  4. Kör om kommandot — verktyget letar i projektet, så nu hittas det.',
      'Berätta i klartext vad du gjorde ("jag installerade verktyget som tar skärmdumpar").',
      '',
      'Går det inte, eller vill användaren hoppa över bilderna: fortsätt utan dem — men',
      'skriv i rapporten/dashboarden VARFÖR bilden saknas. Ett tomt bildfält läser som',
      'ett slarvfel; en förklaring gör det till ett medvetet val.',
    ])
  }
}

/** Kontrollerar att Chrome finns på disk innan puppeteer försöker starta den. */
export function kravChrome() {
  if (existsSync(CHROME)) return
  saknas([
    '',
    `Det som saknas: Google Chrome hittades inte på ${CHROME}.`,
    'Verktyget styr din vanliga Chrome — någon webbläsare måste alltså finnas installerad.',
    '',
    'TILL CLAUDE: ligger Chrome någon annanstans, sätt CHROME_PATH till den sökvägen och',
    'kör om. Saknas Chrome helt: säg till användaren att den behöver installeras för att',
    'bilderna ska fungera, och fortsätt under tiden utan skärmdumpar (förklara varför).',
  ])
}

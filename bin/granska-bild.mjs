#!/usr/bin/env node
// Granskningslägen för en illustration — gör flerlägesgranskning till ETT kommando.
//
// Varför: en illustration som bara granskas i sitt normalläge granskas i det läge där
// den ser bäst ut. Varje läge nedan fångar en egen felklass som de andra döljer, och
// spegelvändningen fångar den klass ingen annan kan: obalans man blivit blind för genom
// tillvänjning.
//
// Beroende: `puppeteer-core` — saknas det avslutar skriptet med kod 3 och ett läsbart
// krav-fel (bin/krav-puppeteer.mjs), aldrig med en rå ERR_MODULE_NOT_FOUND-stack.
// Paketet slås upp från PROJEKTET (CLAUDE_PROJECT_DIR → cwd → pluginen), så `npm i -D
// puppeteer-core` i projektroten räcker — skriptet behöver inte längre kopieras in någonstans.
// Kräver en installerad Chrome; sätt CHROME_PATH om den ligger annorlunda.
//
// Användning:
//   node granska-bild.mjs --url http://localhost:3002 --ut granskning/     [--selector .ritning]
//   node granska-bild.mjs --svg bild.svg --ut granskning/
//   node granska-bild.mjs --png bild.png --ut granskning/
//   node granska-bild.mjs --diff fore.png efter.png                 → antal skilda bildpunkter
//   node granska-bild.mjs --svglint bild.svg                        → strukturkontroller
//
// Flaggor: --lagen a,b,c (välj lägen)  --liten 300 (px för nedskalningen)
//          --utsnitt x,y,w,h (detaljutsnitt i procent av bilden, kan upprepas)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { laddaPuppeteer, kravChrome, CHROME } from './krav-puppeteer.mjs'

// ---------------------------------------------------------------------------
// Lägena. Varje rad: vad den avslöjar (kommentaren ÄR dokumentationen).
// ---------------------------------------------------------------------------
const LÄGEN = {
  normal: { css: 'none', not: 'utgångsläget' },
  gråskala: { css: 'grayscale(1)', not: 'tonhierarkin utan kulör — håller bilden ihop i svartvitt?' },
  tröskel: {
    css: 'grayscale(1) contrast(600%)',
    not: 'nästan binär: visar vad som bär formen och vad som bara är ton',
  },
  siluett: {
    css: 'brightness(0) saturate(100%)',
    not: 'allt icke-transparent blir svart — form och komposition utan innehåll (kräver genomskinlig botten)',
  },
  spegel: { spegel: true, not: 'OBALANS MAN BLIVIT BLIND FÖR — den enda som fångar tillvänjning' },
  liten: { liten: true, not: 'visuellt brus: vad överlever nedskalning?' },
  mörkbotten: { botten: '#14171a', not: 'håller bilden mot mörk botten (PDF, mörkt tema, projektor)' },
  ljusbotten: { botten: '#ffffff', not: 'håller bilden mot ren vit botten' },
}

// ---------------------------------------------------------------------------
function flagga(namn, förval = null) {
  const i = process.argv.indexOf('--' + namn)
  if (i === -1) return förval
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
function flaggor(namn) {
  const ut = []
  process.argv.forEach((a, i) => {
    if (a === '--' + namn && process.argv[i + 1]) ut.push(process.argv[i + 1])
  })
  return ut
}
// `screenshot()` ger en Uint8Array i nyare puppeteer, och `.toString('base64')` på en
// sådan returnerar kommaseparerade SIFFROR — en tyst trasig data-URL som ger en
// 32×32 brusten bildruta i stället för ett fel. Buffer.from() är det som gör den ärlig.
const dataUrl = (buf, mime) => `data:${mime};base64,${Buffer.from(buf).toString('base64')}`

async function medWebbläsare(fn) {
  //: laddas här, inte vid import: felet ska komma när en bild faktiskt ska tas, och
  //: bära texten ur krav-puppeteer.mjs i stället för en Node-stack.
  kravChrome()
  const puppeteer = await laddaPuppeteer()
  const b = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1'],
  })
  try {
    return await fn(b)
  } finally {
    await b.close()
  }
}

/** Bas-PNG:en allt annat härleds ur. */
async function fångaBas(webbläsare) {
  const url = flagga('url')
  const svg = flagga('svg')
  const png = flagga('png')
  if (png) return readFileSync(resolve(png))

  const sida = await webbläsare.newPage()
  await sida.setViewport({ width: +(flagga('bredd', '1400')), height: 1000, deviceScaleFactor: 2 })

  if (svg) {
    const källa = readFileSync(resolve(svg))
    await sida.setContent(
      `<body style="margin:0;display:inline-block">
         <img id="m" src="${dataUrl(källa, 'image/svg+xml')}" style="display:block">
       </body>`,
      { waitUntil: 'load' },
    )
    await sida.waitForFunction('document.getElementById("m").naturalWidth > 0', { timeout: 20000 })
    const el = await sida.$('#m')
    return await el.screenshot({ omitBackground: true })
  }

  if (!url) {
    console.error('Ange --url, --svg eller --png.')
    process.exit(64)
  }
  await sida.goto(url, { waitUntil: 'networkidle0', timeout: 60000 })
  const sel = flagga('selector')
  if (sel) {
    await sida.waitForSelector(sel, { timeout: 60000 })
    return await (await sida.$(sel)).screenshot()
  }
  return await sida.screenshot({ fullPage: true })
}

/** Ett läge = bas-PNG:en visad under en CSS-transform och skärmdumpad igen. */
async function ritaLäge(webbläsare, bas, läge, cfg, liten) {
  const sida = await webbläsare.newPage()
  const filter = cfg.css && cfg.css !== 'none' ? `filter:${cfg.css};` : ''
  const spegel = cfg.spegel ? 'transform:scaleX(-1);' : ''
  const bredd = cfg.liten ? `width:${liten}px;` : ''
  const botten = cfg.botten ?? 'transparent'
  await sida.setViewport({ width: 1600, height: 1000, deviceScaleFactor: cfg.liten ? 3 : 2 })
  await sida.setContent(
    `<body style="margin:0;background:${botten};display:inline-block">
       <img id="m" src="${dataUrl(bas, 'image/png')}" style="display:block;${filter}${spegel}${bredd}">
     </body>`,
    { waitUntil: 'load' },
  )
  // naturalWidth och inte `complete`: `complete` är sant också för en BRUSTEN bild, och då
  // skärmdumpas den tomma 32×32-rutan utan att något klagar.
  await sida.waitForFunction('document.getElementById("m").naturalWidth > 0', { timeout: 20000 })
  const buf = await (await sida.$('#m')).screenshot({ omitBackground: botten === 'transparent' })
  await sida.close()
  return buf
}

/** Detaljutsnitt i procent av bilden — "zooma in på det som är litet". */
async function ritaUtsnitt(webbläsare, bas, spec, i) {
  const [x, y, w, h] = spec.split(',').map(Number)
  const sida = await webbläsare.newPage()
  await sida.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 3 })
  await sida.setContent(
    `<body style="margin:0;display:inline-block">
       <div id="ram" style="overflow:hidden;position:relative">
         <img id="m" src="${dataUrl(bas, 'image/png')}" style="display:block;position:absolute">
       </div>
       <script>
         const m = document.getElementById('m'), r = document.getElementById('ram');
         m.onload = () => {
           const W = m.naturalWidth, H = m.naturalHeight;
           r.style.width = (W*${w}/100)+'px'; r.style.height = (H*${h}/100)+'px';
           m.style.left = (-W*${x}/100)+'px'; m.style.top = (-H*${y}/100)+'px';
           document.title = 'klar';
         };
         if (m.complete) m.onload();
       </script>
     </body>`,
    { waitUntil: 'load' },
  )
  await sida.waitForFunction('document.title === "klar"')
  const buf = await (await sida.$('#ram')).screenshot()
  await sida.close()
  return buf
}

/**
 * Pixeldiff. Använd den på TVÅ LÄGEN SOM SKA SKILJA SIG, inte bara mellan iterationer —
 * "0 skilda bildpunkter" mellan två inställningar som betyder olika saker är det starkaste
 * beviset som finns för att en kontroll är osynlig.
 */
/**
 * Måtten som PNG-filens header PÅSTÅR, eller null om filen inte är en PNG.
 * IHDR ligger alltid först: 8 byte signatur + 8 byte chunk-huvud, sedan bredd och höjd
 * som 32-bitars big-endian. Används för att avslöja avhuggna filer — de avkodas delvis
 * och gav tidigare ett självsäkert mätvärde på en bild som inte fanns i sin helhet.
 */
function pngMått(fil) {
  try {
    const b = readFileSync(fil)
    if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
  } catch {
    return null
  }
}

/**
 * Är PNG-filen komplett? En hel PNG slutar alltid med IEND-chunken.
 *
 * ⚠️ Måtten i headern duger INTE som kontroll: Chrome avkodar en avhuggen PNG i sin fulla
 * deklarerade storlek och fyller resten, så bilden ser hel ut. Uppmätt 2026-08-18: de
 * första 2 000 av 70 000 byte gav svaret `{"skilda": 5293800, "andel": 0.98}` — ett
 * självsäkert mätvärde på en bild som inte fanns. Skillen kräver "påstå det aldrig utan
 * att ha mätt"; då får verktyget inte heller mäta på något ofullständigt utan att säga det.
 */
function pngKomplett(fil) {
  try {
    const b = readFileSync(fil)
    if (b.length < 12 || b.readUInt32BE(0) !== 0x89504e47) return true // inte PNG → låt bildladdaren avgöra
    return b.subarray(b.length - 8, b.length - 4).toString('latin1') === 'IEND'
  } catch {
    return true
  }
}

async function diffa(a, b) {
  for (const [fil, vilken] of [[a, 'första'], [b, 'andra']]) {
    if (!pngKomplett(resolve(fil)))
      return { fel: `${vilken} bilden (${fil}) är en ofullständig PNG — filen saknar sin avslutningsmarkör och är troligen halvskriven. Ta om skärmdumpen; mät inte på den.` }
  }
  return medWebbläsare(async (w) => {
    const sida = await w.newPage()
    await sida.setContent('<body></body>')
    return await sida.evaluate(
      async (da, db, hdrA, hdrB) => {
        //: ⚠️ onerror OCH timeout är båda nödvändiga. Uppmätt 2026-08-18: laddaren lyssnade
        //: bara på onload, så en fil som inte gick att avkoda (0 byte, eller ren text med
        //: .png-ändelse) gav ett löfte som aldrig infriades — Promise.all löstes aldrig,
        //: Chrome stod kvar, och processen hängde för evigt utan ett ord. Grinden körs på
        //: VARJE post i ett obevakat pass: en halvskriven PNG stoppade alltså hela natten.
        const ladda = (d, namn) =>
          new Promise((k, avbryt) => {
            const i = new Image()
            const klocka = setTimeout(
              () => avbryt(new Error(`${namn}: bilden kunde inte läsas inom 15 s`)), 15000)
            i.onload = () => { clearTimeout(klocka); k(i) }
            i.onerror = () => { clearTimeout(klocka); avbryt(new Error(`${namn}: går inte att läsa som bild (tom eller trasig fil?)`)) }
            i.src = d
          })
        let ia, ib
        try {
          ;[ia, ib] = await Promise.all([ladda(da, 'första bilden'), ladda(db, 'andra bilden')])
        } catch (e) {
          return { fel: e.message }
        }
        //: en AVHUGGEN PNG avkodas delvis och svarade tidigare självsäkert med ett tal.
        //: Headern bär de mått filen PÅSTÅR sig ha; stämmer de inte med det avkodade är
        //: filen ofullständig och talet vore ett mätvärde på något som inte finns.
        if (hdrA && (hdrA.w !== ia.width || hdrA.h !== ia.height))
          return { fel: `första bilden är ofullständig: filen anger ${hdrA.w}×${hdrA.h}, kunde bara läsa ${ia.width}×${ia.height}` }
        if (hdrB && (hdrB.w !== ib.width || hdrB.h !== ib.height))
          return { fel: `andra bilden är ofullständig: filen anger ${hdrB.w}×${hdrB.h}, kunde bara läsa ${ib.width}×${ib.height}` }
        if (ia.width !== ib.width || ia.height !== ib.height)
          return { fel: `olika storlek: ${ia.width}×${ia.height} mot ${ib.width}×${ib.height}` }
        const rita = (i) => {
          const c = document.createElement('canvas')
          c.width = i.width
          c.height = i.height
          c.getContext('2d').drawImage(i, 0, 0)
          return c.getContext('2d').getImageData(0, 0, i.width, i.height).data
        }
        const [pa, pb] = [rita(ia), rita(ib)]
        let n = 0
        for (let i = 0; i < pa.length; i += 4) {
          if (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2] || pa[i + 3] !== pb[i + 3]) n++
        }
        return { skilda: n, totalt: pa.length / 4, andel: n / (pa.length / 4) }
      },
      dataUrl(readFileSync(resolve(a)), 'image/png'),
      dataUrl(readFileSync(resolve(b)), 'image/png'),
      pngMått(resolve(a)),
      pngMått(resolve(b)),
    )
  })
}

/**
 * Strukturkontroller som ögat inte gör. Körs i Chrome, så `getBBox()` är den riktiga
 * geometrin och inte en gissning ur källtexten.
 */
async function svglint(fil) {
  const källa = readFileSync(resolve(fil), 'utf8')
  return medWebbläsare(async (w) => {
    const sida = await w.newPage()
    await sida.setContent(`<body style="margin:0">${källa}</body>`, { waitUntil: 'load' })
    return await sida.evaluate(() => {
      const svg = document.querySelector('svg')
      if (!svg) return { fel: 'ingen <svg> hittades' }
      const alla = [...svg.querySelectorAll('*')]
      const fynd = []

      const ider = alla.map((e) => e.id).filter(Boolean)
      const dubbla = [...new Set(ider.filter((i, k) => ider.indexOf(i) !== k))]
      if (dubbla.length) fynd.push({ slag: 'dubbla id', detalj: dubbla })

      const brutna = []
      for (const e of alla) {
        for (const a of e.attributes) {
          const m = /url\(#([^)]+)\)/.exec(a.value)
          if (m && !svg.querySelector(`#${CSS.escape(m[1])}`))
            brutna.push(`${e.tagName}.${a.name} → #${m[1]}`)
        }
      }
      if (brutna.length) fynd.push({ slag: 'brutna referenser', detalj: brutna })

      const vb = svg.viewBox.baseVal
      const utanför = []
      const osynliga = []
      for (const e of alla) {
        if (!e.getBBox || ['defs', 'symbol', 'title', 'desc', 'style', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'filter', 'pattern'].includes(e.tagName)) continue
        if (e.closest('defs')) continue
        let b
        try { b = e.getBBox() } catch { continue }
        const s = getComputedStyle(e)
        const ritar = !(s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0)
        const målar = !(s.fill === 'none' && s.stroke === 'none')
        if (b.width === 0 && b.height === 0 && e.children.length === 0)
          osynliga.push(`${e.tagName}${e.id ? '#' + e.id : ''} — nollstor`)
        else if (ritar && !målar && e.children.length === 0)
          osynliga.push(`${e.tagName}${e.id ? '#' + e.id : ''} — varken fill eller stroke`)
        if (vb.width && (b.x + b.width < vb.x || b.x > vb.x + vb.width || b.y + b.height < vb.y || b.y > vb.y + vb.height))
          utanför.push(`${e.tagName}${e.id ? '#' + e.id : ''}`)
      }
      if (utanför.length) fynd.push({ slag: 'helt utanför viewBox', detalj: utanför })
      if (osynliga.length) fynd.push({ slag: 'ritar ingenting', detalj: osynliga })

      const tunga = [...svg.querySelectorAll('path')]
        .map((p) => ({ id: p.id || '(namnlös)', noder: (p.getAttribute('d') || '').split(/(?=[MLCQAZmlcqaz])/).length }))
        .filter((p) => p.noder > 400)
      if (tunga.length) fynd.push({ slag: 'mycket nodrika paths', detalj: tunga })

      return { element: alla.length, namngivna: ider.length, viewBox: svg.getAttribute('viewBox'), fynd }
    })
  })
}

// ---------------------------------------------------------------------------
;(async () => {
  const diff = flaggor('diff')
  if (flagga('diff')) {
    const a = process.argv[process.argv.indexOf('--diff') + 1]
    const b = process.argv[process.argv.indexOf('--diff') + 2]
    if (!a || !b || b.startsWith('--')) {
      console.error('[webapp-kit] --diff behöver TVÅ bildfiler: --diff <före.png> <efter.png>')
      process.exit(64)
    }
    const r = await diffa(a, b)
    console.log(JSON.stringify(r, null, 2))
    //: en misslyckad mätning får inte se ut som en godkänd grind — webapp-batch använder
    //: diffen som DoD ("Diff = 0 → bilden är bevisat oförändrad"), och den som kollar
    //: utgångskoden skulle annars läsa ett fel som ett godkänt. --svglint gör redan så här.
    process.exit(r.fel ? 1 : 0)
    return
  }
  const lint = flagga('svglint')
  if (lint) {
    const r = await svglint(lint)
    console.log(JSON.stringify(r, null, 2))
    process.exit(r.fel || (r.fynd && r.fynd.length) ? 1 : 0)
  }

  const ut = flagga('ut', 'granskning')
  const valda = (flagga('lagen') || Object.keys(LÄGEN).join(',')).split(',').map((s) => s.trim())
  const liten = +(flagga('liten', '300'))
  const utsnitt = flaggor('utsnitt')
  //: kraven FÖRST — annars lämnas en tom granskningsmapp efter ett kravfel.
  kravChrome()
  await laddaPuppeteer()
  if (!existsSync(ut)) mkdirSync(ut, { recursive: true })

  await medWebbläsare(async (w) => {
    const bas = await fångaBas(w)
    writeFileSync(join(ut, 'bas.png'), bas)
    const kort = []
    for (const namn of valda) {
      const cfg = LÄGEN[namn]
      if (!cfg) { console.error(`okänt läge: ${namn}`); continue }
      const buf = await ritaLäge(w, bas, namn, cfg, liten)
      writeFileSync(join(ut, `${namn}.png`), buf)
      kort.push({ fil: `${namn}.png`, namn, not: cfg.not })
    }
    for (let i = 0; i < utsnitt.length; i++) {
      const buf = await ritaUtsnitt(w, bas, utsnitt[i], i)
      writeFileSync(join(ut, `utsnitt-${i + 1}.png`), buf)
      kort.push({ fil: `utsnitt-${i + 1}.png`, namn: `utsnitt ${i + 1}`, not: `${utsnitt[i]} (x,y,b,h i % av bilden)` })
    }
    const html =
      `<!doctype html><meta charset="utf-8"><title>Granskningslägen</title>` +
      `<style>body{margin:0;padding:24px;background:#f4f2ec;font:13px/1.5 system-ui,sans-serif;color:#232823}` +
      `h1{font-size:15px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 18px}` +
      `figure{margin:0 0 26px;background:#fff;border:1px solid #d9d5c9;padding:12px}` +
      `figcaption{margin-bottom:8px}b{letter-spacing:.06em;text-transform:uppercase}` +
      `img{max-width:100%;display:block;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 50%/16px 16px}</style>` +
      `<h1>Granskningslägen</h1>` +
      kort.map((k) => `<figure><figcaption><b>${k.namn}</b> — ${k.not}</figcaption><img src="${k.fil}"></figure>`).join('')
    writeFileSync(join(ut, 'kontaktkarta.html'), html)
    console.log(JSON.stringify({ ok: true, ut, lägen: kort.map((k) => k.namn), kontaktkarta: join(ut, 'kontaktkarta.html') }, null, 2))
  })
})().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})

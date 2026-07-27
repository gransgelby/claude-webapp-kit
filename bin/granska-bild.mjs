#!/usr/bin/env node
// Granskningslägen för en illustration — gör flerlägesgranskning till ETT kommando.
//
// Varför: en illustration som bara granskas i sitt normalläge granskas i det läge där
// den ser bäst ut. Varje läge nedan fångar en egen felklass som de andra döljer, och
// spegelvändningen fångar den klass ingen annan kan: obalans man blivit blind för genom
// tillvänjning.
//
// Beroende: `puppeteer-core` måste finnas i DEN KATALOG SKRIPTET LIGGER I:s projekt
// (ESM löser paketnamn relativt den importerande filen). Kopiera därför skriptet in i
// konsument-projektets `scripts/` — samma skäl som `shot.mjs` och linterna. Kräver en
// installerad Chrome; sätt CHROME_PATH om den ligger annorlunda.
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
import puppeteer from 'puppeteer-core'

const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

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
async function diffa(a, b) {
  return medWebbläsare(async (w) => {
    const sida = await w.newPage()
    await sida.setContent('<body></body>')
    return await sida.evaluate(
      async (da, db) => {
        const ladda = (d) =>
          new Promise((k) => {
            const i = new Image()
            i.onload = () => k(i)
            i.src = d
          })
        const [ia, ib] = await Promise.all([ladda(da), ladda(db)])
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
    console.log(JSON.stringify(await diffa(a, b), null, 2))
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

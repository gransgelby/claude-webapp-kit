#!/usr/bin/env node
// File screenshot of ONE element (the changed part of the UI) → PNG.
// Used for before/after composites on GUI changes (see bin/compose.py).
//
// Why: MCP-preview screenshots are only given inline (no file bytes) → they can't
// be cropped/composed. This takes a file screenshot of just the changed element via
// your INSTALLED Google Chrome (puppeteer-core, no browser download).
//
// Dependency: puppeteer-core must be installed (npm i -D puppeteer-core). It drives
// your existing Chrome; set CHROME_PATH if Chrome lives somewhere non-default.
// Saknas paketet eller Chrome avslutar skriptet med kod 3 och ett läsbart svenskt
// krav-fel (bin/krav-puppeteer.mjs) i stället för en rå ERR_MODULE_NOT_FOUND-stack.
//
// Requires: a running dev server serving the --url you pass (any host/port).
//
// Usage:
//   node bin/shot.mjs --url http://localhost:3000/some/page --out /tmp/x.png --find "Some text"
//   node bin/shot.mjs --url ... --out ... --selector ".some-card"   [--pad 14] [--width 900] [--scale 2] [--full]
//
// Element selection: --selector <css>  OR  --find <text> (first element whose text
// starts with the text; its nearest row-container is screenshotted). --full = whole page.

import { laddaPuppeteer, kravChrome, CHROME } from './krav-puppeteer.mjs'

function arg(name, def) {
  const i = process.argv.indexOf('--' + name)
  if (i === -1) return def
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}

const url = arg('url')
const out = arg('out')
const selector = arg('selector')
const find = arg('find')
const pad = parseInt(arg('pad', '14'), 10)
const width = parseInt(arg('width', '900'), 10)
const scale = parseInt(arg('scale', '2'), 10)
const full = arg('full', false)

if (!url || !out || (!selector && !find && !full)) {
  console.error('Required: --url, --out and (--selector | --find | --full)')
  process.exit(64)
}

;(async () => {
  kravChrome()
  const puppeteer = await laddaPuppeteer()
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars'],
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width, height: 1500, deviceScaleFactor: scale })
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 })
    await new Promise((r) => setTimeout(r, 1800)) // client render/hydration

    if (full) {
      await page.screenshot({ path: out, fullPage: true })
      console.log('OK full')
      return
    }

    const clip = await page.evaluate((selector, find, pad) => {
      window.scrollTo(0, 0)
      let el = null
      if (selector) {
        el = document.querySelector(selector)
      } else {
        const label = [...document.querySelectorAll('span,div,p,h1,h2,h3,button,a')]
          .find((e) => (e.textContent || '').trim().startsWith(find) && e.children.length <= 2)
        el = label ? (label.closest('div') || label) : null
      }
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        x: Math.max(0, r.left - pad), y: Math.max(0, r.top - pad),
        width: Math.min(window.innerWidth, r.width + pad * 2),
        height: r.height + pad * 2,
      }
    }, selector, find, pad)

    if (!clip || clip.width < 2 || clip.height < 2) {
      console.error('ELEMENT_NOT_FOUND'); process.exit(2)
    }
    await page.screenshot({ path: out, clip })
    console.log('OK ' + JSON.stringify(clip))
  } finally {
    await browser.close()
  }
})().catch((e) => { console.error(e.message); process.exit(1) })

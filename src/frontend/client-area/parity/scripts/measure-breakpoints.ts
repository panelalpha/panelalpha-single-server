// One-off measurement of the legacy (Vuetify 2) breakpoint table, for the signed-in-shell Phase 1 note.
//
//   node parity/scripts/measure-breakpoints.ts [out.json]
//
// Opens the deployed legacy signed in on /instances with `shell-default`-like fixtures, resizes the viewport one pixel at a
// time around every edge (576, 768, 976/992, 1200/1216, 1416) and reads `$vuetify.breakpoint` plus the `.v-app-bar` height at
// each width. Not part of the test suite and not run by `npm run parity`.
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const LEGACY_URL = (process.env.PARITY_LEGACY_URL ?? '').replace(/\/$/, '')
if (!LEGACY_URL) {
  throw new Error('Set PARITY_LEGACY_URL to the deployed legacy client area')
}
const readFixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'))

const home = readFixture('home.json')
home.user = { email: 'jane@example.com', name: 'Jane Doe', gravatar_hash: 'x', language: 'en', services: [], has_hosting_access: true, reseller_settings: {} }
const translation = readFixture('translation.en.json')

const ranges: Array<[number, number]> = [[560, 590], [755, 780], [962, 1006], [1186, 1230], [1405, 1428]]
const widths = ranges.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_unused, index) => from + index))

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
await context.addCookies([{ name: 'XSRF-TOKEN', value: 'parity-xsrf-token', url: LEGACY_URL }])
await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort('blockedbyclient'))
await context.route(/^https?:\/\/www\.gravatar\.com\//, route => route.abort('blockedbyclient'))
await context.route('**/api/**', route => {
  const url = new URL(route.request().url())
  const path = url.pathname.replace(/^.*?\/api(?=\/)/, '')
  if (path === '/home') {
    return route.fulfill({ json: home })
  }
  if (/^\/[A-Za-z_-]+\/translation\.json$/.test(path)) {
    return route.fulfill({ json: translation })
  }
  if (path === '/instances') {
    return route.fulfill({ json: { data: [], meta: { total: 0 } } })
  }
  if (path === '/notifications') {
    return route.fulfill({ json: { data: [], meta: { total: 0 } } })
  }
  if (path === '/labels') {
    return route.fulfill({ json: { data: [] } })
  }
  return route.fulfill({ status: 204, body: '' })
})
const page = await context.newPage()
await page.routeWebSocket('**', ws => ws.close())
await page.addInitScript(() => localStorage.setItem(`${window.location.origin}-loggedin`, 'true'))
await page.goto(`${LEGACY_URL}/instances`, { waitUntil: 'domcontentloaded' })
await page.locator('.v-app-bar').waitFor()

const rows = []
for (const width of widths) {
  await page.setViewportSize({ width, height: 900 })
  // Vuetify 2 debounces its resize handler; wait until the reported width follows the viewport.
  await page.waitForFunction(w => (document.querySelector('#app') as any).__vue__.$vuetify.breakpoint.width === w, width).catch(() => undefined)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  rows.push({
    viewport: width,
    ...await page.evaluate(() => {
      const bp = (document.querySelector('#app') as any).__vue__.$vuetify.breakpoint
      return {
        name: bp.name,
        width: bp.width,
        mobile: bp.mobile,
        smAndDown: bp.smAndDown,
        mdAndDown: bp.mdAndDown,
        thresholds: bp.thresholds,
        mobileBreakpoint: bp.mobileBreakpoint,
        scrollBarWidth: bp.scrollBarWidth,
        innerWidth: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        appBarHeight: document.querySelector('.v-app-bar')!.getBoundingClientRect().height,
      }
    }),
  })
}
await browser.close()

const out = process.argv[2]
if (out) {
  writeFileSync(out, `${JSON.stringify(rows, null, 2)}\n`)
}
console.table(rows.map(({ thresholds: _thresholds, ...row }) => row))
console.log('thresholds', JSON.stringify(rows[0]?.thresholds), 'mobileBreakpoint', rows[0]?.mobileBreakpoint)

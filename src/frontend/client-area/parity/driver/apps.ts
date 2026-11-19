import type { AppName, ParityState, Variant } from '../states/state'
import type { FixtureSession } from './fixtures'
import type { MediaTracker } from './stabilize'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { installFixtures } from './fixtures'
import { FREEZE_CSS, trackMedia } from './stabilize'
import { targetOf, targetUrl } from './targets'

export const NEXT_URL = `http://localhost:${process.env.PARITY_NEXT_PORT ?? 4174}`

// Same weights and styles as next's unplugin-fonts config (vite.config.ts). Weight 900 is requested by legacy
// and not loaded by next, so it is left out: both apps then synthesize it from the same files.
const FONT_WEIGHTS = [200, 300, 400, 600, 700, 800]
const FONT_ROUTE = '/__parity-fonts/'

/** One fixed image for every Gravatar request, so the avatar never depends on the network. */
const AVATAR_PNG = readFileSync(new URL('../fixtures/avatar.png', import.meta.url))

const fontsourceDir = dirname(createRequire(import.meta.url).resolve('@fontsource/nunito-sans/package.json'))

const fontFaceCss = new Map<string, string>()

/** The `@font-face` rules next loads (one `@fontsource` sheet per weight and style, all subsets), pointed at a route of the legacy `origin`. */
function nunitoFontFaceCss (origin: string): string {
  const cached = fontFaceCss.get(origin)
  if (cached !== undefined) {
    return cached
  }
  const css = FONT_WEIGHTS
    .flatMap(weight => [`${weight}.css`, `${weight}-italic.css`])
    .map(sheet => readFileSync(resolve(fontsourceDir, sheet), 'utf8').replaceAll('url(./files/', `url(${origin}${FONT_ROUTE}`))
    .join('\n')
  fontFaceCss.set(origin, css)
  return css
}

/**
 * Legacy imports Nunito Sans from fonts.googleapis.com (`_fonts.scss:1`), a different file set from the
 * `@fontsource/nunito-sans` files next bundles. To compare identical glyphs, answer the css2 sheet with the
 * fontsource rules and abort anything on fonts.gstatic.com, so no Google file slips in.
 */
async function serveFontsourceToLegacy (context: BrowserContext, origin: string): Promise<void> {
  const css = nunitoFontFaceCss(origin)
  await context.route(/^https:\/\/fonts\.googleapis\.com\/css2/, route => route.fulfill({
    status: 200,
    contentType: 'text/css; charset=utf-8',
    headers: { 'access-control-allow-origin': '*' },
    body: css,
  }))
  await context.route(/^https:\/\/fonts\.gstatic\.com\//, route => route.abort('blockedbyclient'))
  await context.route(`${origin}${FONT_ROUTE}*`, async route => {
    const name = new URL(route.request().url()).pathname.slice(FONT_ROUTE.length)
    if (!/^nunito-sans-[\w-]+\.woff2?$/.test(name)) {
      return route.abort('blockedbyclient')
    }
    let body: Buffer
    try {
      body = readFileSync(resolve(fontsourceDir, 'files', name))
    } catch (error) {
      // An unanswered route leaves the request pending, and capture then times out on "fonts still loading".
      console.error(`Harness error: @fontsource/nunito-sans has no file ${name}`, error)
      return route.abort('failed')
    }
    await route.fulfill({
      status: 200,
      contentType: name.endsWith('.woff2') ? 'font/woff2' : 'font/woff',
      headers: { 'access-control-allow-origin': '*' },
      body,
    })
  })
}

/**
 * Both apps build the avatar URL protocol-relative (`//www.gravatar.com/avatar/<hash>?d=robohash&s=<size>`), so it is
 * https on the legacy origin and http on next's. A regex rather than a glob: the query string has to match too.
 */
async function serveFixedAvatar (context: BrowserContext): Promise<void> {
  await context.route(/^https?:\/\/www\.gravatar\.com\/avatar\//, route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: AVATAR_PNG,
  }))
}

/**
 * Opt-in (`PARITY_LEGACY_VIA_REQUEST=1`) for a cloud container whose egress proxy re-terminates the browser's TLS and refuses the legacy
 * host's self-signed certificate (502 „upstream request failed”): every legacy request the fixtures do not answer is fetched by Playwright's
 * Node-side client through the same proxy (`use.proxy` in playwright.config.ts) and handed back to the page unchanged. Registered before the
 * font routes, so they still win (context routes added later take precedence).
 */
async function fetchLegacyFromNode (context: BrowserContext, origin: string): Promise<void> {
  await context.route(`${origin}/**`, async route => {
    const response = await route.fetch()
    await route.fulfill({ response })
  })
}

export interface OpenedState {
  page: Page
  context: BrowserContext
  fixtures: FixtureSession
  media: MediaTracker
}

export async function openState (browser: Browser, app: AppName, state: ParityState, variant: Variant): Promise<OpenedState> {
  const context = await browser.newContext({
    viewport: variant.viewport,
    ignoreHTTPSErrors: true,
    deviceScaleFactor: 1,
    // Stała strefa czasu po obu stronach (dzień miesiąca w harmonogramie Backups zależy od strefy).
    timezoneId: 'UTC',
  })
  const legacyUrl = targetUrl(targetOf(state))
  await context.addCookies([legacyUrl, NEXT_URL].map(url => ({ name: 'XSRF-TOKEN', value: 'parity-xsrf-token', url })))

  if (app === 'legacy') {
    if (process.env.PARITY_LEGACY_VIA_REQUEST === '1') {
      await fetchLegacyFromNode(context, legacyUrl)
    }
    await serveFontsourceToLegacy(context, legacyUrl)
  }
  await serveFixedAvatar(context)

  const page = await context.newPage()
  await page.routeWebSocket('**', ws => ws.close())
  await page.addInitScript(({ css, legacy }) => {
    const apply = () => {
      const style = document.createElement('style')
      style.textContent = css
      document.documentElement.append(style)
      if (legacy) {
        document.body?.classList.add('no-transition')
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', apply, { once: true })
    } else {
      apply()
    }
  }, { css: FREEZE_CSS, legacy: app === 'legacy' })

  // Deterministic "copied" in both apps without depending on headless clipboard permission and user activation.
  // A state action reads the text from `window.__parityClipboard`.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          ;(window as unknown as { __parityClipboard?: string }).__parityClipboard = text
          return Promise.resolve()
        },
      },
    })
  })

  if (state.signedIn && app === 'legacy') {
    // Legacy `Auth.isLoggedIn()`: `<origin>-loggedin` in localStorage plus the XSRF-TOKEN cookie (seeded above).
    await page.addInitScript(() => {
      localStorage.setItem(`${window.location.origin}-loggedin`, 'true')
    })
  }
  if (variant.theme === 'dark') {
    // Legacy `InstanceNoData` picks its background from `localStorage.isDarkMode` (written by the user menu), not from the
    // theme, so a fresh dark context showed the light first-visit image. Both apps run as a returning dark-mode user.
    await page.addInitScript(() => {
      localStorage.setItem('isDarkMode', 'true')
    })
  }
  if (state.localStorage !== undefined) {
    // Same for both apps: the keys are resolved against each page's own origin, so the flow reads what the state wrote.
    await page.addInitScript(seed => {
      for (const [key, value] of Object.entries(seed)) {
        localStorage.setItem(key.replace('{origin}', window.location.origin), value)
      }
    }, state.localStorage)
  }
  if (state.clock !== undefined) {
    await page.clock.setFixedTime(new Date(state.clock))
  }

  const media = trackMedia(page)
  const fixtures = await installFixtures(page, state, variant, app)
  const base = app === 'legacy' ? legacyUrl : NEXT_URL
  await page.goto(`${base}${state.path}`, { waitUntil: 'domcontentloaded' })
  for (const action of state.actions[app]) {
    await action(page)
  }

  return { page, context, fixtures, media }
}

import type { ElementSnapshot } from '../lib/compare'
import type { Probe } from '../lib/probe'
import type { AppName } from '../states/state'
import type { MediaTracker } from './stabilize'
import type { Page } from '@playwright/test'
import { STYLE_PROPERTIES } from '../lib/compare'
import { normalizeFontName } from '../lib/fonts'

/** Reads computed styles (of `probe.pseudo` when set), bounding box and normalized text of the probe's element. */
export async function collectElement (page: Page, probe: Probe, app: AppName): Promise<ElementSnapshot> {
  const locator = probe[app](page)
  const count = await locator.count()
  if (count === 0) {
    return { missing: true }
  }
  if (count > 1) {
    throw new Error(`Harness error: probe "${probe.key}" matched ${count} elements in ${app}`)
  }
  const data = await locator.evaluate((element, { properties, pseudo, styleOnly }) => {
    const computed = getComputedStyle(element, pseudo)
    const rect = element.getBoundingClientRect()
    return {
      styles: Object.fromEntries(properties.map(property => [property, computed.getPropertyValue(property)])),
      // Page coordinates, so scroll position never shifts the comparison.
      box: { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height },
      // A pseudo-element probe pairs a host element in one app with a different element in the other (the button vs its
      // `.v-btn__overlay`), so their text is not comparable.
      text: styleOnly ? '' : (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    }
  }, { properties: [...STYLE_PROPERTIES], pseudo: probe.pseudo?.[app] ?? null, styleOnly: probe.pseudo !== undefined })
  return { missing: false, ...data }
}

/**
 * Puts every scroll position back to the start before the probes read the layout. A page left scrolled sideways (a mobile dialog,
 * a wide table) moves elements inside its scroll container, and that shows up as a delta on the chrome.
 */
export async function resetScroll (page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    for (const element of document.querySelectorAll<HTMLElement>('*')) {
      // A V4 tab strip keeps its centred tab in `scrollLeft`; V2 kept it as a `translateX` that this reset never touched. Resetting
      // only the V4 side would move the active tab off screen on next alone, so strips are skipped.
      if (element.scrollLeft > 0 && !element.classList.contains('v-slide-group__container')) {
        element.scrollLeft = 0
      }
    }
  })
}

/** Font files the page loaded (woff, woff2, ttf, otf), by file name without a bundler content hash. */
export function collectFonts (media: MediaTracker): string[] {
  const names = media.fontUrls
    .map(url => new URL(url).pathname.split('/').pop() ?? '')
    .filter(name => /\.(?:woff2?|ttf|otf)$/i.test(name))
    .map(name => normalizeFontName(name))
  return [...new Set(names)].toSorted()
}

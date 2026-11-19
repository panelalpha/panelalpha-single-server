import type { FixtureSession } from './fixtures'
import type { Locator, Page, Request } from '@playwright/test'
import { expect } from '@playwright/test'

export const MASK_COLOR = '#ff00ff'
const MAX_STABLE_ATTEMPTS = 12
const MEDIA_TIMEOUT_MS = 45_000

export const FREEZE_CSS = '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}'

export interface MediaTracker {
  readonly pending: number
  /** URLs of every font request that finished. Resource Timing cannot be used for this: its 250-entry buffer fills up on legacy's chunk prefetching. */
  readonly fontUrls: string[]
}

/** Counts image/font requests still loading (stylesheets are excluded on purpose). */
export function trackMedia (page: Page): MediaTracker {
  const open = new Set<Request>()
  const fontUrls = new Set<string>()
  const isMedia = (request: Request) => ['image', 'font'].includes(request.resourceType())
  page.on('request', request => {
    if (isMedia(request)) {
      open.add(request)
    }
  })
  page.on('requestfinished', request => {
    open.delete(request)
    if (request.resourceType() === 'font') {
      fontUrls.add(request.url())
    }
  })
  page.on('requestfailed', request => open.delete(request))
  return {
    get pending () {
      return open.size
    },
    get fontUrls () {
      return [...fontUrls]
    },
  }
}

/** Runs in the page: `true` when no overlay is entering or leaving (see `captureStable`). Self-contained, it is serialized into the page. */
function overlaySettled (): Promise<boolean> {
  const read = () => JSON.stringify(
    [...document.querySelectorAll('.v-overlay--active .v-overlay__content, .v-overlay--active .v-overlay__scrim')].map(element => {
      const rect = element.getBoundingClientRect()
      return [rect.x, rect.y, rect.width, rect.height, getComputedStyle(element).opacity]
    }),
  )
  const opaque = () => [...document.querySelectorAll('.v-overlay--active .v-overlay__content')].every(element => getComputedStyle(element).opacity === '1')
  return new Promise(resolve => {
    const first = read()
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(first === read() && opaque())))
  })
}

export interface CaptureOptions {
  /** Readiness anchor: must be visible before capture. */
  anchor: Locator
  media: MediaTracker
  masks?: Locator[]
  /** `'keep'` skips the pointer reset and the blur (hover and focus states). Default `'reset'`. */
  pointer?: 'reset' | 'keep'
  /** `false` skips the wait for `GET /home` (states where legacy never calls it). Default `true`. */
  expectHome?: boolean
  /** `false` captures the viewport only (`ParityState.viewportOnly`). Default `true`: the full page. */
  fullPage?: boolean
}

export async function captureStable (page: Page, fixtures: FixtureSession, { anchor, media, masks = [], pointer = 'reset', expectHome = true, fullPage = true }: CaptureOptions): Promise<Buffer> {
  if (expectHome) {
    await expect.poll(() => fixtures.homeCount, { message: 'GET /home was never served' }).toBeGreaterThanOrEqual(1)
  }
  await expect(anchor).toBeVisible()
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await expect.poll(() => fixtures.inflight, { message: 'fixture requests still in flight' }).toBe(0)
  // Legacy is a live deploy: a 170 kB static background (`instances-background.*.png`) can take ~10 s from this server, longer than the 5 s default.
  await expect.poll(() => media.pending, { message: 'images or fonts still loading', timeout: MEDIA_TIMEOUT_MS }).toBe(0)
  // An open overlay (dialog, menu, share modal) is settled once its content and scrim keep the same box and opacity across two frames
  // and the content is fully opaque. The frozen CSS does not stop JS-driven enter transitions, so the state is awaited, not a delay.
  await expect.poll(() => page.evaluate(overlaySettled), { message: 'overlay transition still running' }).toBe(true)
  await page.evaluate(() => Promise.all([...document.images].map(img => img.decode().catch(() => undefined))).then(() => undefined))

  if (pointer === 'reset') {
    await page.mouse.move(0, 0)
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    })
  }

  const shoot = () => page.screenshot({
    fullPage,
    animations: 'disabled',
    caret: 'hide',
    mask: masks,
    maskColor: MASK_COLOR,
  })

  let previous = await shoot()
  for (let attempt = 1; attempt < MAX_STABLE_ATTEMPTS; attempt++) {
    const current = await shoot()
    if (current.equals(previous)) {
      return current
    }
    previous = current
  }
  throw new Error(`Harness error: screenshot not stable after ${MAX_STABLE_ATTEMPTS} attempts`)
}

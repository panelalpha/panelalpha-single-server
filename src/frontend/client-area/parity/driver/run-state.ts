import type { ElementSnapshot } from '../lib/compare'
import type { LegacyCapture } from '../lib/legacy-cache'
import type { AppName, ParityState, Variant } from '../states/state'
import type { OpenedState } from './apps'
import type { Browser, TestInfo } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect } from '@playwright/test'
import { compareProbe } from '../lib/compare'
import { loadExceptions } from '../lib/exceptions'
import { readCapture, writeCapture } from '../lib/legacy-cache'
import { comparePng } from '../lib/pixel'
import { deriveStatus } from '../lib/status'
import { openState } from './apps'
import { collectElement, collectFonts, resetScroll } from './collect'
import { legacyCacheDir, legacyCacheKey, legacyCacheMode } from './legacy-cache'
import { parityOutputDir } from './output-dir'
import { captureStable } from './stabilize'
import { targetOf } from './targets'

export const parityRoot = parityOutputDir()

let cachedCommit: string | undefined

/** Short HEAD of next, with `+dirty` when the working tree has uncommitted changes. */
export function nextCommit (): string {
  if (!cachedCommit) {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' }).trim()
    cachedCommit = `${git('rev-parse', '--short', 'HEAD')}${git('status', '--porcelain') === '' ? '' : '+dirty'}`
  }
  return cachedCommit
}

/**
 * Runs one state in one variant: opens both apps on the same fixtures, captures, compares
 * and writes `result.json`. Legacy is taken from the legacy cache when it holds this state (`driver/legacy-cache.ts`). Harness errors throw; with PARITY_GATE=1 a FAIL status fails the test.
 */
export async function runState (browser: Browser, testInfo: TestInfo, state: ParityState): Promise<void> {
  const variant: Variant = {
    name: testInfo.project.name,
    theme: testInfo.project.metadata.theme,
    viewport: testInfo.project.use.viewport!,
  }
  const probes = state.probes.filter(probe => probe.when?.(variant) ?? true)
  const dir = resolve(parityRoot, state.id, variant.name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  const cacheMode = legacyCacheMode()
  const cacheKey = legacyCacheKey(testInfo.file, state, variant, browser.version())
  const probeKeys = probes.map(probe => probe.key)
  const cached = cacheKey === undefined || cacheMode === 'refresh' ? undefined : readCapture(legacyCacheDir(), cacheKey, probeKeys)
  const live: AppName[] = cached ? ['next'] : ['legacy', 'next']

  const opened: Partial<Record<AppName, OpenedState>> = {}
  try {
    for (const app of live) {
      opened[app] = await openState(browser, app, state, variant)
    }
    const unmatchedRequests = () => Object.entries(opened).flatMap(([app, { fixtures }]) => fixtures.unmatched.map(key => `${app}: ${key}`))
    const captures = {} as Record<AppName, LegacyCapture>
    try {
      for (const app of live) {
        const { page, fixtures, media } = opened[app]!
        if (!state.keepScroll) {
          await resetScroll(page)
        }
        const png = await captureStable(page, fixtures, {
          media,
          // A state without probes has no element to wait for: the page body is the readiness anchor.
          anchor: probes[0]?.[app](page) ?? page.locator('body'),
          masks: (state.masks?.[app] ?? []).map(mask => mask(page)),
          pointer: state.pointer,
          expectHome: state.expectHome,
          fullPage: !(typeof state.viewportOnly === 'function' ? state.viewportOnly(variant) : state.viewportOnly),
        })
        const snapshots: ElementSnapshot[] = []
        for (const probe of probes) {
          snapshots.push(await collectElement(page, probe, app))
        }
        const fonts = collectFonts(media)
        for (const check of state.afterCapture?.[app] ?? []) {
          await check(page)
        }
        captures[app] = { png, snapshots, fonts, homeCount: fixtures.homeCount }
      }
    } catch (error) {
      const unmatched = unmatchedRequests()
      if (unmatched.length > 0) {
        throw new Error(`Harness error: unmatched API requests: ${unmatched.join(', ')}`, { cause: error })
      }
      throw error
    }
    expect(unmatchedRequests(), 'Harness error: unmatched API requests').toEqual([])

    if (cached) {
      captures.legacy = cached
    } else if (cacheKey !== undefined) {
      writeCapture(legacyCacheDir(), cacheKey, probeKeys, captures.legacy, { state: state.id, variant: variant.name, capturedAt: new Date().toISOString() })
    }
    const png = { legacy: captures.legacy.png, next: captures.next.png }
    const snapshots = { legacy: captures.legacy.snapshots, next: captures.next.snapshots }

    writeFileSync(resolve(dir, 'legacy.png'), png.legacy)
    writeFileSync(resolve(dir, 'next.png'), png.next)

    // Raw probe values of both apps: result.json keeps only the deltas, so identical values would otherwise be lost.
    writeFileSync(resolve(dir, 'snapshots.json'), `${JSON.stringify(Object.fromEntries(probes.map((probe, index) => [probe.key, { legacy: snapshots.legacy[index], next: snapshots.next[index] }])), null, 2)}\n`)

    const pixel = comparePng(png.legacy, png.next)
    writeFileSync(resolve(dir, 'diff.png'), pixel.diffPng)

    const styleDeltas = []
    const textDeltas = []
    for (const [index, probe] of probes.entries()) {
      const legacySnapshot = snapshots.legacy[index]!
      const nextSnapshot = snapshots.next[index]!
      // Absent on both apps is agreement (e.g. a modal or an analytics card that neither app renders in this state), not a delta.
      if (legacySnapshot.missing && nextSnapshot.missing) {
        continue
      }
      const comparison = compareProbe(probe.key, legacySnapshot, nextSnapshot)
      styleDeltas.push(...comparison.styleDeltas)
      textDeltas.push(...comparison.textDeltas)
    }

    const failing = [
      ...(pixel.pass ? [] : [{ property: 'pixel', ratio: pixel.ratio }]),
      ...styleDeltas.map(({ probe, property }) => ({ probe, property })),
    ]
    const exceptions = loadExceptions(resolve(parityRoot, 'exceptions.json'))
    const { status, exceptionsApplied } = deriveStatus(failing, exceptions, state.id, variant.name)

    const result = {
      runId: process.env.PARITY_RUN_ID ?? 'unknown',
      commit: nextCommit(),
      state: state.id,
      target: targetOf(state),
      variant: variant.name,
      pixelRatio: pixel.ratio,
      sizes: pixel.sizes,
      homeCount: { legacy: opened.legacy?.fixtures.homeCount ?? captures.legacy.homeCount, next: opened.next!.fixtures.homeCount },
      legacySource: cached ? 'cache' : 'live',
      styleDeltas,
      textDeltas,
      status,
      exceptionsApplied,
      fonts: { legacy: captures.legacy.fonts, next: captures.next.fonts },
    }
    writeFileSync(resolve(dir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)

    if (process.env.PARITY_GATE === '1') {
      expect(status, `${state.id} / ${variant.name}: ${failing.length} failing item(s), see report.md`).not.toBe('FAIL')
    }
  } finally {
    for (const { context } of Object.values(opened)) {
      await context.close()
    }
  }
}

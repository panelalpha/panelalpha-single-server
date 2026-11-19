import type { LegacyTarget, ParityState, Variant } from '../states/state'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { relative, resolve } from 'node:path'
import { cacheKey } from '../lib/legacy-cache'
import { fixtureInputsFor, mainCheckoutRoot, targetBuild, targetOf, TARGETS, targetUrl } from './targets'

/**
 * Legacy captures are cached on disk: the deployed legacy does not change while a slice is ported, so a state
 * captured once is compared again without opening legacy. The key covers every input of a legacy capture
 * (see `legacyCacheKey`), so a change to any of them recaptures.
 *
 * `PARITY_LEGACY_CACHE`: unset = read and write, `refresh` = recapture and overwrite, `off` = neither.
 */
export type LegacyCacheMode = 'on' | 'refresh' | 'off'

export function legacyCacheMode (): LegacyCacheMode {
  const value = process.env.PARITY_LEGACY_CACHE
  return value === 'off' || value === 'refresh' ? value : 'on'
}

/**
 * `PARITY_LEGACY_CACHE_DIR`, or `node_modules/.cache/parity-legacy` of the main checkout,
 * so worktrees of this repo share one cache (entries differ by key, writes are atomic).
 */
export function legacyCacheDir (): string {
  if (process.env.PARITY_LEGACY_CACHE_DIR) {
    return resolve(process.env.PARITY_LEGACY_CACHE_DIR)
  }
  return resolve(mainCheckoutRoot(), 'node_modules/.cache/parity-legacy')
}

const harnessDir = resolve(process.cwd(), 'parity')
const fixturesRoot = resolve(harnessDir, 'fixtures')

function filesUnder (dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile())
    .map(entry => resolve(entry.parentPath, entry.name))
}

let harnessInputs: Buffer[] | undefined

/**
 * Harness code and data a legacy capture depends on, except the spec files: driver, lib, shared state helpers
 * and fixtures (unit tests left out). Spec files go into the key one by one, so editing one spec
 * does not recapture the others.
 */
function sharedHarnessInputs (): Buffer[] {
  if (!harnessInputs) {
    const files = ['driver', 'lib', 'states']
      .flatMap(dir => filesUnder(resolve(harnessDir, dir)))
      .filter(file => !file.endsWith('.parity.ts') && !file.endsWith('.test.ts'))
      .toSorted()
    const fontsource = createRequire(import.meta.url).resolve('@fontsource/nunito-sans/package.json')
    harnessInputs = [...files, fontsource].flatMap(file => [Buffer.from(relative(harnessDir, file)), readFileSync(file)])
  }
  return harnessInputs
}

const fixtureInputs: Partial<Record<LegacyTarget, Buffer[]>> = {}

/** The fixture files of one target (`fixtureInputsFor`), kept out of the shared inputs so a lite refresh leaves app entries alone. */
function targetFixtureInputs (target: LegacyTarget): Buffer[] {
  return (fixtureInputs[target] ??= fixtureInputsFor(target, filesUnder(fixturesRoot).map(file => relative(fixturesRoot, file).replaceAll('\\', '/')).toSorted())
    .flatMap(name => [Buffer.from(`${TARGETS[target].fixturesDir}:${name}`), readFileSync(resolve(fixturesRoot, name))]))
}

/**
 * Key of one state in one variant, or `undefined` when the cache is off or the deployed legacy build is unknown
 * (global setup could not read its `index.html`), so nothing is reused against an unverified legacy.
 */
export function legacyCacheKey (specFile: string, state: Pick<ParityState, 'id' | 'target'>, variant: Variant, chromium: string): string | undefined {
  const target = targetOf(state)
  const build = targetBuild(target)
  if (legacyCacheMode() === 'off' || !build) {
    return undefined
  }
  return cacheKey([
    target,
    targetUrl(target),
    build,
    chromium,
    state.id,
    JSON.stringify(variant),
    readFileSync(specFile),
    ...sharedHarnessInputs(),
    ...targetFixtureInputs(target),
  ])
}

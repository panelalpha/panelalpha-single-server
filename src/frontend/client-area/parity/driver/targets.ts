import type { LegacyTarget, ParityState } from '../states/state'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

export type { LegacyTarget } from '../states/state'

export interface TargetConfig {
  /** Origin of the deployed legacy, without a trailing `/`. */
  url: string
  /** Fixture directory under `parity/`. */
  fixturesDir: string
  /** Env var that carries the build fingerprint from global setup to the workers. */
  buildEnv: string
  /** Local checkout of the legacy source, relative to the package, plus the pins that point at it. */
  checkout: string
  pins: Array<{ label: string, cwd: string, args: string[] }>
}

const trimSlash = (url: string) => url.replace(/\/$/, '')

// The capture script (`scripts/capture-fixtures.ts`) runs under plain `node` and cannot import this registry,
// so it repeats the capture URLs: keep them in sync.
export const TARGETS: Record<LegacyTarget, TargetConfig> = {
  app: {
    url: trimSlash(process.env.PARITY_LEGACY_URL ?? ''),
    fixturesDir: 'fixtures',
    buildEnv: 'PARITY_LEGACY_BUILD_APP',
    checkout: '../client-area',
    pins: [{ label: 'client-area', cwd: '..', args: ['ls-tree', 'HEAD', 'client-area'] }],
  },
  lite: {
    url: trimSlash(process.env.PARITY_LITE_URL ?? ''),
    fixturesDir: 'fixtures/lite',
    buildEnv: 'PARITY_LEGACY_BUILD_LITE',
    checkout: '../../../app-lite/packages/client-area',
    pins: [
      { label: 'app-lite', cwd: '../../..', args: ['ls-tree', 'HEAD', 'app-lite'] },
      { label: 'app-lite/client-area', cwd: '../../../app-lite', args: ['ls-tree', 'HEAD', 'packages/client-area'] },
    ],
  },
}

export const TARGET_NAMES = Object.keys(TARGETS) as LegacyTarget[]

/** Target a state is measured against; `lite` unless the state says otherwise. */
export function targetOf (state: Pick<ParityState, 'target'>): LegacyTarget {
  return state.target ?? 'lite'
}

/** Origin of the deployed legacy of `target`; throws when its env var (`PARITY_LEGACY_URL` / `PARITY_LITE_URL`) is not set. */
export function targetUrl (target: LegacyTarget): string {
  const { url } = TARGETS[target]
  if (!url) {
    throw new Error(`Parity target "${target}" has no legacy URL: set ${target === 'app' ? 'PARITY_LEGACY_URL' : 'PARITY_LITE_URL'}`)
  }
  return url
}

export function targetBuild (target: LegacyTarget): string | undefined {
  return process.env[TARGETS[target].buildEnv]
}

/** First `worktree` entry of `git worktree list --porcelain` (the main checkout), or `fallback`. Pure. */
export function parseMainWorktree (porcelain: string, fallback: string): string {
  const main = porcelain.split('\n').find(line => line.startsWith('worktree '))
  return main ? main.slice('worktree '.length) : fallback
}

/** Main checkout of this repo, so worktrees resolve the legacy checkout and pins like the main one. */
export function mainCheckoutRoot (cwd = process.cwd()): string {
  try {
    return parseMainWorktree(execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }), cwd)
  } catch {
    return cwd
  }
}

/** Legacy source checkout of `target`, relative to `base` (the main checkout by default). */
export function targetCheckout (target: LegacyTarget, base = mainCheckoutRoot()): string {
  return resolve(base, TARGETS[target].checkout)
}

/**
 * Fixture files (paths relative to `parity/fixtures`) a legacy capture of `target` depends on.
 * App: the top-level files. Lite: `lite/*` plus the top-level files except the app translation and `home.json`
 * (lite is served its own; the images are shared).
 * A lite fixture refresh therefore never touches an app cache key.
 */
export function fixtureInputsFor (target: LegacyTarget, files: string[]): string[] {
  const top = files.filter(file => !file.startsWith('lite/'))
  return target === 'app' ? top : [...top.filter(file => file !== 'translation.en.json' && file !== 'home.json'), ...files.filter(file => file.startsWith('lite/'))]
}

import type { LegacyTarget } from '../driver/targets'
import type { ParityResult } from '../lib/status'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { legacyChunks } from '../driver/legacy-build'
import { parityOutputDir } from '../driver/output-dir'
import { mainCheckoutRoot, TARGET_NAMES, targetCheckout, TARGETS } from '../driver/targets'
import { PIXEL_RATIO_THRESHOLD } from '../lib/pixel'

const root = parityOutputDir()

function git (cwd: string, ...args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'unavailable'
  }
}

async function chromiumVersion (): Promise<string> {
  try {
    const browser = await chromium.launch()
    const version = browser.version()
    await browser.close()
    return version
  } catch {
    return 'unavailable'
  }
}

function readResults (): ParityResult[] {
  if (!existsSync(root)) {
    return []
  }
  const results: ParityResult[] = []
  for (const state of readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    for (const variant of readdirSync(resolve(root, state.name), { withFileTypes: true }).filter(entry => entry.isDirectory())) {
      const file = resolve(root, state.name, variant.name, 'result.json')
      if (existsSync(file)) {
        results.push(JSON.parse(readFileSync(file, 'utf8')))
      }
    }
  }
  return results.toSorted((a, b) => a.state.localeCompare(b.state) || a.variant.localeCompare(b.variant))
}

const VARIANTS = ['light-desktop', 'light-mobile', 'dark-desktop']
/** Extra variants of `shell.parity.ts` only; must match the `testMatch` of those projects in `playwright.config.ts`. */
const SHELL_ONLY_VARIANTS = ['dark-mobile', 'light-tablet']

/** The variants a spec file runs in, so a state is never reported as missing in a variant it does not run. */
function variantsFor (file: string): string[] {
  if (file === 'hosting-narrow.parity.ts') {
    return ['light-narrow-desktop']
  }
  return file === 'shell.parity.ts' ? [...VARIANTS, ...SHELL_ONLY_VARIANTS] : VARIANTS
}

/** State ids registered in `parity/states/*.parity.ts` (read as text: spec files cannot be imported outside the runner), with the variants each runs in. */
function registeredStates (): Array<{ id: string, variants: string[] }> {
  const dir = resolve(process.cwd(), 'parity/states')
  return readdirSync(dir)
    .filter(file => file.endsWith('.parity.ts'))
    .flatMap(file => [...readFileSync(resolve(dir, file), 'utf8').matchAll(/^\s+id: '([^']+)',$/gm)].map(match => ({ id: match[1]!, variants: variantsFor(file) })))
}

interface TargetEvidence {
  legacyUrl: string
  legacyChunks: string[]
  legacyCheckoutCommit: string
  legacyBundlePins: Record<string, string>
}

/** Evidence of one legacy target: where it was measured and which source it should match. */
async function targetEvidence (target: LegacyTarget, cwd: string): Promise<TargetEvidence> {
  const { url, pins } = TARGETS[target]
  const base = mainCheckoutRoot(cwd)
  return {
    legacyUrl: url,
    legacyChunks: await legacyChunks(url),
    legacyCheckoutCommit: git(targetCheckout(target, base), 'rev-parse', '--short', 'HEAD'),
    legacyBundlePins: Object.fromEntries(pins.map(pin => [pin.label, git(resolve(base, pin.cwd), ...pin.args)])),
  }
}

const pct = (ratio: number) => `${(ratio * 100).toFixed(3)}%`
const list = (items: string[]) => (items.length > 0 ? items.join(', ') : 'none')

export default async function globalTeardown () {
  const runId = process.env.PARITY_RUN_ID ?? ''
  const cwd = process.cwd()
  const all = readResults()
  const current = all.filter(result => result.runId === runId)
  const stale = all.filter(result => result.runId !== runId)

  // Evidence for the targets this run used; an empty run still documents app.
  const used = TARGET_NAMES.filter(name => current.some(result => (result.target ?? 'app') === name))
  const targetNames = used.length > 0 ? used : ['app' as const]
  const [evidence, chromiumVer] = await Promise.all([Promise.all(targetNames.map(name => targetEvidence(name, cwd))), chromiumVersion()])
  const targets = Object.fromEntries(targetNames.map((name, index) => [name, evidence[index]!])) as Partial<Record<LegacyTarget, TargetEvidence>>
  const playwrightVersion = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@playwright/test/package.json'), 'utf8')).version
  const dirty = git(cwd, 'status', '--porcelain') === '' ? '' : ' (dirty)'
  const header = {
    runId,
    date: runId,
    nextCommit: `${git(cwd, 'rev-parse', '--short', 'HEAD')}${dirty}`,
    targets,
    fonts: {
      legacy: [...new Set(current.flatMap(result => result.fonts.legacy))].toSorted(),
      next: [...new Set(current.flatMap(result => result.fonts.next))].toSorted(),
    },
    playwright: playwrightVersion,
    chromium: chromiumVer,
  }

  const produced = new Set(current.map(result => `${result.state} / ${result.variant}`))
  const missing = registeredStates().flatMap(({ id, variants }) => variants.map(variant => `${id} / ${variant}`)).filter(key => !produced.has(key))

  const counts = { PASS: 0, ACCEPTED: 0, FAIL: 0 }
  for (const result of current) {
    counts[result.status]++
  }

  const lines: string[] = [
    '# Parity report',
    '',
    `- Date: ${header.date}`,
    `- next commit: ${header.nextCommit}`,
    `- Pixel threshold: ${PIXEL_RATIO_THRESHOLD * 100} %`,
    ...Object.entries(targets).flatMap(([name, info]) => [
      `- Legacy (${name}) URL: ${info.legacyUrl}`,
      `- Legacy (${name}) chunks (deployed index.html): ${list(info.legacyChunks)}`,
      `- Legacy (${name}) local checkout: ${info.legacyCheckoutCommit}`,
      ...Object.entries(info.legacyBundlePins).map(([label, pin]) => `- Legacy (${name}) bundle pin ${label}: \`${pin}\``),
    ]),
    `- Fonts loaded, legacy: ${list(header.fonts.legacy)}`,
    `- Fonts loaded, next: ${list(header.fonts.next)}`,
    `- Playwright ${header.playwright}, Chromium ${header.chromium}`,
    `- Legacy side from the legacy cache: ${current.filter(result => result.legacySource === 'cache').length} of ${current.length} results (\`PARITY_LEGACY_CACHE=refresh\` recaptures)`,
    ...(missing.length > 0
      ? [`- No result this run (not run, filtered by --grep, or harness error) (${missing.length}): ${list(missing)}`]
      : []),
    '',
    `## Summary (${current.length} results: ${counts.PASS} PASS, ${counts.ACCEPTED} ACCEPTED, ${counts.FAIL} FAIL)`,
    '',
    '| State | Target | Variant | Pixel diff | Style deltas | Text deltas | Status |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...current.map(result => `| ${result.state} | ${result.target ?? 'app'} | ${result.variant} | ${pct(result.pixelRatio)} | ${result.styleDeltas.length} | ${result.textDeltas.length} | ${result.status} |`),
  ]

  const sections = current.flatMap(result => [
    '',
    `## ${result.state} / ${result.variant} — ${result.status}`,
    '',
    `- Pixel diff: ${pct(result.pixelRatio)} (legacy ${result.sizes.legacy.width}x${result.sizes.legacy.height}, next ${result.sizes.next.width}x${result.sizes.next.height}; /home served legacy ${result.homeCount.legacy}x, next ${result.homeCount.next}x)`,
    '',
    'Style deltas:',
    '',
    ...(result.styleDeltas.length > 0
      ? result.styleDeltas.map(delta => `- \`${delta.probe}.${delta.property}\`: ${delta.legacy} → ${delta.next}`)
      : ['- none']),
    '',
    'Text deltas (informational, never fail):',
    '',
    ...(result.textDeltas.length > 0
      ? result.textDeltas.map(delta => `- \`${delta.probe}\`: "${delta.legacy}" → "${delta.next}"`)
      : ['- none']),
    ...(result.exceptionsApplied.length > 0
      ? [
          '',
          'Exceptions applied:',
          '',
          ...result.exceptionsApplied.map(({ item, exception }) => `- \`${item.probe ? `${item.probe}.` : ''}${item.property}\`: ${exception.reason}${exception.maxRatio === undefined ? '' : ` (max ${(exception.maxRatio * 100).toFixed(1)}%)`} (${exception.approvedBy}, ${exception.date})`),
        ]
      : []),
  ])

  const staleSection = stale.length > 0
    ? [
        '',
        '## Stale results from earlier runs',
        '',
        'Not part of the numbers above.',
        '',
        '| State | Variant | Pixel diff | Status | next commit | Run |',
        '| --- | --- | --- | --- | --- | --- |',
        ...stale.map(result => `| ${result.state} | ${result.variant} | ${pct(result.pixelRatio)} | ${result.status} | ${result.commit} | ${result.runId} |`),
      ]
    : []

  writeFileSync(resolve(root, 'report.md'), `${[...lines, ...sections, ...staleSection].join('\n')}\n`)
  writeFileSync(resolve(root, 'report.json'), `${JSON.stringify({ header, pixelThreshold: PIXEL_RATIO_THRESHOLD, counts, results: current, stale }, null, 2)}\n`)
}

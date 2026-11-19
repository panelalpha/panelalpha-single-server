import type { ElementSnapshot } from './compare'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** What one legacy capture of a state in a variant produces; enough to compare against next without opening legacy again. */
export interface LegacyCapture {
  png: Buffer
  /** One per probe, in probe order. */
  snapshots: ElementSnapshot[]
  fonts: string[]
  homeCount: number
}

/** sha256 over the inputs in order; each input is length-prefixed, so moving a boundary changes the key. */
export function cacheKey (inputs: Array<string | Buffer>): string {
  const hash = createHash('sha256')
  for (const input of inputs) {
    const bytes = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
    hash.update(`${bytes.length}:`)
    hash.update(bytes)
  }
  return hash.digest('hex').slice(0, 32)
}

/** The cached capture, or `undefined` when there is none or it lacks a probe the state now has. */
export function readCapture (dir: string, key: string, probeKeys: string[]): LegacyCapture | undefined {
  const entry = resolve(dir, key)
  if (!existsSync(resolve(entry, 'capture.json')) || !existsSync(resolve(entry, 'legacy.png'))) {
    return undefined
  }
  const data = JSON.parse(readFileSync(resolve(entry, 'capture.json'), 'utf8')) as {
    snapshots: Record<string, ElementSnapshot>
    fonts: string[]
    homeCount: number
  }
  if (probeKeys.some(probeKey => !(probeKey in data.snapshots))) {
    return undefined
  }
  return {
    png: readFileSync(resolve(entry, 'legacy.png')),
    snapshots: probeKeys.map(probeKey => data.snapshots[probeKey]!),
    fonts: data.fonts,
    homeCount: data.homeCount,
  }
}

/** Writes into a temporary folder and renames it, so a reader never sees half an entry. */
export function writeCapture (dir: string, key: string, probeKeys: string[], capture: LegacyCapture, meta: Record<string, unknown>): void {
  const entry = resolve(dir, key)
  const temporary = `${entry}.tmp-${process.pid}`
  rmSync(temporary, { recursive: true, force: true })
  mkdirSync(temporary, { recursive: true })
  writeFileSync(resolve(temporary, 'legacy.png'), capture.png)
  const snapshots = Object.fromEntries(probeKeys.map((probeKey, index) => [probeKey, capture.snapshots[index]]))
  writeFileSync(resolve(temporary, 'capture.json'), `${JSON.stringify({ ...meta, fonts: capture.fonts, homeCount: capture.homeCount, snapshots }, null, 2)}\n`)
  rmSync(entry, { recursive: true, force: true })
  renameSync(temporary, entry)
}

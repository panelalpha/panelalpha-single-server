import type { LegacyCapture } from './legacy-cache'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cacheKey, readCapture, writeCapture } from './legacy-cache'

const capture: LegacyCapture = {
  png: Buffer.from([1, 2, 3]),
  snapshots: [
    { missing: false, styles: { color: 'rgb(0, 0, 0)' }, box: { x: 0, y: 0, width: 10, height: 20 }, text: 'Title' },
    { missing: true },
  ],
  fonts: ['nunito-sans-latin-400-normal.woff2'],
  homeCount: 1,
}

describe('cacheKey', () => {
  it('is stable for the same inputs and changes with any input', () => {
    expect(cacheKey(['a', 'b'])).toBe(cacheKey(['a', 'b']))
    expect(cacheKey(['a', 'b'])).not.toBe(cacheKey(['a', 'c']))
  })

  it('does not collide when a boundary moves', () => {
    expect(cacheKey(['ab', 'c'])).not.toBe(cacheKey(['a', 'bc']))
  })
})

describe('readCapture / writeCapture', () => {
  let dir: string | undefined

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('round-trips a capture in probe order', () => {
    dir = mkdtempSync(join(tmpdir(), 'parity-cache-'))
    writeCapture(dir, 'key', ['title', 'error'], capture, { state: 'login-email' })
    expect(readCapture(dir, 'key', ['title', 'error'])).toEqual(capture)
    expect(readCapture(dir, 'key', ['error', 'title'])?.snapshots).toEqual([capture.snapshots[1], capture.snapshots[0]])
  })

  it('misses when the entry is absent or lacks a probe', () => {
    dir = mkdtempSync(join(tmpdir(), 'parity-cache-'))
    expect(readCapture(dir, 'key', ['title'])).toBeUndefined()
    writeCapture(dir, 'key', ['title'], { ...capture, snapshots: [capture.snapshots[0]!] }, {})
    expect(readCapture(dir, 'key', ['title', 'error'])).toBeUndefined()
  })

  it('overwrites an existing entry', () => {
    dir = mkdtempSync(join(tmpdir(), 'parity-cache-'))
    writeCapture(dir, 'key', ['title', 'error'], capture, {})
    writeCapture(dir, 'key', ['title', 'error'], { ...capture, homeCount: 2 }, {})
    expect(readCapture(dir, 'key', ['title', 'error'])?.homeCount).toBe(2)
  })
})

// @vitest-environment node
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { comparePng } from './pixel'

function solid (width: number, height: number, [r, g, b]: [number, number, number] = [255, 255, 255]): PNG {
  const png = new PNG({ width, height })
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = r
    png.data[offset + 1] = g
    png.data[offset + 2] = b
    png.data[offset + 3] = 255
  }
  return png
}

/** Paints `count` isolated black pixels (every other column of the first row). */
function withBlackPixels (png: PNG, count: number): PNG {
  for (let index = 0; index < count; index++) {
    const offset = (index * 2) * 4
    png.data[offset] = 0
    png.data[offset + 1] = 0
    png.data[offset + 2] = 0
  }
  return png
}

const write = (png: PNG) => PNG.sync.write(png)

describe('comparePng', () => {
  it('returns ratio 0 for identical PNGs', () => {
    const result = comparePng(write(solid(40, 25)), write(solid(40, 25)))
    expect(result.ratio).toBe(0)
    expect(result.pass).toBe(true)
    expect(PNG.sync.read(result.diffPng).width).toBe(40)
  })

  it('pads unequal sizes and counts the uncovered area as diff', () => {
    // White 40x25 vs white 40x20: the 5 missing rows are grey padding against white.
    const result = comparePng(write(solid(40, 25)), write(solid(40, 20)))
    expect(result.sizes).toEqual({ legacy: { width: 40, height: 25 }, next: { width: 40, height: 20 } })
    expect(result.diffPixels).toBe(40 * 5)
    expect(result.ratio).toBeCloseTo(200 / 1000)
    expect(result.pass).toBe(false)
  })

  it('passes at exactly 1 % and fails above it', () => {
    // 40x25 = 1000 px, so 10 differing pixels is exactly 1 %.
    const atLimit = comparePng(write(solid(40, 25)), write(withBlackPixels(solid(40, 25), 10)))
    expect(atLimit.diffPixels).toBe(10)
    expect(atLimit.ratio).toBe(0.01)
    expect(atLimit.pass).toBe(true)

    const above = comparePng(write(solid(40, 25)), write(withBlackPixels(solid(40, 25), 11)))
    expect(above.diffPixels).toBe(11)
    expect(above.pass).toBe(false)
  })
})

import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

/** Roadmap threshold: at most 1 % of the screenshot may differ (M-1 archives were measured at 0.5 %). */
export const PIXEL_RATIO_THRESHOLD = 0.01
export const PIXELMATCH_THRESHOLD = 0.1

/** Opaque color for the area one screenshot does not cover; never transparent. */
const PAD_COLOR = { r: 128, g: 128, b: 128, a: 255 }

export interface PixelResult {
  ratio: number
  diffPixels: number
  pass: boolean
  sizes: { legacy: { width: number, height: number }, next: { width: number, height: number } }
  diffPng: Buffer
}

function pad (source: PNG, width: number, height: number): PNG {
  const padded = new PNG({ width, height })
  for (let offset = 0; offset < padded.data.length; offset += 4) {
    padded.data[offset] = PAD_COLOR.r
    padded.data[offset + 1] = PAD_COLOR.g
    padded.data[offset + 2] = PAD_COLOR.b
    padded.data[offset + 3] = PAD_COLOR.a
  }
  PNG.bitblt(source, padded, 0, 0, source.width, source.height, 0, 0)
  return padded
}

/** Pads both PNGs to the larger size so a size difference counts as diff pixels. */
export function comparePng (legacyPng: Buffer, nextPng: Buffer): PixelResult {
  const legacy = PNG.sync.read(legacyPng)
  const next = PNG.sync.read(nextPng)
  const width = Math.max(legacy.width, next.width)
  const height = Math.max(legacy.height, next.height)

  const diff = new PNG({ width, height })
  const diffPixels = pixelmatch(pad(legacy, width, height).data, pad(next, width, height).data, diff.data, width, height, {
    threshold: PIXELMATCH_THRESHOLD,
    includeAA: false,
  })
  const ratio = diffPixels / (width * height)

  return {
    ratio,
    diffPixels,
    pass: ratio <= PIXEL_RATIO_THRESHOLD,
    sizes: {
      legacy: { width: legacy.width, height: legacy.height },
      next: { width: next.width, height: next.height },
    },
    diffPng: PNG.sync.write(diff),
  }
}

// The image work (object URL, `Image`, canvas, `FileReader`) is injectable: jsdom has no canvas.

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

const SVG_TYPE = 'image/svg+xml'
const SVG_FALLBACK_SIZE = 512

export interface ImageSize {
  width: number
  height: number
}

export interface ImageUploadDeps {
  /** Reads a file as text (SVG markup). */
  readText: (file: Blob) => Promise<string>
  /** Draws the image at `src` on a canvas and returns it as a PNG data URL. `size` is set for SVG, raster uses the natural size. Rejects when the image fails to load. */
  rasterize: (src: string, size?: ImageSize) => Promise<string>
  createObjectURL: (blob: Blob) => string
  revokeObjectURL: (url: string) => void
}

export function isImageTooLarge (file: Pick<File, 'size'>): boolean {
  return file.size > MAX_IMAGE_BYTES
}

/** Legacy `width`/`height` attributes of the root `<svg>`, else its `viewBox`, else 512 x 512. */
export function readSvgSize (svg: string): ImageSize {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? ''
  const widthMatch = root.match(/\swidth=["']?([\d.]+)/i)
  const heightMatch = root.match(/\sheight=["']?([\d.]+)/i)
  let width = widthMatch ? Number.parseFloat(widthMatch[1]) : null
  let height = heightMatch ? Number.parseFloat(heightMatch[1]) : null
  if (!width || !height) {
    const viewBoxMatch = svg.match(/viewBox=["']?([\d.\s-]+)["']?/i)
    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].trim().split(/\s+/)
      if (parts.length === 4) {
        width = width || Number.parseFloat(parts[2])
        height = height || Number.parseFloat(parts[3])
      }
    }
  }
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: SVG_FALLBACK_SIZE, height: SVG_FALLBACK_SIZE }
  }
  return { width, height }
}

const browserDeps: ImageUploadDeps = {
  readText: file => file.text(),
  rasterize: (src, size) => new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.addEventListener('load', () => {
      const canvas = document.createElement('canvas')
      canvas.width = size?.width ?? img.naturalWidth
      canvas.height = size?.height ?? img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('no canvas context'))
        return
      }
      if (size) {
        ctx.drawImage(img, 0, 0, size.width, size.height)
      } else {
        ctx.drawImage(img, 0, 0)
      }
      resolve(canvas.toDataURL('image/png'))
    })
    img.addEventListener('error', () => reject(new Error('image load failed')))
    img.src = src
  }),
  createObjectURL: blob => URL.createObjectURL(blob),
  revokeObjectURL: url => URL.revokeObjectURL(url),
}

/**
 * Raster -> PNG data URL through a canvas. SVG -> read as text, rasterised at its own size; when the browser cannot
 * load it as an image the raw markup is returned (the preview wraps it in a data URL).
 * The size limit is checked by the caller (`isImageTooLarge`), which also owns the alert.
 */
export async function readImageAsDataUrl (file: File, deps: Partial<ImageUploadDeps> = {}): Promise<string> {
  const { readText, rasterize, createObjectURL, revokeObjectURL } = { ...browserDeps, ...deps }

  if (file.type === SVG_TYPE) {
    const markup = await readText(file)
    const svgUrl = createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }))
    try {
      return await rasterize(svgUrl, readSvgSize(markup))
    } catch {
      return markup
    } finally {
      revokeObjectURL(svgUrl)
    }
  }

  const url = createObjectURL(file)
  try {
    return await rasterize(url)
  } finally {
    revokeObjectURL(url)
  }
}

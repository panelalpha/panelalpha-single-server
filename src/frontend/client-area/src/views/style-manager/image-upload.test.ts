import { describe, expect, it, vi } from 'vitest'
import { isImageTooLarge, MAX_IMAGE_BYTES, readImageAsDataUrl, readSvgSize } from './image-upload'

function deps (overrides: Record<string, unknown> = {}) {
  return {
    readText: vi.fn(async (file: Blob) => file.text()),
    rasterize: vi.fn(async () => 'data:image/png;base64,RASTER'),
    createObjectURL: vi.fn(() => 'blob:x'),
    revokeObjectURL: vi.fn(),
    ...overrides,
  }
}

describe('isImageTooLarge', () => {
  it('allows exactly 2 MB and rejects anything above', () => {
    expect(MAX_IMAGE_BYTES).toBe(2 * 1024 * 1024)
    expect(isImageTooLarge({ size: MAX_IMAGE_BYTES })).toBe(false)
    expect(isImageTooLarge({ size: MAX_IMAGE_BYTES + 1 })).toBe(true)
  })
})

describe('readSvgSize', () => {
  it('reads width and height attributes, px allowed', () => {
    expect(readSvgSize('<svg width="120px" height="40"></svg>')).toEqual({ width: 120, height: 40 })
  })

  it('falls back to the viewBox, then to 512 x 512', () => {
    expect(readSvgSize('<svg viewBox="0 0 300 100"></svg>')).toEqual({ width: 300, height: 100 })
    expect(readSvgSize('<svg width="50" viewBox="0 0 300 100"></svg>')).toEqual({ width: 50, height: 100 })
    expect(readSvgSize('<svg></svg>')).toEqual({ width: 512, height: 512 })
  })
})

describe('readImageAsDataUrl', () => {
  it('rasterises a raster file at its natural size and revokes the object URL', async () => {
    const d = deps()
    const result = await readImageAsDataUrl(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), d)
    expect(result).toBe('data:image/png;base64,RASTER')
    expect(d.rasterize).toHaveBeenCalledWith('blob:x')
    expect(d.revokeObjectURL).toHaveBeenCalledWith('blob:x')
  })

  it('rasterises an SVG at its own size', async () => {
    const d = deps()
    const result = await readImageAsDataUrl(new File(['<svg width="10" height="20"></svg>'], 'a.svg', { type: 'image/svg+xml' }), d)
    expect(result).toBe('data:image/png;base64,RASTER')
    expect(d.rasterize).toHaveBeenCalledWith('blob:x', { width: 10, height: 20 })
    expect(d.revokeObjectURL).toHaveBeenCalledWith('blob:x')
  })

  it('returns the raw markup when the SVG cannot be loaded as an image', async () => {
    const markup = '<svg width="10" height="20"></svg>'
    const d = deps({ rasterize: vi.fn(async () => {
      throw new Error('load')
    }) })
    expect(await readImageAsDataUrl(new File([markup], 'a.svg', { type: 'image/svg+xml' }), d)).toBe(markup)
    expect(d.revokeObjectURL).toHaveBeenCalledWith('blob:x')
  })

  it('rejects when a raster image fails to load and still revokes the URL', async () => {
    const d = deps({ rasterize: vi.fn(async () => {
      throw new Error('load')
    }) })
    await expect(readImageAsDataUrl(new File(['x'], 'a.png', { type: 'image/png' }), d)).rejects.toThrow('load')
    expect(d.revokeObjectURL).toHaveBeenCalledWith('blob:x')
  })
})

import type { CropFields, CropGeometry } from './fm-crop'
import { describe, expect, it } from 'vitest'
import { cropOutputWidth, fieldsToSelection, geometryFromMatrix, matrixFromGeometry, selectionToFields, validateCropFields } from './fm-crop'

// Native image 400 x 200, shown at 2x in the canvas (placement 800 x 400 at 10,20).
const identity: CropGeometry = {
  naturalWidth: 400,
  naturalHeight: 200,
  placement: { x: 10, y: 20, width: 800, height: 400 },
  transform: { rotate: 0, scaleX: 1, scaleY: 1 },
}

function fields (overrides: Partial<CropFields> = {}): CropFields {
  return { x: 50, y: 25, width: 100, height: 50, rotate: 0, scaleX: 1, scaleY: 1, ...overrides }
}

describe('fm-crop', () => {
  it('maps native fields to the canvas selection through the display scale', () => {
    const { selection } = fieldsToSelection(fields(), identity)
    expect(selection).toEqual({ x: 110, y: 70, width: 200, height: 100 })
  })

  it('maps the canvas selection back to native fields', () => {
    const result = selectionToFields({ x: 110, y: 70, width: 200, height: 100 }, identity)
    expect(result).toEqual(fields())
  })

  it('round-trips fields without rotation or flip', () => {
    const { selection } = fieldsToSelection(fields({ x: 13, y: 7, width: 61, height: 33 }), identity)
    expect(selectionToFields(selection, identity)).toEqual(fields({ x: 13, y: 7, width: 61, height: 33 }))
  })

  it('rounds the native fields the way the legacy crop event did', () => {
    const result = selectionToFields({ x: 111.2, y: 70.9, width: 199.6, height: 100.4 }, identity)
    expect(result).toMatchObject({ x: 51, y: 25, width: 100, height: 50 })
  })

  it('mirrors the crop box on a horizontal flip', () => {
    const flipped = fields({ scaleX: -1 })
    const { selection, transform } = fieldsToSelection(flipped, identity)
    // Native x 50..150 mirrored around the centre (200) becomes 250..350, drawn at canvas 510..710.
    expect(selection).toEqual({ x: 510, y: 70, width: 200, height: 100 })
    expect(transform).toEqual({ rotate: 0, scaleX: -1, scaleY: 1 })
    expect(selectionToFields(selection, { ...identity, transform })).toEqual(flipped)
  })

  it('round-trips a vertical flip', () => {
    const flipped = fields({ scaleY: -1 })
    const { selection } = fieldsToSelection(flipped, identity)
    expect(selectionToFields(selection, { ...identity, transform: { rotate: 0, scaleX: 1, scaleY: -1 } })).toEqual(flipped)
  })

  it('round-trips a 90 degree rotation exactly', () => {
    const rotated = fields({ x: 0, y: 0, width: 100, height: 50, rotate: 90 })
    const { selection, transform } = fieldsToSelection(rotated, identity)
    // A 100 x 50 native box turned by 90 degrees is 50 x 100 in native terms, 100 x 200 on the 2x canvas.
    expect(selection.width).toBeCloseTo(100)
    expect(selection.height).toBeCloseTo(200)
    expect(selectionToFields(selection, { ...identity, transform })).toEqual(rotated)
  })

  it('keeps the crop box inside its bounding box at 45 degrees', () => {
    const rotated = fields({ rotate: 45 })
    const { selection, transform } = fieldsToSelection(rotated, identity)
    const back = selectionToFields(selection, { ...identity, transform })
    expect(back.width).toBeGreaterThanOrEqual(rotated.width)
    expect(back.height).toBeGreaterThanOrEqual(rotated.height)
    expect(back).toMatchObject({ rotate: 45, scaleX: 1, scaleY: 1 })
  })

  it('accepts a valid crop', () => {
    expect(validateCropFields(fields(), identity)).toEqual([])
    expect(validateCropFields(fields({ x: 0, y: 0, width: 400, height: 200 }), identity)).toEqual([])
  })

  it('rejects fields that are not finite numbers', () => {
    expect(validateCropFields(fields({ x: Number.NaN }), identity)).toEqual(['not-a-number'])
    expect(validateCropFields(fields({ width: Number.POSITIVE_INFINITY }), identity)).toEqual(['not-a-number'])
  })

  it('rejects an empty crop area', () => {
    expect(validateCropFields(fields({ width: 0 }), identity)).toEqual(['empty-area'])
    expect(validateCropFields(fields({ height: -1 }), identity)).toEqual(['empty-area'])
  })

  it('rejects a crop box that leaves the native image', () => {
    expect(validateCropFields(fields({ x: -1 }), identity)).toEqual(['outside-image'])
    expect(validateCropFields(fields({ x: 350, width: 100 }), identity)).toEqual(['outside-image'])
    expect(validateCropFields(fields({ y: 160, height: 50 }), identity)).toEqual(['outside-image'])
  })

  it('rejects a zero scale', () => {
    expect(validateCropFields(fields({ scaleX: 0 }), identity)).toEqual(['zero-scale'])
  })

  it('exports the crop box in native pixels, not the full image width', () => {
    // The selection is 200 canvas px wide at 2x display scale: 100 native px.
    expect(cropOutputWidth({ x: 110, y: 70, width: 200, height: 100 }, identity)).toBe(100)
  })

  it('reads the geometry of an unrotated, unflipped image matrix', () => {
    const geometry = geometryFromMatrix([2, 0, 0, 2, 0, 0], 400, 200)
    expect(geometry).toEqual({
      naturalWidth: 400,
      naturalHeight: 200,
      // The image centre stays at (200, 100), so the 800 x 400 box starts at (-200, -100).
      placement: { x: -200, y: -100, width: 800, height: 400 },
      transform: { rotate: 0, scaleX: 1, scaleY: 1 },
    })
  })

  it('reads a horizontal flip as scaleX -1 at rotate 0', () => {
    const geometry = geometryFromMatrix([-2, 0, 0, 2, 10, 20], 400, 200)
    expect(geometry.transform).toEqual({ rotate: 0, scaleX: -1, scaleY: 1 })
    expect(geometry.placement).toEqual({ x: -190, y: -80, width: 800, height: 400 })
  })

  it('keeps the rotation in (-90, 90] for an equivalent turn', () => {
    const turned = geometryFromMatrix(matrixFromGeometry({ rotate: 135, scaleX: 1, scaleY: 1 }, identity), 400, 200)
    expect(turned.transform.rotate).toBeCloseTo(-45)
    expect(turned.transform.scaleX).toBe(-1)
    expect(turned.transform.scaleY).toBe(-1)
  })

  it('round-trips the matrix through the geometry', () => {
    const transform = { rotate: 30, scaleX: -1, scaleY: 1 }
    const matrix = matrixFromGeometry(transform, identity)
    const geometry = geometryFromMatrix(matrix, 400, 200)
    expect(geometry.transform.rotate).toBeCloseTo(30)
    expect(geometry.transform).toMatchObject({ scaleX: -1, scaleY: 1 })
    const again = matrixFromGeometry(geometry.transform, geometry)
    for (const [index, value] of matrix.entries()) {
      expect(again[index]).toBeCloseTo(value)
    }
  })
})

// Cropper coordinates: conversion between the legacy crop fields and cropperjs 2 state. The legacy fields (`x`, `y`,
// `width`, `height`, `rotate`, `scaleX`, `scaleY`) are in native image pixels, `x`/`y`/`width`/`height` describe the
// crop box in the native frame (before rotation and flip). Here `selection` is the `cropper-selection` box in canvas pixels,
// and `placement` is the unrotated box the image occupies in the canvas. Pure module: no cropperjs import.

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CropTransform {
  /** Degrees, clockwise. */
  rotate: number
  scaleX: number
  scaleY: number
}

/** Legacy form fields, all in native image pixels (rotate and scale are the image transform). */
export type CropFields = CropRect & CropTransform

export interface CropGeometry {
  /** Native image size. */
  naturalWidth: number
  naturalHeight: number
  /** Unrotated box the image occupies in canvas pixels (display scale = placement size / native size). */
  placement: CropRect
  /** Image transform as it currently stands in the cropper; used by `selectionToFields`. */
  transform: CropTransform
}

export interface CropSelectionResult {
  selection: CropRect
  transform: CropTransform
}

export type CropFieldIssue = 'not-a-number' | 'zero-scale' | 'empty-area' | 'outside-image'

const FIELD_NAMES = ['x', 'y', 'width', 'height', 'rotate', 'scaleX', 'scaleY'] as const

/** Native to canvas: scale to the display size, flip around the centre, rotate, then move to the placement. */
function nativeToCanvas (point: { x: number, y: number }, transform: CropTransform, geometry: CropGeometry) {
  const { naturalWidth, naturalHeight, placement } = geometry
  const displayX = placement.width / naturalWidth
  const displayY = placement.height / naturalHeight
  const localX = (point.x - naturalWidth / 2) * displayX * transform.scaleX
  const localY = (point.y - naturalHeight / 2) * displayY * transform.scaleY
  const radians = transform.rotate * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: placement.x + placement.width / 2 + localX * cos - localY * sin,
    y: placement.y + placement.height / 2 + localX * sin + localY * cos,
  }
}

/** Canvas to native: the exact inverse of `nativeToCanvas`. */
function canvasToNative (point: { x: number, y: number }, transform: CropTransform, geometry: CropGeometry) {
  const { naturalWidth, naturalHeight, placement } = geometry
  const displayX = placement.width / naturalWidth
  const displayY = placement.height / naturalHeight
  const dx = point.x - (placement.x + placement.width / 2)
  const dy = point.y - (placement.y + placement.height / 2)
  const radians = transform.rotate * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  return {
    x: localX / transform.scaleX / displayX + naturalWidth / 2,
    y: localY / transform.scaleY / displayY + naturalHeight / 2,
  }
}

/** Bounding box of the four corners. Exact for rotations of 0, 90, 180 and 270 degrees, an approximation otherwise. */
function boundingRect (corners: Array<{ x: number, y: number }>): CropRect {
  const xs = corners.map(corner => corner.x)
  const ys = corners.map(corner => corner.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }
}

function mapRect (rect: CropRect, map: (point: { x: number, y: number }) => { x: number, y: number }): CropRect {
  return boundingRect([
    map({ x: rect.x, y: rect.y }),
    map({ x: rect.x + rect.width, y: rect.y }),
    map({ x: rect.x, y: rect.y + rect.height }),
    map({ x: rect.x + rect.width, y: rect.y + rect.height }),
  ])
}

/**
 * Apply: the fields in native pixels become the cropper selection in canvas pixels, using the rotate and
 * scale from the fields. The selection is the bounding box of the rotated crop box, because cropper-selection is axis-aligned.
 */
export function fieldsToSelection (fields: CropFields, geometry: CropGeometry): CropSelectionResult {
  const transform: CropTransform = { rotate: fields.rotate, scaleX: fields.scaleX, scaleY: fields.scaleY }
  const selection = mapRect(fields, point => nativeToCanvas(point, transform, geometry))
  return { selection, transform }
}

/**
 * The cropper selection in canvas pixels becomes the fields in native pixels, rounded like the legacy
 * `Math.round`. Rotate and scale come from `geometry.transform`.
 */
export function selectionToFields (selection: CropRect, geometry: CropGeometry): CropFields {
  const transform = geometry.transform
  const native = mapRect(selection, point => canvasToNative(point, transform, geometry))
  // `+ 0` turns a rounded -0 into 0.
  return {
    x: Math.round(native.x) + 0,
    y: Math.round(native.y) + 0,
    width: Math.round(native.width) + 0,
    height: Math.round(native.height) + 0,
    rotate: transform.rotate,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
  }
}

/**
 * Validation before Apply: every field a finite number, non-zero scales, a crop box with positive size that lies inside the
 * native image. Returns the distinct issues (empty when valid).
 */
export function validateCropFields (fields: CropFields, geometry: CropGeometry): CropFieldIssue[] {
  const issues: CropFieldIssue[] = []
  const values = FIELD_NAMES.map(name => fields[name])
  if (values.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
    issues.push('not-a-number')
    return issues
  }
  if (fields.scaleX === 0 || fields.scaleY === 0) {
    issues.push('zero-scale')
  }
  if (fields.width <= 0 || fields.height <= 0) {
    issues.push('empty-area')
  }
  if (
    fields.x < 0
    || fields.y < 0
    || fields.x + fields.width > geometry.naturalWidth
    || fields.y + fields.height > geometry.naturalHeight
  ) {
    issues.push('outside-image')
  }
  return issues
}

/**
 * Crop output width for `$toCanvas` on the selection: the crop box in native pixels (selection width over the display scale). The
 * selection export scales its area to the requested width, so passing the full image width would stretch every crop to that size.
 */
export function cropOutputWidth (selection: CropRect, geometry: CropGeometry): number {
  const displayX = geometry.naturalWidth > 0 ? geometry.placement.width / geometry.naturalWidth : 0
  if (displayX <= 0) {
    return geometry.naturalWidth
  }
  return Math.max(1, Math.round(selection.width / displayX))
}

/**
 * The cropperjs image matrix `[a, b, c, d, e, f]` (`cropper-image` `$getTransform()`) as the geometry. cropperjs draws the image at its
 * native size with the matrix applied around its centre (`$toCanvas`), so the image centre is `(natW / 2 + e, natH / 2 + f)` and the
 * linear part is `R(rotate) * diag(scaleX * displayX, scaleY * displayY)`. The rotation is kept in (-90, 90] degrees, so a flip stays a
 * flip.
 */
export function geometryFromMatrix (matrix: readonly number[], naturalWidth: number, naturalHeight: number): CropGeometry {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = matrix
  let rotation = Math.atan2(b, a)
  if (rotation > Math.PI / 2) {
    rotation -= Math.PI
  } else if (rotation <= -Math.PI / 2) {
    rotation += Math.PI
  }
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const scaledX = a * cos + b * sin
  const scaledY = d * cos - c * sin
  const width = naturalWidth * Math.abs(scaledX)
  const height = naturalHeight * Math.abs(scaledY)
  const centreX = naturalWidth / 2 + e
  const centreY = naturalHeight / 2 + f
  return {
    naturalWidth,
    naturalHeight,
    placement: { x: centreX - width / 2, y: centreY - height / 2, width, height },
    transform: {
      rotate: rotation * 180 / Math.PI,
      scaleX: scaledX < 0 ? -1 : 1,
      scaleY: scaledY < 0 ? -1 : 1,
    },
  }
}

/** The inverse of `geometryFromMatrix`: the matrix that gives `transform` at the placement of `geometry` (for `$setTransform`). */
export function matrixFromGeometry (transform: CropTransform, geometry: CropGeometry): number[] {
  const { naturalWidth, naturalHeight, placement } = geometry
  const scaledX = transform.scaleX * placement.width / naturalWidth
  const scaledY = transform.scaleY * placement.height / naturalHeight
  const radians = transform.rotate * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return [
    cos * scaledX,
    sin * scaledX,
    -sin * scaledY,
    cos * scaledY,
    placement.x + placement.width / 2 - naturalWidth / 2,
    placement.y + placement.height / 2 - naturalHeight / 2,
  ]
}

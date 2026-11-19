/** Computed-style properties collected per element and required to be identical. */
export const STYLE_PROPERTIES = [
  'font-size',
  'font-weight',
  'line-height',
  'color',
  'background-color',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-right-width',
  'border-right-style',
  'border-right-color',
  'border-bottom-width',
  'border-bottom-style',
  'border-bottom-color',
  'border-left-width',
  'border-left-style',
  'border-left-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'box-shadow',
  'opacity',
] as const

/** Bounding box properties, compared with a tolerance. */
export const BOX_PROPERTIES = ['x', 'y', 'width', 'height'] as const

/** Roadmap threshold: size and position within ±1 px. */
export const BOX_TOLERANCE_PX = 1

export type BoxProperty = typeof BOX_PROPERTIES[number]

export type ElementSnapshot
  = | { missing: true }
    | {
      missing: false
      styles: Record<string, string>
      box: Record<BoxProperty, number>
      text: string
    }

export interface StyleDelta {
  probe: string
  property: string
  legacy: string
  next: string
}

export interface TextDelta {
  probe: string
  legacy: string
  next: string
}

export interface ProbeComparison {
  styleDeltas: StyleDelta[]
  textDeltas: TextDelta[]
}

/** Rewrites every `rgb()`, `rgba()` and `color(srgb …)` in a computed value to `rgba(r, g, b, a)`. */
export function normalizeColors (value: string): string {
  return value
    .replace(/color\(srgb ([^)]*)\)/g, (_match, inner: string) => {
      const [channels = '', alpha = '1'] = inner.split('/')
      const [r = '0', g = '0', b = '0'] = channels.split(/\s+/).filter(Boolean)
      return formatRgba([r, g, b].map(channel => String(Math.round(Number(channel) * 255))), alpha)
    })
    .replace(/rgba?\(([^)]*)\)/g, (_match, inner: string) => {
      const [channels = '', alpha = '1'] = inner.split('/')
      const parts = channels.split(/[\s,]+/).filter(Boolean)
      return formatRgba(parts.slice(0, 3), parts.length > 3 ? parts[3]! : alpha)
    })
}

function formatRgba (rgb: string[], rawAlpha: string): string {
  const trimmed = rawAlpha.trim()
  const alpha = trimmed.endsWith('%') ? Number.parseFloat(trimmed) / 100 : Number(trimmed)
  return `rgba(${rgb.join(', ')}, ${alpha})`
}

function formatNumber (value: number): string {
  return String(Math.round(value * 100) / 100)
}

/**
 * Border `style` and `color` of a side that draws nothing on either app. A side at 0 px on both apps ignores its style and colour;
 * a side with style `none` on both apps ignores its colour (width is still compared by the caller).
 */
export function isHiddenBorderProperty (property: string, legacy: Record<string, string>, next: Record<string, string>): boolean {
  const match = /^border-(top|right|bottom|left)-(style|color)$/.exec(property)
  if (!match) {
    return false
  }
  const side = match[1]
  const zeroWidth = (styles: Record<string, string>) => styles[`border-${side}-width`] === '0px'
  if (zeroWidth(legacy) && zeroWidth(next)) {
    return true
  }
  if (match[2] !== 'color') {
    return false
  }
  const drawsNothing = (styles: Record<string, string>) =>
    styles[`border-${side}-style`] === 'none' || zeroWidth(styles)
  return drawsNothing(legacy) && drawsNothing(next)
}

/** A `box-shadow` whose every length is 0 px paints nothing; it is compared as `none`. */
export function normalizeShadow (value: string): string {
  const lengths = value.replace(/rgba?\([^)]*\)/g, '').match(/-?\d+(?:\.\d+)?px/g) ?? []
  if (value.trim() === 'none' || (lengths.length > 0 && lengths.every(length => Number.parseFloat(length) === 0))) {
    return 'none'
  }
  return normalizeColors(value)
}

/** Compares one probe's two snapshots. A missing element on either side is a `missing` failure. */
export function compareProbe (probe: string, legacy: ElementSnapshot, next: ElementSnapshot): ProbeComparison {
  const styleDeltas: StyleDelta[] = []
  const textDeltas: TextDelta[] = []

  if (legacy.missing || next.missing) {
    styleDeltas.push({
      probe,
      property: 'missing',
      legacy: legacy.missing ? 'missing' : 'present',
      next: next.missing ? 'missing' : 'present',
    })
    return { styleDeltas, textDeltas }
  }

  for (const property of STYLE_PROPERTIES) {
    // A border style or colour nobody can see (width 0 on both sides) is not compared; the width itself still is.
    if (isHiddenBorderProperty(property, legacy.styles, next.styles)) {
      continue
    }
    const normalize = property === 'box-shadow' ? normalizeShadow : normalizeColors
    const legacyValue = normalize(legacy.styles[property] ?? '')
    const nextValue = normalize(next.styles[property] ?? '')
    if (legacyValue !== nextValue) {
      styleDeltas.push({ probe, property, legacy: legacyValue, next: nextValue })
    }
  }

  for (const property of BOX_PROPERTIES) {
    const legacyValue = legacy.box[property]
    const nextValue = next.box[property]
    // Tiny epsilon so a measured delta of exactly 1 px is not lost to float noise.
    if (Math.abs(legacyValue - nextValue) > BOX_TOLERANCE_PX + 1e-6) {
      styleDeltas.push({ probe, property, legacy: `${formatNumber(legacyValue)}px`, next: `${formatNumber(nextValue)}px` })
    }
  }

  if (legacy.text !== next.text) {
    textDeltas.push({ probe, legacy: legacy.text, next: next.text })
  }

  return { styleDeltas, textDeltas }
}

// @vitest-environment node
import type { ElementSnapshot } from './compare'
import { describe, expect, it } from 'vitest'
import { compareProbe, normalizeColors, normalizeShadow, STYLE_PROPERTIES } from './compare'

function snapshot (overrides: { styles?: Record<string, string>, box?: Partial<Record<'x' | 'y' | 'width' | 'height', number>>, text?: string } = {}): ElementSnapshot {
  return {
    missing: false,
    styles: { ...Object.fromEntries(STYLE_PROPERTIES.map(property => [property, 'x'])), ...overrides.styles },
    box: { x: 10, y: 20, width: 100, height: 40, ...overrides.box },
    text: overrides.text ?? 'Log in',
  }
}

describe('normalizeColors', () => {
  it('treats rgb() and rgba(..., 1) as equal', () => {
    expect(normalizeColors('rgb(1, 2, 3)')).toBe('rgba(1, 2, 3, 1)')
    expect(normalizeColors('rgba(1, 2, 3, 1)')).toBe('rgba(1, 2, 3, 1)')
  })

  it('converts color(srgb …) to rgba', () => {
    expect(normalizeColors('color(srgb 1 1 1)')).toBe('rgba(255, 255, 255, 1)')
    expect(normalizeColors('color(srgb 0 0.5 1 / 0.5)')).toBe('rgba(0, 128, 255, 0.5)')
  })

  it('keeps fractional alpha and normalizes colors inside box-shadow', () => {
    expect(normalizeColors('rgba(0, 0, 0, 0.5) 0px 2px 4px 0px')).toBe('rgba(0, 0, 0, 0.5) 0px 2px 4px 0px')
    expect(normalizeColors('rgb(0 0 0 / 50%)')).toBe('rgba(0, 0, 0, 0.5)')
  })
})

describe('compareProbe', () => {
  it('passes identical snapshots', () => {
    expect(compareProbe('title', snapshot(), snapshot())).toEqual({ styleDeltas: [], textDeltas: [] })
  })

  it('requires style properties to be identical', () => {
    const result = compareProbe('title', snapshot({ styles: { 'font-size': '22px' } }), snapshot({ styles: { 'font-size': '23px' } }))
    expect(result.styleDeltas).toEqual([{ probe: 'title', property: 'font-size', legacy: '22px', next: '23px' }])
  })

  it('treats rgb() and rgba(..., 1) as the same color', () => {
    const result = compareProbe('title', snapshot({ styles: { color: 'rgb(1, 2, 3)' } }), snapshot({ styles: { color: 'rgba(1, 2, 3, 1)' } }))
    expect(result.styleDeltas).toEqual([])
  })

  it('passes a 1 px size and position delta and fails a 2 px delta', () => {
    expect(compareProbe('card', snapshot(), snapshot({ box: { x: 11, y: 19, width: 101, height: 39 } })).styleDeltas).toEqual([])
    const result = compareProbe('card', snapshot(), snapshot({ box: { x: 12, y: 20, width: 100, height: 42 } }))
    expect(result.styleDeltas.map(delta => delta.property)).toEqual(['x', 'height'])
  })

  it('reports a missing element as a failure', () => {
    expect(compareProbe('title', snapshot(), { missing: true }).styleDeltas)
      .toEqual([{ probe: 'title', property: 'missing', legacy: 'present', next: 'missing' }])
    expect(compareProbe('title', { missing: true }, snapshot()).styleDeltas)
      .toEqual([{ probe: 'title', property: 'missing', legacy: 'missing', next: 'present' }])
    expect(compareProbe('title', { missing: true }, { missing: true }).styleDeltas).toHaveLength(1)
  })

  it('lists text deltas but never fails on them', () => {
    const result = compareProbe('title', snapshot({ text: 'Log in' }), snapshot({ text: 'Sign in' }))
    expect(result.styleDeltas).toEqual([])
    expect(result.textDeltas).toEqual([{ probe: 'title', legacy: 'Log in', next: 'Sign in' }])
  })

  it('skips the colour of a border that is hidden on both sides', () => {
    const hidden = { 'border-top-style': 'none', 'border-top-width': '0px' }
    const result = compareProbe('tab', snapshot({ styles: { ...hidden, 'border-top-color': 'red' } }), snapshot({ styles: { ...hidden, 'border-top-color': 'blue' } }))
    expect(result.styleDeltas).toEqual([])
  })

  it('still compares the colour when the border is visible on one side', () => {
    const result = compareProbe('tab', snapshot({ styles: { 'border-top-style': 'none', 'border-top-width': '0px', 'border-top-color': 'red' } }), snapshot({ styles: { 'border-top-style': 'solid', 'border-top-width': '1px', 'border-top-color': 'blue' } }))
    expect(result.styleDeltas).toEqual(expect.arrayContaining([
      { probe: 'tab', property: 'border-top-color', legacy: 'red', next: 'blue' },
    ]))
  })
})

describe('zero-width borders and zero shadows', () => {
  it('ignores style and colour of a border at 0 px on both sides', () => {
    const zero = { 'border-top-width': '0px', 'border-top-style': 'solid' }
    const result = compareProbe('tab', snapshot({ styles: { ...zero, 'border-top-color': 'red' } }), snapshot({ styles: { 'border-top-width': '0px', 'border-top-style': 'dashed', 'border-top-color': 'blue' } }))
    expect(result.styleDeltas).toEqual([])
  })

  it('still compares a border style when the border is visible on one side', () => {
    const result = compareProbe('tab', snapshot({ styles: { 'border-top-width': '0px', 'border-top-style': 'solid' } }), snapshot({ styles: { 'border-top-width': '1px', 'border-top-style': 'solid' } }))
    expect(result.styleDeltas).toEqual(expect.arrayContaining([
      { probe: 'tab', property: 'border-top-width', legacy: '0px', next: '1px' },
    ]))
  })

  it('treats a box-shadow of only 0 px lengths as none', () => {
    expect(normalizeShadow('rgba(0, 0, 0, 0.3) 0px 0px 0px 0px, rgba(0, 0, 0, 0.15) 0px 0px 0px 0px')).toBe('none')
    expect(normalizeShadow('none')).toBe('none')
    expect(normalizeShadow('rgba(0, 0, 0, 0.2) 0px 2px 4px 0px')).toBe('rgba(0, 0, 0, 0.2) 0px 2px 4px 0px')
    const result = compareProbe('tab', snapshot({ styles: { 'box-shadow': 'none' } }), snapshot({ styles: { 'box-shadow': 'rgba(0, 0, 0, 0.3) 0px 0px 0px 0px' } }))
    expect(result.styleDeltas).toEqual([])
  })
})

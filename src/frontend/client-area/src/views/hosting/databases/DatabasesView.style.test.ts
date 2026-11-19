// The tab window of the Databases screen carried a 32px side padding with an equal negative side margin and `width: calc(100% + 64px)`:
// the padding and the margin cancelled out for the content, but the box itself reached 32px past its column on both sides, so the page
// scrolled sideways wherever the column has no side padding of its own (the project frame below 1296px, the My server frame).
// jsdom applies no stylesheet, so this guard reads the screen's own style block.
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const style = readFileSync(resolve(__dirname, 'DatabasesView.scss'), 'utf8')
const windowBlock = /(?:^|\n)\.v-window\s*\{([^}]*)\}/.exec(style)?.[1] ?? ''

const declarations = new Map<string, string>()
for (const match of windowBlock.replaceAll(/\/\*[\s\S]*?\*\//g, '').matchAll(/([a-z-]+):([^;]+);/g)) {
  declarations.set(match[1]!, match[2]!.trim())
}

/** The side each position of a shorthand value feeds (`margin` / `padding`). */
const SHORTHAND: Record<number, Record<'top' | 'right' | 'bottom' | 'left', number>> = {
  1: { top: 0, right: 0, bottom: 0, left: 0 },
  2: { top: 0, right: 1, bottom: 0, left: 1 },
  3: { top: 0, right: 1, bottom: 2, left: 1 },
  4: { top: 0, right: 1, bottom: 2, left: 3 },
}

/** The value each side gets from `property` (`margin`, `padding`) and its longhands. */
function sides (property: 'margin' | 'padding'): Record<'top' | 'right' | 'bottom' | 'left', string> {
  const parts = (declarations.get(property) ?? '').split(/\s+/).filter(Boolean)
  // CSS shorthand: one value is every side, two are top/bottom and sides, three are top, sides and bottom, four are top, right, bottom, left.
  const position = SHORTHAND[parts.length] ?? SHORTHAND[1]!
  const shorthand = (side: 'top' | 'right' | 'bottom' | 'left'): string => parts[position[side]] ?? ''
  return {
    top: declarations.get(`${property}-top`) || shorthand('top'),
    right: declarations.get(`${property}-right`) || shorthand('right'),
    bottom: declarations.get(`${property}-bottom`) || shorthand('bottom'),
    left: declarations.get(`${property}-left`) || shorthand('left'),
  }
}

/** A CSS length in px; a value that is not a length (or a keyword) answers `NaN`. */
function px (value: string): number {
  const match = /^(-?\d+(?:\.\d+)?)(?:px)?$/.exec(value)
  return match ? Number(match[1]) : Number.NaN
}

describe('DatabasesView: the tab window stays inside its column', () => {
  it('draws the window with no side margin and no side padding', () => {
    for (const property of ['margin', 'padding'] as const) {
      const side = sides(property)
      expect(px(side.left), `${property}-left`).toBe(0)
      expect(px(side.right), `${property}-right`).toBe(0)
    }
  })

  it('gives the window the width of its column', () => {
    expect(['100%', 'auto']).toContain(declarations.get('width') ?? '100%')
  })
})

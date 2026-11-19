import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { userInstancesTooltipLocation } from './user-instances-tooltip-location'

// jsdom has no layout: the viewport and the element boxes are stubbed.
function place (left: boolean, activator: { left: number, right: number, top: number }, size: { width: number, height: number }) {
  const viewport = { width: 1000, height: 800 }
  const content = { offsetWidth: size.width, offsetHeight: size.height } as HTMLElement
  const target = document.createElement('span')
  target.getBoundingClientRect = () => ({ ...activator, bottom: activator.top + 20, width: activator.right - activator.left, height: 20, x: activator.left, y: activator.top, toJSON: () => ({}) })
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: viewport.width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewport.height })
  const styles = ref<Record<string, string>>({})
  const strategy = userInstancesTooltipLocation(left)
  const data = { contentEl: ref(content), target: ref(target) } as never
  strategy(data, { maxHeight: 445 } as never, styles as never).updateLocation()
  return styles.value
}

describe('userInstancesTooltipLocation', () => {
  it('puts the card 12px left of the activator with its top at the activator top', () => {
    const styles = place(true, { left: 700, right: 740, top: 100 }, { width: 460, height: 300 })
    expect(styles.left).toBe('228px')
    expect(styles.top).toBe('100px')
    expect(styles.transformOrigin).toBe('right top')
  })

  it('puts the card 12px right of the activator when left is false', () => {
    const styles = place(false, { left: 100, right: 140, top: 100 }, { width: 460, height: 300 })
    expect(styles.left).toBe('152px')
    expect(styles.transformOrigin).toBe('left top')
  })

  it('slides the card up (never flips) until its bottom is 12px above the viewport bottom', () => {
    const styles = place(true, { left: 700, right: 740, top: 700 }, { width: 460, height: 300 })
    expect(styles.top).toBe('488px')
  })

  it('keeps the card 12px inside the viewport horizontally', () => {
    const styles = place(true, { left: 100, right: 140, top: 100 }, { width: 460, height: 300 })
    expect(styles.left).toBe('12px')
  })
})

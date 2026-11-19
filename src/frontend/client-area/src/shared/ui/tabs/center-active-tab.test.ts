import { afterEach, describe, expect, it, vi } from 'vitest'
import { centerActiveTabOnMount, centerSelectedTab } from './center-active-tab'

function rect (left: number, width: number): DOMRect {
  return { left, width, right: left + width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) }
}

/** A tab strip as V4 renders it: root > `.v-slide-group__container` > `.v-tab` (jsdom has no layout, so the sizes are set by hand). */
function buildStrip ({ selected = true, scrollWidth = 600, clientWidth = 300, selectedLeft = 500 } = {}) {
  const root = document.createElement('div')
  const container = document.createElement('div')
  container.className = 'v-slide-group__container'
  Object.defineProperty(container, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(container, 'clientWidth', { value: clientWidth, configurable: true })
  container.getBoundingClientRect = () => rect(0, clientWidth)
  const tab = document.createElement('a')
  tab.className = selected ? 'v-tab v-tab--selected' : 'v-tab'
  tab.getBoundingClientRect = () => rect(selectedLeft, 100)
  container.append(tab)
  root.append(container)
  return { root, container }
}

describe('centerSelectedTab', () => {
  it('scrolls the selected tab to the middle of the strip', () => {
    const { root, container } = buildStrip({ selectedLeft: 500 })

    centerSelectedTab(root)

    // The tab centre is at 550, the strip centre at 150.
    expect(container.scrollLeft).toBe(300)
  })

  it('clamps the scroll to the end of the strip', () => {
    const { root, container } = buildStrip({ scrollWidth: 400, selectedLeft: 500 })

    centerSelectedTab(root)

    expect(container.scrollLeft).toBe(100)
  })

  it('does nothing when the strip does not overflow', () => {
    const { root, container } = buildStrip({ scrollWidth: 300, clientWidth: 300 })

    centerSelectedTab(root)

    expect(container.scrollLeft).toBe(0)
  })

  it('does nothing without a selected tab', () => {
    const { root, container } = buildStrip({ selected: false })

    centerSelectedTab(root)

    expect(container.scrollLeft).toBe(0)
  })

  it('does nothing without a scroll container', () => {
    expect(() => centerSelectedTab(document.createElement('div'))).not.toThrow()
  })
})

describe('centerActiveTabOnMount', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('centres the strip of the first element after the leading text anchor, on the next frame', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
    const { root, container } = buildStrip({ selectedLeft: 500 })
    const parent = document.createElement('div')
    const anchor = document.createTextNode('')
    parent.append(anchor, root)

    centerActiveTabOnMount({ el: anchor })

    expect(container.scrollLeft).toBe(300)
  })

  it('ignores a vnode without an element sibling', () => {
    const requestFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    const parent = document.createElement('div')
    const anchor = document.createTextNode('')
    parent.append(anchor)

    centerActiveTabOnMount({ el: anchor })
    centerActiveTabOnMount({ el: null })

    expect(requestFrame).not.toHaveBeenCalled()
  })
})

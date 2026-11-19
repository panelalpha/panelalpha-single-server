import { describe, expect, it } from 'vitest'
import { popupBlocked } from './popup'

describe('popupBlocked', () => {
  it('is blocked when window.open answered nothing', () => {
    expect(popupBlocked(null)).toBe(true)
  })

  it('is blocked for a window that is already closed or has no closed flag', () => {
    expect(popupBlocked({ closed: true } as Window)).toBe(true)
    expect(popupBlocked({} as Window)).toBe(true)
  })

  it('is not blocked for an open window', () => {
    expect(popupBlocked({ closed: false } as Window)).toBe(false)
  })
})

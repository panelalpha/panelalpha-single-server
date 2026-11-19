import { describe, expect, it } from 'vitest'
import { browserIcon, deviceIcon } from './device-icons'

describe('browserIcon', () => {
  it.each([
    ['Chrome 120', 'chromeIcon'],
    ['Firefox', 'firefoxIcon'],
    ['Opera Mini', 'operaIcon'],
    ['Microsoft Edge', 'edgeIcon'],
    ['Safari', 'safariIcon'],
    ['Brave', 'browserOtherIcon'],
    ['', 'browserOtherIcon'],
  ])('%s -> %s', (browser, icon) => {
    expect(browserIcon(browser)).toBe(icon)
  })

  it('keeps the legacy order: Chrome before Safari, Edge before Safari', () => {
    expect(browserIcon('Chrome Safari')).toBe('chromeIcon')
    expect(browserIcon('Edge Safari')).toBe('edgeIcon')
  })
})

describe('deviceIcon', () => {
  it.each([
    ['Windows', 'windowsIcon'],
    ['GNU/Linux', 'linuxIcon'],
    ['Mac', 'macOsIcon'],
    ['iOS', 'macOsIcon'],
    ['Android', 'androidIcon'],
    ['Unknown', 'deviceOtherIcon'],
    ['windows', 'deviceOtherIcon'],
  ])('%s -> %s', (device, icon) => {
    expect(deviceIcon(device)).toBe(icon)
  })
})

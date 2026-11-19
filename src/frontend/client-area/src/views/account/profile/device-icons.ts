const BROWSER_ICONS: Array<[string, string]> = [
  ['Chrome', 'chromeIcon'],
  ['Firefox', 'firefoxIcon'],
  ['Opera', 'operaIcon'],
  ['Edge', 'edgeIcon'],
  ['Safari', 'safariIcon'],
]

const DEVICE_ICONS: Record<string, string> = {
  'Windows': 'windowsIcon',
  'GNU/Linux': 'linuxIcon',
  'Mac': 'macOsIcon',
  'iOS': 'macOsIcon',
  'Android': 'androidIcon',
}

/** First match by substring, in legacy order (so "Chrome" wins over "Safari" in a Chrome user agent). */
export function browserIcon (browser: string): string {
  return BROWSER_ICONS.find(([name]) => browser.includes(name))?.[1] ?? 'browserOtherIcon'
}

/** Exact device name. */
export function deviceIcon (device: string): string {
  return DEVICE_ICONS[device] ?? 'deviceOtherIcon'
}

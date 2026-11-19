import type * as DeviceIconSet from './device-icon-set'
import { defineAsyncComponent } from 'vue'

// Browser and system logos (Safari, Firefox, Linux, ...: ~95 kB of SVG source) are drawn only by the devices table of `/my-account`
// (`$${browserIcon(...)}`), so they live in one chunk outside the entry. The route loader of `/my-account`
// waits for it (`withDeviceIcons`), so the icons are in memory when the async wrappers first render.

type IconName = keyof typeof DeviceIconSet

let pending: Promise<typeof DeviceIconSet> | null = null

function loadSet (): Promise<typeof DeviceIconSet> {
  pending ??= import('./device-icon-set').catch((error: unknown) => {
    // A failed fetch is forgotten, so the next render or route load tries again.
    pending = null
    throw error
  })
  return pending
}

function lazy (name: IconName) {
  return defineAsyncComponent(() => loadSet().then(set => set[name]))
}

export const lazyDeviceIcons = {
  linuxIcon: lazy('Linux'),
  windowsIcon: lazy('Windows'),
  macOsIcon: lazy('Mac'),
  androidIcon: lazy('Android'),
  deviceOtherIcon: lazy('DeviceOther'),
  chromeIcon: lazy('Chrome'),
  firefoxIcon: lazy('Firefox'),
  operaIcon: lazy('Opera'),
  edgeIcon: lazy('Edge'),
  safariIcon: lazy('Safari'),
  browserOtherIcon: lazy('BrowserOther'),
}

/** A route loader: the view's chunk together with the device icons. Icons that fail never fail the route. */
export async function withDeviceIcons<T> (view: Promise<T>): Promise<T> {
  const icons = loadSet().catch(() => undefined)
  const [loaded] = await Promise.all([view, icons])
  return loaded
}

/** For tests: forget the loaded chunk. */
export function resetDeviceIcons (): void {
  pending = null
}

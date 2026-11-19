import type { HomeResponse } from '@/shared/session/session.api'
import { watch, type WatchSource } from 'vue'

/**
 * Legacy mounts `App` only after `/home` has loaded, so everything in `App.mounted()` sees `home.app`.
 * Next mounts `App` first and `/home` arrives through the router guard, so that work runs once, on the first hydration
 * of `session.home` that carries `app`. Later hydrations (sign-in, `/home` refresh) run nothing.
 */
export function onFirstHomeHydration (
  source: WatchSource<HomeResponse | null | undefined>,
  handler: (home: HomeResponse) => void,
): void {
  let done = false
  watch(source, home => {
    if (done || !home?.app) {
      return
    }
    done = true
    handler(home)
  }, { immediate: true })
}

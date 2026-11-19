import type { Router } from 'vue-router'
import { clearChunkErrorAlert, showChunkErrorAlert } from './chunk-error-alert'

/**
 * A new deploy renames the hashed chunks, so the `import()` of a route in a tab that still runs the old `index` fails. One full reload
 * of the target URL picks up the new build. The loop guard is a timestamp in `sessionStorage`: a second chunk error while the mark
 * stands (the server is broken, not outdated) leaves the error alone, and so does a tab without storage or without a network.
 * A navigation that finishes clears the mark (`installChunkReload`), so the window is only a safety net for a mark that nothing
 * cleared. It is long on purpose: a reload cycle on a slow link can take far longer than a few seconds, and a short window would
 * let a broken chunk reload the tab again and again.
 * When a chunk error ends without a reload, the user gets an alert (`chunk-error-alert.ts`); a navigation that finishes removes it.
 */

export const CHUNK_RELOAD_KEY = 'chunk-reload-at'
export const CHUNK_RELOAD_WINDOW_MS = 5 * 60_000

// Chromium, Firefox, Safari, Vite's CSS preload and webpack-style messages.
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
  /Loading (?:CSS )?chunk [\w-]+ failed/i,
  /ChunkLoadError/i,
]

export interface ChunkReloadDeps {
  storage: () => Storage | null
  now: () => number
  online: () => boolean
  reload: (url: string) => void
  /** A chunk error that was not followed by a reload: tell the user. */
  notifyBlocked: (error: unknown) => void
  /** A navigation finished: the notice is out of date. */
  clearNotice: () => void
}

export function isChunkLoadError (error: unknown): boolean {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(text))
}

/** Starts one reload of `url` for a chunk error. Returns whether it did. */
export function reloadOnChunkError (error: unknown, url: string, deps: ChunkReloadDeps): boolean {
  if (!isChunkLoadError(error) || !deps.online()) {
    return false
  }
  const storage = deps.storage()
  if (!storage) {
    return false
  }
  try {
    const now = deps.now()
    const last = Number(storage.getItem(CHUNK_RELOAD_KEY))
    if (last > 0 && now - last < CHUNK_RELOAD_WINDOW_MS) {
      return false
    }
    storage.setItem(CHUNK_RELOAD_KEY, String(now))
  } catch {
    // Storage that throws cannot hold the guard, and a reload without a guard could loop.
    return false
  }
  deps.reload(url)
  return true
}

/** A navigation that finished proves the build is current, so a later deploy may reload once more. */
export function clearChunkReloadMark (deps: ChunkReloadDeps): void {
  try {
    deps.storage()?.removeItem(CHUNK_RELOAD_KEY)
  } catch {
    // Nothing to clear.
  }
}

export function browserChunkReloadDeps (): ChunkReloadDeps {
  return {
    storage: () => {
      try {
        return window.sessionStorage
      } catch {
        return null
      }
    },
    now: () => Date.now(),
    online: () => navigator.onLine !== false,
    reload: url => {
      if (isSameDocument(url, window.location.href)) {
        // `assign` to an address that differs only by its hash scrolls instead of reloading.
        window.location.reload()
        return
      }
      window.location.assign(url)
    },
    // Neither may throw into the router: Pinia can be missing in a very early failure, and the original error must still come out.
    notifyBlocked: () => {
      try {
        showChunkErrorAlert()
      } catch {
        // No store, no alert.
      }
    },
    clearNotice: () => {
      try {
        clearChunkErrorAlert()
      } catch {
        // No store, nothing to clear.
      }
    },
  }
}

/** Same path and query, so `location.assign` would not load a new document. */
export function isSameDocument (url: string, currentHref: string): boolean {
  const target = new URL(url, currentHref)
  const current = new URL(currentHref)
  return target.origin === current.origin && target.pathname === current.pathname && target.search === current.search
}

export function installChunkReload (router: Router, deps: ChunkReloadDeps = browserChunkReloadDeps()): void {
  router.onError((error, to) => {
    if (!isChunkLoadError(error)) {
      return
    }
    if (!reloadOnChunkError(error, router.resolve(to.fullPath).href, deps)) {
      deps.notifyBlocked(error)
    }
  })
  router.afterEach((_to, _from, failure) => {
    if (!failure) {
      clearChunkReloadMark(deps)
      deps.clearNotice()
    }
  })
}

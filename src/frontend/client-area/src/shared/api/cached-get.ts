import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { api } from '@/shared/api/client'

// One request promise per url, kept for
// `seconds` (36000 by default). Deliberate departure from legacy: a rejected
// request is dropped from the cache, so one network error or 5xx does not block the action until the page is reloaded.

const DEFAULT_SECONDS = 36_000

interface CacheEntry {
  result: Promise<AxiosResponse<unknown>>
  /** Unix time in whole seconds, `Math.floor(Date.now() / 1000)`. */
  time: number
}

const cache = new Map<string, CacheEntry>()

/** `seconds` 0 fetches again on the next second; it still stores the answer, so it overwrites the entry of that url. */
export function cachedGet<T = unknown> (
  url: string,
  seconds?: number | null,
  config?: AxiosRequestConfig,
): Promise<AxiosResponse<T>> {
  const time = Math.floor(Date.now() / 1000)
  const ttl = seconds ?? DEFAULT_SECONDS
  const entry = cache.get(url)

  if (entry === undefined || entry.time + ttl < time) {
    const result = api.get<T>(url, config)
    cache.set(url, { result, time })
    // Only a rejected promise is dropped, and only while it is still the cached one (a newer request may have replaced it).
    result.catch(() => {
      if (cache.get(url)?.result === result) {
        cache.delete(url)
      }
    })
    return result
  }

  return entry.result as Promise<AxiosResponse<T>>
}

export function clearCachedGet (url: string): void {
  cache.delete(url)
}

/** Drops every entry whose url starts with `prefix` (no legacy counterpart; used after mutations). */
export function clearCachedGetByPrefix (prefix: string): void {
  for (const url of cache.keys()) {
    if (url.startsWith(prefix)) {
      cache.delete(url)
    }
  }
}

/** Drops every entry; called by the session on login, register, verify, social, 2FA and logout. */
export function clearAllCachedGet (): void {
  cache.clear()
}

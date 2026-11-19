// The pure part of the defensive mode select.
// The view translates `labelKey` with the count, so the labels follow the current language.

export interface EdgeCacheTtlOption {
  labelKey: string
  count: number
  /** Duration in seconds, sent as `ttl` to the defensive mode endpoint. */
  value: number
}

/** The five TTL options in legacy order. */
export const EDGE_CACHE_TTL_OPTIONS: readonly EdgeCacheTtlOption[] = [
  { labelKey: 'general.time.minute', count: 30, value: 1800 },
  { labelKey: 'general.time.hour', count: 1, value: 3600 },
  { labelKey: 'general.time.hour', count: 8, value: 28_800 },
  { labelKey: 'general.time.hour', count: 24, value: 86_400 },
  { labelKey: 'general.time.day', count: 7, value: 604_800 },
]

/** The initial defensive mode time: 30 minutes. */
export const DEFAULT_EDGE_CACHE_TTL = 1800

/**
 * Turning the cache on for a domain whose DNS is served by Cloudflare needs the
 * confirmation modal first, unless the user has already confirmed it.
 */
export function shouldWarnCloudflare (isActive: boolean, confirmed: boolean, hasCloudflareDns: boolean): boolean {
  return !isActive && !confirmed && hasCloudflareDns
}

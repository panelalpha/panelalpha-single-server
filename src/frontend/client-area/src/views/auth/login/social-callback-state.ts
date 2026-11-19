/**
 * ?state may carry JSON with `reseller_domain`; when it differs
 * from the current hostname the callback jumps to that host (port, path, query preserved).
 * Null-safe: anything unparsable or without a string `reseller_domain` yields null.
 */
export function resolveResellerDomainRedirect (href: string, stateParam: unknown): string | null {
  if (typeof stateParam !== 'string' || stateParam === '') {
    return null
  }

  let state: unknown
  try {
    state = JSON.parse(stateParam)
  } catch {
    return null
  }

  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return null
  }

  const resellerDomain = (state as { reseller_domain?: unknown }).reseller_domain
  if (typeof resellerDomain !== 'string' || resellerDomain === '') {
    return null
  }

  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }

  if (url.hostname === resellerDomain.toLowerCase()) {
    return null
  }

  try {
    url.hostname = resellerDomain
  } catch {
    return null
  }

  return url.toString()
}

// Used by the app-lite card overlay for "Open project".
// A PanelAlpha-hosted site (WithoutDNS under panelalpha.online) opens its primary URL directly; any other site gets the preview modal.

/** True for `panelalpha.online` and its subdomains; an absolute URL is parsed, a bare host is compared as it is. */
export function isPanelAlphaOnlineHost (urlOrDomain: string | null | undefined): boolean {
  if (!urlOrDomain || typeof urlOrDomain !== 'string') {
    return false
  }
  let host = urlOrDomain
  if (urlOrDomain.includes('://')) {
    try {
      host = new URL(urlOrDomain).hostname
    } catch {
      return false
    }
  }
  host = host.replace(/\.$/, '').toLowerCase()
  return host === 'panelalpha.online' || host.endsWith('.panelalpha.online')
}

/** The address with a scheme (`https://` when missing); the caller opens it in a new tab. */
export function openProjectHref (url: string): string {
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
}

/** A panelalpha.online site opens its URL (nothing without one), any other site gets the preview modal. */
export function resolveOpenProject (instance: { url?: string | null, domain?: string | null }): { kind: 'open', href: string } | { kind: 'preview' } | { kind: 'none' } {
  if (!isPanelAlphaOnlineHost(instance.url || instance.domain)) {
    return { kind: 'preview' }
  }
  return instance.url ? { kind: 'open', href: openProjectHref(instance.url) } : { kind: 'none' }
}

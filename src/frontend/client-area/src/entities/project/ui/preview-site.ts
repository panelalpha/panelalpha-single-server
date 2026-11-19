import type { PreviewSite } from '@/entities/project/instance-preview.api'

// A stored preview
// site is reused while `valid_until` (Unix seconds) is in the future. Anything else (absent, `null`, expired, not a number) means
// "no site yet" and the modal shows its initial state. Unlike legacy, a missing field never throws.

/** The current time in Unix seconds, the unit of `valid_until`. */
export function unixNow (): number {
  return Math.floor(Date.now() / 1000)
}

/** The stored `preview_site` of the instance when it is still valid at `nowSeconds`, otherwise `null`. */
export function validPreviewSite (previewSite: unknown, nowSeconds: number): PreviewSite | null {
  if (typeof previewSite !== 'object' || previewSite === null) {
    return null
  }
  const { url, valid_until: validUntil } = previewSite as { url?: unknown, valid_until?: unknown }
  if (typeof url !== 'string' || url === '' || !validUntil) {
    return null
  }
  const seconds = Number(validUntil)
  if (!Number.isFinite(seconds) || seconds <= nowSeconds) {
    return null
  }
  return { url, valid_until: String(validUntil) }
}

/** The link opens over https. */
export function previewSiteHref (url: string): string {
  return url.startsWith('https://') ? url : `https://${url}`
}

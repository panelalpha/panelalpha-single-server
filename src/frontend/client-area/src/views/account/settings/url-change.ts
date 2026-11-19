// The Application URL and the default domain, edited in place on the General form (legacy edited the hostname in a modal).
// Validation and the OAuth callbacks after a URL change.
import type { Translate } from './settings-general'

const HOSTNAME = /^[a-z0-9.-]+$/i

/** Whether the trimmed value is a domain name: letters, digits, dots and dashes. */
export function isValidHostname (value: string | null | undefined): boolean {
  return HOSTNAME.test((value ?? '').trim())
}

/** Whether the trimmed value is what the backend stores: an http(s) origin, `scheme://host[:port]`, no path, query or credentials. */
export function isOrigin (value: string | null | undefined): boolean {
  let url: URL
  try {
    url = new URL((value ?? '').trim())
  } catch {
    return false
  }
  return ['http:', 'https:'].includes(url.protocol) && url.hostname !== '' && url.pathname === '/'
    && url.search === '' && url.hash === '' && url.username === '' && url.password === ''
}

/** Whether an origin is https: the Engine serves the panel over HTTPS only. */
export function isHttps (value: string): boolean {
  return new URL(value.trim()).protocol === 'https:'
}

/** The number after the colon of a value written as `scheme://host:port` and nothing else, as `new URL()` reads a port. */
export function writtenPort (value: string | null | undefined): number | null {
  const match = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]+:(\d+)$/i.exec((value ?? '').trim())
  return match ? Number(match[1]) : null
}

/** Whether the value writes no port, or one a server can listen on. */
export function isUsablePort (value: string | null | undefined): boolean {
  const port = writtenPort(value)
  return port === null || (port >= 1 && port <= 65_535)
}

/** The Application URL: required, then a port, then an origin, then https. */
export function urlRules (t: Translate): Array<(value: string | null | undefined) => true | string> {
  return [
    value => !!(value && value.trim()) || t('settings.validation.required', { field: t('settings.url') }),
    // Before the origin rule: `new URL()` refuses such a port, which would read as a path problem.
    value => !value || isUsablePort(value) || t('settings.validation.port'),
    value => !value || isOrigin(value) || t('settings.validation.url'),
    value => !value || !isOrigin(value) || isHttps(value) || t('settings.validation.urlHttps'),
  ]
}

/** The default domain: empty clears it, anything else is a domain name. */
export function sitesBaseDomainRules (t: Translate): Array<(value: string | null | undefined) => true | string> {
  return [value => !(value ?? '').trim() || isValidHostname(value) || t('settings.validation.domain')]
}

/** One OAuth redirect URL per enabled provider. */
export function callbackUrls (savedUrl: string, providers: string[]): string[] {
  return providers.map(provider => `${savedUrl}/auth/${provider}/callback`)
}

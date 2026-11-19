import type { SslCertificate } from '@/entities/ssl/ui/ssl-status'
import { api } from '@/shared/api/client'
import { onSessionCleared } from '@/shared/session/session-reset'

// Identical in app and app-lite: the certificates of one server account, cached per account until
// `resetCache()`, and `GET /ssl-offer` through `Api.cached()` (36000 s). Shared by the Domains screen and `SslEditModal`,
// so it lives here and not in a feature.

export type { SslCertificate } from '@/entities/ssl/ui/ssl-status'

/** One `GET /ssl-offer` item (the select shows `lang[offer.slug]` and sends `offer.id`). */
export interface SslOffer {
  [key: string]: unknown
  id: number | string
  slug?: string
  name?: string
}

interface AccountCertificateCache {
  installed: Map<string, SslCertificate>
  detected: Map<string, SslCertificate>
}

const caches = new Map<number, AccountCertificateCache>()
const OFFERS_CACHE_SECONDS = 36_000
let offersCache: { time: number, result: Promise<SslOffer[]> } | null = null

function cacheOf (accountId: number): AccountCertificateCache {
  let cache = caches.get(accountId)
  if (!cache) {
    cache = { installed: new Map(), detected: new Map() }
    caches.set(accountId, cache)
  }
  return cache
}

/** `Hosting.resetCache()` of one account (legacy keeps one `Hosting` instance per account). */
export function resetCertificateCache (accountId: number): void {
  caches.delete(accountId)
}

/** Forgets every cache (certificates and offers): on sign-out, so the next user does not see the previous one's data, and in tests. */
export function resetSslCaches (): void {
  caches.clear()
  offersCache = null
}

// `clearSession()` (sign-out, 401) runs the handlers of `shared/session/session-reset`; the session store does not import this module.
onSessionCleared(resetSslCaches)

async function fetchCertificate (
  kind: 'installed' | 'detected',
  accountId: number,
  domain: string,
  skipCache: boolean,
): Promise<SslCertificate | null> {
  const store = cacheOf(accountId)[kind]
  if (!skipCache && store.has(domain)) {
    return store.get(domain) ?? null
  }
  // Legacy interpolates the domain unescaped; for a valid host name the encoded form is the same string.
  const { data } = await api.get<{ data: SslCertificate | null }>(`/server-accounts/${accountId}/ssl/certificate/${kind}?domain=${encodeURIComponent(domain)}`)
  const certificate = data.data
  // Only a certificate is cached: a `null` is asked again next time.
  if (certificate) {
    store.set(domain, certificate)
  }
  return certificate ?? null
}

/**
 * `GET /server-accounts/{id}/ssl/certificate/installed?domain=`. Legacy never settles the promise when the request fails (the row's
 * spinner stays); here the promise rejects and the caller leaves the spinner on, which looks the same.
 */
export function getInstalledCertificate (accountId: number, domain: string): Promise<SslCertificate | null> {
  return fetchCertificate('installed', accountId, domain, false)
}

/** `GET /server-accounts/{id}/ssl/certificate/detected?domain=`; `skipCache` asks again even for a cached certificate. */
export function getDetectedCertificate (accountId: number, domain: string, skipCache = false): Promise<SslCertificate | null> {
  return fetchCertificate('detected', accountId, domain, skipCache)
}

/**
 * `GET /instances/{id}/ssl/certificate/detected-by-url` (lite): the certificate of an instance whose URL is an IP
 * address. Legacy keeps no cache for this endpoint, so none is kept here either.
 */
export async function getDetectedCertificateByUrl (instanceId: number): Promise<SslCertificate | null> {
  const { data } = await api.get<{ data: SslCertificate | null }>(`/instances/${instanceId}/ssl/certificate/detected-by-url`)
  return data.data ?? null
}

/** `GET /ssl-offer`, cached as in legacy: the request promise lives 36000 s. */
export function listSslOffers (): Promise<SslOffer[]> {
  const time = Math.floor(Date.now() / 1000)
  if (offersCache === null || offersCache.time + OFFERS_CACHE_SECONDS < time) {
    offersCache = {
      time,
      result: api.get<{ data: SslOffer[] }>('/ssl-offer').then(response => response.data.data ?? []),
    }
    // A failed request is not kept for the 36000 s: the next call asks again.
    const failed = offersCache
    failed.result.catch(() => {
      if (offersCache === failed) {
        offersCache = null
      }
    })
  }
  return offersCache.result
}

/** `POST /server-accounts/{id}/ssl/certificates/order`: orders a certificate of an offer. */
export async function orderCertificate (accountId: number, domain: string, providerId: number | string): Promise<void> {
  await api.post(`/server-accounts/${accountId}/ssl/certificates/order`, { domain, provider_id: providerId })
}

/** The custom certificate of the install form; the CA bundle may be empty. */
export interface InstallCertificateBody {
  domain: string
  certificate: string
  key: string
  cabundle: string
}

/** `PUT /server-accounts/{id}/ssl/certificates/install`: installs a custom certificate (`certificate_id` is always `null`). */
export async function installCertificate (accountId: number, body: InstallCertificateBody): Promise<void> {
  await api.put(`/server-accounts/${accountId}/ssl/certificates/install`, { ...body, certificate_id: null })
}

/**
 * `DELETE /server-accounts/{id}/ssl/certificates/installed?domain=`: drops the installed certificate and its key, and answers the
 * certificate the domain carries now (the server's own, or the issuer's). Older Engines answer 405/404, which the panel words.
 */
export async function removeCertificate (accountId: number, domain: string): Promise<SslCertificate | null> {
  const { data } = await api.delete<{ data: SslCertificate | null }>(`/server-accounts/${accountId}/ssl/certificates/installed?domain=${encodeURIComponent(domain)}`)
  return data.data ?? null
}

/** `POST /server-accounts/{id}/ssl/certificates/retry` (wp-cloud): orders the certificate of the domain again. */
export async function retryCertificate (accountId: number, domain: string): Promise<void> {
  await api.post(`/server-accounts/${accountId}/ssl/certificates/retry`, { domain })
}

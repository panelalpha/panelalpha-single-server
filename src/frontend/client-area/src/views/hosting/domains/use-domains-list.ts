import type { HostingServerAccount, HostingService } from '@/views/hosting/hosting.types'
import type { HostingDomain } from './domains.types'
import { useTranslation } from 'i18next-vue'
import { type MaybeRefOrGetter, onScopeDispose, ref, type Ref, toValue, watch } from 'vue'
import { listProxyRules, type ProxyRule } from '@/views/hosting/containers/containers.api'
import { listDomains } from '@/views/hosting/hosting.api'
import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
import { getDetectedCertificate, getInstalledCertificate, resetCertificateCache } from '@/entities/ssl/ssl-certificates.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { useAppEvent } from '@/shared/events/app-events'
import { needsNsVerification, toDomainRow, usesProxyPointsTo, verificationIpv4, zoneConfigurationRecords } from './domains-list'

/** How long a row keeps the `highlight` class. */
export const HIGHLIGHT_MS = 1000

/**
 * The data of the Domains page: the list load with the certificate loaders, the row highlight and the SSL events of app-lite. The rows
 * are reactive: the DNS verdict and the certificates arrive per row after the list.
 *
 * App-lite also asks the proxy rules of the service in the same `Promise.all`, for "Points to"; a failed
 * request reads as no rules.
 *
 * The account is owned by the screen. A change of it (the first one included) reloads, as in legacy; with
 * `reloadOnIdOnly` (the project tab) only a new, truthy `id` does.
 */
export function useDomainsList (
  service: MaybeRefOrGetter<HostingService>,
  account: Ref<HostingServerAccount | null>,
  options: {
    singleServer?: MaybeRefOrGetter<boolean>
    /** `project`: reload only for a new, truthy account id. */
    reloadOnIdOnly?: boolean
    /** `project`: the `ssl-certificate-installed` event of another application is ignored. */
    instanceId?: MaybeRefOrGetter<number | undefined>
  } = {},
) {
  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const items = ref<HostingDomain[]>([])
  const loading = ref(true)
  // Message of the last failed list request; null when the last load worked. A failed load is not an empty list.
  const loadError = ref<string | null>(null)
  const supportedDomainTypes = ref<string[]>([])
  const highlightedDomain = ref('')

  let highlightTimer: ReturnType<typeof setTimeout> | undefined
  // Every reload takes a ticket; an answer of an older one (another account, a quicker second reload) is dropped.
  let reloadTicket = 0

  /** The row of this domain carries the `highlight` class for a second. */
  function highlight (domain: string): void {
    highlightedDomain.value = domain
    clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => {
      highlightedDomain.value = ''
    }, HIGHLIGHT_MS)
  }

  function itemClass (row: Pick<HostingDomain, 'domain'>): string | undefined {
    return highlightedDomain.value && row.domain === highlightedDomain.value ? 'highlight' : undefined
  }

  function verifyRow (row: HostingDomain, current: HostingServerAccount): void {
    if (!needsNsVerification(row)) {
      return
    }
    const hosting = toValue(service)
    verifyDomainResolving({
      domain: row.domain,
      onboardingSubdomain: '',
      dnsSettings: hosting.dns_settings ?? {},
      hasDnsServer: hosting.dns_server_enabled,
      ipv4Addresses: verificationIpv4(row, current),
      nameservers: current.nameservers,
      hostCNames: current.host_c_names ?? [],
      recordsFromDnsServer: zoneConfigurationRecords(row),
    }).then(status => {
      row.nsStatus = status ? 'ok' : false
    }).catch(() => {
      // legacy leaves the promise unhandled: the verdict stays `ok`
    })
  }

  // The first answer (either certificate) removes the row's spinner. A failed request leaves it on (legacy never settles it).
  function loadDetectedCertificate (row: HostingDomain, accountId: number): void {
    row.sslStatusLoading = true
    row.sslDetectedCert = null
    getDetectedCertificate(accountId, row.domain).then(certificate => {
      row.sslStatusLoading = false
      row.sslDetectedCert = certificate
    }).catch(() => undefined)
  }

  function loadInstalledCertificate (row: HostingDomain, accountId: number): void {
    row.sslStatusLoading = true
    row.sslInstalledCert = null
    getInstalledCertificate(accountId, row.domain).then(certificate => {
      row.sslStatusLoading = false
      row.sslInstalledCert = certificate
    }).catch(() => undefined)
  }

  /** Reloads the list; pass `true` after an add or an edit, so the changed domain comes first. */
  async function reload (sortByNewest = false): Promise<void> {
    const ticket = ++reloadTicket
    const current = account.value
    if (!current) {
      return
    }
    if (current.diagnostic_mode) {
      alerts.addAlert({ success: false, errorMessage: t('message.hostingAccountInDiagnosticMode') })
      loading.value = false
      return
    }
    loading.value = true
    try {
      const hosting = toValue(service)
      const askRules = usesProxyPointsTo(hosting, toValue(options.singleServer) ?? false)
      const [response, proxyRules] = await Promise.all([
        listDomains(current.id, sortByNewest),
        askRules ? listProxyRules(hosting.id).catch((): ProxyRule[] => []) : Promise.resolve(undefined),
      ])
      if (ticket !== reloadTicket) {
        return
      }
      loadError.value = null
      items.value = response.data.map(raw => toDomainRow(raw, { service: hosting, account: current, t, proxyRules }))
      supportedDomainTypes.value = response.meta?.domain_types ?? []
      // The reactive rows: what arrives later is written through them.
      for (const row of items.value) {
        verifyRow(row, current)
        loadDetectedCertificate(row, current.id)
        loadInstalledCertificate(row, current.id)
      }
    } catch (error) {
      if (ticket !== reloadTicket) {
        return
      }
      // The rows of the previous account must not stay under the selector of this one.
      items.value = []
      loadError.value = getErrorMessage(error)
      alerts.addAlert({ success: false, errorMessage: loadError.value })
    } finally {
      if (ticket === reloadTicket) {
        loading.value = false
      }
    }
  }

  /**
   * The refresh of a certificate the panel pushed: the answer replaces the one the row shows. The cell renders the detected
   * certificate, so both are asked; a failed request keeps the old value where the first load would leave its spinner on.
   */
  function refreshCertificates (row: HostingDomain, accountId: number): void {
    getDetectedCertificate(accountId, row.domain).then(certificate => {
      row.sslDetectedCert = certificate
      row.sslStatusLoading = false
    }).catch(() => undefined)
    getInstalledCertificate(accountId, row.domain).then(certificate => {
      row.sslInstalledCert = certificate
      row.sslStatusLoading = false
    }).catch(() => undefined)
  }

  /**
   * The account's certificates are asked again and the order is over (app-lite). The cache goes
   * first, or the certificates the rows were loaded with come back.
   */
  function onSslCertificateInstalled (row: HostingDomain): void {
    resetCertificateCache(row.serverAccountId)
    refreshCertificates(row, row.serverAccountId)
    row.ssl_order_status = 'none'
  }

  function onSslCertificateOrdered (row: HostingDomain): void {
    row.ssl_order_status = 'pending'
  }

  // Echo `ssl-certificate-installed` (the root event of app-lite): the row of the application's domain, if the list has it.
  useAppEvent('ssl-certificate-installed', application => {
    const instanceId = toValue(options.instanceId)
    if (instanceId !== undefined && application?.id !== instanceId) {
      return
    }
    const domain = application?.domain
    if (typeof domain !== 'string' || domain === '') {
      return
    }
    const row = items.value.find(item => item.domain === domain)
    if (row) {
      onSslCertificateInstalled(row)
    }
  })

  watch(account, (value, oldValue) => {
    if (value === oldValue) {
      return
    }
    if (options.reloadOnIdOnly && !(value?.id && value.id !== oldValue?.id)) {
      return
    }
    void reload()
  })

  onScopeDispose(() => {
    clearTimeout(highlightTimer)
  })

  return {
    items,
    loading,
    loadError,
    supportedDomainTypes,
    highlightedDomain,
    reload,
    highlight,
    itemClass,
    onSslCertificateInstalled,
    onSslCertificateOrdered,
  }
}

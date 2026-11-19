import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { listProxyRules } from '@/views/hosting/containers/containers.api'
import { listDomains } from '@/views/hosting/hosting.api'
import { makeService } from '@/views/hosting/hosting.fixtures'
import { verifyDomainResolving } from '@/entities/domain/verify-domain-resolving'
import { getDetectedCertificate, getInstalledCertificate, resetCertificateCache } from '@/entities/ssl/ssl-certificates.api'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { emit, resetAppEvents } from '@/shared/events/app-events'
import { useDomainsList } from './use-domains-list'

vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/views/hosting/hosting.api', () => ({ listDomains: vi.fn() }))
vi.mock('@/views/hosting/containers/containers.api', () => ({ listProxyRules: vi.fn() }))
vi.mock('@/entities/ssl/ssl-certificates.api', () => ({
  getDetectedCertificate: vi.fn(),
  getInstalledCertificate: vi.fn(),
  resetCertificateCache: vi.fn(),
}))
vi.mock('@/entities/domain/verify-domain-resolving', () => ({ verifyDomainResolving: vi.fn() }))

const account = { id: 11, domain: 'example.com', ipv4_addresses: ['192.0.2.10'], nameservers: ['ns1.example.com'], host_c_names: [] }
const cert = { self_signed: false, name_match: true, issuer_name: 'CA' }

function domain (name: string, overrides: Record<string, unknown> = {}) {
  return { domain: name, type: 'addon', has_dns_zone: false, capabilities: {}, updated_at: null, ...overrides }
}

function setup (accountValue: unknown = account, serviceOverrides = {}, options: { singleServer?: boolean, reloadOnIdOnly?: boolean, instanceId?: number } = {}) {
  const selected = ref<never>(accountValue as never)
  const service = makeService({ dns_settings: { verification_methods: [] }, dns_server_enabled: false, ...serviceOverrides })
  const scope = effectScope()
  const list = scope.run(() => useDomainsList(service, selected, options))!
  return { list, selected, scope, service }
}

describe('useDomainsList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    resetAppEvents()
    vi.mocked(listDomains).mockResolvedValue({ data: [domain('a.test')], meta: { domain_types: ['addon', 'sub'] } })
    vi.mocked(getDetectedCertificate).mockResolvedValue(cert)
    vi.mocked(getInstalledCertificate).mockResolvedValue(cert)
    vi.mocked(verifyDomainResolving).mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads the list of the account and the supported types', async () => {
    const { list } = setup()
    expect(list.loading.value).toBe(true)

    await list.reload()

    expect(listDomains).toHaveBeenCalledWith(11, false)
    expect(list.items.value.map(item => item.domain)).toEqual(['a.test'])
    expect(list.supportedDomainTypes.value).toEqual(['addon', 'sub'])
    expect(list.loading.value).toBe(false)
  })

  describe('proxy rules ("Points to")', () => {
    const rule = { id: 1, transport: 'http', upstream_host: 'app', upstream_port: 8080, upstream_protocol: 'http', listen_port: 80, server_name: 'a.test' }

    it('asks them for single-server and writes points_to', async () => {
      vi.mocked(listProxyRules).mockResolvedValue([rule])
      const { list } = setup(account, {}, { singleServer: true })

      await list.reload()

      expect(listProxyRules).toHaveBeenCalledWith(1)
      expect(list.items.value[0]!.points_to).toBe('app:8080')
    })

    it('does not ask them for a multi-server service of another type', async () => {
      const { list } = setup(account, { hosting_server_type: 'cpanel' }, { singleServer: false })

      await list.reload()

      expect(listProxyRules).not.toHaveBeenCalled()
      expect(list.items.value[0]!.points_to).toBeNull()
    })

    it('reads failed rules as none, without an alert', async () => {
      vi.mocked(listProxyRules).mockRejectedValue(new Error('boom'))
      const { list } = setup(account, {}, { singleServer: true })

      await list.reload()

      expect(list.items.value[0]!.points_to).toBeNull()
      expect(useAlertsStore().activeAlerts).toEqual([])
    })

    it('keeps loading until the rules are back', async () => {
      let answer!: (value: never) => void
      vi.mocked(listProxyRules).mockReturnValue(new Promise(resolve => {
        answer = resolve as never
      }))
      const { list } = setup(account, {}, { singleServer: true })

      const pending = list.reload()
      await flushPromises()
      expect(list.loading.value).toBe(true)
      expect(list.items.value).toEqual([])

      answer([rule] as never)
      await pending
      expect(list.loading.value).toBe(false)
      expect(list.items.value[0]!.points_to).toBe('app:8080')
    })
  })

  it('asks for the newest first when told to', async () => {
    const { list } = setup()

    await list.reload(true)

    expect(listDomains).toHaveBeenCalledWith(11, true)
  })

  it('reloads when the account changes, the first one included, and not for the same one', async () => {
    const { selected } = setup(null)
    await nextTick()
    expect(listDomains).not.toHaveBeenCalled()

    selected.value = account as never
    await flushPromises()
    expect(listDomains).toHaveBeenCalledTimes(1)

    selected.value = { ...account, id: 12 } as never
    await flushPromises()
    expect(listDomains).toHaveBeenCalledTimes(2)
    expect(listDomains).toHaveBeenLastCalledWith(12, false)
  })

  it('does not fetch for an account in diagnostic mode and says so', async () => {
    const { list } = setup({ ...account, diagnostic_mode: true })

    await list.reload()

    expect(listDomains).not.toHaveBeenCalled()
    expect(list.loading.value).toBe(false)
    expect(useAlertsStore().activeAlerts).toMatchObject([{ success: false, errorMessage: 'message.hostingAccountInDiagnosticMode' }])
  })

  it('raises an alert with the error message and ends loading when the list fails', async () => {
    vi.mocked(listDomains).mockRejectedValue({ response: { data: { message: 'Server Error' } } })
    const { list } = setup()

    await list.reload()

    expect(useAlertsStore().activeAlerts).toMatchObject([{ success: false, errorMessage: 'Server Error' }])
    expect(list.loading.value).toBe(false)
    expect(list.items.value).toEqual([])
  })

  it('keeps the message of a failed load until a load works again', async () => {
    vi.mocked(listDomains).mockRejectedValue({ response: { data: { message: 'Server Error' } } })
    const { list } = setup()

    await list.reload()
    expect(list.loadError.value).toBe('Server Error')

    await list.reload()
    expect(list.loadError.value).toBe('Server Error')

    vi.mocked(listDomains).mockResolvedValue({ data: [domain('a.test')], meta: { domain_types: [] } })
    await list.reload()
    expect(list.loadError.value).toBeNull()
  })

  it('drops the answer of an account that is no longer the selected one', async () => {
    let answerFirst!: (value: never) => void
    vi.mocked(listDomains)
      .mockReturnValueOnce(new Promise(resolve => {
        answerFirst = resolve as never
      }))
      .mockResolvedValueOnce({ data: [domain('b.test')], meta: { domain_types: [] } })
    const { list, selected } = setup()
    const first = list.reload()

    selected.value = { ...account, id: 12 } as never
    await flushPromises()
    answerFirst({ data: [domain('a.test')], meta: { domain_types: [] } } as never)
    await first

    expect(list.items.value.map(item => item.domain)).toEqual(['b.test'])
    expect(list.loading.value).toBe(false)
  })

  it('empties the list when the reload fails, so the rows of the previous account do not stay', async () => {
    const { list } = setup()
    await list.reload()
    expect(list.items.value).toHaveLength(1)
    vi.mocked(listDomains).mockRejectedValue(new Error('boom'))

    await list.reload()

    expect(list.items.value).toEqual([])
  })

  it('asks both certificates of every row; the first answer removes the spinner', async () => {
    let resolveInstalled: (value: typeof cert) => void = () => undefined
    vi.mocked(getInstalledCertificate).mockReturnValue(new Promise(done => {
      resolveInstalled = done
    }))
    const { list } = setup()

    await list.reload()
    await flushPromises()

    expect(getDetectedCertificate).toHaveBeenCalledWith(11, 'a.test')
    expect(getInstalledCertificate).toHaveBeenCalledWith(11, 'a.test')
    const [row] = list.items.value
    expect(row!.sslDetectedCert).toEqual(cert)
    expect(row!.sslInstalledCert).toBeNull()
    expect(row!.sslStatusLoading).toBe(false)

    resolveInstalled(cert)
    await flushPromises()
    expect(row!.sslInstalledCert).toEqual(cert)
  })

  it('leaves the spinner on when a certificate request fails', async () => {
    vi.mocked(getDetectedCertificate).mockRejectedValue(new Error('boom'))
    vi.mocked(getInstalledCertificate).mockRejectedValue(new Error('boom'))
    const { list } = setup()

    await list.reload()
    await flushPromises()

    expect(list.items.value[0]!.sslStatusLoading).toBe(true)
  })

  it('sets nsStatus from the verdict, and only for a row that needs the check', async () => {
    vi.mocked(listDomains).mockResolvedValue({
      data: [
        domain('addon.test', { has_dns_zone: true }),
        domain('sub.test', { type: 'sub', has_dns_zone: true }),
        domain('nozone.test', { has_dns_zone: false }),
      ],
      meta: { domain_types: [] },
    })
    vi.mocked(verifyDomainResolving).mockResolvedValue(false)
    const { list } = setup()

    await list.reload()
    await flushPromises()

    expect(verifyDomainResolving).toHaveBeenCalledTimes(1)
    expect(verifyDomainResolving).toHaveBeenCalledWith(expect.objectContaining({
      domain: 'addon.test',
      onboardingSubdomain: '',
      ipv4Addresses: ['192.0.2.10'],
      nameservers: ['ns1.example.com'],
      hostCNames: [],
      recordsFromDnsServer: [],
    }))
    expect(list.items.value.map(item => item.nsStatus)).toEqual([false, 'ok', 'ok'])
  })

  it('keeps nsStatus ok when the verdict is true', async () => {
    vi.mocked(listDomains).mockResolvedValue({ data: [domain('addon.test', { has_dns_zone: true })], meta: { domain_types: [] } })
    const { list } = setup()

    await list.reload()
    await flushPromises()

    expect(list.items.value[0]!.nsStatus).toBe('ok')
  })

  it('highlights a domain for a second', async () => {
    vi.useFakeTimers()
    const { list } = setup()

    list.highlight('a.test')
    expect(list.itemClass({ domain: 'a.test' })).toBe('highlight')
    expect(list.itemClass({ domain: 'b.test' })).toBeUndefined()

    vi.advanceTimersByTime(1000)
    expect(list.itemClass({ domain: 'a.test' })).toBeUndefined()
  })

  it('app-lite handlers: installed resets the cache and the order, ordered marks pending', async () => {
    vi.mocked(listDomains).mockResolvedValue({ data: [domain('a.test', { ssl_order_status: 'pending' })], meta: { domain_types: [] } })
    const { list } = setup()
    await list.reload()
    await flushPromises()
    vi.mocked(getInstalledCertificate).mockClear()
    const row = list.items.value[0]!

    list.onSslCertificateInstalled(row)
    expect(resetCertificateCache).toHaveBeenCalledWith(11)
    expect(row.ssl_order_status).toBe('none')
    expect(getInstalledCertificate).toHaveBeenCalledWith(11, 'a.test')

    list.onSslCertificateOrdered(row)
    expect(row.ssl_order_status).toBe('pending')
  })

  it('reacts to the Echo event of the application domain', async () => {
    vi.mocked(listDomains).mockResolvedValue({ data: [domain('a.test', { ssl_order_status: 'pending' })], meta: { domain_types: [] } })
    const { list } = setup()
    await list.reload()
    await flushPromises()

    emit('ssl-certificate-installed', { domain: 'other.test' })
    expect(list.items.value[0]!.ssl_order_status).toBe('pending')

    emit('ssl-certificate-installed', { domain: 'a.test' })
    expect(list.items.value[0]!.ssl_order_status).toBe('none')
  })

  describe('project options', () => {
    it('reloads only for a new, truthy account id', async () => {
      const { selected } = setup(null, {}, { reloadOnIdOnly: true })

      selected.value = { ...account, id: undefined } as never
      await flushPromises()
      expect(listDomains).not.toHaveBeenCalled()

      selected.value = account as never
      await flushPromises()
      expect(listDomains).toHaveBeenCalledTimes(1)

      selected.value = { ...account } as never
      await flushPromises()
      expect(listDomains).toHaveBeenCalledTimes(1)

      selected.value = { ...account, id: 12 } as never
      await flushPromises()
      expect(listDomains).toHaveBeenCalledTimes(2)
      expect(listDomains).toHaveBeenLastCalledWith(12, false)
    })

    it('keeps loading when the account has no id', async () => {
      const { list, selected } = setup(null, {}, { reloadOnIdOnly: true })

      selected.value = { ...account, id: undefined } as never
      await flushPromises()

      expect(list.loading.value).toBe(true)
    })

    it('ignores the Echo event of another application', async () => {
      vi.mocked(listDomains).mockResolvedValue({ data: [domain('a.test', { ssl_order_status: 'pending' })], meta: { domain_types: [] } })
      const { list } = setup(account, {}, { instanceId: 5 })
      await list.reload()
      await flushPromises()

      emit('ssl-certificate-installed', { id: 6, domain: 'a.test' })
      expect(list.items.value[0]!.ssl_order_status).toBe('pending')

      emit('ssl-certificate-installed', { id: 5, domain: 'a.test' })
      expect(list.items.value[0]!.ssl_order_status).toBe('none')
    })
  })
})

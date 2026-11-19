import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import * as emailRecords from './email-domain-records'
import * as hostingApi from './hosting.api'
import { makeService } from './hosting.fixtures'
import { readSelectedPlanId, SELECTED_PLAN_KEY, useHostingStore } from './hosting.store'

vi.mock('./hosting.api', () => ({ listServices: vi.fn(), getEmailDomains: vi.fn() }))
vi.mock('./email-domain-records', () => ({ checkAllDomains: vi.fn() }))

async function flush () {
  for (let i = 0; i < 5; i++) {
    await nextTick()
    await Promise.resolve()
  }
}

describe('useHostingStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    sessionStorage.clear()
  })

  it('loads and selects the first service', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1 }), makeService({ id: 2 })])
    const store = useHostingStore()

    expect(store.loadingServices).toBe(true)
    await store.loadServices()

    expect(store.loadingServices).toBe(false)
    expect(store.services.map(service => service.id)).toEqual([1, 2])
    expect(store.selectedService?.id).toBe(1)
  })

  it('selects the requested service', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1 }), makeService({ id: 2 })])
    const store = useHostingStore()
    await store.loadServices('2')
    expect(store.selectedService?.id).toBe(2)
  })

  it('keeps a suspended service when nothing else is offered', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1, status: 'suspended' })])
    const store = useHostingStore()
    await store.loadServices()

    expect(store.selectedService).toBeNull()
    expect(store.suspendedService?.id).toBe(1)
  })

  it('raises an alert and still ends loading when the request fails', async () => {
    vi.mocked(hostingApi.listServices).mockRejectedValue({ response: { data: { message: 'Server Error' } } })
    const store = useHostingStore()
    await store.loadServices()

    expect(store.loadingServices).toBe(false)
    expect(useAlertsStore().activeAlerts).toMatchObject([{ success: false, errorMessage: 'Server Error' }])
  })

  it('remembers the chosen plan in sessionStorage and clears it on leave', async () => {
    const store = useHostingStore()
    store.changeService(makeService({ id: 7 }))

    expect(sessionStorage.getItem(SELECTED_PLAN_KEY)).toBe('7')
    expect(readSelectedPlanId()).toBe(7)

    store.clearSelection()
    expect(readSelectedPlanId()).toBeNull()
  })

  it('checks the email records of a service with an email server and sets the dot flags', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1, email_server_enabled: true })])
    vi.mocked(hostingApi.getEmailDomains).mockResolvedValue({ data: [{ id: 1 }], meta: { is_email_dns_records_showed: true } })
    vi.mocked(emailRecords.checkAllDomains).mockResolvedValue(false)
    const store = useHostingStore()
    await store.loadServices()
    await flush()

    expect(hostingApi.getEmailDomains).toHaveBeenCalledWith(1)
    expect(store.showEmailRecordConfiguration).toBe(true)
    expect(store.isEmailRecordsConfigured).toBe(false)
  })

  it('does not query email domains for a service without an email server', async () => {
    vi.mocked(hostingApi.listServices).mockResolvedValue([makeService({ id: 1 })])
    const store = useHostingStore()
    await store.loadServices()
    await flush()

    expect(hostingApi.getEmailDomains).not.toHaveBeenCalled()
    expect(store.isEmailRecordsConfigured).toBe(true)
    expect(store.showEmailRecordConfiguration).toBe(false)
  })
})

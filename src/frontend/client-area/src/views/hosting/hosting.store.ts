import type { HostingService } from './hosting.types'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { checkAllDomains } from './email-domain-records'
import { selectService, sortServices } from './hosting-service'
import { getEmailDomains, listServices } from './hosting.api'

/** `sessionStorage` key of the chosen plan; removed when the user leaves the hosting area (`beforeRouteLeave`). */
export const SELECTED_PLAN_KEY = 'selectedPlanId'

export function readSelectedPlanId (): string | number | null {
  try {
    const stored = sessionStorage.getItem(SELECTED_PLAN_KEY)
    return stored ? JSON.parse(stored) as string | number : null
  } catch {
    return null
  }
}

function writeSelectedPlanId (id: number): void {
  try {
    sessionStorage.setItem(SELECTED_PLAN_KEY, JSON.stringify(id))
  } catch {
    // ignore
  }
}

/** State of the hosting frame. The frame owns `selectedService`; every hosting screen reads it. */
export const useHostingStore = defineStore('hosting', () => {
  const services = ref<HostingService[]>([])
  const selectedService = ref<HostingService | null>(null)
  const suspendedService = ref<HostingService | null>(null)
  const loadingServices = ref(true)
  /** `GET /services` failed: the frame shows the title and the alert only (also on single-server). */
  const servicesFailed = ref(false)
  const isEmailRecordsConfigured = ref(true)
  const showEmailRecordConfiguration = ref(false)

  /** `GET /services`, then pick the service (`requestedId`: params, session or query; see `resolveRequestedService`). */
  async function loadServices (requestedId: string | number | null = null): Promise<void> {
    loadingServices.value = true
    servicesFailed.value = false
    services.value = []
    suspendedService.value = null
    selectedService.value = null
    try {
      const sorted = sortServices(await listServices())
      suspendedService.value = sorted.suspended
      services.value = sorted.services
      selectedService.value = selectService(sorted, requestedId)
    } catch (error) {
      servicesFailed.value = true
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loadingServices.value = false
    }
  }

  /** Remembers the choice for the tab. The caller redirects when the new service lacks the current subpage. */
  function changeService (service: HostingService): void {
    selectedService.value = service
    writeSelectedPlanId(service.id)
  }

  /** `beforeRouteLeave` and unmount of the frame. */
  function clearSelection (): void {
    try {
      sessionStorage.removeItem(SELECTED_PLAN_KEY)
    } catch {
      // ignore
    }
  }

  /** Watcher `selectedService` with `checkEmailDomains`. */
  async function checkEmailDomains (service: HostingService): Promise<void> {
    try {
      const response = await getEmailDomains(service.id)
      if (selectedService.value?.id !== service.id) {
        return
      }
      showEmailRecordConfiguration.value = response.meta.is_email_dns_records_showed
      const configured = await checkAllDomains(response.data)
      if (selectedService.value?.id === service.id) {
        isEmailRecordsConfigured.value = configured
      }
    } catch {
      // legacy leaves the rejection unhandled; the dot just keeps its last value
    }
  }

  watch(selectedService, service => {
    if (!service) {
      return
    }
    if (service.email_server_enabled) {
      isEmailRecordsConfigured.value = true
      void checkEmailDomains(service)
    } else {
      isEmailRecordsConfigured.value = true
      showEmailRecordConfiguration.value = false
    }
  })

  return {
    services,
    selectedService,
    suspendedService,
    loadingServices,
    servicesFailed,
    isEmailRecordsConfigured,
    showEmailRecordConfiguration,
    loadServices,
    changeService,
    clearSelection,
    checkEmailDomains,
  }
})

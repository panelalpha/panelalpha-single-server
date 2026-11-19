import type { OnboardingService } from './onboarding-service'
import type { ServiceDomain } from './onboarding.api'
import type { Ref } from 'vue'
import { nextTick, onScopeDispose, ref, watch } from 'vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { getServiceDomains } from './onboarding.api'

/** A search runs 300 ms after the last call. */
export const DOMAIN_SEARCH_DEBOUNCE_MS = 300

/**
 * The domains of the selected service for
 * the domain step's combobox and the standard form. A request that answers after the service changed or a newer request started
 * is dropped (the `requestId` and service guard).
 *
 * `reload` is the first load with an empty term, `clear`
 * empties the list without resetting the request id.
 */
export function useServiceDomains (service: Ref<OnboardingService | null>) {
  const domains = ref<ServiceDomain[]>([])
  const loading = ref(false)
  let requestId = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function cancelSearch (): void {
    clearTimeout(timer)
    timer = undefined
  }

  function isStale (id: number, serviceId: number | string): boolean {
    return id !== requestId || serviceId !== service.value?.id
  }

  /** One request for the term; the answer lands only if it is still the current one. */
  async function load (term = ''): Promise<void> {
    const serviceId = service.value?.id
    if (!serviceId) {
      return
    }
    const id = ++requestId
    loading.value = true
    try {
      const list = await getServiceDomains(serviceId, term)
      if (isStale(id, serviceId)) {
        return
      }
      domains.value = list
    } catch (error) {
      if (isStale(id, serviceId)) {
        return
      }
      useAlertsStore().addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      if (!isStale(id, serviceId)) {
        loading.value = false
      }
    }
  }

  /** The debounced search of the typed term. */
  function search (term: string): void {
    cancelSearch()
    timer = setTimeout(() => {
      timer = undefined
      void load(term)
    }, DOMAIN_SEARCH_DEBOUNCE_MS)
  }

  /** Empties the list and drops what is in flight (and bumps the request id). */
  function clear (): void {
    cancelSearch()
    domains.value = []
    requestId++
    loading.value = false
  }

  /** The list starts again from an empty term, on the next tick. */
  function reload (): void {
    cancelSearch()
    domains.value = []
    requestId++
    void nextTick(() => load(''))
  }

  // A new service clears the list and loads its domains. A cleared service does nothing.
  watch(() => service.value?.id, (id, oldId) => {
    if (!id || id === oldId) {
      return
    }
    clear()
    void nextTick(() => load(''))
  })

  // A pending debounced search does not fire after the component is gone.
  onScopeDispose(cancelSearch)

  return { domains, loading, search, reload, clear, load }
}

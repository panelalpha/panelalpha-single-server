import type { MetricsPeriod } from '@/views/hosting/hosting.types'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isPageHidden } from '@/shared/browser/page-visibility'
import { DEFAULT_PERIOD } from './metrics-graphs'

const LIVE: MetricsPeriod = 'last-5-minutes'

/**
 * Live polls every 5 s through a 1 s interval: while a request is in flight the counter holds, and at 0 a request starts. Departures from
 * legacy: a tick does nothing while a request is in flight (legacy started the interval with `refreshIn = 0`, so until the first
 * response every tick fired another request) or while the tab is hidden (the counter holds). `load` must not throw.
 */
export function useMetricsRefresh (load: (period: MetricsPeriod) => Promise<void>) {
  const period = ref<MetricsPeriod>(DEFAULT_PERIOD)
  const fetching = ref(false)
  const refreshIn = ref(0)
  let intervalId: ReturnType<typeof setInterval> | null = null

  async function loadMetrics (): Promise<void> {
    fetching.value = true
    try {
      await load(period.value)
    } finally {
      fetching.value = false
      if (period.value === LIVE) {
        refreshIn.value = 5
      }
    }
  }

  function stopAutoRefresh (): void {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  function handleAutoRefresh (): void {
    if (period.value !== LIVE) {
      stopAutoRefresh()
      return
    }
    if (intervalId !== null) {
      return
    }
    intervalId = setInterval(() => {
      if (fetching.value || isPageHidden()) {
        return
      }
      refreshIn.value--
      if (refreshIn.value <= 0) {
        void loadMetrics()
      }
    }, 1000)
  }

  function setPeriod (value: MetricsPeriod): void {
    period.value = value
  }

  watch(period, () => {
    void loadMetrics()
    handleAutoRefresh()
  })

  onMounted(() => {
    if (!fetching.value) {
      void loadMetrics()
      handleAutoRefresh()
    }
  })

  onBeforeUnmount(stopAutoRefresh)

  return { period, fetching, refreshIn, setPeriod }
}

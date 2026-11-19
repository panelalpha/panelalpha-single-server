<template>
  <div
    class="usage-stats"
    data-testid="usage-card"
  >
    <UsageStatCard
      v-for="card in cards"
      :key="card.key"
      :loading="loading"
      :note="card.note"
      :percent="card.percent"
      :ring-testid="`usage-ring-${card.key}`"
      :ring-text="`${card.percent}%`"
      :rows="card.rows"
      :skeleton-rows="card.rows ? 2 : 1"
      :testid="`usage-stat-card-${card.key}`"
      :title="card.title"
    />
  </div>
</template>

<script lang="ts" setup>
  // The current metrics are fetched once on mount.
  // Three stat cards in a grid, one primary ring colour.
  import type { ServerMetricsCurrent } from '@/views/hosting/hosting.types'
  import type { UsageStatRow } from '@/shared/ui/usage-stat/UsageStatCard.vue'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { getServerMetricsCurrent } from '@/views/hosting/hosting.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import UsageStatCard from '@/shared/ui/usage-stat/UsageStatCard.vue'
  import { usageCardValues } from './server-metrics'
  import { COPY_CPU, COPY_RAM } from './usage-copy'

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const metrics = ref<ServerMetricsCurrent | null>(null)
  // Skeletons until the first answer (legacy shows 0% and 0 GB). After a failure the rings show 0 as legacy.
  const loading = ref(true)
  const values = computed(() => usageCardValues(metrics.value))

  function usedAvailableRows (key: string, used: number | string, available: number | string): UsageStatRow[] {
    const gb = t('general.size.gb')
    return [
      { key: 'used', label: t('heading.hosting.summary.planCard.space.used'), value: `${used} ${gb}`, testid: `usage-stat-used-${key}` },
      { key: 'available', label: t('heading.hosting.summary.planCard.space.available'), value: `${available} ${gb}`, testid: `usage-stat-available-${key}` },
    ]
  }

  const cards = computed(() => [
    {
      key: 'ram',
      title: COPY_RAM,
      percent: values.value.ramPercent,
      rows: usedAvailableRows('ram', values.value.ramUsedGb, values.value.ramFreeGb),
      note: undefined,
    },
    // The CPU has no rows, only the ring and a note (legacy has no "Available" row either).
    {
      key: 'cpu',
      title: COPY_CPU,
      percent: values.value.cpuPercent,
      rows: undefined,
      note: t('heading.hosting.usage.currentLoad', { defaultValue: 'Current load' }),
    },
    {
      key: 'disk',
      title: t('heading.hosting.summary.planCard.usage.disk'),
      percent: values.value.diskPercent,
      rows: usedAvailableRows('disk', values.value.diskUsedGb, values.value.diskFreeGb),
      note: undefined,
    },
  ])

  async function loadMetrics (): Promise<void> {
    try {
      metrics.value = await getServerMetricsCurrent()
    } catch (error) {
      // Legacy emits `alert-error` through `Api.parseErrorMessage`, which does not exist, so nothing is ever shown there.
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void loadMetrics()
  })
</script>

<style lang="scss" scoped>
.usage-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  margin-bottom: 24px;

  // Mockup width, not a `$grid-breakpoints` value.
  @media (width <= 1279.98px) {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

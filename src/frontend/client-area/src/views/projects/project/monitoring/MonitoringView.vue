<template>
  <div>
    <PageTitle
      :title="t('heading.instance.siteDetails.analytics.title')"
      variant="project"
    >
      <template #title-append>
        <div class="ml-auto">
          <SelectDropdown
            ref="periodSelect"
            item-text="text"
            item-value="value"
            :items="ANALYTICS_PERIOD_OPTIONS"
            :model-value="period"
            :return-object="false"
            size="lg"
            @update:model-value="changePeriod"
          />
        </div>
      </template>
    </PageTitle>

    <v-container class="px-0">
      <v-row class="responsive-row justify-stretch">
        <template v-if="!noData">
          <MonitoringVisitorsCard
            :data="visitsSeries"
            :data-indicators="visits.indicators"
            :loading="visitsLoading"
            :title="t('heading.instance.monitoring.chart.visitors')"
          />

          <!-- One loop over the breakdown table keeps the order: shares, then the doughnut, then the three pies. -->
          <template
            v-for="card in MONITORING_BREAKDOWN_CARDS"
            :key="card.metric"
          >
            <SharesCard
              v-if="card.kind === 'shares' && breakdown[card.metric].items.length > 0"
              :attribution="card.attribution"
              :data="breakdown[card.metric].items"
              :loading="breakdown[card.metric].loading"
              :title="t(card.titleKey)"
            />

            <DoughnutChartCard
              v-else-if="card.kind === 'doughnut' && breakdown[card.metric].items.length > 0"
              :data="breakdown[card.metric].items"
              :loading="breakdown[card.metric].loading"
              :title="t(card.titleKey)"
            />

            <PieChartCard
              v-else-if="card.kind === 'pie' && breakdown[card.metric].items.length > 0"
              :data="breakdown[card.metric].items"
              :loading="breakdown[card.metric].loading"
              :title="t(card.titleKey)"
            />
          </template>
        </template>

        <template v-else>
          <v-col
            class="responsive-card"
            cols="12"
          >
            <v-card
              class="monitoring-card"
              elevation="4"
            >
              <EmptyState
                :desc="t('message.emptyTable.monitoring.description')"
                :title="t('message.emptyTable.monitoring.title')"
              >
                <template #image>
                  <HostingDatabasesIllustration />
                </template>
              </EmptyState>
            </v-card>
          </v-col>
        </template>
      </v-row>
    </v-container>
  </div>
</template>

<script lang="ts" setup>
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, onMounted, reactive, ref } from 'vue'
  import {
    ANALYTICS_PERIOD_OPTIONS,
    type AnalyticsPeriod,
    DEFAULT_ANALYTICS_PERIOD,
    nextPeriod,
    normalizeSeries,
  } from '@/entities/project/instance-analytics'
  import { getVisitorsReport, getVisitsBreakdown, type VisitsBreakdownMetric } from '@/entities/project/instance-reporting.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import SelectDropdown from '@/shared/ui/form/SelectDropdown.vue'
  import HostingDatabasesIllustration from '@/shared/ui/illustrations/HostingDatabasesIllustration.vue'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import DoughnutChartCard from './cards/DoughnutChartCard.vue'
  import MonitoringVisitorsCard from './cards/MonitoringVisitorsCard.vue'
  import PieChartCard from './cards/PieChartCard.vue'
  import SharesCard from './cards/SharesCard.vue'
  import {
    breakdownItems,
    isNoData,
    MONITORING_BREAKDOWN_CARDS,
    type MonitoringBreakdownCard,
    type MonitoringItem,
    type VisitorsChart,
    visitorsChart,
  } from './monitoring'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()

  const period = ref<AnalyticsPeriod>(DEFAULT_ANALYTICS_PERIOD)
  // Empty until the first report lands.
  const visits = ref<VisitorsChart>({ labels: [], datasets: [], indicators: [] })
  const visitsLoading = ref(true)
  const periodSelect = ref<{ $el?: HTMLElement } | null>(null)
  const noData = computed(() => isNoData(visits.value, visitsLoading.value))
  const visitsSeries = computed(() => normalizeSeries(visits.value))

  // A report that legacy would not read keeps the current data. The error is swallowed, with no alert.
  // An answer for a period the user has left writes nothing and does not clear `loading`.
  async function fetchVisitors (id: number, requested: AnalyticsPeriod): Promise<void> {
    visitsLoading.value = true
    try {
      const chart = visitorsChart(await getVisitorsReport(id, requested))
      if (chart !== null && requested === period.value) {
        visits.value = chart
      }
    } catch {
      // The error is ignored, as in legacy.
    } finally {
      if (requested === period.value) {
        visitsLoading.value = false
      }
    }
  }

  interface BreakdownState {
    items: MonitoringItem[]
    loading: boolean
  }

  const alerts = useAlertsStore()
  // State per breakdown card, keyed by metric. Every card starts loading with no rows, so it stays hidden until
  // its answer lands.
  const breakdown = reactive(Object.fromEntries(
    MONITORING_BREAKDOWN_CARDS.map((card): [VisitsBreakdownMetric, BreakdownState] => [card.metric, { items: [], loading: true }]),
  ) as Record<VisitsBreakdownMetric, BreakdownState>)

  // A null answer throws in legacy (no list to read), so it takes the same `catch` path as a failed request.
  // Only the page card alerts; the other errors are swallowed and keep the card's rows. The period guard is as in `fetchVisitors`.
  async function fetchBreakdown (id: number, card: MonitoringBreakdownCard, requested: AnalyticsPeriod): Promise<void> {
    const state = breakdown[card.metric]
    state.loading = true
    try {
      const items = breakdownItems(await getVisitsBreakdown(id, card.metric, requested), card)
      if (items === null) {
        throw new Error(`Unexpected visits-by-${card.metric} answer`)
      }
      if (requested === period.value) {
        state.items = items
      }
    } catch (error) {
      if (card.alertOnError) {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      }
    } finally {
      if (requested === period.value) {
        state.loading = false
      }
    }
  }

  // The visitors report and the nine breakdowns start together for the current period, none
  // waits for another. The period is not remembered: a new visit starts from the default.
  function loadAll (): void {
    const id = props.instance.id
    void fetchVisitors(id, period.value)
    for (const card of MONITORING_BREAKDOWN_CARDS) {
      void fetchBreakdown(id, card, period.value)
    }
  }

  // The select emits twice, `nextPeriod` ignores the repeat.
  function changePeriod (selected: unknown): void {
    const next = nextPeriod(period.value, selected)
    if (next === null) {
      return
    }
    period.value = next
    loadAll()
    // Legacy V2 `v-select` keeps the focus after a pick (the field stays `primary--text`); V4 drops it when the menu closes.
    void nextTick(() => periodSelect.value?.$el?.querySelector('input')?.focus())
  }

  onMounted(() => {
    loadAll()
  })
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// Legacy `.responsive-row` is a plain row with no gap. V4 `.v-row` has a 24px gap, so the
// gap is zeroed here.
.responsive-row {
  --v-col-gap-x: 0px;
  --v-col-gap-y: 0px;
}

// Legacy select (V2 `.v-select` intrinsic width) measured 313 px on desktop and 209 px below `lg`;
// V4 is 132 px. Below `lg` the width also sets how far the title wraps (legacy: two lines).
.page-title .ml-auto > .v-input {
  min-width: 209px;
}

@media (min-width: map.get(v.$grid-breakpoints, lg)) {
  .page-title .ml-auto > .v-input {
    min-width: 313px;
  }
}
</style>

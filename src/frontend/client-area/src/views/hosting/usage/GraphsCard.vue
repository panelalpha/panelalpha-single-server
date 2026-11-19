<template>
  <div data-testid="graphs-card">
    <div
      class="graphs-controls"
      data-testid="graphs-controls"
    >
      <span
        class="graphs-live-note"
        data-testid="graphs-live-note"
      >{{ liveNote }}</span>

      <v-select
        v-model="period"
        class="graphs-period"
        data-testid="graphs-period"
        density="compact"
        hide-details
        :items="items"
        :label="t('heading.hosting.usage.graphs.period', { defaultValue: 'Period' })"
        :menu-props="{ class: 'graphs-period-menu', offset: -48 }"
        variant="outlined"
      />
    </div>

    <div
      class="graphs-grid"
      data-testid="graphs-grid"
    >
      <v-card
        v-for="card in cards"
        :key="card.key"
        class="graphs-card"
        :class="{ 'graphs-card--wide': card.wide }"
        :data-testid="`graphs-card-${card.key}`"
        elevation="4"
      >
        <div class="graphs-card__head">
          <p class="p-1 mb-0 font-weight-600 heading--text">
            {{ t(`heading.hosting.usage.graphs.${card.titleKey}`) }}
          </p>

          <div
            v-if="card.legend.length > 0"
            class="graphs-legend"
            :data-testid="`graphs-legend-${card.key}`"
          >
            <span
              v-for="(nameKey, index) in card.legend"
              :key="nameKey"
              class="graphs-legend__item"
            >
              <span :class="['graphs-legend__dot', `graphs-legend__dot--${index}`]" />
              {{ t(`heading.hosting.usage.graphs.${nameKey}`) }}
            </span>
          </div>
        </div>

        <div
          class="graphs-chart"
          :class="card.wide ? 'graphs-chart--wide' : 'graphs-chart--small'"
          :data-testid="`graphs-chart-${card.key}`"
        >
          <GraphsChartSkeleton v-if="!loaded" />

          <MetricsGraph
            v-else
            :graph-key="card.key"
            :height="card.height"
            :metrics="metrics"
            :period="metricsPeriod ?? undefined"
          />
        </div>
      </v-card>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // Live auto-refresh and the five graphs, as cards in a grid.
  import type { MetricsPeriod, ServerMetricsBucket } from '@/views/hosting/hosting.types'
  import { useTranslation } from 'i18next-vue'
  import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
  import { getServerMetricsByPeriod } from '@/views/hosting/hosting.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import GraphsChartSkeleton from './GraphsChartSkeleton.vue'
  import { graphConfig, GRAPHS, periodOptions } from './metrics-graphs'
  import MetricsGraph from './MetricsGraph.vue'
  import { useMetricsRefresh } from './use-metrics-refresh'

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  // Replaced as a whole on each answer, never changed in place, so the buckets need no deep proxies.
  const metrics = shallowRef<ServerMetricsBucket[] | null>(null)
  // The period the shown buckets belong to. The charts take their label shape from it, not from the select, so after a period change
  // the old buckets keep their own labels until the new answer comes.
  const metricsPeriod = ref<MetricsPeriod | null>(null)
  // The chart skeletons stay until the first answer of any period (the titles and legends show at once).
  // After a failure the empty chart is shown, as in legacy.
  const loaded = ref(false)

  const items = computed(() => periodOptions(t))

  // Only the latest request may write: a slow Live response must not overwrite the data of a newer period, nor land after unmount.
  let latestRequest = 0
  // One alert per run of failures: Live polls every 5 s, so an API outage would otherwise raise an alert on every tick.
  let failing = false

  async function loadMetrics (period: MetricsPeriod): Promise<void> {
    const request = ++latestRequest
    try {
      const data = await getServerMetricsByPeriod(period)
      if (request === latestRequest) {
        metrics.value = data
        metricsPeriod.value = period
        failing = false
      }
    } catch (error) {
      if (request === latestRequest && !failing) {
        failing = true
        // Legacy emits `alert-error` through `Api.parseErrorMessage`, which does not exist, so nothing is ever shown there.
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      }
    } finally {
      if (request === latestRequest) {
        loaded.value = true
      }
    }
  }

  onBeforeUnmount(() => {
    latestRequest++
  })

  const { period, fetching, refreshIn } = useMetricsRefresh(loadMetrics)

  // Only Live polls, so only Live shows the countdown. No aria-live: the text changes every second.
  // The counter holds at 0 while a request runs, so the text stops at 1 s as in the mockup (it counts 5 to 1), and it stays empty while
  // the first Live answer is on its way, when the shown buckets are not Live yet.
  const liveNote = computed(() => period.value === 'last-5-minutes' && (metricsPeriod.value === 'last-5-minutes' || !fetching.value)
    ? t('heading.hosting.usage.graphs.nextUpdate', { seconds: Math.max(refreshIn.value, 1), defaultValue: 'Next update in {{seconds}} s' })
    : '')

  const cards = GRAPHS.map(graph => ({
    ...graph,
    height: graph.wide ? 240 : 200,
    // The legend is for two series only (a single series is named by the card title).
    legend: graphConfig(graph.key).series.length > 1 ? graphConfig(graph.key).series.map(({ nameKey }) => nameKey) : [],
  }))
</script>

<style lang="scss">
// The V2 `v-select` menu (no `offset-y`) opens over the field with 40px, 12px items in the base text colour; V4 opens below it with 48px items.
.v-overlay.graphs-period-menu > .v-overlay__content.v-overlay__content {
  color: rgb(var(--v-theme-text));

  .v-list-item {
    min-height: 40px;
    font-size: 12px;
  }
}
</style>

<style lang="scss" scoped>
// The 959.98px media queries below are the mockup's width, not a `$grid-breakpoints` value.
.graphs-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  margin-bottom: 16px;

  @media (width <= 959.98px) {
    justify-content: space-between;
  }
}

.graphs-live-note {
  font-size: 14px;
  line-height: 20px;
  color: var(--v-text-base);
}

// V2 `v-select` grows to its `max-width`; the V4 input only wraps its content.
.graphs-period {
  flex: 0 0 auto;
  width: 160px;
  max-width: 160px;
}

.graphs-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;

  @media (width <= 959.98px) {
    grid-template-columns: minmax(0, 1fr);
  }
}

.graphs-card {
  padding: 20px 24px 16px;
  border-radius: 8px;

  @media (width <= 959.98px) {
    padding: 16px;
  }

  &--wide {
    grid-column: 1 / -1;
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 12px;
  }
}

.graphs-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;

  &__item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    line-height: 20px;
    color: var(--v-text-base);
  }

  &__dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;

    &--0 {
      background: var(--v-chart-visitors);
    }

    &--1 {
      background: var(--v-chart-bandwidth);
    }
  }
}

// The box `vue-apexcharts` makes around a chart is 15px taller than the chart, so the area only has a minimum height and the
// skeleton fills it.
.graphs-chart {
  display: flex;
  flex-direction: column;

  &--small {
    min-height: 200px;
  }

  &--wide {
    min-height: 240px;
  }
}
</style>

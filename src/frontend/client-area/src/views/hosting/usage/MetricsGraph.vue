<template>
  <div class="usage-chart">
    <ApexChart
      :height="height"
      :options="options"
      :series="series"
      :type="config.series.length === 1 ? 'area' : 'line'"
    />
  </div>
</template>

<script lang="ts" setup>
  // The other four graphs are the same component with other series and a formatter.
  import type { MetricsPeriod, ServerMetricsBucket } from '@/views/hosting/hosting.types'
  import type { GraphColors, GraphKey } from './metrics-graphs'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useSessionStore } from '@/shared/session/session.store'
  import ApexChart from '@/shared/ui/charts/ApexChart.vue'
  import { chartColor } from '@/shared/ui/charts/chart-colors'
  import { buildSeries, graphConfig, graphOptions } from './metrics-graphs'

  const props = defineProps<{
    metrics: ServerMetricsBucket[] | null
    graphKey: GraphKey
    period?: MetricsPeriod
    /** Card height in px: 200, or 240 for the wide CPU card. */
    height: number
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()

  const config = computed(() => graphConfig(props.graphKey))
  const colors: GraphColors = {
    axisLabel: chartColor('axis-label'),
    grid: chartColor('grid'),
    series: [chartColor('visitors'), chartColor('bandwidth')],
  }
  // The getter is read by Apex callbacks only (not while this computed runs), so new metrics do not rebuild the options: a Live tick
  // updates the series alone.
  const options = computed(() => graphOptions(() => props.metrics, config.value, t, colors, { period: props.period, dateFormat: session.home?.app?.default_date_format }))
  const series = computed(() => buildSeries(props.metrics, config.value, t))
</script>

<style lang="scss" scoped>
// The Usage charts take the mockup look. The global `_chart.scss` rules stay for the
// other charts; these `:deep()` rules (one more class, so they win) apply to the Usage charts only. The plot is placed by Apex
// (`grid.padding`, y label width) and not by `translate` rules.
.usage-chart {
  :deep(.apexcharts-canvas) {
    margin-bottom: 0;

    .apexcharts-xaxis-texts-g .apexcharts-text {
      transform: none;
    }

    .apexcharts-xcrosshairs {
      stroke: var(--v-gray-base);
      stroke-dasharray: 3 3;
    }

    .apexcharts-tooltip {
      min-width: 150px;
      max-width: none;
      padding: 8px 12px;
      border-radius: 4px;
      box-shadow: 0px 8px 24px 6px var(--shadowColor4), 0px 0px 1px 0px var(--shadowColor5);
      font-size: 14px;
      line-height: 20px;
      color: var(--v-text-darken2);
    }
  }

  :deep(.usage-tip__time) {
    margin-bottom: 4px;
    color: var(--v-text-base);
  }

  :deep(.usage-tip__row) {
    display: flex;
    align-items: center;
    gap: 8px;

    b {
      margin-left: auto;
      padding-left: 16px;
      font-weight: 700;
    }
  }

  :deep(.usage-tip__dot) {
    flex: 0 0 auto;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  :deep(.usage-tip__dot--0) {
    background: var(--v-chart-visitors);
  }

  :deep(.usage-tip__dot--1) {
    background: var(--v-chart-bandwidth);
  }
}
</style>

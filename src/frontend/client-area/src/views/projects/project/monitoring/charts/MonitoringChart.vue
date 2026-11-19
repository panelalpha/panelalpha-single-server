<template>
  <div class="chart-container">
    <ApexChart
      height="250"
      :options="options"
      :series="series"
      type="area"
    />
  </div>
</template>

<script lang="ts" setup>
  // Options and series come from `monitoring.ts`.
  // Legacy axis style `lineHeight: '16px'` is not an Apex 4 option, so it is not carried over (as in `areaChartOptions`).
  import type { NormalizedSeries } from '@/entities/project/instance-analytics'
  import { computed } from 'vue'
  import { visitorsChartOptions, visitorsChartSeries } from '@/views/projects/project/monitoring/monitoring'
  import ApexChart from '@/shared/ui/charts/ApexChart.vue'

  const props = defineProps<{
    chartdata: NormalizedSeries
  }>()

  const options = computed(() => visitorsChartOptions(props.chartdata))
  const series = computed(() => visitorsChartSeries(props.chartdata))
</script>

<style lang="scss" scoped>
// Canvas offsets and the legend spacing.
.chart-container {
  :deep(.apexcharts-canvas) {
    margin-top: -24px;
    margin-bottom: 12px;
  }

  // `!important` stays: the global `_chart.scss` (`.apexcharts-legend`) sets `justify-content: center !important`, and legacy beats
  // it with the same `!important`. Without it the global layer wins, not this chart.
  :deep(.apexcharts-legend) {
    justify-content: space-between !important;

    // Same reason: the global `_chart.scss` sets `margin` of every legend item with `!important` (`20px`, the first one without a left margin).
    .apexcharts-legend-series {
      margin-left: 4px !important;
      margin-right: 4px !important;
    }
  }
}
</style>

<template>
  <VueApexCharts
    :height="height"
    :options="options"
    :series="series"
    :type="type"
  />
</template>

<script lang="ts" setup>
  // The only place that imports `vue3-apexcharts` (pinned to 1.8.0 with `apexcharts` 4.7.0: the last MIT releases).
  // Legacy `vue-apexcharts` 1.6.2 re-renders on `options` / `series` changes; `vue3-apexcharts` watches both the same way.
  import type { ApexOptions } from './chart-types'
  import VueApexCharts from 'vue3-apexcharts'

  defineProps<{
    type: string
    height: number | string
    options: ApexOptions
    series: ApexOptions['series']
  }>()
</script>

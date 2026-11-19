<template>
  <ApexChart
    height="180"
    :options="options"
    :series="chartdata"
    type="donut"
  />
</template>

<script lang="ts" setup>
  // The legacy `RoundedDoughnut` chart type is replaced by Apex
  // `donut`, so the rounded slice ends are not carried over. Options come from `monitoring.ts`.
  import { computed } from 'vue'
  import { doughnutChartOptions } from '@/views/projects/project/monitoring/monitoring'
  import ApexChart from '@/shared/ui/charts/ApexChart.vue'

  const props = defineProps<{
    chartdata: number[]
    colors: string[]
    labels: string[]
  }>()

  const options = computed(() => doughnutChartOptions(props.labels, props.colors))
</script>

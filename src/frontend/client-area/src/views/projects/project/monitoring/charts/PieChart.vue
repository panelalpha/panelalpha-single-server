<template>
  <ApexChart
    height="180"
    :options="options"
    :series="chartdata"
    type="pie"
  />
</template>

<script lang="ts" setup>
  // Uses Apex instead of chart.js 2. Options come from
  // `monitoring.ts`. The square box of legacy `aspectRatio: 1` is the `.chart` wrapper of the card.
  import { computed } from 'vue'
  import { pieChartOptions } from '@/views/projects/project/monitoring/monitoring'
  import ApexChart from '@/shared/ui/charts/ApexChart.vue'

  const props = defineProps<{
    chartdata: number[]
    colors: string[]
    labels: string[]
  }>()

  const options = computed(() => pieChartOptions(props.labels, props.colors))
</script>

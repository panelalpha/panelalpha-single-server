<template>
  <v-col
    v-if="loading || data.length > 0"
    class="responsive-card"
    cols="12"
    lg="6"
  >
    <v-card
      class="monitoring-card"
      elevation="4"
    >
      <v-card-title>
        <h6 class="mb-4">
          {{ title }}
        </h6>
      </v-card-title>

      <v-card-text
        v-if="!loading"
        class="data-container"
      >
        <div class="chart">
          <DoughnutChart
            :chartdata="chart.series"
            :colors="chart.colors"
            :labels="chart.labels"
          />
        </div>

        <ul class="data-list">
          <li
            v-for="(item, index) in data"
            :key="index"
            class="list-item"
            :class="sliceClass(index)"
          >
            <span class="item-name">
              <b class="font-weight-600 text-truncate">{{ item.label }}</b>
            </span>

            <span>
              <b class="font-weight-600">{{ item.data }}</b>
            </span>
          </li>
        </ul>
      </v-card-text>

      <PieChartSkeleton v-else />
    </v-card>
  </v-col>
</template>

<script lang="ts" setup>
  // The slices run in reverse order
  // (`reversedChart`), the list keeps the API order. The column shows only while loading or with rows.
  import { computed } from 'vue'
  import DoughnutChart from '@/views/projects/project/monitoring/charts/DoughnutChart.vue'
  import { type MonitoringItem, reversedChart, sliceClass } from '@/views/projects/project/monitoring/monitoring'
  import PieChartSkeleton from './PieChartSkeleton.vue'

  const props = defineProps<{
    loading: boolean
    title: string
    data: MonitoringItem[]
  }>()

  const chart = computed(() => reversedChart(props.data))
</script>

<style lang="scss" scoped>
@use './chart-list' as chartList;

@include chartList.chart-list;

// Doughnut-only: the long label truncates before the value column.
.list-item .item-name b {
  max-width: calc(100% - 120px);
}

// Legacy `.v-skeleton-loader.speed::v-deep` (180px avatar, 16px ring) is not ported here: it targets the skeleton, which is a child
// component, and legacy never renders it in this scope. The skeleton's own `.speed` rule lives in `PieChartSkeleton.vue`.
</style>

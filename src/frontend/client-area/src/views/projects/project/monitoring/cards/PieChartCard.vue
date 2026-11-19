<template>
  <v-col
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
          <PieChart
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
            <span>
              <b class="font-weight-600">{{ item.label }}</b>
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
  // The parent view only mounts the card
  // when it has rows, so the card itself has no empty state. The list keeps the API order.
  import { computed } from 'vue'
  import PieChart from '@/views/projects/project/monitoring/charts/PieChart.vue'
  import { chartInput, type MonitoringItem, sliceClass } from '@/views/projects/project/monitoring/monitoring'
  import PieChartSkeleton from './PieChartSkeleton.vue'

  const props = defineProps<{
    loading: boolean
    title: string
    data: MonitoringItem[]
  }>()

  const chart = computed(() => chartInput(props.data))
</script>

<style lang="scss" scoped>
@use './chart-list' as chartList;

@include chartList.chart-list;
</style>

<template>
  <v-col
    class="responsive-card"
    cols="12"
  >
    <v-card
      class="monitoring-card"
      elevation="4"
    >
      <template v-if="!loading">
        <v-card-title>
          <h6 class="mb-4">
            {{ title }}
          </h6>
        </v-card-title>

        <v-card-text>
          <div class="monitoring-card__indicators-container">
            <MonitoringValueIndicator
              v-for="(item, index) in dataIndicators"
              :key="index"
              :color="item.color"
              :delta="item.delta"
              :title="item.label"
              :value="item.value"
            />
          </div>
        </v-card-text>

        <v-card-text class="monitoring-card__chart-text">
          <MonitoringChart
            :chartdata="data"
            class="monitoring-card__chart"
          />
        </v-card-text>
      </template>

      <ChartCardSkeleton v-else />
    </v-card>
  </v-col>
</template>

<script lang="ts" setup>
  import type { MonitoringIndicator } from '@/views/projects/project/monitoring/monitoring'
  // The chart container gets the legacy
  // inline `position: relative; height: 220px` from the scoped rule below.
  import type { NormalizedSeries } from '@/entities/project/instance-analytics'
  import MonitoringChart from '@/views/projects/project/monitoring/charts/MonitoringChart.vue'
  import ChartCardSkeleton from '@/shared/ui/skeletons/ChartCardSkeleton.vue'
  import MonitoringValueIndicator from './MonitoringValueIndicator.vue'

  defineProps<{
    loading: boolean
    title: string
    dataIndicators: MonitoringIndicator[]
    data: NormalizedSeries
  }>()
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.monitoring-card__chart {
  position: relative;
  height: 220px;
}

// Legacy last `.v-card__text` keeps its 24px bottom padding (`:last-child`, see `_chart-list.scss`).
.monitoring-card__chart-text {
  padding-bottom: 24px;
}

.monitoring-card {
  // Legacy `.monitoring-card__item` and `.monitoring-card__indicator` are not rendered by the legacy template, so they are not ported.

  .monitoring-card__indicators-container {
    display: flex;
    justify-content: flex-start;
    align-content: stretch;
  }

  @media (max-width: map.get(v.$grid-breakpoints, sm)) {
    .monitoring-card__indicators-container {
      flex-direction: row;
      flex-wrap: wrap;

      // Legacy `&.item { margin-top: 6px; margin-bottom: 6px }`: the margins give the
      // 12 px card height on light-mobile (one indicator row), so they are ported on the indicator root.
      :deep(.item) {
        margin-right: 0;
        min-width: 50%;
        margin-top: 6px;
        margin-bottom: 6px;

        .item__indicator {
          display: flex;
          justify-content: space-between;
        }
      }
    }
  }
}
</style>

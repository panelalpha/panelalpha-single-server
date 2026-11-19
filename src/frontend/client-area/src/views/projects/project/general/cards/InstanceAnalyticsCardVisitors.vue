<template>
  <info-card
    class="analytics-card analytics-card--visitors"
    data-testid="instance-analytics-visitors"
    span="half"
  >
    <template v-if="!loading">
      <v-card-text>
        <v-tabs v-model="activeTab">
          <v-tab
            class="py-2"
            :ripple="false"
            :value="0"
          >
            <div class="d-flex align-center">
              <v-icon
                class="mr-4"
                :color="activeTab === 0 ? 'primary' : ''"
                icon="$user"
                size="32"
              />

              <div class="d-flex flex-column">
                <p
                  class="p-4 mb-0 text-start heading--text font-weight-600 analytics-card__title"
                  :class="activeTab !== 0 ? 'text-gray-darken-1' : ''"
                >
                  {{ t('heading.instance.siteDetails.analytics.visitors.unique') }}
                </p>
                {{ ' ' }}

                <div class="d-flex justify-space-between">
                  <p class="current-data mb-0 heading--text font-weight-600">
                    {{ unique.current || 0 }}
                  </p>
                  {{ ' ' }}

                  <DeltaIndicator
                    v-if="unique.delta"
                    class="mt-2"
                    :value="unique.delta"
                  />
                </div>
              </div>
            </div>
            {{ ' ' }}
          </v-tab>

          <v-tab
            class="py-2"
            :ripple="false"
            :value="1"
          >
            <div class="d-flex align-center">
              <v-icon
                class="mr-4"
                :color="activeTab === 1 ? 'primary' : ''"
                icon="$logout"
                size="32"
              />

              <div class="d-flex flex-column">
                <p
                  class="p-4 mb-0 text-start heading--text font-weight-600 analytics-card__title"
                  :class="activeTab !== 1 ? 'text-gray-darken-1' : ''"
                >
                  {{ t('heading.instance.siteDetails.analytics.visitors.session') }}
                </p>
                {{ ' ' }}

                <div class="d-flex justify-space-between">
                  <p class="current-data mb-0 heading--text font-weight-600">
                    {{ session.current || 0 }}
                  </p>
                  {{ ' ' }}

                  <DeltaIndicator
                    v-if="session.delta"
                    class="mt-2"
                    :value="session.delta"
                  />
                </div>
              </div>
            </div>
            {{ ' ' }}
          </v-tab>
        </v-tabs>

        <v-tabs-window v-model="activeTab">
          <v-tabs-window-item :value="0">
            <div class="chart-container">
              <ApexChart
                :height="250"
                :options="uniqueOptions"
                :series="uniqueSeries"
                type="area"
              />
            </div>
          </v-tabs-window-item>

          <v-tabs-window-item :value="1">
            <div class="chart-container">
              <ApexChart
                :height="250"
                :options="sessionOptions"
                :series="sessionSeries"
                type="area"
              />
            </div>
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card-text>
    </template>

    <template v-else>
      <ChartCardSkeleton />
    </template>
  </info-card>
</template>

<script lang="ts" setup>
  // Shown only with the report provider
  // (the parent renders it under `integrations.report_provider_enabled`). The figures and series come normalized from `analytics.ts`.
  import type { AnalyticsMetric } from '@/views/projects/project/general/analytics'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { formatSessionTick } from '@/views/projects/project/general/analytics'
  import InfoCard from '@/views/projects/project/general/ui/InfoCard.vue'
  import { areaChartOptions } from '@/entities/project/instance-analytics'
  import ApexChart from '@/shared/ui/charts/ApexChart.vue'
  import { chartColor } from '@/shared/ui/charts/chart-colors'
  import DeltaIndicator from '@/shared/ui/delta-indicator/DeltaIndicator.vue'
  import ChartCardSkeleton from '@/shared/ui/skeletons/ChartCardSkeleton.vue'

  const props = defineProps<{
    unique: AnalyticsMetric
    session: AnalyticsMetric
    loading: boolean
  }>()

  const { t } = useTranslation()
  const activeTab = ref(0)

  const uniqueOptions = computed(() => areaChartOptions({
    color: chartColor('visitors'),
    categories: props.unique.series.labels,
    yFormatter: String,
    yMinWidth: 24,
    integerMax: Math.max(0, ...(props.unique.series.datasets[0] ?? [])),
  }))
  const uniqueSeries = computed(() => [{
    name: t('heading.instance.siteDetails.analytics.visitors.unique'),
    data: props.unique.series.datasets[0] ?? [],
  }])

  const sessionOptions = computed(() => areaChartOptions({
    color: chartColor('visitors'),
    categories: props.session.series.labels,
    yFormatter: formatSessionTick,
    yMinWidth: 24,
  }))
  const sessionSeries = computed(() => [{
    name: t('heading.instance.siteDetails.analytics.visitors.session'),
    data: props.session.series.datasets[0] ?? [],
  }])
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.current-data {
  font-size: v.$font-size-xlg;
  line-height: v.$line-height-xlg;
}

// The chart box: `position: relative; height: 220px`.
.chart-container {
  position: relative;
  height: 220px;
}

// V2 `.v-tab` was 40px high in the 48px bar (its two-line content overflowed it); V4 `.v-tab` fills the bar (48px) and centres the content.
// From the tab strip of this template (the card is rendered by `InfoCard`); the 24px under the chart lives in `InfoCard`.
.v-tabs :deep(.v-tab) {
  height: 40px;
}
</style>

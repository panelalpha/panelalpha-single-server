<template>
  <info-card
    class="analytics-card analytics-card--system"
    data-testid="instance-analytics-system"
    :span="reportProviderEnabled ? 'half' : 'full'"
  >
    <template v-if="!loading">
      <v-card-text>
        <v-tabs
          v-model="activeTab"
          color="info"
        >
          <v-tab
            class="py-2"
            :ripple="false"
            :value="0"
          >
            <div class="d-flex align-center">
              <v-icon
                class="mr-4"
                :color="activeTab === 0 ? 'info' : ''"
                icon="$bandwidth"
                size="32"
              />

              <div class="d-flex flex-column">
                <p
                  class="p-4 mb-0 text-left heading--text font-weight-600 analytics-card__title"
                  :class="activeTab !== 0 ? 'text-gray-darken-1' : ''"
                >
                  {{ t('heading.instance.siteDetails.analytics.visitors.bandwidth') }}
                </p>
                {{ ' ' }}

                <p class="p-4 mb-0 text-left text-gray-darken-1">
                  <span class="current-data heading--text font-weight-600">
                    {{ metric.current || '0 MB' }}
                  </span>
                </p>
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
                :options="options"
                :series="series"
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
  // The Bandwidth tab is the only one: the
  // CPU and storage tabs are commented out in legacy and stay out here. Half width beside the Visitors card, full width without it.
  import type { NormalizedSeries } from '@/entities/project/instance-analytics'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { formatBandwidthTick } from '@/views/projects/project/general/analytics'
  import InfoCard from '@/views/projects/project/general/ui/InfoCard.vue'
  import { areaChartOptions } from '@/entities/project/instance-analytics'
  import ApexChart from '@/shared/ui/charts/ApexChart.vue'
  import { chartColor } from '@/shared/ui/charts/chart-colors'
  import ChartCardSkeleton from '@/shared/ui/skeletons/ChartCardSkeleton.vue'

  const props = defineProps<{
    metric: { series: NormalizedSeries, current: string | null }
    loading: boolean
    reportProviderEnabled: boolean
  }>()

  const { t } = useTranslation()
  const activeTab = ref(0)

  const options = computed(() => areaChartOptions({
    color: chartColor('bandwidth'),
    categories: props.metric.series.labels,
    yFormatter: formatBandwidthTick,
  }))
  // Legacy series name `Total` (shown in the tooltip only); not translated in legacy either.
  const series = computed(() => [{
    name: 'Total',
    data: props.metric.series.datasets[0] ?? [],
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

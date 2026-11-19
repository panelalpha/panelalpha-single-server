<template>
  <div class="d-flex">
    <div class="d-flex align-center my-1 mx-1">
      <v-icon
        v-if="!Number.isFinite(percent)"
        :icon="`$${icon}`"
        size="62"
      />

      <ProgressSpeedChart
        v-else
        center-class="p-3"
        :color="color"
        :size="62"
        :value="`${percent}%`"
        :width="6"
      />
    </div>

    <div class="d-flex flex-column justify-center ml-4">
      <div class="p-2 text-gray-darken-1">
        <b>
          {{ title }}
        </b>
      </div>

      <div class="mt-1 p-3 font-weight-light text-gray-darken-1">
        {{ t('heading.hosting.summary.planCard.space.used') }}:
        <b class="font-weight-bold">{{ valueText }}</b>
        {{ usedPercentText }}
      </div>

      <div class="p-3 font-weight-light text-gray-darken-1">
        {{ t('heading.hosting.summary.planCard.space.available') }}:
        <v-icon
          v-if="availableText === '∞'"
          icon="$infiniteIcon"
          size="20"
        />

        <b
          v-else
          class="font-weight-bold"
        >{{ availableText }}</b>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import ProgressSpeedChart from '@/shared/ui/charts/ProgressSpeedChart.vue'
  import { spaceColor, usedPercent } from './plan-usage'

  const props = defineProps<{
    title: string
    icon: string
    value: number
    valueText: string | number
    available: number | null
    availableText: string
  }>()

  const { t } = useTranslation()

  // `Infinity` / `NaN` (no limit, or a zero limit) show the metric icon instead of a ring.
  const percent = computed(() => usedPercent(props.value, props.available))
  // Legacy prints the percentage whenever a limit exists, so a zero limit reads `(Infinity%)` / `(NaN%)`.
  const usedPercentText = computed(() => props.available === null ? '' : `(${percent.value}%)`)
  const color = computed(() => spaceColor(props.value, props.available))
</script>

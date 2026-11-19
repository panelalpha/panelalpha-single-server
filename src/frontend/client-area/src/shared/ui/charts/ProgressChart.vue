<template>
  <v-progress-linear
    bg-color="var(--v-chart-progress-track)"
    :buffer-value="100"
    :color="color"
    :height="4"
    :model-value="percent"
  />
</template>

<script lang="ts" setup>
  import { computed } from 'vue'

  const props = withDefaults(defineProps<{
    maxValue?: number
    value?: number
    color?: string
  }>(), {
    maxValue: 100,
    value: 50,
    color: 'var(--v-chart-pie-1)',
  })

  // A zero maximum (an unlimited quota with nothing used, a breakdown of zeros) gives an empty bar, not `NaN%`.
  const percent = computed(() => props.maxValue > 0 ? Math.ceil(props.value / props.maxValue * 100) : 0)
</script>

<style lang="scss" scoped>
.v-progress-linear {
  min-width: 100px;
  overflow: visible;
}

.v-progress-linear {
  :deep(.v-progress-linear__background) {
    border-radius: 3px;
    margin-left: 2px;
  }

  :deep(.v-progress-linear__determinate) {
    border-radius: 3px;
  }
}
</style>

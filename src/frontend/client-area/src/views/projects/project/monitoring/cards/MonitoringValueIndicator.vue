<template>
  <div
    class="item"
    :class="small ? 'item--small' : ''"
  >
    <p class="p-4 mb-1">
      {{ title }}
    </p>

    <div class="d-flex align-center item__indicator">
      <div
        v-if="color"
        class="item__value-indicator"
        :class="`item__value-indicator--${color}`"
      />

      <h1
        class="item__value"
        :class="!color ? 'pl-0' : ''"
      >
        {{ value }}
      </h1>

      <DeltaIndicator :value="delta" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import type { MonitoringIndicatorColor } from '@/views/projects/project/monitoring/monitoring'
  // Its inner delta is the kit `DeltaIndicator`.
  import DeltaIndicator from '@/shared/ui/delta-indicator/DeltaIndicator.vue'

  withDefaults(defineProps<{
    title?: string
    delta?: string | null
    value?: string | number
    /**
     * Token of the dot colour (`--v-chart-<color>`); `false` hides the dot. No default: both callers pass it,
     * and a string default trips `vue/require-valid-default-prop` on a union with `false`.
     */
    color?: MonitoringIndicatorColor | false
    small?: boolean
  }>(), {
    title: undefined,
    delta: undefined,
    value: undefined,
    color: undefined,
    small: false,
  })
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.item {
  margin-right: 48px;

  .item__value {
    font-weight: v.$font-weight-extrabold;
  }

  .item__value-indicator {
    position: relative;
    overflow: visible;

    // The dot takes its colour from the chart token of the variant (`currentColor` in the `::before` below).
    &--pie-1 {
      color: var(--v-chart-pie-1);
    }

    &--visitors {
      color: var(--v-chart-visitors);
    }

    &::before {
      content: '';
      position: absolute;
      left: 0;
      background: currentColor;
      top: calc(50% - 4px);
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
  }

  h1 {
    padding-left: 16px;
  }

  &.item--small {
    .item__value {
      font-size: v.$font-size-h3;
      line-height: v.$line-height-h3;
    }
  }
}
</style>

<template>
  <div class="step-indicator">
    <div
      v-for="item in previousSteps"
      :key="'previous-' + item"
      class="step__item step__item--active"
    />

    <div class="step__item step__item--active step__item--current" />

    <div
      v-for="item in nextSteps"
      :key="'next-' + item"
      class="step__item"
    />
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'

  /** Dots for the steps of a flow, the current one stretched. */
  const props = withDefaults(defineProps<{
    maxSteps?: number
    currentStep?: number
  }>(), {
    maxSteps: 0,
    currentStep: 0,
  })

  const previousSteps = computed(() => props.currentStep - 1)
  const nextSteps = computed(() => props.maxSteps - props.currentStep)
</script>

<style lang="scss" scoped>
  .step-indicator {
    display: flex;
    align-items: center;

    .step__item {
      width: 6px;
      height: 6px;
      margin: 0 2px;
      border-radius: 3px;
      background-color: var(--v-gray-lighten3);
      transition: background-color 0.24s ease, width 0.24s ease;

      &--active {
        background-color: rgb(var(--v-theme-primary));
      }

      &--current {
        width: 20px;
        background-color: rgb(var(--v-theme-primary));
      }
    }
  }
</style>

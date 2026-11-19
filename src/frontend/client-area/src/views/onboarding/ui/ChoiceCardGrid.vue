<template>
  <div
    class="selection-box"
    :class="{ 'selection-box--column': column }"
    role="radiogroup"
  >
    <slot />
  </div>
</template>

<script lang="ts" setup>
  // Option cards of an onboarding choice step: the legacy `.selection-box` around `CheckboxBig` cards:
  // two columns with a 20px gap, one column under 700px, 8px card radius.
  // `column`: the installation type step's column of full-width, top-left aligned cards.
  // The cards are radios of one group per step, so the box is their `radiogroup` (`aria-labelledby` names it).
  withDefaults(defineProps<{ column?: boolean }>(), { column: false })
</script>

<style lang="scss" scoped>
  .selection-box {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;

    @media (max-width: 700px) {
      grid-template-columns: 1fr;
    }

    :deep(.checkbox-big) {
      border-radius: 8px;

      &::after {
        border-radius: 8px;
      }
    }
  }

  .selection-box--column {
    display: flex;
    flex-direction: column;

    :deep(.checkbox-big) {
      width: 100%;
      min-width: unset;
      align-items: flex-start;
      justify-content: flex-start;
      overflow: visible;

      &::after {
        top: -1px;
        left: -1px;
        box-sizing: border-box;
      }
    }

    :deep(.checkbox-big__title:empty) {
      display: none;
    }
  }
</style>

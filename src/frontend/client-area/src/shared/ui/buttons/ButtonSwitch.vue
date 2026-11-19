<template>
  <div
    class="switch-container pl-1 d-flex"
    :class="start ? 'justify-start' : 'justify-center ml-2'"
  >
    <AppSwitch
      :id="attachId"
      :aria-label="ariaLabel"
      class="mt-0 pt-0"
      :disabled="disabled"
      kind="toggle"
      :loading="loading"
      :model-value="modelValue"
    />
  </div>
</template>

<script lang="ts" setup>
  import AppSwitch from '@/shared/ui/buttons/AppSwitch.vue'

  defineProps<{
    modelValue?: boolean
    attachId?: string
    // Accessible name of the input; legacy has none.
    ariaLabel?: string
    disabled?: boolean
    loading?: boolean | string
    start?: boolean
  }>()
</script>

<style lang="scss" scoped>
.switch-container {
  cursor: pointer;

  &--disabled {
    pointer-events: none;
  }

  :deep(.v-input.v-switch) {
    pointer-events: none;
    // V2 sized the switch input to its 45px box; V4 lets it grow and, beside wrapping text, pushed it out of a mobile card.
    flex: 0 0 auto;
  }

  // One look for every consumer: no per-screen margin and a disabled switch is always the V4 38 % dim.
  :deep(.v-input.v-switch .v-input__control),
  :deep(.v-input.v-switch .v-selection-control) {
    min-height: 40px;
  }
}
</style>

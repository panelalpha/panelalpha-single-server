<template>
  <div
    class="d-flex radio-container mb-4 flex-row"
    @click="emit('update:model-value', !modelValue)"
  >
    <div
      class="radio"
      :class="[
        customClass ? customClass : '',
        modelValue ? 'radio--enabled' : '',
        color ? `text-${color}` : 'text-primary',
      ]"
    />

    <label
      v-if="hasLabel"
      class="ml-4"
    >
      <slot />
    </label>
  </div>
</template>

<script lang="ts" setup>
  import { computed, useSlots } from 'vue'

  defineProps<{
    modelValue?: boolean
    color?: string
    customClass?: string
  }>()

  const emit = defineEmits<{
    'update:model-value': [value: boolean]
  }>()

  const slots = useSlots()
  const hasLabel = computed(() => Boolean(slots.default))
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.radio-container {
  > div,
  > label {
    cursor: pointer;
  }
}

.radio {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  position: relative;

  &::after {
    content: "";
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 1px solid map.get(v.$gray, base);
  }

  &--enabled {
    border: 5px solid currentColor;
  }
}
</style>

<template>
  <div class="color-swatch-container">
    <div
      v-for="color in colors"
      :key="color"
      class="color-swatch"
      :class="modelValue === color ? 'color-swatch--active' : ''"
      @click="select(color)"
    >
      <div
        class="color-swatch__content"
        :style="{ backgroundColor: color }"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The legacy add-label panel put the swatches straight
  // into its container; this component renders that container, so the DOM is container > swatch.
  // Two legacy consumers (`AddNewLabel`, `StyleManagerColorGroupPicker`), so it lives in the shared kit.
  defineProps<{ colors: readonly string[] }>()

  const modelValue = defineModel<string>({ default: '' })

  function select (color: string): void {
    modelValue.value = color
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.color-swatch-container {
  display: flex;
  flex-wrap: wrap;
  align-items: space-between;
  height: 68px;
}

.color-swatch {
  cursor: pointer;
  position: relative;
  display: flex;
  width: 32px;
  height: 32px;
  justify-content: center;
  align-items: center;

  &:hover {
    &:before {
      border-color: map.get(v.$gray, darken1);
    }
  }

  &:before {
    content: '';
    position: absolute;
    width: 32px;
    height: 32px;
    border: 1px solid var(--v-gray-base);
    box-sizing: border-box;
    border-radius: 8px;
    transition: border-color 0.3s ease;
  }

  &__content {
    height: 24px;
    width: 24px;
    border-radius: 5px;
  }

  &--active {
    &:before {
      border: 2px solid map.get(v.$gray, darken1);
    }
  }
}
</style>

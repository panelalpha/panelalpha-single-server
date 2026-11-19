<template>
  <div
    class="color-group-picker d-flex justify-start"
    data-testid="style-manager-color-groups"
    :style="swatchColors"
  >
    <ColorSwatch
      :colors="bases"
      :model-value="activeGroupBase(selectedColors)"
      @update:model-value="selectGroup"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { BrandColors } from '@/shared/theme/brand-theme'
  // The legacy picker rendered
  // one `ColorSwatch` per group; the kit `ColorSwatch` is the container (colors + v-model = base of the active group), so the
  // picker maps the clicked base back to its group.
  import { computed } from 'vue'
  import ColorSwatch from '@/shared/ui/form/ColorSwatch.vue'
  import { activeGroupBase, PREDEFINED_COLOR_GROUPS } from './color-groups'

  defineProps<{ selectedColors: Partial<BrandColors> }>()

  const emit = defineEmits<{ 'update:selected-colors': [group: BrandColors] }>()

  const bases = PREDEFINED_COLOR_GROUPS.map(group => group.base)

  // Legacy set `style="color: <base>"` on each swatch (the active/hover border is `currentColor`); the kit has no per-swatch
  // style, so the colours are passed as custom properties and applied with `nth-child` below.
  const swatchColors = computed(() => Object.fromEntries(bases.map((base, index) => [`--group-color-${index + 1}`, base])))

  function selectGroup (base: string): void {
    const group = PREDEFINED_COLOR_GROUPS.find(item => item.base === base)
    if (group) {
      emit('update:selected-colors', { ...group })
    }
  }
</script>

<style lang="scss" scoped>
// Legacy `ga-2` between swatches; the kit container fixes `height: 68px` for the label panel, the legacy picker had none.
.color-group-picker :deep(.color-swatch-container) {
  gap: 8px;
  height: auto;
}

@for $i from 1 through 5 {
  .color-group-picker :deep(.color-swatch:nth-child(#{$i})) {
    color: var(--group-color-#{$i});
  }
}

.color-group-picker :deep(.color-swatch) {
  &.color-swatch--active,
  &:hover {
    &:before {
      border-color: currentColor;
    }
  }

  &::before {
    border-color: var(--v-gray-lighten2);
  }
}
</style>

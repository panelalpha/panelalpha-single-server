<template>
  <div class="d-flex justify-center loader">
    <v-progress-circular
      :class="[!noMargins ? 'my-4' : '']"
      :color="color"
      :indeterminate="!completed"
      :model-value="completed ? 100 : 30"
      :size="size"
      :width="width ?? computedWidth"
    >
      <slot />
    </v-progress-circular>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'

  const props = withDefaults(defineProps<{
    completed?: boolean
    noMargins?: boolean
    size?: string | number
    color?: string
    width?: string | number
  }>(), {
    completed: false,
    noMargins: false,
    size: 60,
    color: 'primary',
    width: undefined,
  })

  const computedWidth = computed(() => Number(props.size) / 6)
</script>

<style lang="scss" scoped>
// V2 `v-progress-circular` draws no underlay while indeterminate (only the turning arc); V4 always draws the grey track.
.v-progress-circular--indeterminate :deep(.v-progress-circular__underlay) {
  stroke: transparent;
}
</style>

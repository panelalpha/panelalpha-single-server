<template>
  <v-progress-circular
    :color="color"
    :model-value="displayData"
    :size="size ? size : 96"
    :width="width ? width : 8"
  >
    <h1
      v-if="!hasIcon"
      class="value"
      :class="[
        iconColor ? iconColor : colorClass,
        centerClass ? centerClass : '',
      ]"
    >
      {{ typeof value == "number" ? Math.ceil(value) : value }}
    </h1>

    <h1
      v-else
      class="value"
      :class="iconColor ? iconColor : colorClass"
    >
      <slot name="centerIcon" />
    </h1>
  </v-progress-circular>
</template>

<script lang="ts" setup>
  // V2 `rotate="270"` is V4's default start at the top.
  import { computed, onMounted, ref, useSlots } from 'vue'

  const props = withDefaults(defineProps<{
    value?: string | number
    size?: number | string
    width?: number | string
    iconColor?: string
    centerClass?: string
    color?: string
  }>(), {
    value: '-',
    size: 96,
    width: 8,
    iconColor: '',
    centerClass: '',
    color: undefined,
  })

  const slots = useSlots()
  const hasIcon = computed(() => Boolean(slots.centerIcon))

  // V2 `${color}--text`: a palette name becomes `text-<name>`; a hex colour has no such class and the label keeps the inherited colour.
  const colorClass = computed(() => props.color && !props.color.startsWith('#') ? `text-${props.color}` : '')

  // Legacy fills the ring after mount (`setTimeout(0)`), so the stroke animates from empty.
  const displayData = ref<string | number>(0)
  onMounted(() => {
    setTimeout(() => {
      displayData.value = props.value
    }, 0)
  })
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.v-progress-circular {
  :deep(.v-progress-circular__overlay) {
    stroke-linecap: round;
  }
}

.value {
  font-weight: v.$font-weight-light;
  line-height: v.$line-height-sm;
}
</style>

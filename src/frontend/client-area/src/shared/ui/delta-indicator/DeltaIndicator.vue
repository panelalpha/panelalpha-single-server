<template>
  <span
    v-if="value"
    class="p-4"
    :class="valuePositive ? 'text-success' : 'text-error'"
  >
    <v-icon
      class="mb-1 ml-2"
      :color="valuePositive ? 'success' : 'error'"
      :icon="valuePositive ? '$increase' : '$decrease'"
      size="12"
    />
    {{ value }}
  </span>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'

  const props = defineProps<{
    value?: string | null
  }>()

  const valuePositive = computed(() => !(props.value ?? '').includes('-'))
</script>

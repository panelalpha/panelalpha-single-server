<template>
  <StatusLabel
    class="custom-label text-capitalize"
    :class="`custom-label--${tone}`"
    :status="CUSTOM_LABEL_STATUS[tone]"
  >
    <slot />
  </StatusLabel>
</template>

<script lang="ts" setup>
  // Only the services table uses it. Kit `StatusLabel`:
  // the legacy tone maps to a kit status; `custom-label--<tone>` stays as a hook (tests).
  import type { CustomLabelTone } from './services-cells'
  import type { StatusLabelStatus } from '@/shared/ui/status-label/status-label'
  import { computed } from 'vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import { customLabelTone } from './services-cells'

  const props = defineProps<{
    type?: string
  }>()

  const CUSTOM_LABEL_STATUS: Readonly<Record<CustomLabelTone, StatusLabelStatus>> = {
    purple: 'purple',
    blue: 'info',
    green: 'success',
    orange: 'warning',
    gray: 'gray',
  }

  const tone = computed(() => customLabelTone(props.type))
</script>

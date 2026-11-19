<template>
  <AppMessage :variant="variant === 'ok' ? 'success' : 'error'">
    <slot />
  </AppMessage>
</template>

<script lang="ts" setup>
  // Preset of the kit message for the domain modals: `alert` is the error variant, `ok` the success variant.
  import AppMessage from '@/shared/ui/message/AppMessage.vue'

  withDefaults(defineProps<{
    variant?: 'alert' | 'ok'
  }>(), {
    variant: 'alert',
  })
</script>

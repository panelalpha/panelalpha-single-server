<template>
  <AppMessage
    :title="title"
    :variant="variant"
  >
    <slot />
  </AppMessage>
</template>

<script lang="ts" setup>
  // Session-screen preset of the kit message: title plus the description slot. Attributes fall through to `AppMessage`.
  import AppMessage from '@/shared/ui/message/AppMessage.vue'

  defineProps<{
    variant: 'error' | 'success'
    title: string
  }>()
</script>

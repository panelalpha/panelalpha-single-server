<template>
  <AppMessage variant="error">
    <p>
      <template v-if="message">
        {{ message }}
      </template>
    </p>

    <template
      v-if="$slots.action || retryable"
      #action
    >
      <slot name="action">
        <AppButton
          data-testid="error-card-retry"
          kind="field"
          type="button"
          @click="emit('retry')"
        >
          {{ t('button.retry') }}
        </AppButton>
      </slot>
    </template>
  </AppMessage>
</template>

<script lang="ts" setup>
  // Preset of the kit message: an error with an optional action; `retryable` adds the plain Retry.
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'

  withDefaults(defineProps<{
    message?: string
    retryable?: boolean
  }>(), {
    message: undefined,
    retryable: false,
  })

  const emit = defineEmits<{ retry: [] }>()
  const { t } = useTranslation()
</script>

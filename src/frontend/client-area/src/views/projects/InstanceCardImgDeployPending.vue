<template>
  <instance-pending-overlay
    block="deploy-pending"
    error-alert
    :message="status === 'error' ? t('deployLogs.deployFailed') : t('deployLogs.deployInProgress')"
    :status="status"
    terminal
  />
</template>

<script lang="ts" setup>
  // The card image of a custom project while it deploys (animated terminal) or after the deploy failed, built on
  // the `InstancePendingOverlay` pattern.
  import { useTranslation } from 'i18next-vue'
  import InstancePendingOverlay from '@/views/projects/ui/InstancePendingOverlay.vue'

  withDefaults(defineProps<{
    status?: 'in_progress' | 'error'
  }>(), {
    status: 'in_progress',
  })

  const { t } = useTranslation()
</script>

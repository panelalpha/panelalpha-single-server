<template>
  <instance-pending-overlay
    block="installation-pending"
    :icon="status === 'error' ? '$systemInstallations' : undefined"
    :message="message"
    :progress="status === 'error' ? 100 : undefined"
    :status="status"
    :try-again="status === 'error'"
    @try-again="emit('try-again-click')"
  />
</template>

<script lang="ts" setup>
  // Built on the `InstancePendingOverlay` pattern. Its card only renders this for an installation (an import renders
  // `InstanceCardImgImportPending`), so legacy's `imported` branches are never reached (and read an `instance` prop the component
  // does not have): they are not ported. Nothing listens to `try-again-click`.
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import InstancePendingOverlay from '@/views/projects/ui/InstancePendingOverlay.vue'

  const props = defineProps<{
    status?: 'in_progress' | 'error' | 'success'
  }>()

  const emit = defineEmits<{
    'try-again-click': []
  }>()

  const { t } = useTranslation()

  const message = computed(() => {
    if (props.status === 'error') {
      return t('message.status.install.failed')
    }
    if (props.status === 'success') {
      return t('message.status.install.success')
    }
    return t('message.status.install.inProgress')
  })
</script>

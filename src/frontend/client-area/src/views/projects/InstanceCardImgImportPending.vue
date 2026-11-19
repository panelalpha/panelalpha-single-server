<template>
  <instance-pending-overlay
    block="import-pending"
    :icon="status === 'success' ? undefined : '$download'"
    :message="message"
    :progress="progress"
    :status="status"
    :step="step"
    :try-again="status === 'error'"
    @try-again="emit('try-again-click')"
  />
</template>

<script lang="ts" setup>
  import type { InstancePendingProgress, InstancePendingStep } from '@/views/projects/ui/instance-pending'
  // Built on the `InstancePendingOverlay` pattern. The commented-out illustration and the `pending-animation` keyframes
  // (nothing carries `data-animation-pending`) are not ported.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import InstancePendingOverlay from '@/views/projects/ui/InstancePendingOverlay.vue'

  const props = defineProps<{
    status?: 'in_progress' | 'error' | 'success'
    instance: InstanceResource
  }>()

  const emit = defineEmits<{
    'try-again-click': []
  }>()

  const { t } = useTranslation()

  interface ImportDetails {
    current_step?: { name?: string, percent?: unknown } | null
  }

  const isImport = computed(() => props.instance.import_details !== null)
  const currentStep = computed(() => (props.instance.import_details as ImportDetails | null | undefined)?.current_step ?? null)
  const stepPercent = computed(() => {
    if (!currentStep.value) {
      return null
    }
    const percent = currentStep.value.percent
    return typeof percent === 'number' ? percent : null
  })

  const message = computed(() => {
    if (props.status === 'error') {
      return t('message.status.importing.failed')
    }
    if (props.status === 'success') {
      return t('message.status.import.success')
    }
    return t('message.status.importing.inProgress')
  })

  // Legacy: a full red bar on error, none on success, otherwise the step percent or an indeterminate bar.
  const progress = computed<InstancePendingProgress | undefined>(() => {
    if (props.status === 'success') {
      return undefined
    }
    if (props.status === 'error') {
      return 100
    }
    return stepPercent.value === null || !isImport.value ? 'indeterminate' : stepPercent.value
  })

  // A 0 % step has no row.
  const step = computed<InstancePendingStep | null>(() => {
    if (props.status === 'error' || props.status === 'success' || !stepPercent.value || !isImport.value) {
      return null
    }
    const label = currentStep.value
      ? t(`heading.instance.modal.importDetails.step.${currentStep.value.name}.title`)
      : t('message.importing.modal.progress')
    return { label, percent: stepPercent.value }
  })
</script>

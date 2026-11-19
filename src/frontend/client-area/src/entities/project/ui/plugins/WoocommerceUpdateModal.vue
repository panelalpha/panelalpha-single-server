<template>
  <v-dialog
    :model-value="modelValue"
    :persistent="submitting"
    transition="custom-dialog-transition"
    @update:model-value="emit('update:model-value', $event)"
  >
    <div
      v-if="!submitting"
      class="card-overlay"
      @click="emit('update:model-value', false)"
    />

    <div
      v-else
      class="card-overlay"
    />

    <basic-modal
      :buttons="buttons"
      data-testid="woocommerce-update-modal"
      :icon="'$update'"
      :message="message"
      style="width: 560px"
      :submitting="submitting"
      :title="title"
      @button-click="onButtonClick"
      @modal-close="emit('update:model-value', false)"
    />
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  // A `v-dialog` + `basic-modal` (560px) with the plugin update dialog: the title and the message with the version, the update button
  // and the cancel. Presentational: the request runs in the frame (`@/entities/project/instance-woocommerce`).
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  const props = withDefaults(defineProps<{
    modelValue: boolean
    updateVersion?: string | null
    submitting?: boolean
  }>(), {
    updateVersion: null,
    submitting: false,
  })

  const emit = defineEmits<{
    'update:model-value': [open: boolean]
    'confirm': []
  }>()

  const { t } = useTranslation()

  const title = computed(() => t('heading.instance.plugin.update.title', { count: 1 }))
  const message = computed(() => t('heading.instance.plugin.update.message_one', { count: 1, version: props.updateVersion }))

  const buttons = computed<ModalButton[]>(() => [
    { id: 'submit', label: t('button.update'), color: 'primary' },
    { id: 'cancel', label: t('button.cancel'), color: 'normal', type: 'cancel', customClass: 'cancel-btn' },
  ])

  function onButtonClick (id: string): void {
    if (id === 'submit') {
      emit('confirm')
      return
    }
    if (id === 'cancel') {
      emit('update:model-value', false)
    }
  }
</script>

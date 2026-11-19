<template>
  <app-dialog
    :model-value="true"
    overlay
    scroll-lock="mobile"
    transition="custom-dialog-transition"
    @close="onClose"
  >
    <basic-modal
      :buttons="buttons"
      custom-class="fm-delete"
      data-testid="fm-delete"
      :submitting="submitting"
      :title="t('heading.hosting.fileManager.delete.title')"
      @button-click="onButtonClick"
      @modal-close="onClose"
    >
      <template #custom>
        <fm-selected-list
          v-if="items.length > 0"
          :items="items"
        />

        <p
          v-else
          class="text-error"
          data-testid="fm-delete-empty"
        >
          {{ t('message.fileManager.delete.noSelected') }}
        </p>
      </template>
    </basic-modal>
  </app-dialog>
</template>

<script lang="ts" setup>
  // The list is the selection of the store (folders first). Delete is red (`color: error`).
  // The modal closes after a success; a failure keeps it open with the alert. Nothing selected disables Delete.
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import FmSelectedList from './FmSelectedList.vue'

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useTranslation()
  const store = useFileManagerStore()

  const items = computed(() => store.selectedItems)
  const submitting = ref(false)

  const buttons = computed<ModalButton[]>(() => [
    { id: 'submit', label: t('button.delete'), color: 'error', disabled: items.value.length === 0 },
    { id: 'cancel', label: t('button.cancel'), color: 'normal', type: 'cancel' },
  ])

  function onClose (): void {
    if (!submitting.value) {
      emit('close')
    }
  }

  function onButtonClick (id: string): void {
    if (id === 'submit') {
      void submit()
    } else if (id === 'cancel') {
      onClose()
    }
  }

  /** A second click while the request runs does nothing. */
  async function submit (): Promise<void> {
    if (items.value.length === 0 || submitting.value) {
      return
    }
    submitting.value = true
    try {
      if (await store.deleteSelected()) {
        emit('close')
      }
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
.fm-delete {
  width: 560px;
  max-width: 100%;
}
</style>

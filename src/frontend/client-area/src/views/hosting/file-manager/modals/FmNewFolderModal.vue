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
      custom-class="fm-new-item"
      data-testid="fm-new-folder"
      :submitting="submitting"
      :title="t('heading.hosting.fileManager.newFolder.title')"
      @button-click="onButtonClick"
      @modal-close="onClose"
    >
      <template #custom>
        <v-text-field
          ref="field"
          v-model="name"
          autofocus
          class="v-input--md"
          data-testid="fm-new-folder-name"
          density="compact"
          :disabled="submitting"
          :error-messages="fieldErrors"
          :label="t('message.fileManager.newFolder.fieldName')"
          variant="outlined"
        />
      </template>
    </basic-modal>
  </app-dialog>
</template>

<script lang="ts" setup>
  // The name is checked against the folders of the open folder (basenames are compared).
  // An empty name or an existing one disables Submit; the existing one also
  // shows the feedback. Autofocus replaces the legacy `v-focus` (Vue 2 `inserted` hook, never ran under Vue 3).
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { validateItemName } from '@/views/hosting/file-manager/fm-path'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useTranslation()
  const store = useFileManagerStore()

  const field = useTemplateRef<{ focus: () => void }>('field')
  const name = ref('')
  const submitting = ref(false)

  // The dialog content is mounted with the modal, so the focus is set once the field is in the DOM.
  onMounted(() => {
    void nextTick(() => field.value?.focus())
  })

  const nameError = computed(() => validateItemName(name.value, store.directories.map(folder => folder.basename)))
  const exists = computed(() => nameError.value === 'exists')
  const fieldErrors = computed(() => {
    if (nameError.value === 'invalid') {
      return [t('message.fileManager.invalidName')]
    }
    return exists.value ? [t('message.fileManager.newFolder.fieldFeedback')] : []
  })
  const canSubmit = computed(() => nameError.value === null)

  const buttons = computed<ModalButton[]>(() => [
    { id: 'submit', label: t('button.submit'), color: 'primary', disabled: !canSubmit.value },
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

  /** A second click while the request runs does nothing (`submitting`). The modal closes only on success. */
  async function submit (): Promise<void> {
    if (!canSubmit.value || submitting.value) {
      return
    }
    submitting.value = true
    try {
      if (await store.createDirectory(name.value)) {
        emit('close')
      }
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
.fm-new-item {
  width: 560px;
  max-width: 100%;
}
</style>

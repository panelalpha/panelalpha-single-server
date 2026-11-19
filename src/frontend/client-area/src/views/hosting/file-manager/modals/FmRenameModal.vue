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
      custom-class="fm-rename"
      data-testid="fm-rename"
      :submitting="submitting"
      :title="t('heading.hosting.fileManager.rename.title')"
      @button-click="onButtonClick"
      @modal-close="onClose"
    >
      <template #custom>
        <v-text-field
          ref="field"
          v-model="name"
          autofocus
          class="v-input--md"
          data-testid="fm-rename-name"
          density="compact"
          :disabled="submitting"
          :error-messages="errorMessages"
          :label="t('message.fileManager.rename.fieldName')"
          variant="outlined"
        />
      </template>
    </basic-modal>
  </app-dialog>
</template>

<script lang="ts" setup>
  // The field starts with the current basename. The name is checked against the items of
  // the same type in the open folder. An unchanged name cannot be submitted.
  // Legacy kept an earlier collision message after the name went back to the original one; here the message follows the current value.
  import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
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

  /** The item the modal renames: the first selected item. */
  const item = store.selectedItems[0] as FmDirectory | FmFile | undefined
  const original = item?.basename ?? ''

  const field = useTemplateRef<{ focus: () => void }>('field')
  const name = ref(original)
  const submitting = ref(false)

  onMounted(() => {
    void nextTick(() => field.value?.focus())
  })

  const changed = computed(() => name.value !== original)

  // Only a new name is checked for a collision; the name of the item itself is always free.
  const nameError = computed(() => {
    if (item === undefined) {
      return 'empty'
    }
    const taken = item.type === 'dir' ? store.directories : store.files
    return validateItemName(name.value, changed.value ? taken.map(entry => entry.basename) : [])
  })

  const exists = computed(() => changed.value && nameError.value === 'exists')

  const errorMessages = computed<string[]>(() => {
    if (nameError.value === 'invalid') {
      return [t('message.fileManager.invalidName')]
    }
    if (nameError.value === 'empty') {
      return [t('message.fileManager.rename.fieldFeedback')]
    }
    if (!exists.value) {
      return []
    }
    const reason = item?.type === 'dir' ? 'message.fileManager.rename.directoryExist' : 'message.fileManager.rename.fileExist'
    return [`${t('message.fileManager.rename.fieldFeedback')} - ${t(reason)}`]
  })

  const canSubmit = computed(() => nameError.value === null && changed.value)

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

  /** The modal closes only after a success; a failure keeps it open with the alert. A second click while the request runs does nothing. */
  async function submit (): Promise<void> {
    if (item === undefined || !canSubmit.value || submitting.value) {
      return
    }
    submitting.value = true
    try {
      if (await store.renameItem(item, name.value)) {
        emit('close')
      }
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
.fm-rename {
  width: 560px;
  max-width: 100%;
}
</style>

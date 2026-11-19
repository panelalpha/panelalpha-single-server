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
      custom-class="fm-zip"
      data-testid="fm-zip"
      :submitting="submitting"
      :title="t('heading.hosting.fileManager.zip.title')"
      @button-click="onButtonClick"
      @modal-close="onClose"
    >
      <template #custom>
        <v-text-field
          ref="field"
          v-model="archiveName"
          autofocus
          class="v-input--md"
          data-testid="fm-zip-name"
          density="compact"
          :disabled="submitting"
          :error-messages="fieldErrors"
          :label="t('message.fileManager.zip.fieldName')"
          :suffix="suffix"
          variant="outlined"
        />

        <v-divider class="my-4" />

        <fm-selected-list :items="store.selectedItems" />
      </template>
    </basic-modal>
  </app-dialog>
</template>

<script lang="ts" setup>
  // The field shows the `.zip` suffix the dialog adds, and a name typed with `.zip`
  // already (any case) is used as typed, without the suffix. A name that is taken by a file in the open folder disables Submit and shows
  // the feedback. The selection is sent as `elements`.
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { isInvalidItemName } from '@/views/hosting/file-manager/fm-path'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import FmSelectedList from './FmSelectedList.vue'

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useTranslation()
  const store = useFileManagerStore()

  const field = useTemplateRef<{ focus: () => void }>('field')
  const archiveName = ref('')
  const submitting = ref(false)

  onMounted(() => {
    void nextTick(() => field.value?.focus())
  })

  const suffix = computed(() => (/\.zip$/i.test(archiveName.value) ? '' : '.zip'))
  const archiveFile = computed(() => `${archiveName.value}${suffix.value}`)
  const invalid = computed(() => isInvalidItemName(archiveName.value))
  const exists = computed(() => archiveName.value !== '' && store.files.some(file => file.basename === archiveFile.value))
  const fieldErrors = computed(() => {
    if (invalid.value) {
      return [t('message.fileManager.invalidName')]
    }
    return exists.value ? [t('message.fileManager.zip.fieldFeedback')] : []
  })
  const canSubmit = computed(() => archiveName.value !== '' && !invalid.value && !exists.value)

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

  /** A second click while the request runs does nothing. The modal closes only after a success. */
  async function submit (): Promise<void> {
    if (!canSubmit.value || submitting.value) {
      return
    }
    submitting.value = true
    try {
      if (await store.zipSelected(archiveFile.value)) {
        emit('close')
      }
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
.fm-zip {
  width: 560px;
  max-width: 100%;
}
</style>

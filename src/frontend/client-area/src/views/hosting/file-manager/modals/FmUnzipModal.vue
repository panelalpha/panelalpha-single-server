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
      custom-class="fm-unzip"
      data-testid="fm-unzip"
      :submitting="submitting"
      :title="t('heading.hosting.fileManager.unzip.title')"
      @button-click="onButtonClick"
      @modal-close="onClose"
    >
      <template #custom>
        <div class="fm-unzip__mode">
          <strong class="fm-unzip__label">{{ t('message.fileManager.unzip.fieldRadioName') }}</strong>

          <v-radio-group
            v-model="mode"
            data-testid="fm-unzip-mode"
            hide-details
            inline
          >
            <v-radio
              data-testid="fm-unzip-here"
              :disabled="submitting"
              :label="t('message.fileManager.unzip.fieldRadio1')"
              value="here"
            />

            <v-radio
              data-testid="fm-unzip-new-folder"
              :disabled="submitting"
              :label="t('message.fileManager.unzip.fieldRadio2')"
              value="folder"
            />
          </v-radio-group>
        </div>

        <v-divider class="my-4" />

        <v-text-field
          v-if="mode === 'folder'"
          ref="field"
          v-model="folderName"
          autofocus
          class="v-input--md"
          data-testid="fm-unzip-folder"
          density="compact"
          :disabled="submitting"
          :error-messages="fieldErrors"
          :label="t('message.fileManager.unzip.fieldName')"
          variant="outlined"
        />

        <p
          v-else
          class="text-error"
        >
          {{ t('message.fileManager.unzip.warning') }}
        </p>

        <p
          v-if="refusal !== null"
          class="mt-2 text-error"
          data-testid="fm-unzip-refusal"
        >
          {{ refusal }}
        </p>
      </template>
    </basic-modal>
  </app-dialog>
</template>

<script lang="ts" setup>
  // "To current folder" extracts next to the archive (the backend default). "In a new folder"
  // needs a name that is not a folder of the open folder yet. The archive is the first selected item (see the store). The Engine refuses an
  // extraction into a folder that already holds one of the archive's entries, so the refusal is shown here and the target can be changed.
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { isInvalidItemName } from '@/views/hosting/file-manager/fm-path'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useTranslation()
  const store = useFileManagerStore()

  const field = useTemplateRef<{ focus: () => void }>('field')
  const mode = ref<'here' | 'folder'>('here')
  const folderName = ref('')
  const submitting = ref(false)
  /** The Engine's refusal of the last submit; the error of another target is not shown for this one. */
  const refusal = ref<string | null>(null)

  watch([mode, folderName], () => {
    refusal.value = null
  })

  onMounted(() => {
    void nextTick(() => field.value?.focus())
  })

  const invalid = computed(() => isInvalidItemName(folderName.value))
  const exists = computed(() => folderName.value !== '' && store.directories.some(folder => folder.basename === folderName.value))
  const fieldErrors = computed(() => {
    if (invalid.value) {
      return [t('message.fileManager.invalidName')]
    }
    return exists.value ? [t('message.fileManager.unzip.fieldFeedback')] : []
  })

  const canSubmit = computed(() => mode.value === 'here' || (folderName.value !== '' && !invalid.value && !exists.value))

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
      if (await store.unzipSelected(mode.value === 'folder' ? folderName.value : null)) {
        emit('close')
        return
      }
      refusal.value = store.actionError
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
.fm-unzip {
  width: 560px;
  max-width: 100%;
}

.fm-unzip__mode {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.fm-unzip__label {
  white-space: nowrap;
}
</style>

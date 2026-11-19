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
      custom-class="fm-upload"
      data-testid="fm-upload"
      :submitting="submitting"
      :title="t('heading.hosting.fileManager.upload.title')"
      @button-click="onButtonClick"
      @modal-close="onClose"
    >
      <template #custom>
        <div class="fm-upload__select">
          <AppButton
            data-testid="fm-upload-select"
            :disabled="submitting"
            variant="tonal"
            @click="openPicker"
          >
            {{ t('button.fileManager.selectFiles') }}
          </AppButton>

          <input
            ref="picker"
            class="fm-upload__input"
            data-testid="fm-upload-input"
            multiple
            name="myfile"
            type="file"
            @change="onFilesSelected"
          >
        </div>

        <div
          v-if="files.length > 0"
          class="fm-upload__list"
          data-testid="fm-upload-list"
        >
          <div
            v-for="(file, index) in files"
            :key="index"
            class="fm-upload__row"
            data-testid="fm-upload-row"
          >
            <v-icon
              class="fm-upload__icon"
              :icon="fileIcon(file.name)"
              size="18"
            />

            <span class="fm-upload__name">{{ file.name }}</span>

            <span
              v-if="isInvalidItemName(file.name)"
              class="fm-upload__invalid"
              data-testid="fm-upload-invalid-name"
            >
              {{ t('message.fileManager.invalidName') }}
            </span>

            <span class="fm-upload__size">{{ formatBytes(file.size) }}</span>
          </div>

          <hr>

          <div class="fm-upload__summary">
            <span>
              <strong>{{ t('message.fileManager.upload.selected') }}</strong>
              {{ files.length }}
            </span>

            <span>
              <strong>{{ t('message.fileManager.upload.size') }}</strong>
              {{ formatBytes(totalSize) }}
            </span>
          </div>

          <hr>

          <p
            v-if="limitExceeded"
            class="fm-upload__limit"
            data-testid="fm-upload-limit"
          >
            {{ t('message.fileManager.limitExceeded') }}
          </p>

          <div
            v-else
            class="fm-upload__options"
          >
            <strong>{{ t('message.fileManager.upload.ifExist') }}</strong>

            <v-radio-group
              v-model="overwrite"
              data-testid="fm-upload-overwrite"
              density="compact"
              hide-details
              inline
            >
              <v-radio
                data-testid="fm-upload-skip"
                :label="t('button.skip')"
                :value="false"
              />

              <v-radio
                data-testid="fm-upload-overwrite-option"
                :label="t('message.fileManager.upload.overwrite')"
                :value="true"
              />
            </v-radio-group>
          </div>

          <hr>
        </div>

        <p
          v-else
          class="fm-upload__empty"
        >
          {{ t('message.fileManager.upload.noSelected') }}
        </p>
      </template>
    </basic-modal>
  </app-dialog>
</template>

<script lang="ts" setup>
  // The sum of the selected files is checked against `uploadMaxFilesize` (rules in
  // fm-upload.ts). A limit above the sum blocks Submit and shows the notice instead of the skip/overwrite choice. The legacy progress bar
  // is commented out in legacy and is not ported. A failed upload keeps the modal open (the store returns false and gives the alert).
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, useTemplateRef } from 'vue'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { fileTypeInfo } from '@/views/hosting/file-manager/fm-file-type'
  import { isInvalidItemName } from '@/views/hosting/file-manager/fm-path'
  import { canSubmitUpload, isUploadLimitExceeded, uploadTotalSize } from '@/views/hosting/file-manager/fm-upload'
  import { formatBytes } from '@/shared/format/format-bytes'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useTranslation()
  const store = useFileManagerStore()

  const picker = useTemplateRef<HTMLInputElement>('picker')
  const files = ref<File[]>([])
  const overwrite = ref(false)
  const submitting = ref(false)

  // Without a config (the initialize call failed) the client does not limit the sum; the backend still does.
  const limit = computed(() => store.config?.uploadMaxFilesize ?? Number.POSITIVE_INFINITY)
  const totalSize = computed(() => uploadTotalSize(files.value))
  const limitExceeded = computed(() => isUploadLimitExceeded(files.value, limit.value))
  const canSubmit = computed(() => canSubmitUpload(files.value, limit.value))

  const buttons = computed<ModalButton[]>(() => [
    { id: 'submit', label: t('button.submit'), color: 'primary', disabled: !canSubmit.value },
    { id: 'cancel', label: t('button.cancel'), color: 'normal', type: 'cancel' },
  ])

  function fileIcon (name: string): string {
    const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
    return fileTypeInfo({ type: 'file', extension }).icon
  }

  function openPicker (): void {
    picker.value?.click()
  }

  /** An empty selection clears the list. */
  function onFilesSelected (event: Event): void {
    const input = event.target as HTMLInputElement
    files.value = Array.from(input.files ?? [])
  }

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

  /**
   * The modal closes only on success (a warning keeps it open with the alert, as legacy). The store has already
   * shown the alert, so a failure needs nothing more here.
   */
  async function submit (): Promise<void> {
    if (!canSubmit.value || submitting.value) {
      return
    }
    submitting.value = true
    try {
      if (await store.upload(files.value, overwrite.value)) {
        emit('close')
      }
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
.fm-upload {
  width: 560px;
  max-width: 100%;
}

.fm-upload__select {
  position: relative;
  margin-bottom: 0.6rem;
}

.fm-upload__input {
  display: none;
}

.fm-upload__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.fm-upload__icon {
  color: var(--v-gray-lighten1);
}

.fm-upload__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fm-upload__size {
  flex: 0 0 auto;
  white-space: nowrap;
}

.fm-upload__invalid {
  color: rgb(var(--v-theme-error));
  flex: 0 0 auto;
}

.fm-upload__summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.fm-upload__options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.fm-upload__limit {
  color: rgb(var(--v-theme-error));
  margin: 0;
}

.fm-upload__empty {
  margin: 0;
}
</style>

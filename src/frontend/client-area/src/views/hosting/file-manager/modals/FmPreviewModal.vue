<template>
  <app-dialog
    :model-value="file !== null"
    overlay
    scroll-lock="mobile"
    transition="custom-dialog-transition"
    @close="requestClose"
  >
    <basic-modal
      v-if="file"
      :buttons="buttons"
      :custom-class="cropping ? 'fm-preview fm-preview--crop' : 'fm-preview'"
      data-testid="fm-preview"
      :title="cropping ? t('heading.hosting.fileManager.cropper.title') : t('heading.hosting.fileManager.preview.title')"
      @button-click="onButtonClick"
      @modal-close="requestClose"
    >
      <template #custom>
        <fm-crop-module
          v-if="cropping && image"
          :file="file"
          :image="image"
          @close="cropping = false"
          @saved="onSaved"
          @saving="cropSaving = $event"
        />

        <div
          v-else
          class="fm-preview__body"
        >
          <v-progress-circular
            v-if="loading"
            color="primary"
            indeterminate
          />

          <img
            v-else-if="image"
            :alt="file.basename"
            class="fm-preview__image"
            :src="image"
          >

          <FmModalFileName
            class="fm-preview__name"
            :name="file.basename"
          />
        </div>
      </template>
    </basic-modal>
  </app-dialog>
</template>

<script lang="ts" setup>
  import type { FmFile } from '@/views/hosting/file-manager/file-manager.types'
  // The image as a data URI, the file name, a spinner while it loads. The
  // crop button shows for the croppable files once the image is there; it swaps the body for the cropper panel
  // (`FmCropModule`). A saved crop reloads the preview. The file name is text, not v-html. The screen owns the
  // dialog and passes the file to show (null closes it).
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { fileTypeInfo } from '@/views/hosting/file-manager/fm-file-type'
  import { loadPreview } from '@/views/hosting/file-manager/fm-open'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import FmCropModule from './FmCropModule.vue'
  import FmModalFileName from './FmModalFileName.vue'

  const props = defineProps<{
    accountId: number | null
    file: FmFile | null
  }>()

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useTranslation()

  const image = ref<string | null>(null)
  const loading = ref(false)
  const cropping = ref(false)
  /** A crop save is running: closing the dialog would leave the save to overwrite the file after the close. */
  const cropSaving = ref(false)
  /** A response of an earlier file is dropped. */
  let generation = 0

  const buttons = computed<ModalButton[]>(() => {
    if (cropping.value || props.file === null || !fileTypeInfo(props.file).croppable || image.value === null || loading.value) {
      return []
    }
    return [{ id: 'crop', label: t('heading.hosting.fileManager.cropper.title'), color: 'primary' }]
  })

  async function show (file: FmFile | null): Promise<void> {
    generation += 1
    const token = generation
    image.value = null
    loading.value = file !== null && props.accountId !== null
    if (file === null || props.accountId === null) {
      return
    }
    const data = await loadPreview(props.accountId, file.path)
    if (token !== generation) {
      return
    }
    image.value = data
    loading.value = false
  }

  watch(() => props.file, file => {
    cropping.value = false
    void show(file)
  }, { immediate: true })

  /** After a saved crop the preview loads the new image again (legacy showed the old one until reopened). */
  function onSaved (): void {
    void show(props.file)
  }

  function onButtonClick (id: string): void {
    if (id === 'crop') {
      cropping.value = true
    }
  }

  /** Closing waits for a running crop save (the X, the overlay and the dialog's own close all go through here). */
  function requestClose (): void {
    if (!cropSaving.value) {
      emit('close')
    }
  }
</script>

<style lang="scss" scoped>
.fm-preview {
  width: 560px;
  max-width: 100%;
}

.fm-preview--crop {
  width: 960px;
}

.fm-preview__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 120px;
  justify-content: center;
  text-align: center;
}

.fm-preview__image {
  max-width: 100%;
  max-height: 60vh;
}

.fm-preview__name {
  margin-top: 8px;
}
</style>

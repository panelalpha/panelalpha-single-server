<template>
  <app-dialog
    :model-value="true"
    overlay
    scroll-lock="mobile"
    transition="custom-dialog-transition"
    @close="onClose"
  >
    <basic-modal
      :alert="readOnly ? t('message.fileManager.error.read') : undefined"
      :buttons="buttons"
      custom-class="fm-editor"
      data-testid="fm-editor"
      :message-loader="loading"
      :submitting="submitting"
      :title="t('heading.hosting.fileManager.editor.title')"
      @button-click="onButtonClick"
      @modal-close="onClose"
    >
      <template #custom>
        <FmModalFileName
          v-if="item"
          class="fm-editor__name"
          data-testid="fm-editor-name"
          :name="item.basename"
        />

        <div
          v-if="ready"
          ref="host"
          class="fm-editor__host"
          data-testid="fm-editor-host"
        />
      </template>
    </basic-modal>
  </app-dialog>
</template>

<script lang="ts" setup>
  import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
  // The text editor. The file is the first selected item. The text is read as UTF-8 (`downloadText`) and saved as it is: a JSON file is not reformatted (legacy reformatted it
  // on load). Submit stays disabled until the text differs from the loaded one. A text that does not decode as UTF-8 (U+FFFD) opens read-only.
  // Closing (X, overlay, Cancel) asks nothing, as legacy. A read failure is an alert and closes the modal; a failed save keeps it open.
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import * as fmApi from '@/views/hosting/file-manager/file-manager.api'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { fmResultText } from '@/views/hosting/file-manager/fm-response'
  import { useCodeEditor } from '@/views/hosting/file-manager/use-code-editor'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import FmModalFileName from './FmModalFileName.vue'

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useTranslation()
  const store = useFileManagerStore()

  /** Largest file the editor opens (2 MB): above it the page would freeze on the text. */
  const EDITOR_MAX_BYTES = 2 * 1024 * 1024

  /** The file the modal edits: the first selected item. */
  const item = store.selectedItems[0] as FmDirectory | FmFile | undefined

  const host = ref<HTMLElement | null>(null)
  const text = ref('')
  const loading = ref(true)
  const ready = ref(false)
  const readOnly = ref(false)
  const submitting = ref(false)
  let disposed = false

  const editor = useCodeEditor(host, {
    text,
    extension: ref(item?.type === 'file' ? item.extension : ''),
    readOnly,
    // A chunk that does not load (for example after a deploy) is the same failure as an unreadable file: an alert and a close.
    onError: () => {
      if (!disposed) {
        alertFailure(t('message.fileManager.error.read'))
        emit('close')
      }
    },
  })

  const canSubmit = computed(() => ready.value && !readOnly.value && editor.dirty.value && !submitting.value)

  const buttons = computed<ModalButton[]>(() => [
    { id: 'submit', label: t('button.submit'), color: 'primary', disabled: !canSubmit.value },
    { id: 'cancel', label: t('button.cancel'), color: 'normal', type: 'cancel' },
  ])

  function alertFailure (message: string): void {
    useAlertsStore().addAlert({ success: false, errorMessage: message })
  }

  onMounted(() => {
    void load()
  })

  onBeforeUnmount(() => {
    disposed = true
  })

  /** Reads the file. A failure is an alert and closes the modal. */
  async function load (): Promise<void> {
    const accountId = store.accountId
    if (item?.type !== 'file' || accountId === null) {
      emit('close')
      return
    }
    // The whole file is read into memory and shown in one editor: a large file would freeze the page, so it is refused up front.
    if (item.size > EDITOR_MAX_BYTES) {
      alertFailure(t('message.fileManager.error.read'))
      emit('close')
      return
    }
    const response = await fmApi.downloadText(accountId, item.path)
    if (disposed) {
      return
    }
    if (!response.ok) {
      alertFailure(fmResultText(response.result, key => String(t(key))) ?? t('message.fileManager.error.read'))
      emit('close')
      return
    }
    // U+FFFD is what UTF-8 decoding puts in place of bytes that are not UTF-8: a save would write those bytes back wrong.
    readOnly.value = response.text.includes('�')
    text.value = response.text
    loading.value = false
    ready.value = true
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

  /** The modal closes only after a success; a failure keeps it open with the alert. A second click while the request runs does nothing. */
  async function submit (): Promise<void> {
    if (item?.type !== 'file' || !canSubmit.value || submitting.value) {
      return
    }
    submitting.value = true
    try {
      if (await store.saveFile(item.basename, new Blob([editor.getText()]))) {
        emit('close')
      }
    } catch {
      alertFailure(t('message.fileManager.error.save'))
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
.fm-editor {
  width: 960px;
  max-width: 100%;
}

.fm-editor__name {
  margin-bottom: 8px;
}

.fm-editor__host {
  min-height: 300px;
  max-height: 60vh;
  overflow: auto;
  border: 1px solid var(--v-gray-lighten2);
}

// Legacy CM5 is 300 px tall: the editor surface fills the box, not only the text lines.
.fm-editor__host :deep(.cm-editor) {
  min-height: 300px;
}
</style>

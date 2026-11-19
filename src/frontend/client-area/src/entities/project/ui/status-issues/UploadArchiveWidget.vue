<template>
  <div>
    <drop-zone
      accept=".zip,.tar.gz"
      :hint="t('heading.instance.statusIndicator.dropZone.hint', { size: uploadLimitLabel })"
      :items="items"
      :remove-label="t('button.remove')"
      :title="t('heading.instance.statusIndicator.dropZone.title')"
      @files="onFiles"
      @remove="clearFile"
    />
  </div>
</template>

<script lang="ts" setup>
  // The zone (drag and drop, picker, file row, look) is the
  // kit `DropZone`; this widget keeps the archive rules (type, size) and the v-model.
  import type { DropZoneItem } from '@/shared/ui/drop-zone/drop-zone'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { uploadMaxBytes, uploadMaxLabel } from '@/shared/files/upload-limit'
  import { useSessionStore } from '@/shared/session/session.store'
  import DropZone from '@/shared/ui/drop-zone/DropZone.vue'

  const model = defineModel<File | null>({ default: null })

  const emit = defineEmits<{
    complete: [complete: boolean]
    // i18n key of the rejection message (legacy dispatched `addAlert` with the translated text)
    error: [key: string]
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()

  const uploadLimitBytes = computed(() => uploadMaxBytes(session.home))
  const uploadLimitLabel = computed(() => uploadMaxLabel(session.home))

  const items = computed<DropZoneItem[]>(() => (model.value ? [{ id: 'file', label: model.value.name }] : []))

  function emitValue (file: File | null): void {
    model.value = file
    emit('complete', Boolean(file))
  }

  function isAllowedArchive (file: File): boolean {
    const name = (file.name || '').toLowerCase()
    return name.endsWith('.tar.gz') || name.endsWith('.zip')
  }

  function acceptFile (file: File | undefined): void {
    if (!file) {
      return
    }
    if (!isAllowedArchive(file)) {
      emit('error', 'heading.instance.siteDetails.uploadVersion.invalidType')
      return
    }
    if (file.size > uploadLimitBytes.value) {
      emit('error', 'heading.instance.statusIndicator.dropZone.tooLarge')
      return
    }
    emitValue(file)
  }

  // A pick or a drop: only the first file (one archive).
  function onFiles (files: File[]): void {
    acceptFile(files[0])
  }

  function clearFile (): void {
    emitValue(null)
  }
</script>

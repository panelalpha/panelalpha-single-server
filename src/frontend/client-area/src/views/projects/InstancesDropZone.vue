<template>
  <slot v-if="disabled" />

  <div
    v-else
    class="instances-drop-zone"
    :class="{ 'instances-drop-zone--reading': isReadingDrop }"
    data-testid="instances-drop-zone"
    @dragenter.prevent="onDragEnter"
    @dragleave.prevent="onDragLeave"
    @dragover.prevent="onDragOver"
    @drop.prevent="onDrop"
  >
    <slot />

    <div
      v-if="isOverlayVisible"
      class="instances-drop-overlay"
      data-testid="instances-drop-overlay"
    >
      <v-icon
        color="success"
        icon="$folder"
        size="48"
      />

      <p
        class="instances-drop-overlay__title p-2 font-weight-medium mb-0"
        data-testid="instances-drop-overlay-title"
      >
        {{ t('heading.instance.dropOverlay.title') }}
      </p>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The drop zone is an app-lite feature: `disabled` (multi
  // server) renders the content alone, as app does. Emits the files of a valid drop; the host decides
  // what happens next and shows the alert of an invalid one.
  import { useTranslation } from 'i18next-vue'
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import { dataTransferHasFiles, DROP_ERROR_KEYS, flattenSelections, selectionsFromDataTransfer } from '@/shared/files/drop-files'
  import { uploadMaxBytes } from '@/shared/files/upload-limit'
  import { useSessionStore } from '@/shared/session/session.store'

  withDefaults(defineProps<{
    disabled?: boolean
  }>(), {
    disabled: false,
  })

  const emit = defineEmits<{
    'valid-drop': [payload: { uploadItems: File[] }]
    'invalid-drop': [errorKey: string, errorParams?: Record<string, unknown>]
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()

  const isDragOver = ref(false)
  const dragDepth = ref(0)
  const isReadingDrop = ref(false)

  const isOverlayVisible = computed(() => isDragOver.value || isReadingDrop.value)

  function onEscape (event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      isDragOver.value = false
      dragDepth.value = 0
    }
  }

  function onDragEnter (event: DragEvent): void {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return
    }
    dragDepth.value += 1
    isDragOver.value = true
  }

  function onDragOver (event: DragEvent): void {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return
    }
    isDragOver.value = true
  }

  function onDragLeave (): void {
    dragDepth.value -= 1
    if (dragDepth.value <= 0) {
      dragDepth.value = 0
      isDragOver.value = false
    }
  }

  async function onDrop (event: DragEvent): Promise<void> {
    isDragOver.value = false
    dragDepth.value = 0
    const dataTransfer = event.dataTransfer
    if (!dataTransfer) {
      return
    }
    isReadingDrop.value = true
    try {
      const { selections, errorKey, errorParams } = await selectionsFromDataTransfer(dataTransfer, {
        maxBytes: uploadMaxBytes(session.home),
      })
      if (errorKey || selections.length === 0) {
        const key = errorKey || DROP_ERROR_KEYS.empty
        if (errorParams) {
          emit('invalid-drop', key, errorParams)
        } else {
          emit('invalid-drop', key)
        }
        return
      }
      emit('valid-drop', { uploadItems: flattenSelections(selections) })
    } finally {
      isReadingDrop.value = false
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onEscape)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onEscape)
  })
</script>

<style lang="scss" scoped>
.instances-drop-zone {
  position: relative;
  min-height: 200px;

  &--reading {
    cursor: wait;
  }
}

.instances-drop-overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  border: 2px dashed var(--v-success-base);
  border-radius: 8px;
  background-color: var(--v-drop-zone-overlay);
  color: var(--v-success-base);

  &__title {
    text-align: center;
    max-width: 420px;
    color: var(--v-success-base);
  }
}
</style>

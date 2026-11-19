<template>
  <app-dialog
    :model-value="open"
    overlay
    scroll-lock="mobile"
    transition="custom-dialog-transition"
    @close="emit('close')"
  >
    <basic-modal
      :buttons="buttons"
      custom-class="fm-clipboard"
      data-testid="fm-clipboard"
      :title="t('heading.hosting.fileManager.clipboard.title')"
      @button-click="onButtonClick"
      @modal-close="emit('close')"
    >
      <template #custom>
        <div
          v-if="rows.length > 0"
          class="fm-clipboard__body"
        >
          <div
            class="fm-clipboard__type"
            data-testid="fm-clipboard-type"
            :title="typeTitle"
          >
            <v-icon
              :icon="typeIcon"
              size="18"
            />
          </div>

          <div
            v-for="row in rows"
            :key="`${row.type}-${row.path}`"
            class="fm-clipboard__row"
            data-testid="fm-clipboard-row"
          >
            <v-icon
              class="fm-clipboard__icon"
              :icon="row.icon"
              size="18"
            />

            <span class="fm-clipboard__name">{{ row.name }}</span>

            <AppButton
              :aria-label="t('button.delete')"
              data-testid="fm-clipboard-remove"
              icon="$close"
              size="x-small"
              variant="text"
              @click="store.removeFromClipboard(row.type, row.path)"
            />
          </div>
        </div>

        <p
          v-else
          class="fm-clipboard__empty"
        >
          {{ t('message.fileManager.clipboard.none') }}
        </p>
      </template>
    </basic-modal>
  </app-dialog>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  // The disk badge is left out (the disk is always `local` here).
  // Rows and the type come from fm-clipboard.ts; the buttons are the modal buttons of BasicModal (Clear is red, Cancel is text).
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import { clipboardRows, clipboardTypeInfo } from '@/views/hosting/file-manager/fm-clipboard'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  defineProps<{
    open: boolean
  }>()

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useTranslation()
  const store = useFileManagerStore()

  const rows = computed(() => clipboardRows(store.clipboard))

  const typeIcon = computed(() => (store.clipboard ? clipboardTypeInfo(store.clipboard.type).icon : ''))

  const typeTitle = computed(() => {
    if (!store.clipboard) {
      return ''
    }
    return `${t('table.header.type')} - ${t(clipboardTypeInfo(store.clipboard.type).label)}`
  })

  const buttons = computed<ModalButton[]>(() => [
    { id: 'clear', label: t('button.fileManager.clear'), color: 'error', disabled: store.clipboard === null },
    { id: 'cancel', label: t('button.cancel'), color: 'normal', type: 'cancel' },
  ])

  function onButtonClick (id: string): void {
    if (id === 'clear') {
      store.clearClipboard()
    } else if (id === 'cancel') {
      emit('close')
    }
  }
</script>

<style lang="scss" scoped>
.fm-clipboard {
  width: 560px;
  max-width: 100%;
}

.fm-clipboard__type {
  display: flex;
  justify-content: flex-end;
  color: var(--v-gray-lighten1);
}

.fm-clipboard__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.fm-clipboard__icon {
  color: var(--v-gray-lighten1);
}

.fm-clipboard__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fm-clipboard__empty {
  color: var(--v-gray-lighten1);
}
</style>

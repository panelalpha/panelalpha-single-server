<template>
  <app-dialog
    :model-value="true"
    overlay
    scroll-lock="mobile"
    transition="custom-dialog-transition"
    @close="emit('close')"
  >
    <basic-modal
      :buttons="buttons"
      custom-class="fm-status"
      data-testid="fm-status"
      :title="t('heading.hosting.fileManager.status.title')"
      @button-click="onButtonClick"
      @modal-close="emit('close')"
    >
      <template #custom>
        <ul
          v-if="store.errors.length > 0"
          class="fm-status__list"
          data-testid="fm-status-list"
        >
          <li
            v-for="(error, index) in store.errors"
            :key="index"
          >
            {{ error }}
          </li>
        </ul>

        <p
          v-else
          class="fm-status__empty"
        >
          {{ t('message.fileManager.status.noErrors') }}
        </p>
      </template>
    </basic-modal>
  </app-dialog>
</template>

<script lang="ts" setup>
  // The errors of the session (`store.errors`, filled by every failed action).
  // Clear empties the list and is disabled when there is nothing to clear.
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useTranslation()
  const store = useFileManagerStore()

  const buttons = computed<ModalButton[]>(() => [
    { id: 'clear', label: t('button.fileManager.clear'), color: 'error', disabled: store.errors.length === 0 },
    { id: 'cancel', label: t('button.cancel'), color: 'normal', type: 'cancel' },
  ])

  function onButtonClick (id: string): void {
    if (id === 'clear') {
      store.clearErrors()
    } else if (id === 'cancel') {
      emit('close')
    }
  }
</script>

<style lang="scss" scoped>
.fm-status {
  width: 560px;
  max-width: 100%;
}

.fm-status__list {
  padding-left: 1.25rem;
}

.fm-status__empty {
  color: var(--v-gray-lighten1);
}
</style>

<template>
  <AppDialog
    v-model="open"
    :overlay="!saving"
    :persistent="saving"
    scroll-lock="mobile"
    transition="custom-dialog-transition"
  >
    <basic-modal
      :buttons="buttons"
      class="backup-store-remove-modal card-width-560"
      close-class="store-remove-close"
      color="error"
      confirm-required
      :confirmed="confirmed"
      icon="$alertwarning"
      :submitting="saving"
      :title="t('settings.backups.removeStoreTitle')"
      @button-click="onButton"
      @modal-close="close"
    >
      <template #custom>
        <p class="store-remove-text">
          {{ t(storeCreated ? 'settings.backups.removeStoreText' : 'settings.backups.removeStoreKeep') }}
        </p>

        <v-form class="d-flex flex-column">
          <div class="last-child d-flex flex-column align-start w-100 pb-4">
            <p class="p-2">
              <b>{{ t('message.confirmAction') }}</b>
            </p>

            <label class="base--text checkbox-label d-flex align-center p-2">
              <checkbox
                color="primary"
                data-testid="store-remove-confirm-check"
                :label="t(storeCreated ? 'settings.backups.removeStoreAcknowledge' : 'settings.backups.removeStoreAcknowledgeKeep')"
                :model-value="confirmed"
                @update:model-value="confirmed = $event"
              />
            </label>
          </div>
        </v-form>

        <div
          v-if="error"
          class="store-remove-error text-error p-2 mt-4"
        >
          {{ error }}
        </div>
      </template>
    </basic-modal>
  </AppDialog>
</template>

<script lang="ts" setup>
  import type { FreeBackupsChange } from './free-backups.api'
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  // The confirmation of a store removal: the section handles the answer (`removed`), the dialog the request and its failure.
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import { removeFreeBackupStore } from './free-backups.api'

  withDefaults(defineProps<{
    // Whether the panel made the store's Engine container: it is deleted when nothing uses it.
    storeCreated?: boolean
  }>(), {
    storeCreated: false,
  })

  const emit = defineEmits<{
    removed: [data: FreeBackupsChange]
  }>()

  const open = defineModel<boolean>({ default: false })

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const saving = ref(false)
  const error = ref('')
  const confirmed = ref(false)

  // Footer of the kit card. The classes are the hooks of the tests; both are disabled while saving.
  const buttons = computed<ModalButton[]>(() => [
    { id: 'confirm', label: t('settings.backups.removeStoreConfirm'), color: 'error', buttonClass: 'store-remove-confirm', testId: 'store-remove-confirm', loadingLabel: t('settings.backups.removingStore'), disabled: saving.value },
    { id: 'cancel', label: t('button.cancel'), color: 'normal', type: 'cancel', buttonClass: 'store-remove-cancel', disabled: saving.value },
  ])

  function onButton (id: string): void {
    if (id === 'confirm') {
      void submit()
      return
    }
    close()
  }

  function close (): void {
    if (!saving.value) {
      open.value = false
    }
  }

  watch(open, isOpen => {
    if (isOpen) {
      saving.value = false
      error.value = ''
      confirmed.value = false
    }
  }, { immediate: true })

  // The store that is active now decides the wording: none left, or the default one, or one the Engine kept.
  function removedMessage (data: FreeBackupsChange): string {
    if (!data.store) {
      return t('settings.backups.storeRemovedNone')
    }
    if (data.cleanup?.container !== 'kept') {
      return t('settings.backups.storeRemoved')
    }
    if (data.cleanup.reason === 'in_use') {
      return t('settings.backups.storeRemovedInUse')
    }
    if (data.cleanup.reason === 'not_ours') {
      return t('settings.backups.storeRemovedNotOurs')
    }

    return t('settings.backups.storeRemovedKept')
  }

  async function submit (): Promise<void> {
    if (saving.value || !confirmed.value) {
      return
    }
    error.value = ''
    saving.value = true
    let data: FreeBackupsChange
    try {
      data = await removeFreeBackupStore()
    } catch (error_) {
      error.value = getErrorMessage(error_)
      saving.value = false
      return
    }
    saving.value = false
    emit('removed', data)
    alerts.addAlert({ success: true, successMessage: removedMessage(data) })
    open.value = false
  }
</script>

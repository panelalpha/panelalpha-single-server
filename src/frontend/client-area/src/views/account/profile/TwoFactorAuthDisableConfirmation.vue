<template>
  <basic-modal
    :buttons="buttons"
    class="card-width-560"
    color="error"
    data-testid="account-2fa-disable-modal"
    icon="$alertwarning"
    :title="t('heading.accountPage.modal.disable2fa.title')"
    title-testid="account-2fa-disable-title"
    @button-click="onButton"
    @modal-close="emit('modal-close')"
  >
    <template #custom>
      <p data-testid="account-2fa-disable-info">
        {{ t('heading.accountPage.modal.disable2fa.info') }}
      </p>
    </template>
  </basic-modal>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import { deactivateTwoFactor } from './two-factor-flow'

  const emit = defineEmits<{
    /** Back, outside click and Esc. */
    'modal-close': []
    /** The 2FA was disabled; the screen patches the cached user, then closes and reloads. */
    'disabled': []
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  async function deactivate (): Promise<void> {
    if (await deactivateTwoFactor({ alert: alerts.addAlert, t })) {
      emit('disabled')
    }
  }

  // Footer of the kit card: Confirm over Back; the card adds an X that closes like Back.
  const buttons = computed<ModalButton[]>(() => [
    { id: 'confirm', label: t('button.confirm'), color: 'error', testId: 'account-2fa-disable-confirm' },
    { id: 'back', label: t('button.back'), color: 'normal', type: 'cancel', testId: 'account-2fa-disable-back' },
  ])

  function onButton (id: string): void {
    if (id === 'confirm') {
      void deactivate()
      return
    }
    emit('modal-close')
  }
</script>

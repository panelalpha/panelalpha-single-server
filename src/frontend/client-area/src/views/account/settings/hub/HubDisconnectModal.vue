<template>
  <AppDialog
    v-model="open"
    :overlay="!loading"
    :persistent="loading"
    scroll-lock="mobile"
    transition="custom-dialog-transition"
  >
    <basic-modal
      :buttons="buttons"
      class="hub-disconnect-modal card-width-560"
      color="error"
      data-testid="hub-disconnect-modal"
      icon="$alertwarning"
      :submitting="loading"
      :title="t('settings.panelalphaHub.disconnectTitle', { defaultValue: 'Disconnect from PanelAlpha Hub?' })"
      @button-click="onButton"
      @modal-close="close"
    >
      <template #custom>
        <p
          v-if="passwordGenerated"
          class="hub-disconnect-set-password"
        >
          {{ t('settings.panelalphaHub.disconnectSetPassword', { defaultValue: DISCONNECT_SET_PASSWORD_DEFAULT }) }}
        </p>

        <p
          v-else
          class="hub-disconnect-warning"
        >
          {{ t('settings.panelalphaHub.disconnectWarning', { defaultValue: DISCONNECT_WARNING_DEFAULT }) }}
        </p>
      </template>
    </basic-modal>
  </AppDialog>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  // No API calls: the section confirms and handles the answer.
  // Deviations: legacy `color="normal"` on Cancel is not a theme colour (no effect), so it is omitted; the card-overlay of a loading
  // modal is absent (the V4 persistent dialog animates a click on its scrim itself).
  import { computed } from 'vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import { DISCONNECT_SET_PASSWORD_DEFAULT, DISCONNECT_WARNING_DEFAULT } from './hub-copy'

  const props = defineProps<{
    // The signed-in admin never saw the password: Connect is their only sign-in.
    passwordGenerated?: boolean
    loading?: boolean
  }>()

  const emit = defineEmits<{
    'confirm': []
    'set-password': []
  }>()

  const open = defineModel<boolean>({ default: false })

  const { t: translate } = useTranslation()
  const t = translate as (key: string, options?: Record<string, unknown>) => string

  // Footer of the kit card. The classes are the hooks of the tests; Confirm shows "Disconnecting" next to the
  // spinner, Cancel is disabled while loading, and `submitting` hides the X.
  const buttons = computed<ModalButton[]>(() => [
    props.passwordGenerated
      ? { id: 'set-password', label: t('settings.hub.disconnectSetPasswordLink'), color: 'primary', buttonClass: 'hub-disconnect-set-password-link' }
      : { id: 'confirm', label: t('settings.hub.disconnectConfirm'), color: 'error', buttonClass: 'hub-disconnect-confirm', testId: 'hub-disconnect-confirm', loadingLabel: t('settings.hub.disconnecting') },
    { id: 'cancel', label: t('button.cancel'), color: 'normal', type: 'cancel', buttonClass: 'hub-disconnect-cancel', testId: 'hub-disconnect-cancel', disabled: props.loading },
  ])

  function onButton (id: string): void {
    if (id === 'confirm') {
      emit('confirm')
      return
    }
    if (id === 'set-password') {
      emit('set-password')
      return
    }
    close()
  }

  function close () {
    if (!props.loading) {
      open.value = false
    }
  }
</script>

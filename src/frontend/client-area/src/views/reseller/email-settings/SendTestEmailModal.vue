<template>
  <AppDialog
    v-model="opened"
    overlay
    :persistent="submitting"
    scroll-lock="mobile"
    transition="custom-dialog-transition"
  >
    <basic-modal
      :buttons="buttons"
      class="card-width-560"
      close-testid="send-test-email-close"
      data-testid="send-test-email-modal"
      :submitting="submitting"
      :title="t('reseller.emailSettings.sendTestEmail')"
      @button-click="onButton"
      @modal-close="close()"
    >
      <template #custom>
        <LabeledField :label="t('reseller.emailSettings.sendTestEmailToAddress')">
          <v-text-field
            v-model="email"
            :aria-label="t('reseller.emailSettings.sendTestEmailToAddress')"
            data-testid="send-test-email-input"
            hide-details
            variant="outlined"
          />
        </LabeledField>
      </template>
    </basic-modal>
  </AppDialog>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  // Deliberate deviations from legacy: the modal closes after a successful send (legacy stays open), and it is `persistent` while the request runs (legacy is never persistent).
  // The email is not reset on close, as legacy: the session email only fills an empty field. The card is 560px wide (one look; legacy 720px) and the label is the kit
  // `LabeledField` above the field (legacy: label in a 4/12 column beside the field).
  // The close button is the kit `ModalCloseButton` (`aria-label` from `button.close`, not in legacy).
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { useSessionStore } from '@/shared/session/session.store'
  import LabeledField from '@/shared/ui/form/LabeledField.vue'
  import { cancelButton } from '@/shared/ui/modal/action-modal'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import { type ResellerEmailSettings, sendTestEmail } from './email-settings.api'

  const props = defineProps<{ settings: ResellerEmailSettings }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()
  const session = useSessionStore()

  const opened = ref(false)

  const submitting = ref(false)
  const email = ref('')

  // Footer of the kit card: Send over Cancel; `submitting` hides the X and blocks both while sending.
  const buttons = computed<ModalButton[]>(() => [
    { id: 'send', label: t('button.sendTestEmail'), color: 'primary', testId: 'send-test-email-submit' },
    { ...cancelButton(t), testId: 'send-test-email-cancel' },
  ])

  function onButton (id: string): void {
    if (id === 'send') {
      void submit()
      return
    }
    close()
  }

  function open (): void {
    if (email.value === '') {
      email.value = session.home?.user?.email ?? ''
    }
    opened.value = true
  }

  function close (): void {
    opened.value = false
  }

  async function submit (): Promise<void> {
    submitting.value = true
    try {
      await sendTestEmail(props.settings, email.value)
      alerts.addAlert({ success: true, successMessage: t('message.alertManager.success') })
      close()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      submitting.value = false
    }
  }

  defineExpose({ open })
</script>

<style lang="scss" scoped src="@/shared/ui/modal/BasicModal.scss" />

<template>
  <basic-modal
    :buttons="buttons"
    class="card-width-560"
    data-testid="account-2fa-modal"
    icon="$lockoutline"
    :title="t('heading.accountPage.modal.2fa.firstStep.title')"
    title-testid="account-2fa-title"
    @button-click="onButton"
    @modal-close="emit('modal-close')"
  >
    <template
      v-if="step === 1"
      #custom
    >
      <div>
        <v-form
          class="d-flex flex-column"
          @submit.prevent
        >
          <div
            v-safe-html:svg="codeQr"
            class="d-flex justify-center mb-8"
            data-testid="account-2fa-qr"
          />

          <p class="text-center p-1">
            <span>{{ t('heading.accountPage.modal.2fa.firstStep.info') }}</span>

            <b
              class="text-primary ms-2"
              data-testid="account-2fa-secret"
            >{{ secretKey }}</b>
          </p>

          <div>
            <labeled-field
              :label="t('form.label.code')"
              label-testid="account-2fa-code-label"
            >
              <template #label-append>
                <form-help-icon :text="t('tooltip.two_factor_authentication.confirmation_code')" />
              </template>

              <v-text-field
                v-model="code"
                :autofocus="false"
                class="v-input--md"
                data-testid="account-2fa-code"
                density="compact"
                hide-details="auto"
                persistent-hint
                persistent-placeholder
                :placeholder="t('form.placeholder.code')"
                type="text"
                variant="outlined"
                @keydown.enter="activate"
              />
            </labeled-field>
          </div>

          <!-- 2FA is on by the time this shows: without the codes there is no second step, only the way to get them. -->
          <AppMessage
            v-if="recoveryCodesFailed"
            class="mt-4"
            data-testid="account-2fa-recovery-error"
            role="alert"
            variant="error"
          >
            <p>{{ t('message.account.2fa.recoveryCodesFailed') }}</p>

            <template #action>
              <AppButton
                data-testid="account-2fa-recovery-retry"
                kind="primary"
                :loading="recoveryCodesLoading"
                size="small"
                @click="loadRecoveryCodes"
              >
                {{ ` ${t('button.retry')} ` }}
              </AppButton>
            </template>
          </AppMessage>
        </v-form>
      </div>
    </template>

    <template
      v-else-if="step === 2"
      #custom
    >
      <div>
        <p class="p-1">
          {{ t('heading.accountPage.modal.2fa.secondStep.info') }}
        </p>

        <recovery-code-box
          v-model="confirmedCloseModal"
          :alert="t('heading.accountPage.modal.2fa.secondStep.alert')"
          :codes="recoveryCodes"
          :confirm-label="t('heading.accountPage.modal.2fa.secondStep.confirmationCheckbox')"
          :testids="{ code: 'account-2fa-recovery', alert: 'account-2fa-alert', confirm: 'account-2fa-checkbox', confirmLabel: 'account-2fa-checkbox-label' }"
        />
      </div>
    </template>
  </basic-modal>
</template>

<script lang="ts" setup>
  import type { ModalButton } from '@/shared/ui/modal/basic-modal-buttons'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import { fetchTwoFactorRecoveryCodes } from '@/shared/session/session.api'
  import RecoveryCodeBox from '@/shared/ui/auth-frame/RecoveryCodeBox.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import FormHelpIcon from '@/shared/ui/form/FormHelpIcon.vue'
  import LabeledField from '@/shared/ui/form/LabeledField.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import { responseMessage } from './account-modals'
  import { activateTwoFactor } from './two-factor-flow'

  defineProps<{
    codeQr: string
    secretKey: string
  }>()

  const emit = defineEmits<{
    'modal-close': []
    'enable-2fa': [changed: boolean]
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const step = ref(1)
  const code = ref('')
  // The codes the second step shows, empty until the server sends them: a placeholder here used to be shown as the user's own recovery code.
  const recoveryCodes = ref<string[]>([])
  // The second step needs at least one code. Without one (a failed or empty answer) the dialog stays on the first step and says how to get them.
  const recoveryCodesFailed = ref(false)
  const recoveryCodesLoading = ref(false)
  const confirmedCloseModal = ref(false)

  // Footer of the kit card: step 1 Confirm (6 characters) over Back, step 2 Done (after the checkbox).
  const buttons = computed<ModalButton[]>(() => step.value === 1
    ? [
      { id: 'confirm', label: t('button.confirm'), color: 'primary', testId: 'account-2fa-confirm', disabled: code.value.length !== 6 },
      { id: 'back', label: t('button.back'), color: 'normal', type: 'cancel', testId: 'account-2fa-back' },
    ]
    : [{ id: 'done', label: t('button.account.back'), color: 'primary', testId: 'account-2fa-done', disabled: !confirmedCloseModal.value }])

  function onButton (id: string): void {
    if (id === 'confirm') {
      void activate()
      return
    }
    closeModal()
  }

  async function activate (): Promise<void> {
    recoveryCodesFailed.value = false
    const activation = await activateTwoFactor(code.value, { alert: alerts.addAlert, t }, changed => emit('enable-2fa', changed))
    // Only a confirmed code that came with codes moves on: an empty answer would ask the user to save a code that is not theirs.
    if (!activation.confirmed) {
      return
    }
    if (activation.codes?.length) {
      showCodes(activation.codes)
      return
    }
    recoveryCodesFailed.value = true
  }

  /** Retry of the failed load: 2FA is already on, so the codes are only read again (enabling it again would make new ones). */
  async function loadRecoveryCodes (): Promise<void> {
    recoveryCodesLoading.value = true
    try {
      const codes = await fetchTwoFactorRecoveryCodes()
      if (codes.length === 0) {
        recoveryCodesFailed.value = true
        return
      }
      showCodes(codes)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: responseMessage(error) })
    } finally {
      recoveryCodesLoading.value = false
    }
  }

  function showCodes (codes: string[]): void {
    recoveryCodes.value = codes
    recoveryCodesFailed.value = false
    confirmedCloseModal.value = false
    step.value = 2
  }

  // Emit, then reset the step and the code (the modal itself is never re-keyed).
  function closeModal (): void {
    emit('modal-close')
    step.value = 1
    code.value = ''
    recoveryCodesFailed.value = false
  }
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

.v-input {
  :deep(.v-input__details) {
    // Legacy 2px on top of the V2 slot's 8px margin; V4 details add 6px padding-top, so 2 - 6.
    margin-top: -4px;
    margin-bottom: 0px !important;
  }
}

b {
  font-weight: v.$font-weight-semibold;
}

.input-group {
  .v-input + .v-input {
    margin-left: 16px;
  }
}

.v-form .last-child {
  .v-input {
    &.v-text-field {
      margin-bottom: 0px;
    }
  }
}

.v-form .v-input.v-text-field {
  margin-bottom: 16px;
}
</style>

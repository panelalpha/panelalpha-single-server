<template>
  <page-frame
    v-model:tab="activeTab"
    :tabs="pageTabs"
    testid-prefix="account"
    :title="t('heading.accountPage.title')"
  >
    <v-container class="pa-0">
      <v-window v-model="activeTab">
        <v-window-item :value="0">
          <div
            class="d-flex justify-space-between align-center mb-8 account-tab-header page-frame__section-title"
          >
            <h4
              class="font-weight-light"
              data-testid="account-section-title"
            >
              {{ t('heading.accountPage.tab.user.title') }}
            </h4>
          </div>
        </v-window-item>

        <v-window-item :value="1">
          <div
            class="d-flex justify-space-between align-center mb-8 account-tab-header page-frame__section-title"
          >
            <h4
              class="font-weight-light"
              data-testid="account-section-title-devices"
            >
              {{ t('heading.accountPage.tab.device.title') }}
            </h4>

            <data-iterator-search
              v-model="searchTerm"
              data-testid="account-search"
            />
          </div>
        </v-window-item>
      </v-window>

      <v-card
        data-testid="account-card"
        elevation="4"
      >
        <v-window v-model="activeTab">
          <v-window-item
            class="panel-bg"
            :value="0"
          >
            <v-form ref="form">
              <v-card-text class="pa-6 pb-0">
                <v-row>
                  <v-col
                    class="pa-4"
                    cols="12"
                    md="3"
                  >
                    <p
                      class="p-1 mb-0 font-weight-600 text--darken-2"
                      data-testid="account-heading-user"
                    >
                      {{ t('heading.accountPage.tab.user.userSection.title') }}
                    </p>
                  </v-col>

                  <v-col
                    class="pb-0"
                    :class="mdAndDown ? 'pt-0' : 'pt-6'"
                    cols="12"
                    md="9"
                  >
                    <v-row class="my-0">
                      <v-col
                        v-for="field in personalInformation"
                        :key="field.name"
                        class="py-0"
                        cols="12"
                        sm="6"
                      >
                        <labeled-field
                          :label="field.title"
                          :label-testid="`account-label-${field.name}`"
                        >
                          <v-text-field
                            v-if="field.type === 'text'"
                            v-model="formValue[field.name as TextFieldName]"
                            class="v-input--md"
                            :data-testid="`account-field-${field.name}`"
                            density="compact"
                            persistent-hint
                            :rules="field.rules"
                            single-line
                            variant="outlined"
                          />

                          <select-dropdown
                            v-if="field.type === 'select'"
                            block
                            :bold="false"
                            :data-testid="`account-field-${field.name}`"
                            :items="field.options"
                            :model-value="findOption(languages, formValue.language)"
                            @update:model-value="handleLanguage"
                          />
                        </labeled-field>
                      </v-col>
                    </v-row>

                    <v-row class="my-0">
                      <v-col
                        class="py-0"
                        cols="12"
                        sm="6"
                      >
                        <labeled-field
                          :label="t('form.label.emailAddress')"
                          label-testid="account-label-email"
                        >
                          <v-text-field
                            v-model="emailAddress"
                            class="v-input--md"
                            data-testid="account-field-email"
                            density="compact"
                            persistent-hint
                            readonly
                            single-line
                            variant="outlined"
                          />
                        </labeled-field>
                      </v-col>

                      <v-col
                        class="py-0"
                        cols="12"
                        sm="6"
                      >
                        <label class="base--text" />

                        <AppButton
                          block
                          class="v-input--btn"
                          :class="smAndDown ? 'mt-0' : ''"
                          data-testid="account-change-email"
                          kind="field"
                          size="large"
                          @click="showChangeEmailModal"
                        >
                          {{ t('button.emailAddress.change') }}
                        </AppButton>
                      </v-col>
                    </v-row>
                  </v-col>
                </v-row>

                <v-row class="account-divider-row">
                  <v-col
                    class="pb-0"
                    :class="smAndDown ? 'mt-4' : ''"
                  >
                    <v-divider data-testid="account-divider-1" />
                  </v-col>
                </v-row>

                <v-row class="my-0">
                  <v-col
                    cols="12"
                    sm="3"
                  >
                    <p
                      class="p-1 mb-0 font-weight-600 text--darken-2"
                      data-testid="account-heading-password"
                    >
                      {{ t('heading.accountPage.tab.user.passwordSection.title') }}
                    </p>
                  </v-col>

                  <v-col
                    :class="smAndDown ? 'pt-0' : 'py-6'"
                    cols="12"
                    sm="9"
                  >
                    <v-row class="my-0">
                      <v-col
                        class="py-0"
                        cols="12"
                        md="6"
                        sm="9"
                      >
                        <AppButton
                          block
                          class="v-input--lg"
                          data-testid="account-change-password"
                          kind="field"
                          size="large"
                          @click="showChangePasswordModal"
                        >
                          {{ t(passwordGenerated ? 'button.password.set' : 'button.password.change') }}
                        </AppButton>
                      </v-col>
                    </v-row>
                  </v-col>
                </v-row>

                <v-row class="account-divider-row">
                  <v-col class="py-0">
                    <v-divider data-testid="account-divider-2" />
                  </v-col>
                </v-row>

                <v-row class="my-0">
                  <v-col
                    cols="12"
                    md="3"
                  >
                    <p
                      class="p-1 mb-0 font-weight-600 text--darken-2"
                      data-testid="account-heading-security"
                    >
                      {{ t('heading.accountPage.tab.user.securitySection.title') }}
                    </p>
                  </v-col>

                  <v-col
                    class="pb-4"
                    :class="mdAndDown ? 'pt-0' : 'pt-6'"
                    cols="12"
                    md="9"
                  >
                    <v-row class="py-0">
                      <v-col
                        class="my-0 pb-0"
                        cols="12"
                        sm="6"
                      >
                        <labeled-field
                          :label="t('form.label.twoFactorAuth')"
                          label-testid="account-label-two-factor"
                        >
                          <button-switch
                            class="pa-0 flex-start ml-0 two-factor-switch"
                            data-testid="account-two-factor-switch"
                            :disabled="loading"
                            :loading="loading"
                            :model-value="twoFactorAuthEnabled"
                            start
                            @click="toggleTwoFactorAuth"
                          />
                        </labeled-field>
                      </v-col>

                      <v-col
                        class="my-0 pb-0"
                        cols="12"
                        sm="6"
                      >
                        <labeled-field
                          :label="t('form.label.deviceDetection')"
                          label-testid="account-label-new-device-detection"
                        >
                          <select-dropdown
                            block
                            :bold="false"
                            data-testid="account-field-new-device-detection"
                            :items="DEVICE_DETECTION_OPTIONS"
                            :model-value="findOption(DEVICE_DETECTION_OPTIONS, formValue.new_device_detection)"
                            @update:model-value="changeDeviceDetection"
                          />
                        </labeled-field>
                      </v-col>
                    </v-row>
                  </v-col>
                </v-row>
              </v-card-text>

              <v-card-actions
                class="d-flex justify-end"
                data-testid="account-actions"
              >
                <AppButton
                  data-testid="account-save"
                  kind="primary"
                  size="large"
                  @click="saveChanges"
                >
                  <!-- Legacy keeps the template's whitespace around the label (`white-space: break-spaces`), 4px each side. -->
                  {{ ` ${t('button.saveChanges')} ` }}
                </AppButton>
              </v-card-actions>
            </v-form>
          </v-window-item>

          <v-window-item :value="1">
            <v-card-text class="pa-0">
              <v-row>
                <v-col>
                  <!-- The window item is lazy, as legacy `v-tab-item`: the table and its GET /user/devices wait for the first visit. -->
                  <devices-table
                    :search="searchTerm"
                    @clear-filters="searchTerm = ''"
                  />
                </v-col>
              </v-row>
            </v-card-text>
          </v-window-item>
        </v-window>
      </v-card>

      <AppDialog
        v-model="modalOpen"
        overlay
        transition="custom-dialog-transition"
      >
        <my-account-modal
          v-if="modalOptions"
          :key="modalRender"
          ref="accountModal"
          :options="modalOptions"
          @modal-close="modalOpen = false"
          @submit="onModalSubmit"
          @switch="showChangePasswordModal"
        />
      </AppDialog>

      <!-- Outside click and Esc close like X (deviation); legacy skipped the reload on them. -->
      <AppDialog
        v-model="isOpenTwoFactorAuthModal"
        overlay
        transition="custom-dialog-transition"
        @close="closeTwoFactorAuthModal"
      >
        <two-factor-auth-modal
          :code-qr="codeQr"
          :secret-key="secretKey"
          @enable-2fa="change2fa"
          @modal-close="closeTwoFactorAuthModal"
        />
      </AppDialog>

      <AppDialog
        v-model="isOpenTwoFactorDisableConfirmationModal"
        overlay
        transition="custom-dialog-transition"
        @close="closeTwoFactorAuthConfirmDisableModal"
      >
        <two-factor-auth-disable-confirmation
          @disabled="onTwoFactorDisabled"
          @modal-close="closeTwoFactorAuthConfirmDisableModal"
        />
      </AppDialog>
    </v-container>
  </page-frame>
</template>

<script lang="ts" setup>
  import type { PageFrameTab } from '@/shared/ui/page-frame/page-frame'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, useTemplateRef } from 'vue'
  import { useRoute } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import { changeEmail, changePassword, updateUser } from '@/views/account/profile/account.api'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { fetchHome } from '@/shared/session/session.api'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ButtonSwitch from '@/shared/ui/buttons/ButtonSwitch.vue'
  import DataIteratorSearch from '@/shared/ui/data-iterator/DataIteratorSearch.vue'
  import LabeledField from '@/shared/ui/form/LabeledField.vue'
  import SelectDropdown from '@/shared/ui/form/SelectDropdown.vue'
  import { useFormRules } from '@/shared/ui/form/use-form-rules'
  import { applyLanguage } from '@/shared/ui/language/apply-language'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import PageFrame from '@/shared/ui/page-frame/PageFrame.vue'
  import {
    type AccountFormValue,
    buildPersonalInformation,
    DEVICE_DETECTION_OPTIONS,
    findOption,
    formValueFromUser,
    languageOptions,
    selectedValue,
  } from './account-form'
  import {
    accountModalErrorMessage,
    type AccountModalOptions,
    changeEmailOptions,
    changePasswordOptions,
    responseMessage,
  } from './account-modals'
  import DevicesTable from './DevicesTable.vue'
  import MyAccountModal from './MyAccountModal.vue'
  import { useTwoFactorFlow } from './two-factor-flow'
  import TwoFactorAuthDisableConfirmation from './TwoFactorAuthDisableConfirmation.vue'
  import TwoFactorAuthModal from './TwoFactorAuthModal.vue'

  type TextFieldName = 'first_name' | 'last_name' | 'company_name'
  type ModalValues = Record<string, string | null>

  const { t } = useTranslation()
  const route = useRoute()
  const formRules = useFormRules()
  const { mdAndDown, smAndDown } = useDisplay()
  const session = useSessionStore()
  const alerts = useAlertsStore()

  const activeTab = ref(0)
  const pageTabs = computed<PageFrameTab[]>(() => [
    { value: 0, title: t('heading.accountPage.tab.user.title'), testid: 'account-tab-user' },
    { value: 1, title: t('heading.accountPage.tab.device.title'), testid: 'account-tab-devices' },
  ])
  const searchTerm = ref('')
  const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
  const formValue = ref<AccountFormValue>(formValueFromUser(undefined))
  const emailAddress = ref('')

  // Legacy `twoFactorAuthEnabled: ""` is cast to `true` by the Boolean prop (ON until /home resolves);
  // the flow starts OFF, a deliberate deviation.
  const {
    enabled: twoFactorAuthEnabled,
    loading,
    isOpenTwoFactorAuthModal,
    isOpenTwoFactorDisableConfirmationModal,
    codeQr,
    secretKey,
    enableTwoFactorAuth,
    toggleTwoFactorAuth,
    change2fa,
    closeTwoFactorAuthModal,
    closeTwoFactorAuthConfirmDisableModal,
    onTwoFactorDisabled,
  } = useTwoFactorFlow({
    alert: alerts.addAlert,
    t,
    reload: reloadMyAccount,
    patchUser: session.patchUser,
    passwordGenerated: () => passwordGenerated.value,
    onPasswordRequired: showChangePasswordModal,
  })

  const languages = computed(() => languageOptions(session.home?.app))
  const personalInformation = computed(() => buildPersonalInformation(t, languages.value))

  // Its own GET /home on mount, separate from the shell's.
  async function reloadMyAccount (): Promise<void> {
    const home = await fetchHome()
    formValue.value = formValueFromUser(home.user)
    twoFactorAuthEnabled.value = home.user?.two_factor_auth_enabled === true
    emailAddress.value = home.user?.email ?? ''
  }

  function handleLanguage (item: unknown): void {
    formValue.value.language = selectedValue(item)
  }

  function changeDeviceDetection (item: unknown): void {
    formValue.value.new_device_detection = selectedValue(item)
  }

  async function saveChanges (): Promise<void> {
    const result = await form.value?.validate()
    if (!result?.valid) {
      return
    }

    const previousLanguage = session.user?.language
    try {
      await updateUser({ ...formValue.value })
      alerts.addAlert({ success: true, successMessage: t('notification.account.updateUser.success') })
      // Deviation: a changed language is applied to the UI and the cached user.
      if (formValue.value.language && formValue.value.language !== previousLanguage) {
        session.patchUser({ language: formValue.value.language })
        await applyLanguage(formValue.value.language)
      }
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: responseMessage(error) })
    }
  }

  // Every open bumps `modalRender` and rebuilds the options.
  const modalOpen = ref(false)
  // The body scroll is locked while any dialog of the screen is open.
  useBodyScrollLock(computed(() => (
    modalOpen.value || isOpenTwoFactorDisableConfirmationModal.value || isOpenTwoFactorAuthModal.value
  )))
  const modalRender = ref(0)
  const modalKind = ref<'password' | 'email' | null>(null)
  const modalOptions = ref<AccountModalOptions | null>(null)
  const accountModal = useTemplateRef<{ formValues: Record<string, string | null> }>('accountModal')

  // The admin was created by a Connect setup and never saw the password.
  const passwordGenerated = computed(() => !!session.user?.password_generated)

  function showChangePasswordModal (): void {
    modalRender.value++
    modalKind.value = 'password'
    modalOptions.value = changePasswordOptions(t, () => accountModal.value?.formValues.password, passwordGenerated.value)
    modalOpen.value = true
  }

  function showChangeEmailModal (): void {
    modalRender.value++
    modalKind.value = 'email'
    modalOptions.value = changeEmailOptions(t, formRules, passwordGenerated.value)
    modalOpen.value = true
  }

  async function changePasswordFromModal (values: ModalValues): Promise<void> {
    if (values.password !== values.password_confirmation) {
      alerts.addAlert({ success: false, errorMessage: t('notification.account.changePassword.error') })
      return
    }
    // Read again on save, as legacy does.
    const generated = passwordGenerated.value
    try {
      await changePassword({
        ...(generated ? {} : { current_password: values.current_password ?? '' }),
        password: values.password ?? '',
        password_confirmation: values.password_confirmation ?? '',
      })
      alerts.addAlert({
        success: true,
        successMessage: t(generated ? 'notification.account.setPassword.success' : 'notification.account.changePassword.success'),
      })
      modalOpen.value = false
      // The flag is cleared on the server; the page then offers "Change password". As in legacy, `/home` is not awaited.
      if (generated) {
        void session.ensureHome(true).catch(() => undefined)
      }
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: accountModalErrorMessage(error, 'password') })
    }
  }

  async function changeEmailFromModal (values: ModalValues): Promise<void> {
    try {
      await changeEmail({ password: values.password ?? '', email: values.email ?? '' })
      alerts.addAlert({ success: true, successMessage: t('notification.account.changeEmail.success') })
      modalOpen.value = false
      // Deviation: the cached user follows the new address.
      session.patchUser({ email: values.email ?? '' })
      await reloadMyAccount()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: accountModalErrorMessage(error, 'email') })
    }
  }

  function onModalSubmit (values: ModalValues): void {
    void (modalKind.value === 'password' ? changePasswordFromModal(values) : changeEmailFromModal(values))
  }

  onMounted(() => {
    void reloadMyAccount()

    // Legacy only opens the closable modals; nothing is enforced and the flags stay in the URL.
    if (route.query.change_password_required === 'true') {
      showChangePasswordModal()
    }
    if (route.query.two_factor_auth_required === 'true') {
      void enableTwoFactorAuth()
    }
  })
</script>

<style lang="scss" scoped>
label + .v-btn {
  margin-top: 32px;
}

.v-card-actions {
  border-top: 1px solid var(--v-gray-lighten5);
}

// V2 containers pad 12px, V4 16px: set on the two containers above (`pa-3`).

// Legacy: `.row { margin: -16px }` and `.col-* { padding: 16px }`. V4 spaces a row with `gap`
// instead, so the gap is dropped and the legacy numbers come back (the `my-0` / `py-0` utilities still override them).
// V4 utilities are layered and not `!important`, so the defaults sit in `vuetify-overrides`, below the utilities layer.
@layer vuetify-overrides {
  .v-row {
    --v-col-gap-x: 0px;
    --v-col-gap-y: 0px;
    margin: -16px;
  }

  // V2 `.col` pads 12px; the legacy global rule raises only `.col-12`, `.col-6`, `.col-4` and `.col-3` to 16px.
  .v-col {
    padding: 12px;
  }

  .v-col--cols-12 {
    padding: 16px;
  }
}

// Legacy has an inline `style="margin: 0 -35px"`: the divider row runs across the card padding.
// Unlayered, so it beats the `.v-row` default in `vuetify-overrides` as the inline style did.
.account-divider-row {
  margin: 0 -35px;
}

// Legacy has an inline style on the 2FA switch, as a class. `display` stays `!important` as in legacy: the switch's own display rule would otherwise win.
.two-factor-switch {
  display: block !important;
  max-width: fit-content;
}

// V2 `.v-text-field` slot margin. `!important` kept; the V4 field layer wins without it.
.v-text-field:not(.v-select) :deep(.v-field) {
  margin-bottom: 4px !important;
}

// V2 details row: 14px tall with -4px / -12px margins (net -2px). A V4 grid row cannot go below 0, so the 2px come off the control.
.v-text-field:not(.v-select) :deep(.v-input__control) {
  margin-bottom: -2px;
}

// With a message the V2 row is 56px (52 + 20 - 4 - 12), which the V4 details row already adds up to.
.v-text-field:not(.v-select):has(.v-messages__message) :deep(.v-input__control) {
  margin-bottom: 0;
}

.text-base {
  color: var(--v-gray-lighten1);
}

.panel-bg {
  background-color: var(--v-panel-base);
}
</style>

<template>
  <OnboardingDialog
    data-testid="onboarding-import-simple-modal"
    :model-value="isOpen"
  >
    <OnboardingCard
      v-if="isOpen"
      :close-disabled="loading"
      @close="closeModal"
    >
      <v-card-text class="px-8 pt-8">
        <div class="mb-8 d-flex align-start">
          <div class="d-flex flex-column">
            <span class="font-weight-light p-1 base--text">
              {{ t('heading.onboarding.import.url.title') }}
            </span>

            <h4>{{ t('heading.onboarding.import.url.subtitle') }}</h4>
          </div>
        </div>

        <v-scale-transition>
          <AppMessage
            v-if="formError && !connectionTestLoading"
            class="mb-4"
            variant="error"
          >
            <b>
              <i18next :translation="t('message.alert.failed')">
                <template #message>
                  <span class="font-weight-medium">{{ formError }}</span>
                </template>
              </i18next>
            </b>
          </AppMessage>

          <AppMessage
            v-if="formWarning && !connectionTestLoading"
            class="mb-4"
            variant="warning"
          >
            <b>
              <i18next :translation="t('message.alert.warning')">
                <template #message>
                  <span class="font-weight-medium">{{ formWarning }}</span>
                </template>
              </i18next>
            </b>
          </AppMessage>
        </v-scale-transition>

        <v-form
          ref="form"
          @submit.prevent="handleContinueButtonClick"
        >
          <v-expansion-panels
            v-model="panelOpen"
            class="simple-import-panels"
            mandatory
          >
            <!-- SIMPLE METHOD: WP admin login details -->
            <v-expansion-panel
              elevation="0"
              :value="0"
            >
              <v-expansion-panel-title
                :class="['h6 text--heading font-weight-bold', { 'disabled-panel': isSimpleMethodDisabled && panelOpen !== 0 }]"
                hide-actions
              >
                {{ t('heading.onboarding.simpleImportMethod.adminLoginDetails.title') }}
              </v-expansion-panel-title>

              <v-expansion-panel-text>
                <div class="body-1 text-gray-darken-2 font-weight-light mb-4">
                  <div class="mb-2">
                    {{ t('heading.onboarding.simpleImportMethod.adminLoginDetails.description') }}
                  </div>

                  <div>
                    <span class="font-weight-600 me-1">{{ t('heading.onboarding.simpleImportMethod.adminLoginDetails.please_note') }}:</span>
                    <span>{{ t('heading.onboarding.simpleImportMethod.adminLoginDetails.note') }}</span>
                  </div>
                </div>

                <div v-if="panelOpen === 0">
                  <label class="base--text p-3">
                    {{ t('form.label.url') }}
                  </label>

                  <validated-text-field
                    v-model="loginUrl"
                    class="mt-1 mb-3"
                    hide-details
                    placeholder="https://example.com/wp-login.php"
                    :rules="urlRules"
                    validate-on="blur"
                    variant="outlined"
                    @blur="normalizeLoginUrlOnBlur"
                    @keydown.enter.prevent="handleContinueButtonClick"
                  />

                  <label class="base--text p-3">
                    {{ t('form.label.username') }}
                  </label>

                  <validated-text-field
                    v-model="username"
                    class="mt-1 mb-3"
                    hide-details
                    placeholder="admin"
                    :rules="usernameRules"
                    validate-on="blur"
                    variant="outlined"
                    @keydown.enter.prevent="handleContinueButtonClick"
                  />

                  <label class="base--text p-3">
                    {{ t('form.label.password') }}
                  </label>

                  <validated-text-field
                    v-model="password"
                    class="mt-1 mb-6"
                    hide-details
                    :rules="passwordRules"
                    type="password"
                    validate-on="blur"
                    variant="outlined"
                    @keydown.enter.prevent="handleContinueButtonClick"
                  />
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>

            <!-- ADVANCED METHOD: plugin/manual -->
            <v-expansion-panel :value="1">
              <v-expansion-panel-title
                class="h6 text--heading font-weight-bold"
                hide-actions
              >
                {{ t('heading.onboarding.simpleImportMethod.installPluginManually.title') }}
              </v-expansion-panel-title>

              <v-expansion-panel-text>
                <div
                  v-if="panelOpen === 1"
                  class="body-2 text-gray-darken-2 mb-4"
                >
                  <ol class="p-d">
                    <li class="text-gray-darken-2">
                      <div>{{ t('heading.onboarding.simpleImportMethod.installPluginManually.downloadPluginHeader') }}</div>

                      <AppButton
                        class="my-3"
                        :href="downloadPluginLink"
                        kind="primary"
                      >
                        <v-icon
                          icon="$download"
                          size="16"
                        />
                        {{ t('heading.onboarding.simpleImportMethod.installPluginManually.downloadPluginButton') }}
                      </AppButton>
                    </li>

                    <li class="text-gray-darken-2 mb-1">
                      {{ t('heading.onboarding.simpleImportMethod.installPluginManually.installPlugin') }}
                    </li>

                    <li class="text-gray-darken-2 my-1">
                      {{ t('heading.onboarding.simpleImportMethod.installPluginManually.runMigration') }}
                    </li>
                  </ol>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-form>
      </v-card-text>

      <OnboardingStepFooter
        :back-disabled="loading"
        :back-label="t('button.cancel')"
        :loading="loading || connectionTestLoading"
        :max-steps="maxSteps"
        :next-label="t('button.continue')"
        :step="maxSteps"
        @back="closeModal"
        @next="handleContinueButtonClick"
      />
    </OnboardingCard>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  // The request body, the
  // login url and the outcome rules are in `import-simple.ts` and `import-connection.ts`. The dead demo branch is not ported.
  import { useTranslation } from 'i18next-vue'
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { failureMessage, pluginOutcome } from '@/views/onboarding/import-connection'
  import {
    buildPluginTestBody,
    handOnDetails,
    initialLoginUrl,
    normalizeLoginUrl,
    pluginDownloadUrl,
  } from '@/views/onboarding/import-simple'
  import { testWordpressConnection, type WordpressConnectionResult } from '@/views/onboarding/onboarding.api'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import OnboardingStepFooter from '@/views/onboarding/ui/OnboardingStepFooter.vue'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { useFormRules } from '@/shared/ui/form/use-form-rules'
  import ValidatedTextField from '@/shared/ui/form/ValidatedTextField.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import OnboardingCard from '@/shared/ui/modal/OnboardingCard.vue'

  const props = withDefaults(defineProps<{
    isOpen: boolean
    /** The flow's `submitting`. The cancel and continue buttons show it, and the modal cannot close meanwhile. */
    loading?: boolean
    /** The step count of the import flow. */
    maxSteps?: number
    /** The WordPress url the URL step kept. */
    importUrl?: string | null
    /** The optional server ip the URL step kept. */
    importIp?: string | null
    /** The service the import runs on. */
    serviceId?: number | string | null
  }>(), {
    loading: false,
    maxSteps: 0,
    importUrl: null,
    importIp: null,
    serviceId: null,
  })

  const emit = defineEmits<{
    'remove-modal': []
    /** The connection test succeeded: the import details the import step (later phase) reads. */
    'import-instance': [details: Record<string, unknown>]
  }>()

  const { t } = useTranslation()
  const { urlRules, usernameRules, passwordRules } = useFormRules()

  const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
  // 0 is the admin login panel (open by default), 1 the manual plugin install. Closing the open panel leaves it empty.
  const panelOpen = ref<number | null>(0)
  const loginUrl = ref('')
  const username = ref('')
  const password = ref('')
  const formError = ref('')
  const formWarning = ref('')
  const connectionTestLoading = ref(false)
  // Set by a connection error, it greys the admin login panel header.
  const isSimpleMethodDisabled = ref(false)
  const downloadPluginLink = pluginDownloadUrl()

  /** The form starts again on every open and close. */
  function resetData (): void {
    panelOpen.value = 0
    loginUrl.value = ''
    username.value = ''
    password.value = ''
    formError.value = ''
    formWarning.value = ''
    connectionTestLoading.value = false
    isSimpleMethodDisabled.value = false
  }

  // Reset on every change, and the login url starts from the site url on open.
  watch(() => props.isOpen, open => {
    resetData()
    if (open) {
      loginUrl.value = initialLoginUrl(props.importUrl)
    }
  })

  function closeModal (): void {
    if (!props.loading) {
      emit('remove-modal')
    }
  }

  /** Normalizes the protocol on the login url's blur. */
  function normalizeLoginUrlOnBlur (): void {
    loginUrl.value = normalizeLoginUrl(loginUrl.value)
  }

  /**
   * The error and the warning are shown inline, a connection error
   * also disables the admin login panel and opens the manual panel, a success hands the import details on.
   */
  function applyConnectionResult (result: WordpressConnectionResult): void {
    switch (pluginOutcome(result)) {
      case 'error': {
        formError.value = failureMessage(result, t('notification.connectionFailed'))
        return
      }
      case 'connection_error': {
        formWarning.value = failureMessage(result, t('notification.connectionFailed'))
        isSimpleMethodDisabled.value = true
        panelOpen.value = 1
        return
      }
      case 'warning': {
        formWarning.value = failureMessage(result, t('notification.connectionFailed'))
        return
      }
      case 'success': {
        emit('import-instance', handOnDetails(result, password.value))
        return
      }
      default: {
        formError.value = t('notification.connectionFailed')
      }
    }
  }

  async function handleContinueButtonClick (): Promise<void> {
    if (props.loading || connectionTestLoading.value) {
      return
    }

    formError.value = ''
    formWarning.value = ''

    const { valid } = (await form.value?.validate()) ?? { valid: true }
    // An invalid form with an empty required field: the fields of the open panel only.
    if (!valid && (loginUrl.value === '' || username.value === '' || password.value === '')) {
      formError.value = t('notification.emptyFields')
      return
    }

    connectionTestLoading.value = true
    try {
      const result = await testWordpressConnection(buildPluginTestBody(
        {
          importUrl: props.importUrl,
          importIp: props.importIp,
          loginUrl: loginUrl.value,
          username: username.value,
          password: password.value,
        },
        props.serviceId ?? '',
        panelOpen.value,
      ))
      applyConnectionResult(result)
    } catch (error) {
      formError.value = getErrorMessage(error)
    } finally {
      connectionTestLoading.value = false
    }
  }

  /** Leaving while the import runs asks first. The message is read at the event, so a language change applies. */
  function handleBeforeUnload (event: BeforeUnloadEvent): string | undefined {
    if (!props.loading) {
      return undefined
    }
    const message = t('heading.onboarding.simpleImportMethod.importInProgress')
    event.returnValue = message
    return message
  }

  onMounted(() => {
    window.addEventListener('beforeunload', handleBeforeUnload)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })
</script>

<style lang="scss" scoped>
  // The V2 `.v-expansion-panel-header/-content` are the V4 title and text.
  // The header has no chevron (`hide-actions`): the legacy header draws a radio circle on `::before` / `::after` and its icon slot has
  // width 0 at every width (checked on the built legacy), the same as in `OnboardingChooseDomainModal`.
  .simple-import-panels {
    .v-expansion-panel {
      border: 1px solid var(--v-gray-lighten2);
      // V4 vendor: the V4 panel paints its own background; LITE (V2) has no such rule. Kept with `!important` to win over it.
      background-color: unset !important;

      &::before,
      &::after {
        display: none;
      }

      // V4 draws the panel elevation in the `__shadow` node (V2 had none); inner node of the child, so `:deep`.
      :deep(.v-expansion-panel__shadow) {
        display: none;
      }

      &--active {
        border-color: var(--v-primary-base);
      }
    }

    // V2 `.v-expansion-panel-content__wrap` is `padding: 0 24px 16px`; V4's wrapper has an 8px top padding.
    :deep(.v-expansion-panel-text__wrapper) {
      padding-top: 0;
      padding-bottom: 0;
      color: var(--v-gray-lighten1);
    }

    .v-expansion-panel-title {
      padding-left: 60px;
      position: relative;

      &::before,
      &::after {
        content: "";
        position: absolute;
        left: 24px;
        top: 50%;
        transform: translateY(-50%);
        opacity: 1 !important;
        // The V2 theme has a `checkbox` colour (#FFFFFF, dark #2F2F3D); V4 declares it as `--v-theme-checkbox`.
        background: rgb(var(--v-theme-checkbox));
        border-radius: 20px;
      }

      &::before {
        transition: border-color 0.24s ease, background-color 0.24s ease;
        width: 20px;
        height: 20px;
        border: 1px solid var(--v-gray-lighten2);
      }

      &::after {
        width: 10px;
        height: 10px;
        z-index: 10;
        left: 29px;
        // V4 gives the title's `::after` a 2px border (its focus ring); the V2 dot had none.
        border: 0;
      }

      &:hover {
        &::before {
          border-color: var(--v-primary-base);
        }
      }

      &--active {
        &::before {
          border-color: var(--v-primary-base);
          background-color: var(--v-primary-base);
        }
      }
    }

    .disabled-panel {
      &,
      & * {
        color: var(--v-gray-lighten2) !important;
      }

      &::before {
        border-color: var(--v-gray-lighten3);
        background-color: var(--v-gray-lighten4);
      }

      &::after {
        background-color: var(--v-gray-lighten3);
      }
    }
  }
</style>

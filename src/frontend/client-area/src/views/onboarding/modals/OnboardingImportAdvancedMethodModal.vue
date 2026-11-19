<template>
  <OnboardingDialog
    data-testid="onboarding-import-advanced-modal"
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
              {{ t('heading.onboarding.import.ftp.title') }}
            </span>

            <h4>{{ t('heading.onboarding.import.ftp.subtitle') }}</h4>
          </div>
        </div>

        <v-divider class="mb-5" />

        <p class="p-2 text-gray-darken-2 mb-5 font-weight-light">
          {{ t('heading.onboarding.import.ftp.info') }}
        </p>

        <v-form
          ref="form"
          class="form-box"
          @submit.prevent
        >
          <div class="full">
            <label class="base--text p-3">
              {{ t('form.label.hostname') }}
            </label>

            <v-text-field
              v-model="hostname"
              class="mt-1 mb-0"
              density="compact"
              hide-details
              placeholder="ftp.source.example.com"
              :rules="hostnameRules"
              variant="outlined"
            />
          </div>

          <div class="half">
            <label class="base--text p-3">
              {{ t('form.label.protocol') }}
            </label>

            <v-select
              v-model="protocol"
              class="mt-1 mb-0"
              density="compact"
              hide-details
              :items="protocolItems"
              :rules="protocolRules"
              variant="outlined"
            />
          </div>

          <div class="half">
            <label class="base--text p-3">
              {{ t('form.label.serverPort') }}
            </label>

            <v-text-field
              v-model="port"
              class="mt-1 mb-0"
              density="compact"
              hide-details
              placeholder="21"
              :rules="portRules"
              type="number"
              variant="outlined"
            />
          </div>

          <template v-if="protocol === 'SFTP'">
            <div class="full">
              <label class="base--text p-3">
                {{ t('form.label.authenticationMethod') }}
              </label>

              <v-select
                v-model="authMethod"
                class="mt-1 mb-0"
                density="compact"
                hide-details
                :items="authMethods"
                :rules="authMethodRules"
                variant="outlined"
              />
            </div>

            <div class="half">
              <label class="base--text p-3">
                {{ t('form.label.sftp.user') }}
              </label>

              <v-text-field
                v-model="sftpUsername"
                class="mt-1 mb-0"
                density="compact"
                hide-details
                :placeholder="t('form.placeholder.sftp.user')"
                :rules="sftpUsernameRules"
                variant="outlined"
              />
            </div>

            <div class="half">
              <template v-if="authMethod === 'password'">
                <label class="base--text p-3">
                  {{ t('form.label.sftp.password') }}
                </label>

                <v-text-field
                  v-model="sftpPassword"
                  class="mt-1 mb-0"
                  density="compact"
                  hide-details
                  :placeholder="t('form.placeholder.sftp.password')"
                  :rules="sftpPasswordRules"
                  type="password"
                  variant="outlined"
                />
              </template>
            </div>

            <template v-if="authMethod === 'ssh_key'">
              <div class="half">
                <label class="base--text p-3">
                  {{ t('form.label.privateKey') }}
                </label>

                <v-text-field
                  v-model="sftpPrivateKey"
                  class="mt-1 mb-0"
                  density="compact"
                  hide-details
                  :placeholder="t('form.placeholder.privateKey')"
                  :rules="privateKeyRules"
                  type="password"
                  variant="outlined"
                />
              </div>

              <div class="half">
                <label class="base--text p-3">
                  {{ t('form.label.passphrase') }} ({{ t('general.optional') }})
                </label>

                <v-text-field
                  v-model="sftpPassphrase"
                  class="mt-1 mb-0"
                  density="compact"
                  hide-details
                  :placeholder="t('form.placeholder.passphrase')"
                  type="password"
                  variant="outlined"
                />
              </div>
            </template>
          </template>

          <template v-else>
            <div class="half">
              <label class="base--text p-3">
                {{ t('form.label.ftp.user') }}
              </label>

              <v-text-field
                v-model="username"
                class="mt-1 mb-0"
                density="compact"
                hide-details
                :placeholder="t('form.placeholder.ftp.user')"
                :rules="ftpUsernameRules"
                variant="outlined"
              />
            </div>

            <div class="half">
              <label class="base--text p-3">
                {{ t('form.label.ftp.password') }}
              </label>

              <v-text-field
                v-model="password"
                class="mt-1 mb-0"
                density="compact"
                hide-details
                :placeholder="t('form.placeholder.ftp.password')"
                :rules="ftpPasswordRules"
                type="password"
                variant="outlined"
              />
            </div>
          </template>

          <div class="full">
            <label class="base--text p-3">
              {{ t('form.label.installedPath') }}
            </label>

            <v-text-field
              v-model="installedPath"
              class="mt-1 mb-0"
              density="compact"
              hide-details
              placeholder="wp"
              variant="outlined"
            />
          </div>
        </v-form>

        <v-scale-transition>
          <AppMessage
            v-if="formError && !connectionTestLoading"
            class="mt-5"
            icon="$alertcircle"
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
            class="mt-5"
            icon="$alertcircle"
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
  // emptiness check and the demo mock are in `import-advanced.ts`; the outcome rules are in `import-connection.ts`.
  // The dead `*Error` flags of legacy (never set) are not ported.
  import { useTranslation } from 'i18next-vue'
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { isDemoAccount } from '@/views/onboarding/demo'
  import {
    type AdvancedFormValues,
    buildFtpTestBody,
    DEFAULT_FTP_PORT,
    DEFAULT_FTP_PROTOCOL,
    demoConnectionTest,
    FTP_PROTOCOLS,
    hasEmptyRequiredFields,
  } from '@/views/onboarding/import-advanced'
  import { failureMessage, ftpOutcome } from '@/views/onboarding/import-connection'
  import { testWordpressConnection, type WordpressConnectionResult } from '@/views/onboarding/onboarding.api'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import OnboardingStepFooter from '@/views/onboarding/ui/OnboardingStepFooter.vue'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { useSessionStore } from '@/shared/session/session.store'
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
    /** The service the import runs on. */
    serviceId?: number | string | null
  }>(), {
    loading: false,
    maxSteps: 0,
    importUrl: null,
    serviceId: null,
  })

  const emit = defineEmits<{
    'remove-modal': []
    /** The connection test succeeded: the import details the import step (later phase) reads. */
    'import-instance': [details: Record<string, unknown>]
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()

  // The demo account takes the mock connection test.
  const isDemo = computed(() => isDemoAccount(session.user?.email))

  type FieldRule = (value: unknown) => true | string

  // The duplicate `length > 0` rules of legacy repeat the required message, so they are not ported.
  const requiredRule = (labelKey: string): FieldRule => value => !!value || t('form.validation.required', { field: t(labelKey) })
  function tooLongRule (labelKey: string): FieldRule {
    return value => (
      (!!value && String(value).length < 256) || t('form.validation.tooLong', { field: t(labelKey) })
    )
  }

  const hostnameRules: FieldRule[] = [requiredRule('form.label.hostname'), tooLongRule('form.label.hostname')]
  const protocolItems: string[] = [...FTP_PROTOCOLS]
  const protocolRules: FieldRule[] = [
    requiredRule('form.label.protocol'),
    value => FTP_PROTOCOLS.includes(value as (typeof FTP_PROTOCOLS)[number]) || t('form.validation.invalid', { field: t('form.label.protocol') }),
  ]
  const portRules: FieldRule[] = [
    requiredRule('form.label.serverPort'),
    value => (Number(value) > 0 && Number(value) < 65_536) || t('form.validation.integer', {
      field: t('form.label.serverPort'),
      firstNumber: 1,
      secondNumber: 65_536,
    }),
    value => Number(value) % 1 === 0 || t('form.validation.integer', { field: t('form.label.serverPort') }),
  ]
  const ftpUsernameRules: FieldRule[] = [requiredRule('form.label.ftp.user'), tooLongRule('form.label.ftp.user')]
  const ftpPasswordRules: FieldRule[] = [requiredRule('form.label.ftp.password'), tooLongRule('form.label.ftp.password')]
  const authMethodRules: FieldRule[] = [requiredRule('form.label.authenticationMethod')]
  const sftpUsernameRules: FieldRule[] = [requiredRule('form.label.sftp.user'), tooLongRule('form.label.sftp.user')]
  const sftpPasswordRules: FieldRule[] = [requiredRule('form.label.sftp.password'), tooLongRule('form.label.sftp.password')]
  const privateKeyRules: FieldRule[] = [requiredRule('form.label.privateKey')]

  const authMethods = computed(() => [
    { title: t('form.option.password'), value: 'password' },
    { title: t('form.option.sshKey'), value: 'ssh_key' },
  ])

  const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
  const hostname = ref('')
  const protocol = ref<string>(DEFAULT_FTP_PROTOCOL)
  const port = ref<number | string>(DEFAULT_FTP_PORT)
  const username = ref('')
  const password = ref('')
  const installedPath = ref('')
  // Legacy keeps the SFTP fields and the auth method across resets; next clears the SFTP credentials, the auth method stays.
  const authMethod = ref('password')
  const sftpUsername = ref('')
  const sftpPassword = ref('')
  const sftpPrivateKey = ref('')
  const sftpPassphrase = ref('')
  const formError = ref('')
  const formWarning = ref('')
  const connectionTestLoading = ref(false)

  function currentValues (): AdvancedFormValues {
    return {
      importUrl: props.importUrl,
      hostname: hostname.value,
      protocol: protocol.value,
      port: port.value,
      username: username.value,
      password: password.value,
      installedPath: installedPath.value,
      authMethod: authMethod.value,
      sftpUsername: sftpUsername.value,
      sftpPassword: sftpPassword.value,
      sftpPrivateKey: sftpPrivateKey.value,
      sftpPassphrase: sftpPassphrase.value,
    }
  }

  /**
    * Runs on every open and close. The port goes back to 21, and a protocol switch never changes it. Not in legacy:
    * the SFTP credentials are cleared too, so a password or a private key does not outlive the form.
   */
  function resetData (): void {
    hostname.value = ''
    protocol.value = DEFAULT_FTP_PROTOCOL
    port.value = DEFAULT_FTP_PORT
    username.value = ''
    password.value = ''
    installedPath.value = ''
    sftpUsername.value = ''
    sftpPassword.value = ''
    sftpPrivateKey.value = ''
    sftpPassphrase.value = ''
    formError.value = ''
    formWarning.value = ''
    connectionTestLoading.value = false
  }

  watch(() => props.isOpen, () => {
    resetData()
  })

  function closeModal (): void {
    if (!props.loading) {
      emit('remove-modal')
    }
  }

  /**
    * An error and a warning are shown inline, a success hands the
    * import details on, and any other answer is the legacy "connection failed" message.
   */
  function applyConnectionResult (result: WordpressConnectionResult): void {
    switch (ftpOutcome(result)) {
      case 'error': {
        formError.value = failureMessage(result, '')
        return
      }
      case 'warning': {
        formWarning.value = failureMessage(result, '')
        return
      }
      case 'success': {
        emit('import-instance', { ...result.import_details })
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
    const values = currentValues()
    // An invalid form with an empty required field.
    if (!valid && hasEmptyRequiredFields(values)) {
      formError.value = t('notification.emptyFields')
      return
    }

    connectionTestLoading.value = true
    try {
      const result = isDemo.value
        ? await demoConnectionTest(hostname.value)
        : await testWordpressConnection(buildFtpTestBody(values, props.serviceId ?? ''))
      applyConnectionResult(result)
    } catch (error) {
      // Legacy demo mock rejects with `false` (`reject(false)`), which leaves the alert hidden.
      formError.value = error === false ? '' : getErrorMessage(error)
    } finally {
      connectionTestLoading.value = false
    }
  }

  /** Leaving while the import runs asks first. The message is read at the event, so a language change applies. */
  function handleBeforeUnload (event: BeforeUnloadEvent): string | undefined {
    if (!props.loading) {
      return undefined
    }
    const message = t('heading.onboarding.import.ftp.importInProgress')
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
  // A two-column grid, `.full` spans both columns.
  .form-box {
    border: 1px solid var(--v-gray-lighten4);
    border-radius: 8px;
    padding: 16px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-gap: 16px 12px;

    .full {
      grid-column: 1 / 3;
    }

    // Legacy outlined text fields sit on a white background.
    :deep(.v-field) {
      background-color: var(--v-white-base);
    }
  }
</style>

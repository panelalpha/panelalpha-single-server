<template>
  <WizardStepFrame
    v-if="hub"
    :description="t('setup.wizard.hub.description', { defaultValue: 'Last thing before your first deploy.' })"
    :step="stepNumber('general-config')"
    :title="t('setup.wizard.hub.title', { defaultValue: 'Name your server' })"
  >
    <WizardHubAccount
      :email="accountEmail"
      :hub-url="hubUrl"
    />

    <p
      v-if="loadError"
      class="general-config__error general-config__error--load"
      data-testid="wizard-hub-load-error"
      role="alert"
    >
      {{ loadError }}
    </p>

    <v-form
      :id="formId"
      ref="form"
      class="general-config"
      @submit.prevent="submit"
    >
      <WizardTextField
        v-model="serverName"
        autocomplete="off"
        :disabled="loadingSettings || loadError !== ''"
        :error-messages="fieldErrors"
        :label="t('setup.wizard.hub.serverNameLabel', { defaultValue: 'Server name' })"
        name="server-name"
        :rules="serverNameFieldRules"
      />

      <p
        v-if="errors.length > 0"
        class="general-config__error"
        data-testid="wizard-general-error"
        role="alert"
      >
        <span
          v-for="(message, index) in errors"
          :key="index"
        >
          {{ message }}
        </span>
      </p>
    </v-form>

    <template #footer>
      <WizardFooter
        :disabled="loadingSettings || loadError !== ''"
        :form="formId"
        hide-previous
        :loading="submitting"
      />
    </template>
  </WizardStepFrame>

  <WizardStepFrame
    v-else
    :step="stepNumber('general-config')"
    :title="t('setup.wizard.hub.title', { defaultValue: 'Name your server' })"
  >
    <template #description>
      {{ t('setup.wizard.local.lead', { defaultValue: 'This account works on this server only.' }) }}
      <router-link
        v-if="!readonly"
        class="general-config__link"
        data-testid="wizard-general-hub-link"
        :to="hubPath"
      >
        {{ t('setup.wizard.local.hubLink', { defaultValue: 'Connect with Hub instead' }) }}
      </router-link>
    </template>

    <v-form
      :id="formId"
      ref="form"
      class="general-config"
      @submit.prevent="submit"
    >
      <div class="general-config__sec">
        <WizardLockedHint :active="readonly">
          <WizardTextField
            v-model="serverName"
            :aria-label="t('setup.wizard.general.serverNameLabel', { defaultValue: 'Server name' })"
            autocomplete="off"
            :disabled="readonly"
            name="server-name"
            :placeholder="t('setup.wizard.general.serverNameHeading', { defaultValue: 'Name your server' })"
            :rules="serverNameFieldRules"
          />
        </WizardLockedHint>
      </div>

      <div class="general-config__sec">
        <h3 class="general-config__section">
          {{ t('setup.wizard.general.accountHeading', { defaultValue: 'Your account' }) }}
        </h3>

        <WizardLockedHint :active="readonly">
          <WizardTextField
            v-model="name"
            autocomplete="name"
            :disabled="readonly"
            :label="t('setup.wizard.general.nameLabel', { defaultValue: 'Your Name' })"
            name="name"
            :placeholder="t('setup.wizard.general.namePlaceholder', { defaultValue: 'Enter your name (optional)' })"
          />
        </WizardLockedHint>

        <WizardLockedHint :active="readonly">
          <WizardTextField
            v-model="email"
            autocomplete="email"
            :disabled="readonly"
            :hint="t('setup.wizard.general.emailHint', { defaultValue: '- will be used as login' })"
            :label="t('setup.wizard.general.emailLabel', { defaultValue: 'Email' })"
            name="email"
            :placeholder="t('setup.wizard.general.emailPlaceholder', { defaultValue: 'Enter your email address' })"
            :rules="emailRules"
          />
        </WizardLockedHint>

        <div
          v-if="!readonly"
          class="general-config__passwords"
        >
          <WizardPasswordField
            v-model="password"
            autocomplete="new-password"
            checker
            :label="t('setup.wizard.general.passwordLabel', { defaultValue: 'Password' })"
            name="new-password"
            :placeholder="t('setup.wizard.general.passwordPlaceholder', { defaultValue: 'Enter your password' })"
            :rules="setupPasswordRules"
          />

          <WizardPasswordField
            v-model="passwordConfirm"
            autocomplete="new-password"
            :label="t('setup.wizard.general.confirmLabel', { defaultValue: 'Confirm password' })"
            name="confirm-password"
            :placeholder="t('setup.wizard.general.confirmPlaceholder', { defaultValue: 'Confirm your password' })"
            :rules="passwordConfirmRules"
          />
        </div>
      </div>

      <p
        v-if="errors.length > 0"
        class="general-config__error general-config__error--save"
        data-testid="wizard-general-error"
        role="alert"
      >
        <span
          v-for="(message, index) in errors"
          :key="index"
        >
          {{ message }}
        </span>
      </p>
    </v-form>

    <template #footer>
      <WizardFooter
        :form="formId"
        :hide-previous="readonly"
        :loading="submitting"
        :previous-label="t('setup.wizard.local.back', { defaultValue: 'Back' })"
        @previous="goBack"
      />
    </template>
  </WizardStepFrame>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, useId } from 'vue'
  import { useRouter } from 'vue-router'
  import { readonlyValues, resolveGeneralConfigMode } from '@/views/wizard/general-config-mode'
  import { submitGeneralConfig, submitServerName } from '@/views/wizard/general-config-submit'
  import { confirmRules, serverNameRules } from '@/views/wizard/wizard-form-rules'
  import { nextPath, pathOfSlug, stepIndex, stepNumber } from '@/views/wizard/wizard-steps'
  import { createFreeSetup, getWizardSettings, saveWizardServerName, type WizardSettings } from '@/views/wizard/wizard.api'
  import { useWizardStore } from '@/views/wizard/wizard.store'
  import WizardFooter from '@/views/wizard/WizardFooter.vue'
  import WizardHubAccount from '@/views/wizard/WizardHubAccount.vue'
  import WizardLockedHint from '@/views/wizard/WizardLockedHint.vue'
  import WizardPasswordField from '@/views/wizard/WizardPasswordField.vue'
  import WizardStepFrame from '@/views/wizard/WizardStepFrame.vue'
  import WizardTextField from '@/views/wizard/WizardTextField.vue'
  import { isHttpUrl } from '@/entities/hub/hub-connection'
  import { getHubStatus } from '@/entities/hub/hub.api'
  import { clearAllCachedGet } from '@/shared/api/cached-get'
  import { getErrorMessages } from '@/shared/api/error-message'
  import { fetchCsrfCookie } from '@/shared/session/session.api'
  import { useSessionStore } from '@/shared/session/session.store'
  import { clearWizardFlow } from '@/shared/session/wizard-path'
  import { useFormRules } from '@/shared/ui/form/use-form-rules'

  // Step 2 of the wizard (single-server): the name of the server and the administrator
  // account. The telemetry box is not ported (`POST /community/setup` has no such field). Continue creates the account (`POST /community/setup`) and
  // opens step 3 (Summary); the backend logs the new admin in, so the session is read again before the move.
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSessionStore()
  const wizard = useWizardStore()
  const { emailRules, setupPasswordRules } = useFormRules()

  const formId = useId()
  const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
  const serverName = ref('')
  const name = ref('')
  const email = ref('')
  const password = ref('')
  const passwordConfirm = ref('')
  const submitting = ref(false)
  const errors = ref<string[]>([])

  const serverNameFieldRules = computed(() => serverNameRules((key, options) => t(key, options)))
  const passwordConfirmRules = computed(() => confirmRules((key, options) => t(key, options), () => password.value))

  // Fixed on mount: the account the step creates signs the user in, and the step must not turn read-only under its own Continue.
  const mode = resolveGeneralConfigMode({
    hasUser: Boolean(session.user),
    setupRequired: session.home?.app?.setup_required,
    passwordGenerated: session.user?.password_generated,
  })
  const readonly = mode === 'readonly'
  // After a Hub return: the account is Hub's, only the name of the server is edited.
  const hub = mode === 'hub'

  // State of the `hub` mode: the name and the two defaults come from `GET /community/settings`, and Continue sends them back with the new name.
  const loadingSettings = ref(hub)
  const loadError = ref('')
  const fieldErrors = ref<string[]>([])
  let settings: WizardSettings | null = null
  const accountEmail = computed(() => session.user?.email ?? session.home?.user?.email ?? '')
  // Only an http(s) address is offered as a link (it comes from the API of the panel).
  const hubUrl = computed(() => isHttpUrl(wizard.hubUrl) ? wizard.hubUrl : null)

  async function loadSettings (): Promise<void> {
    try {
      // The Hub address is in the store after the return; a reload loses it, so it is asked for (its failure only drops the link).
      const [loaded, status] = await Promise.all([
        getWizardSettings(),
        wizard.hubUrl === null ? getHubStatus().catch(() => null) : Promise.resolve(null),
      ])
      settings = loaded
      serverName.value = loaded.name
      if (status?.hub_url) {
        wizard.setHubUrl(status.hub_url)
      }
    } catch (error) {
      loadError.value = getErrorMessages(error).join(' ')
    } finally {
      loadingSettings.value = false
    }
  }

  if (hub) {
    void loadSettings()
  } else if (readonly) {
    const values = readonlyValues(session.home)
    serverName.value = values.serverName
    name.value = values.name
    email.value = values.email
  } else {
    // The default name ("My server" on the screenshot) goes into an empty field only.
    serverName.value = t('setup.wizard.general.serverNameDefault', { defaultValue: 'My server' })
  }

  async function submitHub (): Promise<void> {
    if (settings === null) {
      return
    }
    const { valid } = form.value ? await form.value.validate() : { valid: true }
    if (!valid || submitting.value) {
      return
    }
    errors.value = []
    fieldErrors.value = []
    submitting.value = true
    try {
      const outcome = await submitServerName(serverName.value, settings, { saveWizardServerName })
      if (outcome.kind === 'saved') {
        wizard.reach(stepIndex('connect-ai'))
        await router.push(nextPath('general-config'))
        window.scrollTo(0, 0)
      } else if (outcome.fieldMessages.length > 0) {
        fieldErrors.value = outcome.fieldMessages
      } else {
        errors.value = outcome.messages
      }
    } finally {
      submitting.value = false
    }
  }

  async function submit (): Promise<void> {
    if (submitting.value) {
      return
    }
    if (hub) {
      await submitHub()
      return
    }
    if (readonly) {
      // The account exists: Continue only opens step 3, no call.
      await router.push(nextPath('general-config'))
      window.scrollTo(0, 0)
      return
    }
    const { valid } = form.value ? await form.value.validate() : { valid: true }
    // The form validates asynchronously, so a second submit can pass the first guard while this one waits.
    if (!valid || submitting.value) {
      return
    }
    errors.value = []
    submitting.value = true
    try {
      const outcome = await submitGeneralConfig({
        serverName: serverName.value,
        name: name.value,
        email: email.value,
        password: password.value,
        passwordConfirm: passwordConfirm.value,
      }, {
        fetchCsrfCookie,
        createFreeSetup,
        afterCreated: async () => {
          clearAllCachedGet()
          return session.remoteAuthCheck()
        },
      })
      if (outcome.kind === 'created') {
        await router.push(nextPath('general-config'))
        window.scrollTo(0, 0)
      } else if (outcome.kind === 'conflict') {
        // Someone else finished the setup: refresh /home and leave.
        clearWizardFlow()
        clearAllCachedGet()
        await session.ensureHome(true)
        await router.push('/login')
      } else {
        errors.value = outcome.messages
      }
    } finally {
      submitting.value = false
    }
  }

  // "Back" and the link of the lead return to step 1, where the sign-in is chosen.
  const hubPath = pathOfSlug('panelalpha-connect')

  function goBack (): void {
    void router.push(hubPath)
  }
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  $below-sm: map.get(v.$grid-breakpoints, sm) - 0.02px;

  // The headings are 18/28/700, 20px below; the second one has `mt-2` (8px) on top of the
  // 16px under the field (24px here, as the margins of the field and the heading collapse).
  .general-config__section {
    margin: 24px 0 20px;
    color: var(--v-wizard-title);
    font-size: v.$font-size-lg;
    line-height: 28px;
    font-weight: v.$font-weight-bold;
  }

  // Password and confirmation side by side (`cols="6"` over 590px, 16px between), one under the other below `sm` (590px in the source).
  .general-config__passwords {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 16px;

    @media (max-width: $below-sm) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  // The link of the description in the look of the links of admin area: `primary`, semibold, underline on hover.
  .general-config__link {
    color: rgb(var(--v-theme-primary));
    font-weight: v.$font-weight-semibold;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }

    &:focus-visible {
      outline: 2px solid rgb(var(--v-theme-primary));
      outline-offset: 2px;
      border-radius: 2px;
    }
  }

  // The error of the save (the source keeps it as `p.error--text` over the buttons).
  .general-config__error {
    display: flex;
    flex-direction: column;
    margin: 0;
    color: rgb(var(--v-theme-error));
    font-size: v.$font-size-base;
    line-height: 26px;
  }

  // The failed read of the name stands between the frame of the account and the field.
  .general-config__error--load {
    margin-bottom: 24px;
  }
</style>

<template>
  <AuthFrame>
    <!-- Verify email -->
    <VerifyEmail
      v-if="step === 'verify_email'"
      code-sent
      :email="email"
      :registering="false"
      @verified="onVerified"
    />

    <!-- 2FA challenge -->
    <AuthCard
      v-else-if="step === 'two_factor'"
      :title="t('heading.loginPage.twoFactorAuthentication.title')"
      title-tag="h5"
    >
      <template v-if="twoFAErrors.length > 0">
        <AppMessage
          v-for="(error, index) in twoFAErrors"
          :key="index"
          class="mb-6"
          data-testid="auth-two-factor-error"
          role="alert"
          :title="error"
          variant="error"
        />
      </template>

      <v-form
        class="form"
        @submit.prevent="submitTwoFactor"
      >
        <v-text-field
          v-model="twoFactorCode"
          autocomplete="one-time-code"
          data-testid="auth-field-code"
          flat
          hide-details="auto"
          :label="t('form.placeholder.code')"
          single-line
          validate-on="blur"
          variant="outlined"
          @keydown.enter.prevent="submitTwoFactor"
        >
          <template #prepend-inner>
            <v-icon
              class="text--body"
              icon="$keyIcon"
              size="24"
            />
          </template>
        </v-text-field>

        <span class="p-4 mb-5">{{ t('heading.loginPage.twoFactorAuthentication.info') }}</span>
      </v-form>

      <AppButton
        block
        data-testid="auth-submit"
        kind="primary"
        :loading="loading"
        size="large"
        @click.prevent="submitTwoFactor"
      >
        <span class="font-weight-600">{{ t('button.verify') }}</span>

        <template #loader>
          <Loader
            color="white"
            :size="24"
          />
        </template>
      </AppButton>

      <AppButton
        block
        class="mt-4"
        data-testid="auth-secondary"
        kind="secondary"
        size="x-large"
        @click="goBackFromTwoFactor"
      >
        <span class="heading--text font-weight-bold">{{ t('button.back') }}</span>
      </AppButton>
    </AuthCard>

    <!-- Recovery code after using a recovery code at login -->
    <AuthCard
      v-else-if="step === 'recovery'"
      :title="t('heading.loginPage.recoveryCode.title')"
      title-tag="h5"
    >
      <RecoveryCodeBox
        v-model="recoveryConfirmed"
        :alert="t('heading.loginPage.recoveryCode.alert')"
        alert-role="status"
        :codes="recoveryCodes"
        :confirm-label="t('heading.loginPage.recoveryCode.confirmationCheckbox')"
        :testids="{ code: 'auth-recovery-code', copy: 'auth-recovery-copy', alert: 'auth-warning', confirm: 'auth-recovery-confirm' }"
      />

      <AppButton
        block
        class="mt-4"
        data-testid="auth-submit"
        :disabled="!recoveryConfirmed"
        kind="primary"
        :loading="loading"
        size="x-large"
        @click.prevent="finishAfterRecovery"
      >
        <span class="font-weight-600">{{ t('button.continue') }}</span>

        <template #loader>
          <Loader
            color="white"
            :size="24"
          />
        </template>
      </AppButton>
    </AuthCard>

    <!-- Email / password / set_password -->
    <AuthCard
      v-else
      :title="t('heading.loginPage.login.title')"
    >
      <AppMessage
        v-if="setupBlocked"
        class="mb-6"
        data-testid="auth-setup-blocked"
        role="alert"
        :title="t('heading.loginPage.setupBlocked.title')"
        variant="error"
      >
        <p>{{ t('heading.loginPage.setupBlocked.text') }}</p>
      </AppMessage>

      <template v-if="displayErrors.length > 0">
        <CollapseTransitions :enabled="!twoFactorAuthEnabled && !backupCodeRegenerated">
          <!-- Legacy <transition> renders only its first child; explicit here. -->
          <AppMessage
            v-for="(error, index) in displayErrors.slice(0, 1)"
            :key="`err-${index}`"
            class="mb-6"
            data-testid="auth-error"
            role="alert"
            :title="error"
            variant="error"
          >
            <SupportLink
              v-if="supportLink"
              :href="supportLink"
            />
          </AppMessage>
        </CollapseTransitions>
      </template>

      <template v-if="step === 'set_password'">
        <CollapseTransitions enabled>
          <AppMessage
            class="mb-6"
            data-testid="auth-success"
            role="status"
            :title="t('heading.loginPage.setPassword.title')"
            variant="success"
          >
            <p>{{ t('heading.loginPage.setPassword.text') }}</p>
          </AppMessage>
        </CollapseTransitions>
      </template>

      <v-form
        ref="form"
        @submit.prevent="submitLogin"
      >
        <EmailField
          v-if="step === 'email'"
          v-model="email"
          autocomplete="username"
          data-testid="auth-field-email"
          :label="t('form.label.emailAddress')"
          name="email"
          :rules="emailRules"
        />

        <template v-if="step === 'password'">
          <p
            class="mb-4 text--body"
            data-testid="auth-identity"
          >
            {{ t('heading.loginPage.passwordStep.signingInAs') }}
            <b data-testid="auth-identity-email">{{ email }}</b>
          </p>

          <PasswordField
            v-model="password"
            autocomplete="current-password"
            data-testid="auth-field-password"
            :label="t('form.label.password')"
            name="password"
            :rules="adminPasswordRules"
          />

          <div
            class="d-flex justify-space-between align-center mb-6 ga-2"
          >
            <div class="d-flex align-center">
              <Checkbox
                v-model="remember"
                data-testid="auth-remember"
                :label="t('form.label.rememberMe')"
                labellg
              />
            </div>

            <div class="d-flex align-center">
              <div>
                <a
                  class="login-forgot-link"
                  data-testid="auth-forgot-link"
                  href="/forgot-password"
                  @click.prevent="goToForgotPassword"
                >{{ t('button.forgotPassword') }}</a>
              </div>
            </div>
          </div>
        </template>

        <template v-if="step === 'set_password'">
          <PasswordField
            v-model="password"
            autocomplete="new-password"
            data-testid="auth-field-password"
            :label="t('form.label.password')"
            name="new-password"
            :rules="policyPasswordRules"
          />

          <PasswordField
            v-model="passwordConfirm"
            autocomplete="new-password"
            data-testid="auth-field-password-confirm"
            :label="t('Confirm Password')"
            name="confirm-password"
            :rules="policyPasswordRules"
          />
        </template>

        <AppButton
          block
          data-testid="auth-submit"
          kind="primary"
          :loading="loading"
          size="large"
          type="submit"
        >
          <span class="font-weight-600">{{ t('button.logIn') }}</span>

          <template #loader>
            <Loader
              color="white"
              :size="24"
            />
          </template>
        </AppButton>
      </v-form>

      <AppButton
        v-if="step === 'password'"
        block
        class="mt-4"
        data-testid="auth-secondary"
        kind="secondary"
        size="x-large"
        @click="goBackToEmail"
      >
        <span class="heading--text font-weight-bold">{{ t('button.back') }}</span>
      </AppButton>

      <AuthSocialButtons
        v-if="hubLoginEnabled || authProviders.length > 0"
        :divider-text="t('general.or')"
        :loading="authLoading"
        :providers="authProviders"
        @select="socialAuth"
      >
        <AppButton
          v-if="hubLoginEnabled"
          block
          class="social-login-btn"
          data-testid="auth-hub-login"
          kind="secondary"
          :loading="hubLoading"
          size="large"
          @click.prevent="hubLogin"
        >
          <span class="text--gray-darken2 font-weight-400 p-d">
            {{ t('button.signInWithPanelAlpha') }}
          </span>
        </AppButton>
      </AuthSocialButtons>

      <template
        v-if="registrationEnabled"
        #bottom
      >
        <span>{{ t('heading.loginPage.noAccount') }}</span>

        <RouterLink
          class="ml-1"
          data-testid="auth-bottom-link"
          to="/register"
        >
          {{ t('button.signUp') }}
        </RouterLink>
      </template>
    </AuthCard>

    <LanguageSwitcher
      class="mt-10"
      is-login
    />
  </AuthFrame>
</template>

<script lang="ts" setup>
  import type { VerifyEmailOutcome } from './login/verify-email-outcome'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, watch } from 'vue'
  import { RouterLink, useRoute, useRouter } from 'vue-router'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { emit as emitAppEvent } from '@/shared/events/app-events'
  import {
    getDemoCredentials,
    hasAccountAlreadyExistsQuery,
    isDemoMode,
  } from '@/shared/session/demo-mode'
  import { resolvePostLoginDestination } from '@/shared/session/login-redirect'
  import {
    fetchHubLoginStartUrl,
    fetchSocialRedirectUrl,
    fetchTwoFactorRecoveryCodes,
    type HomeResponse,
    type LoginResponse,
    regenerateTwoFactorRecoveryCodes,
  } from '@/shared/session/session.api'
  import { useSessionStore } from '@/shared/session/session.store'
  import AuthCard from '@/shared/ui/auth-frame/AuthCard.vue'
  import AuthFrame from '@/shared/ui/auth-frame/AuthFrame.vue'
  import AuthSocialButtons from '@/shared/ui/auth-frame/AuthSocialButtons.vue'
  import RecoveryCodeBox from '@/shared/ui/auth-frame/RecoveryCodeBox.vue'
  import SupportLink from '@/shared/ui/auth-frame/SupportLink.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import EmailField from '@/shared/ui/form/EmailField.vue'
  import PasswordField from '@/shared/ui/form/PasswordField.vue'
  import { useFormRules } from '@/shared/ui/form/use-form-rules'
  import LanguageSwitcher from '@/shared/ui/language/LanguageSwitcher.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import CollapseTransitions from '@/shared/ui/transitions/CollapseTransitions.vue'
  import { startHubLogin } from './hub/hub-login-start'
  import { acceptInviteIfPresent } from './login/accept-invite'
  import { loginSubmitErrors, twoFactorErrors } from './login/login-errors'
  import { type LoginStep, nextLoginStepFromResponse } from './login/login-steps'
  import { executeRecaptcha, hideRecaptchaBadge, loadRecaptchaScript } from './login/recaptcha'
  import VerifyEmail from './VerifyEmail.vue'

  type UiStep = LoginStep | 'recovery'

  const { t } = useTranslation()
  const route = useRoute()
  const router = useRouter()
  const session = useSessionStore()

  const { adminPasswordRules, emailRules, policyPasswordRules } = useFormRules()

  const step = ref<UiStep>('email')
  // The card's form, for the e-mail step's own rules (see `submitLogin`).
  const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
  const email = ref('')
  const password = ref('')
  const passwordConfirm = ref('')
  const remember = ref(false)
  const loading = ref(false)
  const errors = ref<string[]>([])
  // 2FA errors never reach the login card; they are rendered in the 2FA card.
  const twoFAErrors = ref<string[]>([])
  const twoFactorCode = ref('')
  const usePassword = ref(false)
  // Every new code the panel made after a sign-in with a recovery code, not only the first one.
  const recoveryCodes = ref<string[]>([])
  const recoveryConfirmed = ref(false)
  const authLoading = ref(false)
  const hubLoading = ref(false)
  let postLoginHome: HomeResponse | LoginResponse | null = null
  /** True after acceptInviteIfPresent ran for this auth success (incl. before recovery). */
  let inviteAcceptAttempted = false

  async function runAcceptInviteIfPresent (): Promise<void> {
    const attempted = await acceptInviteIfPresent(route.query.invite_token)
    if (attempted) {
      inviteAcceptAttempted = true
    }
  }

  const displayErrors = computed(() => errors.value)
  const twoFactorAuthEnabled = computed(() => step.value === 'two_factor')
  const backupCodeRegenerated = computed(() => step.value === 'recovery')

  const siteKey = computed(() => session.home?.app?.recaptcha_site_key ?? null)

  const authProviders = computed(() => {
    const providers = session.home?.app?.integrations?.auth
    return Array.isArray(providers) ? providers.map(String) : []
  })

  const hubLoginEnabled = computed(() => Boolean(session.home?.app?.hub_login))

  // The panel has no account and will not take one from the web: the delivered
  // first-user variables failed and the operator has to repair them.
  const setupBlocked = computed(() => session.home?.app?.setup_blocked === true)

  const registrationEnabled = computed(() => Boolean(session.home?.app?.registration_enabled))

  const supportLink = computed(() => {
    const link = session.home?.app?.support_link
    return typeof link === 'string' && link.length > 0 ? link : null
  })

  function goToForgotPassword (): void {
    void router.push({ path: '/forgot-password' })
  }

  function hubLogin (): Promise<void> {
    return startHubLogin({
      setLoading: value => {
        hubLoading.value = value
      },
      setErrors: value => {
        errors.value = value
      },
      fetchUrl: fetchHubLoginStartUrl,
      navigate: url => window.location.assign(url),
    })
  }

  async function socialAuth (provider: string) {
    authLoading.value = true
    try {
      const url = await fetchSocialRedirectUrl(provider)
      window.location.href = url
    } catch (error) {
      errors.value = [getErrorMessage(error)]
    } finally {
      authLoading.value = false
    }
  }

  function emailFromQuery (): string {
    const raw = route.query.email
    if (Array.isArray(raw)) {
      return raw[0] ? String(raw[0]) : ''
    }
    return typeof raw === 'string' ? raw : ''
  }

  async function navigateAfterSuccess (response: HomeResponse | LoginResponse) {
    const destination = resolvePostLoginDestination({
      response,
      redirectQuery: route.query.redirect as string | undefined,
    })

    if (destination.kind === 'external') {
      window.location.href = destination.url
      return
    }

    await router.push({
      path: destination.path,
      query: destination.query,
    })
  }

  /** The forced `/my-account` redirects (password change, 2FA required) skip `hideRecaptchaBadge`. */
  function isForcedAccountRedirect (response: HomeResponse | LoginResponse): boolean {
    return response.admin === undefined
      && Boolean(response.user?.password_change_required || response.user?.two_factor_auth_required)
  }

  async function submitLogin () {
    // V4 `loading` does not disable the button, so Enter during a request would send a second `POST /login`.
    if (loading.value) {
      return
    }
    // The e-mail step posts only what its field accepts, as the forgot-password form does; the field states the refusal.
    if (step.value === 'email') {
      const current = form.value
      if (current) {
        const { valid } = await current.validate()
        if (!valid) {
          return
        }
      }
    }
    loading.value = true
    try {
      const isEmailOnly = step.value === 'email'
      const captcha = await executeRecaptcha(siteKey.value, 'login')
      const payload: {
        'email': string
        'password'?: string
        'remember'?: boolean
        'g-recaptcha-response'?: string
      } = {
        email: email.value,
        remember: remember.value,
      }
      if (!isEmailOnly) {
        payload.password = password.value
      }
      if (captcha) {
        payload['g-recaptcha-response'] = captcha
      }

      const data = await session.login(payload)

      // `redirect_to` wins; it goes through the same safe-destination check as every other redirect.
      if (data.redirect_to) {
        await navigateAfterSuccess(data)
        return
      }

      const next = nextLoginStepFromResponse(data)
      if (next) {
        if (next === 'password') {
          usePassword.value = true
        }
        // Only the two-factor step clears the errors, an error otherwise stays until replaced.
        if (next === 'two_factor') {
          errors.value = []
        }
        step.value = next
        return
      }

      // `after-login` fires before the invite is accepted, `hideRecaptchaBadge` only on the plain redirect.
      emitAppEvent('after-login')
      postLoginHome = data
      await runAcceptInviteIfPresent()
      if (!isForcedAccountRedirect(data)) {
        hideRecaptchaBadge()
      }
      await navigateAfterSuccess(data)
    } catch (error) {
      errors.value = loginSubmitErrors(error)
    } finally {
      loading.value = false
    }
  }

  async function submitTwoFactor () {
    twoFAErrors.value = []
    loading.value = true
    try {
      const code = twoFactorCode.value.trim()
      const payload = code.length <= 6
        ? { code }
        : { recovery_code: code }

      const home = await session.completeTwoFactor(payload)
      // `after-login` fires before the invite; the badge is hidden on the code (not recovery) path.
      emitAppEvent('after-login')
      postLoginHome = home
      await runAcceptInviteIfPresent()

      if (code.length > 6) {
        await regenerateTwoFactorRecoveryCodes()
        recoveryCodes.value = await fetchTwoFactorRecoveryCodes()
        step.value = 'recovery'
        return
      }

      // On the code path the badge is hidden before the `password_change_required` check.
      hideRecaptchaBadge()
      await navigateAfterSuccess(home)
    } catch (error) {
      twoFAErrors.value = twoFactorErrors(error, twoFactorCode.value.trim())
    } finally {
      loading.value = false
    }
  }

  async function onVerified (data: LoginResponse, outcome: VerifyEmailOutcome) {
    if (data.redirect_to) {
      await navigateAfterSuccess(data)
      return
    }
    const next = nextLoginStepFromResponse(data)
    if (next) {
      step.value = next
      return
    }
    postLoginHome = data
    await runAcceptInviteIfPresent()
    if (outcome.navigate) {
      await navigateAfterSuccess(data)
    }
  }

  async function finishAfterRecovery () {
    if (!inviteAcceptAttempted) {
      await runAcceptInviteIfPresent()
    }
    await navigateAfterSuccess(postLoginHome ?? { app: session.home?.app ?? {} })
  }

  function goBackFromTwoFactor () {
    step.value = usePassword.value ? 'password' : 'email'
  }

  /** Corrects a mistyped address: the field keeps it, the answer about the old one goes. */
  function goBackToEmail () {
    password.value = ''
    errors.value = []
    step.value = 'email'
  }

  onMounted(async () => {
    if (isDemoMode()) {
      const demo = getDemoCredentials()
      email.value = demo.email
      password.value = demo.password
    } else {
      email.value = emailFromQuery()
    }

    if (hasAccountAlreadyExistsQuery(route.query)) {
      errors.value = [t('heading.loginPage.message.accountAlreadyExists')]
    }

    try {
      await session.ensureHome()
    } catch {
      // home may be unavailable offline
    }

    // Logged-in visitors are redirected by the route guard (`login/login-entry.ts`) before this hook runs.
    void loadRecaptchaScript(siteKey.value)
  })

  watch(() => route.query.email, () => {
    if (isDemoMode()) {
      return
    }
    const fromQuery = emailFromQuery()
    if (fromQuery) {
      email.value = fromQuery
    }
  })
</script>

<template>
  <AuthFrame>
    <VerifyEmail
      v-if="step === 'verify_email'"
      :code-sent="verificationCodeSent"
      :email="email"
      :skip-dashboard="skipDashboard"
      @verified="onVerifySuccess"
    />

    <AuthCard
      v-else-if="!quickRegistering"
      stack-bottom
      :title="t('heading.registerPage.registerAccount')"
      title-tag="h2"
      wide
    >
      <template v-if="errors.length > 0">
        <CollapseTransitions :enabled="false">
          <!-- Legacy <transition> renders only its first child; explicit here. -->
          <AuthMessage
            v-for="(error, index) in errors.slice(0, 1)"
            :key="`err-${index}`"
            class="mb-6"
            data-testid="auth-error"
            role="alert"
            :title="error"
            variant="error"
          >
            <p
              v-if="alreadyRegisteredError"
            >
              {{ t('general.please') }}
              <RouterLink
                class="text-info"
                to="/login"
              >{{ t('general.logInLink') }}{{ ' ' }}</RouterLink>
              {{ t('general.toYourAccount') }}

              <template v-if="supportLink">
                {{ t('general.or') }}
                <a
                  class="text-info"
                  :href="supportLink"
                >{{ t('general.contactSupportLink') }}</a>
              </template>
            </p>

            <SupportLink
              v-else-if="supportLink"
              :href="supportLink"
            />
          </AuthMessage>
        </CollapseTransitions>
      </template>

      <template v-if="step === 'set_password'">
        <CollapseTransitions enabled>
          <AuthMessage
            class="mb-6"
            data-testid="auth-success"
            role="status"
            :title="t('heading.loginPage.setPassword.title')"
            variant="success"
          >
            <p>
              {{ t('heading.loginPage.setPassword.text') }}
            </p>
          </AuthMessage>
        </CollapseTransitions>
      </template>

      <AuthSocialButtons
        v-if="authProviders.length > 0"
        :divider-text="t('heading.registerPage.fillForm')"
        :loading="authLoading"
        modifier="register"
        :providers="authProviders"
        @select="socialAuth"
      />

      <v-form
        ref="registerForm"
        class="form"
        @submit.prevent="onFormSubmit"
      >
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
            :label="t('form.label.passwordConfirm')"
            name="confirm-password"
            :rules="policyPasswordRules"
          />
        </template>

        <EmailField
          v-else
          v-model="email"
          autocomplete="email"
          data-testid="auth-field-email"
          :label="t('form.label.emailAddress')"
          name="email"
          :rules="emailRules"
          type="email"
        />

        <div class="d-flex justify-space-between align-center">
          <div class="d-flex align-center flex-wrap">
            <div class="mr-1">
              {{ t('heading.registerPage.registeringAccept') }}
            </div>

            <RegistrationTermsModal />
          </div>
        </div>

        <AppButton
          block
          class="mt-6"
          data-testid="auth-submit"
          kind="primary"
          :loading="loading"
          size="large"
          type="submit"
        >
          <span class="font-weight-600">{{ t('button.register') }}</span>

          <template #loader>
            <Loader
              color="white"
              :size="24"
            />
          </template>
        </AppButton>
      </v-form>

      <template #bottom>
        <div>{{ t('heading.registerPage.alreadyRegistered') }}</div>

        <div>
          <RouterLink
            class="ml-1 mr-1"
            data-testid="auth-bottom-link"
            to="/login"
          >
            {{ t('button.signIn') }}
          </RouterLink>
          {{ t('general.or') }}
          <RouterLink
            class="ml-1"
            data-testid="auth-bottom-link"
            to="/forgot-password"
          >
            {{ t('button.resetPassword') }}
          </RouterLink>
        </div>
      </template>
    </AuthCard>

    <AuthCard
      v-else
      centered
      data-testid="auth-quick-card"
      :title="t('heading.registerPage.creatingAccount.title')"
      title-tag="h2"
      wide
    >
      <template #media>
        <svg
          v-if="quickRegisteringCompleted"
          aria-hidden="true"
          class="quick-register-check"
          fill="none"
          height="114"
          viewBox="0 0 114 114"
          width="114"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="57"
            cy="57"
            r="51"
            stroke="rgb(var(--v-theme-primary))"
            stroke-width="12"
          />

          <path
            d="M37.5 57.5635L52.75 72.8135L80.25 45.3135"
            stroke="rgb(var(--v-theme-primary))"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="10"
          />
        </svg>

        <Loader
          v-else
          color="primary"
          :size="118"
          :width="12"
        >
          <v-icon
            class="quick-register-hourglass"
            color="primary"
            data-testid="auth-quick-loader-icon"
            icon="$loadingHourglass"
            size="30"
          />
        </Loader>
      </template>

      <div class="p-lg text-center text--gray-darken1">
        {{ t('heading.registerPage.creatingAccount.text') }}
      </div>
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
  import { computed, nextTick, onMounted, ref } from 'vue'
  import { RouterLink, useRoute, useRouter } from 'vue-router'
  import RegistrationTermsModal from '@/views/auth/RegistrationTermsModal.vue'
  import VerifyEmail from '@/views/auth/VerifyEmail.vue'
  import { getErrorMessage, getErrorMessages, isApiError } from '@/shared/api/error-message'
  import { emit as emitAppEvent } from '@/shared/events/app-events'
  import { readControlPanelUpgradeToken } from '@/shared/session/control-panel-upgrade-token'
  import { type PostLoginDestination, resolvePostLoginDestination, resolveSafeRedirect } from '@/shared/session/login-redirect'
  import {
    fetchSocialRedirectUrl,
    type HomeResponse,
    isRegisterIntermediate,
    type LoginResponse,
    type RegisterResponse,
  } from '@/shared/session/session.api'
  import { useSessionStore } from '@/shared/session/session.store'
  import AuthCard from '@/shared/ui/auth-frame/AuthCard.vue'
  import AuthFrame from '@/shared/ui/auth-frame/AuthFrame.vue'
  import AuthSocialButtons from '@/shared/ui/auth-frame/AuthSocialButtons.vue'
  import SupportLink from '@/shared/ui/auth-frame/SupportLink.vue'
  import AuthMessage from '@/shared/ui/auth-message/AuthMessage.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import EmailField from '@/shared/ui/form/EmailField.vue'
  import PasswordField from '@/shared/ui/form/PasswordField.vue'
  import { useFormRules } from '@/shared/ui/form/use-form-rules'
  import LanguageSwitcher from '@/shared/ui/language/LanguageSwitcher.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import CollapseTransitions from '@/shared/ui/transitions/CollapseTransitions.vue'
  import { executeRecaptcha, hideRecaptchaBadge, loadRecaptchaScript } from './login/recaptcha'
  import {
    persistControlPanelUpgradeQuery,
    persistNewSiteQuery,
    resolveAutoCompleteEmail,
  } from './login/register-quick'

  type RegisterStep = 'email' | 'set_password' | 'verify_email'

  const props = defineProps<{
    predefinedEmail?: string
  }>()

  const { t } = useTranslation()
  const route = useRoute()
  const router = useRouter()
  const session = useSessionStore()

  const registerForm = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
  const { emailRules, policyPasswordRules } = useFormRules()

  const step = ref<RegisterStep>('email')
  const email = ref('')
  const password = ref('')
  const passwordConfirm = ref('')
  const loading = ref(false)
  const errors = ref<string[]>([])
  const alreadyRegisteredError = ref(false)
  const authLoading = ref(false)
  const verificationCodeSent = ref(false)
  const quickRegistering = ref(false)
  const quickRegisteringCompleted = ref(false)
  const skipDashboard = ref(false)
  /** Guard against double auto-submit from mount + recaptcha then. */
  const autoSubmitStarted = ref(false)

  const siteKey = computed(() => session.home?.app?.recaptcha_site_key ?? null)

  const authProviders = computed(() => {
    const providers = session.home?.app?.integrations?.auth
    return Array.isArray(providers) ? providers.map(String) : []
  })

  const supportLink = computed(() => {
    const link = session.home?.app?.support_link
    return typeof link === 'string' && link.length > 0 ? link : null
  })

  function isEmailAlreadyRegistered (error: unknown): boolean {
    if (!isApiError(error) || !error.response) {
      return false
    }
    const data = error.response.data as { error_type?: string }
    return data.error_type === 'email_already_registered'
  }

  async function navigateAfterSuccess (response: HomeResponse | RegisterResponse | LoginResponse) {
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

  /** `after_register_redirect_url` of the API, only when it points inside the app; anything else is ignored. */
  function resolveAfterRegisterRedirect (data: RegisterResponse | LoginResponse): PostLoginDestination | null {
    const url = 'after_register_redirect_url' in data ? data.after_register_redirect_url : undefined
    if (typeof url !== 'string' || url.length === 0) {
      return null
    }
    return resolveSafeRedirect(url)
  }

  async function handleRegisterSuccess (data: RegisterResponse | LoginResponse, navigate = !skipDashboard.value) {
    // Legacy `register()` sent the browser to `after_register_redirect_url` verbatim; the API never fills it, and a value it did
    // fill would be an open redirect. Only an in-app destination is followed, as with every other login redirect.
    const apiRedirect = resolveAfterRegisterRedirect(data)
    if (apiRedirect) {
      skipDashboard.value = true
      quickRegisteringCompleted.value = true
      if (apiRedirect.kind === 'external') {
        window.location.href = apiRedirect.url
        return
      }
      await router.push({ path: apiRedirect.path, query: apiRedirect.query })
      return
    }

    if (navigate) {
      await navigateAfterSuccess(data)
      return
    }

    quickRegisteringCompleted.value = true
  }

  async function onVerifySuccess (data: LoginResponse, outcome: VerifyEmailOutcome) {
    await handleRegisterSuccess(data, outcome.navigate)
  }

  async function socialAuth (provider: string) {
    // Legacy keeps the current errors; the catch replaces them.
    authLoading.value = true
    try {
      const token = readControlPanelUpgradeToken()
      const url = await fetchSocialRedirectUrl(
        provider,
        token ? { token } : undefined,
      )
      window.location.href = url
    } catch (error) {
      errors.value = [getErrorMessage(error)]
    } finally {
      authLoading.value = false
    }
  }

  async function onFormSubmit () {
    await submitRegister()
  }

  async function submitRegister (options?: { skipFormValidate?: boolean }) {
    if (loading.value) {
      return
    }

    if (!options?.skipFormValidate) {
      const form = registerForm.value
      if (form) {
        const { valid } = await form.validate()
        if (!valid) {
          return
        }
      }
    }

    // Legacy `register()` clears the errors only after the form validates.
    errors.value = []
    alreadyRegisteredError.value = false

    // Intentionally no passwordConfirm === password client gate (legacy Register).

    loading.value = true
    if (skipDashboard.value) {
      quickRegistering.value = true
    }

    try {
      const captcha = await executeRecaptcha(siteKey.value, 'register')
      const payload: {
        'email': string
        'password'?: string | null
        'g-recaptcha-response'?: string
      } = {
        email: email.value,
        password: step.value === 'set_password' ? password.value : null,
      }
      if (captcha) {
        payload['g-recaptcha-response'] = captcha
      }

      // Pass home default_language so resolveRegisterLanguage third fallback runs.
      const data = await session.register(payload, {
        defaultLanguage: session.home?.app?.default_language,
      })

      if (isRegisterIntermediate(data)) {
        if (data.set_password === true) {
          step.value = 'set_password'
          quickRegistering.value = false
          return
        }
        if (data.verify_email === true) {
          verificationCodeSent.value = true
          step.value = 'verify_email'
          quickRegistering.value = false
          return
        }
        return
      }

      // The badge is hidden before the redirect-URL branch, `after-login` fires last and not for that branch.
      hideRecaptchaBadge()
      const followsApiRedirect = resolveAfterRegisterRedirect(data) !== null
      await handleRegisterSuccess(data)
      if (!followsApiRedirect) {
        emitAppEvent('after-login')
      }
    } catch (error) {
      if (isEmailAlreadyRegistered(error)) {
        alreadyRegisteredError.value = true
      }
      errors.value = getErrorMessages(error)
      quickRegistering.value = false
    } finally {
      if (skipDashboard.value) {
        loading.value = false
      } else {
        loading.value = false
        quickRegistering.value = false
      }
    }
  }

  async function autoSubmitIfEmailKnown () {
    const autoEmail = resolveAutoCompleteEmail(props.predefinedEmail, route.query.email)
    if (!autoEmail || autoSubmitStarted.value) {
      return
    }
    autoSubmitStarted.value = true
    email.value = autoEmail
    quickRegistering.value = true
    await nextTick()
    await submitRegister({ skipFormValidate: true })
  }

  onMounted(async () => {
    const autoEmail = resolveAutoCompleteEmail(props.predefinedEmail, route.query.email)
    if (autoEmail) {
      email.value = autoEmail
    }

    try {
      await session.ensureHome()
    } catch {
      // home may be unavailable offline
    }

    // Mount order, as in legacy: CP upgrade first, then the
    // registration_enabled gate, then new-site / new-import.
    const cpPersist = persistControlPanelUpgradeQuery(
      route.query as Record<string, unknown>,
    )
    if (cpPersist.controlPanelUpgrade) {
      skipDashboard.value = true
      if (autoEmail) {
        quickRegistering.value = true
      }
      await loadRecaptchaScript(siteKey.value)
      await autoSubmitIfEmailKnown()
      return
    }

    if (!session.home?.app?.registration_enabled) {
      await router.push({ path: '/login' })
      return
    }

    const persist = persistNewSiteQuery(
      route.query as Record<string, unknown>,
    )
    if (persist.skipDashboard) {
      skipDashboard.value = true
    }

    if (autoEmail) {
      quickRegistering.value = true
    }

    await loadRecaptchaScript(siteKey.value)
    await autoSubmitIfEmailKnown()
  })
</script>

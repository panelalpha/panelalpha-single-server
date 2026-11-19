<template>
  <AuthCard
    :title="t('heading.loginPage.emailVerification.title')"
    title-tag="h2"
    wide
  >
    <template v-if="errors.length > 0">
      <AuthMessage
        v-for="(error, index) in errors"
        :key="`verify-err-${index}`"
        class="mb-6"
        data-testid="auth-error"
        role="alert"
        :title="error"
        variant="error"
      />
    </template>

    <div class="text--heading text-center p-4 mb-8">
      {{ t('heading.loginPage.emailVerification.info1') }}
      <b>{{ email }}</b>
      {{ t('heading.loginPage.emailVerification.info2') }}
    </div>

    <v-form
      class="form"
      @submit.prevent
    >
      <div
        class="four-digit-input"
        data-testid="auth-code-cells"
        dir="ltr"
      >
        <v-text-field
          v-for="(_, index) in digits"
          :key="index"
          ref="digitInputs"
          v-model="digits[index]"
          autocomplete="one-time-code"
          class="four-digit-input__cell"
          :error="errors.length > 0"
          flat
          hide-details="auto"
          inputmode="numeric"
          maxlength="1"
          variant="outlined"
          @keydown.delete="onDigitDelete(index, $event)"
          @keydown.enter.prevent
          @keypress="allowOnlyNumbers"
          @update:model-value="onDigitInput(index)"
        />
      </div>
    </v-form>

    <AppButton
      block
      data-testid="auth-submit"
      :disabled="!codeComplete"
      kind="primary"
      :loading="loading"
      size="large"
      :variant="codeComplete ? 'flat' : 'outlined'"
      @click.prevent="submitVerify"
    >
      <span class="font-weight-600">{{ t('heading.loginPage.emailVerification.confirmEmailAddress') }}</span>

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
      :color="resendWait ? undefined : 'primary'"
      data-testid="auth-secondary"
      :disabled="resendWait"
      kind="secondary"
      :loading="loading"
      size="large"
      @click.prevent="resendCode"
    >
      <span
        class="font-weight-bold"
        data-testid="auth-secondary-label"
        :style="resendWait ? resendWaitLabelStyle : undefined"
      >
        {{ resendLabel }}
      </span>
    </AppButton>

    <div class="p-4 mt-4 text-center">
      {{ t('heading.loginPage.emailVerification.info3') }}
    </div>

    <template #bottom>
      {{ t('heading.loginPage.emailVerification.questions.title') }}
      <a
        class="ml-1 mr-1"
        data-testid="auth-bottom-link"
        :href="supportLink ?? undefined"
        rel="noopener noreferrer"
        target="_blank"
      >
        {{ t('heading.loginPage.emailVerification.questions.link') }}
      </a>
    </template>
  </AuthCard>
</template>

<script lang="ts" setup>
  import type { ComponentPublicInstance } from 'vue'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
  import { getErrorMessages } from '@/shared/api/error-message'
  import { emit as emitAppEvent } from '@/shared/events/app-events'
  import {
    isLoginIntermediate,
    type LoginResponse,
  } from '@/shared/session/session.api'
  import { useSessionStore } from '@/shared/session/session.store'
  import AuthCard from '@/shared/ui/auth-frame/AuthCard.vue'
  import AuthMessage from '@/shared/ui/auth-message/AuthMessage.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import {
    isFourDigitCodeComplete,
    joinFourDigitCode,
    sanitizeDigitInput,
  } from './login/four-digit-code'
  import { hideRecaptchaBadge } from './login/recaptcha'
  import { resolveVerifyEmailOutcome, type VerifyEmailOutcome } from './login/verify-email-outcome'

  const props = withDefaults(defineProps<{
    email: string
    codeSent?: boolean
    registering?: boolean
    skipDashboard?: boolean
  }>(), {
    codeSent: false,
    registering: true,
    skipDashboard: false,
  })

  const emit = defineEmits<{
    verified: [data: LoginResponse, outcome: VerifyEmailOutcome]
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()

  const digits = reactive(['', '', '', ''])
  const digitInputs = ref<ComponentPublicInstance[]>([])
  const loading = ref(false)
  // Legacy wait button span: inline `color: var(--v-gray-lighten2)`. `!important` and the text-fill
  // colour beat the global disabled-outlined label rule (`_buttons.scss`), which legacy app does not have.
  // The `!important` is legacy's own (inline style); removing it is deferred.
  const resendWaitLabelStyle = {
    'color': 'var(--v-gray-lighten2) !important',
    '-webkit-text-fill-color': 'var(--v-gray-lighten2) !important',
  }
  // Latched after a successful verify, so the button cannot resubmit while the parent signs in and navigates.
  let verified = false
  const errors = ref<string[]>([])
  const resendWait = ref(false)
  const secondsLeft = ref(60)
  // Legacy (Vue 2) keeps one space either side of the interpolation (`<span> {{ $t(...) }} </span>`) and the button content is
  // `white-space: break-spaces` (`_buttons.scss`), so the span box is two spaces wider. Vue 3 trims them, hence explicit here.
  const resendLabel = computed(() => ` ${resendWait.value
    ? t('heading.loginPage.emailVerification.resendCodeMessage', { seconds: secondsLeft.value })
    : t('button.resentCode')} `)
  let resendTimer: ReturnType<typeof setInterval> | null = null
  let unmounted = false

  const codeComplete = computed(() => isFourDigitCodeComplete(digits))

  const supportLink = computed(() => {
    const link = session.home?.app?.support_link
    return typeof link === 'string' && link.length > 0 ? link : null
  })

  function focusDigit (index: number) {
    const el = digitInputs.value[index]
    const input = el?.$el?.querySelector?.('input') as HTMLInputElement | undefined
    input?.focus()
  }

  function allowOnlyNumbers (event: KeyboardEvent) {
    if (!/^\d$/.test(event.key)) {
      event.preventDefault()
    }
  }

  function onDigitInput (index: number) {
    digits[index] = sanitizeDigitInput(digits[index])
    if (digits[index] && index < 3) {
      void nextTick(() => focusDigit(index + 1))
    }
  }

  function onDigitDelete (index: number, event: KeyboardEvent) {
    if (!digits[index] && index > 0) {
      event.preventDefault()
      digits[index - 1] = ''
      void nextTick(() => focusDigit(index - 1))
    }
  }

  function startResendWait () {
    secondsLeft.value = 60
    resendWait.value = true
    if (resendTimer) {
      clearInterval(resendTimer)
    }
    resendTimer = setInterval(() => {
      if (secondsLeft.value > 0) {
        secondsLeft.value -= 1
      } else {
        resendWait.value = false
        if (resendTimer) {
          clearInterval(resendTimer)
          resendTimer = null
        }
      }
    }, 1000)
  }

  async function submitVerify () {
    if (loading.value) {
      return
    }
    // Legacy also verifies an incomplete code (Enter) and shows the API 422; errors are replaced, not cleared.
    loading.value = true
    try {
      const code = joinFourDigitCode(digits)
      const data = await session.verifyEmailCode(code)
      if (isLoginIntermediate(data) && data.verify_email) {
        return
      }
      verified = true
      // Hide the badge, then `after-login` only when this is the register flow.
      hideRecaptchaBadge()
      if (props.registering) {
        emitAppEvent('after-login')
      }
      emit('verified', data, resolveVerifyEmailOutcome({
        registering: props.registering,
        skipDashboard: props.skipDashboard,
      }))
    } catch (error) {
      errors.value = getErrorMessages(error)
    } finally {
      if (!verified) {
        loading.value = false
      }
    }
  }

  async function resendCode () {
    if (resendWait.value || loading.value) {
      return
    }
    loading.value = true
    try {
      await session.resendVerificationCode()
    } catch (error) {
      errors.value = getErrorMessages(error)
    } finally {
      loading.value = false
      // Legacy starts the wait after a failed resend too.
      // Not after unmount: the interval would never be cleared.
      if (!unmounted) {
        startResendWait()
      }
    }
  }

  function onEnterKey (event: KeyboardEvent) {
    if (event.code === 'Enter' || event.code === 'NumpadEnter') {
      void submitVerify()
    }
  }

  onMounted(() => {
    document.addEventListener('keyup', onEnterKey)
    if (props.codeSent) {
      startResendWait()
    }
    void nextTick(() => focusDigit(0))
  })

  onBeforeUnmount(() => {
    unmounted = true
    document.removeEventListener('keyup', onEnterKey)
    if (resendTimer) {
      clearInterval(resendTimer)
      resendTimer = null
    }
  })
</script>

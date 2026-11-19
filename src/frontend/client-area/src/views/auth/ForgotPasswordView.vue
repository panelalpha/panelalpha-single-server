<template>
  <AuthFrame>
    <AuthCard :title="t('heading.forgotPasswordPage.title')">
      <!-- Legacy `@submit.prevent` has no handler: Enter is handled by `@keydown.enter` on the field only.
             `.prevent` there cancels the browser's implicit submit: V4 `v-form` validates on every native submit and would
             flag the already emptied field ("Email is required"); V2 `v-form` never validated on submit. -->
      <v-form
        ref="form"
        @submit.prevent
      >
        <EmailField
          v-model="email"
          autocomplete="email"
          data-testid="auth-field-email"
          :label="t('form.label.emailAddress')"
          name="email"
          :rules="emailRules"
          @keydown.enter.prevent="sendPasswordResetLink"
        />

        <AppButton
          block
          class="forgot-password-btn mt-6"
          data-testid="auth-submit"
          kind="primary"
          size="large"
          type="button"
          @click="sendPasswordResetLink"
        >
          <!-- Legacy Vue 2 kept the template's trailing space; `.v-btn__content` is `break-spaces`, so it shifts the label 2px. -->
          {{ `${t('button.resetPasswordSend')} ` }}
        </AppButton>
      </v-form>

      <div class="d-flex justify-center mt-6">
        <p data-testid="auth-bottom-text">
          {{ t('message.falseAlert') }}
          <a
            class="href"
            data-testid="auth-bottom-link"
            href="/login"
            @click.prevent="router.push({ path: '/login' })"
          >{{ t('button.signIn') }}</a>
        </p>
      </div>
    </AuthCard>
  </AuthFrame>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { type ForgotPasswordResult, resolveForgotPasswordAlert } from '@/views/auth/login/forgot-password-outcome'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { forgotPassword } from '@/shared/session/session.api'
  import { useSessionStore } from '@/shared/session/session.store'
  import AuthCard from '@/shared/ui/auth-frame/AuthCard.vue'
  import AuthFrame from '@/shared/ui/auth-frame/AuthFrame.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import EmailField from '@/shared/ui/form/EmailField.vue'
  import { useFormRules } from '@/shared/ui/form/use-form-rules'

  const { t } = useTranslation()
  const router = useRouter()
  const session = useSessionStore()
  const alerts = useAlertsStore()

  const form = ref<{
    validate: () => Promise<{ valid: boolean }>
    resetValidation: () => void
  } | null>(null)
  const { emailRules } = useFormRules()

  const email = ref('')

  async function sendPasswordResetLink () {
    const current = form.value
    if (current) {
      const { valid } = await current.validate()
      if (!valid) {
        return
      }
    }

    // Started, not awaited: the field is cleared before the response and the alert is added when the request settles.
    // Neither handler rejects: a failure becomes `{ ok: false }` and the outcome module decides what (if anything) to show.
    forgotPassword(email.value)
      .then(
        (data): ForgotPasswordResult => ({ ok: true, data }),
        (error: unknown): ForgotPasswordResult => ({ ok: false, error }),
      )
      .then(result => {
        const payload = resolveForgotPasswordAlert(result)
        if (payload) {
          alerts.addAlert(payload)
        }
      })

    // Legacy clears the field synchronously right after starting the request.
    email.value = ''
    // V4 re-validates on the model change; legacy shows no message under the emptied field.
    form.value?.resetValidation()
  }

  onMounted(async () => {
    try {
      await session.ensureHome()
    } catch {
      // home may be unavailable offline
    }
  })
</script>

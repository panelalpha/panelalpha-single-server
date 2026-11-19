<template>
  <AuthFrame>
    <AuthCard :title="t('heading.resetPasswordPage.title')">
      <!-- Legacy form has two fields and no submit button, and the button sits after it: Enter submits nothing. -->
      <v-form
        class="form"
        @submit.prevent
      >
        <PasswordField
          v-model="password"
          data-testid="auth-field-password"
          :label="t('form.placeholder.passwordNew')"
          :rules="policyPasswordRules"
        />

        <PasswordField
          v-model="passwordConfirmation"
          data-testid="auth-field-password-confirm"
          :label="t('form.label.passwordConfirm')"
          :rules="policyPasswordRules"
        />
      </v-form>

      <AppButton
        block
        class="mt-6"
        data-testid="auth-submit"
        kind="primary"
        size="x-large"
        type="button"
        @click="resetPasswordClick"
      >
        {{ t('button.resetPassword') }}
      </AppButton>
    </AuthCard>
  </AuthFrame>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { submitResetPassword } from '@/views/auth/login/reset-password-flow'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { resetPassword } from '@/shared/session/session.api'
  import AuthCard from '@/shared/ui/auth-frame/AuthCard.vue'
  import AuthFrame from '@/shared/ui/auth-frame/AuthFrame.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PasswordField from '@/shared/ui/form/PasswordField.vue'
  import { useFormRules } from '@/shared/ui/form/use-form-rules'

  const { t } = useTranslation()
  const route = useRoute()
  const router = useRouter()
  const alerts = useAlertsStore()
  const { policyPasswordRules } = useFormRules()

  const password = ref('')
  const passwordConfirmation = ref('')

  // Legacy sends whatever is in the fields: no `validate()`, no equality check, no loading state, no guard against a second click.
  // `token` / `email` are the raw query values; the flow is started, not awaited, and never rejects.
  function resetPasswordClick () {
    void submitResetPassword({
      reset: () => resetPassword({
        token: route.query.token,
        email: route.query.email,
        password: password.value,
        password_confirmation: passwordConfirmation.value,
      }),
      addAlert: payload => alerts.addAlert(payload),
      navigate: to => router.push(to),
    })
  }
</script>

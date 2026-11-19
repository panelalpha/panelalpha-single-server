<template>
  <!-- While the invitation is checked nothing is rendered, radio-lines included. -->
  <AuthFrame v-if="!inviteLoading">
    <AuthCard
      v-if="inviteError"
      :title="t('heading.acceptInvitePage.error.title')"
    >
      <div data-testid="accept-invite-info">
        {{ t('heading.acceptInvitePage.error.info') }}
      </div>
    </AuthCard>

    <AuthCard
      v-else-if="passwordRequired"
      :title="t('heading.acceptInvitePage.password.title')"
      title-tag="h5"
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
            <SupportLink
              v-if="supportLink"
              :href="supportLink"
            />
          </AuthMessage>
        </CollapseTransitions>
      </template>

      <!-- Legacy form has two fields and no submit button, and the button sits after it: Enter submits nothing. -->
      <v-form
        ref="form"
        class="form"
        @submit.prevent
      >
        <PasswordField
          v-model="password"
          data-testid="auth-field-password"
          :label="t('form.label.password')"
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
        :loading="loading"
        size="x-large"
        type="button"
        @click="register"
      >
        <span class="font-weight-600">{{ t('button.register') }}</span>

        <template #loader>
          <Loader
            color="white"
            :size="24"
          />
        </template>
      </AppButton>
    </AuthCard>
  </AuthFrame>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { runAcceptInviteFlow, submitInvitePassword } from '@/views/auth/accept-invite/accept-invite-flow'
  import { acceptInvitation } from '@/shared/session/session.api'
  import { useSessionStore } from '@/shared/session/session.store'
  import AuthCard from '@/shared/ui/auth-frame/AuthCard.vue'
  import AuthFrame from '@/shared/ui/auth-frame/AuthFrame.vue'
  import SupportLink from '@/shared/ui/auth-frame/SupportLink.vue'
  import AuthMessage from '@/shared/ui/auth-message/AuthMessage.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PasswordField from '@/shared/ui/form/PasswordField.vue'
  import { useFormRules } from '@/shared/ui/form/use-form-rules'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import CollapseTransitions from '@/shared/ui/transitions/CollapseTransitions.vue'

  const { t } = useTranslation()
  const route = useRoute()
  const router = useRouter()
  const session = useSessionStore()

  // Legacy keeps `$route.query.token` as is: a missing or array token reaches the backend unchanged.
  const token = route.query.token

  const form = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
  const { policyPasswordRules } = useFormRules()

  const password = ref('')
  const passwordConfirmation = ref('')
  const errors = ref<string[]>([])
  const loading = ref(false)

  const supportLink = computed(() => {
    const link = session.home?.app?.support_link
    return typeof link === 'string' && link.length > 0 ? link : null
  })

  const inviteLoading = ref(true)
  const inviteError = ref(false)
  const passwordRequired = ref(false)

  onMounted(async () => {
    try {
      const outcome = await runAcceptInviteFlow({
        accept: () => acceptInvitation(token),
        navigate: to => router.push(to),
        token,
      })
      inviteError.value = outcome === 'error'
      passwordRequired.value = outcome === 'password'
    } finally {
      inviteLoading.value = false
    }
  })

  // Intentionally no password === passwordConfirmation client check (legacy has none).
  async function register () {
    const { valid } = (await form.value?.validate()) ?? { valid: true }
    if (!valid) {
      return
    }

    loading.value = true
    try {
      const { error } = await submitInvitePassword({
        submit: () => acceptInvitation(token, {
          password: password.value,
          password_confirmation: passwordConfirmation.value,
        }),
        navigate: to => router.push(to),
      })
      if (error !== null) {
        errors.value = [error]
      }
    } finally {
      loading.value = false
    }
  }
</script>

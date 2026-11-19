<template>
  <AuthFrame>
    <AuthCard
      :title="failed ? t('button.logIn') : t('button.signInWithPanelAlpha')"
      title-tag="h5"
    >
      <div class="text-center">
        <template v-if="failed">
          <p
            class="p-2 mb-6"
            data-testid="hub-login-invalid"
          >
            {{ t('heading.hubLoginPage.invalid') }}
          </p>

          <AppButton
            block
            data-testid="auth-submit"
            kind="primary"
            size="large"
            to="/login"
          >
            <span class="font-weight-600">{{ t('button.logIn') }}</span>
          </AppButton>
        </template>

        <Loader
          v-else
          color="primary"
          :size="48"
        />
      </div>
    </AuthCard>
  </AuthFrame>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { useRouter } from 'vue-router'
  import { preferredSpaBase } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import AuthCard from '@/shared/ui/auth-frame/AuthCard.vue'
  import AuthFrame from '@/shared/ui/auth-frame/AuthFrame.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'

  // The ticket is exchanged before the app starts (here: in the router guard); this screen only
  // shows the result. Like legacy `data()`, `failed` is read once and is not reactive; `?redirect` is ignored, the
  // exchange's own destination (a ticket for one app) is followed.
  const { t } = useTranslation()
  const router = useRouter()
  const session = useSessionStore()

  const failed = session.hubLoginFailed || !session.user

  if (!failed) {
    void router.replace({ path: session.hubLoginDestination ?? preferredSpaBase(session.home) })
  }
</script>

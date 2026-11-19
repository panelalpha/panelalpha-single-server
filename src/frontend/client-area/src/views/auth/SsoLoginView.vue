<template>
  <v-app v-if="failed">
    <ErrorPage />
  </v-app>

  <template v-else>
    {{ SSO_PENDING_TEXT }}
  </template>
</template>

<script lang="ts" setup>
  import { onUnmounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { runSsoLoginFlow, SSO_PENDING_TEXT } from '@/views/auth/sso/sso-login-flow'
  import { useSessionStore } from '@/shared/session/session.store'
  import ErrorPage from '@/shared/ui/error-page/ErrorPage.vue'

  const session = useSessionStore()
  const route = useRoute()
  const router = useRouter()
  const failed = ref(false)

  // Bare text in #app: `data-pre-mount` resets the font to what legacy's text gets before Vue mounts.
  const appRoot = document.querySelector('#app')
  appRoot?.setAttribute('data-pre-mount', '')
  onUnmounted(() => appRoot?.removeAttribute('data-pre-mount'))

  // Started once here, not in onMounted or the guard: the POST must go out before anything else.
  const token = new URLSearchParams(window.location.search).get('token')
  void runSsoLoginFlow({
    exchange: () => session.ssoLogin(token),
    navigate: to => router.push(to),
    storage: localStorage,
    origin: window.location.origin,
    query: route.query,
  }).then(result => {
    if (result === 'failed') {
      // The error page sits inside v-app, which has its own font, so the pre-mount reset no longer applies.
      appRoot?.removeAttribute('data-pre-mount')
      failed.value = true
    }
  })
</script>

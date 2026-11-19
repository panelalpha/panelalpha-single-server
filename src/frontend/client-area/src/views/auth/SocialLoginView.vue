<template>
  <div />
</template>

<script lang="ts" setup>
  import { useRoute, useRouter } from 'vue-router'
  import { runSocialCallback } from '@/views/auth/login/social-callback-flow'
  import { emit as emitAppEvent } from '@/shared/events/app-events'
  import { useSessionStore } from '@/shared/session/session.store'

  const route = useRoute()
  const router = useRouter()
  const session = useSessionStore()

  void runSocialCallback({
    provider: String(route.params.provider),
    stateParam: route.query.state,
    href: window.location.href,
    replaceLocation: url => window.location.replace(url),
    socialLogin: provider => session.socialLogin(provider, window.location.search),
    emitAfterLogin: () => emitAppEvent('after-login'),
    navigate: destination => router.push(destination),
  })
</script>

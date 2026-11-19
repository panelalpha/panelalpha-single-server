<template>
  <router-view v-if="route.meta.standalone === true" />

  <v-app
    v-else
    :key="appKey"
    :class="{ 'disable-shadow': themeStore.style.disableShadows, 'has-shell-footer': shellFooter }"
  >
    <AppNavbar v-if="displayNavbar && readyToRender" />
    <NewInstanceFloatingButton v-if="showFloatingButton(displayNavbar, mobile)" />

    <v-main v-if="readyToRender">
      <TrialInfoBox v-if="displayNavbar" />
      <AlertManager />

      <div data-testid="shell-routed-view">
        <router-view />
      </div>

      <div
        v-if="displayNavbar"
        class="mt-10 w-100"
      />
    </v-main>

    <TrialExpiredModal v-model="trialExpiredOpen" />

    <StyleManagerMenu
      v-if="styleManagerRole"
      :reseller="styleManagerRole === 'reseller'"
    />

    <OnboardingModalWrapper />

    <AppFooter
      v-if="shellFooter"
      @language-changed="refreshApp"
    />
  </v-app>
</template>

<script lang="ts" setup>
  import { computed, defineAsyncComponent, onScopeDispose, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import { i18next } from '@/app/i18n'
  import { updateDocumentTitle } from '@/app/router/document-title'
  import OnboardingModalWrapper from '@/views/onboarding/OnboardingModalWrapper.vue'
  import { useOnboardingEvents } from '@/views/onboarding/use-onboarding-events'
  import { useRetryInstall } from '@/views/onboarding/use-retry-install'
  import { resolveStyleManagerRole } from '@/views/style-manager/style-manager-rules'
  import { useAppEvent } from '@/shared/events/app-events'
  import { resolveBootLanguage } from '@/shared/session/resolve-boot-language'
  import { useSessionStore } from '@/shared/session/session.store'
  import { useThemeStore } from '@/shared/theme/theme.store'
  import AlertManager from '@/shared/ui/alerts/AlertManager.vue'
  import { rememberStartLanguage } from '@/shared/ui/language/apply-language'
  import { injectCustomCode } from './shell/app-head'
  import AppFooter from './shell/AppFooter.vue'
  import { onFirstHomeHydration } from './shell/first-hydration'
  import AppNavbar from './shell/navbar/AppNavbar.vue'
  import { showFloatingButton } from './shell/navbar/navbar-rules'
  import NewInstanceFloatingButton from './shell/NewInstanceFloatingButton.vue'
  import { useShellSessionLifecycle } from './shell/session-lifecycle'
  import { useThemeSync } from './shell/theme/theme-sync'
  import { useTrialExpiredModal } from './shell/trial/trial-expired-modal'
  import TrialExpiredModal from './shell/trial/TrialExpiredModal.vue'
  import TrialInfoBox from './shell/trial/TrialInfoBox.vue'

  const route = useRoute()
  // The Style Manager drawer and its editors render for a reseller or an admin only: their own chunk.
  const StyleManagerMenu = defineAsyncComponent(() => import('@/views/style-manager/StyleManagerMenu.vue'))

  const session = useSessionStore()
  const themeStore = useThemeStore()
  const { mobile } = useDisplay()

  // Standalone routes (SSO login) render bare into #app without v-app, like legacy before Vue mounts.
  const displayNavbar = computed(() => route.meta.displayNavbar === true)

  // The footer of the signed-in shell; a route can hide it (`meta.hideShellFooter`: the first-run wizard is a full page of its own).
  const shellFooter = computed(() => !!session.home?.user && route.meta.hideShellFooter !== true)

  // `readyToRender` starts true; `OnboardingModalWrapper` toggles it through `app-ready-to-render`.
  const readyToRender = ref(true)
  useAppEvent('app-ready-to-render', ready => {
    readyToRender.value = ready
  })

  // The footer's language change remounts the whole frame (`key++` on `v-app`). The watchers
  // below live in this setup, outside the keyed `v-app`, so the remount does not run them again.
  const appKey = ref(0)
  function refreshApp () {
    appKey.value += 1
  }

  // Brand theme: `/home` and `localStorage.theme` into `theme.store`, then Vuetify dark mode and the body class from it.
  useThemeSync(() => route.meta.forceLightTheme === true)

  // The Style Manager drawer for a reseller or an admin, nobody else.
  const styleManagerRole = computed(() => resolveStyleManagerRole(session.home))

  // Apply boot language after /home (user.language → default_language → en).
  watch(
    () => session.home,
    home => {
      const lang = resolveBootLanguage(home)
      if (home) {
        // The next cold start loads this translation first (`readStartLanguage` in `i18n.ts`).
        rememberStartLanguage(lang)
      }
      if (lang !== i18next.language) {
        void i18next.changeLanguage(lang)
      }
      updateDocumentTitle(route, home)
    },
    { immediate: true },
  )

  // Custom code on the first `/home` (also on the login screen) ...
  onFirstHomeHydration(() => session.home, home => {
    injectCustomCode(home.app)
  })

  // ... and `TrialExpiredModal.open()` when that first `/home` has an expired trial (cold start only, not after a sign-in).
  const trialExpiredOpen = useTrialExpiredModal(() => session.home)

  // The one shell watcher on `session.user` (outside the keyed `v-app`): notifications load/clear and Echo connect/disconnect.
  useShellSessionLifecycle(() => session.user)

  // Try again of a failed install or import (`OnboardingModalWrapper` is always mounted): one consumer for every source.
  useRetryInstall()

  // The onboarding entry points: Create, Add new, the mobile FAB.
  useOnboardingEvents()

  // Feature screens ask for a tab title refresh after they change its inputs (instance name, app name).
  useAppEvent('document-title-update', () => updateDocumentTitle(route, session.home))

  // Refresh tab title when the active language changes.
  function onLanguageChanged () {
    updateDocumentTitle(route, session.home)
  }
  i18next.on('languageChanged', onLanguageChanged)
  onScopeDispose(() => i18next.off('languageChanged', onLanguageChanged))
</script>

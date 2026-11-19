<template>
  <div v-if="session.user">
    <!-- The blurred backdrop of every onboarding step. -->
    <v-overlay
      class="main-overlay"
      :close-on-back="false"
      :model-value="isOpen"
      persistent
      z-index="1010"
    />

    <!-- The 26 modals are one chunk outside the entry file (perf-onboarding-lazy): mounted when a step opens, kept after that. -->
    <component
      :is="modals"
      v-if="modals"
      :ready-to-render="readyToRender"
      @demo-onboarding-selected="demoOnboardingSelected"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { OnboardingStep } from './onboarding-steps'
  import type { Component, ShallowRef } from 'vue'
  import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
  import { emit as emitAppEvent } from '@/shared/events/app-events'
  import { useSessionStore } from '@/shared/session/session.store'
  import { preloadSocialIcons } from '@/shared/ui/icons/socials/lazy-socials'
  import { clearAutostart, isAutostartEnabled } from './demo'
  import {
    handleModalsLoadFailure,
    loadOnboardingModals,
    prefetchOnboardingModalsWhenIdle,
    shouldMountModals,
  } from './lazy-modals'
  import { useOnboardingFlow } from './onboarding-flow'
  import { availableInstallationTypes, getActiveServices, type OnboardingService } from './onboarding-service'
  import { useOnboardingStore } from './onboarding.store'

  /**
   * Steps `OnboardingModals.vue` renders. A step outside the list closes the flow.
   */
  const RENDERED_STEPS: ReadonlySet<OnboardingStep> = new Set<OnboardingStep>([
    'zero-data',
    'no-type',
    'choose-installation-type',
    'choose-onboarding-process',
    'choose-creation-type',
    'choose-service',
    'deploy-git',
    'go-catalog',
    'env-vars',
    'deploy-zip',
    'import-url',
    'import-method',
    'import-simple',
    'import-advanced',
    'import-setup-complete',
    'limit',
    'choose-template',
    'share-access',
    'user-options',
    'domain',
    'domain-transfer',
    'dns-verify',
    'site-name',
    'standard-form',
    'install-progress',
    'super-quick-progress',
    'sync-progress',
  ])

  const session = useSessionStore()
  const onboarding = useOnboardingStore()
  const flow = useOnboardingFlow()
  const step = computed(() => onboarding.step)
  const isOpen = computed(() => step.value !== null)

  watch(step, current => {
    if (current !== null && !RENDERED_STEPS.has(current)) {
      onboarding.deactivateAll()
    }
  }, { immediate: true })

  // The demo account with the autostart key starts the process choice on load.
  const isAutoStartEnabled = computed(() => isAutostartEnabled(session.user?.email, window.location.origin))
  // The shell hides its navbar while the autostart waits for the choice (`app-ready-to-render`).
  // This stays in the entry file and never waits for the modals chunk, so a demo account's navbar does not flash.
  const readyToRender = ref(true)

  // The modals chunk: fetched when the browser is idle after sign-in, mounted by the first step (or the demo autostart) that needs it.
  const modals = shallowRef<Component | null>(null) as ShallowRef<Component | null>
  let modalsLoading = false

  async function mountModals (): Promise<void> {
    if (modals.value || modalsLoading) {
      return
    }
    modalsLoading = true
    try {
      modals.value = await loadOnboardingModals()
    } catch (error) {
      // No chunk, no modal: the backdrop would stay up with nothing on it, so the flow closes and the shell comes back (a demo autostart
      // had hidden it). The next step that opens tries the chunk again.
      handleModalsLoadFailure(error, () => {
        onboarding.deactivateAll()
        setReadyToRender(true)
      })
    } finally {
      modalsLoading = false
    }
  }

  // Also depends on `step`: with the demo autostart the gate stays on, so a later step is what triggers the retry after a failed load.
  watch(
    () => [shouldMountModals({ step: step.value, sshClosingOpen: onboarding.sshClosingOpen, autostart: isAutoStartEnabled.value }), step.value] as const,
    ([mount]) => {
      if (mount) {
        void mountModals()
      }
    },
    { immediate: true },
  )

  // The "git" card draws the GitHub logo, a separate chunk: fetch it as soon as the card can exist, long before
  // the modal opens, so the card never renders without it. It stays here, not in the modal: the modals chunk mounts with the first step.
  const hasGitType = computed(() => availableInstallationTypes(getActiveServices(session.services as OnboardingService[])).includes('git'))
  watch(hasGitType, hasGit => {
    if (hasGit) {
      void preloadSocialIcons(['github'])
    }
  }, { immediate: true })

  watch(() => session.user != null, signedIn => {
    if (signedIn) {
      prefetchOnboardingModalsWhenIdle()
    }
  }, { immediate: true })

  function setReadyToRender (ready: boolean): void {
    readyToRender.value = ready
    emitAppEvent('app-ready-to-render', ready)
  }

  /** On autostart: the shell hides, then the process choice opens. */
  function startAutostart (): void {
    setReadyToRender(false)
    flow.startDemoProcess()
  }

  /** The shell comes back and the autostart key goes, then the flow goes on. */
  function demoOnboardingSelected (classic: boolean): void {
    setReadyToRender(true)
    clearAutostart(window.location.origin)
    flow.demoOnboardingSelected(classic)
  }

  watch(isAutoStartEnabled, enabled => {
    if (enabled) {
      startAutostart()
      return
    }
    setReadyToRender(true)
  })

  // `overflow-y-hidden` is set on `<html>` after 300 ms and removed 150 ms after the close.
  let scrollClassTimer: ReturnType<typeof setTimeout> | undefined
  watch(isOpen, open => {
    clearTimeout(scrollClassTimer)
    scrollClassTimer = setTimeout(() => {
      document.documentElement.classList.toggle('overflow-y-hidden', open)
    }, open ? 300 : 150)
  })

  // Leaving while a request of the flow runs asks first. A files
  // project's archive is uploaded by this browser once its domain exists: leaving before that upload is done would leave the project waiting
  // for its files for ever, so that window asks too.
  function handleBeforeUnload (event: BeforeUnloadEvent): string | undefined {
    if (!onboarding.submitting && !onboarding.filesArchiveUploadPending) {
      return undefined
    }
    const message = onboarding.filesArchiveUploadPending
      ? 'Your project files are still uploading. Leaving the page now would leave the project without them.'
      : 'Installation is in progress. Leaving the page may cause the process to fail.'
    event.returnValue = message
    return message
  }

  onMounted(() => {
    window.addEventListener('beforeunload', handleBeforeUnload)
    if (isAutoStartEnabled.value) {
      startAutostart()
    }
  })
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    // Sign-out or the language remount unmounts the wrapper: no pending class toggle, no class left on `<html>`.
    clearTimeout(scrollClassTimer)
    document.documentElement.classList.remove('overflow-y-hidden')
  })
</script>

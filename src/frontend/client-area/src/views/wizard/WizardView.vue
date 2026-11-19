<template>
  <v-theme-provider
    class="wizard-root"
    data-testid="wizard-root"
    theme="light"
    with-background
  >
    <WizardStartPage v-if="step < 0" />

    <WizardLayout
      v-else
      :current-step="step"
      :max-step="wizard.maxStep"
      @go-to-step="goToStep"
    >
      <PanelAlphaConnectStep v-if="slug === 'panelalpha-connect'" />

      <GeneralConfigStep v-else-if="slug === 'general-config'" />

      <ConnectAiStep v-else-if="slug === 'connect-ai'" />

      <SummaryStep v-else-if="slug === 'summary'" />
    </WizardLayout>
  </v-theme-provider>
</template>

<script lang="ts" setup>
  import { computed, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { useSessionStore } from '@/shared/session/session.store'
  import ConnectAiStep from './steps/ConnectAiStep.vue'
  import GeneralConfigStep from './steps/GeneralConfigStep.vue'
  import PanelAlphaConnectStep from './steps/PanelAlphaConnectStep.vue'
  import SummaryStep from './steps/SummaryStep.vue'
  import { canOpenStep, isSetupDone, pathOfStep, stepFromPath, WIZARD_STEPS } from './wizard-steps'
  import { useWizardStore } from './wizard.store'
  import WizardLayout from './WizardLayout.vue'
  import WizardStartPage from './WizardStartPage.vue'

  // The start page (`/wizard`) or the sidebar with the step the URL names. The five routes
  // of the wizard share this view, so the furthest step reached (`wizard.maxStep`) survives a move between them. A link to a step makes
  // it the furthest one; whether the visit may open it at all is decided by the router guard.
  const route = useRoute()
  const router = useRouter()
  const wizard = useWizardStore()
  const session = useSessionStore()

  const step = computed(() => stepFromPath(route.path))
  const slug = computed(() => WIZARD_STEPS[step.value]?.slug)

  watch(step, index => {
    if (index >= 0) {
      wizard.reach(index)
    }
  }, { immediate: true })

  function goToStep (index: number): void {
    const setupDone = isSetupDone(Boolean(session.user), session.home?.app?.setup_required)
    if (index !== step.value && canOpenStep(index, wizard.maxStep, { setupDone })) {
      void router.push(pathOfStep(index)).then(() => window.scrollTo(0, 0))
    }
  }
</script>

<style lang="scss" scoped>
  // Always light (the admin area has no dark mode): the root takes the page colour of the wizard from the tokens, whatever the global theme
  // is. The font is the one of the app (Nunito Sans, as in admin area).
  .wizard-root {
    min-height: 100vh;
    background: var(--v-wizard-bg);
  }
</style>

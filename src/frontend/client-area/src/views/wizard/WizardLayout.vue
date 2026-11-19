<template>
  <div
    class="wizard-layout"
    data-testid="wizard-layout"
  >
    <WizardSidebar
      :current-step="currentStep"
      :max-step="maxStep"
      @go-to-step="emit('go-to-step', $event)"
    />

    <div class="wizard-layout__content">
      <slot />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import WizardSidebar from './WizardSidebar.vue'

  // The sidebar and the step, side by side on the full page.
  defineProps<{
    currentStep: number
    maxStep: number
  }>()

  const emit = defineEmits<{ 'go-to-step': [index: number] }>()
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  .wizard-layout {
    // The frame of `FeatureCard` in the palette of admin area (the wizard is always light).
    --v-feature-card-border: var(--v-wizard-hub-card-border);
    --v-feature-card-bg: var(--v-wizard-bg);
    --v-feature-card-ring: var(--v-wizard-bg);
    --v-feature-card-title: var(--v-wizard-title);
    --v-feature-card-lead: var(--v-wizard-desc);
    --v-feature-card-checks-text: var(--v-wizard-checker-text);
    --v-feature-card-accent: var(--v-wizard-accent);
    --v-feature-card-flag-bg: var(--v-wizard-flag-bg);
    --v-feature-card-ok-border: var(--v-wizard-hub-ok-border);
    --v-feature-card-ok-bg: var(--v-wizard-hub-ok-bg);
    --v-feature-card-busy-border: var(--v-wizard-hub-border);
    --v-feature-card-diagram-bg: var(--v-wizard-diagram-bg);
    --v-feature-card-diagram-radius: var(--v-wizard-radius);
    --v-feature-card-radius: var(--v-wizard-radius-lg);

    display: flex;
    min-height: 100vh;

    // Below `md` the sidebar is a bar over the step (`flex-column` under 490px).
    @media (max-width: map.get(v.$grid-breakpoints, md) - 0.02px) {
      flex-direction: column;
    }
  }

  // `d-flex align-center justify-center flex-grow-1` with `overflow-x: hidden`.
  .wizard-layout__content {
    display: flex;
    flex-grow: 1;
    align-items: center;
    justify-content: center;
    min-width: 0;
    overflow-x: hidden;
  }
</style>

<template>
  <section
    class="wizard-step-frame"
    :data-testid="`wizard-step-frame-${step}`"
  >
    <div class="wizard-step-frame__body">
      <div class="wizard-step-frame__head">
        <span
          aria-hidden="true"
          class="wizard-step-frame__indicator"
        >
          {{ step }}
          <slot name="indicator" />
        </span>

        <h2
          class="wizard-step-frame__title"
          data-testid="wizard-step-title"
        >
          {{ title }}
        </h2>

        <p
          v-if="description || $slots.description"
          class="wizard-step-frame__description"
          :class="{ 'wizard-step-frame__description--narrow': narrowDescription }"
        >
          <slot name="description">
            {{ description }}
          </slot>
        </p>
      </div>

      <slot />
    </div>

    <slot name="footer" />

    <!-- The language footer is the last row of the step, in the flow, aligned right (`WizardLanguage.vue`). -->
    <WizardLanguage />
  </section>
</template>

<script lang="ts" setup>
  import WizardLanguage from './WizardLanguage.vue'

  // Container of one step: the number circle left of the title, the title and its description,
  // then the content of the step. The footer with the buttons (`WizardFooter`) goes in the `footer` slot, below the body, so it stays at the
  // bottom of the page when the content is short (`margin-top: auto` of the actions row). The `indicator` slot sits
  // inside the number circle (the confetti of the last step); the `description` slot takes a description with a link.
  defineProps<{
    /** Number of the step, from 1. */
    step: number
    title: string
    description?: string
    /** The description wraps at 640px. */
    narrowDescription?: boolean
  }>()
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  // Breakpoints of next instead of the 1140px, 768px and 490px of the source.
  $below-lg: map.get(v.$grid-breakpoints, lg) - 0.02px;
  $below-md: map.get(v.$grid-breakpoints, md) - 0.02px;
  $below-sm: map.get(v.$grid-breakpoints, sm) - 0.02px;

  .wizard-step-frame {
    position: relative;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: 1008px;
    max-width: 100%;
    min-height: 100vh;

    // The bar of the steps (80px) is above the step.
    @media (max-width: $below-md) {
      min-height: calc(100vh - 80px);
    }
  }

  // The step container is 1008px wide, 64px above and below, 80px on the left (the 1440px window); the content is centred in the space
  // the footer leaves.
  .wizard-step-frame__body {
    display: flex;
    flex-grow: 1;
    flex-direction: column;
    justify-content: center;
    padding: 64px 24px 64px 80px;

    // The rail has no room for the circle left of the title, so the padding on the left is the one of the right.
    @media (max-width: $below-lg) {
      padding-left: 24px;
    }

    @media (max-width: $below-sm) {
      justify-content: flex-start;
    }
  }

  .wizard-step-frame__head {
    position: relative;
    margin-bottom: 36px;
  }

  // The step indicator is a 32px circle that hangs 56px left of the title.
  .wizard-step-frame__indicator {
    position: absolute;
    top: 8px;
    left: -56px;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgb(var(--v-theme-primary));
    color: var(--v-white-base);
    font-size: v.$font-size-sm;
    line-height: 32px;
    font-weight: v.$font-weight-bold;
    text-align: center;

    @media (max-width: $below-lg) {
      display: none;
    }
  }

  // The title is 26/32/700 up to 1600px.
  .wizard-step-frame__title {
    margin: 0;
    color: var(--v-wizard-title);
    font-size: v.$font-size-h3;
    line-height: v.$line-height-h3;
    font-weight: v.$font-weight-bold;
    text-wrap: balance;
  }

  // The description is 24px under the title; the 36px below is the margin of the head.
  .wizard-step-frame__description {
    margin: 24px 0 0;
    color: var(--v-wizard-desc);
    font-size: v.$font-size-base;
    line-height: 26px;
    text-wrap: pretty;
  }

  .wizard-step-frame__description--narrow {
    max-width: 640px;
  }
</style>

<template>
  <aside
    class="wizard-sidebar"
    data-testid="wizard-sidebar"
  >
    <div class="wizard-sidebar__inner">
      <img
        alt="PanelAlpha"
        class="wizard-sidebar__logo"
        height="47"
        :src="logoUrl"
        width="213"
      >

      <img
        alt=""
        aria-hidden="true"
        class="wizard-sidebar__logo wizard-sidebar__logo--short"
        height="56"
        :src="logoShortUrl"
        width="56"
      >

      <img
        alt=""
        aria-hidden="true"
        class="wizard-sidebar__logo wizard-sidebar__logo--bar"
        height="40"
        :src="logoShortSmUrl"
        width="40"
      >

      <nav :aria-label="t('setup.wizard.steps.label', { defaultValue: 'Setup steps' })">
        <ol class="wizard-steps">
          <li
            v-for="(step, index) in WIZARD_STEPS"
            :key="step.slug"
          >
            <button
              :aria-current="currentStep === index ? 'step' : undefined"
              :aria-describedby="isStepClosedBySetup(index, access) ? CLOSED_HINT_ID : undefined"
              :aria-disabled="!canOpenStep(index, maxStep, access)"
              class="wizard-step"
              :class="{
                'wizard-step--active': currentStep === index,
                'wizard-step--completed': stepState(index, maxStep) === 'completed',
                'wizard-step--current': stepState(index, maxStep) === 'current',
                'wizard-step--locked': !canOpenStep(index, maxStep, access),
              }"
              :data-testid="`wizard-step-${step.slug}`"
              type="button"
              @click="open(index)"
            >
              <span class="wizard-step__number">
                <FeatureCheckIcon
                  v-if="index < maxStep"
                  class="wizard-step__check"
                />

                <template v-else>{{ index + 1 }}</template>
              </span>

              <span class="wizard-step__name">{{ t(step.labelKey, { defaultValue: step.defaultLabel }) }}</span>

              <v-tooltip
                v-if="isStepClosedBySetup(index, access)"
                activator="parent"
                close-delay="150"
                location="bottom"
                max-width="360"
                open-delay="150"
                :text="closedHint"
              />
            </button>

            <!-- The reason for a screen reader, read with the button (the tooltip is for the pointer and the keyboard focus). -->
            <span
              v-if="isStepClosedBySetup(index, access)"
              :id="CLOSED_HINT_ID"
              hidden
            >
              {{ closedHint }}
            </span>
          </li>
        </ol>
      </nav>

      <img
        alt=""
        aria-hidden="true"
        class="wizard-sidebar__illustration wizard-sidebar__illustration--large"
        height="320"
        :src="sidebarIllustrationUrl"
        width="280"
      >

      <img
        alt=""
        aria-hidden="true"
        class="wizard-sidebar__illustration wizard-sidebar__illustration--small"
        height="220"
        :src="sidebarIllustrationSmallUrl"
        width="190"
      >
    </div>
  </aside>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useSessionStore } from '@/shared/session/session.store'
  import FeatureCheckIcon from '@/shared/ui/feature-card/FeatureCheckIcon.vue'
  import sidebarIllustrationSmallUrl from './assets/img/configuration-sidebar-sm.svg'
  import sidebarIllustrationUrl from './assets/img/configuration-sidebar.svg'
  import logoShortSmUrl from './assets/logo-short-sm.svg'
  import logoShortUrl from './assets/logo-short.svg'
  import logoWideUrl from './assets/logo-wide2.svg'
  import { canOpenStep, isSetupDone, isStepClosedBySetup, stepState, WIZARD_STEPS } from './wizard-steps'

  // Logo, the steps and an illustration at the bottom. A finished step shows a check,
  // the step at `maxStep` is green, a later one is grey; only a step up to `maxStep` can be opened.
  const props = defineProps<{
    /** Index of the step on screen. */
    currentStep: number
    /** Furthest step reached. */
    maxStep: number
  }>()

  const emit = defineEmits<{ 'go-to-step': [index: number] }>()

  const { t } = useTranslation()
  const session = useSessionStore()
  const CLOSED_HINT_ID = 'wizard-step-closed-hint'
  const closedHint = computed(() => t('setup.wizard.steps.closedHint', { defaultValue: 'The account is already set up, so this step is closed. You can connect PanelAlpha Hub later in Settings.' }))
  const access = computed(() => ({
    setupDone: isSetupDone(Boolean(session.user), session.home?.app?.setup_required),
  }))
  // The wizard is always light (`meta.forceLightTheme`), so the logo has the dark lettering only (`#302F38`).
  const logoUrl = logoWideUrl

  function open (index: number): void {
    if (canOpenStep(index, props.maxStep, access.value)) {
      emit('go-to-step', index)
    }
  }
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  // Breakpoints of next instead of the 1140px and 490px of the source: the full sidebar from `lg` up,
  // a 76px rail between `md` and `lg`, a bar over the content below `md`.
  $below-lg: map.get(v.$grid-breakpoints, lg) - 0.02px;
  $below-md: map.get(v.$grid-breakpoints, md) - 0.02px;

  // The sidebar is 380px, `gray-lighten5`, fixed to the window.
  .wizard-sidebar {
    position: sticky;
    top: 0;
    flex: 0 0 380px;
    width: 380px;
    height: 100vh;
    align-self: flex-start;
    background: var(--v-wizard-sidebar-bg);
  }

  .wizard-sidebar__inner {
    position: relative;
    height: 100%;
    padding: 56px 40px 218px;
    overflow: auto;
  }

  .wizard-sidebar__logo {
    display: block;
    width: 213px;
    max-height: 47px;
    margin-bottom: 48px;
  }

  // The short logos (`logo-short.svg` 56px, `logo-short-sm.svg` 40px) show in the rail and in the bar only.
  .wizard-sidebar__logo--short,
  .wizard-sidebar__logo--bar {
    display: none;
    width: auto;
  }

  .wizard-steps {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .wizard-step {
    display: flex;
    align-items: center;
    margin-bottom: 32px;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid rgb(var(--v-theme-primary));
      outline-offset: 4px;
      border-radius: 4px;
    }
  }

  .wizard-step--locked {
    cursor: default;
  }

  .wizard-step__number {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 32px;
    height: 32px;
    margin-right: 12px;
    border: 2px solid var(--v-wizard-step-border);
    border-radius: 50%;
    background-color: transparent;
    color: var(--v-wizard-step-text);
    font-size: v.$font-size-sm;
    line-height: 32px;
    font-weight: v.$font-weight-bold;
    transition: color 0.24s ease, border-color 0.24s ease, background-color 0.24s ease;
  }

  // `.v-icon size="20" color="white"`.
  .wizard-step__check {
    width: 20px;
    height: 20px;
    color: var(--v-white-base);
  }

  .wizard-step__name {
    font-size: v.$font-size-lg;
    line-height: 28px;
    font-weight: v.$font-weight-semibold;
    color: var(--v-wizard-step-text);
    transition: color 0.24s ease;
  }

  .wizard-step--completed {
    .wizard-step__name {
      color: var(--v-wizard-step-done-text);
    }
  }

  .wizard-step--completed,
  .wizard-step--current {
    .wizard-step__number {
      border-color: rgb(var(--v-theme-primary));
      background-color: rgb(var(--v-theme-primary));
      color: var(--v-white-base);
    }
  }

  .wizard-step--active {
    .wizard-step__name {
      color: rgb(var(--v-theme-primary));
    }
  }

  // The illustration is 280x320 on a tall window, 190x220 otherwise, at the bottom edge of the sidebar.
  .wizard-sidebar__illustration {
    position: absolute;
    left: 0;
    z-index: 120;
  }

  .wizard-sidebar__illustration--large {
    display: none;
    top: calc(100% - 320px);
  }

  .wizard-sidebar__illustration--small {
    top: calc(100% - 220px);
  }

  @media (min-height: 961px) {
    .wizard-sidebar__illustration--large {
      display: block;
    }

    .wizard-sidebar__illustration--small {
      display: none;
    }
  }

  // The rail and the bar have no illustration (`v-if="width > 1140"`).
  @media (max-width: $below-lg) {
    .wizard-sidebar .wizard-sidebar__illustration {
      display: none;
    }
  }

  // Rail: 76px, the logo and the number circles only. The names stay for screen readers.
  @media (max-width: $below-lg) {
    .wizard-sidebar {
      flex-basis: 76px;
      width: 76px;
    }

    .wizard-sidebar__inner {
      padding: 32px 10px 0;
    }

    .wizard-sidebar__logo {
      display: none;
    }

    .wizard-sidebar .wizard-sidebar__logo--short {
      display: block;
      width: 56px;
      height: 56px;
      margin-bottom: 28px;
    }

    .wizard-step {
      justify-content: center;
      width: 100%;
    }

    .wizard-step__number {
      margin-right: 0;
    }

    .wizard-step__name {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  // Bar over the content: 80px high, the small logo and the circles in a row.
  @media (max-width: $below-md) {
    .wizard-sidebar {
      position: static;
      flex-basis: auto;
      width: 100%;
      height: 80px;
    }

    .wizard-sidebar__inner {
      display: flex;
      align-items: center;
      padding: 20px 16px;
      overflow: hidden;
    }

    .wizard-sidebar .wizard-sidebar__logo--short {
      display: none;
    }

    .wizard-sidebar .wizard-sidebar__logo--bar {
      display: block;
      width: 40px;
      height: 40px;
      margin: 0 24px 0 0;
    }

    .wizard-steps {
      display: flex;
      gap: 16px;
    }

    .wizard-step {
      width: auto;
      height: 32px;
      margin-bottom: 0;
    }
  }
</style>

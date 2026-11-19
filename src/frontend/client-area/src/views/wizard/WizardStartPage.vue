<template>
  <div
    class="wizard-start"
    data-testid="wizard-start"
  >
    <div class="wizard-start__body">
      <div class="wizard-start__wrapper">
        <div class="wizard-start__content">
          <img
            alt="PanelAlpha"
            class="wizard-start__logo"
            height="60"
            :src="logoUrl"
            width="270"
          >

          <div class="wizard-start__text">
            <h1 data-testid="wizard-start-title">
              {{ t('setup.wizard.start.title', { defaultValue: 'A few steps to your first deploy.' }) }}
            </h1>

            <p>
              {{ t('setup.wizard.start.subtitle', { defaultValue: 'From your project to a live site in minutes, on your own server.' }) }}
            </p>
          </div>

          <div class="wizard-start__actions">
            <AppButton
              class="wizard-start__button"
              data-testid="wizard-start-button"
              kind="primary"
              size="x-large"
              @click="start"
            >
              {{ t('setup.wizard.start.button', { defaultValue: 'Start Now' }) }}
              <WizardArrowRightIcon class="wizard-start__arrow" />
            </AppButton>
          </div>
        </div>
      </div>

      <div class="wizard-start__illustration">
        <img
          alt=""
          aria-hidden="true"
          class="wizard-start__picture"
          :src="startIllustrationUrl"
        >

        <img
          alt=""
          aria-hidden="true"
          class="wizard-start__blob"
          :src="topBackgroundUrl"
        >
      </div>
    </div>

    <WizardLanguage class="wizard-start__language" />
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { useRouter } from 'vue-router'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import startIllustrationUrl from './assets/img/configuration-start.svg'
  import topBackgroundUrl from './assets/img/top-background.svg'
  import logoWideUrl from './assets/logo-wide2.svg'
  import WizardArrowRightIcon from './icons/WizardArrowRightIcon.vue'
  import { pathOfSlug } from './wizard-steps'
  import WizardLanguage from './WizardLanguage.vue'

  // The first screen, before step 1. "Start Now" opens step 1; "Leave wizard" is not
  // ported (`v-if="!isAppSingleServer"`).
  const { t } = useTranslation()
  const router = useRouter()
  // The wizard is always light (`meta.forceLightTheme`), so the logo has the dark lettering only (`#302F38`).
  const logoUrl = logoWideUrl

  function start (): void {
    void router.push(pathOfSlug('panelalpha-connect'))
  }
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  // Breakpoints of next instead of the 1280px, 960px, 650px and 440px of the source: `lg` and up keep
  // the 1440px values, a narrower window gets one column with the picture behind the text, and the green blob goes.
  $below-lg: map.get(v.$grid-breakpoints, lg) - 0.02px;
  $below-md: map.get(v.$grid-breakpoints, md) - 0.02px;
  $below-sm: map.get(v.$grid-breakpoints, sm) - 0.02px;

  // The message box has the values of the 1440px window (the bracket 1280-1449px of the source).
  .wizard-start {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-height: 100vh;
    overflow: hidden;
  }

  // The row of the text and the picture; the language footer is the row below it, over the full width.
  .wizard-start__body {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;

    @media (max-width: $below-md) {
      flex-direction: column;
    }
  }

  .wizard-start__wrapper {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    align-items: flex-end;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 24px 24px 24px 100px;

    @media (max-width: $below-lg) {
      padding: 24px 0 24px 80px;
    }

    @media (max-width: $below-md) {
      align-items: stretch;
      justify-content: flex-start;
      padding: 80px 80px 260px;
    }

    @media (max-width: $below-sm) {
      padding: 40px 24px 200px;
    }
  }

  .wizard-start__content {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 680px;
    margin: 0 auto;

    @media (max-width: $below-md) {
      margin: 0;
    }
  }

  // `v-img` 270x60 with `mb-12`.
  .wizard-start__logo {
    display: block;
    width: 270px;
    max-height: 60px;
    margin-bottom: 48px;
  }

  .wizard-start__text {
    display: flex;
    flex-direction: column;
    width: 100%;
    margin-bottom: 48px;

    h1 {
      margin: 0 0 24px;
      color: var(--v-wizard-title);
      font-size: v.$font-size-h1;
      line-height: v.$line-height-h1;
      font-weight: v.$font-weight-bold;
      // No word left alone on the last line.
      text-wrap: balance;

      @media (max-width: $below-lg) {
        font-size: v.$font-size-h2;
        line-height: v.$line-height-h2;
      }

      @media (max-width: $below-sm) {
        font-size: v.$font-size-h6;
        line-height: v.$line-height-h6;
      }
    }

    p {
      margin: 0;
      color: var(--v-wizard-desc);
      font-size: v.$font-size-lg;
      line-height: 28px;
      text-wrap: pretty;

      @media (max-width: $below-sm) {
        font-size: v.$font-size-base;
        line-height: v.$line-height-lg;
      }
    }
  }

  .wizard-start__actions {
    display: flex;
    align-items: center;
    width: 100%;
  }

  // The language switcher of the old `/setup`: the bottom row of the page, aligned right; under `md` it stays above the picture.
  .wizard-start__language {
    position: relative;
    z-index: 1;
    flex: 0 0 auto;
  }

  // `v-icon size="24"` after the label, `ml-2`.
  .wizard-start__arrow {
    width: 24px;
    height: 24px;
    margin-left: 8px;
  }

  // The illustration is a 462px column with the picture at the bottom and the green blob in the top corner.
  .wizard-start__illustration {
    position: relative;
    flex: 0 1 100%;
    width: 100%;
    max-width: 462px;
    height: 100%;
    overflow: visible;
    pointer-events: none;

    @media (max-width: $below-lg) {
      max-width: 417px;
    }

    // The picture lies behind the text, at the bottom right corner of the page.
    @media (max-width: $below-md) {
      position: absolute;
      inset: 0;
      max-width: none;
      overflow: hidden;
    }
  }

  .wizard-start__picture {
    position: absolute;
    bottom: 80px;
    left: 0;
    width: 462px;
    height: 347px;
    object-fit: contain;

    @media (max-width: $below-lg) {
      width: 417px;
      height: 313px;
    }

    @media (max-width: $below-md) {
      right: -80px;
      bottom: -40px;
      left: auto;
    }

    @media (max-width: $below-sm) {
      right: -150px;
      bottom: -60px;
    }
  }

  .wizard-start__blob {
    position: absolute;
    top: -820px;
    right: -850px;
    z-index: 0;
    min-width: 1359px;
    min-height: 1288px;

    @media (max-width: $below-md) {
      display: none;
    }
  }
</style>

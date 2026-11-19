<template>
  <div class="error-page" fluid>
    <div class="wrapper">
      <div class="logo-wrapper" data-testid="not-found-logo">
        <BrandLogo
          class="mb-10"
          :dark-logo="themeStore.darkLogo"
          data-testid="not-found-logo-image"
          :logo="themeStore.lightLogo"
        />
      </div>

      <div class="mt-auto">
        <div class="card" data-testid="not-found-card">
          <span class="error-logo" data-testid="not-found-illustration">
            <DataIteratorNoResultIllustration />
          </span>

          <p class="error-text" data-testid="not-found-title">{{ t('heading.notFoundPage.title') }}</p>
          <p class="error-subtext" data-testid="not-found-info">{{ t('heading.notFoundPage.info') }}</p>

          <AppButton
            data-testid="not-found-home"
            kind="primary"
            size="large"
            :to="{ name: 'home' }"
          >
            <span class="font-weight-600">{{ homeLabel }}</span>
          </AppButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useThemeStore } from '@/shared/theme/theme.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataIteratorNoResultIllustration from '@/shared/ui/illustrations/DataIteratorNoResultIllustration.vue'
  import BrandLogo from '@/shared/ui/logo/BrandLogo.vue'

  const { t } = useTranslation()
  const themeStore = useThemeStore()

  // Vue 2 kept one space either side of the multi-line label span and the button content is `white-space: break-spaces`,
  // so the legacy label box is 8px wider than the trimmed Vue 3 text.
  const homeLabel = computed(() => ` ${t('button.home.back')} `)
</script>

<style lang="scss" scoped>
  @use '@/app/styles/legacy/tokens/variables' as v;

  // 1:1 port of legacy (identical in app and app-lite), without the dead `.logo-title` rule.
  // Legacy `.error-page` resolves `height: 100%` against `v-main` (the view sits directly in it); next wraps the view in
  // `div[data-testid="shell-routed-view"]` with auto height, so the viewport height is taken here instead
  // (404 route has no navbar, so `v-main` is the full viewport). Without it the card sits 116 px higher.
  // Signed in, the footer (`AppFooter`, 48 px) takes its place under the view: legacy `v-main` ends above it (footer at
  // 852 px of 900), so the view subtracts `--shell-footer-height` (0 when signed out; same rule as `AuthFrame.vue`).
  .error-page {
    height: calc(100vh - var(--shell-footer-height, 0px));
    max-height: calc(100vh - var(--shell-footer-height, 0px));
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;

    .logo-wrapper {
      margin-top: 24px;
      align-items: center;
      display: flex;
      justify-content: center;
      max-width: 100%;
      flex-grow: 0;

      // V2 `.v-responsive` (the legacy `v-img`) is `flex: 1 0 0; max-width: 100%`, so the logo box fills the wrapper (card width)
      // and `contain` centres the artwork inside it; the `<img>` width (200 / 171) would shrink the box instead.
      .brand-logo {
        flex: 1 0 0;
        max-width: 100%;
      }

      // Legacy `.v-image` (V2 `color` of the
      // light theme) paints rgba(0,0,0,.87) = `--v-text-default`; next `<img>` inherits
      // `--v-text-base` (rgba(73,73,95,1) in light). Dark already matches, so the token is set for the light theme only.
      .v-theme--light & .brand-logo {
        color: var(--v-text-default);
      }
    }

    // The 404 link is `v-btn :to`; the global button rule
    // (`_buttons.scss`) sets hover 0.08 / focus 0.24, legacy V2 `::before` measured hover 0.18 and focus 0.16 (light) / 0.32 (dark).
    :deep(.v-btn:hover > .v-btn__overlay) {
      opacity: 0.18;
    }

    // The theme class sits above `.error-page` (`.v-application`), so it is written
    // as the outer selector (`.v-theme--light & …`); nested under `.error-page` it never matched. Specificity beats the
    // global `:where(...)` focus rule (0.24) without `!important`.
    .v-theme--light & :deep(.v-btn:focus-visible > .v-btn__overlay) {
      opacity: 0.16;
    }

    .v-theme--dark & :deep(.v-btn:focus-visible > .v-btn__overlay) {
      opacity: 0.32;
    }

    .wrapper {
      max-height: 600px;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    // Card background comes from the global `.v-application .error-page .card` rule
    // (`--v-body-base` with !important), as in legacy; the legacy `white` here is overridden.
    .card {
      align-self: center;
      border-radius: 4px;
      max-width: 480px;
      width: 100%;
      padding: 16px;
      margin-top: auto;
      margin-bottom: auto;
      display: flex;
      align-items: center;
      flex-direction: column;
      justify-content: space-around;

      .error-logo {
        margin-bottom: 40px;
        width: 64px;
        height: 64px;
      }

      .error-text {
        color: var(--v-gray-darken2);
        text-align: center;
        font-size: v.$font-size-h1 !important;
        line-height: v.$line-height-h1;
        font-weight: v.$font-weight-bold;
      }

      .error-subtext {
        text-align: center;
        color: var(--v-gray-darken1);
        font-size: v.$font-size-base;
        line-height: v.$line-height-base;
        max-width: 278px;
        margin-bottom: 40px;
      }
    }
  }
</style>

<template>
  <!-- Frame of every session screen:
       `v-container` > background `v-img` > `v-row` > `v-col.login-container` > logo, then the screen's cards. -->
  <div class="full-height-container px-6">
    <img
      alt=""
      aria-hidden="true"
      class="radio-lines"
      :src="radioLinesUrl"
    >

    <div class="login-container d-flex flex-column align-center">
      <BrandLogo
        class="mb-10"
        :dark-logo="themeStore.darkLogo"
        :logo="themeStore.lightLogo"
      />

      <slot />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { useThemeStore } from '@/shared/theme/theme.store'
  import radioLinesUrl from '@/shared/ui/assets/radio-lines.svg'
  import BrandLogo from '@/shared/ui/logo/BrandLogo.vue'

  const themeStore = useThemeStore()
</script>

<style lang="scss" scoped>
  // Frame half of the legacy session screen styles (the card half stays in `auth-screen.scss`).

  .login-container {
    z-index: 999;
    // NEXT-only: a plain div replaces legacy `v-row > v-col` (no V4 grid), so it must fill the flex row.
    width: 100%;
    min-width: 0;
  }

  .full-height-container {
    display: flex;
    align-items: center;
    height: 100%;
    // NEXT-only: a plain div replaces legacy `v-container > v-row > v-col`; it anchors the absolute background
    // and centres the column.
    position: relative;
    justify-content: center;
    // Legacy fills the `.v-application--wrap` column next to the footer (shown once `home.user` exists, e.g. after a quick
    // register); V4 has no such stretch here, so `App.vue` publishes the footer height (48px) and it is subtracted.
    min-height: calc(100vh - var(--shell-footer-height, 0px));
    width: 100%;
    // V2 `.container` padding (legacy `v-container px-6`): a column taller than the viewport scrolls with 12px above and below.
    padding: 12px 24px;
  }

  .radio-lines {
    position: absolute;
    top: 0;
    left: 0;
    // V2 `.v-responsive` (the `v-img` legacy used): without it the 568px SVG widens the page on mobile.
    max-width: 100%;
    // Legacy `v-img` painted a background div, which cannot be dragged or selected; an `<img>` can.
    pointer-events: none;
    user-select: none;
  }
</style>

<template>
  <div
    class="wizard-language"
    data-testid="wizard-language"
  >
    <LanguageSwitcher is-login />
  </div>
</template>

<script lang="ts" setup>
  import LanguageSwitcher from '@/shared/ui/language/LanguageSwitcher.vue'

  // Legacy `/setup` has `<LanguageSwitcher isLogin>` under the card, so a guest can change the language before the
  // account exists. `isLogin` keeps it local: the choice goes to i18next and `localStorage`, no `PUT /user/language`.
  // The wizard has no card, so the switcher is the footer row of the page: the last element of the step (`WizardStepFrame`) and the bottom row of
  // the start page (`WizardStartPage`), aligned right like the `AppFooter` of the app.
</script>

<style lang="scss" scoped>
  @use '@/app/styles/legacy/tokens/variables' as v;

  // Footer row: padding of `AppFooter` (12px vertical, 24px sides); 16/24 in `text-base`, as the switcher of `/setup` (measured on the legacy
  // build). The kit pins the menu to the right edge of the container, so it opens inside the window.
  .wizard-language {
    display: flex;
    justify-content: flex-end;
    box-sizing: border-box;
    width: 100%;
    padding: 12px 24px;
    color: var(--v-text-base);
    font-size: v.$font-size-base;
    line-height: 24px;
  }
</style>

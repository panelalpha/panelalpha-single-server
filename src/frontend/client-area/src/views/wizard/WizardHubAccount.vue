<template>
  <div
    class="hub-account"
    data-testid="wizard-hub-account"
  >
    <span
      aria-hidden="true"
      class="hub-account__icon"
    >
      <svg
        fill="none"
        height="20"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2.6"
        viewBox="0 0 24 24"
        width="20"
      >
        <path d="M5 12l5 5L20 7" />
      </svg>
    </span>

    <div class="hub-account__text">
      <b>{{ t('setup.wizard.hub.connected', { defaultValue: 'Connected to PanelAlpha Hub' }) }}</b>
      <span data-testid="wizard-hub-account-email">{{ signedInAs }}</span>
    </div>

    <a
      v-if="hubUrl"
      class="hub-account__link"
      data-testid="wizard-hub-account-link"
      :href="hubUrl"
      rel="noopener"
      target="_blank"
    >
      {{ t('setup.wizard.hub.useAnother', { defaultValue: 'Use another account' }) }}
    </a>
  </div>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'

  // The frame "Connected to Hub" of step 2 after a Hub return: the account the
  // admin signed in with and a link to the Hub account page, which opens in a new tab. Without an address there is no link.
  const props = defineProps<{
    email: string
    hubUrl?: string | null
  }>()

  const { t } = useTranslation()

  // Built in the script: the `{{email}}` placeholder of the text would be read as an expression in the template.
  const signedInAs = computed(() => t('setup.wizard.hub.signedInAs', { email: props.email, defaultValue: 'Signed in as {{email}}' }))
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  $below-sm: map.get(v.$grid-breakpoints, sm) - 0.02px;

  // The connected status box: a 1px frame, 12px radius, 14px between the parts.
  .hub-account {
    display: flex;
    gap: 14px;
    align-items: center;
    margin-bottom: 36px;
    padding: 16px 18px;
    border: 1px solid var(--v-wizard-hub-ok-border);
    border-radius: var(--v-wizard-radius-lg);
    background: var(--v-wizard-hub-ok-bg);

    @media (max-width: $below-sm) {
      flex-wrap: wrap;
    }
  }

  // The icon of the connected status: the 34px tile, 9px radius, green icon.
  .hub-account__icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: var(--v-wizard-benefit-bg);
    color: var(--v-wizard-benefit-icon);
  }

  // The name 14.5/600 over the 13.5px line in `gray-darken1`.
  .hub-account__text {
    color: var(--v-wizard-title);
    font-size: 14.5px;
    line-height: 1.5;

    b {
      display: block;
      font-weight: v.$font-weight-semibold;
    }

    span {
      color: var(--v-wizard-desc);
      font-size: 13.5px;
      overflow-wrap: anywhere;
    }
  }

  // A link of admin area: `primary`, semibold, underlined on hover. Under `sm` it wraps under the text, 48px from the left.
  .hub-account__link {
    margin-left: auto;
    color: rgb(var(--v-theme-primary));
    font-size: 13.5px;
    font-weight: v.$font-weight-semibold;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }

    &:focus-visible {
      outline: 2px solid rgb(var(--v-theme-primary));
      outline-offset: 2px;
      border-radius: 2px;
    }

    @media (max-width: $below-sm) {
      margin-left: 48px;
    }
  }
</style>

<template>
  <SettingCardSkeleton v-if="loading" />

  <v-card
    v-else
    class="setting-card"
    elevation="4"
  >
    <v-card-text class="setting-card__header d-flex justify-space-between pb-6 text-gray-darken-2">
      <div class="setting-card__text">
        <component
          :is="titleTag"
          class="setting-card__title h6"
        >
          {{ title }}
        </component>

        <p
          v-if="description"
          class="setting-card__description mb-0 mt-1"
        >
          {{ description }}
        </p>

        <div
          v-if="$slots.alert"
          class="setting-card__alert mt-3"
        >
          <slot name="alert" />
        </div>
      </div>

      <div
        v-if="$slots.action"
        class="setting-card__action d-flex align-center flex-shrink-0"
      >
        <slot name="action" />
      </div>
    </v-card-text>

    <template v-if="$slots.footer">
      <v-divider />

      <v-card-text class="setting-card__footer pb-6">
        <slot name="footer" />
      </v-card-text>
    </template>
  </v-card>
</template>

<script lang="ts" setup>
  // Setting card of the kit: a title, a description and the action (switch, button, status) on the right,
  // with an optional hint under the description (`#alert`) and a part under a divider (`#footer`: a select, a form, details).
  // One look for every Advanced settings page and the phpMyAdmin tab: no appearance props. Below 768px the action stacks under the text. `titleTag` keeps the heading level of a page
  // (Cloudflare uses `h5`), the look is always `.h6`. `loading` shows the skeleton instead of the card. A slot that is not given renders
  // no wrapper, so a consumer puts its condition on `<template v-if … #slot>`. The root (`v-card` or the skeleton) takes `class`, `v-if`
  // and `data-testid` of the consumer. Content of a slot carries the consumer's `data-v`. No i18n here: texts come in as props.
  import SettingCardSkeleton from './SettingCardSkeleton.vue'

  withDefaults(defineProps<{
    title: string
    description?: string
    titleTag?: 'h5' | 'h6'
    loading?: boolean
  }>(), {
    description: undefined,
    titleTag: 'h6',
    loading: false,
  })
</script>

<style lang="scss" scoped>
// The text column keeps 32px from the action (legacy `pr-8` of the CDN and Cloudflare cards), the action column does not shrink and spaces
// its items 8px apart.
.setting-card__text {
  padding-inline-end: 32px;
}

.setting-card__action {
  column-gap: 8px;
}

// Below 768px every card stacks (decision of 2026-11-10, GitLab #43 and #26; legacy `.v-card--mobile` of Git, SSO and
// phpMyAdmin): the text takes the whole width without the 32px gap, the action sits 12px under it. A button fills the row,
// a switch keeps its size at the start, and a status with a button wraps instead of leaving the card.
@media (max-width: 767px) {
  .setting-card__header {
    flex-direction: column;
  }

  .setting-card__text {
    padding-inline-end: 0;
  }

  .setting-card__action {
    flex-wrap: wrap;
    margin-top: 12px;
    width: 100%;

    :deep(.v-btn) {
      flex: 1 1 auto;
    }

    // `ButtonSwitch` keeps `ml-2 pl-1` (utilities with `!important`) to sit 12px in from the right edge; stacked, it starts at the text edge.
    :deep(.switch-container) {
      margin-inline-start: 0 !important;
      padding-inline-start: 0 !important;
    }
  }
}
</style>

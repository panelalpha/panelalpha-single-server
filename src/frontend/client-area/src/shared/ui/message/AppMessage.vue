<template>
  <div
    class="app-message"
    :class="`app-message--${variant}`"
  >
    <div class="app-message__body">
      <!-- The icon sits in one row with the text, so it lines up with the first line also when the actions make the body taller. -->
      <div class="app-message__main">
        <v-icon
          class="app-message__icon"
          :color="variant"
          :icon="iconName"
          size="20"
        />

        <div class="app-message__text">
          <h6
            v-if="title"
            class="app-message__title"
          >
            {{ title }}
          </h6>

          <slot />
        </div>
      </div>

      <div
        v-if="$slots.action"
        class="app-message__action"
      >
        <slot name="action" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // Kit message: one look per variant for every in-content message. `class`, `role` and `data-testid`
  // fall through to this root; the kit adds no role. Rules for slot content go through `:deep()` (slot content has the consumer's `data-v`).
  import { computed } from 'vue'
  import { messageIcon, type MessageVariant } from './app-message'

  const props = defineProps<{
    variant: MessageVariant
    title?: string
    icon?: string
  }>()

  const iconName = computed(() => messageIcon(props.variant, props.icon))
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.app-message {
  display: flex;
  width: 100%;
  padding: 16px;
  border-radius: 8px;
  font-size: v.$font-size-sm;
  line-height: v.$line-height-sm;

  &--error {
    background: var(--v-error-lighten5);
    color: var(--v-error-base);
  }

  &--warning {
    background: var(--v-warning-lighten5);
    color: var(--v-warning-base);
  }

  &--success {
    background: var(--v-success-lighten5);
    color: var(--v-success-base);
  }

  &--info {
    background: var(--v-info-lighten5);
    color: var(--v-info-base);
  }
}

.app-message__icon {
  flex-shrink: 0;
  margin-inline-end: 8px;
}

.app-message__body {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.app-message__main {
  display: flex;
  flex: 1 1 200px;
  align-items: flex-start;
  min-width: 0;
}

.app-message__text {
  flex: 1 1 auto;
  min-width: 0;

  // Global `p` (`_general.scss`, gray) and `h6` (`_fonts.scss`, heading colour) set their own colour, so text inherits the variant here.
  :deep(p) {
    margin: 0;
    color: inherit;
  }

  // Global `b, strong` (`_general.scss`, `!important`) force the heading colour, and a nested `span` inherits it from the `<b>`
  // ("Failed: …"). Legacy gave `b` the variant colour (`error--text`, `.alert--*-bg b`), so bold text follows the variant here.
  // `.text--heading` keeps the heading colour where a consumer asks for it.
  :deep(b:not(.text--heading)),
  :deep(strong:not(.text--heading)) {
    color: inherit !important;
  }
}

.app-message__title {
  margin: 0 0 4px;
  font-size: inherit;
  line-height: inherit;
  font-weight: v.$font-weight-bold;
  color: inherit;

  &:only-child {
    margin-bottom: 0;
  }
}

.app-message__action {
  display: flex;
  flex-wrap: wrap;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}

@media (max-width: map.get(v.$grid-breakpoints, md) - 0.02px) {
  .app-message__body {
    flex-direction: column;
    align-items: stretch;
  }

  // `flex: 1 1 200px` is a width in the row layout; in the column it would become a 200 px minimum height.
  .app-message__main {
    flex-basis: auto;
  }
}
</style>

<template>
  <v-col
    class="info-card align-stretch d-flex responsive-card"
    v-bind="columns"
  >
    <v-card
      v-bind="$attrs"
      class="info-card__card"
      :class="{ 'info-card__card--actions': !!$slots.actions }"
      elevation="4"
      width="100%"
    >
      <v-card-title
        v-if="title"
        class="info-card__title px-6 pb-0 mb-4 h6 font-weight-bold d-flex justify-space-between"
      >
        <span class="info-card__title-text">{{ title }}</span>

        <slot name="title-append" />
      </v-card-title>

      <slot />

      <v-card-actions
        v-if="$slots.actions"
        class="info-card__actions pt-0"
      >
        <slot name="actions" />
      </v-card-actions>
    </v-card>
  </v-col>
</template>

<script lang="ts" setup>
  // Kit pattern of the General info card: the column of the General grid (`responsive-card`), the card,
  // the h6 title, the body and the actions row. One look for the source, installation, site details, loading speed and analytics cards
  // and their skeleton. Attributes (class,
  // data-testid) go to the card, where the legacy cards had them.
  import type { InfoCardSpan } from './info-card'
  import { computed } from 'vue'
  import { infoCardColumns } from './info-card'

  defineOptions({ inheritAttrs: false })

  const props = withDefaults(defineProps<{
    /** Already translated card title; none: no title row. */
    title?: string
    span?: InfoCardSpan
  }>(), {
    title: undefined,
    span: 'quarter',
  })

  const columns = computed(() => infoCardColumns(props.span))
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// The h6 title of every card (20/28px, 700); the global `.v-card-title` weight would win otherwise.
.info-card__title {
  font-size: v.$font-size-h6;
  line-height: v.$line-height-h6;
  font-weight: v.$font-weight-bold;
}

.info-card__title-text {
  min-width: 0;
}

// The body is slot content (it carries the card's scope id of the consumer), so it is reached with `:deep`. `!important` on the colour:
// kept from the source cards: without it the global `.v-card-text` layer wins
// (rgba(0,0,0,.6)). V2 `.v-card__text` did not grow in the stretched card column; V4 `.v-card-text` is `flex: 1 1 auto`.
.info-card__card :deep(.v-card-text) {
  flex: 0 1 auto;
  color: var(--v-text-darken2) !important;
}

// The global `.v-card-text:last-child { padding-bottom: 24px }` (`_card.scss`) never matches in V4 (the card ends with
// `.v-card__overlay`): a card without actions keeps 24px under its body (legacy loading speed and analytics cards).
.info-card__card:not(.info-card__card--actions) :deep(.v-card-text) {
  padding-bottom: 24px;
}

.info-card__actions :deep(.v-btn) {
  min-height: map.get(v.$btn-sizes, default) * 1px;
  height: unset;
  padding-top: 8px;
  padding-bottom: 8px;
  max-width: 100%;
  white-space: unset;
}
</style>

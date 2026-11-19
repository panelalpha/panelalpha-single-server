<template>
  <v-container
    v-if="variant === 'intro'"
    class="container empty-state-intro"
  >
    <v-card
      class="intro-page"
      elevation="4"
    >
      <div
        v-if="$slots.image"
        class="intro-page__illustration"
      >
        <slot name="image" />
      </div>

      <component
        :is="tag"
        v-if="title"
        class="intro-page__title h4"
        :data-testid="titleTestid"
      >
        {{ title }}
      </component>

      <div
        v-if="desc"
        class="intro-page__desc p-lg"
      >
        {{ desc }}
      </div>

      <div
        v-if="$slots.action"
        class="intro-page__actions"
      >
        <slot name="action" />
      </div>
    </v-card>
  </v-container>

  <div
    v-else-if="variant === 'card'"
    class="nodata-container__box no-data--card pt-15 pb-15"
  >
    <div
      v-if="$slots.image"
      class="nodata-container__img"
    >
      <slot name="image" />
    </div>

    <slot
      v-if="$slots['above-title']"
      name="above-title"
    />

    <component
      :is="tag"
      v-if="title"
      class="nodata-container__title mt-6 p-lg font-weight-bold mb-0"
      :data-testid="titleTestid"
    >
      {{ title }}
    </component>

    <p
      v-if="desc"
      class="nodata-container__message mb-0 p-sm mt-4 text--gray-darken1"
    >
      {{ desc }}
    </p>

    <div
      v-if="$slots.action"
      class="nodata-container__action mt-6"
    >
      <slot name="action" />
    </div>
  </div>

  <div
    v-else-if="variant === 'welcome'"
    class="nodata-container__box no-data--welcome"
  >
    <div
      v-if="$slots.image"
      class="nodata-container__img"
    >
      <slot name="image" />
    </div>

    <slot
      v-if="$slots['above-title']"
      name="above-title"
    />

    <component
      :is="tag"
      v-if="title"
      class="nodata-container__title h1 mt-1"
      :data-testid="titleTestid"
    >
      {{ title }}
    </component>

    <p
      v-if="desc"
      class="nodata-container__message mb-0 p-1 mt-4"
    >
      {{ desc }}
    </p>

    <div
      v-if="$slots.action"
      class="nodata-container__action mt-8"
    >
      <slot name="action" />
    </div>
  </div>

  <div
    v-else-if="variant === 'panel'"
    class="no-data no-data--panel"
  >
    <div
      v-if="$slots.image"
      class="no-data__img"
    >
      <slot name="image" />
    </div>

    <component
      :is="tag"
      v-if="title"
      class="no-data__title h6 mt-4 mb-6"
      :data-testid="titleTestid"
    >
      {{ title }}
    </component>

    <p
      v-if="desc"
      class="no-data__desc p-2 mb-0"
    >
      {{ desc }}
    </p>

    <div
      v-if="$slots.action"
      class="no-data__action mt-6"
    >
      <slot name="action" />
    </div>
  </div>

  <div
    v-else-if="variant === 'cell'"
    class="no-data-container no-data--cell"
  >
    <div
      v-if="$slots.image"
      class="no-data__img mb-6"
    >
      <slot name="image" />
    </div>

    <component
      :is="tag"
      v-if="title"
      class="no-data__title h6 mb-4 font-weight-bold"
      :data-testid="titleTestid"
    >
      {{ title }}
    </component>

    <p
      v-if="desc"
      class="no-data__desc no-data-container__description mb-0"
    >
      {{ desc }}
    </p>

    <div
      v-if="$slots.action"
      class="no-data__action mt-6"
    >
      <slot name="action" />
    </div>
  </div>

  <div
    v-else-if="variant === 'compact'"
    class="no-data no-data--compact text-center py-8 px-4"
  >
    <div
      v-if="$slots.image"
      class="no-data__img mb-2"
    >
      <slot name="image" />
    </div>

    <component
      :is="tag"
      v-if="title"
      class="no-data__title mb-1 p-3 text--gray-darken2"
      :data-testid="titleTestid"
    >
      {{ title }}
    </component>

    <p
      v-if="desc"
      class="no-data__desc mb-0 caption text--gray-darken1"
    >
      {{ desc }}
    </p>
  </div>

  <div
    v-else
    class="no-data no-data--table py-12 px-12"
  >
    <div
      v-if="$slots.image"
      class="no-data__img mb-6"
    >
      <slot name="image" />
    </div>

    <div class="no-data__content">
      <component
        :is="tag"
        v-if="title"
        class="no-data__title h3 text--heading"
        :data-testid="titleTestid"
      >
        {{ title }}
      </component>

      <p
        v-if="desc"
        class="no-data__desc mt-4 mb-0 p-1 font-weight-light text-center text-gray-darken-1"
      >
        {{ desc }}
      </p>

      <div
        v-if="$slots.action"
        class="no-data__action mt-6"
      >
        <slot name="action" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // Empty state of the kit: one look per place (`variant`, see `empty-state.ts`). Props and slots are functions
  // only: the copy (`title`, `desc`), the heading level (`titleTag`, a11y), the test id of the title, the `image`, `above-title` and `action`
  // slots. `class` and `data-testid` fall through to the root (one root per variant). The Add button of an empty state is `PageAddButton`.
  import type { EmptyStateVariant } from './empty-state'
  import { computed } from 'vue'
  import { emptyStateTitleTag } from './empty-state'

  const props = withDefaults(defineProps<{
    variant?: EmptyStateVariant
    title?: string
    desc?: string
    titleTag?: string
    titleTestid?: string
  }>(), {
    variant: 'table',
    title: undefined,
    desc: undefined,
    titleTag: undefined,
    titleTestid: undefined,
  })

  const tag = computed(() => props.titleTag ?? emptyStateTitleTag(props.variant))
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// table (legacy TableFullScreenMessage): a centred column, the content capped at 560px for every consumer.
.no-data--table {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.no-data__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  max-width: 560px;
  margin: auto;
}

// The look of an h3 for every heading level (`.h3` gives the size). No vertical margin: the app resets heading margins like V2 did, and
// legacy `TableFullScreenMessage` sets none (title 24px under the image; a `1em` margin here made it 50px and the card 52px taller).
.no-data--table .no-data__title {
  font-weight: v.$font-weight-extrabold;
  text-align: center;
  line-height: 40px;
  margin-block: 0;
}

.no-data__action {
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 8px;
}

// V2 `.v-btn` took the 24px body line height of the empty cell; the V4 cell is 20px (was repeated in DomainsView, EnvFileView, Email x2).
.no-data__action :deep(.v-btn) {
  line-height: 24px;
}

// The Add button of an empty state keeps the large size (48px, 16px label) on a phone, as on desktop; the `small` size of the
// header button (`PageAddButton`, 32px) is too small for the one action of a whole page (legacy: x-large pill on every width).
.intro-page__actions,
.nodata-container__action,
.no-data__action {
  :deep(.page-title__add-button.v-btn--size-small) {
    height: 48px;
    font-size: 16px;
    line-height: 24px;
  }
}

// panel (legacy `v-card-text d-flex flex-column align-center justify-center py-14` of Connect AI tokens and
// Reseller API): an h6 title (20px/700, 16px above and 24px below), a `p-2` description in the muted
// `gray-lighten1`, the text wraps inside the 24px side padding at every width. The `7px` under the image is the inline-SVG baseline gap of
// the legacy wrapper. The table cell around it has no padding (`_tables.scss`, `:has(.no-data--panel)`).
.no-data--panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 24px;
  // V2 `.v-card__text` set `letter-spacing: .0071428571em` (0.1px); the title and the text inherit it (legacy width 132.3px, V4 card text 131px).
  letter-spacing: 0.1px;
}

.no-data--panel .no-data__img {
  display: flex;
  margin-bottom: 7px;
}

.no-data--panel .no-data__desc {
  color: var(--v-gray-lighten1);
  text-align: start;
}

// cell (legacy `.no-data-container` of Reseller Users and Logs and Connect AI activity log): an h6 title (20px/700, 16px below), a 14px/24px description, both centred; in a table cell the global rule
// (`_tables.scss`, `.no-data-container`) gives it the 344px minimum height and no cell padding, outside a table the consumer adds the padding.
.no-data--cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.no-data--cell .no-data__img {
  display: flex;
}

.no-data--cell .no-data__title {
  text-align: center;
}

.no-data--cell .no-data__desc {
  font-size: v.$font-size-sm;
  line-height: v.$line-height-base;
  font-weight: v.$font-weight-normal;
  color: var(--v-gray-darken1);
  text-align: center;
}

// card (legacy LogsNoData / InstanceNoData `nodata-container`); welcome reuses the box.
.nodata-container__box {
  margin: auto;
  max-width: 560px;
  text-align: center;
  height: 100%;
  justify-content: center;
  align-items: center;
  display: flex;
  flex-direction: column;
}

.nodata-container__img {
  max-height: 64px;
}

.nodata-container__message {
  color: map.get(v.$text, base);
}

.nodata-container__action {
  display: flex;
  justify-content: center;
  gap: 8px;
}

// compact: V4 `.v-table` cells inherit `letter-spacing: 0.1px` (V2 `normal`).
.no-data--compact {
  letter-spacing: normal;
}

// intro (legacy `_noData.scss` holds the rest): V2 `.container` padding is 12px, V4 `.v-container` 16px.
.empty-state-intro {
  padding: 12px;
}

// The V2 reset zeroed heading margins in both legacy intros; V4 keeps the UA `margin-block` of the tag.
.intro-page__title {
  margin-bottom: 0;
}

// V2 `.v-card > :first-child` gave the first child the card radius (top corners).
.intro-page__illustration {
  border-radius: 4px 4px 0 0;
}

// V4 `.v-card` clips its content; V2 did not (the actions row may run past the card on a narrow screen, as in legacy).
.v-card.intro-page {
  overflow: visible;
}
</style>

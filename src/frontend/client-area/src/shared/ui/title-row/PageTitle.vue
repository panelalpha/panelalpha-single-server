<template>
  <v-container :class="classes.container">
    <TitleRow
      v-if="variant === 'section'"
      :class="isStacked ? 'flex-column flex-nowrap' : undefined"
    >
      <v-col :class="[classes.title, titleColClass]">
        <slot name="title-prepend" />

        <slot name="title">
          <h4
            v-if="title"
            :class="classes.heading"
            :data-testid="titleTestid"
          >
            {{ title }}
          </h4>
        </slot>

        <slot name="title-append" />
      </v-col>

      <v-col
        v-if="$slots.filters"
        v-show="filtersVisible"
        :class="classes.filters"
        :data-testid="filtersTestid"
      >
        <slot name="filters" />
      </v-col>
    </TitleRow>

    <v-row
      v-else
      class="page-title__row mb-0"
    >
      <v-col :class="[classes.title, titleColClass]">
        <slot name="title-prepend" />

        <slot name="title">
          <h4
            v-if="title"
            :class="classes.heading"
            :data-testid="titleTestid"
          >
            {{ title }}
          </h4>
        </slot>

        <slot name="title-append" />
      </v-col>

      <v-col
        v-if="$slots.filters"
        v-show="filtersVisible"
        :class="classes.filters"
        :data-testid="filtersTestid"
      >
        <slot name="filters" />
      </v-col>
    </v-row>

    <slot name="bottom" />
  </v-container>
</template>

<script lang="ts" setup>
  // Page title of the kit: the h4 of a page or a section with its filter column, one look per variant
  // (`page-title.ts`). One root `v-container`, so the global `.page-title + .v-container` rule (`_pageTitle.scss`) and the tests that read
  // the next sibling of the header still reach the content container of the screen. The columns are rendered here (legacy classes
  // `page-title__title-box`, `page-title__filter-controls`, `title-row` stay as classes of the variant); the slots carry the screen's content.
  // No i18n here: the title comes in as a prop.
  import type { PageTitleVariant } from './page-title'
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import { pageTitleClasses } from './page-title'
  import TitleRow from './TitleRow.vue'

  const props = withDefaults(defineProps<{
    title?: string
    variant?: PageTitleVariant
    titleTestid?: string
    filtersTestid?: string
    filtersVisible?: boolean
    stacked?: boolean
    // Extra class for the title column: a screen that pins the width of the title next to its filters (Email Addresses) hooks its rule here.
    titleColClass?: string
  }>(), {
    title: undefined,
    variant: 'section',
    titleTestid: undefined,
    filtersTestid: undefined,
    filtersVisible: true,
    stacked: undefined,
    titleColClass: undefined,
  })

  const { mdAndDown, mobile } = useDisplay()

  const classes = computed(() => pageTitleClasses(props.variant, mobile.value))
  // `section` only: the title and the filters stack below `lg`, or where the screen says so (DNS: four controls in the filter column).
  const isStacked = computed(() => props.stacked ?? mdAndDown.value)
</script>

<style lang="scss" scoped>
// `advanced` / `project`: the row keeps the legacy V2 `.row` offsets (`margin: -16px`, `_general.scss`, not global in V4) on the top and the
// sides; the bottom is 0 (`mb-0`, legacy `_pageTitle.scss` `> .row`). V4 spaces columns with `gap`, V2 had none. Was repeated in 19 screens.
.page-title > .page-title__row {
  --v-col-gap-x: 0px;
  --v-col-gap-y: 0px;
  margin: -16px -16px 0;
}
</style>

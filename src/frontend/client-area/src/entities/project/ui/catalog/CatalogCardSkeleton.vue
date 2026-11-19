<template>
  <div class="catalog-card-skeleton">
    <v-card
      elevation="4"
      rounded
    >
      <v-skeleton-loader
        v-if="media"
        class="image"
        type="image"
      />

      <v-skeleton-loader
        class="title"
        type="heading, chip"
      />

      <template v-if="!titleOnly">
        <v-skeleton-loader
          class="text"
          type="text@2"
        />

        <v-skeleton-loader
          class="actions"
          :type="`button@${buttons}`"
        />
      </template>
    </v-card>
  </div>
</template>

<script lang="ts" setup>
  // Skeleton of the catalogue cards, as
  // the one look of the onboarding template, theme and plugin card skeletons. Props only for the parts a card has: the screenshot
  // (`media`), the text and the actions (`titleOnly` drops both) and the number of action buttons.
  withDefaults(defineProps<{
    media?: boolean
    titleOnly?: boolean
    buttons?: number
  }>(), {
    media: false,
    titleOnly: false,
    buttons: 2,
  })
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// `elevation="4"` and the 4 px radius also in a dialog: the global `.v-dialog > .v-overlay__content .v-card` rule (0,3,0: 8 px,
// `box-shadow: none !important`) outranks `.v-card.elevation-4`, so the selector is repeated.
.catalog-card-skeleton .v-card.v-card.elevation-4 {
  border-radius: 4px;
  box-shadow: v.$box-shadow-elevation-4 !important;
}

// V2 painted the loader itself transparent where V4 uses the surface colour.
.v-skeleton-loader {
  background: transparent;

  // `!important` stays: the global `_skeleton.scss` has `background-color: … !important` on `.v-skeleton-loader__bone`.
  :deep(.v-skeleton-loader__bone) {
    background: var(--v-gray-lighten2) !important;
    border-radius: 3px;
  }

  :deep(.v-skeleton-loader__image) {
    height: 200px;
    border-radius: 0 !important;
  }
}

.image {
  width: 100%;
  height: 200px;
}

// V4 bones are flex items with `flex: 1 1 100%` (a `width` is ignored) and a 16px margin (V2: 0): `flex: 0 0 auto` and the margin are
// restated.
.title.v-skeleton-loader {
  display: flex;
  justify-content: space-between;
  padding: 16px 16px 0 16px;
  align-items: center;

  :deep(.v-skeleton-loader__heading) {
    width: 143px;
    height: 28px;
    flex: 0 0 auto;
    margin: 0;
  }

  :deep(.v-skeleton-loader__chip) {
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
    margin: 0;
  }
}

.text.v-skeleton-loader {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px 16px 40px 16px;
  align-items: center;

  :deep(.v-skeleton-loader__text) {
    width: 100%;
    height: 10px;
    flex: 0 0 auto;
    margin: 0 0 6px;
  }
}

.actions.v-skeleton-loader {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0 16px 10px 16px;

  :deep(.v-skeleton-loader__button) {
    height: 38px;
    width: 38px;
    flex: 0 0 auto;
    margin: 0 16px 0 0;

    &:last-child {
      margin-right: 0;
      margin-left: auto;
    }
  }
}
</style>

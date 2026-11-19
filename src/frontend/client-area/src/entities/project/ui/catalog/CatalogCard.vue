<template>
  <div
    class="data-iterator-card catalog-card"
    :class="{ 'data-iterator-card--featured': !!featuredLabel }"
  >
    <div
      v-if="featuredLabel"
      class="featured-label"
    >
      <span class="featured-label__text">{{ featuredLabel }}</span>
    </div>

    <v-card
      class="item"
      elevation="4"
    >
      <CatalogCardMedia
        v-if="media"
        :action-busy="actionBusy"
        :action-icon="actionIcon"
        :action-label="actionLabel"
        :action-loading="actionLoading"
        :action-loading-label="actionLoadingLabel"
        :details-label="detailsLabel"
        :preview-href="previewHref"
        :preview-label="previewLabel"
        :preview-target="previewTarget"
        :src="src"
        @action="emit('action')"
        @details="emit('details')"
      />

      <v-card-title class="d-flex justify-space-between align-start flex-nowrap">
        <slot name="title">
          <h5>{{ title }}</h5>
        </slot>

        <slot name="title-append" />
      </v-card-title>

      <template v-if="!titleOnly">
        <v-card-text class="p-3">
          <span
            v-safe-html:external="description"
            class="base--text"
          />

          <a
            v-if="readMore"
            class="truncate-text"
            @click="emit('read-more')"
          >
            <span class="base--text font-weight-regular"> ... </span>
            {{ readMoreLabel }}
          </a>

          <slot name="text-append" />
        </v-card-text>

        <v-card-actions>
          <!-- A card of its own footer (the PanelAlpha Go catalog: category, stars, tries) replaces the rating, installs and buttons. -->
          <slot name="actions">
            <div class="d-flex align-center">
              <div
                v-if="rating !== undefined"
                class="d-flex align-center mr-3"
              >
                <StarIcon
                  class="mr-1"
                  :percent="starPercent(rating)"
                />

                <b class="p-4">{{ ratingLabel(rating) }}</b>
              </div>

              <div
                v-if="installs"
                class="d-flex align-center"
              >
                <v-icon
                  class="mr-1"
                  color="gray-lighten-1"
                  icon="$installIcon"
                  size="20"
                />

                <b class="p-4">{{ installs }}+</b>
              </div>
            </div>

            <div class="d-flex align-center ml-auto">
              <AppButton
                v-if="linkTooltip"
                :aria-label="linkAriaLabel"
                class="catalog-action-button"
                color="gray"
                elevation="0"
                :href="linkHref"
                rel="noopener noreferrer"
                size="small"
                target="_blank"
                :tooltip="linkTooltip"
                variant="outlined"
              >
                <v-icon
                  class="mr-0"
                  color="gray-darken-2"
                  icon="$eye"
                  size="18"
                />
              </AppButton>

              <AppButton
                v-if="installTooltip"
                :aria-label="installAriaLabel"
                class="ml-3 catalog-action-button"
                kind="primary"
                size="small"
                :tooltip="installTooltip"
                @click="emit('install')"
              >
                <Loader
                  v-if="installBusy"
                  class="mr-0"
                  color="white"
                  no-margins
                  size="24"
                />

                <v-icon
                  v-else
                  class="mr-0"
                  color="white"
                  icon="$installIcon"
                  size="18"
                />
              </AppButton>
            </div>
          </slot>
        </v-card-actions>
      </template>
    </v-card>
  </div>
</template>

<script lang="ts" setup>
  // Catalogue card of the kit: the onboarding template card and the Add New cards of Themes and Plugins.
  // One look; props only for what the cards do differently: the screenshot
  // and its hover buttons (`media`, `CatalogCardMedia`), the Featured ribbon, the description with Read more, the rating, the installs,
  // the eye link and the install button. `titleOnly` drops the text and the actions (onboarding). Labels come in as props; the consumer
  // maps the emits to its domain events, and names the icon-only buttons. The title is text (the consumer decodes it); the description is
  // HTML from outside (`external`).
  import { ratingLabel, starPercent } from '@/entities/project/wordpress-items'
  import { vSafeHtml } from '@/shared/html/v-safe-html'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import StarIcon from '@/shared/ui/icons/star.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'
  import CatalogCardMedia from './CatalogCardMedia.vue'

  withDefaults(defineProps<{
    title: string
    media?: boolean
    src?: string
    actionLabel?: string
    actionIcon?: string
    actionLoading?: boolean
    actionLoadingLabel?: string
    actionBusy?: boolean
    previewHref?: string
    previewLabel?: string
    previewTarget?: string
    /** A Details button under the action in place of the preview link; it emits `details`. */
    detailsLabel?: string
    featuredLabel?: string
    titleOnly?: boolean
    description?: string
    readMore?: boolean
    readMoreLabel?: string
    rating?: number
    installs?: number
    linkHref?: string
    linkTooltip?: string
    linkAriaLabel?: string
    installTooltip?: string
    installAriaLabel?: string
    installBusy?: boolean
  }>(), {
    media: false,
    src: undefined,
    actionLabel: undefined,
    actionIcon: undefined,
    actionLoading: false,
    actionLoadingLabel: undefined,
    actionBusy: false,
    previewHref: undefined,
    previewLabel: undefined,
    previewTarget: '_blank',
    detailsLabel: undefined,
    featuredLabel: undefined,
    titleOnly: false,
    description: undefined,
    readMore: false,
    readMoreLabel: undefined,
    rating: undefined,
    installs: undefined,
    linkHref: undefined,
    linkTooltip: undefined,
    linkAriaLabel: undefined,
    installTooltip: undefined,
    installAriaLabel: undefined,
    installBusy: false,
  })

  const emit = defineEmits<{
    'action': []
    'details': []
    'read-more': []
    'install': []
  }>()
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// `elevation="4"` also in a dialog (onboarding template chooser): the global `.v-dialog > .v-overlay__content .v-card` rule (0,3,0,
// `box-shadow: none !important`) flattens a nested card, so the class is doubled.
.catalog-card.catalog-card .v-card {
  box-shadow: v.$box-shadow-elevation-4 !important;
}

// Paddings of the card parts are set here: a dialog pads nested card parts by 32 px (`_dialog.scss`, `:where(.v-dialog > .v-overlay__content) .v-card`).
// V2 `.v-card__text` line-height is 20 px; the global `.v-card-text` sets 22 px.
.catalog-card {
  .v-card-title {
    padding: 18px 24px 12px;
  }

  .v-card-text {
    padding: 0 24px;
    line-height: 1.25rem;
  }

  .v-card-actions {
    padding: 20px 24px 24px;
  }
}

// Inline `min-width/max-width: 38px` on the icon buttons, as a class.
.catalog-action-button {
  min-width: 38px;
  max-width: 38px;
}

// Featured ribbon: the ribbon is a sibling of the card, `.v-card` clips it in V4; 8 px above the card top),
// tokens `--v-featured-*`.
.data-iterator-card--featured .featured-label {
  position: absolute;
  top: -8px;
  right: -8px;
  overflow: hidden;
  width: 65px;
  height: 65px;
  display: flex;
  align-items: center;
  justify-content: center;

  &::before,
  &::after {
    content: "";
    position: absolute;
    width: 8px;
    height: 8px;
    background: var(--v-featured-corner);
    z-index: 0;
  }

  &::before {
    top: 0;
    left: 0;
  }

  &::after {
    bottom: 0;
    right: 0;
  }

  .featured-label__text {
    transform: rotate(45deg);
    color: var(--v-featured-text);
    display: block;
    position: relative;
    font-size: v.$font-size-xxs;
    line-height: v.$line-height-xxs;
    font-weight: v.$font-weight-bold;
    bottom: 8px;
    left: 8px;
    text-align: center;
    z-index: 10;

    &::before {
      content: "";
      position: absolute;
      top: 0;
      left: -24px;
      width: 120px;
      height: 18px;
      background: var(--v-featured-bg);
      z-index: -1;
    }
  }
}

.truncate-text {
  font-weight: v.$font-weight-bold;
  color: rgb(var(--v-theme-info));
  display: inline;
  justify-content: flex-end;
  margin-left: -4px;
}
</style>

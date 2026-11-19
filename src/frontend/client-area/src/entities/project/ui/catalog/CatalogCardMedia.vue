<template>
  <div class="catalog-card-media">
    <v-img
      class="data-iterator-card__image"
      cover
      height="200px"
      max-height="200px"
      position="top center"
      :src="src"
      width="100%"
    >
      <template #placeholder>
        <ImageLoader />
      </template>
    </v-img>

    <div class="instance-actions px-12">
      <div class="instance-actions__content text-center">
        <AppButton
          v-if="actionLabel"
          class="mb-4"
          kind="primary"
          :loading="actionLoading"
          max-width="184px"
          min-width="184px"
          size="small"
          @click="emit('action')"
        >
          <template #loader>
            <v-progress-circular
              class="mr-2"
              indeterminate
              size="20"
              width="2"
            />

            <span v-if="actionLoadingLabel">{{ actionLoadingLabel }}</span>
          </template>

          <Loader
            v-if="actionBusy"
            class="mr-0"
            color="white"
            no-margins
            size="24"
          />

          <span
            v-else
            class="font-weight-bold text-white"
          >
            <v-icon
              v-if="actionIcon"
              class="mr-1"
              color="white"
              :icon="actionIcon"
              size="16px"
            />
            {{ actionLabel }}
          </span>
        </AppButton>

        <AppButton
          v-if="previewHref"
          :color="isDark ? 'black' : 'white'"
          elevation="0"
          :href="previewHref"
          max-width="184px"
          min-width="184px"
          rel="noopener noreferrer"
          size="small"
          :target="previewTarget"
        >
          <span class="font-weight-bold">{{ previewLabel }}</span>
        </AppButton>

        <!-- In place of the preview link: a button the card handles itself (the PanelAlpha Go catalog opens the app's details). -->
        <AppButton
          v-else-if="detailsLabel"
          :color="isDark ? 'black' : 'white'"
          elevation="0"
          max-width="184px"
          min-width="184px"
          size="small"
          @click="emit('details')"
        >
          <span class="font-weight-bold">{{ detailsLabel }}</span>
        </AppButton>
      </div>
    </div>

    <v-divider />
  </div>
</template>

<script lang="ts" setup>
  // Screenshot of a catalogue card with the hover buttons. One look for the onboarding template card,
  // the Add New theme card and the installed theme card: the overlay with a 200 px screenshot, blur and
  // fade. Labels come in as props; the card that holds it emits the domain event.
  // `actionLoading` is the blocking `v-btn` loading of the onboarding (pointer events off), `actionBusy` only swaps the label for the
  // loader and the button still emits (an install in progress opens the install dialog again, as legacy).
  import { computed } from 'vue'
  import { useTheme } from 'vuetify'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ImageLoader from '@/shared/ui/loader/ImageLoader.vue'
  import Loader from '@/shared/ui/loader/Loader.vue'

  withDefaults(defineProps<{
    src?: string
    actionLabel?: string
    actionIcon?: string
    actionLoading?: boolean
    actionLoadingLabel?: string
    actionBusy?: boolean
    previewHref?: string
    previewLabel?: string
    previewTarget?: string
    detailsLabel?: string
  }>(), {
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
  })

  const emit = defineEmits<{
    action: []
    details: []
  }>()

  const theme = useTheme()
  // The Preview button is black in the dark theme and white in the light one.
  const isDark = computed(() => theme.global.current.value.dark)
</script>

<style lang="scss" scoped>
// The card root (`.data-iterator-card`) is the hover target, as legacy.
.catalog-card-media {
  position: relative;
}

.instance-actions {
  position: absolute;
  top: 0;
  left: 0;
  height: 200px;
  z-index: 5;
  width: 100%;
  transition: opacity 0.2s ease;
  opacity: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(8px);
  border-radius: 8px 8px 0 0;
  overflow: hidden;
}

.data-iterator-card:hover .instance-actions {
  opacity: 1;
}

// V4 names the colour class `bg-black`, and `!important` beats its own.
.bg-black:hover {
  background-color: var(--v-gray-base) !important;
}
</style>

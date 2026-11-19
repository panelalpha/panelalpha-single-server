<template>
  <ReadMoreModal
    :description="description"
    :frame="itemStatus"
    :model-value="modelValue && item !== null"
    :show-activate="!isNew && item?.status !== 'active'"
    :show-install="isNew"
    :show-update="!isNew"
    :status="chip"
    :title="title"
    @action-activate="activate"
    @action-install="install"
    @action-update="update"
    @update:model-value="emit('update:model-value', $event)"
  >
    <template #media>
      <v-img
        v-if="screenshotSrc"
        class="data-iterator-card__image"
        height="391px"
        max-height="391px"
        position="top center"
        :src="screenshotSrc"
        width="100%"
      >
        <template #placeholder>
          <ImageLoader />
        </template>
      </v-img>

      <v-divider />
    </template>

    <template
      v-if="rating"
      #meta
    >
      <StarIcon
        v-for="index in rating.filled"
        :key="`${index}-full`"
        class="star-icon mr-1"
        :percent="1"
      />

      <StarIcon
        v-for="index in rating.empty"
        :key="`${index}-empty`"
        class="star-icon mr-1"
        :percent="0"
      />

      <b class="p-3 ml-2">{{ rating.value }}/5</b>
    </template>

    <template #actions-prepend>
      <AppButton
        :aria-label="previewAriaLabel"
        class="mr-4 px-0 preview-button"
        color="gray"
        elevation="0"
        :href="previewUrl"
        rel="noopener noreferrer"
        size="large"
        target="_blank"
        variant="outlined"
      >
        <v-icon
          class="mr-0 heading-icon"
          icon="$eye"
          size="24"
        />
      </AppButton>
    </template>
  </ReadMoreModal>
</template>

<script lang="ts" setup>
  // The overlay and the body scroll lock are the `v-dialog` of Vuetify 4, as in `PluginReadMoreModal.vue`. A click on an action emits it at once and the dialog closes behind
  // it (legacy waited 100 ms first). The dialog opens for installed themes only; `isNew` is for the catalogue of Add New.
  // The card is the kit `ReadMoreModal`; this file maps the theme onto it and fills the screenshot, rating and preview slots.
  import type { InstalledTheme, RepositoryTheme } from '@/entities/project/instance-themes.api'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import ReadMoreModal from '@/views/projects/project/ui/ReadMoreModal.vue'
  import { newThemeScreenshotSrc, themeScreenshotSrc } from '@/entities/project/instance-themes.api'
  import { decodeEntities } from '@/shared/format/decode-entities'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import StarIcon from '@/shared/ui/icons/star.vue'
  import ImageLoader from '@/shared/ui/loader/ImageLoader.vue'
  import { readMoreRating } from './theme-read-more'

  type ReadMoreItem = InstalledTheme | RepositoryTheme

  const props = withDefaults(defineProps<{
    item: ReadMoreItem | null
    // The catalogue themes of Add New. They show Install instead of the status chip and the actions.
    isNew?: boolean
    // The installed theme's screenshot is served per instance (`themeScreenshotSrc`).
    instanceId: number
    modelValue: boolean
  }>(), {
    isNew: false,
  })

  const emit = defineEmits<{
    'update:model-value': [value: boolean]
    'install-item': [item: RepositoryTheme]
    'action-button-activate': [item: InstalledTheme]
    'action-button-update': [item: InstalledTheme]
  }>()

  const { t } = useTranslation()

  // The title, decoded to text (the API value is not HTML here).
  const title = computed(() => decodeEntities(String(props.item?.title || props.item?.name || '')))

  const previewAriaLabel = computed(() => `${t('button.preview')} ${title.value}`)

  // The description as the card shows it; here it is sanitized (`v-safe-html:external`).
  const description = computed(() => String(props.item?.description || t('message.theme.noDescription')))

  // An installed theme is served by the instance, a catalogue one by its own URL.
  const screenshotSrc = computed(() => {
    if (!props.item) {
      return null
    }
    return props.isNew
      ? newThemeScreenshotSrc(props.item as RepositoryTheme)
      : themeScreenshotSrc(props.instanceId, props.item.name)
  })

  const previewUrl = computed(() => `https://wp-themes.com/${String(props.item?.slug || props.item?.name || '')}`)

  // A green frame for an active theme with no update, red for an active one that has one, grey otherwise.
  const itemStatus = computed((): 'gray' | 'red' | 'green' => {
    if (props.item?.status !== 'active') {
      return 'gray'
    }
    return props.item?.update === 'none' ? 'green' : 'red'
  })

  // The Active / Disabled chip of an installed theme; a catalogue theme has none.
  const chip = computed((): 'active' | 'disabled' | undefined => {
    if (props.isNew || !props.item) {
      return undefined
    }
    return props.item.status === 'active' ? 'active' : 'disabled'
  })

  // Five stars and the number, only for a catalogue theme (`theme-read-more.ts`).
  const rating = computed(() => (props.item ? readMoreRating(props.item) : null))

  function close (): void {
    emit('update:model-value', false)
  }

  // The action buttons exist for an installed theme (`!isNew`), so the item is the installed shape here.
  function activate (): void {
    if (props.item) {
      emit('action-button-activate', props.item as InstalledTheme)
    }
    close()
  }

  function update (): void {
    if (props.item) {
      emit('action-button-update', props.item as InstalledTheme)
    }
    close()
  }

  // The catalogue theme goes to the install dialog, and the Read More closes.
  function install (): void {
    if (props.item) {
      emit('install-item', props.item as RepositoryTheme)
    }
    close()
  }
</script>

<style lang="scss" scoped>
// The theme parts of the Read more card (slots of the kit `ReadMoreModal`): the star at 24 px, the `heading` colour of the eye icon
// (`--v-text-darken2`) and the square preview button. The card itself is styled by `ReadMoreModal.vue`.
.star-icon {
  width: 24px;
  height: 24px;
}

.heading-icon {
  color: var(--v-text-darken2);
}

// `!important` stays as in legacy: the image needs a measurement of the button width, and a change has no parity check.
.preview-button {
  min-width: 46px !important;
}
</style>

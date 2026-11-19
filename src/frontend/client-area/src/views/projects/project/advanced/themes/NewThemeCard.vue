<template>
  <CatalogCard
    :action-busy="inProgress"
    action-icon="$installIcon"
    :action-label="t('button.theme.install')"
    :description="description.text"
    :featured-label="featured ? t('general.featured') : undefined"
    :install-aria-label="installAriaLabel"
    :install-busy="inProgress"
    :install-tooltip="t('tooltip.instance.theme.install')"
    :link-aria-label="previewAriaLabel"
    :link-href="eyeUrl"
    :link-tooltip="item.preview_url ? t('tooltip.instance.theme.preview') : undefined"
    media
    :preview-href="previewUrl"
    :preview-label="t('button.preview')"
    :rating="rating"
    :read-more="hasReadMore"
    :read-more-label="t('button.readMore')"
    :src="screenshotSrc"
    :title="title"
    @action="emit('action-button-install', item)"
    @install="emit('action-button-install', item)"
    @read-more="emit('action-button-read-more', item)"
  />
</template>

<script lang="ts" setup>
  // The card maps the catalogue theme to the card props, on the catalogue card of the kit. The cut description and the install spinner are the plugins' helpers
  // (`@/entities/project/wordpress-items`); the title is decoded to text, so it is not `v-html` as in legacy.
  import type { RepositoryTheme } from '@/entities/project/instance-themes.api'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { newThemeScreenshotSrc } from '@/entities/project/instance-themes.api'
  import CatalogCard from '@/entities/project/ui/catalog/CatalogCard.vue'
  import { CARD_DESCRIPTION_LIMIT, cardDescription, itemAsyncState } from '@/entities/project/wordpress-items'
  import { decodeEntities } from '@/shared/format/decode-entities'
  import { httpUrlOrEmpty } from '@/shared/url/http-url'

  const props = withDefaults(defineProps<{
    item: RepositoryTheme
    /** The ribbon of the first list (featured, not searched). */
    featured?: boolean
  }>(), {
    featured: false,
  })

  const emit = defineEmits<{
    'action-button-install': [item: RepositoryTheme]
    'action-button-read-more': [item: RepositoryTheme]
  }>()

  const { t } = useTranslation()

  const title = computed(() => decodeEntities(props.item.name))
  const installAriaLabel = computed(() => `${t('button.install')} ${title.value}`)
  const previewAriaLabel = computed(() => `${t('button.preview')} ${title.value}`)
  // A custom theme is screenshotted by the API, the others carry `screenshot_url` (`newThemeScreenshotSrc`).
  const screenshotSrc = computed(() => newThemeScreenshotSrc(props.item) ?? undefined)
  const previewUrl = computed(() => `https://wp-themes.com/${props.item.slug}`)
  // The eye button: the API preview for a custom theme, the same wp-themes link otherwise.
  const eyeUrl = computed(() => (props.item.type ? httpUrlOrEmpty(props.item.preview_url) || undefined : previewUrl.value))
  // No guard: a missing rating reads as 0.
  const rating = computed(() => props.item.rating ?? 0)
  // The link follows the raw description.
  const description = computed(() => cardDescription(props.item.description || t('message.theme.noDescription')))
  const hasReadMore = computed(() => (props.item.description || '').length > CARD_DESCRIPTION_LIMIT)
  // The loader replaces the install icon while an install or update is in progress.
  const inProgress = computed(() => itemAsyncState(props.item) !== null)
</script>

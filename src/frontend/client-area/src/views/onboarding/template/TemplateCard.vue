<template>
  <CatalogCard
    :action-label="t('button.theme.use')"
    :action-loading="loading"
    :action-loading-label="t('button.domain.creating')"
    class="template-card"
    media
    :preview-href="item.preview_url"
    :preview-label="t('button.preview')"
    :src="screenshotUrl"
    :title="item.name ?? ''"
    title-only
    @action="emit('select-theme', item)"
  />
</template>

<script lang="ts" setup>
  // The card sits on the catalogue card of the kit.
  // The preview opens in a new tab (`_blank`, the kit default); legacy had a named window.
  import type { OnboardingTheme } from '@/views/onboarding/onboarding.api'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { themeScreenshotUrl } from '@/views/onboarding/onboarding.api'
  import CatalogCard from '@/entities/project/ui/catalog/CatalogCard.vue'

  const props = withDefaults(defineProps<{
    item: OnboardingTheme
    loading?: boolean
  }>(), {
    loading: false,
  })

  const emit = defineEmits<{
    'select-theme': [item: OnboardingTheme]
  }>()

  const { t } = useTranslation()

  // Custom themes come from the API, the others carry their own screenshot.
  const screenshotUrl = computed(() => (
    props.item.type === 'custom' && props.item.id !== undefined
      ? themeScreenshotUrl(props.item.id)
      : props.item.screenshot_url
  ))
</script>

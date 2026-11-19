<template>
  <CatalogCard
    :action-label="t('button.onboarding.goCatalog.install')"
    :action-loading="installing"
    class="go-app-card"
    :data-testid="`go-app-card-${app.slug}`"
    :description="app.tagline ?? ''"
    :details-label="t('button.onboarding.goCatalog.details')"
    media
    :src="app.cover_url ?? undefined"
    :title="app.name"
    @action="emit('install', app)"
    @click="openFromCard"
    @details="emit('open', app)"
  >
    <template #title>
      <h5 class="go-app-card__title">
        <img
          v-if="app.icon_url && !iconFailed"
          alt=""
          class="go-app-card__icon"
          height="32"
          loading="lazy"
          :src="app.icon_url"
          width="32"
          @error="iconFailed = true"
        >

        <button
          class="go-app-card__name"
          :data-testid="`go-app-open-${app.slug}`"
          type="button"
          @click="emit('open', app)"
        >
          {{ app.name }}
        </button>
      </h5>

      <span
        v-if="app.ready_image"
        class="go-app-card__badge"
      >{{ t('heading.onboarding.goCatalog.readyImage') }}</span>
    </template>

    <template
      v-if="replaces"
      #text-append
    >
      <span
        class="go-app-card__replaces"
        :class="{ 'go-app-card__replaces--match': replaces.match }"
        :data-testid="`go-app-replaces-${app.slug}`"
      >{{ t('heading.onboarding.goCatalog.replaces', { apps: replaces.names }) }}</span>
    </template>

    <template #actions>
      <span class="go-app-card__category">{{ firstCategory }}</span>

      <span class="go-app-card__stats">
        <span
          v-if="stars"
          class="go-app-card__stat"
          :data-testid="`go-app-stars-${app.slug}`"
          :title="starsTitle"
        >
          <v-icon
            icon="$starFullIcon"
            size="18"
          />
          {{ stars }}
        </span>
      </span>
    </template>
  </CatalogCard>
</template>

<script lang="ts" setup>
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import CatalogCard from '@/entities/project/ui/catalog/CatalogCard.vue'
  import { type GoApp, replacesLine, starsLabel, starsTitle as starsTitleOf } from './go-catalog.api'

  // One app of the Go catalog grid on the kit's catalogue card (as the theme chooser): the cover with Install and Details on hover, the
  // icon and the name, the tagline and what it replaces (the product the search found, in bold), then the first category and the
  // repository's stars. How often an app was tried on Go is not shown in the panel (owner, 2026-11-17). Install deploys it at once (as a
  // Git project); Details, the name or the rest of the card open its details.
  const props = defineProps<{
    app: GoApp
    /** This card's install reads the app's recipe from Go, then the deploy starts. */
    installing?: boolean
    /** The search the list was asked with. */
    query?: string
  }>()
  const emit = defineEmits<{
    open: [app: GoApp]
    install: [app: GoApp]
  }>()

  const { t } = useTranslation()
  const iconFailed = ref(false)
  const firstCategory = computed(() => props.app.categories?.[0] ?? '')
  const stars = computed(() => starsLabel(props.app.stars))
  const starsTitle = computed(() => starsTitleOf(props.app, t))
  const replaces = computed(() => replacesLine(props.app, props.query ?? ''))

  /** A click anywhere else on the card opens the details; its buttons and links do their own thing. */
  function openFromCard (event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('button, a')) {
      return
    }
    emit('open', props.app)
  }
</script>

<style lang="scss" scoped>
  @use '@/app/styles/legacy/tokens/variables' as v;

  // The cards of a row are as tall as the tallest; the footer sits at the bottom.
  .go-app-card {
    height: 100%;
    cursor: pointer;

    :deep(.v-card) {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    :deep(.v-card-text > span:first-child) {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }

    :deep(.v-card-actions) {
      justify-content: space-between;
      gap: 12px;
      margin-top: auto;
    }
  }

  .go-app-card__title {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    margin: 0;
  }

  .go-app-card__icon {
    flex: none;
    border-radius: 6px;
    object-fit: cover;
  }

  .go-app-card__name {
    overflow: hidden;
    padding: 0;
    font: inherit;
    color: inherit;
    text-align: left;
    white-space: nowrap;
    text-overflow: ellipsis;
    background: none;
    border: 0;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      color: var(--v-primary-darken1);
    }
  }

  .go-app-card__badge {
    flex: none;
    padding: 2px 8px;
    font-size: v.$font-size-xxs;
    font-weight: v.$font-weight-semibold;
    color: var(--v-primary-base);
    border: 1px solid var(--v-primary-lighten2);
    border-radius: 4px;
  }

  .go-app-card__replaces {
    display: block;
    margin-top: 8px;
    color: var(--v-gray-darken1);

    &--match {
      font-weight: v.$font-weight-bold;
      color: var(--v-primary-darken1);
    }
  }

  .go-app-card__category {
    overflow: hidden;
    font-size: v.$font-size-sm;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--v-gray-darken1);
  }

  .go-app-card__stats {
    display: flex;
    flex: none;
    align-items: center;
    gap: 12px;
  }

  .go-app-card__stat {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: v.$font-size-sm;
    font-weight: v.$font-weight-bold;
    white-space: nowrap;
    color: var(--v-text-darken2);
  }
</style>

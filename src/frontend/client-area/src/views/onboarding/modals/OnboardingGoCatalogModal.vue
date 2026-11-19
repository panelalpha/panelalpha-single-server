<template>
  <OnboardingDialog
    close-on-back
    data-testid="onboarding-go-catalog-modal"
    fullscreen
    :model-value="modelValue"
  >
    <div class="go-catalog">
      <!-- An app's details: the bar with Back and close, then the app (only the page under the bar scrolls). -->
      <template v-if="catalog.selected.value">
        <header class="go-catalog__bar">
          <AppButton
            data-testid="go-catalog-back"
            variant="text"
            @click="back"
          >
            <v-icon
              icon="$arrowleft"
              size="18"
            />
            {{ t('button.back') }}
          </AppButton>

          <ModalCloseButton
            data-testid="go-catalog-close"
            :push-right="false"
            @click="emit('remove-modal')"
          />
        </header>

        <div class="go-catalog__scroll go-catalog__scroll--bare">
          <main class="go-catalog__content">
            <GoAppDetailsView
              :app="catalog.selected.value"
              :deploying="deploying"
              :failed="catalog.detailsFailed.value"
              :loading="catalog.loadingDetails.value"
              @deploy="emit('deploy', $event)"
            />
          </main>
        </div>
      </template>

      <!-- The catalog, laid out as the theme chooser (logo, title, categories with Back, the count and search, the cards). It stays
           mounted under an app's details, so Back returns to the same place of the list. -->
      <div
        v-show="!catalog.selected.value"
        class="go-catalog__scroll go-catalog__scroll--bare"
      >
        <ModalCloseButton
          class="go-catalog__close"
          data-testid="go-catalog-close-list"
          :push-right="false"
          @click="emit('remove-modal')"
        />

        <div :class="mobile ? 'px-6' : 'px-16'">
          <v-container
            class="px-0"
            fluid
          >
            <v-row class="pt-8 d-flex justify-center flex-column align-center text-center go-catalog__top">
              <img
                :alt="t('heading.onboarding.instanceSource.go.title')"
                class="go-catalog__logo"
                :height="mobile ? 36 : 44"
                :src="isDark ? logoWhite : logo"
                :width="mobile ? 171 : 200"
              >

              <h1 class="pt-8">
                {{ t('heading.onboarding.goCatalog.title') }}
              </h1>

              <span>{{ t('heading.onboarding.goCatalog.subtitle') }}</span>
            </v-row>

            <v-row no-gutters>
              <TagsSidebar
                :back-label="t('button.back')"
                :default-theme-categories="DEFAULT_CATEGORIES"
                :group="activeCategory"
                :groups="categoryItems"
                @go-back="emit('go-back')"
                @update:group="pickCategory"
              />

              <v-col
                class="go-catalog__main"
                :class="[lgAndDown ? '' : 'pl-12', mobile ? 'pt-0' : 'pl-6']"
                :lg="10"
                :md="9"
                :sm="12"
              >
                <div
                  v-if="catalogShown"
                  class="go-catalog__filters"
                  :class="{ 'go-catalog__filters--mobile': smAndDown }"
                >
                  <AppButton
                    v-if="mobile"
                    :block="smAndDown"
                    color="gray"
                    data-testid="go-catalog-back-mobile"
                    elevation="0"
                    size="small"
                    variant="outlined"
                    @click="emit('go-back')"
                  >
                    <v-icon
                      color="gray-darken-1"
                      icon="$arrowleft"
                      size="16px"
                    />
                    {{ t('button.back') }}
                  </AppButton>

                  <span
                    class="go-catalog__count"
                    data-testid="go-catalog-count"
                  >
                    <b>{{ catalog.total.value }}</b> {{ countLabel }}
                  </span>

                  <div
                    class="go-catalog__search"
                    data-testid="go-catalog-search"
                  >
                    <DataIteratorFilterControls
                      :full-width-lg="false"
                      :full-width-search="false"
                      :keys="sortKeys"
                      :search-placeholder="t('heading.onboarding.goCatalog.searchPlaceholder')"
                      :search-term="catalog.searchTerm.value"
                      :show-search-term="true"
                      :sort-by="sortHeader"
                      @update:search-term="catalog.searchTerm.value = $event"
                      @update:sort-by="pickSort"
                    />
                  </div>
                </div>

                <div
                  v-if="catalog.loadingStatus.value"
                  class="go-catalog__state"
                >
                  <v-progress-circular
                    color="primary"
                    indeterminate
                    size="32"
                    width="3"
                  />
                </div>

                <div
                  v-else-if="catalog.failure.value === 'hub_not_connected'"
                  class="go-catalog__state go-catalog__notice"
                  data-testid="go-catalog-connect-hub"
                >
                  <h3>{{ t('heading.onboarding.goCatalog.connectHub.title') }}</h3>
                  <p>{{ t('heading.onboarding.goCatalog.connectHub.text') }}</p>

                  <AppButton
                    kind="primary"
                    size="large"
                    @click="emit('connect-hub')"
                  >
                    {{ t('button.onboarding.goCatalog.connectHub') }}
                  </AppButton>
                </div>

                <div
                  v-else-if="catalog.failure.value === 'go_unavailable'"
                  class="go-catalog__state go-catalog__notice"
                  data-testid="go-catalog-unavailable"
                >
                  <h3>{{ t('heading.onboarding.goCatalog.unavailable.title') }}</h3>
                  <p>{{ t('heading.onboarding.goCatalog.unavailable.text') }}</p>

                  <AppButton
                    kind="secondary"
                    size="large"
                    @click="catalog.open"
                  >
                    {{ t('button.try') }}
                  </AppButton>
                </div>

                <v-row
                  v-else-if="catalog.loadingApps.value && catalog.apps.value.length === 0"
                  class="go-catalog__grid"
                >
                  <v-col
                    v-for="item in 6"
                    :key="item"
                    class="pa-4 go-catalog__col"
                    cols="12"
                    :lg="4"
                    :md="6"
                    :sm="6"
                    :xl="4"
                  >
                    <CatalogCardSkeleton media />
                  </v-col>
                </v-row>

                <DataIteratorNoResultsContainer
                  v-else-if="catalog.apps.value.length === 0"
                  data-testid="go-catalog-empty"
                  :search-term="catalog.searchTerm.value || catalog.category.value || ' '"
                  @clear-all-filters="catalog.clearFilters"
                />

                <template v-else>
                  <v-row
                    class="go-catalog__grid"
                    :class="{ 'go-catalog__grid--busy': catalog.loadingApps.value }"
                  >
                    <v-col
                      v-for="app in catalog.apps.value"
                      :key="app.slug"
                      class="pa-4 go-catalog__col"
                      cols="12"
                      :lg="4"
                      :md="6"
                      :sm="6"
                      :xl="4"
                    >
                      <GoAppCard
                        :app="app"
                        :installing="catalog.installing.value === app.slug"
                        :query="catalog.query.value"
                        @install="installApp"
                        @open="openApp"
                      />
                    </v-col>
                  </v-row>

                  <div
                    v-if="catalog.hasMore.value"
                    class="go-catalog__more"
                  >
                    <AppButton
                      data-testid="go-catalog-more"
                      kind="secondary"
                      :loading="catalog.loadingMore.value"
                      size="large"
                      @click="catalog.loadMore"
                    >
                      {{ t('button.onboarding.goCatalog.showMore') }}
                    </AppButton>
                  </div>
                </template>
              </v-col>
            </v-row>
          </v-container>
        </div>
      </div>
    </div>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  import type { GoApp, GoAppDetails } from '@/views/onboarding/go/go-catalog.api'
  import type { TemplateCategory } from '@/views/onboarding/template/template-model'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { useTranslation } from 'i18next-vue'
  import { computed, toRef, watch } from 'vue'
  import { useDisplay, useTheme } from 'vuetify'
  import logoWhite from '@/views/onboarding/go/assets/logo-go-white.svg'
  import logo from '@/views/onboarding/go/assets/logo-go.svg'
  import { useGoCatalog } from '@/views/onboarding/go/go-catalog'
  import { GO_SORT_KEYS, GO_SORTS } from '@/views/onboarding/go/go-catalog.api'
  import GoAppCard from '@/views/onboarding/go/GoAppCard.vue'
  import GoAppDetailsView from '@/views/onboarding/go/GoAppDetailsView.vue'
  import TagsSidebar from '@/views/onboarding/template/TagsSidebar.vue'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import CatalogCardSkeleton from '@/entities/project/ui/catalog/CatalogCardSkeleton.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
  import ModalCloseButton from '@/shared/ui/modal/ModalCloseButton.vue'

  // The PanelAlpha Go source: Go's verified apps, full page, laid out as the theme chooser of a WordPress project (the
  // owner's mockup): the GO! logo and title, the categories with Back on the left, the count and the search, the cards. Go
  // only answers what a Git deploy needs (the repository and branch); the panel reads it with its Hub token. A panel not paired with the
  // Hub gets the "connect" prompt, a Go outage the "unavailable" one. Install on a card, or in an app's details, hands the app (with the
  // `install` Go answered for it) to the flow, which deploys its repository as a Git project.
  const props = defineProps<{
    modelValue: boolean
    /** The flow's deploy request runs (the progress opens right after). */
    deploying?: boolean
  }>()
  const emit = defineEmits<{
    'deploy': [app: GoAppDetails]
    'connect-hub': []
    'go-back': []
    'remove-modal': []
  }>()

  /** The sidebar's first entry: every app, in Go's own order. */
  const ALL_APPS: TemplateCategory = { text: 'popular', value: 'all', type: 'default' }
  /** The sidebar's second entry: every app, the most recently verified first. */
  const LATEST: TemplateCategory = { text: 'latest', value: 'latest', type: 'default' }
  const DEFAULT_CATEGORIES: TemplateCategory[] = [ALL_APPS, LATEST]
  const sortKeys = GO_SORT_KEYS

  const { t } = useTranslation()
  const { mobile, smAndDown, lgAndDown } = useDisplay()
  const theme = useTheme()
  const catalog = useGoCatalog()

  const isDark = computed(() => theme.global.current.value.dark)
  const catalogShown = computed(() => !catalog.loadingStatus.value && !catalog.failure.value)
  const categoryItems = computed<TemplateCategory[]>(() => catalog.categories.value.map(category => ({
    name: category.name,
    value: category.name,
    type: 'category',
    count: category.apps,
  })))
  const sortHeader = computed(() => sortKeys.find(item => item.value === catalog.sort.value) ?? false)
  /** "120 apps", "3 apps match “uptime”", "+ in Monitoring". */
  const countLabel = computed(() => {
    const count = catalog.total.value
    const base = catalog.query.value
      ? t('heading.onboarding.goCatalog.match', { count, query: catalog.query.value })
      : t('heading.onboarding.goCatalog.apps', { count })
    return catalog.category.value ? `${base} ${t('heading.onboarding.goCatalog.inCategory', { category: catalog.category.value })}` : base
  })
  const activeCategory = computed<TemplateCategory>(() => (
    catalog.latest.value
      ? LATEST
      : (catalog.category.value === null
        ? ALL_APPS
        : categoryItems.value.find(item => item.value === catalog.category.value) ?? { name: catalog.category.value, value: catalog.category.value, type: 'category' })
  ))

  watch(toRef(props, 'modelValue'), open => {
    if (open) {
      void catalog.open()
    } else {
      catalog.reset()
    }
  }, { immediate: true })

  function pickCategory (item: TemplateCategory): void {
    if (item.value === LATEST.value) {
      catalog.showLatest()
      return
    }
    catalog.selectCategory(item.type === 'default' ? null : String(item.value))
  }

  function pickSort (header: LegacySortHeader): void {
    const value = GO_SORTS.find(sort => sort === header.value)
    if (value) {
      catalog.selectSort(value)
    }
  }

  /** Install on a card: the same deploy as the details' button, with the recipe Go answers now. */
  async function installApp (app: GoApp): Promise<void> {
    const details = await catalog.recipe(app)
    if (details?.install?.git_repo) {
      emit('deploy', details)
    } else if (details) {
      // Go answered no recipe: the details show the app with its button disabled.
      await catalog.openApp(app)
    }
  }

  /** Back in an app's details: to the catalog. The catalog's own Back (the sidebar) returns to the type choice. */
  function back (): void {
    catalog.closeApp()
  }

  async function openApp (app: GoApp): Promise<void> {
    await catalog.openApp(app)
  }
</script>

<style lang="scss" scoped>
  @use '@/app/styles/legacy/tokens/variables' as v;

  .go-catalog {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    color: var(--v-text-darken2);
    background: var(--v-body-base);

    &__bar {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 24px;
      background: rgb(var(--v-theme-surface));
      border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
    }

    &__scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    // The catalog and the app view scroll without a visible bar, as the mockup (wheel, touch and keys still scroll them).
    &__scroll--bare {
      scrollbar-width: none;

      &::-webkit-scrollbar {
        display: none;
      }
    }

    &__content {
      max-width: 1240px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }

    &__close {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 20;
    }

    &__logo {
      object-fit: contain;
    }

    &__top {
      position: relative;
      z-index: 1;

      span {
        margin-top: 4px;
        color: var(--v-text-base);
      }
    }

    &__main {
      position: relative;
      padding-bottom: 64px;
    }

    // The count on the left, the search on the right; it stays on top while the cards scroll under it.
    &__filters {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin: 32px 0 8px;
      padding: 24px 0 16px;
      background: var(--v-body-base);

      // The bar's background reaches 24 px past the column on both sides, so the cards (and their shadows) scrolling under it never show
      // beside the count or the search (the theme chooser's `.sticky-filters::before`).
      &::before {
        content: '';
        position: absolute;
        inset: 0 -24px;
        z-index: -1;
        background: var(--v-body-base);
      }

      &--mobile {
        flex-wrap: wrap;
        margin-top: 8px;
        padding-top: 16px;
      }
    }

    &__count {
      font-size: v.$font-size-sm;
      line-height: 20px;
      color: var(--v-gray-darken1);

      b {
        color: var(--v-text-darken2);
      }
    }

    // The sort menu, then the search (360 px), on the right.
    &__search {
      flex: 0 1 560px;
      min-width: 0;
      margin-left: auto;

      :deep(.data-iterator-filter-controls__item--sort-instances) {
        flex: none;
      }

      :deep(.data-iterator-filter-controls__item:last-child) {
        flex: 1 1 auto;
        min-width: 0;
      }

      :deep(.data-iterator-filter-controls__item:last-child > div) {
        width: 100%;
      }
    }

    &__filters--mobile &__search {
      flex: 1 1 100%;
    }

    // V2 rows: no gap between the columns, the 16 px padding of every column spaces the cards (the theme chooser's grid).
    &__grid {
      --v-col-gap-x: 0px;
      --v-col-gap-y: 0px;

      margin: 0 -16px;
      transition: opacity 0.15s ease;

      &--busy {
        opacity: 0.55;
      }
    }

    // Three cards a row from the panel's `xl` (1200 px) on, four from 1920 px, as the mockup (the panel's grid has no larger breakpoint).
    @media (min-width: 1920px) {
      &__col {
        flex: 0 0 25%;
        max-width: 25%;
      }
    }

    &__more {
      display: flex;
      justify-content: center;
      margin-top: 24px;
    }

    &__state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      text-align: center;
    }

    &__notice {
      max-width: 560px;
      margin: 32px auto 0;
      background: rgb(var(--v-theme-surface));
      border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
      border-radius: 16px;

      h3 {
        margin-bottom: 8px;
        font-size: 20px;
        font-weight: 700;
      }

      p {
        margin-bottom: 24px;
        color: rgba(var(--v-theme-on-surface), 0.7);
      }
    }
  }
</style>

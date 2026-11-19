<template>
  <OnboardingDialog
    :body-lock="false"
    data-testid="onboarding-choose-template-modal"
    fullscreen
    :model-value="modelValue"
  >
    <v-card class="onboarding-template-card">
      <v-overlay
        class="onboarding-loading-overlay"
        :close-on-back="false"
        content-class="onboarding-loading-overlay__content"
        :model-value="loading"
        persistent
        :scrim="false"
        z-index="1400"
      >
        <div class="d-flex flex-column align-center justify-center px-6">
          <v-progress-circular
            color="primary"
            indeterminate
            size="28"
            width="3"
          />

          <div
            v-if="loadingText"
            class="mt-4 p-2 font-weight-medium text-center"
            :class="isDark ? 'onboarding-loading-overlay__text--dark' : 'onboarding-loading-overlay__text--light'"
          >
            {{ t(loadingText) }}
          </div>
        </div>
      </v-overlay>

      <div :class="mobile ? 'px-6' : 'px-16'">
        <v-container
          class="px-0"
          fluid
        >
          <v-row class="pt-8 d-flex justify-center flex-column align-center top-info">
            <v-img
              contain
              :height="mobile ? 36 : 44"
              position="center center"
              :src="logoSrc"
              :width="mobile ? 171 : 200"
            />

            <h1 class="pt-8">
              {{ t('heading.onboarding.chooseTheme.title') }}
            </h1>

            <span>{{ t('heading.onboarding.chooseTheme.subtitle') }}</span>
          </v-row>

          <v-row no-gutters>
            <TagsSidebar
              v-if="!loadingThemeCategories"
              :default-theme-categories="DEFAULT_THEME_CATEGORIES"
              :group="selectedThemeCategory"
              :groups="themeCategories"
              :recommended-themes="recommendedThemes"
              @go-back="emit('go-back')"
              @update:group="selectedThemeCategory = $event"
            />

            <TagsSidebarSkeleton v-else />

            <v-col
              :class="[lgAndDown ? '' : 'pl-12', mobile ? 'pt-0' : 'pl-6']"
              :lg="10"
              :md="9"
              :sm="12"
              style="position: relative"
            >
              <v-row
                class="d-flex align-center justify-space-between mb-4 sticky-filters"
                :class="mobile ? 'mt-0 mx-4' : 'mt-8 mx-4'"
              >
                <div
                  class="d-flex w-100"
                  :class="smAndDown ? 'flex-column' : ''"
                >
                  <AppButton
                    v-if="mobile"
                    id="#switch"
                    ref="switch"
                    :block="smAndDown"
                    class="mt-0 pt-0"
                    :class="smAndDown ? 'mb-5' : ''"
                    color="gray"
                    :disabled="loading"
                    elevation="0"
                    size="small"
                    style="max-width: 300px !important"
                    variant="outlined"
                    @click="emit('go-back')"
                  >
                    <v-icon
                      color="gray-darken-1"
                      icon="$arrowleft"
                      size="16px"
                    />
                    {{ t('button.dashboard.back') }}
                  </AppButton>

                  <div class="d-flex ml-auto align-center">
                    <DataIteratorFilterControls
                      :disabled="loading"
                      :full-width-search="false"
                      :keys="THEME_SORT_KEYS"
                      :search-term="searchTerm"
                      :show-search-term="true"
                      :sort-by="sortBy"
                      :sort-desc="sortDesc"
                      @update:search-term="handleSearchTermChange"
                      @update:sort-by="changeSortBy"
                    />
                  </div>
                </div>
              </v-row>

              <!-- Search and sort run on the server. -->
              <div class="d-flex mx-4 flex-wrap flex-row">
                <!-- Legacy shows the `v-data-iterator` `loading` slot while the page loads: a plain `div` (no row margin), not the row of the `default` slot. -->
                <div
                  v-if="loadingThemes"
                  class="d-flex w-100 flex-wrap"
                >
                  <v-col
                    v-for="item in 8"
                    :key="item"
                    class="px-4 py-4"
                    cols="12"
                    :lg="4"
                    :md="6"
                    :sm="6"
                    :xl="3"
                  >
                    <TemplateCardSkeleton />
                  </v-col>
                </div>

                <template v-else-if="themes.length === 0">
                  <DataIteratorNoResultsContainer
                    v-if="searchTerm"
                    :search-term="searchTerm"
                    @clear-all-filters="clearFilters"
                  />

                  <div
                    v-else
                    class="no-data-container d-flex flex-column align-center justify-center mt-10 mr-20"
                  >
                    <ThemeNoData />

                    <h4 class="mb-4">
                      {{ t('message.emptyTable.chooseTheme.title') }}
                    </h4>

                    <p class="p-1">
                      {{ t('message.emptyTable.chooseTheme.subtitle') }}
                    </p>
                  </div>
                </template>

                <v-row
                  v-else
                  class="d-flex flex-wrap"
                >
                  <v-col
                    v-for="(item, index) in themes"
                    :key="`${item.slug}-${index}`"
                    class="py-4 px-4"
                    cols="12"
                    :lg="4"
                    :md="6"
                    :sm="6"
                    :xl="3"
                  >
                    <TemplateCard
                      :item="item"
                      @select-theme="selectTheme"
                    />
                  </v-col>

                  <div
                    v-if="!loadingThemes && !allThemesLoaded && themes.length > 0"
                    class="d-flex align-center justify-center flex-column"
                    style="height: 92px; width: 100%"
                  >
                    <v-progress-circular
                      color="primary"
                      indeterminate
                      size="24"
                      width="4"
                    />

                    <span class="text-primary p-4 mt-3">{{ t('message.loading') }}</span>
                  </div>
                </v-row>
              </div>
            </v-col>
          </v-row>
        </v-container>
      </div>
    </v-card>

    <template v-if="!loadingThemes && !allThemesLoaded && themes.length > 0">
      <div v-intersect.quiet="onIntersect" />
    </template>
  </OnboardingDialog>
</template>

<script lang="ts" setup>
  // Its data loading is
  // the watcher set of the legacy component; `DataIteratorPageMixin`'s `reloadData()` is not ported (it threw on every sort).
  import type { OnboardingService } from '@/views/onboarding/onboarding-service'
  import type { OnboardingTheme, OnboardingThemePage } from '@/views/onboarding/onboarding.api'
  import type { TemplateCategory } from '@/views/onboarding/template/template-model'
  import { useTranslation } from 'i18next-vue'
  import { computed, nextTick, ref, watch } from 'vue'
  import { useDisplay, useTheme } from 'vuetify'
  import { Intersect } from 'vuetify/directives'
  import ThemeNoData from '@/views/onboarding/illustrations/ThemeNoData.vue'
  import {
    getRecommendedThemes,
    getThemeCategories,
    getThemes,
    getThemesFromCategory,
    THEMES_PER_PAGE,
  } from '@/views/onboarding/onboarding.api'
  import TagsSidebar from '@/views/onboarding/template/TagsSidebar.vue'
  import TagsSidebarSkeleton from '@/views/onboarding/template/TagsSidebarSkeleton.vue'
  import {
    addDividersToThemeCategories,
    DEFAULT_THEME_CATEGORIES,
    sortKeyFor,
    THEME_SORT_KEYS,
    themeSource,
  } from '@/views/onboarding/template/template-model'
  import TemplateCard from '@/views/onboarding/template/TemplateCard.vue'
  import TemplateCardSkeleton from '@/views/onboarding/template/TemplateCardSkeleton.vue'
  import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
  import { useThemeStore } from '@/shared/theme/theme.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
  import { resolveBrandLogoSrc } from '@/shared/ui/logo/brand-logo'

  const props = defineProps<{
    modelValue: boolean
    service: OnboardingService | null
    loading?: boolean
    loadingText?: string | null
  }>()

  const emit = defineEmits<{
    'go-back': []
    'theme-selected': [theme: OnboardingTheme]
  }>()

  const vIntersect = Intersect
  const { t } = useTranslation()
  const { mobile, smAndDown, lgAndDown } = useDisplay()
  const theme = useTheme()
  const themeStore = useThemeStore()

  const isDark = computed(() => theme.global.current.value.dark)
  const logoSrc = computed(() => resolveBrandLogoSrc(
    { logo: themeStore.lightLogo, darkLogo: themeStore.darkLogo },
    isDark.value,
  ))

  const loadingThemeCategories = ref(false)
  const loadingThemes = ref(false)
  const allThemesLoaded = ref(false)
  const allThemesCount = ref(0)
  const themes = ref<OnboardingTheme[]>([])
  const page = ref(1)
  const sortBy = ref(THEME_SORT_KEYS[0])
  const sortDesc = ref(false)
  const searchTerm = ref('')
  const themeCategories = ref<TemplateCategory[]>([])
  const selectedThemeCategory = ref<TemplateCategory>(DEFAULT_THEME_CATEGORIES[0])
  // Only the recommended loader sets `recommendedThemes`, and nothing calls that loader on open (legacy compares a boolean's `.length`).
  const recommendedThemes = ref(false)

  /** The page loader of the selected sidebar entry. Search applies to the default lists only (legacy never sends it for the others). */
  function loaderFor (category: TemplateCategory): (pageNumber: number) => Promise<OnboardingThemePage> {
    const source = themeSource(category)
    if (source === 'default') {
      return pageNumber => getThemes({
        page: pageNumber,
        perPage: THEMES_PER_PAGE,
        browse: String(category.value),
        searchTerm: searchTerm.value,
        serviceId: props.service?.id ?? null,
      })
    }
    if (source === 'recommended') {
      return pageNumber => getRecommendedThemes(pageNumber)
    }
    return pageNumber => getThemesFromCategory(category.id ?? '', pageNumber)
  }

  /** Legacy default loaders set the sort option from the list they show. */
  function syncSortBy (category: TemplateCategory): void {
    if (themeSource(category) === 'default') {
      sortBy.value = sortKeyFor(category) ?? sortBy.value
    }
  }

  // A new list (category, search) bumps the generation and a next page takes its own number: an answer from an older list
  // or an older page request is dropped, so a late answer cannot overwrite or duplicate the list.
  let listGeneration = 0
  let pageRequest = 0
  // One next page at a time: the sentinel may report again while the previous page is still loading.
  const loadingMore = ref(false)

  /** Replaces the list. */
  async function loadFirstPage (): Promise<void> {
    const category = selectedThemeCategory.value
    const source = themeSource(category)
    const generation = ++listGeneration
    syncSortBy(category)
    loadingThemes.value = true
    try {
      // Legacy: the default list reads the current page, the other two always ask for page 1.
      const response = await loaderFor(category)(source === 'default' ? page.value : 1)
      if (generation !== listGeneration) {
        return
      }
      themes.value = response.data
      if (source === 'recommended') {
        recommendedThemes.value = response.data.length > 0
      }
    } catch {
      // Legacy has no catch here: the list keeps what it shows.
    } finally {
      if (generation === listGeneration) {
        page.value = 1
        loadingThemes.value = false
      }
    }
  }

  /** Appends from page 2 on. */
  async function loadNextPage (): Promise<void> {
    const category = selectedThemeCategory.value
    const current = page.value
    const generation = listGeneration
    const request = ++pageRequest
    syncSortBy(category)
    loadingMore.value = true
    try {
      const response = await loaderFor(category)(current)
      if (generation !== listGeneration || request !== pageRequest) {
        return
      }
      themes.value = current === 1 ? response.data : [...themes.value, ...response.data]
      allThemesCount.value = response.meta?.total ?? 0
      allThemesLoaded.value = themes.value.length === allThemesCount.value
    } catch {
      // Legacy has no catch here: the list keeps what it shows.
    } finally {
      if (request === pageRequest) {
        loadingMore.value = false
      }
    }
  }

  async function loadThemeCategories (): Promise<void> {
    loadingThemeCategories.value = true
    try {
      themeCategories.value = addDividersToThemeCategories(await getThemeCategories())
    } catch {
      // Legacy has no catch here.
    } finally {
      loadingThemeCategories.value = false
    }
  }

  function resetAndLoad (): void {
    allThemesCount.value = 0
    allThemesLoaded.value = false
    void loadFirstPage()
  }

  // Every page change appends the next page of the selected list.
  watch(page, () => {
    allThemesLoaded.value = false
    allThemesCount.value = 0
    void loadNextPage()
  })

  // A new search term or category starts a new list from page 1.
  watch(searchTerm, resetAndLoad)
  watch(selectedThemeCategory, resetAndLoad)

  // A plan with a default theme skips the chooser: the theme is selected as soon as it opens.
  watch(() => props.modelValue, open => {
    if (!open) {
      return
    }
    const planDefaultTheme = props.service?.plan_default_theme
    if (planDefaultTheme) {
      emit('theme-selected', { slug: String(planDefaultTheme) })
    }
    void loadThemeCategories()
    if (themes.value.length === 0) {
      void loadFirstPage()
    }
  })

  function onIntersect (isIntersecting: boolean): void {
    if (isIntersecting) {
      infiniteScrolling()
    }
  }

  function infiniteScrolling (): void {
    if (loadingMore.value) {
      return
    }
    void nextTick(() => {
      page.value = page.value + 1
    })
  }

  function selectTheme (item: OnboardingTheme): void {
    emit('theme-selected', item)
  }

  function clearFilters (): void {
    searchTerm.value = ''
  }

  // Back to page 1, the `searchTerm` watcher reloads.
  function handleSearchTermChange (value: string): void {
    page.value = 1
    searchTerm.value = value
  }

  // Page 1 and the new sort option. Legacy then called `reloadData()`, which is not defined (TypeError),
  // so the list did not reload on a sort change; the same here.
  function changeSortBy (value: typeof sortBy.value): void {
    page.value = 1
    sortBy.value = value
  }
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  // Doubled class (0,3,0): beats the global `.v-theme--dark .v-card` (0,2,0) that paints the panel colour in dark, without `!important`.
  .v-card.onboarding-template-card {
    background-color: var(--v-body-base);
    position: relative;
    // V2 `.v-dialog--fullscreen > .v-card` is `min-height: 100%`: the card grows with its content and the dialog scrolls (V4 fixes it at the viewport height).
    height: auto;
    min-height: 100%;
  }

  // V2 `.container` padded 12px and `.row:not(.no-gutters)` had `margin: -16px`; V4 pads the container 16px and spaces rows and columns
  // with a 24px `gap`.
  .onboarding-template-card {
    .v-container {
      padding-top: 12px;
      padding-bottom: 12px;
    }

    .v-row:not(.v-row--no-gutters) {
      --v-col-gap-x: 0px;
      --v-col-gap-y: 0px;

      margin: -16px;
    }
  }

  // V2 `.v-overlay` took the card's 8px radius and a white text colour (the frosted fill is in
  // `_dialog.scss`). The V4 overlay is teleported, so its content class needs `:global` (a scoped rule never reaches it).
  .onboarding-loading-overlay {
    border-radius: 8px;
    color: var(--v-white-base);
  }

  :global(.onboarding-loading-overlay__content) {
    height: 100vh;
    width: 100vw;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .onboarding-loading-overlay__text--dark {
    color: var(--v-onboarding-loading-dark);
  }

  .onboarding-loading-overlay__text--light {
    color: var(--v-onboarding-loading-light);
  }

  .sticky-filters {
    position: sticky;
    top: 24px;
    z-index: 900;

    &::before {
      position: absolute;
      content: '';
      width: calc(100% + 80px);
      height: calc(100% + 40px);
      left: -40px;
      top: -24px;
    }
  }

  .top-info {
    position: relative;
    z-index: 1011;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .no-data-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-content: center;
    padding: 40px;
    border: 1px dashed map.get(v.$gray, lighten2);
    border-radius: 8px;
    margin: 16px 0 32px 0;
  }
</style>

<template>
  <div class="themes-container">
    <template v-if="addThemes">
      <PageTitle
        :title="t('heading.instance.advanced.theme.add.title')"
        variant="advanced"
      >
        <template #title-prepend>
          <AppButton
            :aria-label="t('button.back')"
            class="mr-2"
            kind="icon"
            size="small"
            @click="closeAddNew"
          >
            <v-icon
              icon="$arrowleft"
              size="24"
            />
          </AppButton>
        </template>

        <template #title-append>
          <ListGridSwitch
            v-if="showListSwitch(width)"
            v-model:list-style="listStyle"
            :disabled="newThemes.empty"
            :grid-label="t('button.grid')"
            :list-label="t('button.table')"
          />
        </template>

        <template #filters>
          <DataIteratorFilterControls
            :disabled="newThemes.empty"
            :keys="!listStyle ? newThemeSortKeys : undefined"
            :show-search-term="false"
            :sort-by="!listStyle ? newThemes.sortBy : undefined"
            @update:sort-by="newThemes.setSortBy"
          />
        </template>
      </PageTitle>

      <!-- `px-0 mb-6` in a 12 px V2 container under the tab's `pt-1`; the V4 container pads 16 px, so the box moves 4 px up and its bottom margin is 4 px. -->
      <v-container class="px-0 mt-n1 mb-1">
        <v-row class="mx-0">
          <NewItemSearchCard
            :model-value="newThemes.searchTerm"
            :placeholder="t('form.placeholder.search')"
            :tags="addTags"
            :tags-label="t('heading.instance.plugin.add.tags')"
            @search="searchNew"
            @update:model-value="searchNew"
          />
        </v-row>
      </v-container>

      <template v-if="newThemes.empty">
        <v-container class="px-0 add-empty-container">
          <v-row class="mx-0">
            <v-card
              class="w-100 d-flex align-center"
              elevation="4"
              style="min-height: 360px"
            >
              <EmptyState
                class="my-auto"
                :desc="t('message.emptyTable.theme.add.description')"
                :title="t('message.emptyTable.theme.add.title')"
              >
                <template #image>
                  <NewThemesEmptyIllustration />
                </template>

                <template #action>
                  <AppButton
                    block
                    kind="secondary"
                    size="large"
                    @click="closeAddNew"
                  >
                    <span class="text-gray-darken-1">{{ t('button.back') }}</span>
                  </AppButton>
                </template>
              </EmptyState>
            </v-card>
          </v-row>
        </v-container>
      </template>

      <!-- The empty state replaces the iterator and the table. -->
      <template v-else>
        <!-- The table on desktop with the table list style (a window of 1200 px and wider), the grid otherwise. -->
        <v-container
          v-if="listStyle === 1 && !lgAndDown"
          class="add-content-container"
        >
          <v-row>
            <v-col cols="12">
              <NewThemeTable
                :featured="newThemes.featured"
                :items="newThemes.loading ? [] : newThemes.tableItems"
                :items-per-page="Number(newThemes.itemsPerPage)"
                :items-total="newThemes.itemsTotal"
                :loading="newThemes.loading"
                :page="newThemes.page"
                :possible-items-per-page="newThemes.possibleItemsPerPage"
                :sort-by="newThemes.sortBy"
                :sort-desc="newThemes.sortDesc"
                @action-button-install="actions.openInstall"
                @read-more="openCatalogReadMore"
                @update:items-per-page="newThemes.changePerPage"
                @update:page="newThemes.changePage"
                @update:sort-by="newThemes.changeSortBy"
                @update:sort-desc="newThemes.changeSortDesc"
              />
            </v-col>
          </v-row>
        </v-container>

        <v-container
          v-else
          class="pb-0 add-content-container"
        >
          <DataIterator
            :items="newThemes.loading ? [] : newThemes.items"
            :items-per-page="Number(newThemes.itemsPerPage)"
            :items-total="newThemes.itemsTotal"
            :list-style="0"
            :loading="newThemes.loading"
            :page="newThemes.page"
            :possible-items-per-page="newThemes.possibleItemsPerPage"
            @update:items-per-page="newThemes.changePerPage"
            @update:page="newThemes.changePage"
          >
            <template #loading>
              <v-row class="mt-0">
                <v-col
                  v-for="(_, key) in 6"
                  :key="key"
                  class="responsive-card"
                  cols="12"
                  md="6"
                  sm="6"
                  xl="4"
                >
                  <ThemeCardSkeleton />
                </v-col>
              </v-row>
            </template>

            <template #grid="{ items: gridItems }">
              <v-col
                v-for="item in asCatalog(gridItems)"
                :key="item.slug"
                class="responsive-card add-grid-col"
                cols="12"
                lg="6"
                md="4"
                sm="6"
                xl="4"
              >
                <NewThemeCard
                  :featured="newThemes.featured"
                  :item="item"
                  @action-button-install="actions.openInstall"
                  @action-button-read-more="openCatalogReadMore"
                />
              </v-col>
            </template>
          </DataIterator>
        </v-container>
      </template>
    </template>

    <template v-else-if="!itemsLoading && items.length === 0 && !searchTerm">
      <!-- The tab item has `pt-1` (4 px) and the `.row` -4 px against it, so the card starts at the top (`pt-0`, no `mt-n1` as Plugins). -->
      <v-container class="px-0 pt-0 empty-container">
        <v-row class="mx-0">
          <v-card
            class="w-100"
            elevation="4"
          >
            <EmptyState
              :desc="t('message.emptyTable.theme.description')"
              :title="t('message.emptyTable.theme.title')"
            >
              <template #image>
                <ThemesIllustration />
              </template>

              <template #action>
                <PageAddButton
                  :label="t('button.addNew')"
                  @click="openAddNew"
                />
              </template>
            </EmptyState>
          </v-card>
        </v-row>
      </v-container>
    </template>

    <template v-else>
      <PageTitle
        :title="t('heading.instance.advanced.theme.title')"
        variant="advanced"
      >
        <template #title-append>
          <ListGridSwitch
            v-if="showListSwitch(width)"
            v-model:list-style="listStyle"
            :grid-label="t('button.grid')"
            :list-label="t('button.table')"
          />
        </template>

        <template #filters>
          <DataIteratorFilterControls
            :full-width-search="true"
            :keys="themeSortKeys"
            :search-term="searchTerm"
            :show-search-term="true"
            :sort-by="listStyle ? false : sortBy"
            :sort-desc="sortDesc"
            @update:search-term="handleSearchTermChange"
            @update:sort-by="changeSortBy"
          />

          <PageAddButton
            :label="t('button.addNew')"
            @click="openAddNew"
          />
        </template>
      </PageTitle>

      <!-- The table replaces the grid only with the table list style and a window above 1400 px (`installed-themes.ts`). -->
      <v-container
        v-if="showThemeTable(listStyle, width)"
        class="mt-3"
      >
        <v-row>
          <v-col cols="12">
            <ThemeTable
              :checked-items="checkedItems"
              :instance-id="instance.id"
              :items="itemsLoading ? [] : items"
              :items-per-page="Number(itemsPerPage)"
              :items-total="itemsTotal"
              :loading="itemsLoading"
              :page="page"
              :possible-items-per-page="possibleItemsPerPage"
              :search-term="searchTerm"
              :sort-by="sortBy"
              :sort-desc="sortDesc"
              @action-button-activate="actions.openActivate"
              @action-button-delete="actions.openDelete"
              @action-button-read-more="openReadMore"
              @action-button-update="actions.openUpdate"
              @clear-filters="clearFilters"
              @update:check-all="handleSelectAll"
              @update:checked-items="toggleItem"
              @update:items-per-page="changePerPage"
              @update:page="changePage"
              @update:sort-by="changeSortBy"
              @update:sort-desc="changeSortDesc"
            />
          </v-col>
        </v-row>
      </v-container>

      <v-container
        v-else
        :class="[checkedItems.length > 0 ? 'pb-selected' : '', 'mt-3']"
      >
        <DataIterator
          :items="itemsLoading ? [] : items"
          :items-per-page="Number(itemsPerPage)"
          :items-total="itemsTotal"
          :keys="themeSortKeys"
          :list-style="0"
          :loading="itemsLoading"
          :page="page"
          :possible-items-per-page="possibleItemsPerPage"
          :search-term="searchTerm"
          :sort-by="sortBy || undefined"
          :sort-desc="sortDesc"
          :sort-disabled="true"
          @clear-all-filters="clearFilters"
          @update:items-per-page="changePerPage"
          @update:page="changePage"
        >
          <template #loading>
            <!-- Grid slot wraps its row in `v-container px-0` (16px top and bottom in V4): the loader keeps the top 16px, no bottom one (as Plugins). -->
            <v-container class="px-0 pb-0">
              <v-row class="">
                <v-col
                  v-for="(_, key) in 6"
                  :key="key"
                  class="responsive-card"
                  cols="12"
                  md="6"
                  sm="6"
                  xl="4"
                >
                  <ThemeCardSkeleton />
                </v-col>
              </v-row>
            </v-container>
          </template>

          <template #grid="{ items: gridItems }">
            <v-col
              v-for="item in asThemes(gridItems)"
              :key="item.name"
              class="responsive-card"
              cols="12"
              lg="6"
              md="4"
              sm="6"
              xl="4"
            >
              <ThemeCard
                :checked="checkedItems.includes(item.name)"
                :instance-id="instance.id"
                :item="item"
                @action-button-activate="actions.openActivate"
                @action-button-delete="actions.openDelete"
                @action-button-read-more="openReadMore"
                @action-button-update="actions.openUpdate"
                @checked="handleItemCheck(item)"
              />
            </v-col>
          </template>
        </DataIterator>
      </v-container>

      <ThemeSelectSnackbar
        :all-selected="allSelected"
        :count="checkedItems.length"
        @mass-action-remove="actions.openMassDelete(checkedEntries)"
        @mass-action-update="actions.openMassUpdate(checkedEntries)"
        @update:check-all="handleSelectAll"
      />
    </template>

    <ThemeReadMoreModal
      :instance-id="instance.id"
      :is-new="readMoreIsNew"
      :item="readMoreItem"
      :model-value="readMoreOpen"
      @action-button-activate="actions.openActivate"
      @action-button-update="actions.openUpdate"
      @install-item="installFromReadMore"
      @update:model-value="readMoreOpen = $event"
    />

    <ActionModalHost
      :confirmed="Boolean(actions.values.value.confirm)"
      :modal="actions.modal.value"
      :open="actions.modalOpen.value"
      :persistent="actions.persistent.value"
      :render="actions.render.value"
      :submitting="actions.submitting.value"
      :values="actions.values.value"
      :width="actions.modal.value?.width"
      @button="actions.onButton"
      @close="actions.close"
      @update:values="actions.setValues"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import type { InstalledTheme, RepositoryTheme } from '@/entities/project/instance-themes.api'
  // The page state lives in `use-themes-page.ts`, the dialogs in `use-theme-actions.ts`. The frame owns the page chrome.
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, toRef, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import ActionModalHost from '@/entities/project/ui/ActionModalHost.vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ListGridSwitch from '@/shared/ui/buttons/ListGridSwitch.vue'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import DataIterator from '@/shared/ui/data-iterator/DataIterator.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import NewItemSearchCard from '@/shared/ui/data-iterator/NewItemSearchCard.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import { useSelection } from '@/shared/ui/selection/use-selection'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { showListSwitch, showThemeTable, themeSortKeys } from './installed-themes'
  import { newThemeSortKeys } from './new-themes'
  import NewThemeCard from './NewThemeCard.vue'
  import NewThemesEmptyIllustration from './NewThemesEmptyIllustration.vue'
  import NewThemeTable from './NewThemeTable.vue'
  import ThemeCard from './ThemeCard.vue'
  import ThemeCardSkeleton from './ThemeCardSkeleton.vue'
  import ThemeReadMoreModal from './ThemeReadMoreModal.vue'
  import ThemeSelectSnackbar from './ThemeSelectSnackbar.vue'
  import ThemesIllustration from './ThemesIllustration.vue'
  import ThemeTable from './ThemeTable.vue'
  import { useThemeActions } from './use-theme-actions'
  import { useThemesPage } from './use-themes-page'

  const props = defineProps<{
    instance: InstanceResource
  }>()

  const { t } = useTranslation()
  const { lgAndDown, width } = useDisplay()

  const {
    allItems,
    items,
    itemsTotal,
    itemsLoading,
    listStyle,
    page,
    itemsPerPage,
    possibleItemsPerPage,
    sortBy,
    sortDesc,
    searchTerm,
    changePage,
    changePerPage,
    changeSortBy,
    changeSortDesc,
    handleSearchTermChange,
    clearFilters,
    loadData,
    addThemes,
    openAddNew,
    closeAddNew,
    searchNew,
    loadNewThemes,
    newThemes,
  } = useThemesPage(toRef(props, 'instance'))

  // Select all works on the current page, and the mass actions act on the checked themes of
  // the page. The selection is kept to the current page (see the `items` watcher).
  const { checkedItems, checkedEntries, handleItemCheck, handleSelectAll, retainVisible, clear } = useSelection(items, theme => theme.name)
  const allSelected = computed(() => checkedItems.value.length === items.value.length)

  // The dialogs of one theme and the mass ones of the selection (`use-theme-actions.ts`). A successful mass action clears the selection.
  const actions = useThemeActions({
    instance: toRef(props, 'instance'),
    page: { allItems, loadData },
    selection: { clear },
  })

  // The kit table emits the theme of the clicked row as `unknown`; it is the theme this page passed in.
  function toggleItem (value: unknown): void {
    handleItemCheck(value as InstalledTheme)
  }

  // Drops the checked themes that left the filtered page. Here the same runs on every
  // change of the page (search, page, per page, sort, reload, delete), as in the plugins screen, so the counter and the mass actions always
  // cover the themes on screen.
  watch(items, retainVisible)

  // Opening Add New drops the selection of the installed list.
  watch(addThemes, value => {
    if (value) {
      clear()
    }
  })

  // The theme the Read More dialog shows. It stays set while the dialog closes, so the content does not vanish.
  // `readMoreIsNew` tells the dialog it shows a catalogue entry (Install instead of the status chip and actions).
  const readMoreItem = ref<InstalledTheme | RepositoryTheme | null>(null)
  const readMoreOpen = ref(false)
  const readMoreIsNew = ref(false)

  function openReadMore (item: InstalledTheme): void {
    readMoreItem.value = item
    readMoreIsNew.value = false
    readMoreOpen.value = true
  }

  function openCatalogReadMore (item: RepositoryTheme): void {
    readMoreItem.value = item
    readMoreIsNew.value = true
    readMoreOpen.value = true
  }

  // The Install button of the Read More dialog opens the install dialog.
  function installFromReadMore (item: InstalledTheme | RepositoryTheme): void {
    actions.openInstall(item as RepositoryTheme)
  }

  // The kit iterator hands its slot items out as `unknown`; they are the installed themes and the catalogue this page passed in.
  const asThemes = (slotItems: unknown[]) => slotItems as InstalledTheme[]
  const asCatalog = (slotItems: unknown[]) => slotItems as RepositoryTheme[]

  // The tag sends its translated text as the term (`heading.instance.plugin.add.tag.*`).
  const addTags = computed(() => [
    t('heading.instance.plugin.add.tag.blog'),
    t('heading.instance.plugin.add.tag.ecommerce'),
    t('heading.instance.plugin.add.tag.entertainment'),
    t('heading.instance.plugin.add.tag.news'),
    t('heading.instance.plugin.add.tag.portfolio'),
  ].map(label => ({ label, value: label })))

  onMounted(() => {
    void loadData()
    // The featured list is ready when Add New opens.
    void loadNewThemes()
  })
</script>

<style lang="scss" scoped>
  @use 'sass:map';
  @use '@/app/styles/legacy/tokens/variables' as v;

  // The Add New content follows the search card 18 px higher than the V4 container padding puts it (legacy 12 px container under `pt-1`).
  .add-content-container {
    margin-top: -18px;
    padding-inline: 0;
  }

  .add-empty-container {
    margin-top: -22px;
  }

  // The `pb-15` under a selection leaves room for the bar: the page measures 12 px taller than the V4 `pb-15` (60 px) gives (1534 vs 1522).
  .pb-selected {
    padding-bottom: 72px;
  }

  // Below `lg` the legacy page ends 20 px higher (the V2 container bottom padding is 12 px, V4 16 px, and the `.row` -8 px under the card) and
  // the Add New columns keep 4 px of side padding (card x 28, width 319 instead of 24 and 327): restated for the empty blocks and the Add grid.
  @media (max-width: map.get(v.$grid-breakpoints, lg)) {
    .empty-container,
    .add-empty-container {
      margin-bottom: -20px;
    }

    .add-empty-container {
      margin-top: -24px;
    }

    .add-content-container {
      margin-top: -20px;
      padding-inline: 4px;
    }

    // The Add New grid columns do not carry `responsive-card`, so the card pitch is 393 px (16 px column padding) where
    // `responsive-card` gives 12 px below `lg` (385 px).
    .add-grid-col {
      margin-block: 4px;
    }
  }

  // The back button is a V2 `small` icon button, 32 px, in the icon colour of the theme; V4 makes it 44 px
  // in the text colour (as Plugins).
  .page-title__title-box > .v-btn {
    width: 32px;
    height: 32px;
    color: var(--v-icon-btn-color);
  }
</style>

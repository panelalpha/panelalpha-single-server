<template>
  <div data-testid="instance-plugins">
    <template v-if="!addPlugins">
      <template v-if="!itemsLoading && items.length === 0 && !searchTerm">
        <!-- Legacy V2 .container pt 12px + .row -16px (_general.scss) = -4px above the card; V4 has no row gutter, so the offset is kept locally. -->
        <v-container class="px-0 pt-0">
          <v-row class="mx-0 mt-n1">
            <v-card
              class="mt-12 w-100"
              elevation="4"
            >
              <EmptyState
                :desc="t('message.emptyTable.plugin.description')"
                :title="t('message.emptyTable.plugin.title')"
              >
                <template #image>
                  <PluginIllustrationMain />
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
          :title="t('heading.instance.plugin.title')"
          variant="project"
        >
          <template #title-append>
            <ListGridSwitch
              v-if="!mdAndDown"
              v-model:list-style="listStyle"
              :grid-label="t('button.grid')"
              :list-label="t('button.table')"
            />
          </template>

          <template #filters>
            <DataIteratorFilterControls
              :full-width-search="true"
              :keys="pluginSortKeys"
              :search-term="searchTerm"
              :show-search-term="true"
              :sort-by="listStyle ? undefined : sortBy"
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

        <template v-if="showTable(listStyle, mdAndDown)">
          <PluginTable
            :checked-items="checkedItems"
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
            @action-button-deactivate="actions.openDeactivate"
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
        </template>

        <template v-else>
          <DataIterator
            :items="itemsLoading ? [] : items"
            :items-per-page="Number(itemsPerPage)"
            :items-total="itemsTotal"
            :keys="pluginSortKeys"
            :list-style="listStyle"
            :loading="itemsLoading"
            :page="page"
            :possible-items-per-page="possibleItemsPerPage"
            :search-term="searchTerm"
            :sort-by="sortBy || undefined"
            :sort-desc="sortDesc"
            @clear-all-filters="clearFilters"
            @update:items-per-page="changePerPage"
            @update:page="changePage"
          >
            <template #loading>
              <!-- The grid slot wraps its row in `v-container px-0` (16px top and bottom in V4); the loader takes the top 16px to sit where legacy's skeleton does (452 px) and no bottom one, so the footer keeps legacy's position. -->
              <v-container class="px-0 pb-0">
                <v-row class="">
                  <v-col
                    v-for="(_, key) in 8"
                    :key="key"
                    class="responsive-card"
                    cols="12"
                    md="6"
                    sm="6"
                    xl="3"
                  >
                    <PluginCardSkeleton />
                  </v-col>
                </v-row>
              </v-container>
            </template>

            <template #grid="{ items: gridItems }">
              <v-col
                v-for="item in asPlugins(gridItems)"
                :key="item.name"
                class="responsive-card"
                cols="12"
                md="6"
                sm="6"
                xl="3"
              >
                <PluginCard
                  :async-state="itemAsyncState(item)"
                  :checked="checkedItems.includes(item.name)"
                  :item="item"
                  @action-button-activate="actions.openActivate"
                  @action-button-deactivate="actions.openDeactivate"
                  @action-button-delete="actions.openDelete"
                  @action-button-read-more="openReadMore"
                  @action-button-update="actions.openUpdate"
                  @checked="handleItemCheck(item)"
                />
              </v-col>
            </template>
          </DataIterator>
        </template>
      </template>
    </template>

    <template v-else>
      <template v-if="newPlugins.empty">
        <!-- An empty featured list keeps the title row and the search above the empty card. The same blocks as the
          grid branch below (kept as copies, so the `v-if` chain stays as it is). -->
        <PageTitle
          :title="t('heading.instance.plugin.add.title')"
          variant="project"
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
              v-if="!mdAndDown"
              v-model:list-style="listStyle"
              :grid-label="t('button.grid')"
              :list-label="t('button.table')"
            />
          </template>

          <template #filters>
            <DataIteratorFilterControls
              :disabled="!newPlugins.searchTerm"
              :keys="!listStyle ? newPluginSortKeys : undefined"
              :show-search-term="false"
              :sort-by="!listStyle ? newPlugins.sortBy : undefined"
              @update:sort-by="newPlugins.setSortBy"
            />
          </template>
        </PageTitle>

        <v-container class="px-0 mt-n4 mb-n2">
          <v-row class="mx-0">
            <NewItemSearchCard
              :is-active="addPlugins"
              :model-value="newPlugins.searchTerm"
              :placeholder="t('form.placeholder.search')"
              :tags="addTags"
              :tags-label="t('heading.instance.plugin.add.tags')"
              @search="searchNew"
              @update:model-value="searchNew"
            />
          </v-row>
        </v-container>

        <!-- The top margin collapses with the search container's bottom margin (-8 px). The spacing scale steps by 4 px, so the -18 px that lands on
          legacy's y (588) is set in the scoped style. -->
        <v-container class="px-0 pb-0 empty-card-container">
          <v-row class="mx-0">
            <v-card
              class="w-100 d-flex align-center"
              elevation="4"
              style="min-height: 360px"
            >
              <EmptyState
                class="my-auto"
                :desc="t('heading.instance.plugin.add.empty.text')"
                :title="t('heading.instance.plugin.add.empty.title')"
              >
                <template #image>
                  <PluginsIllustration />
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

      <template v-else>
        <PageTitle
          :title="t('heading.instance.plugin.add.title')"
          variant="project"
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
              v-if="!mdAndDown"
              v-model:list-style="listStyle"
              :grid-label="t('button.grid')"
              :list-label="t('button.table')"
            />
          </template>

          <template #filters>
            <DataIteratorFilterControls
              :disabled="!newPlugins.searchTerm"
              :keys="!listStyle ? newPluginSortKeys : undefined"
              :show-search-term="false"
              :sort-by="!listStyle ? newPlugins.sortBy : undefined"
              @update:sort-by="newPlugins.setSortBy"
            />
          </template>
        </PageTitle>

        <!-- V4 `v-container` pads 16 px top and bottom, measured 16 px too low at the top and
          32 px too far at the bottom of the grid: top offset -16 px, bottom margin -8 px. The search card is 2 px
          taller than legacy (chip row, kit), so the grid's bottom margin is -10 px here (the table container compensates, see NewPluginTable). -->
        <v-container class="px-0 mt-n4 search-grid-container">
          <v-row class="mx-0">
            <NewItemSearchCard
              :is-active="addPlugins"
              :model-value="newPlugins.searchTerm"
              :placeholder="t('form.placeholder.search')"
              :tags="addTags"
              :tags-label="t('heading.instance.plugin.add.tags')"
              @search="searchNew"
              @update:model-value="searchNew"
            />
          </v-row>
        </v-container>

        <!-- The table on desktop with the table list style, the grid otherwise (and always below the breakpoint). -->
        <template v-if="showTable(listStyle, mdAndDown)">
          <NewPluginTable
            :featured="newPlugins.featured"
            :items="newPlugins.loading ? [] : newPlugins.tableItems"
            :items-per-page="Number(newPlugins.itemsPerPage)"
            :items-total="newPlugins.itemsTotal"
            :loading="newPlugins.loading"
            :page="newPlugins.page"
            :possible-items-per-page="newPlugins.possibleItemsPerPage"
            :search-term="newPlugins.searchTerm"
            :sort-by="newPlugins.sortBy"
            :sort-desc="newPlugins.sortDesc"
            @action-button-install="actions.openInstall"
            @action-button-read-more="openCatalogReadMore"
            @clear-filters="searchNew('')"
            @update:items-per-page="newPlugins.changePerPage"
            @update:page="newPlugins.changePage"
            @update:sort-by="newPlugins.changeSortBy"
            @update:sort-desc="newPlugins.changeSortDesc"
          />
        </template>

        <template v-else>
          <DataIterator
            :items="newPlugins.loading ? [] : newPlugins.items"
            :items-per-page="Number(newPlugins.itemsPerPage)"
            :items-total="newPlugins.itemsTotal"
            :list-style="0"
            :loading="newPlugins.loading"
            :page="newPlugins.page"
            :possible-items-per-page="newPlugins.possibleItemsPerPage"
            @update:items-per-page="newPlugins.changePerPage"
            @update:page="newPlugins.changePage"
          >
            <template #loading>
              <v-row class="mt-0">
                <v-col
                  v-for="(_, key) in 8"
                  :key="key"
                  class="responsive-card"
                  cols="12"
                  md="6"
                  sm="6"
                  xl="3"
                >
                  <PluginCardSkeleton />
                </v-col>
              </v-row>
            </template>

            <template #grid="{ items: gridItems }">
              <v-col
                v-for="item in asCatalog(gridItems)"
                :key="item.slug"
                class="responsive-card"
                cols="12"
                md="6"
                sm="6"
                xl="3"
              >
                <NewPluginCard
                  :featured="newPlugins.featured"
                  :item="item"
                  @action-button-install="actions.openInstall"
                  @action-button-read-more="openCatalogReadMore"
                />
              </v-col>
            </template>
          </DataIterator>
        </template>
      </template>
    </template>

    <PluginReadMoreModal
      :is-new="readMoreIsNew"
      :item="readMoreItem"
      :model-value="readMoreOpen"
      @action-button-activate="actions.openActivate"
      @action-button-update="actions.openUpdate"
      @install-item="installFromReadMore"
      @update:model-value="readMoreOpen = $event"
    />

    <action-modal-host
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

    <PluginsSelectSnackbar
      :all-selected="allSelected"
      :checked-plugins="checkedEntries"
      :count="checkedItems.length"
      @mass-action-activate="actions.openMassActivate(checkedEntries)"
      @mass-action-deactivate="actions.openMassDeactivate(checkedEntries)"
      @mass-action-remove="actions.openMassDelete(checkedEntries)"
      @mass-action-update="actions.openMassUpdate(checkedEntries)"
      @update:check-all="handleSelectAll"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { InstalledPlugin, RepositoryPlugin } from '@/entities/project/instance-plugins.api'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  // The page state and both lists live in `use-plugins-page.ts`; the dialogs in `use-plugin-actions.ts`.
  // The frame owns the page chrome and the tab chip.
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, toRef, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import ActionModalHost from '@/entities/project/ui/ActionModalHost.vue'
  import { itemAsyncState } from '@/entities/project/wordpress-items'
  import { preferredSpaBase } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ListGridSwitch from '@/shared/ui/buttons/ListGridSwitch.vue'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import DataIterator from '@/shared/ui/data-iterator/DataIterator.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import NewItemSearchCard from '@/shared/ui/data-iterator/NewItemSearchCard.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import PluginsIllustration from '@/shared/ui/illustrations/PluginsIllustration.vue'
  import { useSelection } from '@/shared/ui/selection/use-selection'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { pluginSortKeys, showTable } from './installed-plugins'
  import { newPluginSortKeys } from './new-plugins'
  import NewPluginCard from './NewPluginCard.vue'
  import NewPluginTable from './NewPluginTable.vue'
  import PluginCard from './PluginCard.vue'
  import PluginCardSkeleton from './PluginCardSkeleton.vue'
  import PluginIllustrationMain from './PluginIllustrationMain.vue'
  import PluginReadMoreModal from './PluginReadMoreModal.vue'
  import { resolvePluginsEntry } from './plugins-entry'
  import PluginsSelectSnackbar from './PluginsSelectSnackbar.vue'
  import PluginTable from './PluginTable.vue'
  import { usePluginActions } from './use-plugin-actions'
  import { usePluginsPage } from './use-plugins-page'

  const props = withDefaults(defineProps<{
    instance: InstanceResource
    // The frame passes it; legacy keeps a `fetching` flag in `data()` that the screen never reads.
    fetching?: boolean
  }>(), {
    fetching: false,
  })

  const { t } = useTranslation()
  const { mdAndDown } = useDisplay()

  const {
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
    setItems,
    rememberInstalling,
    addPlugins,
    openAddNew,
    closeAddNew,
    searchNew,
    loadNewPlugins,
    newPlugins,
  } = usePluginsPage(toRef(props, 'instance'))

  // Select all works on the current page; the mass actions act on the checked plugins of
  // the page. The selection is kept to the current page (see the `items` watcher).
  const { checkedItems, checkedEntries, handleItemCheck, handleSelectAll, retainVisible, clear } = useSelection(items, plugin => plugin.name)
  const allSelected = computed(() => checkedItems.value.length === items.value.length)

  const actions = usePluginActions({
    instance: toRef(props, 'instance'),
    page: { setItems, loadData, rememberInstalling },
    selection: { clear },
  })

  // The kit table emits the plugin of the clicked row as `unknown`; it is the plugin this page passed in.
  function toggleItem (value: unknown): void {
    handleItemCheck(value as InstalledPlugin)
  }

  // The plugin the Read More dialog shows. It stays set while the dialog closes, so the content does not vanish.
  // `readMoreIsNew` tells the dialog it shows a catalogue entry (Install instead of the status chip and actions).
  const readMoreItem = ref<InstalledPlugin | RepositoryPlugin | null>(null)
  const readMoreOpen = ref(false)
  const readMoreIsNew = ref(false)

  function openReadMore (item: InstalledPlugin): void {
    readMoreItem.value = item
    readMoreIsNew.value = false
    readMoreOpen.value = true
  }

  function openCatalogReadMore (item: RepositoryPlugin): void {
    readMoreItem.value = item
    readMoreIsNew.value = true
    readMoreOpen.value = true
  }

  // The Read More install button opens the install dialog.
  function installFromReadMore (item: InstalledPlugin | RepositoryPlugin): void {
    actions.openInstall(item as RepositoryPlugin)
  }

  // The kit iterator hands its slot items out as `unknown`; they are the installed plugins this host passed in.
  const asPlugins = (slotItems: unknown[]) => slotItems as InstalledPlugin[]
  const asCatalog = (slotItems: unknown[]) => slotItems as RepositoryPlugin[]

  // Popular tags (`heading.instance.plugin.add.tag.*`): the tag sends its translated text as the term.
  const addTags = computed(() => [
    t('heading.instance.plugin.add.tag.blog'),
    t('heading.instance.plugin.add.tag.ecommerce'),
    t('heading.instance.plugin.add.tag.entertainment'),
    t('heading.instance.plugin.add.tag.news'),
    t('heading.instance.plugin.add.tag.portfolio'),
  ].map(label => ({ label, value: label })))

  // Opening Add New drops the selection.
  watch(addPlugins, value => {
    if (value) {
      clear()
    }
  })

  // Drops the checked plugins that left the filtered page. Here the same runs on every
  // change of the page (search, page, per page, sort, reload, delete), unlike legacy, which kept the checks of other pages: the counter,
  // Deselect and the mass actions then always cover the same plugins.
  watch(items, retainVisible)

  // Guard of the route: without `wordpress.manage_plugins` the page leaves to General and loads nothing.
  const router = useRouter()
  const session = useSessionStore()

  onMounted(() => {
    const leaveTo = resolvePluginsEntry(props.instance, preferredSpaBase(session.home))
    if (leaveTo) {
      void router.replace(leaveTo)
      return
    }
    void loadData()
    void loadNewPlugins()
  })
</script>

<style lang="scss" scoped>
// The back button of the Add New tab is a V2 `small` icon button, 32 px, in the icon colour of the theme (`rgba(0,0,0,.54)`
// light). V4 `small` icon buttons are 44 px and take the text colour, so both are set here.
// The empty card follows the search card 18 px above its own top (collapsed with the -8 px margin of the search container; see the template).
.empty-card-container {
  margin-top: -18px;
}

// The grid's search container (`mb-n2` in the template, -8 px) moves the grid 2 px up, to legacy's y (588 px) with the 2 px taller search card.
.search-grid-container {
  margin-bottom: -10px;
}

.page-title__title-box > .v-btn {
  width: 32px;
  height: 32px;
  color: var(--v-icon-btn-color);
}
</style>

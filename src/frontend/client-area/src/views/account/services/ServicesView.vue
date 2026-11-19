<template>
  <page-frame
    data-testid="services-view"
    testid-prefix="services"
    :title="t('general.myPlans')"
  >
    <template #filters>
      <select-dropdown
        :class="smAndDown ? 'p-3 mr-4' : 'p-2 mr-4'"
        data-testid="services-status-filter"
        item-text="text"
        item-value="value"
        :items="statusOptions"
        menu-class="services-status-menu"
        :model-value="(statusFilter as Record<string, unknown> | undefined)"
        :raw-item-text="true"
        :size="smAndDown ? 'md' : 'lg'"
        @update:model-value="handleStatusFilterChange"
      />

      <data-iterator-filter-controls
        :search-term="searchTerm"
        :show-search-term="true"
        @update:search-term="handleSearchTermChange"
      />
    </template>

    <AppMessage
      v-if="rebuildProject"
      class="mb-6"
      data-testid="services-limits-rebuild-note"
      variant="info"
    >
      <strong>{{ rebuildProject.domain }}</strong>: {{ t('heading.instance.advanced.projectLimits.rebuildNote') }}

      <template #action>
        <AppButton
          color="info"
          data-testid="services-limits-open-project"
          kind="primary"
          :to="projectDetailsPath(rebuildProject.id)"
        >
          {{ t('button.goToProject', { defaultValue: 'Go to project' }) }}
        </AppButton>

        <AppButton
          color="info"
          data-testid="services-limits-rebuild-note-close"
          kind="field"
          @click="rebuildProject = null"
        >
          {{ t('button.close') }}
        </AppButton>
      </template>
    </AppMessage>

    <services-table
      v-if="pageVisible"
      :billing-enabled="billingEnabled"
      :items-per-page="itemsPerPage"
      :limits-enabled="limitsEnabled"
      :limits-state-of="limitsStateOf"
      :loading="loading"
      :page="page"
      :possible-items-per-page="possibleItemsPerPage"
      :search-term="searchTerm"
      :services="filteredServices"
      :sort-by="sortBy"
      :sort-desc="sortDesc"
      @limits-saved="onLimitsSaved"
      @limits-updated="updateResources"
      @service-cancelled="loadServices"
      @update:items-per-page="changePerPage"
      @update:page="changePage"
      @update:search-term="handleSearchTermChange"
      @update:sort-by="changeSortBy"
      @update:sort-desc="changeSortDesc"
    />
  </page-frame>
</template>

<script lang="ts" setup>
  import type { LimitsSaved } from './service-limits'
  import type { StatusFilterOption } from './services-list'
  // App redirects to /instances without billing, app-lite to `preferredSpaBase` (app-lite wins).
  import type { ServiceRow } from './services.types'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { isFreePanel, servicesPageVisible } from '@/shared/session/home-access'
  import { preferredSpaBase } from '@/shared/session/preferred-spa-base'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import SelectDropdown from '@/shared/ui/form/SelectDropdown.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import PageFrame from '@/shared/ui/page-frame/PageFrame.vue'
  import { filterByStatus, statusFilterOptions, withInstancesCount } from './services-list'
  import { listServices } from './services.api'
  import ServicesTable from './ServicesTable.vue'
  import { useServiceProjects } from './use-service-projects'

  const { t } = useTranslation()
  const router = useRouter()
  const session = useSessionStore()
  const alerts = useAlertsStore()
  const { smAndDown } = useDisplay()

  const loading = ref(false)
  const services = ref<ServiceRow[]>([])

  // The filter starts on the first option, Active.
  const statusValue = ref<StatusFilterOption['value']>('active')
  const statusOptions = computed(() => statusFilterOptions((key: string) => t(key)))
  const statusFilter = computed(() => statusOptions.value.find(option => option.value === statusValue.value))
  const filteredServices = computed(() => filterByStatus(services.value, statusFilter.value))

  // Sort, page and search changes refetch the list (`isServerProvided`).
  const {
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
  } = useDataIteratorPageState({ load: loadServices, sortBy: { value: 'plan_name' } })

  // The page also exists on a paid build without billing; the billing parts of the table follow `billingEnabled`.
  const pageVisible = computed(() => servicesPageVisible(session.home))
  const billingEnabled = computed(() => Boolean(session.home?.app?.billing_enabled))
  // Paid editions (Plus/Pro): each plan row manages its projects' limits, as Project details > Limits does.
  const limitsEnabled = computed(() => !isFreePanel(session.home))

  // The plan's project, fetched for the Limits column and the Manage limits action.
  const { load: loadProjects, stateOf, updateResources } = useServiceProjects()

  function limitsStateOf (service: ServiceRow) {
    return stateOf(service, limitsEnabled.value)
  }

  // A saved limit that waits for a rebuild: the note names the project and leads to its details, where the redeploy is.
  const rebuildProject = ref<{ id: number, domain: string } | null>(null)

  function onLimitsSaved (saved: LimitsSaved): void {
    if (saved.needsRebuild) {
      rebuildProject.value = { id: saved.id, domain: saved.domain }
    }
  }

  function projectDetailsPath (id: number): string {
    return `${preferredSpaBase(session.home)}/${id}/advanced/details`
  }

  async function loadServices (): Promise<void> {
    loading.value = true
    try {
      services.value = withInstancesCount(await listServices())
      void loadProjects(services.value, limitsEnabled.value, session.home)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loading.value = false
    }
  }

  // Back to page 1, local only, no request.
  function handleStatusFilterChange (option: unknown): void {
    page.value = 1
    statusValue.value = (option as StatusFilterOption).value
  }

  onMounted(() => {
    if (!pageVisible.value) {
      void router.push({ path: preferredSpaBase(session.home) })
      return
    }
    void loadServices()
  })
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

  // V2 sizes the status select from its content (280px for "Active" at 1440px, 255px for "All"; no CSS source found); V4 `fit-content` is
  // 99px. Fixed to the "Active" measurement. The select and the search are roots of components of this template (this scope id); the
  // filter column around them is rendered by `PageFrame`, so the rules start at them.
  .filter-select.v-input {
    flex: 0 0 280px;
    max-width: none;
  }

  // V2 `.p-2` / `.p-3` on the select root set the font of the field (300 weight at 16px; 14px on mobile); the V4 `.v-field` has its own.
  .filter-select :deep(.v-field) {
    font-size: map.get(v.$paragraphs, base, font-size);
    line-height: map.get(v.$paragraphs, base, line-height);
    font-weight: map.get(v.$paragraphs, base, font-weight);
  }

  // Measured in legacy at 375px: 135.05px (V2 sized the field from its content; no CSS source).
  @media (max-width: 975.98px) {
    .filter-select.v-input {
      flex-basis: 135.05px;
    }

    .filter-select :deep(.v-field) {
      font-size: map.get(v.$paragraphs, sm, font-size);
      line-height: map.get(v.$paragraphs, sm, line-height);
      font-weight: map.get(v.$paragraphs, sm, font-weight);
    }
  }

  .data-iterator-filter-controls :deep(.v-input) {
    min-width: 54px;
  }
</style>

<style lang="scss">
// V2 `VSelectList` colours the active item with the primary colour; the V4 list keeps the text colour.
.services-status-menu .v-list-item--active {
  color: rgb(var(--v-theme-primary));
}
</style>

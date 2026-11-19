<template>
  <div
    class="instance-backups"
    data-testid="instance-backups"
  >
    <PageTitle
      :title="t('heading.instance.backups.title')"
      variant="project"
    >
      <template #title-append>
        <div
          v-if="!itemsLoading && !singleServer"
          class="d-flex ml-4"
        >
          <backups-usage-item
            v-for="chip in chips"
            :key="chip.name"
            :item="chip"
          />
        </div>
      </template>

      <template #filters>
        <backup-automatic-switcher
          v-if="!usesOwnBackupSystem"
          class="mr-4"
          :editable="instance.automatic_backups_editable"
          :free-panel="freePanel"
          :instance="instance"
          :loading="automaticLoading"
          :settings="automaticSettings"
          :store-hint="false"
          @reload-settings="loadAutomaticSettings"
        />

        <data-iterator-filter-controls
          :full-width-search="false"
          :search-term="searchTerm"
          :show-search-term="true"
          @update:search-term="handleSearchTermChange"
        />

        <v-tooltip
          content-class="backups-limit-tooltip"
          :disabled="canCreate"
          location="bottom"
        >
          <template #activator="{ props: activatorProps }">
            <span v-bind="activatorProps">
              <PageAddButton
                data-testid="backups-add-new"
                :disabled="!canCreate"
                :label="t('button.addNew')"
                @click="openCreate"
              />
            </span>
          </template>

          <span
            v-for="(line, index) in limitTooltip"
            :key="index"
            class="d-block"
            :class="{ 'font-weight-bold': line.strong }"
          >{{ line.text }}</span>
        </v-tooltip>
      </template>
    </PageTitle>

    <v-container>
      <v-row>
        <v-col cols="12">
          <backup-store-missing-notice
            v-if="storeMissing"
            class="mb-4"
            :free-panel="freePanel"
          />

          <div :class="checkedItems.length > 0 ? 'pb-15' : ''">
            <backups-table
              :all-selected="allSelected"
              :checked-items="checkedItems"
              :create-disabled="!canCreate"
              :custom="isCustom"
              :headers="headers"
              :items="pageItems"
              :items-length="filteredTotal"
              :items-loading="itemsLoading"
              :items-per-page="itemsPerPage"
              :load-error="loadError"
              :page="page"
              :possible-items-per-page="possibleItemsPerPage"
              :search-term="searchTerm"
              :sort-by="sortBy"
              :sort-desc="sortDesc"
              :uses-own-backup-system="usesOwnBackupSystem"
              @action-button-convert-to-full="openConvert"
              @action-button-delete="openDelete"
              @action-button-download="openDownload"
              @action-button-repeat="repeatAction"
              @action-button-restore="openRestore"
              @add-new="openCreate"
              @clear-filters="clearFilters"
              @retry="reloadBackups()"
              @select-all="handleSelectAll"
              @update:checked-items="handleItemCheck"
              @update:items-per-page="changePerPage"
              @update:page="changePage"
              @update:sort-by="changeSortBy"
              @update:sort-desc="changeSortDesc"
            />
          </div>
        </v-col>
      </v-row>
    </v-container>

    <create-backup-modal
      ref="createModal"
      v-model="createOpen"
      :instance="instance"
      :limit-reached="!canCreate"
      :store-missing="storeMissing"
      @created="onCreated"
    />

    <backups-select-snackbar
      :checked-items="checkedItems"
      :items="pageItems"
      @mass-action-remove="openMassDelete"
      @update:check-all="handleSelectAll"
    />

    <action-modal-host
      :confirmed="Boolean(modalValues.confirm)"
      :modal="modal"
      :open="modalOpen"
      :persistent="modalPersistent"
      :render="modalRender"
      :submitting="modalSubmitting"
      :values="modalValues"
      :width="modal?.width"
      @button="onModalButton"
      @close="modalClose"
      @update:values="setModalValues"
    />
  </div>
</template>

<script lang="ts" setup>
  // The backups page, as the child of the instance frame. The list is loaded once and filtered, sorted and
  // paged here (`allItems` is the one source). Create, retry and convert open the create modal; restore and delete open the action modal
  // (`ActionModalHost`); the Echo events update the rows, the usage and the frame chip. The selection (`use-backup-selection.ts`), its snackbar
  // and the mass delete with its progress log are here too. Download opens the
  // file in a new window, or the file choice when a backup has more than one file.
  import type { Translate } from '@/shared/ui/modal/action-modal'
  import type { AutomaticBackupSettings, BackupsUsage } from '@/entities/project/instance-backups.api'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref, useTemplateRef } from 'vue'
  import { isContainerProject } from '@/entities/project/container-project'
  import { deleteBackup, getAutomaticBackupSettings, getBackups, restoreBackup } from '@/entities/project/instance-backups.api'
  import ActionModalHost from '@/entities/project/ui/ActionModalHost.vue'
  import { isBackupStoreMissing } from '@/entities/project/ui/backups/automatic-backup'
  import { backupStoreMissingTooltip } from '@/entities/project/ui/backups/backup-store-missing'
  import BackupAutomaticSwitcher from '@/entities/project/ui/backups/BackupAutomaticSwitcher.vue'
  import BackupStoreMissingNotice from '@/entities/project/ui/backups/BackupStoreMissingNotice.vue'
  import CreateBackupModal from '@/entities/project/ui/backups/CreateBackupModal.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { useAppEvent } from '@/shared/events/app-events'
  import { isDemoMode } from '@/shared/session/demo-mode'
  import { isSingleServer } from '@/shared/session/home-access'
  import { useSessionStore } from '@/shared/session/session.store'
  import { EMPTY_DATE, formatTime } from '@/shared/time/date-format'
  import { useDateFormat } from '@/shared/time/use-date-format'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import { useActionModal } from '@/shared/ui/modal/use-action-modal'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { type BackupActionDeps, deleteModal, type DownloadDeps, downloadItem, type MassDeleteDeps, massDeleteModal, restoreModal, runBackupMassDelete, runDelete, runRestore, startDownload } from './backup-actions'
  import { applyBackupChanged, applyBackupDeleted, asBackupRow } from './backups-events'
  import { type BackupItem, buildHeaders, decorateBackup, filterBackups, paginate, sortBackups } from './backups-list'
  import { addNewLimitKey, canCreateManualBackup, recountUsage, usageChips } from './backups-usage'
  import BackupsSelectSnackbar from './BackupsSelectSnackbar.vue'
  import BackupsTable from './BackupsTable.vue'
  import BackupsUsageItem from './BackupsUsageItem.vue'
  import { useBackupSelection } from './use-backup-selection'

  // The frame passes `fetching` to every child (as `GeneralView` takes it); the list has its own loading state, so it is not read here.
  const props = withDefaults(defineProps<{
    instance: InstanceResource
    fetching?: boolean
  }>(), {
    fetching: false,
  })

  const { t } = useTranslation()
  const session = useSessionStore()

  // The whole list. Filter, sort and page are computed from it, so a change to a row (Echo) lands in this one collection.
  const allItems = ref<BackupItem[]>([])
  const usage = ref<BackupsUsage>({})
  const itemsLoading = ref(true)
  // Message of the last failed list request; null when the last load worked. A failed load is not an empty list.
  const loadError = ref<string | null>(null)
  const createOpen = ref(false)
  const createModal = useTemplateRef<{ open: (retryId?: number, convertFromId?: number | null) => void }>('createModal')
  const automaticSettings = ref<AutomaticBackupSettings>({})
  const automaticLoading = ref(false)

  // Page, sort and search state. The list is filtered locally, so `load` is never called
  // (`serverProvided: false`); the page, the sort and the search still reset as legacy does.
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
    clearFilters,
  } = useDataIteratorPageState({
    load: () => undefined,
    serverProvided: false,
    itemsPerPage: 8,
    possibleItemsPerPage: [[8, 16, 24]],
    sortBy: { text: 'date', value: 'date', sortable: true },
    sortDesc: true,
  })

  const usesOwnBackupSystem = computed(() => props.instance.server_settings?.uses_own_backup_system === true)
  const chips = computed(() => usageChips(usage.value))
  // No backup store: the server refuses a create, so "Add new" is blocked first. Unknown (loading, failed GET) blocks nothing.
  const storeMissing = computed(() => isBackupStoreMissing(automaticSettings.value, usesOwnBackupSystem.value))
  const freePanel = computed(() => Boolean(session.home?.app?.community_panel))
  // Single-server (Free panel): the plan limits are not the owner's to set, so there are no usage chips and no limit blocks Add new.
  // The missing store still blocks it.
  const singleServer = computed(() => isSingleServer(session.home))
  const canCreate = computed(() => (singleServer.value || canCreateManualBackup(usage.value)) && !storeMissing.value)
  // The missing store wins over a reached limit: it is the one the user has to fix first.
  const limitTooltip = computed<{ text: string, strong?: boolean }[]>(() => {
    if (storeMissing.value) {
      return backupStoreMissingTooltip('create', freePanel.value)
        .map(line => ({ text: t(line.key, { defaultValue: line.defaultValue }), strong: line.strong }))
    }
    const key = singleServer.value ? null : addNewLimitKey(usage.value)
    return key ? [{ text: t(key) }] : []
  })

  // Code/Data parts apply to a container project only; a classic `custom` project keeps the WordPress columns and restore.
  const isCustom = computed(() => isContainerProject(props.instance))
  const headers = computed(() => buildHeaders(allItems.value, (key, options) => t(key, options), isCustom.value))
  // The search reads the date as the table shows it (the configured format, then `HH:mm`), not the raw timestamp.
  const formatDate = useDateFormat()
  const matched = computed(() => filterBackups(allItems.value, searchTerm.value, item => {
    const date = formatDate(item.date)
    return date === EMPTY_DATE ? '' : `${date} ${formatTime(item.date)}`
  }))
  const filteredTotal = computed(() => matched.value.length)
  const pageItems = computed(() => paginate(
    sortBackups(matched.value, sortBy.value, sortDesc.value),
    page.value,
    itemsPerPage.value,
  ))

  // The checked ids. The select-all acts on the current page (`pageItems`), as in legacy.
  const { checkedItems, allSelected, handleItemCheck, handleSelectAll, clear: clearSelection } = useBackupSelection(pageItems)

  // Only the newest response counts: a reload after create can overlap an earlier request (legacy had no guard).
  let latestRequest = 0
  // Bumped by every local change of the list (Echo, markPending). A GET answered after such a change would bring back the state from
  // before it, so its response is dropped.
  let dataVersion = 0

  /**
   * One GET, the chip state of the frame (`setBackupDetails`) and the usage. A failed GET keeps the rows the table
   * had and raises no alert; an empty list then shows the error instead of the empty state.
   */
  /**
   * Drops selected ids whose backup is gone (deleted by Echo or by a partly failed mass delete), so the next mass delete does not
   * start with a 404. Selection of rows still in the list stays, as legacy does.
   */
  function pruneSelection (): void {
    checkedItems.value = checkedItems.value.filter(id => allItems.value.some(item => item.id === id))
  }

  async function reloadBackups (): Promise<void> {
    const request = ++latestRequest
    const version = dataVersion
    itemsLoading.value = true
    try {
      const response = await getBackups(props.instance.id)
      if (request !== latestRequest || version !== dataVersion) {
        return
      }
      props.instance.setBackupDetails(response.data)
      allItems.value = response.data.map(row => decorateBackup(row))
      usage.value = response.usage
      loadError.value = null
      pruneSelection()
    } catch (error) {
      // Legacy kept no message of a failed GET; the table keeps its rows, and an empty list says the load failed.
      loadError.value = getErrorMessage(error)
    } finally {
      if (request === latestRequest) {
        itemsLoading.value = false
      }
    }
  }

  // A failed GET is an empty object, so the switcher shows the disabled state,
  // and the result also sets the instance flag (`{}` after an error -> `true`), which turns the unknown state into a known one.
  // `@reload-settings` reuses this, so the flag and the tab chip refresh after a save.
  async function loadAutomaticSettings (): Promise<void> {
    automaticLoading.value = true
    try {
      automaticSettings.value = await getAutomaticBackupSettings(props.instance.id)
      props.instance.setAutomaticBackup(automaticSettings.value.frequency !== 'never')
    } finally {
      automaticLoading.value = false
    }
  }

  const alerts = useAlertsStore()
  const translate: Translate = (key, options) => String(t(key, options as never))

  const actionDeps: BackupActionDeps = {
    restoreBackup,
    deleteBackup,
    addSuccessAlert: message => alerts.addAlert({ success: true, successMessage: message }),
    addErrorAlert: message => alerts.addAlert({ success: false, errorMessage: message }),
    getErrorMessage,
    t: translate,
  }

  // `item.async_status.<action> = "pending"` after a successful request, with no reload. The row is read from the list, so a
  // row that Echo has replaced in the meantime still gets the state.
  function markPending (item: BackupItem, action: 'restore' | 'delete'): void {
    const row = allItems.value.find(current => current.id === item.id)
    if (row) {
      row.async_status[action] = 'pending'
      dataVersion++
    }
  }

  // The lines go to the progress log of the open dialog (the kit reads it as a prop).
  function appendProgress (line: string): void {
    const current = modal.value
    if (current) {
      current.props.submittingProgressLog = `${current.props.submittingProgressLog ?? ''}${line}`
    }
  }

  const massDeps: MassDeleteDeps = { ...actionDeps, isDemoMode, log: appendProgress }
  const downloadDeps: DownloadDeps = { isDemoMode, addErrorAlert: actionDeps.addErrorAlert, t: translate }

  // The guards: a second submit while a request is in flight does nothing (the dialog is busy as well).
  let restoreInFlight = false
  let deleteInFlight = false
  let massInFlight = false
  // The ids of the mass delete, taken when its dialog opens.
  let massIds: number[] = []

  const {
    modal,
    modalOpen,
    submitting: modalSubmitting,
    render: modalRender,
    values: modalValues,
    persistent: modalPersistent,
    open: openModal,
    close: modalClose,
    setValues: setModalValues,
    onButton: onModalButton,
  } = useActionModal<BackupItem>({
    'backup-restore': {
      async run (values, ctx) {
        const target = ctx.target
        if (!target || restoreInFlight) {
          return
        }
        restoreInFlight = true
        try {
          // A failed restore keeps the dialog open (legacy), and the missing-part alert is shown without a request.
          const outcome = await runRestore(props.instance.id, target, values, actionDeps)
          if (outcome === 'success') {
            markPending(target, 'restore')
            ctx.close()
          }
        } finally {
          restoreInFlight = false
        }
      },
    },
    'backup-delete': {
      async run (_values, ctx) {
        const target = ctx.target
        if (!target || deleteInFlight) {
          return
        }
        deleteInFlight = true
        try {
          const outcome = await runDelete(props.instance.id, target, actionDeps)
          // Legacy closes the dialog whatever the outcome (`finally`); the row turns pending only after a success.
          ctx.close()
          if (outcome === 'success') {
            markPending(target, 'delete')
          }
        } finally {
          deleteInFlight = false
        }
      },
    },
    // A demo-mode stop keeps the dialog open, as legacy returns before it
    // touches the modal; otherwise the dialog closes and the list reloads whatever the outcome, and the selection is cleared on success only.
    // The download button: the dialog closes, then the chosen file opens. The demo block
    // alerts from `downloadItem`, as legacy did after the dialog closed.
    'backup-download': {
      run (values, ctx) {
        const target = ctx.target
        const file = target?.items.find(item => item.id === values.backupItemId)
        if (!target || !file) {
          return
        }
        ctx.close()
        downloadItem(props.instance.id, target.id, file, downloadDeps)
      },
    },
    'backup-mass-delete': {
      async run (_values, ctx) {
        if (massInFlight) {
          return
        }
        massInFlight = true
        try {
          const outcome = await runBackupMassDelete(props.instance.id, massIds, massDeps)
          if (outcome === 'demo') {
            return
          }
          if (outcome === 'deleted') {
            clearSelection()
          }
          ctx.close()
          void reloadBackups()
        } finally {
          massInFlight = false
        }
      },
    },
  })

  function openRestore (item: BackupItem): void {
    openModal(restoreModal(item, translate, { custom: isCustom.value }), item)
  }

  function openDelete (item: BackupItem): void {
    openModal(deleteModal(item, translate, formatDate), item)
  }

  // Download from the row (desktop and mobile): the one-file window opens from this click, as legacy did.
  function openDownload (item: BackupItem): void {
    const choice = startDownload(props.instance.id, item, downloadDeps, { custom: isCustom.value })
    if (choice) {
      openModal(choice, item)
    }
  }

  // The snackbar's remove action. The selection is read now, so a later change does not reach the dialog.
  function openMassDelete (): void {
    const ids = [...checkedItems.value]
    if (ids.length === 0) {
      return
    }
    massIds = ids
    openModal(massDeleteModal(ids.map(id => ({ id })), translate), null)
  }

  // Plain create (the Add new button and the empty state). Takes no argument, so a click event never reaches the modal as an id.
  function openCreate (): void {
    createModal.value?.open()
  }

  // A retry of a failed create.
  function openRetry (item: BackupItem): void {
    createModal.value?.open(item.id, item.convert_from_id)
  }

  // Convert to a full backup.
  function openConvert (item: BackupItem): void {
    createModal.value?.open(undefined, item.id)
  }

  // The "try" link of a failed row. Each failed action opens its
  // own modal, in the legacy order (create, delete, restore).
  function repeatAction (item: BackupItem): void {
    if (item.async_status.create === 'failed') {
      openRetry(item)
    }
    if (item.async_status.delete === 'failed') {
      openDelete(item)
    }
    if (item.async_status.restore === 'failed') {
      openRestore(item)
    }
  }

  // After every create the list reloads, on both routes (`/instances/:id/backups` and `/projects/:id/backups`).
  function onCreated (): void {
    void reloadBackups()
  }

  // A backup outside the loaded list is ignored whole, so the
  // usage and the frame chip stay as they are (a deliberate deviation from legacy).
  useAppEvent('backup-item-changed', payload => {
    const result = applyBackupChanged(allItems.value, payload)
    if (!result.matched) {
      return
    }
    allItems.value = result.items
    dataVersion++
    usage.value = recountUsage(usage.value, result.items)
    const row = asBackupRow(payload)
    if (row) {
      props.instance.setBackupItem(row)
    }
  })

  useAppEvent('backup-item-deleted', payload => {
    const result = applyBackupDeleted(allItems.value, payload)
    if (!result.matched) {
      return
    }
    allItems.value = result.items
    dataVersion++
    usage.value = recountUsage(usage.value, result.items)
    pruneSelection()
    const row = asBackupRow(payload)
    if (row) {
      props.instance.unsetBackupItem(row)
    }
  })

  onMounted(() => {
    void reloadBackups()
    void loadAutomaticSettings()
  })
</script>

<style lang="scss" scoped>
// The V2 search field shrank to its icon (54px: the 30px icon column and the 12px field padding on each side) when the row is full; the
// V4 field keeps the 32px of its input column, so the neighbouring switcher lost that room instead.
.data-iterator-filter-controls :deep(.v-input) {
  min-width: 54px;
}

// The Add button keeps its label on a phone, and the switcher, the search and the button no longer fit in one row (375px: the row
// ended 60px off the screen). Below `sm` the button drops to a second row.
@media (max-width: 575.98px) {
  .instance-backups :deep(.page-title__filter-controls) {
    flex-wrap: wrap;
    justify-content: flex-start;
    row-gap: 12px;
  }

  // The button sits alone in the second row: no indent (`_pageTitle.scss` gives it a 16px start margin next to a neighbour).
  .instance-backups :deep(.page-title__filter-controls .page-title__add-button) {
    margin-left: 0;
  }
}

// V2 `.v-tooltip__content { line-height: 22px }`; the V4 tooltip computes 22.4px. The tooltip is teleported, so its class is global.
:global(.backups-limit-tooltip) {
  line-height: 22px;
}
</style>

<template>
  <div
    class="px-6"
    :class="showNoData ? 'instances-no-data-container' : ''"
  >
    <instances-drop-zone
      v-if="showNoData"
      :disabled="!isSingleServer"
      @invalid-drop="onProjectsInvalidDrop"
      @valid-drop="onProjectsValidDrop"
    >
      <instance-no-data />
    </instances-drop-zone>

    <template v-else>
      <v-container class="px-0">
        <div
          class="d-flex justify-space-between flex-lg-row flex-column"
          :class="lgAndDown ? 'mt-3 mb-3' : 'mt-7 mb-7'"
        >
          <div class="d-flex align-center justify-lg-start justify-space-between">
            <h1
              class="font-weight-800"
              data-testid="instances-title"
            >
              {{ pageTitle }}
            </h1>

            <list-grid-switch
              v-model:list-style="instancesListStyle"
              data-testid="instances-style-switch"
              :grid-label="t('button.grid')"
              :list-label="t('button.table')"
            />
          </div>

          <div
            class="d-flex"
            :class="lgAndDown ? 'mt-4' : ''"
          >
            <data-iterator-filter-controls
              :available-labels="labels.availableLabels"
              data-testid="instances-filter-controls"
              filter
              :filter-labels="store.filterLabels"
              full-width-search
              :keys="keys"
              :search-term="store.searchTerm"
              :show-search-term="true"
              :sort-by="!instancesListStyle ? store.sortBy : false"
              :sort-desc="store.sortDesc"
              @update:filter-labels="handleFilterLabels"
              @update:search-term="handleSearchTermChange"
              @update:sort-by="changeSortBy"
            />
          </div>
        </div>
      </v-container>

      <v-divider :class="lgAndDown ? 'mb-3' : 'mb-10'" />

      <instances-drop-zone
        :disabled="!isSingleServer"
        @invalid-drop="onProjectsInvalidDrop"
        @valid-drop="onProjectsValidDrop"
      >
        <div
          :class="store.checkedItems.length > 0 ? 'pb-15' : ''"
          data-testid="instances-content"
        >
          <error-card
            v-if="store.loadingFailure"
            class="mb-6"
            data-testid="instances-load-error"
            :message="store.loadingError"
          >
            <template #action>
              <AppButton
                data-testid="instances-load-retry"
                kind="field"
                :loading="store.itemsLoading"
                type="button"
                @click="loadInstances"
              >
                {{ t('button.retry') }}
              </AppButton>
            </template>
          </error-card>

          <template v-if="instancesListStyle === 0">
            <data-iterator
              :filter-labels="store.filterLabels"
              :items="store.items"
              :items-per-page="store.itemsPerPage as number"
              :items-total="store.itemsTotal"
              :keys="keys"
              :list-style="instancesListStyle"
              :loading="store.itemsLoading"
              :page="store.page"
              :possible-items-per-page="[[8, 16, 32, t('general.all')]]"
              :search-term="store.searchTerm"
              :sort-by="store.sortBy"
              :sort-desc="store.sortDesc"
              @clear-all-filters="clearFilters"
              @update:items-per-page="changePerPage"
              @update:page="changePage"
            >
              <template #loading>
                <v-row class="py-3">
                  <v-col
                    v-for="(_, key) in 8"
                    :key="key"
                    class="responsive-card"
                    cols="12"
                    md="6"
                    sm="6"
                    xl="3"
                  >
                    <instance-item-skeleton />
                  </v-col>
                </v-row>
              </template>

              <template #grid>
                <v-col
                  v-for="(item, key) in store.items"
                  :key="key"
                  class="responsive-card"
                  cols="12"
                  md="6"
                  sm="6"
                  xl="3"
                >
                  <instance-item
                    :key="item.id"
                    :checked="store.checkedItems.includes(item.id)"
                    :checking-app-login="checkingAppLoginId === item.id"
                    :checking-wp-login="checkingWpLoginId === item.id"
                    :item="item"
                    @app-login="showAppLoginModal"
                    @cancel-install="openCancelDialog"
                    @cancel-installation="openCancelDialog"
                    @checked="store.handleItemCheck(item)"
                    @import-details="showImportDetails"
                    @retry-install="retryInstall"
                    @share="openShare"
                    @toggle-filter="toggleFilterLabel"
                    @unsuspend="showUnsuspendInstance"
                    @wp-admin="showWpAdminModal"
                  />
                </v-col>
              </template>
            </data-iterator>
          </template>

          <template v-if="instancesListStyle === 1">
            <instance-table
              ref="tableRef"
              :checked-items="store.checkedItems"
              :checking-updates-id="checkingUpdatesId"
              :checking-wp-login-id="checkingWpLoginId"
              :filter-labels="store.filterLabels"
              :items="tableItems"
              :items-loading="store.itemsLoading"
              :items-per-page="store.itemsPerPage as number"
              :items-total="store.itemsTotal"
              :keys="keys"
              :list-style="0"
              :page="store.page"
              :possible-items-per-page="[[8, 16, 32, t('general.all')]]"
              :search-term="store.searchTerm"
              :sort-by="store.sortBy"
              :sort-desc="store.sortDesc"
              @cancel-install="openCancelDialog"
              @clear-all-filters="clearFilters"
              @clear-cache="showClearCacheModal"
              @copy="showCopyModal"
              @delete="showDeleteModal"
              @import-details="showImportDetails"
              @log-in="showKebabLoginModal"
              @push-to-live="showPushModal"
              @retry-install="retryInstall"
              @share="openShare"
              @show-deploy-logs="showDeployLogs"
              @staging="showStagingModal"
              @toggle-filter="toggleFilterLabel"
              @unsuspend="showUnsuspendInstance"
              @update="showUpdateModal"
              @update:check-all="store.handleSelectAll"
              @update:checked-items="store.handleItemCheck"
              @update:items-per-page="changePerPage"
              @update:page="changePage"
              @update:sort-by="changeSortBy"
              @update:sort-desc="changeSortDesc"
              @wp-admin="showWpAdminModal"
            />
          </template>

          <instance-action-snackbar
            :can-share="canMassShare"
            :checked-items="store.checkedItems"
            :items="store.items"
            @mass-action-remove="massActionRemove"
            @mass-action-share="showShareInstanceModal"
            @update:check-all="store.handleSelectAll"
          />
        </div>
      </instances-drop-zone>
    </template>

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

    <wp-admin-sso-modal
      ref="ssoModal"
      :preview-provider-enabled="Boolean(session.home?.app?.integrations?.preview_site_provider_enabled)"
      :single-server="isSingleServer"
    />

    <app-sso-modal
      ref="appLoginModal"
      :preview-provider-enabled="Boolean(session.home?.app?.integrations?.preview_site_provider_enabled)"
      :single-server="isSingleServer"
    />

    <create-staging-modal
      ref="stagingModal"
      @created="onStagingCreated"
    />

    <cancel-installation-dialog
      v-model="cancelOpen"
      :instance="cancelTarget"
      :loading="cancelLoading"
      @confirm="confirmCancel"
    />

    <import-instance-details-modal
      ref="importModal"
      :single-server="isSingleServer"
    />

    <share-instance-modal
      v-model="shareOpen"
      :current-user-email="session.home?.user?.email"
      :instance="shareInstance"
      :multi-instances="shareMulti"
      :single-server="isSingleServer"
    />
  </div>
</template>

<script lang="ts" setup>
  // app-lite adds the drop zone and the project title. The grid, table, toolbar and footer, the selection bar, the `BasicModal` dialog of
  // the mass actions and the unsuspend dialog, and the share dialog.
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed, onBeforeUnmount, onMounted, type Ref, ref, useTemplateRef } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import { useLabelsStore } from '@/entities/label/labels.store'
  import { buildMassDeleteModal, runMassDelete } from '@/entities/project/action-modal'
  import { isContainerProject } from '@/entities/project/container-project'
  import { copyInstance, getAppSsoUsers, getPushToLiveDiff, getServiceInstanceOptions, getWordpressSsoUsers, getWordpressUpdates, pushToLive, updateWordpress } from '@/entities/project/instance-actions.api'
  import {
    buildClearCacheModal,
    buildCopyModal,
    buildPushLoadingModal,
    buildSingleDeleteModal,
    type CancelInstallDeps,
    type CopyService,
    loadPushModal,
    prefetchUpdates,
    type RowActionDeps,
    runCancelInstallation,
    runClearCache,
    runPushToLive,
    runSingleDelete,
    runUpdate,
    submitCopy,
  } from '@/entities/project/instance-row-actions'
  import ActionModalHost from '@/entities/project/ui/ActionModalHost.vue'
  import AppSsoModal from '@/entities/project/ui/AppSsoModal.vue'
  import CancelInstallationDialog from '@/entities/project/ui/CancelInstallationDialog.vue'
  import CreateStagingModal from '@/entities/project/ui/CreateStagingModal.vue'
  import ImportInstanceDetailsModal from '@/entities/project/ui/ImportInstanceDetailsModal.vue'
  import ShareInstanceModal from '@/entities/project/ui/ShareInstanceModal.vue'
  import WpAdminSsoModal from '@/entities/project/ui/WpAdminSsoModal.vue'
  import { type SsoUserOption, toAppSsoOptions, toSsoOptions } from '@/entities/project/wp-admin-sso'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { emit as emitAppEvent } from '@/shared/events/app-events'
  import { useSessionStore } from '@/shared/session/session.store'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ListGridSwitch from '@/shared/ui/buttons/ListGridSwitch.vue'
  import DataIterator from '@/shared/ui/data-iterator/DataIterator.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import ErrorCard from '@/shared/ui/error-card/ErrorCard.vue'
  import { type ActionContext, useActionModal } from '@/shared/ui/modal/use-action-modal'
  import { buildInstanceKeys } from './instance-keys'
  import { buildUnsuspendModal, unsuspendInstance } from './instance-mass-actions'
  import InstanceActionSnackbar from './InstanceActionSnackbar.vue'
  import InstanceItem from './InstanceItem.vue'
  import InstanceItemSkeleton from './InstanceItemSkeleton.vue'
  import InstanceNoData from './InstanceNoData.vue'
  import { clearInstanceCache, deleteInstance } from './instances.api'
  import { useInstancesStore } from './instances.store'
  import InstancesDropZone from './InstancesDropZone.vue'
  import InstanceTable from './InstanceTable.vue'
  import { useCustomTablePage } from './use-custom-table-page'
  import { useDataIteratorPage } from './use-data-iterator-page'

  const { t } = useTranslation()
  const { lgAndDown } = useDisplay()
  const session = useSessionStore()
  const store = useInstancesStore()
  const labels = useLabelsStore()

  const {
    instancesListStyle,
    loadInstances,
    changePage,
    changePerPage,
    changeSortBy,
    changeSortDesc,
    handleSearchTermChange,
    handleFilterLabels,
    toggleFilterLabel,
    clearFilters,
  } = useDataIteratorPage({ route: useRoute(), router: useRouter() })

  const { tableItems } = useCustomTablePage()

  const keys = computed(() => buildInstanceKeys(Boolean(session.home?.app?.integrations?.atarim_enabled)))

  // The project heading under single server.
  const pageTitle = computed(() => session.home?.app?.single_server?.active ? t('heading.instance.titleProjects') : t('heading.instance.title'))

  const showNoData = computed(() => store.unfilteredEmpty)

  const isSingleServer = computed(() => Boolean(session.home?.app?.single_server?.active))

  // One dialog for the mass actions, the row actions and the unsuspend prompt. The state and the dispatch of its
  // buttons are in `useActionModal`; the handlers below are the list's (selection, `checkedItems`, `unsuspendLink`).
  const alerts = useAlertsStore()
  let unsuspendLink: string | true = true

  const massActionDeps: RowActionDeps = {
    clearInstanceCache,
    deleteInstance: (id, body) => deleteInstance(id, body),
    getWordpressUpdates,
    updateWordpress,
    getServiceInstanceOptions,
    copyInstance,
    getPushToLiveDiff,
    pushToLive,
    refreshHome: () => session.ensureHome(true),
    addSuccessAlert: message => alerts.addAlert({ success: true, successMessage: message }),
    addErrorAlert: message => alerts.addAlert({ success: false, errorMessage: message }),
    getErrorMessage,
    t: (key, options) => String(t(key, options as never)),
  }

  // The dialog's handlers, one per modal type. The target is the instance a row kebab action runs on;
  // `null` for the mass actions of the selection. A type with no request (`suspend`) does not go busy.
  const copyHandler = {
    async run (values: Record<string, unknown>, ctx: ActionContext<InstanceResource>): Promise<void> {
      if (!ctx.target) {
        return
      }
      const step = await submitCopy(ctx.target, values, session.services as CopyService[], massActionDeps)
      if (step.kind === 'options') {
        // Step 2 rebuilds the dialog in place (`resetModal` + new fields); `open` re-creates the `BasicModal`.
        ctx.open(step.modal)
      } else if (step.kind === 'copied') {
        ctx.close()
      }
    },
  }

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
  } = useActionModal<InstanceResource>({
    'suspend': { run: () => unsuspendInstance(unsuspendLink), busy: false },
    'clear-cache': {
      async run (_values, ctx) {
        if (!ctx.target) {
          return
        }
        // The dialog closes in `finally`, whatever the outcome.
        await runClearCache(ctx.target, massActionDeps)
        ctx.close()
      },
    },
    'update': {
      async run (values, ctx) {
        if (ctx.target && await runUpdate(ctx.target, values, massActionDeps) === 'success') {
          ctx.close()
        }
      },
    },
    'copy': copyHandler,
    'copy-options': copyHandler,
    'push': {
      async run (values, ctx) {
        const target = ctx.target
        if (!target) {
          return
        }
        if (await runPushToLive(target, values, massActionDeps) === 'success') {
          ctx.close()
          // The rows show the push as running until Echo reports `push-to-live-finished|failed`.
          store.setPushToLiveStatus(target.id, 'in_progress')
        }
      },
    },
    'mass-delete': {
      async run (values, ctx) {
        const target = ctx.target
        if (target) {
          if (await runSingleDelete(target, values, massActionDeps) === 'deleted') {
            ctx.close()
            emitAppEvent('instance-deleted', target as unknown as Record<string, unknown>)
          }
          return
        }
        const items = [...store.selectedInstances]
        if (await runMassDelete(items, values, massActionDeps) === 'deleted') {
          ctx.close()
          emitAppEvent('instance-deleted', items as unknown as Array<Record<string, unknown>>)
          store.checkedItems = []
        }
      },
    },
  })

  function massActionRemove (): void {
    openModal(buildMassDeleteModal(store.selectedInstances, massActionDeps.t), null)
  }

  // Row kebab (`InstanceItemMenu`): the action instance is the staging instance on a sub-row.
  function showClearCacheModal (instance: InstanceResource): void {
    openModal(buildClearCacheModal(instance, massActionDeps.t), instance)
  }

  function showDeleteModal (instance: InstanceResource): void {
    openModal(buildSingleDeleteModal(instance, massActionDeps.t), instance)
  }

  // Update: the updates load first, with the Update loader in the kebab; no updates is an alert only.
  const checkingUpdatesId = ref<number | null>(null)

  async function showUpdateModal (instance: InstanceResource): Promise<void> {
    checkingUpdatesId.value = instance.id
    try {
      const result = await prefetchUpdates(instance, massActionDeps)
      if (result.kind === 'modal') {
        openModal(result.modal, instance)
      }
    } finally {
      checkingUpdatesId.value = null
    }
  }

  // WP Admin: the administrators load first, with the loader in the kebab or on the
  // overlay button; a failure is an alert and the dialog does not open.
  const checkingWpLoginId = ref<number | null>(null)
  const ssoModal = useTemplateRef<InstanceType<typeof WpAdminSsoModal>>('ssoModal')

  async function showWpAdminModal (instance: InstanceResource): Promise<void> {
    checkingWpLoginId.value = instance.id
    try {
      const users = await getWordpressSsoUsers(instance.id)
      void ssoModal.value?.open(instance, toSsoOptions(users))
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      checkingWpLoginId.value = null
    }
  }

  // app-lite Log In: the project users load first (`GET /instances/:id/users`),
  // then `AppSsoModal` opens. The card overlay drives `checkingAppLogin`; the kebab shares the WP Admin loader (legacy opened
  // `WpAdminSsoModal` from the kebab).
  const checkingAppLoginId = ref<number | null>(null)
  const appLoginModal = useTemplateRef<{ open: (instance: InstanceResource, options: SsoUserOption[]) => Promise<void> | undefined }>('appLoginModal')

  async function openAppLogin (instance: InstanceResource, loader: Ref<number | null>): Promise<void> {
    loader.value = instance.id
    try {
      const users = await getAppSsoUsers(instance.id)
      void appLoginModal.value?.open(instance, toAppSsoOptions(users))
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      loader.value = null
    }
  }

  function showAppLoginModal (instance: InstanceResource): Promise<void> {
    return openAppLogin(instance, checkingAppLoginId)
  }

  function showKebabLoginModal (instance: InstanceResource): Promise<void> {
    return openAppLogin(instance, checkingWpLoginId)
  }

  // Show Logs of a custom project's kebab.
  const tableRef = useTemplateRef<{ openDeployLogs: (instance: InstanceResource) => Promise<void> }>('tableRef')

  function showDeployLogs (instance: InstanceResource): void {
    void tableRef.value?.openDeployLogs(instance)
  }

  // Create staging: the dialog runs its own requests; the list reloads so the new staging sub-row shows (legacy app never reloaded; app-lite does).
  const stagingModal = useTemplateRef<InstanceType<typeof CreateStagingModal>>('stagingModal')

  function showStagingModal (instance: InstanceResource): void {
    void stagingModal.value?.open(instance)
  }

  function onStagingCreated (): void {
    emitAppEvent('instances-list-reload')
  }

  function showCopyModal (instance: InstanceResource): void {
    openModal(buildCopyModal(session.services as CopyService[], massActionDeps.t), instance)
  }

  // Push to live: the staging sub-row's instance (the table passes the live one as the row item). The loading dialog shows
  // first; the answer reopens the dialog with the diff even when it was closed meanwhile (`showPushToLiveModal` is emitted again
  // by `openPushToLiveModal`), unless another push to live was requested since.
  let pushRequest = 0

  async function showPushModal (staging: InstanceResource): Promise<void> {
    const request = ++pushRequest
    // A container project has no diff request, so no loading state either.
    if (!isContainerProject(staging)) {
      openModal(buildPushLoadingModal(massActionDeps.t), staging)
    }
    const next = await loadPushModal(staging, massActionDeps)
    if (request === pushRequest) {
      openModal(next, staging)
    }
  }

  // Cancel installation. Every way in asks first (`CancelInstallationDialog`): the card overlay, the card's installation
  // indicator and the table (kebab, name cell) open the same dialog, whose checkbox is the removal acknowledgement the API
  // requires. It runs one request; the table path reloads the list too (legacy did not), through `instance-deleted`
  // like the card did.
  const cancelDeps: CancelInstallDeps = {
    ...massActionDeps,
    setInstallationStatus: (id, value) => {
      store.patchAsyncStatus(id, 'installation', value)
    },
  }

  const cancelOpen = ref(false)
  const cancelLoading = ref(false)
  const cancelTarget = ref<InstanceResource | null>(null)

  function openCancelDialog (instance: InstanceResource): void {
    cancelTarget.value = instance
    cancelOpen.value = true
  }

  async function cancelInstallation (instance: InstanceResource): Promise<boolean> {
    if (!instance?.id) {
      return false
    }
    if (await runCancelInstallation(instance, cancelDeps) !== 'cancelled') {
      return false
    }
    emitAppEvent('instance-deleted', instance as unknown as Record<string, unknown>)
    return true
  }

  async function confirmCancel (): Promise<void> {
    if (!cancelTarget.value || cancelLoading.value) {
      return
    }
    cancelLoading.value = true
    try {
      // The dialog closes when the request succeeds and stays open on an error (the alert shows it).
      if (await cancelInstallation(cancelTarget.value)) {
        cancelOpen.value = false
      }
    } finally {
      cancelLoading.value = false
    }
  }

  // Import details and Try again. The retry runs in the shell (`useRetryInstall`); every source raises the bus event once.
  const importModal = useTemplateRef<InstanceType<typeof ImportInstanceDetailsModal>>('importModal')

  function showImportDetails (instance: InstanceResource): void {
    importModal.value?.show(instance)
  }

  function retryInstall (instance: InstanceResource): void {
    emitAppEvent('instance-retry-install', instance as unknown as Record<string, unknown>)
  }

  function showUnsuspendInstance (url: string | true): void {
    unsuspendLink = url
    openModal(buildUnsuspendModal(massActionDeps.t), null)
  }

  // ShareInstanceModal: the mass Share action shares the selection (`multiInstances`), the share chip of a card one instance.
  const shareOpen = ref(false)
  const shareMode = ref<'multi' | 'single'>('multi')
  const shareSingle = ref<InstanceResource | undefined>(undefined)
  const shareInstance = computed(() => shareMode.value === 'single' ? shareSingle.value : undefined)
  const shareMulti = computed(() => shareMode.value === 'multi' ? store.selectedInstances : [])

  // The mass Share needs `general.manage_shared_access` on every selected project (the API refuses the others).
  const canMassShare = computed(() => store.selectedInstances.every(instance => instance.hasManageSharedAccessPrivilege()))

  function showShareInstanceModal (): void {
    shareMode.value = 'multi'
    shareOpen.value = true
  }

  function openShare (instance: InstanceResource): void {
    shareSingle.value = instance
    shareMode.value = 'single'
    shareOpen.value = true
  }

  // app-lite drop zone: an invalid drop shows the legacy alert, a valid one loads `/home` and
  // hands the files to the onboarding (`start-files-drop-install`).
  function onProjectsInvalidDrop (errorKey: string, errorParams?: Record<string, unknown>): void {
    alerts.addAlert({ success: false, errorMessage: String(t(errorKey, errorParams as never)) })
  }

  async function onProjectsValidDrop (payload: { uploadItems: File[] }): Promise<void> {
    try {
      await session.refreshServices()
      emitAppEvent('start-files-drop-install', payload)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    }
  }

  // A file dropped beside the zone must not navigate the tab away.
  function preventWindowFileNavigation (event: Event): void {
    event.preventDefault()
  }

  let windowDropGuard = false

  onMounted(() => {
    void labels.loadLabels()
    void loadInstances()
    if (isSingleServer.value) {
      windowDropGuard = true
      window.addEventListener('dragover', preventWindowFileNavigation)
      window.addEventListener('drop', preventWindowFileNavigation)
    }
  })

  onBeforeUnmount(() => {
    if (windowDropGuard) {
      window.removeEventListener('dragover', preventWindowFileNavigation)
      window.removeEventListener('drop', preventWindowFileNavigation)
    }
  })
</script>

<style lang="scss" scoped>
// V2 `.container` padding is 12px (`px-0` clears the sides); V4 `.v-container` is 16px.
.v-container {
  padding: 12px 0;
}

.v-divider {
  margin-left: -24px;
  min-width: calc(100% + 48px);
}

.instances-no-data-container {
  position: absolute;
  // V2 `.v-main__wrap` is `position: relative` below the 88px bar padding; V4 `.v-main` is not positioned.
  top: var(--v-layout-top, 88px);
  left: 0;
  right: 0px;
  height: calc(100vh - 88px);
}
</style>

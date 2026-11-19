<template>
  <div :class="isProject ? 'advanced-hosting-page' : undefined">
    <!-- `project`: the frame (global `.page-title--advanced`; V4 `.v-col`/`.v-row`/`.v-container` paddings and the row margin beat the global rules, so they are set by utilities: V2 container 12 px, cols 0, row without bottom margin). -->
    <PageTitle
      :title="t(`heading.hosting.${pageType}.title`)"
      title-testid="sftp-title"
      :variant="isProject ? 'advanced' : 'section'"
    >
      <template #filters>
        <ActiveServerAccountSelector
          v-if="!isProject && service.server_accounts.length > 1"
          v-model="serverAccount"
          class="ml-4 title-bar"
          data-testid="sftp-account-selector"
          :items="service.server_accounts"
        />

        <data-iterator-filter-controls
          v-if="items.length > 0"
          class="ml-4 my-hostings-search"
          data-testid="sftp-search"
          :full-width-lg="false"
          :full-width-md="true"
          :full-width-search="false"
          :search-term="searchTerm"
          :show-search-term="true"
          @update:search-term="handleSearchTermChange"
        />

        <quick-actions-button
          v-if="items.length > 0"
          :actions="menuActions"
          :icon="false"
          :label="t('button.actions')"
          mobile-icon="settings"
          test-id="sftp-actions"
          @select="onActionsSelect"
        />

        <PageAddButton
          v-if="items.length > 0"
          data-testid="sftp-add"
          :label="t(`button.${pageType}.add`)"
          @click="showAddModal"
        />
      </template>
    </PageTitle>

    <v-container :class="isProject ? 'mt-3 px-0 pt-0' : 'mt-3 px-0'">
      <v-row>
        <v-col cols="12">
          <hosting-ftp-table
            v-if="serverAccount && !serverAccount.diagnostic_mode"
            data-testid="sftp-table"
            :headers="headers"
            :item-class="itemClass"
            :items="items"
            :items-loading="itemsLoading"
            :items-per-page="itemsPerPage"
            :page="page"
            :possible-items-per-page="possibleItemsPerPage"
            :search-term="searchTerm"
            :sort-by="sortBy"
            :sort-desc="sortDesc"
            type="sftp"
            :usage-supported="false"
            @action-button-delete="showDeleteModal"
            @action-button-edit="showEditModal"
            @action-button-info="loadInfoModal"
            @clear-filters="clearFilters"
            @update:items-per-page="changePerPage"
            @update:page="changePage"
            @update:sort-by="changeSortBy"
            @update:sort-desc="changeSortDesc"
          >
            <template #no-data>
              <error-card
                v-if="loadError !== null"
                data-testid="sftp-load-error"
                :message="loadError"
                retryable
                @retry="reloadData()"
              />

              <empty-state
                v-else
                data-testid="sftp-empty"
                :desc="t(`message.emptyTable.${pageType}.description`)"
                :title="t(`message.emptyTable.${pageType}.title`)"
              >
                <template #image>
                  <hosting-ftp-illustration />
                </template>

                <template #action>
                  <page-add-button
                    data-testid="sftp-empty-add"
                    :label="t(`button.${pageType}.add`)"
                    @click="showAddModal"
                  />
                </template>
              </empty-state>
            </template>

            <template #updated_at="{ updated_at_text: updatedText }">
              <span>{{ updatedText }}</span>
            </template>
          </hosting-ftp-table>
        </v-col>
      </v-row>
    </v-container>

    <AppDialog
      v-model="modalOpen"
      overlay
      :persistent="modalPersistent"
      scroll-lock="mobile"
      transition="custom-dialog-transition"
      @after-leave="clearFormValues"
    >

      <basic-modal
        v-if="modal"
        :key="modalRender"
        ref="modalInstance"
        :buttons="modal.buttons"
        class="card-width-560"
        :color="modal.color"
        :confirm-required="modal.kind === 'delete'"
        :confirmed="confirmed"
        data-testid="sftp-modal"
        :icon="modal.icon"
        :message="modal.message"
        :submitting="modalSubmitting"
        :title="modal.title"
        @button-click="onModalButton"
        @modal-close="modalClose"
      >
        <basic-modal-field
          v-for="(field, index) in modal.fields"
          :key="index"
          :data-testid="`sftp-modal-field-${modalFieldName(field)}`"
          :field="field"
          :last="index === lastVisibleFieldIndex"
          :model-value="fieldValue(field)"
          @change="onFieldChange(field, $event)"
          @update:model-value="setFieldValue(field, $event)"
        />
      </basic-modal>
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  import type { HostingServerAccount, HostingService } from '@/views/hosting/hosting.types'
  import type { SftpRow } from './sftp-accounts'
  import type { SftpFormValues, SftpModal, SftpModalField } from './sftp-modals'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, onScopeDispose, ref, useTemplateRef, watch } from 'vue'
  import { ftpRowClass } from '@/views/hosting/ftp/ftp-accounts'
  import { modalFieldName } from '@/views/hosting/ftp/ftp-modals'
  import { sftpPageType } from '@/views/hosting/hosting-sidebar-items'
  import ActiveServerAccountSelector from '@/views/hosting/ui/ActiveServerAccountSelector.vue'
  import HostingFtpTable from '@/views/hosting/ui/HostingFtpTable.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { fromNow } from '@/shared/time/from-now'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import QuickActionsButton from '@/shared/ui/buttons/QuickActionsButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import ErrorCard from '@/shared/ui/error-card/ErrorCard.vue'
  import HostingFtpIllustration from '@/shared/ui/illustrations/HostingFtpIllustration.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { sftpHeaders, sftpMenuActions, toSftpRow } from './sftp-accounts'
  import { accessSftpModal, addSftpModal, deleteSftpModal, disconnectSftpModal, editSftpModal, infoSftpModal, toggleAuthFields } from './sftp-modals'
  import { createSftpAccount, deleteSftpAccount, disconnectAllSftp, getSftpServerInfo, listSftpAccounts, setSftpAccessType, updateSftpAccount } from './sftp.api'

  // `project` is the frame of the project Advanced tab: a different header, no account selector,
  // the page is always `sftp`, a menu with "Disconnect all" only and a reload only for a new, truthy account id.
  const props = withDefaults(defineProps<{
    service: HostingService
    variant?: 'hosting' | 'project'
  }>(), {
    variant: 'hosting',
  })

  const isProject = computed(() => props.variant === 'project')

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  // The page is titled SSH when the plan allows SSH access, which also changes the keys below.
  // `project`: constant `sftp`.
  const pageType = computed(() => (isProject.value ? 'sftp' : sftpPageType(props.service)))
  const menuActions = computed(() => sftpMenuActions(t, props.service, props.variant))

  const serverAccount = ref<HostingServerAccount | null>(null)
  const items = ref<SftpRow[]>([])
  // It starts true and is only cleared: later reloads keep the list on screen until the response arrives.
  const itemsLoading = ref(true)
  // Message of the last failed list request; null when the last load worked. A failed load is not an empty list.
  const loadError = ref<string | null>(null)
  // Set from the list response; the Manage access modal starts from it and a change never updates it.
  const accessType = ref<'ssh' | 'sftp' | null>(null)
  // What the table emits for a row (`HostingFtpTableRow`): the fields the row actions read.
  type SftpTableItem = Pick<SftpRow, 'user'> & { infoButtonLoading?: boolean }
  // The account edited last, read by `itemClass` (cleared 1 s after the Update).
  const highlightUser = ref<string>()
  let highlightTimer: ReturnType<typeof setTimeout> | undefined

  // The `modal` ref is rebuilt on every open.
  const modal = ref<SftpModal | null>(null)
  const modalOpen = ref(false)
  const modalPersistent = ref(false)
  const modalSubmitting = ref(false)
  const modalRender = ref(0)
  // The row the Edit, Info and Delete modals act on.
  const modalItem = ref<SftpTableItem | null>(null)
  // The values of the modal fields.
  const formValues = ref<SftpFormValues>({})
  // The modal's exposed `validate()` (`BasicModal.vue` defineExpose).
  const modalInstance = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('modalInstance')

  // The V2 dialog's mobile scroll hiding is `AppDialog` `scroll-lock="mobile"`.
  useBodyScrollLock(modalOpen)

  // The required `confirm` checkbox of Delete.
  const confirmed = computed(() => formValues.value.confirm === true)
  // Legacy `last-child` goes to the last field that is shown.
  const lastVisibleFieldIndex = computed(() => (modal.value?.fields ?? []).flatMap((field, index) => (field.hidden ? [] : [index])).at(-1) ?? -1)
  const itemClass = (item: { user: string }) => ftpRowClass(item, highlightUser.value)

  // Legacy `isServerProvided: false`: search, sort and paging run on the loaded items, so the load callback is never called.
  // Legacy starts with `sortBy: "updated_at"`, a string the table reads as `undefined`, so the list keeps the backend order (no sort).
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
  } = useDataIteratorPageState({
    load: () => {
      // Client-side list: nothing to reload on a page, sort or search change.
    },
    serverProvided: false,
    itemsPerPage: 8,
    possibleItemsPerPage: [[8, 16, 24]],
    sortDesc: true,
  })

  const headers = sftpHeaders

  // The table's "no results" button resets the search term.
  function clearFilters (): void {
    searchTerm.value = ''
  }

  // Actions menu: `disconnect` opens Disconnect all, `access` opens Manage access.
  function onActionsSelect (id: string): void {
    if (id === 'disconnect') {
      showDisconnectModal()
    } else if (id === 'access') {
      showAccessModal()
    }
  }

  function showDisconnectModal (): void {
    openModal(disconnectSftpModal(t, { pageType: pageType.value }))
  }

  function showAccessModal (): void {
    openModal(accessSftpModal(t, { pageType: pageType.value, accessType: accessType.value }))
  }

  // A diagnostic account shows an alert and no list; a failed request keeps the rows that were loaded before.
  // A response of an older request (another account or a newer reload) is dropped, so it cannot overwrite the rows of the latest one.
  let reloadSeq = 0
  async function reloadData (): Promise<void> {
    const seq = ++reloadSeq
    const account = serverAccount.value
    if (!account) {
      return
    }
    if (account.diagnostic_mode) {
      alerts.addAlert({ success: false, errorMessage: t('message.hostingAccountInDiagnosticMode') })
      itemsLoading.value = false
      return
    }
    try {
      const response = await listSftpAccounts(account.id)
      if (seq !== reloadSeq) {
        return
      }
      items.value = response.data.map(item => toSftpRow(item, response.meta.actions, fromNow))
      loadError.value = null
      accessType.value = response.meta.access_type
    } catch (error) {
      if (seq !== reloadSeq) {
        return
      }
      loadError.value = getErrorMessage(error)
      alerts.addAlert({ success: false, errorMessage: loadError.value })
    } finally {
      if (seq === reloadSeq) {
        itemsLoading.value = false
      }
    }
  }

  function openModal (next: SftpModal): void {
    modalRender.value++
    formValues.value = { ...next.initialValues }
    modal.value = next
    modalOpen.value = true
  }

  function modalClose (): void {
    modalOpen.value = false
  }

  // The password lives in `formValues`; it goes once the dialog has left, so the closing transition still shows the values.
  function clearFormValues (): void {
    formValues.value = {}
  }

  function fieldValue (field: SftpModalField): unknown {
    return formValues.value[modalFieldName(field)]
  }

  function setFieldValue (field: SftpModalField, value: unknown): void {
    formValues.value = { ...formValues.value, [modalFieldName(field)]: value }
  }

  // On a change of the authentication method: the password and the public key fields swap places.
  function onFieldChange (field: SftpModalField, value: unknown): void {
    if (modal.value && modalFieldName(field) === 'type') {
      toggleAuthFields(modal.value.fields, value)
    }
  }

  // Opens at once, no request.
  function showAddModal (): void {
    const account = serverAccount.value
    if (!account) {
      return
    }
    openModal(addSftpModal(t, { pageType: pageType.value, serverAccount: account, variant: props.variant }))
  }

  // The modal stays open on error and closes after a success. The Add has no highlight (legacy highlights
  // `formData.user`, which the form never sets).
  async function submitAdd (): Promise<void> {
    const account = serverAccount.value
    if (!account) {
      return
    }
    try {
      const formValid = (await modalInstance.value?.validate())?.valid === true
      if (!formValid) {
        return
      }

      modalPersistent.value = true
      modalSubmitting.value = true
      await createSftpAccount(account.id, { ...formValues.value })
      void reloadData()
      alerts.addAlert({ success: true, successMessage: t(`notification.hosting.${pageType.value}.add.success`) })
      modalClose()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalPersistent.value = false
      modalSubmitting.value = false
    }
  }

  // The row's account is the one the modal changes.
  function showEditModal (item: SftpTableItem): void {
    modalItem.value = item
    openModal(editSftpModal(t, { pageType: pageType.value, item }))
  }

  // The edited row is highlighted for 1 s after the list reloads.
  async function submitEdit (item: SftpTableItem): Promise<void> {
    const account = serverAccount.value
    if (!account) {
      return
    }
    try {
      const formValid = (await modalInstance.value?.validate())?.valid === true
      if (!formValid) {
        return
      }

      modalPersistent.value = true
      modalSubmitting.value = true
      await updateSftpAccount(account.id, item.user, { ...formValues.value })
      highlightUser.value = item.user
      clearTimeout(highlightTimer)
      highlightTimer = setTimeout(() => {
        highlightUser.value = undefined
      }, 1000)
      alerts.addAlert({ success: true, successMessage: t(`notification.hosting.${pageType.value}.update.success`) })
      void reloadData()
      modalClose()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalPersistent.value = false
      modalSubmitting.value = false
    }
  }

  // The spinner is on the row's info button.
  async function loadInfoModal (item: SftpTableItem): Promise<void> {
    const account = serverAccount.value
    if (!account) {
      return
    }
    item.infoButtonLoading = true
    try {
      openModal(infoSftpModal(t, { pageType: pageType.value, item, info: await getSftpServerInfo(account.id) }))
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      item.infoButtonLoading = false
    }
  }

  function showDeleteModal (item: SftpTableItem): void {
    modalItem.value = item
    openModal(deleteSftpModal(t, { pageType: pageType.value }))
  }

  // The modal closes on success only.
  async function submitDelete (item: SftpTableItem): Promise<void> {
    const account = serverAccount.value
    if (!account) {
      return
    }
    modalPersistent.value = true
    modalSubmitting.value = true
    try {
      await deleteSftpAccount(account.id, item.user)
      void reloadData()
      alerts.addAlert({ success: true, successMessage: t(`notification.hosting.${pageType.value}.delete.success`) })
      modalClose()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalPersistent.value = false
      modalSubmitting.value = false
    }
  }

  // The modal stays open on error and closes after a success; no reload.
  async function submitDisconnect (): Promise<void> {
    const account = serverAccount.value
    if (!account) {
      return
    }
    modalPersistent.value = true
    modalSubmitting.value = true
    try {
      await disconnectAllSftp(account.id)
      alerts.addAlert({ success: true, successMessage: t(`notification.hosting.${pageType.value}.disconnect.success`) })
      modalClose()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalPersistent.value = false
      modalSubmitting.value = false
    }
  }

  // No validation and no loader, so the flags are only set in `finally`; the modal closes on success.
  // No reload, and `accessType` stays as it was.
  async function submitAccess (accessMethod: 'ssh' | 'sftp'): Promise<void> {
    const account = serverAccount.value
    if (!account) {
      return
    }
    try {
      await setSftpAccessType(account.id, accessMethod)
      alerts.addAlert({ success: true, successMessage: t(`notification.hosting.${pageType.value}.setAccessType.success`) })
      modalClose()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalPersistent.value = false
      modalSubmitting.value = false
    }
  }

  function onModalButton (id: string): void {
    switch (id) {
      case 'add': {
        void submitAdd()
        break
      }
      case 'update': {
        if (modalItem.value) {
          void submitEdit(modalItem.value)
        }
        break
      }
      case 'delete': {
        if (modalItem.value && confirmed.value) {
          void submitDelete(modalItem.value)
        }
        break
      }
      case 'disconnect': {
        void submitDisconnect()
        break
      }
      case 'setAccessMethod': {
        void submitAccess(formValues.value.access_type as 'ssh' | 'sftp')
        break
      }
      case 'cancel': {
        modalClose()
        break
      }
    }
  }

  // The first account of the service is the active one.
  watch(() => props.service, service => {
    serverAccount.value = service.server_accounts[0] ?? null
  })
  // `project`: the account follows every new `service`, but the list reloads only for a new, truthy id; without an id there is no request
  // and the skeleton stays.
  watch(serverAccount, (value, oldValue) => {
    if (value === oldValue) {
      return
    }
    if (isProject.value && !(value?.id && value.id !== oldValue?.id)) {
      return
    }
    void reloadData()
  })

  onMounted(() => {
    serverAccount.value = props.service.server_accounts[0] ?? null
  })

  onScopeDispose(() => {
    clearTimeout(highlightTimer)
  })
</script>

<style lang="scss" scoped src="@/views/hosting/hosting-screen.scss"></style>

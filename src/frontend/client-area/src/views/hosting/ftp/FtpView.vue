<template>
  <div :class="isProject ? 'advanced-hosting-page' : undefined">
    <!-- `project`: the frame (global `.page-title--advanced`; V4 `.v-col`/`.v-row`/`.v-container` paddings and the row margin beat the global rules, so they are set by utilities: V2 container 12 px, cols 0, row without bottom margin). -->
    <PageTitle
      :title="t('heading.hosting.ftp.title')"
      title-testid="ftp-title"
      :variant="isProject ? 'advanced' : 'section'"
    >
      <template #filters>
        <ActiveServerAccountSelector
          v-if="!isProject && service.server_accounts.length > 1"
          v-model="serverAccount"
          class="mr-4 title-bar"
          data-testid="ftp-account-selector"
          :items="service.server_accounts"
        />

        <data-iterator-filter-controls
          v-if="items.length > 0"
          class="my-hostings-search"
          data-testid="ftp-search"
          :full-width-lg="false"
          :full-width-md="true"
          :full-width-search="false"
          :search-term="searchTerm"
          :show-search-term="true"
          @update:search-term="handleSearchTermChange"
        />

        <PageAddButton
          v-if="items.length > 0"
          data-testid="ftp-add"
          :label="t('button.ftp.add')"
          :loading="addButtonLoading"
          @click="loadAddModal"
        />
      </template>
    </PageTitle>

    <v-container :class="isProject ? 'mt-3 px-0 pt-0' : 'mt-3 px-0'">
      <v-row>
        <v-col cols="12">
          <hosting-ftp-table
            v-if="serverAccount && !serverAccount.diagnostic_mode"
            data-testid="ftp-table"
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
            type="ftp"
            :usage-supported="usageSupportedByServer"
            @action-button-delete="showDeleteModal"
            @action-button-edit="showEditModal"
            @action-button-info="loadInfoModal"
            @clear-filters="searchTerm = ''"
            @update:items-per-page="changePerPage"
            @update:page="changePage"
            @update:sort-by="changeSortBy"
            @update:sort-desc="changeSortDesc"
          >
            <template #no-data>
              <error-card
                v-if="loadError !== null"
                data-testid="ftp-load-error"
                :message="loadError"
                retryable
                @retry="reloadData()"
              />

              <empty-state
                v-else
                data-testid="ftp-empty"
                :desc="t('message.emptyTable.ftp.description')"
                :title="t('message.emptyTable.ftp.title')"
              >
                <template #image>
                  <hosting-ftp-illustration />
                </template>

                <template #action>
                  <page-add-button
                    data-testid="ftp-empty-add"
                    :label="t('button.ftp.add')"
                    @click="loadAddModal"
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
        data-testid="ftp-modal"
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
          :data-testid="`ftp-modal-field-${modalFieldName(field)}`"
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
  import type { FtpRow } from './ftp-accounts'
  import type { FtpFormValues, FtpModal, FtpModalField } from './ftp-modals'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, onScopeDispose, ref, useTemplateRef, watch } from 'vue'
  import ActiveServerAccountSelector from '@/views/hosting/ui/ActiveServerAccountSelector.vue'
  import HostingFtpTable from '@/views/hosting/ui/HostingFtpTable.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { fromNow } from '@/shared/time/from-now'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
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
  import { ftpHeaders, ftpRowClass, toFtpRow } from './ftp-accounts'
  import {
    addFtpModal,
    buildCreatePayload,
    deleteFtpModal,
    editFtpModal,
    ftpPasswordRefusal,
    infoFtpModal,
    isUsernameValid,
    modalFieldName,
    toggleQuotaHidden,
    withoutFtpPasswordMessage,
  } from './ftp-modals'
  import { createFtpAccount, deleteFtpAccount, getFtpServerInfo, listAccountDomains, listFtpAccounts, updateFtpAccount } from './ftp.api'

  // `project` is the frame of the project Advanced tab: a different header, no account selector
  // and a reload only for a new, truthy account id.
  const props = withDefaults(defineProps<{
    service: HostingService
    variant?: 'hosting' | 'project'
  }>(), {
    variant: 'hosting',
  })

  const isProject = computed(() => props.variant === 'project')

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  const serverAccount = ref<HostingServerAccount | null>(null)
  // What the table emits for a row (`HostingFtpTableRow`): the fields the row actions read.
  type FtpTableItem = Pick<FtpRow, 'user'> & { infoButtonLoading?: boolean }

  const items = ref<FtpRow[]>([])
  const itemsLoading = ref(true)
  // Message of the last failed list request; null when the last load worked. A failed load is not an empty list.
  const loadError = ref<string | null>(null)
  const usageSupportedByServer = ref(false)
  const addButtonLoading = ref(false)
  // The `user@domain` of the account added last, read by `itemClass` (cleared 1 s after the Add).
  const highlightUser = ref<string>()
  let highlightTimer: ReturnType<typeof setTimeout> | undefined

  // The `modal` ref is rebuilt on every open.
  const modal = ref<FtpModal | null>(null)
  const modalOpen = ref(false)
  const modalPersistent = ref(false)
  const modalSubmitting = ref(false)
  const modalRender = ref(0)
  // The row the Delete modal acts on.
  const modalItem = ref<FtpTableItem | null>(null)
  // The values of the modal fields.
  const formValues = ref<FtpFormValues>({})
  // The modal's exposed `validate()` (`BasicModal.vue` defineExpose).
  const modalInstance = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('modalInstance')

  // The V2 dialog's mobile scroll hiding is `AppDialog` `scroll-lock="mobile"`.
  useBodyScrollLock(modalOpen)

  // The required `confirm` checkbox of Delete.
  const confirmed = computed(() => formValues.value.confirm === true)
  // Legacy `last-child` goes to the last field that is shown.
  const lastVisibleFieldIndex = computed(() => (modal.value?.fields ?? []).flatMap((field, index) => (field.hidden ? [] : [index])).at(-1) ?? -1)

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

  const headers = ftpHeaders
  const itemClass = (item: { user: string }) => ftpRowClass(item, highlightUser.value)

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
    itemsLoading.value = true
    try {
      const response = await listFtpAccounts(account.id)
      if (seq !== reloadSeq) {
        return
      }
      loadError.value = null
      items.value = response.data.map(item => toFtpRow(item, t, fromNow))
      usageSupportedByServer.value = response.meta.usage
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

  // The first account of the service is the active one.
  watch(() => props.service, service => {
    serverAccount.value = service.server_accounts[0] ?? null
  })
  // `project`: the account follows every new `service` (fresh `diagnostic_mode`, `homedir`), but the list reloads only for a new, truthy
  // id; without an id there is no request and the skeleton stays.
  watch(serverAccount, (value, oldValue) => {
    if (value === oldValue) {
      return
    }
    if (isProject.value && !(value?.id && value.id !== oldValue?.id)) {
      return
    }
    void reloadData()
  })

  function openModal (next: FtpModal): void {
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

  function fieldValue (field: FtpModalField): unknown {
    return field.type === 'text-select' ? formValues.value : formValues.value[modalFieldName(field)]
  }

  // A `text-select` field emits its whole value (`{ user, domain }`); the other fields emit their own value.
  function setFieldValue (field: FtpModalField, value: unknown): void {
    formValues.value = field.type === 'text-select'
      ? value as FtpFormValues
      : { ...formValues.value, [modalFieldName(field)]: value }
    clearHeldPasswordMessage(field)
  }

  function onFieldChange (field: FtpModalField, value: unknown): void {
    if (modal.value && modalFieldName(field) === 'unlimited_quota') {
      toggleQuotaHidden(modal.value.fields, Boolean(value))
    }
  }

  function clearHeldPasswordMessage (field: FtpModalField): void {
    if (modal.value && modalFieldName(field) === 'password') {
      modal.value = withoutFtpPasswordMessage(modal.value)
    }
  }

  // The spinner stays on the title-bar Add button.
  async function loadAddModal (): Promise<void> {
    const account = serverAccount.value
    if (!account) {
      return
    }
    addButtonLoading.value = true
    try {
      const domains = await listAccountDomains(account.id)
      if (domains.length === 0) {
        // Legacy `domains[0].domain` throws on an empty list; its catch shows this generic copy and no modal opens.
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(undefined) })
        return
      }
      openModal(addFtpModal(t, { domains, homedir: account.homedir, usageSupported: usageSupportedByServer.value }))
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      addButtonLoading.value = false
    }
  }

  // The modal stays open on error and closes after a success.
  async function submitAdd (): Promise<void> {
    const account = serverAccount.value
    const values = formValues.value
    const user = String(values.user ?? '')
    const domain = String(values.domain ?? '')
    const formValid = (await modalInstance.value?.validate())?.valid === true
    if (!account || !formValid || !isUsernameValid(t, user, domain)) {
      return
    }

    modalPersistent.value = true
    modalSubmitting.value = true
    try {
      await createFtpAccount(account.id, buildCreatePayload(values))
      highlightUser.value = `${user}@${domain}`
      clearTimeout(highlightTimer)
      highlightTimer = setTimeout(() => {
        highlightUser.value = undefined
      }, 1000)
      void reloadData()
      alerts.addAlert({ success: true, successMessage: t('notification.hosting.ftp.add.success') })
      modalClose()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalPersistent.value = false
      modalSubmitting.value = false
    }
  }

  // The spinner is on the row's info button.
  async function loadInfoModal (item: FtpTableItem): Promise<void> {
    const account = serverAccount.value
    if (!account) {
      return
    }
    item.infoButtonLoading = true
    try {
      openModal(infoFtpModal(t, item, await getFtpServerInfo(account.id)))
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      item.infoButtonLoading = false
    }
  }

  function showDeleteModal (item: FtpTableItem): void {
    modalItem.value = item
    openModal(deleteFtpModal(t))
  }

  function showEditModal (item: FtpTableItem): void {
    modalItem.value = item
    openModal(editFtpModal(t, item))
  }

  async function submitEdit (item: FtpTableItem): Promise<void> {
    const account = serverAccount.value
    if (!account) {
      return
    }
    const formValid = (await modalInstance.value?.validate())?.valid === true
    if (!formValid) {
      return
    }

    modalPersistent.value = true
    modalSubmitting.value = true
    try {
      await updateFtpAccount(account.id, item.user, { password: String(formValues.value.password ?? '') })
      highlightUser.value = item.user
      clearTimeout(highlightTimer)
      highlightTimer = setTimeout(() => {
        highlightUser.value = undefined
      }, 1000)
      void reloadData()
      alerts.addAlert({ success: true, successMessage: t('notification.hosting.ftp.update.success') })
      modalClose()
    } catch (error) {
      const refused = ftpPasswordRefusal(error)
      if (refused === null || !modal.value) {
        alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
      } else {
        modal.value = {
          ...modal.value,
          fields: modal.value.fields.map(field => (field.type === 'generatePassword' ? { ...field, errorMessages: refused } : field)),
        }
      }
    } finally {
      modalPersistent.value = false
      modalSubmitting.value = false
    }
  }

  // The modal closes on success only.
  async function submitDelete (item: FtpTableItem): Promise<void> {
    const account = serverAccount.value
    if (!account) {
      return
    }
    modalPersistent.value = true
    modalSubmitting.value = true
    try {
      await deleteFtpAccount(account.id, item.user)
      void reloadData()
      alerts.addAlert({ success: true, successMessage: t('notification.hosting.ftp.delete.success') })
      modalClose()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalPersistent.value = false
      modalSubmitting.value = false
    }
  }

  function onModalButton (id: string): void {
    if (id === 'add') {
      void submitAdd()
    } else if (id === 'update' && modalItem.value) {
      void submitEdit(modalItem.value)
    } else if (id === 'delete' && modalItem.value && confirmed.value) {
      void submitDelete(modalItem.value)
    } else if (id === 'cancel') {
      modalClose()
    }
  }

  onMounted(() => {
    serverAccount.value = props.service.server_accounts[0] ?? null
  })

  onScopeDispose(() => {
    clearTimeout(highlightTimer)
  })
</script>

<style lang="scss" scoped src="@/views/hosting/hosting-screen.scss"></style>

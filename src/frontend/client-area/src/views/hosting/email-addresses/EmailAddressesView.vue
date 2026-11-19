<template>
  <div>
    <PageTitle
      :title="t('heading.hosting.emailAddress.title')"
      title-col-class="email-addresses-title-col"
      title-testid="email-addresses-title"
    >
      <template #filters>
        <template v-if="!emailAccounts.loading">
          <DataIteratorFilterControls
            v-if="emailAccounts.items.length > 0"
            class="my-hostings-search"
            data-testid="email-addresses-search"
            :full-width-lg="false"
            :full-width-md="true"
            :full-width-search="false"
            :search-term="searchTerm"
            :show-search-term="true"
            @update:search-term="handleSearchTermChange"
          />

          <PageAddButton
            v-if="emailAccounts.items.length > 0"
            data-testid="email-addresses-add"
            :label="t('emailAddress.addAddress', 'Add Address')"
            @click="openAddModal"
          />
        </template>
      </template>

      <template #bottom>
        <v-row>
          <v-col class="d-flex align-end domain-col">
            <EmailDomainSelector
              data-testid="email-addresses-domain"
              :domains="emailDomains.items"
              :loading="emailDomains.loading"
              :model-value="selectedEmailDomain"
              :records="records"
              :show-records="emailDomains.showRecords"
              @open-records="recordsModalOpen = true"
              @update:model-value="reloadEmailAccounts"
            />
          </v-col>
        </v-row>
      </template>
    </PageTitle>

    <v-container class="mt-3 px-0">
      <v-row>
        <v-col cols="12">
          <DataTable
            v-if="!isError"
            data-testid="email-addresses-table"
            :headers="emailAccountHeaders"
            :item-class="itemClass"
            :item-slots="['updated_at']"
            :items="emailAccounts.items"
            :items-loading="emailAccounts.loading"
            :items-per-page="itemsPerPage as number"
            :items-total="itemsTotal"
            :page="page"
            :possible-items-per-page="possibleItemsPerPage"
            :search-term="searchTerm"
            :sort-by="sortBy"
            :sort-desc="sortDesc"
            @clear-filters="searchTerm = ''"
            @update:items-per-page="changePerPage"
            @update:page="changePage"
            @update:sort-by="changeSortBy"
            @update:sort-desc="changeSortDesc"
          >
            <template #no-data>
              <EmptyState
                data-testid="email-addresses-empty"
                :desc="t('message.emptyTable.emailAddress.description')"
                :title="t('message.emptyTable.emailAddress.title')"
              >
                <template #image>
                  <HostingEmailAddressesIllustration />
                </template>

                <template #action>
                  <PageAddButton
                    data-testid="email-addresses-empty-add"
                    :label="t('button.emailAddress.add')"
                    @click="openAddModal"
                  />
                </template>
              </EmptyState>
            </template>

            <template #actions="row">
              <AppButton
                :aria-label="t('button.emailAddress.update')"
                kind="row-action"
                :tooltip="t('button.emailAddress.update')"
                :tooltip-offset="14"
                @click="openEditModal(slotRow(row))"
              >
                <v-icon
                  icon="$edit2"
                  size="24"
                />
              </AppButton>

              <AppButton
                :aria-label="t('button.emailAddress.show')"
                kind="row-action"
                :loading="listRow(slotRow(row)).detailsButtonLoading"
                :tooltip="t('button.emailAddress.show')"
                :tooltip-offset="14"
                @click="loadDetailsModal(slotRow(row))"
              >
                <v-icon
                  icon="$eye"
                  size="24"
                />
              </AppButton>

              <AppButton
                :aria-label="t('button.emailAddress.delete')"
                kind="row-action"
                :tooltip="t('button.emailAddress.delete')"
                :tooltip-offset="14"
                @click="openDeleteModal(slotRow(row))"
              >
                <v-icon
                  icon="$thrash"
                  size="24"
                />
              </AppButton>

              <AppButton
                :aria-label="t('button.emailAddress.logIn')"
                kind="row-action"
                :loading="listRow(slotRow(row)).webmailButtonLoading"
                :tooltip="t('button.emailAddress.logIn')"
                :tooltip-offset="14"
                @click="webmailSso(slotRow(row))"
              >
                <v-icon
                  icon="$mail"
                  size="24"
                />
              </AppButton>
            </template>

            <template #mobile="{ item: row }">
              <!-- Legacy header click emits `update:sortBy` to a frame that does not listen: no-op, so no handler here either. -->
              <MobileTableField
                :label="t('table.header.email')"
                :value="row.email"
              />

              <MobileTableField
                :label="t('table.header.usageQuota')"
                :value="row.usage_quota"
              />
            </template>

            <template #item.updated_at="{ item: row }">
              <div class="d-flex">
                <span>{{ row.updated_at_text }}</span>
              </div>
            </template>
          </DataTable>
        </v-col>
      </v-row>
    </v-container>

    <AppDialog
      v-model="recordsModalOpen"
      overlay
      scroll-strategy="none"
      transition="custom-dialog-transition"
    >

      <RecordConfiguration
        class="card-width-560"
        :dkim-configured="selectedRecords?.dkim.configured ?? false"
        :dkim-records="selectedEmailDomain?.dkim_records ?? []"
        :spf-configured="selectedRecords?.spf.configured ?? false"
        :spf-records="selectedEmailDomain?.spf_records ?? []"
        @close="recordsModalOpen = false"
      />
    </AppDialog>

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
        data-testid="email-addresses-modal"
        :icon="modal.icon"
        :submitting="modalSubmitting"
        :title="modal.title"
        @button-click="onModalButton"
        @modal-close="modalClose"
      >
        <basic-modal-field
          v-for="(field, index) in modal.fields"
          :key="index"
          :data-testid="`email-addresses-modal-field-${modalFieldName(field)}`"
          :field="field"
          :last="index === lastVisibleFieldIndex"
          :model-value="fieldValue(field)"
          @button-click="onFieldButtonClick"
          @change="onFieldChange(field, $event)"
          @update:model-value="setFieldValue(field, $event)"
        />
      </basic-modal>
    </AppDialog>

    <AppDialog
      v-model="detailsOpen"
      overlay
      scroll-lock="mobile"
      transition="custom-dialog-transition"
    >

      <AccountConfigurationDetails
        v-if="details"
        class="card-width-560"
        data-testid="email-addresses-details"
        :details="details"
        @modal-close="detailsOpen = false"
      />
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  // The domain selector with the SPF/DKIM chip is the shared `EmailDomainSelector`. The builders of the Add, Edit and Delete modals are in
  // `email-account-modals.ts`. The Details dialog is `AccountConfigurationDetails.vue`.
  import type { EmailDomain } from '@/views/hosting/email-domain-records'
  import type { HostingService } from '@/views/hosting/hosting.types'
  import type { EmailAccountModal } from './email-account-modals'
  import type { EmailAccountRow } from './email-accounts'
  import type { EmailAccountDetails } from './email-addresses.api'
  import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, onScopeDispose, reactive, ref, useTemplateRef, watch } from 'vue'
  import { getEmailDomains } from '@/views/hosting/hosting.api'
  import EmailDomainSelector from '@/views/hosting/ui/EmailDomainSelector.vue'
  import RecordConfiguration from '@/views/hosting/ui/RecordConfiguration.vue'
  import { useEmailDomainRecords } from '@/views/hosting/use-email-domain-records'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import { fromNow } from '@/shared/time/from-now'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import HostingEmailAddressesIllustration from '@/shared/ui/illustrations/HostingEmailAddressesIllustration.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import AccountConfigurationDetails from './AccountConfigurationDetails.vue'
  import {
    accountPayload,
    buildAddAccountModal,
    buildDeleteAccountModal,
    buildEditAccountModal,
    modalFieldName,
    revealPassword,
    toggleQuotaHidden,
  } from './email-account-modals'
  import { emailAccountHeaders, emailAccountRowClass, ITEMS_PER_PAGE_OPTIONS, toEmailAccountRow } from './email-accounts'
  import {
    createEmailAccount,
    deleteEmailAccount,
    getEmailAccountDetails,
    getWebmailSsoUrl,
    listEmailAccounts,
    updateEmailAccount,
  } from './email-addresses.api'

  const props = defineProps<{
    service: HostingService
  }>()

  const { t } = useTranslation()
  const alerts = useAlertsStore()

  // The email domains (`items`, `loading`) and the flag of the records chip.
  const emailDomains = reactive<{ items: EmailDomain[], loading: boolean, showRecords: boolean }>({
    items: [],
    loading: false,
    showRecords: false,
  })
  const selectedEmailDomain = ref<EmailDomain | null>(null)
  // The `spf_info` / `dkim_info` per domain, and the SPF/DKIM modal of the chip.
  const { records, check: checkEmailDomainRecords } = useEmailDomainRecords()
  const recordsModalOpen = ref(false)
  const selectedRecords = computed(() => {
    const selected = selectedEmailDomain.value
    return selected ? records.value[String(selected.id)] : undefined
  })
  const emailAccounts = reactive<{ items: EmailAccountRow[], loading: boolean }>({
    items: [],
    loading: false,
  })
  const isError = ref(false)
  // The address of the account added or edited last (cleared 1 s after the save).
  const highlightEmail = ref<string>()
  let highlightTimer: ReturnType<typeof setTimeout> | undefined

  // One `BasicModal` for Add and Edit, rebuilt on every open.
  const modal = ref<EmailAccountModal | null>(null)
  const modalOpen = ref(false)
  const modalPersistent = ref(false)
  const modalSubmitting = ref(false)
  const modalRender = ref(0)
  // The values of the modal fields.
  const modalValues = ref<Record<string, unknown>>({})
  // The domain and the row the open modal works on.
  const modalDomain = ref<EmailDomain | null>(null)
  const modalItem = ref<EmailAccountRow | null>(null)
  // The required `confirm` checkbox of Delete, which gates the button.
  const confirmed = computed(() => modalValues.value.confirm === true)
  // The Details dialog and the settings it shows.
  const detailsOpen = ref(false)
  const details = ref<EmailAccountDetails | null>(null)
  // The modal's exposed `validate()` (`BasicModal.vue` defineExpose).
  const modalInstance = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('modalInstance')
  let modalValidating = false

  // The V2 dialog's mobile scroll hiding is `AppDialog` `scroll-lock="mobile"`.
  useBodyScrollLock(modalOpen)
  useBodyScrollLock(detailsOpen)

  // Legacy `last-child` goes to the last field that is shown.
  const lastVisibleFieldIndex = computed(() => (modal.value?.fields ?? []).flatMap((field, index) => (field.hidden ? [] : [index])).at(-1) ?? -1)

  // Legacy `isServerProvided: false`: search, sort and paging run on the loaded accounts, so the load callback is never called.
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
    possibleItemsPerPage: [ITEMS_PER_PAGE_OPTIONS],
    sortDesc: true,
  })

  const itemsTotal = computed(() => emailAccounts.items.length)
  const itemClass = (item: Record<string, unknown>): string => emailAccountRowClass({ email: String(item.email) }, highlightEmail.value) ?? ''

  /**
   * The list's own row for a slot row. The `#actions` slot gets a copy of the row's fields, so the loading flags of the row's buttons are
   * set on the row of `emailAccounts.items`, which the table renders.
   */
  function listRow (item: EmailAccountRow): EmailAccountRow {
    return emailAccounts.items.find(account => account.email === item.email) ?? item
  }

  // The domains are copied: the response is shared with the frame through `cachedGet`, and the page must
  // not change it. The domain list and the accounts go in the same order and flags as legacy: the accounts start only after the domains
  // answer, so the empty state shows while the domains load (`emailAccounts.loading` stays false until then).
  async function reloadEmailDomains (): Promise<void> {
    emailDomains.loading = true
    isError.value = false
    try {
      const response = await getEmailDomains(props.service.id)
      emailDomains.showRecords = response.meta.is_email_dns_records_showed
      emailDomains.items = response.data.map(domain => ({ ...domain }))
      void checkEmailDomainRecords(emailDomains.items)
      if (emailDomains.items.length > 0) {
        selectedEmailDomain.value = emailDomains.items[0] ?? null
        void reloadEmailAccounts()
      } else {
        emailAccounts.items = []
        emailAccounts.loading = false
      }
    } catch (error) {
      isError.value = true
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      emailDomains.loading = false
    }
  }

  // The selected domain (when one is passed) and its accounts. Search and paging are kept.
  async function reloadEmailAccounts (domain: EmailDomain | null = null): Promise<void> {
    if (domain !== null) {
      selectedEmailDomain.value = domain
    }
    emailAccounts.loading = true
    isError.value = false
    const selected = selectedEmailDomain.value
    if (selected === null) {
      emailAccounts.loading = false
      return
    }

    try {
      const accounts = await listEmailAccounts(props.service.id, selected.id ?? '')
      emailAccounts.items = accounts.map(account => toEmailAccountRow(account, t, fromNow))
    } catch (error) {
      isError.value = true
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      emailAccounts.loading = false
    }
  }

  function modalClose (): void {
    modalOpen.value = false
  }

  // The password lives in `modalValues`; it goes once the dialog has left, so the closing transition still shows the values.
  function clearFormValues (): void {
    modalValues.value = {}
  }

  function openModal (next: EmailAccountModal): void {
    modalRender.value++
    modalValues.value = { ...next.initialValues }
    modal.value = next
    modalOpen.value = true
  }

  function fieldValue (field: ModalField): unknown {
    return field.type === 'text-select' ? modalValues.value : modalValues.value[modalFieldName(field)]
  }

  // A `text-select` field emits its whole value (`{ email, domain }`); the other fields emit their own value.
  function setFieldValue (field: ModalField, value: unknown): void {
    modalValues.value = field.type === 'text-select'
      ? value as Record<string, unknown>
      : { ...modalValues.value, [modalFieldName(field)]: value }
  }

  function onFieldChange (field: ModalField, value: unknown): void {
    if (modal.value && modalFieldName(field) === 'unlimited_quota') {
      toggleQuotaHidden(modal.value.fields, Boolean(value))
    }
  }

  /** The "Set New Password" button of Edit. */
  function onFieldButtonClick (): void {
    if (modal.value) {
      revealPassword(modal.value.fields)
    }
  }

  // Add opens with the selected domain. With no domain (the empty state of the account-less service), legacy throws
  // a TypeError on `selectedEmailDomain.domain`; the port stops quietly and opens nothing.
  function openAddModal (): void {
    const domain = selectedEmailDomain.value
    if (!domain) {
      return
    }
    modalDomain.value = domain
    modalItem.value = null
    openModal(buildAddAccountModal(domain, t))
  }

  // Opened from the row's Edit action (desktop and mobile share the `#actions` slot).
  function openEditModal (item: EmailAccountRow): void {
    const domain = selectedEmailDomain.value
    if (!domain) {
      return
    }
    modalDomain.value = domain
    modalItem.value = item
    openModal(buildEditAccountModal(item, t))
  }

  // Opened from the row's Delete action.
  function openDeleteModal (item: EmailAccountRow): void {
    const domain = selectedEmailDomain.value
    if (!domain) {
      return
    }
    modalDomain.value = domain
    modalItem.value = item
    openModal(buildDeleteAccountModal(t))
  }

  /**
   * The spinner stays on the row's `$eye` until the answer. The settings come from `cachedGet` (default TTL, as
   * legacy `Api.cached()`), so a second click on the same account does not request again. A failure alerts and opens nothing.
   */
  async function loadDetailsModal (item: EmailAccountRow): Promise<void> {
    const domain = selectedEmailDomain.value
    if (!domain) {
      return
    }
    const row = listRow(item)
    row.detailsButtonLoading = true
    try {
      details.value = await getEmailAccountDetails(props.service.id, domain.id ?? '', item.email)
      detailsOpen.value = true
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      row.detailsButtonLoading = false
    }
  }

  /**
   * The spinner stays on the row's `$mail` until the answer, then the browser goes to the one-time login URL. The URL is
   * not cached (see `getWebmailSsoUrl`), so every click asks the server for a fresh one.
   */
  async function webmailSso (item: EmailAccountRow): Promise<void> {
    const domain = selectedEmailDomain.value
    if (!domain) {
      return
    }
    const row = listRow(item)
    row.webmailButtonLoading = true
    try {
      window.location.href = await getWebmailSsoUrl(props.service.id, domain.id ?? '', item.email)
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      row.webmailButtonLoading = false
    }
  }

  /** The highlight of the saved account, cleared after 1 s. */
  function highlightAccount (email: string): void {
    highlightEmail.value = email
    clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => {
      highlightEmail.value = undefined
    }, 1000)
  }

  /**
   * `persistent` and `submitting` on for the request, then the success alert with a
   * reload and the closed dialog, or the error alert with the dialog left open.
   */
  async function runSave (request: () => Promise<void>, successKey: string, afterSuccess: () => void): Promise<void> {
    modalPersistent.value = true
    modalSubmitting.value = true
    try {
      await request()
      afterSuccess()
      void reloadEmailAccounts(modalDomain.value)
      alerts.addAlert({ success: true, successMessage: t(successKey) })
      modalClose()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      modalPersistent.value = false
      modalSubmitting.value = false
    }
  }

  async function submitAdd (): Promise<void> {
    const domain = modalDomain.value
    if (!domain) {
      return
    }
    const values = modalValues.value
    const payload = accountPayload(values)
    await runSave(
      () => createEmailAccount(props.service.id, domain.id ?? '', payload),
      'notification.hosting.emailAddress.add.success',
      () => {
        highlightAccount(`${String(values.email ?? '')}@${String(values.domain ?? '')}`)
      },
    )
  }

  async function submitUpdate (): Promise<void> {
    const domain = modalDomain.value
    const item = modalItem.value
    if (!domain || !item) {
      return
    }
    await runSave(
      () => updateEmailAccount(props.service.id, domain.id ?? '', item.email, accountPayload(modalValues.value)),
      'notification.hosting.emailAddress.update.success',
      () => {
        highlightAccount(item.email)
      },
    )
  }

  // The modal closes on success only; the reload, the alert and the closed dialog are `runSave`'s.
  async function submitDelete (): Promise<void> {
    const domain = modalDomain.value
    const item = modalItem.value
    if (!domain || !item) {
      return
    }
    await runSave(
      () => deleteEmailAccount(props.service.id, domain.id ?? '', item.email),
      'notification.hosting.emailAddress.delete.success',
      () => {},
    )
  }

  /** The form must be valid (the text-select sits outside it, as in legacy). */
  async function onModalButton (id: string): Promise<void> {
    if (id === 'cancel') {
      modalClose()
      return
    }
    if (modalSubmitting.value || modalValidating || (id !== 'add' && id !== 'update' && id !== 'delete')) {
      return
    }
    if (id === 'delete') {
      // The button stays disabled until `confirm` is checked (`confirmed`); the check here keeps a stray event from deleting.
      if (confirmed.value) {
        await submitDelete()
      }
      return
    }
    // A second click while the form validates would start a second submit.
    modalValidating = true
    let result: { valid: boolean } | undefined
    try {
      result = await modalInstance.value?.validate()
    } finally {
      modalValidating = false
    }
    if (result?.valid !== true) {
      return
    }
    await (id === 'add' ? submitAdd() : submitUpdate())
  }

  // The `#actions` slot is bound to the row (`v-bind="item"`), so its props are the row's fields.
  function slotRow (row: Record<string, unknown>): EmailAccountRow {
    return row as unknown as EmailAccountRow
  }

  watch(() => props.service, () => {
    void reloadEmailDomains()
  })

  onMounted(() => {
    void reloadEmailDomains()
  })

  onScopeDispose(() => {
    clearTimeout(highlightTimer)
  })
</script>

<style lang="scss" scoped src="@/views/hosting/hosting-screen.scss"></style>
<style lang="scss" scoped>
// The title column: fixed 482 px off the row above 1400 px, auto below. The breakpoint
// matches the former `hosting-title-row.scss`. The column is rendered by `PageTitle` (`title-col-class`), so the rule goes through
// `:deep()` from the title container, which carries this screen's `data-v`. Was an inline `:style` on the `v-col`.
.v-container :deep(.email-addresses-title-col) {
  @media (min-width: 1401px) {
    min-width: calc(100% - 482px);
    max-width: calc(100% - 482px);
  }
}
</style>

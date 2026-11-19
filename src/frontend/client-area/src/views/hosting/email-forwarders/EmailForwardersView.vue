<template>
  <div>
    <PageTitle
      :title="t('heading.hosting.emailForwarders.title')"
      title-testid="email-forwarders-title"
    >
      <template #filters>
        <template v-if="!emailForwarders.loading">
          <DataIteratorFilterControls
            v-if="emailForwarders.items.length > 0"
            class="my-hostings-search"
            data-testid="email-forwarders-search"
            :full-width-lg="false"
            :full-width-md="true"
            :full-width-search="false"
            :search-term="searchTerm"
            :show-search-term="true"
            @update:search-term="handleSearchTermChange"
          />

          <PageAddButton
            v-if="emailForwarders.items.length > 0"
            data-testid="email-forwarders-add"
            :label="t('button.emailForwarder.add')"
            @click="openAddModal"
          />
        </template>
      </template>

      <template #bottom>
        <v-row>
          <v-col class="d-flex align-end domain-col">
            <EmailDomainSelector
              data-testid="email-forwarders-domain"
              :domains="emailDomains.items"
              :loading="emailDomains.loading"
              :model-value="selectedEmailDomain"
              :records="records"
              :show-records="emailDomains.showRecords"
              @open-records="recordsModalOpen = true"
              @update:model-value="reloadEmailForwarders"
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
            data-testid="email-forwarders-table"
            :headers="emailForwarderHeaders"
            :item-class="itemClass"
            :item-slots="['updated_at']"
            :items="emailForwarders.items"
            :items-loading="emailForwarders.loading"
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
                data-testid="email-forwarders-empty"
                :desc="t('message.emptyTable.emailForwarders.description')"
                :title="t('message.emptyTable.emailForwarders.title')"
              >
                <template #image>
                  <HostingEmailForwardersIllustration />
                </template>

                <template #action>
                  <PageAddButton
                    data-testid="email-forwarders-empty-add"
                    :label="t('button.emailForwarder.add')"
                    @click="openAddModal"
                  />
                </template>
              </EmptyState>
            </template>

            <template #actions="row">
              <!-- `aria-label` on the icon always (legacy has none). -->
              <AppButton
                :aria-label="t('button.emailForwarder.delete')"
                data-testid="email-forwarders-delete"
                kind="row-action"
                :tooltip="t('button.emailForwarder.delete')"
                :tooltip-offset="14"
                @click="openDeleteModal(slotRow(row))"
              >
                <v-icon
                  icon="$thrash"
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
                :label="t('table.header.forwardTo')"
                :value="row.forward_to"
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
        data-testid="email-forwarders-modal"
        :icon="modal.icon"
        :submitting="modalSubmitting"
        :title="modal.title"
        @button-click="onModalButton"
        @modal-close="modalClose"
      >
        <basic-modal-field
          v-for="(field, index) in modal.fields"
          :key="index"
          :data-testid="`email-forwarders-modal-field-${modalFieldName(field)}`"
          :field="field"
          :last="index === modal.fields.length - 1"
          :model-value="fieldValue(field)"
          @update:model-value="setFieldValue(field, $event)"
        />
      </basic-modal>
    </AppDialog>
  </div>
</template>

<script lang="ts" setup>
  // The domain selector with the SPF/DKIM chip is the shared `EmailDomainSelector`. The builders of the Add and Delete modals are in
  // `email-forwarder-modals.ts`.
  // Legacy gives both modal cards `width: 560px` inline; here it is the global `.card-width-560` (`_dialog.scss`).
  import type { EmailDomain } from '@/views/hosting/email-domain-records'
  import type { HostingService } from '@/views/hosting/hosting.types'
  import type { EmailForwarderModal } from './email-forwarder-modals'
  import type { EmailForwarderRow } from './email-forwarders'
  import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, onScopeDispose, reactive, ref, useTemplateRef, watch } from 'vue'
  import { modalFieldName } from '@/views/hosting/email-addresses/email-account-modals'
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
  import HostingEmailForwardersIllustration from '@/shared/ui/illustrations/HostingEmailForwardersIllustration.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { buildAddForwarderModal, buildDeleteForwarderModal } from './email-forwarder-modals'
  import { emailForwarderHeaders, emailForwarderRowClass, ITEMS_PER_PAGE_OPTIONS, toEmailForwarderRow } from './email-forwarders'
  import { createEmailForwarder, deleteEmailForwarder, listEmailForwarders } from './email-forwarders.api'

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
  // The `spf_info` / `dkim_info` per domain, and the SPF/DKIM modal of the chip. Legacy does not lock the body
  // scroll for it (its `modalConfigurationOptions.open` watch never fires), so neither does the port.
  const { records, check: checkEmailDomainRecords } = useEmailDomainRecords()
  const recordsModalOpen = ref(false)
  const selectedRecords = computed(() => {
    const selected = selectedEmailDomain.value
    return selected ? records.value[String(selected.id)] : undefined
  })
  const emailForwarders = reactive<{ items: EmailForwarderRow[], loading: boolean }>({
    items: [],
    loading: false,
  })
  const isError = ref(false)
  // The forwarder added last (cleared 1 s after the save).
  const highlight = ref<{ email: string, forward_to: string }>()
  let highlightTimer: ReturnType<typeof setTimeout> | undefined

  // One `BasicModal` for Add and Delete, rebuilt on every open.
  const modal = ref<EmailForwarderModal | null>(null)
  const modalOpen = ref(false)
  const modalPersistent = ref(false)
  const modalSubmitting = ref(false)
  const modalRender = ref(0)
  // The values of the modal fields.
  const modalValues = ref<Record<string, unknown>>({})
  // The domain the open modal works on.
  const modalDomain = ref<EmailDomain | null>(null)
  // The forwarder the open Delete modal works on.
  const modalItem = ref<EmailForwarderRow | null>(null)
  // The required `confirm` checkbox of Delete, which gates the button.
  const confirmed = computed(() => modalValues.value.confirm === true)
  // The modal's exposed `validate()` (`BasicModal.vue` defineExpose).
  const modalInstance = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('modalInstance')
  let modalValidating = false

  // The V2 dialog's mobile scroll hiding is `AppDialog` `scroll-lock="mobile"`.
  useBodyScrollLock(modalOpen)

  // Legacy `isServerProvided: false`: search, sort and paging run on the loaded forwarders, so the load callback is never called.
  // Legacy starts with `sortBy: "updated_at"`, a string the table reads as `undefined`, so the list keeps the backend order (no sort).
  // `sortDesc: false` only sets the direction of the first sort after a header click.
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
    sortDesc: false,
  })

  const itemsTotal = computed(() => emailForwarders.items.length)
  function itemClass (item: Record<string, unknown>): string {
    return emailForwarderRowClass({ email: String(item.email), forward_to: String(item.forward_to) }, highlight.value) ?? ''
  }

  // The domains are copied: the response is shared with the frame through `cachedGet`, and the page must
  // not change it. The forwarders start only after the domains answer, so the empty state shows while the domains load
  // (`emailForwarders.loading` stays false until then).
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
        void reloadEmailForwarders()
      } else {
        emailForwarders.items = []
        emailForwarders.loading = false
      }
    } catch (error) {
      isError.value = true
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      emailDomains.loading = false
    }
  }

  // The selected domain (when one is passed) and its forwarders. Search and paging are kept.
  async function reloadEmailForwarders (domain: EmailDomain | null = null): Promise<void> {
    if (domain !== null) {
      selectedEmailDomain.value = domain
    }
    emailForwarders.loading = true
    isError.value = false
    const selected = selectedEmailDomain.value
    if (selected === null) {
      emailForwarders.loading = false
      return
    }

    try {
      const forwarders = await listEmailForwarders(props.service.id, selected.id ?? '')
      emailForwarders.items = forwarders.map(item => toEmailForwarderRow(item, fromNow))
    } catch (error) {
      isError.value = true
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      emailForwarders.loading = false
    }
  }

  function modalClose (): void {
    modalOpen.value = false
  }

  function clearFormValues (): void {
    modalValues.value = {}
  }

  function openModal (next: EmailForwarderModal): void {
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

  // Add opens with the selected domain. With no domain (the empty state of a service without domains), legacy throws
  // a TypeError on `selectedEmailDomain.domain`; the port stops quietly and opens nothing.
  function openAddModal (): void {
    const domain = selectedEmailDomain.value
    if (!domain) {
      return
    }
    modalDomain.value = domain
    modalItem.value = null
    openModal(buildAddForwarderModal(domain, t))
  }

  /** The highlight of the added forwarder, cleared after 1 s. */
  function highlightForwarder (next: { email: string, forward_to: string }): void {
    highlight.value = next
    clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => {
      highlight.value = undefined
    }, 1000)
  }

  /**
   * `persistent` and `submitting` on for the request, then the success alert with a reload and the
   * closed dialog, or the error alert with the dialog left open.
   */
  async function runSave (request: () => Promise<void>, successKey: string, afterSuccess: () => void): Promise<void> {
    modalPersistent.value = true
    modalSubmitting.value = true
    try {
      await request()
      afterSuccess()
      void reloadEmailForwarders(modalDomain.value)
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
    const values = { ...modalValues.value }
    await runSave(
      () => createEmailForwarder(props.service.id, domain.id ?? '', values),
      'notification.hosting.emailForwarders.add.success',
      () => {
        highlightForwarder({ email: `${String(values.email ?? '')}@${String(values.domain ?? '')}`, forward_to: String(values.destination ?? '') })
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
      () => deleteEmailForwarder(props.service.id, domain.id ?? '', item.email, item.forward_to),
      'notification.hosting.emailForwarders.delete.success',
      () => {},
    )
  }

  /** The form must be valid (the text-select sits outside it, as in legacy). */
  async function onModalButton (id: string): Promise<void> {
    if (id === 'cancel') {
      modalClose()
      return
    }
    if (modalSubmitting.value || modalValidating || (id !== 'add' && id !== 'delete')) {
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
    await submitAdd()
  }

  // Opened from the row's Delete action (desktop and mobile share the `#actions` slot).
  function openDeleteModal (item: EmailForwarderRow): void {
    const domain = selectedEmailDomain.value
    if (!domain) {
      return
    }
    modalDomain.value = domain
    modalItem.value = item
    openModal(buildDeleteForwarderModal(t))
  }

  // The `#actions` slot is bound to the row (`v-bind="item"`), so its props are the row's fields.
  function slotRow (row: Record<string, unknown>): EmailForwarderRow {
    return row as unknown as EmailForwarderRow
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

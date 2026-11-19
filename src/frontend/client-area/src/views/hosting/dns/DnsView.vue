<template>
  <div>
    <PageTitle
      :stacked="width <= 1400"
      :title="t('heading.hosting.dns.title')"
      title-testid="dns-title"
    >
      <template #filters>
        <div class="acc-select-group acc-select-group--zone mr-4">
          <div class="acc-select-label">
            {{ t('heading.hosting.dns.zones.title') }}

            <v-tooltip
              location="bottom"
              open-delay="150"
              transition="custom-tooltip"
            >
              <template #activator="{ props: activatorProps }">
                <v-icon
                  v-bind="activatorProps"
                  icon="$help"
                  size="16"
                />
              </template>

              <div>
                <p class="p-3 mb-0">
                  {{ t('heading.hosting.dns.zones.tooltip') }}
                </p>
              </div>
            </v-tooltip>
          </div>

          <v-select
            v-if="!records.loading && serverAccount && !serverAccount.diagnostic_mode"
            v-model="zone"
            class="dns-zone"
            data-testid="dns-zone-select"
            hide-details
            item-title="name"
            item-value="name"
            :items="zones.items"
            :loading="zones.loading"
            return-object
            variant="outlined"
            @update:model-value="reloadZoneRecords"
          >
            <template #selection="{ item }">
              <v-tooltip
                location="bottom"
                open-delay="150"
                transition="custom-tooltip"
              >
                <template #activator="{ props: activatorProps }">
                  <span
                    class="dns-zone-selection"
                    v-bind="activatorProps"
                  >
                    {{ item.name }}
                  </span>
                </template>

                <span>{{ item.name }}</span>
              </v-tooltip>
            </template>
          </v-select>
        </div>

        <ActiveServerAccountSelector
          v-if="service.dns_server_internal && service.server_accounts.length > 1"
          v-model="serverAccount"
          class="mr-4"
          data-testid="dns-account-selector"
          :items="service.server_accounts"
        />

        <!-- Legacy passed `records.search` here, which is never set, so the input starts empty and stays so after a clear. -->
        <DataIteratorFilterControls
          v-if="!records.loading"
          class="my-hostings-search"
          :full-width-search="false"
          :keys="false"
          :show-search-term="true"
          @update:search-term="handleSearchTermChange"
        />

        <PageAddButton
          v-if="!records.loading && canManageDnsRecords"
          data-testid="dns-add"
          :label="t('button.dns.add')"
          @click="openAddModal"
        />
      </template>
    </PageTitle>

    <v-container class="mt-3 px-0">
      <v-row>
        <v-col cols="12">
          <AppMessage
            v-if="cannotManageAlert"
            class="mb-4 cannot-manage-alert"
            role="alert"
            variant="warning"
          >
            <p>{{ CANNOT_MANAGE_VIA_API }}</p>
          </AppMessage>

          <div>
            <DataTable
              v-if="serverAccount && !serverAccount.diagnostic_mode"
              data-testid="dns-table"
              :headers="headers"
              :item-class="itemClass"
              :item-slots="['name', 'proxied']"
              :items="records.items"
              :items-loading="records.loading"
              :items-per-page="Number(itemsPerPage)"
              :items-total="records.items.length"
              :page="page"
              :possible-items-per-page="possibleItemsPerPage"
              :search-term="searchTerm"
              :sort-by="sortBy"
              :sort-desc="sortDesc"
              @clear-filters="resetSearch"
              @update:items-per-page="changePerPage"
              @update:page="changePage"
              @update:sort-by="changeSortBy"
              @update:sort-desc="changeSortDesc"
            >
              <template #no-data>
                <EmptyState
                  :desc="t('message.emptyTable.dns.description')"
                  :title="t('message.emptyTable.dns.title')"
                >
                  <template #image>
                    <HostingDnsIllustration />
                  </template>
                </EmptyState>
              </template>

              <template #item.name="{ item }">
                <a
                  class="font-weight-bold"
                  :href="`https://www.${item.name}`"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {{ item.name }}
                </a>
              </template>

              <!-- The button is only shown for a proxiable record; `proxied` picks the on or off state. -->
              <template #item.proxied="{ item }">
                <div class="text-center">
                  <v-progress-circular
                    v-if="item.proxiable && item.loading"
                    :color="item.proxied ? 'primary' : 'gray'"
                    indeterminate
                    size="24"
                  />

                  <v-tooltip
                    v-else-if="item.proxiable && item.proxied"
                    location="bottom"
                    :offset="4"
                    open-delay="150"
                    transition="custom-tooltip"
                    :z-index="99"
                  >
                    <template #activator="{ props: activatorProps }">
                      <AppButton
                        v-bind="activatorProps"
                        :aria-label="t('button.click.disable')"
                        class="btn-proxy-status"
                        color="primary"
                        data-testid="dns-proxy-on"
                        kind="icon"
                        size="default"
                        @click="toggleProxyStatus(listRow(item))"
                      >
                        <v-icon
                          icon="$proxyOn"
                          size="35"
                        />
                      </AppButton>
                    </template>

                    <span>{{ t('button.click.disable') }}</span>
                  </v-tooltip>

                  <v-tooltip
                    v-else-if="item.proxiable"
                    location="bottom"
                    :offset="4"
                    open-delay="150"
                    transition="custom-tooltip"
                    :z-index="99"
                  >
                    <template #activator="{ props: activatorProps }">
                      <AppButton
                        v-bind="activatorProps"
                        :aria-label="t('button.click.enable')"
                        class="btn-proxy-status btn-proxy-status--off"
                        color="gray"
                        data-testid="dns-proxy-off"
                        kind="icon"
                        size="default"
                        @click="toggleProxyStatus(listRow(item))"
                      >
                        <v-icon
                          icon="$proxyOff"
                          size="30"
                        />
                      </AppButton>
                    </template>

                    <span>{{ t('button.click.enable') }}</span>
                  </v-tooltip>
                </div>
              </template>

              <!-- The slot is bound to the row (`v-bind="item"`), so its props are the row's fields. Mobile gets this slot too (DataTable). -->
              <template #actions="row">
                <AppButton
                  :aria-label="t('button.dns.edit')"
                  data-testid="dns-row-edit"
                  kind="row-action"
                  :tooltip="t('button.dns.edit')"
                  :tooltip-offset="4"
                  @click="openEditModal(listRow(row))"
                >
                  <v-icon icon="$edit2" />
                </AppButton>

                <AppButton
                  :aria-label="t('button.dns.delete')"
                  data-testid="dns-row-delete"
                  kind="row-action"
                  :tooltip="t('button.dns.delete')"
                  :tooltip-offset="4"
                  @click="openDeleteModal(listRow(row))"
                >
                  <v-icon icon="$thrash" />
                </AppButton>
              </template>

              <template #mobile="{ item }">
                <MobileTableField
                  :label="t('table.header.name')"
                  :value="item.name"
                />

                <MobileTableField
                  :label="t('table.header.ttl')"
                  :value="item.ttl"
                />

                <MobileTableField
                  :label="t('table.header.type')"
                  :value="item.type"
                />

                <MobileTableField
                  :label="t('table.header.record')"
                  :value="item.content"
                />
              </template>
            </DataTable>
          </div>
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
        :alert="modal.alert"
        :buttons="modal.buttons"
        class="card-width-560"
        :color="modal.color"
        :confirm-required="modal.kind === 'delete'"
        :confirmed="confirmed"
        data-testid="dns-modal"
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
          :data-testid="`dns-modal-field-${modalFieldName(field)}`"
          :field="field"
          :last="index === modal.fields.length - 1"
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
  import type { DnsRecordTypeOption, DnsRow } from './dns'
  import type { DnsModal, DnsRecordModalContext } from './dns-modals'
  import type { DnsRecordsResponse, DnsZone } from './dns.api'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import type { ModalField } from '@/shared/ui/modal/basic-modal.types'
  // The load chain
  // zones -> records -> record types: the account ticket covers the zones and the record types, the records ticket the
  // records. An answer of an older reload is dropped, `finally` included. A zone change takes a new records ticket only, so the
  // record types of the account still land (legacy reloads no types on a zone change).
  import { useTranslation } from 'i18next-vue'
  import { computed, onScopeDispose, reactive, ref, toRaw, useTemplateRef, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import ActiveServerAccountSelector from '@/views/hosting/ui/ActiveServerAccountSelector.vue'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import PageAddButton from '@/shared/ui/buttons/PageAddButton.vue'
  import DataIteratorFilterControls from '@/shared/ui/data-iterator/DataIteratorFilterControls.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import AppMessage from '@/shared/ui/message/AppMessage.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import { useBodyScrollLock } from '@/shared/ui/modal/body-scroll-lock'
  import PageTitle from '@/shared/ui/title-row/PageTitle.vue'
  import { CANNOT_MANAGE_VIA_API, dnsHeaders, showCannotManageAlert, toDnsRow, toRecordTypeOptions } from './dns'
  import {
    buildAddRecordModal,
    buildDeleteRecordModal,
    buildEditRecordModal,
    buildProxyWarningModal,
    PROXY_ENABLE_BUTTON_ID,
    RECORD_ADD_BUTTON_ID,
    RECORD_DELETE_BUTTON_ID,
    RECORD_UPDATE_BUTTON_ID,
  } from './dns-modals'
  import { applyTypeChange, recordIdForUpdate, recordPathForDelete } from './dns-record-fields'
  import { createRecord, deleteRecord, listRecords, listRecordTypes, listZones, toggleProxy, updateRecord } from './dns.api'
  import HostingDnsIllustration from './HostingDnsIllustration.vue'

  const props = defineProps<{
    service: HostingService
  }>()

  const { t } = useTranslation()
  const { width } = useDisplay()
  const alerts = useAlertsStore()

  const zones = reactive<{ loading: boolean, items: DnsZone[] }>({ loading: true, items: [] })
  const records = reactive<{ loading: boolean, items: DnsRow[] }>({ loading: true, items: [] })
  const recordTypes = reactive<{ loading: boolean, items: DnsRecordTypeOption[] }>({ loading: false, items: [] })
  const zone = ref<DnsZone | null>(null)
  const allowProxy = ref(false)
  const serverAccount = ref<HostingServerAccount | null>(props.service.server_accounts[0] ?? null)
  const headers = computed<LegacySortHeader[]>(() => dnsHeaders(allowProxy.value))
  const canManageDnsRecords = computed(() => recordTypes.items.length > 0)
  const cannotManageAlert = computed(() => showCannotManageAlert({
    recordsLoading: records.loading,
    recordTypesCount: recordTypes.items.length,
    zone: zone.value,
  }))

  let accountTicket = 0
  let recordsTicket = 0

  function reportError (error: unknown): void {
    alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
  }

  /** A failed request keeps the records skeleton up, as legacy did. */
  async function reloadZones (): Promise<void> {
    const ticket = ++accountTicket
    // A records answer of the previous account is dropped as well.
    recordsTicket++
    zones.loading = true
    try {
      const list = await listZones(props.service.id)
      if (ticket !== accountTicket) {
        return
      }
      zones.items = list
      if (list.length > 0) {
        zone.value = list[0] ?? null
        void loadRecords(++recordsTicket)
        void loadRecordTypes(ticket)
      } else {
        records.items = []
        records.loading = false
      }
    } catch (error) {
      if (ticket !== accountTicket) {
        return
      }
      reportError(error)
    } finally {
      if (ticket === accountTicket) {
        zones.loading = false
      }
    }
  }

  /** The records reload for the ticket of the chain. */
  async function loadRecords (ticket: number): Promise<void> {
    records.loading = true
    if (!zone.value) {
      records.loading = false
      return
    }
    try {
      const response: DnsRecordsResponse = await listRecords(props.service.id, zone.value.id)
      if (ticket !== recordsTicket) {
        return
      }
      records.items = response.data.map(record => toDnsRow(record))
      allowProxy.value = response.meta.allow_proxy
    } catch (error) {
      if (ticket !== recordsTicket) {
        return
      }
      reportError(error)
    } finally {
      if (ticket === recordsTicket) {
        records.loading = false
      }
    }
  }

  /**
   * Runs on a zone change. It reloads the records only, not the types, and takes
   * a new records ticket so that an older answer is dropped. A missing zone ends without a request (`loadRecords` checks it).
   */
  function reloadZoneRecords (nextZone?: DnsZone | null): void {
    if (nextZone) {
      zone.value = nextZone
    }
    void loadRecords(++recordsTicket)
  }

  async function loadRecordTypes (ticket: number): Promise<void> {
    recordTypes.loading = true
    try {
      const types = await listRecordTypes(props.service.id)
      if (ticket !== accountTicket) {
        return
      }
      recordTypes.items = toRecordTypeOptions(types)
    } catch (error) {
      if (ticket !== accountTicket) {
        return
      }
      reportError(error)
    } finally {
      if (ticket === accountTicket) {
        recordTypes.loading = false
      }
    }
  }

  // The screen's one `BasicModal` for the proxy warning, Add and Edit (rebuilt on every open).
  const modal = ref<DnsModal | null>(null)
  const modalOpen = ref(false)
  const modalRender = ref(0)
  const modalPersistent = ref(false)
  const modalSubmitting = ref(false)
  // The values of the modal fields, cleared once the dialog has left.
  const modalValues = ref<Record<string, unknown>>({})
  // The modal's exposed `validate()`.
  const modalInstance = useTemplateRef<{ validate: () => Promise<{ valid: boolean }> }>('modalInstance')
  let modalValidating = false
  // The record the open modal works on: the one the warning confirms, or the row Edit was opened from (the PUT addresses it).
  const modalRecord = ref<DnsRow | null>(null)
  useBodyScrollLock(modalOpen)

  // The record saved last; its row is highlighted for 1 s.
  const highlightItem = ref<{ type: string, name: string } | null>(null)
  let highlightTimer: ReturnType<typeof setTimeout> | undefined
  onScopeDispose(() => clearTimeout(highlightTimer))

  function highlightRecord (next: { type: string, name: string }): void {
    highlightItem.value = next
    clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => {
      highlightItem.value = null
    }, 1000)
  }

  /** A row is highlighted when its name and type match the saved record. */
  function itemClass (item: Record<string, unknown>): string {
    const highlighted = highlightItem.value
    return highlighted && item.name === highlighted.name && item.type === highlighted.type ? 'highlight' : ''
  }

  function modalClose (): void {
    modalOpen.value = false
  }

  // The values go once the dialog has left, so the closing transition still shows them.
  function clearFormValues (): void {
    modalValues.value = {}
  }

  function openModal (next: DnsModal, record: DnsRow | null): void {
    modalRender.value++
    modalValues.value = { ...next.initialValues }
    modal.value = next
    modalRecord.value = record
    modalOpen.value = true
  }

  function recordModalContext (): DnsRecordModalContext {
    return { zoneName: zone.value?.name ?? '', allowProxy: allowProxy.value, recordTypes: recordTypes.items }
  }

  function openAddModal (): void {
    openModal(buildAddRecordModal(t, recordModalContext()), null)
  }

  /** The builder copies the row, so the row of the table keeps its TXT quotes. */
  function openEditModal (record: DnsRow): void {
    openModal(buildEditRecordModal(t, record, recordModalContext()), record)
  }

  // The required `confirm` checkbox of Delete (it gates the button).
  const confirmed = computed(() => modalValues.value.confirm === true)

  /** Opened from the row's Delete action (desktop and mobile share the `#actions` slot). */
  function openDeleteModal (record: DnsRow): void {
    openModal(buildDeleteRecordModal(t), record)
  }

  function modalFieldName (field: ModalField): string {
    return (('name' in field) && field.name) || ''
  }

  function fieldValue (field: ModalField): unknown {
    return modalValues.value[modalFieldName(field)]
  }

  function setFieldValue (field: ModalField, value: unknown): void {
    modalValues.value = { ...modalValues.value, [modalFieldName(field)]: value }
  }

  // Legacy's `last-child` goes to the last field of the array, even when `v-show` hides it.

  /** The hidden flags follow the new type. Edit has a readonly type, so it never fires there. */
  function onFieldChange (field: ModalField, value: unknown): void {
    if (modal.value?.kind === 'add' && modalFieldName(field) === 'type') {
      modal.value = { ...modal.value, fields: applyTypeChange(modal.value.fields, String(value)) }
    }
  }

  /**
   * `persistent` and `submitting` on for the request, then the highlight, the reload, the
   * success alert and the closed dialog, or the error alert with the dialog left open.
   */
  async function runRecordSave (request: () => Promise<void>, successKey: string, highlight: { type: string, name: string }): Promise<void> {
    modalPersistent.value = true
    modalSubmitting.value = true
    try {
      await request()
      highlightRecord(highlight)
      reloadZoneRecords()
      alerts.addAlert({ success: true, successMessage: t(successKey) })
      modalClose()
    } catch (error) {
      reportError(error)
    } finally {
      modalPersistent.value = false
      modalSubmitting.value = false
    }
  }

  /** The body is the whole form; the highlight takes the trimmed name. */
  async function submitAdd (): Promise<void> {
    const currentZone = zone.value
    if (!currentZone) {
      return
    }
    const values = modalValues.value
    await runRecordSave(
      () => createRecord(props.service.id, currentZone.id, values),
      'notification.hosting.dns.add.success',
      { type: String(values.type), name: String(values.name ?? '').trim() },
    )
  }

  /**
   * `persistent` and `submitting` on for the request. Success reloads the
   * records, alerts and closes; failure alerts and leaves the modal open. No highlight, as in legacy.
   */
  async function submitDelete (): Promise<void> {
    const currentZone = zone.value
    const record = modalRecord.value
    if (!currentZone || !record) {
      return
    }
    modalPersistent.value = true
    modalSubmitting.value = true
    try {
      await deleteRecord(props.service.id, currentZone.id, recordPathForDelete(record))
      reloadZoneRecords()
      alerts.addAlert({ success: true, successMessage: t('notification.hosting.dns.delete.success') })
      modalClose()
    } catch (error) {
      reportError(error)
    } finally {
      modalPersistent.value = false
      modalSubmitting.value = false
    }
  }

  /** The PUT addresses the record by its line (else its name) and sends the whole form. */
  async function submitUpdate (): Promise<void> {
    const currentZone = zone.value
    const record = modalRecord.value
    if (!currentZone || !record) {
      return
    }
    const values = modalValues.value
    await runRecordSave(
      () => updateRecord(props.service.id, currentZone.id, recordIdForUpdate(record), values),
      'notification.hosting.dns.update.success',
      { type: record.type, name: String(values.name ?? '') },
    )
  }

  /** A second click while the form validates or saves starts nothing. */
  async function onRecordSubmit (id: string): Promise<void> {
    if (modalSubmitting.value || modalValidating) {
      return
    }
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
    await (id === RECORD_ADD_BUTTON_ID ? submitAdd() : submitUpdate())
  }

  /**
   * The record buttons validate and submit, the proxy confirm closes the warning and sends the PATCH,
   * the cancel button only closes it.
   */
  async function onModalButton (id: string): Promise<void> {
    if (id === RECORD_ADD_BUTTON_ID || id === RECORD_UPDATE_BUTTON_ID) {
      await onRecordSubmit(id)
      return
    }
    if (id === RECORD_DELETE_BUTTON_ID) {
      // The button stays disabled until `confirm` is checked (`confirmed`); the check here keeps a stray event from deleting.
      if (!modalSubmitting.value && confirmed.value) {
        await submitDelete()
      }
      return
    }
    const record = modalRecord.value
    modalClose()
    if (id === PROXY_ENABLE_BUTTON_ID && record) {
      void toggleProxyStatus(record, true)
    }
  }

  /**
   * The row of the list the slot item stands for, so the loading flag and the proxy state land on the row the table renders. The
   * item slots get the row itself; the `#actions` slot gets a copy of its fields, so that one is matched by the record key (the
   * line, else `name?type=TYPE`, as `recordPathForDelete`).
   */
  function listRow (item: Record<string, unknown>): DnsRow {
    const record = item as DnsRow
    return records.items.find(row => toRaw(row) === toRaw(item))
      ?? records.items.find(row => recordPathForDelete(row) === recordPathForDelete(record))
      ?? record
  }

  /** The PATCH addresses the record by its line. */
  function recordLine (record: DnsRow): number | string {
    return record.line ?? record.Line ?? ''
  }

  /**
   * Turning the proxy on asks first, turning it off sends the PATCH at once. The
   * flag is set while the request runs, and the answer sets the proxy state; success has no alert, a failure shows one.
   */
  async function toggleProxyStatus (record: DnsRow, confirmed = false): Promise<void> {
    if (!record.proxied && !confirmed) {
      openModal(buildProxyWarningModal(t), record)
      return
    }
    if (!zone.value) {
      return
    }
    record.loading = true
    try {
      record.proxied = await toggleProxy(props.service.id, zone.value.id, recordLine(record))
    } catch (error) {
      reportError(error)
    } finally {
      record.loading = false
    }
  }

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
    // Nothing is reloaded on a page, size, sort or search change.
    load: () => undefined,
    serverProvided: false,
    itemsPerPage: 8,
    possibleItemsPerPage: [[8, 16, 24]],
    sortBy: false,
    sortDesc: false,
  })

  // Clearing the filters only empties the search term; the filter input keeps its text.
  function resetSearch (): void {
    searchTerm.value = ''
  }

  // The first account is the default; a new service resets to its first account, and an account change reloads.
  watch(() => props.service, service => {
    serverAccount.value = service.server_accounts[0] ?? null
  })
  watch(serverAccount, (value, oldValue) => {
    if (value === oldValue) {
      return
    }
    zones.items = []
    records.loading = true
    void reloadZones()
  })

  void reloadZones()
</script>

<style lang="scss" scoped src="@/views/hosting/hosting-screen.scss"></style>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// The zone select is 280px wide and its selection ellipsises.
.acc-select-group--zone {
  max-width: 280px;
  min-width: 280px;
}

.dns-zone-selection {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// The record name is a bold link, and the proxy toggle keeps its 36px height.
a {
  color: map.get(v.$text, headings);
  transition: color 0.24s ease;

  &:hover {
    color: map.get(v.$primary, base);
  }
}

// `.btn-proxy-status`, `--off` grey background of the state layer.
// No `!important`: the scoped rule (0,2,0) beats V4's layered `.v-btn` size rules, and the default icon button is 36px anyway.
.btn-proxy-status {
  width: 40px;
  min-width: 0;
  height: 36px;
  font-size: 14px;

  &--off {
    // The V2 `::before` state layer is `.v-btn__overlay` in V4.
    .v-btn__overlay {
      background-color: var(--v-gray-darken1);
    }
  }
}
</style>

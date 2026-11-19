<template>
  <div>
    <data-table
      :actions-sort="false"
      :all-selected="allDevicesSelected"
      announce-sort
      card-testid="account-device-mobile-item"
      :checked-items="checkedItems"
      data-testid="account-devices-table"
      footer-pages="page"
      :headers="headers"
      :item-selectable="isRowSelectable"
      :item-slots="['ip_address', 'browser', 'device', 'last_login']"
      :items="(items as unknown as Record<string, unknown>[])"
      :items-loading="itemsLoading"
      :items-per-page="itemsPerPage"
      no-results-testid="account-devices-no-results"
      :page="page"
      :per-page-label="t('table.footer.device')"
      :possible-items-per-page="possibleItemsPerPage"
      :search-term="search"
      :select-value="deviceSelectValue"
      selectable
      :sort-by="sortBy"
      :sort-desc="sortDesc"
      :table-paging-events="false"
      @clear-filters="emit('clear-filters')"
      @update:check-all="handleSelectAll"
      @update:checked-items="handleItemCheck(asDevice($event))"
      @update:items-per-page="changePerPage"
      @update:page="changePage"
      @update:sort-by="changeSortBy"
      @update:sort-desc="changeSortDesc"
    >
      <template #no-data>
        <EmptyState
          v-if="items.length === 0"
          data-testid="account-devices-empty"
          :desc="t('message.emptyTable.activeDevices.description')"
          :title="t('message.emptyTable.activeDevices.title')"
        >
          <template #image>
            <hosting-domains-no-text-illustration />
          </template>
        </EmptyState>
      </template>

      <template #[`item.ip_address`]="{ item }">
        <b class="heading--text">
          {{ asDevice(item).ip_address }}
        </b>
      </template>

      <template #[`item.browser`]="{ item }">
        <div class="d-flex align-center">
          <v-icon
            class="mr-2"
            :icon="`$${browserIcon(asDevice(item).browser ?? '')}`"
            size="24"
          />

          {{ browserName(asDevice(item)) }}
        </div>
      </template>

      <template #[`item.device`]="{ item }">
        <div class="d-flex align-center">
          <v-icon
            class="mr-2"
            :icon="`$${deviceIcon(asDevice(item).device ?? '')}`"
            size="24"
          />

          {{ deviceName(asDevice(item)) }}

          <StatusLabel
            v-if="asDevice(item).current_device"
            class="ml-2"
            status="primary"
            :value="t('message.status.device.current')"
          />
        </div>
      </template>

      <template #[`item.last_login`]="{ item }">
        <template v-if="!asDevice(item).session_id">
          {{ asDevice(item).last_login }}
        </template>

        <div
          v-else
          class="current-device"
        >
          {{ t('message.status.device.online') }}
        </div>
      </template>

      <template #actions="{ row }">
        <AppButton
          v-if="asDevice(row).device_id && !asDevice(row).current_device"
          :aria-label="t('button.device.forget', { count: 1 })"
          data-testid="account-device-forget"
          kind="row-action"
          :tooltip="t('button.device.forget', { count: 1 })"
          @click="showForgetDeviceModal(asDevice(row))"
        >
          <v-icon
            icon="$thrash"
            size="24"
          />
        </AppButton>

        <AppButton
          v-if="asDevice(row).session_id"
          :aria-label="t('button.device.logout')"
          data-testid="account-device-logout"
          kind="row-action"
          :tooltip="t('button.device.logout')"
          @click="showLogoutDeviceModal(asDevice(row))"
        >
          <v-icon
            icon="$logout"
            size="24"
          />
        </AppButton>
      </template>

      <template #mobile="{ item }">
        <MobileTableField
          :label="t('table.header.ip')"
          sortable
          :value="asDevice(item).ip_address"
          @sort="changeSortBy(headers[1]!)"
        />

        <MobileTableField
          :label="t('table.header.browser')"
          sortable
          @sort="changeSortBy(headers[2]!)"
        >
          <span class="p-3">
            <div class="d-flex align-center">
              <v-icon
                class="mr-2"
                :icon="`$${browserIcon(asDevice(item).browser ?? '')}`"
                size="24"
              />

              {{ browserName(asDevice(item)) }}
            </div>
          </span>
        </MobileTableField>

        <MobileTableField
          :label="t('table.header.device')"
          sortable
          @sort="changeSortBy(headers[3]!)"
        >
          <span class="p-3">
            <v-icon
              class="mr-2"
              :icon="`$${deviceIcon(asDevice(item).device ?? '')}`"
              size="24"
            />

            {{ deviceName(asDevice(item)) }}

            <StatusLabel
              v-if="asDevice(item).current_device"
              class="ml-2"
              status="primary"
              :value="t('message.status.device.current')"
            />
          </span>
        </MobileTableField>

        <MobileTableField
          :label="t('table.header.lastLogin')"
          sortable
          @sort="changeSortBy(headers[4]!)"
        >
          {{ asDevice(item).last_login }}
        </MobileTableField>
      </template>

    </data-table>

    <AppDialog
      v-model="modalOpen"
      overlay
      :persistent="modalPersistent"
      scroll-lock="mobile"
      transition="custom-dialog-transition"
    >

      <basic-modal
        v-if="modal"
        :key="modalRender"
        :buttons="modal.buttons"
        class="card-width-560"
        :color="modal.color"
        confirm-required
        :confirmed="confirmed"
        data-testid="account-device-modal"
        :icon="modal.icon"
        :message="modal.message"
        :submitting="modalSubmitting"
        :title="modal.title"
        @button-click="onModalButton"
        @modal-close="modalClose"
      >
        <basic-modal-field
          v-model="confirmed"
          :field="modal.confirmField"
          last
        />
      </basic-modal>
    </AppDialog>

    <devices-snackbar
      :checked-items="checkedItems"
      :items="items"
      @mass-action-forget="showMassForgetDeviceModal(items.filter(item => isDeviceSelectable(item) && checkedItems.includes(item.device_id ?? undefined)))"
      @update:check-all="handleSelectAll"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { Device } from './account.api'
  import type { DeviceModal } from './device-actions'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { useTranslation } from 'i18next-vue'
  import { computed, onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { useAlertsStore } from '@/shared/alerts/alerts.store'
  import { getErrorMessage } from '@/shared/api/error-message'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import { useDataIteratorPageState } from '@/shared/ui/data-iterator/use-data-iterator-page-state'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import EmptyState from '@/shared/ui/empty-state/EmptyState.vue'
  import HostingDomainsNoTextIllustration from '@/shared/ui/illustrations/HostingDomainsNoTextIllustration.vue'
  import AppDialog from '@/shared/ui/modal/AppDialog.vue'
  import BasicModal from '@/shared/ui/modal/BasicModal.vue'
  import BasicModalField from '@/shared/ui/modal/BasicModalField.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'
  import { fetchDevices, forgetDevice, logoutDevice } from './account.api'
  import {
    deviceActionOutcome,
    forgetDeviceOptions,
    LOGOUT_SUCCESS_MESSAGE,
    logoutDeviceOptions,
    massForgetOptions,
    massForgetOutcome,
  } from './device-actions'
  import { browserIcon, deviceIcon } from './device-icons'
  import DevicesSnackbar from './DevicesSnackbar.vue'
  import { deviceId, isDeviceSelectable, useDeviceSelection } from './use-device-selection'

  defineProps<{
    search?: string
  }>()

  const emit = defineEmits<{
    'clear-filters': []
  }>()

  const { t } = useTranslation()
  const router = useRouter()
  const alerts = useAlertsStore()

  const items = ref<Device[]>([])
  const itemsLoading = ref(false)

  // Sort, page and per-page changes refetch the list although the table pages it itself.
  const {
    page,
    itemsPerPage,
    possibleItemsPerPage,
    sortBy,
    sortDesc,
    changePage,
    changePerPage,
    changeSortBy,
    changeSortDesc,
  } = useDataIteratorPageState({ load: reloadData, itemsPerPage: 10, possibleItemsPerPage: [[10, 20, 30]], sortDesc: true })

  const { checkedItems, handleItemCheck, handleSelectAll, clear: clearSelection } = useDeviceSelection(items)

  // The options are rebuilt on every open.
  const modal = ref<DeviceModal | null>(null)
  const modalOpen = ref(false)
  const modalPersistent = ref(false)
  const modalSubmitting = ref(false)
  const modalRender = ref(0)
  // The required `confirm` checkbox of the modal.
  const confirmed = ref(false)

  function openModal (next: DeviceModal): void {
    modalRender.value++
    confirmed.value = false
    modal.value = next
    modalOpen.value = true
  }

  function showForgetDeviceModal (device: Device): void {
    openModal(forgetDeviceOptions(t, device))
  }

  function showMassForgetDeviceModal (devices: Device[]): void {
    openModal(massForgetOptions(t, devices))
  }

  function showLogoutDeviceModal (device: Device): void {
    openModal(logoutDeviceOptions(t, device))
  }

  function modalClose (): void {
    modalOpen.value = false
  }

  /** Close, and unlock the dialog. */
  function finishSubmit (): void {
    modalClose()
    modalPersistent.value = false
    modalSubmitting.value = false
  }

  async function runAction (action: () => Promise<void>): Promise<void> {
    modalPersistent.value = true
    modalSubmitting.value = true
    try {
      await action()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      finishSubmit()
    }
  }

  function endSession (): void {
    void router.push({ path: '/login' })
  }

  async function forgetOne (device: Device): Promise<void> {
    await runAction(async () => {
      const status = await forgetDevice(device.device_id)
      if (deviceActionOutcome(status) === 'reload') {
        alerts.addAlert({ success: true, successMessage: t('notification.account.device.forget.success', { count: 1 }) })
        void reloadData()
      } else {
        endSession()
      }
    })
  }

  async function forgetMany (devices: Device[]): Promise<void> {
    await runAction(async () => {
      const statuses = await Promise.all(devices.map(device => forgetDevice(device.device_id)))
      if (massForgetOutcome(statuses) === 'login') {
        endSession()
        return
      }
      alerts.addAlert({ success: true, successMessage: t('notification.account.device.forget.success', { count: devices.length }) })
      // Deviation: legacy never cleared the selection after a mass forget.
      clearSelection()
      void reloadData()
    })
  }

  async function logoutOne (device: Device): Promise<void> {
    await runAction(async () => {
      const status = await logoutDevice(device.session_id)
      if (deviceActionOutcome(status) === 'reload') {
        alerts.addAlert({ success: true, successMessage: LOGOUT_SUCCESS_MESSAGE })
        void reloadData()
      } else {
        endSession()
      }
    })
  }

  function onModalButton (id: string): void {
    const current = modal.value
    if (!current) {
      return
    }
    if (id === 'cancel') {
      modalClose()
    } else if (current.kind === 'forget') {
      void forgetOne(current.devices[0]!)
    } else if (current.kind === 'mass-forget') {
      void forgetMany(current.devices)
    } else {
      void logoutOne(current.devices[0]!)
    }
  }

  const headers: LegacySortHeader[] = [
    { text: '', value: 'select', sortable: false },
    { text: 'ip', value: 'ip_address', sortable: true },
    { text: 'browser', value: 'browser', sortable: true },
    { text: 'device', value: 'device', sortable: true },
    { text: 'lastLogin', value: 'last_login', sortable: true },
    { text: 'actions', value: 'actions' },
  ]

  function asDevice (item: unknown): Device {
    return item as Device
  }

  // Rows whose User-Agent the panel could not parse say so instead of showing nothing.
  function browserName (device: Device): string {
    return device.browser ?? t('message.account.device.unknownBrowser')
  }

  function deviceName (device: Device): string {
    return device.device ?? t('message.account.device.unknownDevice')
  }

  // Selection value of a row for the pattern's checkboxes: `device_id`, else `name` (`deviceId`).
  function deviceSelectValue (item: Record<string, unknown>): string | undefined {
    return deviceId(asDevice(item))
  }

  const allDevicesSelected = computed(() => {
    const selectable = items.value.filter(isDeviceSelectable)
    return selectable.length > 0 && selectable.every(device => checkedItems.value.includes(deviceId(device)))
  })

  function isRowSelectable (item: Record<string, unknown>): boolean {
    return isDeviceSelectable(asDevice(item))
  }

  async function reloadData (): Promise<void> {
    itemsLoading.value = true
    try {
      items.value = await fetchDevices()
    } catch (error) {
      alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
    } finally {
      itemsLoading.value = false
    }
  }

  onMounted(() => {
    void reloadData()
  })

  defineExpose({ reloadData, items, checkedItems })
</script>

<!-- Not scoped, as in legacy: `.current-device` sits in the table cell. -->
<style lang="scss">
.current-device {
  position: relative;
  padding: 16px;
  &::before {
    content: "";
    position: absolute;
    left: 0;
    border-radius: 100%;
    width: 8px;
    height: 8px;
    background-color: var(--v-primary-base);
    top: calc(50% - 4px);
  }
}
</style>

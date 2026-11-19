<template>
  <MobileTableCard card-testid="account-device-mobile-item">
    <template #select>
      <checkbox
        :model-value="checked"
        @update:model-value="emit('update:checked')"
      />
    </template>

    <div class="mobile-table-item__group">
      <MobileTableField
        :label="t('table.header.ip')"
        :value="item.ip_address"
        @sort="emit('update:sort-by', headers[1]!)"
      />

      <MobileTableField
        :label="t('table.header.browser')"
        @sort="emit('update:sort-by', headers[2]!)"
      >
        <span class="p-3">
          <div class="d-flex align-center">
            <v-icon
              class="mr-2"
              :icon="`$${itemBrowser}`"
              size="24"
            />

            {{ item.browser ?? t('message.account.device.unknownBrowser') }}
          </div>
        </span>
      </MobileTableField>
    </div>

    <div class="mobile-table-item__group">
      <MobileTableField
        :label="t('table.header.device')"
        @sort="emit('update:sort-by', headers[3]!)"
      >
        <span class="p-3">
          <v-icon
            class="mr-2"
            :icon="`$${itemDevice}`"
            size="24"
          />

          {{ item.device ?? t('message.account.device.unknownDevice') }}

          <StatusLabel
            v-if="item.current_device"
            class="ml-2"
            status="primary"
            :value="t('message.status.device.current')"
          />
        </span>
      </MobileTableField>

      <MobileTableField
        :label="t('table.header.lastLogin')"
        @sort="emit('update:sort-by', headers[4]!)"
      >
        {{ item.last_login }}
      </MobileTableField>
    </div>

    <div class="mobile-table-item__group">
      <div class="mobile-table-item__actions">
        <AppButton
          v-if="item.device_id"
          :aria-label="t('button.device.forget', { count: 1 })"
          data-testid="account-device-forget"
          kind="row-action"
          :tooltip="t('button.device.forget', { count: 1 })"
          @click="emit('forget-device')"
        >
          <v-icon
            icon="$thrash"
            size="24"
          />
        </AppButton>

        <AppButton
          v-if="item.session_id"
          :aria-label="t('button.device.logout')"
          data-testid="account-device-logout"
          kind="row-action"
          :tooltip="t('button.device.logout')"
          @click="emit('logout-device')"
        >
          <v-icon
            icon="$logout"
            size="24"
          />
        </AppButton>
      </div>
    </div>
  </MobileTableCard>
</template>

<script lang="ts" setup>
  import type { Device } from './account.api'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import MobileTableCard from '@/shared/ui/data-table/MobileTableCard.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'
  import StatusLabel from '@/shared/ui/status-label/StatusLabel.vue'

  withDefaults(defineProps<{
    headers?: LegacySortHeader[]
    checked?: boolean
    item: Device
    itemDevice: string
    itemBrowser: string
  }>(), {
    headers: () => [],
    checked: false,
  })

  const emit = defineEmits<{
    'update:checked': []
    'update:sort-by': [header: LegacySortHeader]
    'forget-device': []
    'logout-device': []
  }>()

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
// `!important` as in legacy: the V4 table cell and row
// width would otherwise win.
:deep(td),
tr {
  width: 100% !important;
  min-width: 100% !important;
  max-width: 100% !important;
}

// V2 `.v-data-table__mobile-table-row` is `display: block`, so the cell shrinks to its content; a V4 row stays a table row.
tr {
  display: block;
}

.checkbox {
  :deep(.v-selection-control) {
    min-height: unset !important;
  }

  // The V2 checkbox keeps its (empty) label slot, which makes the control ~6px wider than the 22px box plus its 8px margin.
  :deep(.v-input) {
    min-width: 38px;
  }
}

// V2 icon buttons are 14px; V4 `size="small"` sets 12px.
.mobile-table-item__actions .v-btn {
  font-size: 14px;
}

// Legacy margin between neighbouring buttons: the V2 tooltip wrappers kept them apart, V4 renders none.
.mobile-table-item .mobile-table-item__actions .v-btn + .v-btn {
  margin-left: 0;
}
</style>

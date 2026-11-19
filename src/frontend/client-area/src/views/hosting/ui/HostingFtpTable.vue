<template>
  <DataTable
    footer-pages="page"
    :headers="headers"
    :item-class="itemClass ? rowClass : undefined"
    :item-slots="['user', 'updated_at', 'usage_quota']"
    :items="items"
    :items-loading="itemsLoading"
    :items-per-page="itemsPerPage"
    :page="page"
    :possible-items-per-page="possibleItemsPerPage"
    :search-term="searchTerm"
    :sort-by="sortBy"
    :sort-desc="sortDesc"
    @clear-filters="emit('clear-filters')"
    @update:items-per-page="emit('update:items-per-page', $event)"
    @update:page="emit('update:page', $event)"
    @update:sort-by="emit('update:sort-by', $event)"
    @update:sort-desc="emit('update:sort-desc', $event)"
  >
    <template #no-data>
      <slot name="no-data" />
    </template>

    <template #item.user="{ item }">
      <b>{{ asRow(item).user }}</b>
    </template>

    <template #item.updated_at="{ item }">
      <div class="d-flex">
        <slot
          name="updated_at"
          v-bind="asRow(item)"
        />
      </div>
    </template>

    <template #item.usage_quota="{ item }">
      <div
        v-if="usageSupported"
        class="d-flex align-center"
      >
        <progress-chart
          v-bind="usageChart(asRow(item))"
          class="usage-progress"
        />

        <span class="usage-quota">
          <b class="font-weight-600">{{ t('form.value.sizeMB', { value: asRow(item).diskused }) }}</b>
          /
          <span>
            <span v-if="asRow(item).diskquota !== 'unlimited'">{{ t('form.value.sizeMB', { value: asRow(item).diskquota }) }}</span>
            <span v-else>{{ asRow(item).diskquota }}</span>
          </span>
        </span>
      </div>

      <div
        v-else
        class="ps-7"
      >
        <v-menu
          :close-on-content-click="false"
          content-class="hosting-ftp-usage-menu"
          location="top start"
          max-width="350"
          min-width="350"
          :offset="[-24, 175]"
          open-delay="150"
          open-on-hover
          origin="top start"
          transition="custom-tooltip"
          :z-index="99"
        >
          <template #activator="{ props: activatorProps }">
            <AppButton
              v-bind="activatorProps"
              :aria-label="t('heading.hosting.usage.title')"
              class="ml-1 d-flex align-center"
              kind="icon"
            >
              <v-icon
                color="black"
                icon="$alertcircle"
                size="20"
              />
            </AppButton>
          </template>

          <div class="px-4 py-4">
            {{ t('tooltip.hosting.ftp.usageNotSupported') }}
          </div>
        </v-menu>
      </div>
    </template>

    <template #actions="row">
      <AppButton
        :aria-label="actionLabel('show')"
        kind="row-action"
        :loading="asRow(row).infoButtonLoading"
        :tooltip="actionLabel('show')"
        @click="emit('action-button-info', listRow(asRow(row)))"
      >
        <v-icon
          icon="$eye"
          size="24"
        />
      </AppButton>

      <AppButton
        v-if="asRow(row).actions?.includes('edit_password')"
        :aria-label="actionLabel('edit')"
        kind="row-action"
        :tooltip="actionLabel('edit')"
        @click="emit('action-button-edit', listRow(asRow(row)))"
      >
        <v-icon
          icon="$edit2"
          size="24"
        />
      </AppButton>

      <AppButton
        :aria-label="actionLabel('delete')"
        kind="row-action"
        :tooltip="actionLabel('delete')"
        @click="emit('action-button-delete', listRow(asRow(row)))"
      >
        <v-icon
          icon="$thrash"
          size="24"
        />
      </AppButton>
    </template>

    <!-- Legacy mobile item: three labelled fields, then the actions. The usage row always draws the chart, even where usage is not supported. -->
    <template #mobile="{ item }">
      <MobileTableField
        :label="t('table.header.user')"
        :value="asRow(item).user"
        @sort="sortByHeader(0)"
      />

      <MobileTableField
        :label="t('table.header.directory')"
        :value="asRow(item).directory"
        @sort="sortByHeader(1)"
      />

      <MobileTableField
        :label="t('table.header.usageQuota')"
        @sort="sortByHeader(2)"
      >
        <!-- A row without `usage_quota` (SFTP) shows the literal dash, no chart. -->
        <span
          v-if="!asRow(item).usage_quota"
          class="p-3"
        >"---"</span>

        <div
          v-else
          class="d-flex align-center"
        >
          <progress-chart
            v-bind="usageChart(asRow(item))"
            class="usage-progress"
          />

          <span class="ml-2"> {{ asRow(item).usage_quota }} </span>
        </div>
      </MobileTableField>
    </template>
  </DataTable>
</template>

<script lang="ts" setup>
  import type { LegacySortBy, LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import ProgressChart from '@/shared/ui/charts/ProgressChart.vue'
  import DataTable from '@/shared/ui/data-table/DataTable.vue'
  import MobileTableField from '@/shared/ui/data-table/MobileTableField.vue'

  /** A row as the FTP list builds it (`FtpRow`); SFTP rows add `actions` and have no directory or usage fields. */
  interface HostingFtpTableRow {
    user: string
    directory?: string
    diskused?: number | string
    diskquota?: number | string
    updated_at: string | null
    usage_quota?: string
    updated_at_text: string
    infoButtonLoading?: boolean
    actions?: string[]
  }

  const props = withDefaults(defineProps<{
    type?: string
    headers?: LegacySortHeader[]
    items?: HostingFtpTableRow[]
    itemsLoading?: boolean
    itemsPerPage?: number | string
    page?: number
    possibleItemsPerPage?: Array<Array<number | string>>
    searchTerm?: string
    sortBy?: LegacySortBy
    sortDesc?: boolean
    itemClass?: (item: HostingFtpTableRow) => string | undefined
    usageSupported?: boolean
  }>(), {
    type: 'ftp',
    headers: () => [],
    items: () => [],
    itemsLoading: false,
    itemsPerPage: 8,
    page: 1,
    possibleItemsPerPage: () => [[8, 16, 24]],
    searchTerm: '',
    sortBy: false,
    sortDesc: false,
    itemClass: undefined,
    usageSupported: false,
  })

  const emit = defineEmits<{
    'action-button-info': [item: HostingFtpTableRow]
    'action-button-edit': [item: HostingFtpTableRow]
    'action-button-delete': [item: HostingFtpTableRow]
    'clear-filters': []
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
  }>()

  const { t } = useTranslation()

  // The row actions name the kind of account the page lists: the SFTP page has the `button.sftp.*` keys (`button.ftp.*` on the FTP page).
  function actionLabel (action: 'show' | 'edit' | 'delete'): string {
    return t(`button.${props.type === 'sftp' ? 'sftp' : 'ftp'}.${action}`)
  }

  // V2 `item-class` returned a class string for the row; the table takes it as a function of the row.
  function rowClass (item: Record<string, unknown>): string | undefined {
    return props.itemClass?.(asRow(item))
  }

  // The `#actions` slot gets a copy of the row's fields, so what a handler sets on the row (the Info spinner, `infoButtonLoading`)
  // goes to the row of `items`, which the table renders.
  function listRow (row: HostingFtpTableRow): HostingFtpTableRow {
    return props.items.find(item => item.user === row.user) ?? row
  }

  function asRow (item: unknown): HostingFtpTableRow {
    return item as HostingFtpTableRow
  }

  // Legacy mobile labels emit `update:sortBy` with the table's own header object at that index.
  function sortByHeader (index: number): void {
    const header = props.headers[index]
    if (header) {
      emit('update:sort-by', header)
    }
  }

  // The quota is the maximum; an unlimited quota draws the bar full.
  function usageChart (row: HostingFtpTableRow): { value: number, maxValue: number } {
    const used = Number.parseInt(String(row.diskused))
    return {
      value: used,
      maxValue: row.diskquota === 'unlimited' ? used : Number.parseInt(String(row.diskquota)),
    }
  }
</script>

<style lang="scss" scoped>
// The look of the table is the one of `DataTable`; only the content of the cells stays here.

// The usage bar is 150px wide, set inline in legacy. The kit
// `ProgressChart` root has its own scoped `min-width: 100px` (0,2,0); the doubled class selector (0,4,0) wins whatever the chunk order.
.usage-progress.usage-progress {
  min-width: 150px;
  max-width: 150px;
}

// The global `.data-table .v-progress-linear { display: none }` hides the bars of a table; the usage bar is drawn.
.usage-progress.v-progress-linear {
  display: block;
}

.usage-quota {
  white-space: nowrap;
  margin-left: 8px;
}

// V2 `x-small icon text` button of the "not supported" cell: a 54% black icon button in light (the dark one already matches).
// Source: V2 `.theme--light.v-btn.v-btn--icon` colour, token `--v-icon-btn-color`.
.v-theme--light .ps-7 .v-btn {
  color: var(--v-icon-btn-color);
}

[dir=rtl] .usage-quota {
  margin-left: 0;
  margin-right: 8px;
}
</style>

<style lang="scss">
// The hover menu is teleported out of the table, so its rules are global and reach it through `content-class`. V2 painted the menu
// text in the base text colour and sized it 350px wide (`min-width` / `max-width`). `color` competes with the theme class that V4 puts on
// the overlay (`.v-theme--light.v-menu > .v-overlay__content`, 0,3,0), so the class is doubled (0,4,0) instead of `!important`. The widths stay `!important` on purpose: V4's location
// strategy writes `min-width` (min of the prop and the activator width) and `max-width` (clipped to the free space) inline on that element.
.v-menu > .v-overlay__content.hosting-ftp-usage-menu.hosting-ftp-usage-menu {
  color: var(--v-text-base);
  min-width: 350px !important;
  max-width: 350px !important;
}
</style>

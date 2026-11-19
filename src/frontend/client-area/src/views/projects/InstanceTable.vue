<template>
  <v-container class="px-0 pb-0 pt-1">
    <v-row>
      <v-col cols="12">
        <v-card
          class="table w-100"
          data-testid="instance-table"
        >
          <!-- Server paging: V4 `v-data-table-server` shows `items` as they are (the V2 table got `server-items-length`). -->
          <v-data-table-server
            class="elevation-4 custom-data-table custom-instance-table"
            :headers="v4Headers"
            hide-default-footer
            hide-default-header
            :items="itemsLoading ? [] : listSorted"
            :items-length="itemsTotal ?? 0"
            :items-per-page="itemsPerPage"
            :loading="itemsLoading"
            :page="page"
          >
            <!-- Legacy V2 `header` slot put the row straight into <table>, no <thead> (see the kit `DataTable`). -->
            <template #thead>
              <instance-table-custom-sort
                :all-selected="allSelected"
                :headers="keys"
                :sort-by="sortBy"
                :sort-desc="sortDesc"
                @select-all="handleSelectAll"
                @update:sort-by="emit('update:sort-by', $event)"
                @update:sort-desc="emit('update:sort-desc', $event)"
              />
            </template>

            <!-- Legacy `no-data` slot (the `no-results` slot never fires: the list is paged by the server). -->
            <template #no-data>
              <data-iterator-no-results-container
                v-if="searchTerm || filterLabels"
                :filter-labels="filterLabels"
                :search-term="searchTerm"
                @clear-all-filters="emit('clear-all-filters')"
              />
            </template>

            <template #loading>
              <instance-table-item-skeleton
                v-for="(_, index) in 10"
                :key="index"
              />
            </template>

            <template #item="{ item }">
              <div
                class="d-flex table-row flex-xl-row flex-column position-relative"
                :class="isSuspended(item) ? 'table-row--suspended' : ''"
                data-testid="instance-table-row"
              >
                <div
                  v-if="isSuspended(item)"
                  class="instance-actions instance-actions--suspended"
                  :class="unsuspendUrl() ? 'cursor-pointer' : ''"
                  @click="unsuspendUrl() ? unsuspend() : undefined"
                >
                  <div class="d-flex align-center justify-center">
                    <v-icon
                      class="mr-2"
                      color="sand-darken-1"
                      icon="$suspended"
                      size="32"
                    />

                    <p class="font-weight-600 p-2 text-sand-darken-1 text-center mb-0">
                      {{ t('message.serviceSuspended') }}
                    </p>
                  </div>
                </div>

                <select-item
                  :id="item.id"
                  :aria-label="t('button.selectProject', { name: item.title })"
                  :checked="checkedItems.includes(item.id)"
                  main
                  @select-item="emit('update:checked-items', item)"
                />

                <name-item
                  :item="item"
                  main
                  @cancel-installation="emit('cancel-install', $event)"
                  @restart-installation="emit('retry-install', $event)"
                  @show-import-details="emit('import-details', $event)"
                />

                <status-item
                  :item="item.subInstances[0]!"
                  main
                />

                <visitors-item
                  :item="item"
                  main
                />

                <bandwidth-item
                  :item="item"
                  main
                />

                <storage-item
                  :item="item"
                  main
                />

                <tags-item
                  :key="item.subInstances[0]!.id"
                  dots
                  :instance-item="true"
                  :item="item.subInstances[0]!"
                  main
                  @toggle-filter="emit('toggle-filter', $event)"
                />

                <shared-item
                  is-icon
                  :item="item"
                  main
                  @share="emit('share', $event)"
                />

                <collaborate-item
                  v-if="isCollaborateEnabled && item.hasCollaborationPrivilege()"
                  main
                  @click="collaboration.open(item.id)"
                />

                <div class="table-item p-4 d-flex align-center">
                  {{ item.created_at_from_now }}
                </div>

                <div class="table-item ml-auto">
                  <div class="item">
                    <instance-item-menu
                      :checking-updates="checkingUpdatesId === item.id"
                      :checking-wp-login="checkingWpLoginId === item.id"
                      :instance="item"
                      main
                      :subinstance="item.subInstances[0]!"
                      @cancel-install="emit('cancel-install', $event)"
                      @clear-cache="emit('clear-cache', $event)"
                      @copy="emit('copy', $event)"
                      @delete="emit('delete', $event)"
                      @log-in="emit('log-in', $event)"
                      @push-to-live="emit('push-to-live', $event)"
                      @retry-install="emit('retry-install', $event)"
                      @share="emit('share', $event)"
                      @show-deploy-logs="emit('show-deploy-logs', $event)"
                      @staging="emit('staging', $event)"
                      @update="emit('update', $event)"
                      @wp-admin="emit('wp-admin', $event)"
                    />
                  </div>
                </div>
              </div>

              <div
                v-if="item.subInstances.length > 1"
                class="d-flex flex-column"
              >
                <div
                  v-for="(subinstance, subinstanceIndex) in item.subInstances.slice(1)"
                  :key="subinstanceIndex"
                  class="d-flex table-subrow flex-column flex-xl-row"
                  data-testid="instance-table-subrow"
                >
                  <select-item :id="item.id" />

                  <name-item
                    :index="subinstanceIndex"
                    :item="{ ...item, subinstance }"
                  />

                  <status-item :item="subinstance" />

                  <visitors-item :item="item" />

                  <bandwidth-item :item="item" />

                  <storage-item :item="item" />

                  <tags-item
                    :key="subinstance.id"
                    dots
                    :item="subinstance"
                  />

                  <shared-item
                    is-icon
                    :item="subinstance"
                    main
                    @share="emit('share', $event)"
                  />

                  <collaborate-item
                    v-if="isCollaborateEnabled && item.hasCollaborationPrivilege()"
                    main
                    @click="collaboration.open(subinstance.id)"
                  />

                  <div class="table-item p-4 d-flex align-center">
                    {{ subinstance.created_at_from_now }}
                  </div>

                  <div class="table-item ml-auto">
                    <div class="item">
                      <instance-item-menu
                        :checking-updates="checkingUpdatesId === subinstance.id"
                        :checking-wp-login="checkingWpLoginId === subinstance.id"
                        :instance="{ ...item, subinstance }"
                        :subinstance="subinstance"
                        @cancel-install="emit('cancel-install', $event)"
                        @clear-cache="emit('clear-cache', $event)"
                        @copy="emit('copy', $event)"
                        @delete="emit('delete', $event)"
                        @log-in="emit('log-in', $event)"
                        @push-to-live="emit('push-to-live', $event)"
                        @retry-install="emit('retry-install', $event)"
                        @share="emit('share', $event)"
                        @show-deploy-logs="emit('show-deploy-logs', $event)"
                        @staging="emit('staging', $event)"
                        @update="emit('update', $event)"
                        @wp-admin="emit('wp-admin', $event)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <template #bottom>
              <v-divider v-if="!(numberOfPages === 1 && itemsPerPage === possibleItemsPerPage[listStyle]?.[0])" />

              <data-iterator-footer
                :items-per-page="itemsPerPage"
                :list-style="listStyle"
                :number-of-pages="numberOfPages"
                :page="page"
                :per-page-label="t('table.footer.instance')"
                :possible-items-per-page="possibleItemsPerPage"
                @update:items-per-page="emit('update:items-per-page', $event)"
                @update:page="emit('update:page', $event)"
              />
            </template>
          </v-data-table-server>
        </v-card>
      </v-col>
    </v-row>

    <instance-deploy-logs-modal
      v-if="deployLogs.instanceId.value !== null"
      :instance-id="deployLogs.instanceId.value"
      :is-open="deployLogs.isOpen.value"
      :live="deployLogs.live.value"
      :log-id="deployLogs.logId.value"
      :no-logs="deployLogs.noLogs.value"
      :source="deployLogs.source.value"
      @close="deployLogs.closeDeployLogs"
    />
  </v-container>
</template>

<script lang="ts" setup>
  // app-lite adds the deploy-logs modal. The kebab is `InstanceItemMenu`
  // (the view opens what its events ask for), Cancel / Import details / Try again only emit. The collaboration chip
  // opens its link here (`useCollaborationLink`); the sub-row opens the sub-instance id under the parent's gate, as legacy.
  import type { InstanceKey } from './instance-keys'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import type { LabelChipItem } from '@/shared/ui/labels/labels.types'
  import type { PropType } from 'vue'
  import type { InstanceResource } from '@/entities/project/instance-resource'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import { useCollaborationLink } from '@/entities/project/use-collaboration-link'
  import { useSessionStore } from '@/shared/session/session.store'
  import DataIteratorFooter from '@/shared/ui/data-iterator/DataIteratorFooter.vue'
  import DataIteratorNoResultsContainer from '@/shared/ui/data-iterator/DataIteratorNoResultsContainer.vue'
  import { dataIteratorProps, useDataIterator } from '@/shared/ui/data-iterator/use-data-iterator'
  import InstanceDeployLogsModal from './InstanceDeployLogsModal.vue'
  import InstanceItemMenu from './InstanceItemMenu.vue'
  import InstanceTableCustomSort from './InstanceTableCustomSort.vue'
  import InstanceTableItemSkeleton from './InstanceTableItemSkeleton.vue'
  import BandwidthItem from './table-items/BandwidthItem.vue'
  import CollaborateItem from './table-items/CollaborateItem.vue'
  import NameItem from './table-items/NameItem.vue'
  import SelectItem from './table-items/SelectItem.vue'
  import SharedItem from './table-items/SharedItem.vue'
  import StatusItem from './table-items/StatusItem.vue'
  import StorageItem from './table-items/StorageItem.vue'
  import TagsItem from './table-items/TagsItem.vue'
  import VisitorsItem from './table-items/VisitorsItem.vue'
  import { useDeployLogsModal } from './use-deploy-logs-modal'

  // `items` are the grouped table items of `buildTableItems` (main row first, staging apps after it).
  const props = defineProps({
    ...dataIteratorProps,
    items: { type: Array as PropType<InstanceResource[]>, default: () => [] },
    keys: { type: Array as PropType<InstanceKey[]>, default: () => [] },
    sortBy: { type: [Object, Boolean] as PropType<LegacySortHeader | false>, default: false },
    checkedItems: { type: Array as PropType<Array<number | string>>, default: () => [] },
    itemsLoading: { type: Boolean, default: false },
    filterLabels: { type: Array as PropType<LabelChipItem[]>, default: undefined },
    // The id of the instance whose updates are loading: its kebab shows the Update loader.
    checkingUpdatesId: { type: Number as PropType<number | null>, default: null },
    // The id of the instance whose SSO users are loading: its kebab shows the WP Admin / Log In loader.
    checkingWpLoginId: { type: Number as PropType<number | null>, default: null },
  })

  // The sort and select events keep the kit table's `update:*` names (`useCustomTable`); the rest are the screen events.
  const emit = defineEmits<{
    'update:check-all': [value: boolean]
    'update:checked-items': [item: InstanceResource]
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'toggle-filter': [label: { title: string, color?: string }]
    'clear-all-filters': []
    'unsuspend': [link: string | true]
    'cancel-install': [instance: InstanceResource]
    'retry-install': [instance: InstanceResource]
    'import-details': [instance: InstanceResource]
    'share': [instance: InstanceResource]
    // The kebab (`InstanceItemMenu`); each carries the action instance (the staging instance on a sub-row).
    'wp-admin': [instance: InstanceResource]
    'log-in': [instance: InstanceResource]
    'show-deploy-logs': [instance: InstanceResource]
    'push-to-live': [instance: InstanceResource]
    'staging': [instance: InstanceResource]
    'copy': [instance: InstanceResource]
    'update': [instance: InstanceResource]
    'clear-cache': [instance: InstanceResource]
    'delete': [instance: InstanceResource]
  }>()

  const { t } = useTranslation()
  const session = useSessionStore()
  const deployLogs = useDeployLogsModal({ t: key => String(t(key)) })
  const collaboration = useCollaborationLink()

  const { numberOfPages } = useDataIterator(props)

  // All are selected when `checkedItems.length === items.length` (an empty page counts as all selected).
  const allSelected = computed(() => props.checkedItems.length === props.items.length)

  const isCollaborateEnabled = computed(() => session.home?.app?.integrations?.atarim_enabled)

  // V2 `:headers="keys"` (`{ text, value, ... }`) become V4 columns (`{ title, key }`); only their count matters here (`colspan`).
  const v4Headers = computed(() => props.keys.map(key => ({ title: key.text, key: key.value, sortable: false })))

  const listSorted = computed(() => props.items)

  function isSuspended (item: InstanceResource): boolean {
    return item.service_status === 'suspended' || item.service_status === 'cancelled'
  }

  /** The unsuspend link when the user has one, otherwise `true` (so the overlay is always clickable). */
  function unsuspendUrl (): string | true {
    const link = session.home?.user?.service_unsuspend_link as string | undefined
    return link || true
  }

  function unsuspend (): void {
    emit('unsuspend', unsuspendUrl())
  }

  function handleSelectAll (checked: boolean): void {
    emit('update:check-all', checked)
  }

  // app-lite: the row menu of a custom project opens its deploy logs. The kebab
  // content calls this when its "Show logs" item is chosen.
  defineExpose({ openDeployLogs: deployLogs.openDeployLogs })
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.v-card.table {
  border-radius: 8px;
}

// V4 `.v-table` sets `font-size: .875rem` and `line-height` on the root; V2 set them on `td` / `th` only, and the rows here are
// `div`s that inherited the 16px / 24px of the page.
.v-data-table {
  font-size: 1rem;
  line-height: 1.5;

  // V2 `.theme--*.v-data-table .v-data-table__empty-wrapper` colour (the skeleton rows sit in it).
  :deep(.v-data-table-rows-loading) {
    color: var(--v-table-loading-color);
  }

  // Every rule below reaches the child components (`table-items/*`, the sort row).
  :deep(.custom-sort) {
    padding: 0px;

    .sort-item:first-child {
      margin-left: 24px !important;
    }
  }

  :deep(.table-row .table-item),
  :deep(.table-subrow .table-item) {
    max-height: 66px;
    min-height: 66px;
  }

  :deep(.table-row) {
    position: relative;

    &:hover {
      background: var(--v-table-row-hover) !important;
    }

    &:after {
      content: "";
      position: absolute;
      width: 100%;
      height: 1px;
      background: var(--v-gray-lighten2);
      right: 0;
    }
  }

  :deep(.table-subrow) {
    border-top: none;
    position: relative;

    &:after {
      content: "";
      position: absolute;
      width: 1200px;
      height: 1px;
      background: var(--v-gray-lighten2);
      right: 0;
    }
  }

  :deep(.text-start) {
    max-width: 300px;
  }

  :deep(.v-row-group__header) {
    background: transparent !important;
    position: relative;

    .checkbox {
      left: 24px;
      top: 8px;
      position: absolute;
    }
  }

  :deep(.status-indicator-container) {
    display: flex;
    align-items: center;
  }

  :deep(.table-item--first) {
    padding-left: 48px;
  }

  :deep(.item) {
    min-height: 66px;
    max-height: 66px;
    display: flex;
    align-items: center;

    .item__value {
      margin: 0;

      .item__value-current {
        color: map.get(v.$text, headings);
        font-weight: v.$font-weight-semibold;
      }
    }

    .no-data {
      color: map.get(v.$text, headings);
      font-size: v.$font-size-base;
      line-height: v.$line-height-base;
      font-weight: v.$font-weight-semibold;
    }
  }

  :deep(.item--main .item__title-box) {
    margin-left: 16px;
  }

  :deep(.item--collaborate:not(:empty)) {
    width: 100px;
  }

  :deep(.item__title-box) {
    display: flex;
    flex-direction: column;

    .item__title {
      margin: 0;
    }

    .item__url {
      color: map.get(v.$gray, darken1);
    }
  }
}

// V2 icon button: `.theme--*.v-btn.v-btn--icon` colour (V4 text variant keeps the 0.87 text colour). It is an x-small button here: the
// V2 small icon button measures 32px like the `_buttons.scss` x-small rule.
.v-data-table :deep(.instance-item__more-button) {
  color: var(--v-icon-btn-color);
  line-height: 21px;
}

.cursor-pointer {
  cursor: pointer;
}

.table-row {
  &--suspended {
    border-left: 3px solid var(--v-sand-base);
  }

  &:hover {
    .instance-actions {
      opacity: 1;
    }
  }
}

.instance-actions {
  position: absolute;
  top: 0;
  height: 200px;
  z-index: 50;
  width: 100%;
  transition: opacity 0.2s ease;
  opacity: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(8px);
  border-radius: 8px 8px 0 0;
  overflow: hidden;

  &--suspended {
    background: transparent;
    height: 100%;
    width: 100%;
    box-sizing: border-box;
    top: 0px;
    border-top: 1px solid var(--v-gray-lighten2);
    backdrop-filter: blur(13.5px);
    color: var(--v-sand-darken1);
  }
}

.v-application--is-rtl {
  .table-subrow {
    &::after {
      right: unset;
      left: 0px;
    }
  }
}
</style>

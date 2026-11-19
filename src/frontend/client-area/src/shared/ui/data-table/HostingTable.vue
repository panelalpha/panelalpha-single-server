<template>
  <DataTable
    v-bind="props"
    :item-slots="[...itemSlots, 'databases', 'updated_at']"
    @clear-filters="emit('clear-filters')"
    @update:check-all="emit('update:check-all', $event)"
    @update:checked-items="emit('update:checked-items', $event)"
    @update:items-per-page="emit('update:items-per-page', $event)"
    @update:page="emit('update:page', $event)"
    @update:sort-by="emit('update:sort-by', $event)"
    @update:sort-desc="emit('update:sort-desc', $event)"
  >
    <template
      v-for="name in forwardedSlots"
      :key="name"
      #[name]="slotProps"
    >
      <slot
        :name="name"
        v-bind="slotProps"
      />
    </template>

    <template #item.databases="{ item }">
      <div class="d-flex">
        <slot
          name="databases"
          v-bind="item"
        />
      </div>
    </template>

    <template #item.updated_at="{ item }">
      <div class="d-flex">
        <slot
          name="updated_at"
          v-bind="item"
        />
      </div>
    </template>
  </DataTable>
</template>

<script lang="ts" setup>
  // A thin alias of `DataTable` for the old `#databases` / `#updated_at` slots (rendered in `div.d-flex`); no consumer is left, the file goes with the next
  // table steps. A new table uses `DataTable` and `itemSlots` directly.
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { computed, useSlots } from 'vue'
  import { dataTableProps } from './data-table'
  import DataTable from './DataTable.vue'

  const props = defineProps(dataTableProps)

  const emit = defineEmits<{
    'update:check-all': [value: boolean]
    'update:checked-items': [value: unknown]
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
    'update:page': [value: number]
    'update:items-per-page': [value: number | string]
    'clear-filters': []
  }>()

  const slots = useSlots()

  // Every slot the caller gave goes through; the two old cell slots are wrapped above.
  const forwardedSlots = computed(() => Object.keys(slots).filter(name => name !== 'databases' && name !== 'updated_at'))
</script>

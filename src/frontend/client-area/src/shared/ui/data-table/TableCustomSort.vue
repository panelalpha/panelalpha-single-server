<template>
  <tr class="custom-sort">
    <td
      v-for="(item, index) in headers"
      :key="index"
      :aria-sort="announceSort && item.sortable && isSorted(item) ? (sortDesc ? 'descending' : 'ascending') : undefined"
      class="sort-item"
      :class="[`item--${item.text ? item.text.toLowerCase() : 'select'}`, { 'text-right': item.headerAlign === 'end' }]"
      :role="announceSort ? 'columnheader' : undefined"
    >
      <div
        v-if="index === 0 && canBeSelected"
        class="custom-sort__checkbox mt-1"
      >
        <checkbox
          :model-value="allSelected"
          @update:model-value="handleSelectAll"
        />
      </div>

      <div
        v-else-if="item.text"
        class="custom-sort__item"
        :class="[item.sortable ? 'custom-sort__item--sortable' : '', { 'justify-end': item.headerAlign === 'end' }]"
        :role="item.sortable ? 'button' : undefined"
        :tabindex="item.sortable ? 0 : undefined"
        @click="item.sortable ? handleSortClick(item) : undefined"
        @keydown.enter.prevent="item.sortable ? handleSortClick(item) : undefined"
        @keydown.space.prevent="item.sortable ? handleSortClick(item) : undefined"
      >
        {{ item.label ?? t(`table.header.${item.text}`) }}

        <div
          v-if="item.sortable"
          class="custom-sort__arrows"
        >
          <v-icon
            class="custom-sort__arrow-up"
            :down="isSorted(item) && sortDesc ? '' : undefined"
            size="12"
            :up="isSorted(item) && !sortDesc ? '' : undefined"
          >
            $arrowsSort
          </v-icon>
        </div>
      </div>
    </td>
  </tr>
</template>

<script lang="ts" setup>
  import type { LegacySortBy, LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'

  // Legacy took one `props` object (the V2 header-slot payload: `props.headers`, `props.options.sortBy[0]`,
  // `props.options.sortDesc[0]`); V4 has no such payload, so the pieces are explicit props in the legacy shape.
  // `isMobile` came from the V2 slot and is unused by the template, as in legacy.
  // A sortable header is a button for the keyboard (`role`, `tabindex`, Enter and Space): legacy sorted by mouse only, and the V4 header
  // that Containers had before sorted with Enter (pixels of the mouse states unchanged).
  // `announceSort` gives the cells the `columnheader` role and the sorted one `aria-sort` (opt-in so the DOM of other tables stays).
  // A header with `headerAlign: 'end'` sits to the right like its cells (legacy `text-right` / `justify-end`); without it
  // the header stays to the left as legacy TableCustomSort put every header.
  const props = withDefaults(defineProps<{
    isMobile?: boolean
    headers?: LegacySortHeader[]
    sortBy?: LegacySortBy
    sortDesc?: boolean
    allSelected?: boolean
    canBeSelected?: boolean
    announceSort?: boolean
  }>(), {
    isMobile: false,
    headers: () => [],
    sortBy: false,
    sortDesc: false,
    allSelected: false,
    canBeSelected: false,
    announceSort: false,
  })

  const emit = defineEmits<{
    'select-all': [value: boolean]
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
  }>()

  const { t } = useTranslation()

  const sortKey = computed(() => (typeof props.sortBy === 'string' ? props.sortBy : (props.sortBy ? props.sortBy.value : undefined)))

  function isSorted (item: LegacySortHeader): boolean {
    return sortKey.value === item.value
  }

  function handleSelectAll (): void {
    emit('select-all', !props.allSelected)
  }

  function handleSortClick (item: LegacySortHeader): void {
    if (isSorted(item)) {
      emit('update:sort-desc', !props.sortDesc)
    } else {
      emit('update:sort-by', item)
    }
  }
</script>

<style
  lang="scss"
  scoped
  src="./TableCustomSort.scss"
/>

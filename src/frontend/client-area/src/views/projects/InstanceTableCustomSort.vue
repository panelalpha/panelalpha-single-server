<template>
  <div
    class="custom-sort d-flex align-center"
    data-testid="instance-table-sort"
  >
    <div
      v-for="(item, index) in headers"
      :key="index"
      class="sort-item"
      :class="`item--${item.text ? item.text.toLowerCase() : 'select'} ${item.customClass ? ('item--' + item.customClass) : ''}`"
    >
      <div
        v-if="index === 0"
        class="custom-sort__checkbox"
      >
        <checkbox
          :aria-label="t('table.snackbar.selectAll')"
          :model-value="allSelected"
          @update:model-value="handleSelectAll"
        />
      </div>

      <div
        v-else-if="item.text && (item.isShowed === undefined || item.isShowed)"
        class="custom-sort__item"
        :class="`${item.sortable ? 'custom-sort__item--sortable' : ''}`"
        @click="item.sortable ? handleSortClick(item) : undefined"
      >
        {{ t(`table.header.${item.text}`) }}

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
    </div>
  </div>
</template>

<script lang="ts" setup>
  // The V2 header-slot `props`
  // (`props.options.sortBy[0]`, `props.options.sortDesc[0]`) are the explicit `sortBy` / `sortDesc` props, as in the kit `TableCustomSort`.
  import type { InstanceKey } from './instance-keys'
  import type { LegacySortHeader } from '@/shared/ui/data-iterator/sort-model'
  import { useTranslation } from 'i18next-vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'

  const props = withDefaults(defineProps<{
    headers?: InstanceKey[]
    sortBy?: LegacySortHeader | false
    sortDesc?: boolean
    allSelected?: boolean
  }>(), {
    headers: () => [],
    sortBy: false,
    sortDesc: false,
    allSelected: false,
  })

  const emit = defineEmits<{
    'select-all': [value: boolean]
    'update:sort-by': [value: LegacySortHeader]
    'update:sort-desc': [value: boolean]
  }>()

  const { t } = useTranslation()

  function isSorted (item: InstanceKey): boolean {
    return Boolean(props.sortBy) && (props.sortBy as LegacySortHeader).value === item.value
  }

  function handleSelectAll (): void {
    emit('select-all', !props.allSelected)
  }

  // A second click on the sorted column reverses the direction.
  function handleSortClick (item: InstanceKey): void {
    if (isSorted(item)) {
      emit('update:sort-desc', !props.sortDesc)
    } else {
      emit('update:sort-by', item)
    }
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.custom-sort {
  padding: 0 24px;
  height: 56px;

  td:first-child {
    padding-left: 24px;
    padding-right: 0px;
  }
}

.custom-sort__arrows {
  margin-left: 6px;
}

// The legacy `arrows-sort.vue` icon read `$parent.$attrs.up/down` to paint one arrow green; the V4 icon has a static fill, so the
// `up` / `down` attributes on the `v-icon` drive the same two paths here (same rule as the kit `TableCustomSort`).
.custom-sort__arrow-up[up] :deep(path:first-of-type),
.custom-sort__arrow-up[down] :deep(path:last-of-type) {
  fill: var(--v-success-base);
}

.custom-sort__item {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  color: map.get(v.$text, base);
  font-size: v.$font-size-sm;
  line-height: v.$line-height-sm;

  &--sortable {
    cursor: pointer;

    &:hover {
      color: map.get(v.$primary, darken1);
    }
  }
}

.item--select {
  display: flex;
  justify-content: flex-start;
  padding: 0 !important;
}

.item--title {
  padding-left: 8px !important;
}

.v-application--is-rtl {
  .item--title {
    padding-left: 0px !important;
    padding-right: 8px !important;
  }
}
</style>

<template>
  <tr>
    <td v-bind="cellClass ? { class: cellClass } : {}">
      <div
        v-if="variant === 'compact'"
        class="mobile-table-item mobile-table-item--compact"
        :data-testid="cardTestid"
      >
        <div
          v-if="$slots.title"
          class="mobile-table-item__title"
        >
          <slot name="title" />
        </div>

        <div
          v-if="$slots.status"
          class="mobile-table-item__status"
        >
          <slot name="status" />
        </div>

        <div
          v-if="$slots.full"
          class="mobile-table-item__full"
        >
          <slot name="full" />
        </div>

        <div
          v-if="$slots.meta"
          class="mobile-table-item__meta"
        >
          <slot name="meta" />
        </div>

        <div
          v-if="$slots['meta-end']"
          class="mobile-table-item__meta-end"
        >
          <slot name="meta-end" />
        </div>
      </div>

      <div
        v-else
        class="mobile-table-item"
        :data-testid="cardTestid"
      >
        <div
          v-if="$slots.select"
          class="mobile-table-item__select"
        >
          <slot name="select" />
        </div>

        <div class="mobile-table-item__values">
          <slot />

          <template v-if="$slots.actions">
            <MobileTableField
              v-if="actionsLabel"
              :label="actionsLabel"
              :value-testid="actionsTestid"
              @sort="emit('actions-sort')"
            >
              <slot name="actions" />
            </MobileTableField>

            <div
              v-else
              class="mobile-table-item__actions"
              :data-testid="actionsTestid"
            >
              <slot name="actions" />
            </div>
          </template>
        </div>
      </div>
    </td>
  </tr>
</template>

<script lang="ts" setup>
  // The frame of a mobile table card: `tr > td > div.mobile-table-item > div.mobile-table-item__values` (legacy markup, written
  // by hand in every table; the global `_mobileTableItems.scss` styles it). The root is a single `tr`, so the `class`,
  // `data-testid` and scoped-style attribute of the host land on it, as they did on the hand-written row. The `default` look
  // stays in the global layer; the `compact` grid is styled here.
  import MobileTableField from './MobileTableField.vue'

  withDefaults(defineProps<{
    /** Class of the `td` (`w-100`; `w-100 px-0` in the tables that drop the cell padding; empty for none). */
    cellClass?: string
    /** `data-testid` of `div.mobile-table-item`. */
    cardTestid?: string
    /** Header of the last field that holds the `actions` slot; without it the slot sits in `div.mobile-table-item__actions`. */
    actionsLabel?: string
    /** `data-testid` of the element that holds the `actions` slot (the value of the actions field, or `div.mobile-table-item__actions`). */
    actionsTestid?: string
    /** `default`: label and value fields (legacy). `compact`: a grid card without labels, filled through the `title`, `status`, `full`, `meta` and `meta-end` slots. */
    variant?: 'default' | 'compact'
  }>(), {
    cellClass: 'w-100',
    cardTestid: undefined,
    actionsLabel: undefined,
    actionsTestid: undefined,
    variant: 'default',
  })

  const emit = defineEmits<{ 'actions-sort': [] }>()
</script>

<style lang="scss" scoped>
// `compact` card: two columns, the second as narrow as its content. Slots the host does not fill render no element,
// so a column is placed explicitly and an empty one leaves no gap.
.mobile-table-item--compact {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 12px;
  row-gap: 6px;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--v-gray-lighten2);
}

.mobile-table-item__title {
  grid-column: 1;
  min-width: 0;
}

.mobile-table-item__status {
  grid-column: 2;
  justify-self: end;
}

.mobile-table-item__full {
  grid-column: 1 / -1;
  min-width: 0;
}

.mobile-table-item__meta,
.mobile-table-item__meta-end {
  font-size: 13px;
  line-height: 20px;
  color: var(--v-gray-darken1);
}

.mobile-table-item__meta {
  grid-column: 1;
  min-width: 0;
}

.mobile-table-item__meta-end {
  grid-column: 2;
  justify-self: end;
  text-align: end;
}
</style>

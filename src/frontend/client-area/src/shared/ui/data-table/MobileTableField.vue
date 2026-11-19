<template>
  <div class="mobile-table-item__row">
    <div
      v-if="label"
      class="mobile-table-item__header"
      :role="sortable ? 'button' : undefined"
      :tabindex="sortable ? 0 : undefined"
      @click="emit('sort')"
      @keydown.enter.prevent="sortable ? emit('sort') : undefined"
      @keydown.space.prevent="sortable ? emit('sort') : undefined"
    >
      {{ label }}
    </div>

    <div
      v-if="!hideValue"
      class="mobile-table-item__value"
      :class="valueClass"
      :data-testid="valueTestid"
    >
      <slot v-if="$slots.default" />

      <span
        v-else
        :class="bold ? 'bold p-3' : 'p-3'"
      >{{ value }}</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // One labelled field of a mobile table card (`div.mobile-table-item__row`, styled by the global `_mobileTableItems.scss`).
  // Legacy wrote this markup by hand in every table; the classes and the order of the children stay as they were, because
  // the global rules and the parity probes count on them. The label emits `sort` on click; a table that does not listen
  // (most of them, as legacy) keeps the same DOM. The template tests the slot with `v-if` instead of using a slot fallback: a slot whose
  // content is only a false `v-if` (a comment) would trigger the fallback and show an empty `span` where the hand-written value held
  // nothing (Backups database / directory).
  withDefaults(defineProps<{
    /** Text of the header; without it the field has no header (the advanced Logs table). */
    label?: string
    /** Plain text of the value, rendered in `span.bold.p-3` (or `span.p-3`) unless the default slot is used. Typed `unknown`
     *  because the `mobile` slot of the tables hands out an untyped row; the template prints it like `{{ }}`. */
    value?: unknown
    bold?: boolean
    /** Extra classes of `div.mobile-table-item__value`. */
    valueClass?: string
    /** `data-testid` of `div.mobile-table-item__value`. */
    valueTestid?: string
    /** Renders the header only (EnvVars: no actions in a read-only file). */
    hideValue?: boolean
    /** The label sorts: a button for the keyboard (Enter, Space); opt-in. */
    sortable?: boolean
  }>(), {
    label: undefined,
    value: undefined,
    bold: true,
    valueClass: undefined,
    valueTestid: undefined,
    sortable: false,
  })

  const emit = defineEmits<{ sort: [] }>()
</script>

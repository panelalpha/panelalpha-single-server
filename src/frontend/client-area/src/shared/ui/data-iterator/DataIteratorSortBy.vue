<template>
  <div class="d-flex align-center">
    <select-dropdown
      v-if="keys"
      :class="smAndDown ? 'p-3' : 'p-2'"
      :items="keysToShow"
      :model-value="sortBy === false ? null : sortBy"
      :size="smAndDown ? 'md' : 'lg'"
      @update:model-value="sortChange"
    >
      <template #prepend-inner>
        <v-icon
          icon="$bandwidth"
          size="16"
        />
      </template>
    </select-dropdown>
  </div>
</template>

<script lang="ts" setup>
  import type { LegacySortHeader } from './sort-model'
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import SelectDropdown from '@/shared/ui/form/SelectDropdown.vue'

  const props = withDefaults(defineProps<{
    sortBy?: LegacySortHeader | false
    keys?: LegacySortHeader[] | boolean
    // Legacy prop, passed through by DataIteratorFilterControls and never read (omitted from the emit surface).
    sortDesc?: boolean
  }>(), {
    sortBy: false,
    keys: false,
    sortDesc: false,
  })

  const emit = defineEmits<{
    'update:sort-by': [value: LegacySortHeader]
  }>()

  const { smAndDown } = useDisplay()

  const keysToShow = computed(() => (Array.isArray(props.keys) ? props.keys.filter(item => item.sortable) : []))

  function sortChange (data: unknown): void {
    emit('update:sort-by', data as LegacySortHeader)
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

// V2 `.v-list-item { position: relative }` and `.click-target` are omitted: the menu is teleported, so
// neither could match inside the select (they were dead in legacy as well).
.v-select {
  // The global `.v-input { font-weight: inherit }` (`_inputs`, after `_fonts`) beats the `p-2` / `p-3` paragraph class on the
  // same element, where V2 let the utility win (300 / 400).
  &.p-2 {
    font-weight: v.$font-weight-light;
  }

  &.p-3 {
    font-weight: v.$font-weight-normal;
  }

  // V4 `.v-field__input` adds a 2px column gap (selection + hidden input) and 0.009375em letter spacing; V2 had neither.
  :deep(.v-field__input) {
    column-gap: 0;
    letter-spacing: normal;
  }

  // V2 `.v-select` inherited the paragraph class font (`p-3` 14/20 on mobile); V4 `.v-field` sets its own 16/24.
  // `.v-input` sets a unitless line-height (1.5), so `inherit` would give 21px; take the paragraph token.
  &.p-3 :deep(.v-field) {
    font-size: map.get(v.$paragraphs, sm, font-size);
    line-height: map.get(v.$paragraphs, sm, line-height);
  }

  :deep(.v-select__selection) {
    margin-inline-end: 0;
  }

  :deep(.v-text-field__prefix) {
    font-weight: v.$font-weight-light !important;
    color: map.get(v.$gray, darken1) !important;
  }

  :deep(.v-select__selection) {
    color: map.get(v.$text, headings);
    font-weight: v.$font-weight-bold;
  }
}
</style>

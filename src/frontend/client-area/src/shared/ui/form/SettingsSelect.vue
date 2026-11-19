<template>
  <v-select
    class="v-input--md"
    v-bind="defaults"
  >
    <template
      v-for="(_, name) in $slots"
      #[name]="slotProps"
    >
      <slot
        :name="name"
        v-bind="slotProps ?? {}"
      />
    </template>
  </v-select>
</template>

<script lang="ts" setup>
  import { computed, useAttrs } from 'vue'
  import { formFieldDefaults } from './form-field'

  // The select of the settings forms: General and Backups settings and the backup store modal, one look (`v-input--md`,
  // compact, outlined, single line). The consumer class is added to `v-input--md`; `v-model`, `items`, `disabled`, `error-messages`, `rules`,
  // listeners and slots (`selection`, `item`) fall through to the `v-select`.
  const attrs = useAttrs()
  const defaults = computed(() => formFieldDefaults('select', Object.keys(attrs)))
</script>

<style lang="scss" scoped>
// V2 `.v-input__append-inner` is 34px (10px padding + the 24px icon); V4 adds `margin-inline-start: 4px` to `.v-select__menu-icon`, so the
// value had 4px less room than in the legacy select. The legacy comma selection is `overflow: visible` (V4 selection text: hidden with an
// ellipsis), so the longest date format value ("YYYY-MM-DD — 2026-11-10", 223px) is whole in the 279px field at 375px, as in the legacy
// 303px field. A longer value runs into the gap before the chevron, as in the legacy select.
.v-select :deep(.v-select__menu-icon) {
  margin-inline-start: 0;
}

.v-select :deep(.v-select__selection-text) {
  overflow: visible;
}
</style>

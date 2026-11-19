<template>
  <v-menu
    v-model="menuOpen"
    :close-on-content-click="false"
    content-class="data-iterator-filter-menu"
    max-width="375px"
    min-width="375px"
    :offset="8"
    :viewport-margin="0"
    :z-index="1000"
  >
    <template #activator="{ props: activatorProps }">
      <div class="filter-menu">
        <div
          v-bind="activatorProps"
          class="custom-menu"
          :class="[
            menuOpen ? 'custom-menu--active' : '',
            labelsActive ? 'custom-menu--active-info' : '',
            smAndDown ? 'custom-menu--sm p-3' : 'p-2',
          ]"
        >
          <span>{{ t('button.filters') }}</span>

          <div
            v-if="appliedLabels.length > 0"
            class="filter-number"
          >
            {{ appliedLabels.length }}
          </div>
          <!-- `v-field__append-inner`: the V4 name of the V2 `v-input__append-inner` the global `.custom-menu` rules rotate -->
          <div class="v-field__append-inner">
            <v-icon
              icon="$chevrondown"
              size="16"
            />
          </div>
        </div>

        <span
          v-if="labelsActive"
          class="clear-filter text-info p-4"
          @click="removeAllLabels"
        >
          {{ t('button.clearFilter') }}
        </span>
      </div>
    </template>

    <div>
      <div class="px-4 pt-4 heading--text d-flex justify-space-between">
        <div class="p-2">
          {{ t('form.label.tags') }}
        </div>
      </div>

      <div class="px-4 pt-2">
        <v-autocomplete
          v-model="selectedLabels"
          v-model:search="searchValue"
          class="pt-0 mb-4 mt-0"
          hide-details
          item-title="title"
          item-value="title"
          :items="labels"
          :label="t('form.placeholder.tags')"
          menu-icon=""
          :menu-props="{
            contentClass: 'label-autocomplete',
            disabled: true,
          }"
          multiple
          return-object
          variant="outlined"
        >
          <!-- V2 `chips` + `v-slot:selection`: V4 renders its own `VChip` (the `#chip` slot) when `chips` is set and ignores
               `#selection`, so `chips` is left out. The V4 slot `item` is the raw label, not a list item. -->
          <template #selection="{ item }">
            <label-chip
              :item="item as LabelChipItem"
              removable
              xsmall
              @unassign-label="removeLabel(item as LabelChipItem)"
            />

            <span />
          </template>
        </v-autocomplete>
      </div>

      <transition name="expand-transition">
        <v-list
          class="d-flex flex-column mb-4 label-list"
        >
          <v-list-item
            v-for="(item, index) in hideSelectedLabels"
            :key="item.title + index"
            @click="addLabel(item)"
          >
            <div class="click-target" />

            <label-chip
              :item="item"
              xsmall
            />
          </v-list-item>
        </v-list>
      </transition>

      <v-divider />

      <div class="d-flex justify-space-between px-4 py-4">
        <div class="d-flex">
          <AppButton
            class="mr-2"
            kind="primary"
            @click="applyLabels"
          >
            {{ t('button.apply') }}
          </AppButton>

          <AppButton
            kind="surface"
            @click="closeMenu"
          >
            {{ t('button.cancel') }}
          </AppButton>
        </div>

        <AppButton
          class="clear-filter-btn"
          color="info"
          kind="link"
          @click="removeAllLabels"
        >
          {{ t('button.clearFilter') }}
        </AppButton>
      </div>
    </div>
  </v-menu>
</template>

<script lang="ts" setup>
  import type { LabelChipItem } from '@/shared/ui/labels/labels.types'
  import { useTranslation } from 'i18next-vue'
  import { computed, ref, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import LabelChip from '@/shared/ui/labels/LabelChip.vue'

  const props = withDefaults(defineProps<{
    labels?: LabelChipItem[]
    appliedLabels?: LabelChipItem[]
  }>(), {
    labels: () => [],
    appliedLabels: () => [],
  })

  const emit = defineEmits<{
    'update:applied-labels': [labels: LabelChipItem[]]
  }>()

  const { t } = useTranslation()
  const { smAndDown } = useDisplay()

  const searchValue = ref('')
  const menuOpen = ref(false)
  const selectedLabels = ref<LabelChipItem[]>([])

  const labelsActive = computed(() => props.appliedLabels.length > 0)

  // Case-sensitive, as legacy (`item.title.includes(searchValue)`).
  const filteredLabels = computed(() => {
    if (!searchValue.value) {
      return props.labels
    }
    return props.labels.filter(item => item.title.includes(searchValue.value))
  })

  const hideSelectedLabels = computed(() => filteredLabels.value.filter(item => !selectedLabels.value.includes(item)))

  // Every open and close resets the selection to the applied labels and clears the search.
  watch(menuOpen, () => {
    selectedLabels.value = [...props.appliedLabels]
    searchValue.value = ''
  })

  function removeLabel (item: LabelChipItem): void {
    selectedLabels.value = selectedLabels.value.filter(label => label.title !== item.title)
  }

  function addLabel (item: LabelChipItem): void {
    selectedLabels.value.push(item)
  }

  function closeMenu (): void {
    menuOpen.value = false
  }

  // Legacy emits the live `selectedLabels` array itself (not a copy) and keeps the menu open.
  function removeAllLabels (): void {
    selectedLabels.value = []
    emit('update:applied-labels', selectedLabels.value)
  }

  function applyLabels (): void {
    emit('update:applied-labels', selectedLabels.value)
    closeMenu()
  }
</script>

<style lang="scss" scoped>
@use 'sass:map';
@use '@/app/styles/legacy/tokens/variables' as v;

.clear-filter-btn.v-btn {
  :deep(.v-btn__content) {
    font-weight: v.$font-weight-normal;
    font-size: v.$font-size-sm;
    line-height: v.$line-height-sm;
  }
}

.custom-menu {
  min-height: 48px;

  &.custom-menu--sm {
    min-height: 38px;
  }

  span {
    font-weight: v.$font-weight-bold;
  }
}

// V2 `.v-chip--select` had `margin: 4px` (right and bottom are overridden by `LabelChip`); V4 selection chips have none.
.v-autocomplete :deep(.v-autocomplete__selection > .label-chip) {
  margin-top: 4px;
  margin-left: 4px;
}

// The `.label-autocomplete { overflow: auto !important }` rule of legacy is omitted: it styled the content class
// of the disabled autocomplete menu, which never opens (and a scoped rule could not reach that overlay).
.v-input {
  :deep(.v-label) {
    font-size: v.$font-size-base;
    line-height: v.$line-height-base;
  }

  // V2 `.v-input__control .v-input__slot` is the V4 `.v-field`.
  :deep(.v-field) {
    min-height: 48px;
  }

  // V2 `.v-select__selections` is the V4 `.v-field__input`.
  :deep(.v-field__input) {
    min-height: 48px !important;

    input {
      max-height: 24px;
      margin: 0;
    }
  }
}

.v-list {
  // V2 `.v-list` had no border and an elevation-0 shadow of three layers; V4 draws a 12% black border style and two layers.
  border-style: none;
  border-color: var(--v-white-base);
  box-shadow: v.$box-shadow-v2-list-flat;

  :deep(.v-list-item) {
    max-height: 36px;
    min-height: 36px;
    position: relative;

    .click-target {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0px;
      left: 0px;
    }
  }

  :deep(.v-list-item--active) {
    background: map.get(v.$primary, lighten4);
  }
}

.filter-menu {
  position: relative;

  .clear-filter {
    position: absolute;
    bottom: -24px;
    left: 0px;
    color: map.get(v.$info, base);
    transition: color 0.24s ease;
    cursor: pointer;

    &:hover {
      color: map.get(v.$info, darken1);
    }
  }
}

.label-list {
  padding: 0px 8px;
  max-height: 304px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 14px;
  }

  &::-webkit-scrollbar-track {
    box-shadow: none;
    background-color: transparent;
    max-width: 8px;
    border: 3px solid transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: rgb(var(--v-theme-gray-lighten-2));
    border-radius: 8px;
    border: 4px solid transparent;
    background-clip: padding-box;
  }

  :deep(.v-list-item) {
    padding: 8px 12px;
    border-radius: 4px;

    // V2 `::before` state layer is the V4 `.v-list-item__overlay`.
    .v-list-item__overlay {
      background-color: currentColor;
    }

    &:hover {
      .v-list-item__overlay {
        color: map.get(v.$gray, base) !important;
        opacity: 0.08;
      }
    }
  }
}
</style>

<style lang="scss">
// Unscoped: the menu is teleported. The connected location strategy writes the activator width into an inline `min-width`
// and ignores the `min-width` prop, so legacy `min-width/max-width="375px"` is
// `!important` on the content. V2 menu content took the app text colour (the global overlay colour in `_dropdowns` is for detached menus).
.v-menu.v-menu > .v-overlay__content.data-iterator-filter-menu {
  min-width: 375px !important;
  max-width: 375px !important;
  color: var(--v-text-base);
}
</style>

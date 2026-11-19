<template>
  <v-snackbar
    class="snackbar"
    data-testid="select-snackbar"
    :model-value="count > 0"
    timeout="-1"
    :z-index="1000"
  >
    <div
      v-if="isWide"
      class="snackbar__row d-flex justify-space-between"
    >
      <div class="d-flex align-center">
        <div
          class="snackbar__item-number p-2 font-weight-bold"
          data-testid="select-snackbar-count"
        >
          {{ count }}
        </div>

        <div class="d-flex align-center pr-2 p-2">
          {{ selectedLabel }}
        </div>

        <slot name="actions" />
      </div>

      <div class="d-flex">
        <div
          v-ripple
          class="d-flex btn-icon-horizontal p-2 font-weight-600"
          @click="selectAll(true)"
        >
          {{ t('table.snackbar.selectAll') }}
        </div>

        <div
          v-ripple
          class="d-flex btn-icon-horizontal p-2 font-weight-600"
          @click="selectAll(false)"
        >
          {{ t('table.snackbar.deselect') }}
        </div>
      </div>
    </div>

    <div
      v-else
      class="d-flex align-center"
      style="height: 100%"
    >
      <div class="d-flex align-center">
        <AppButton
          :aria-label="t('table.snackbar.deselect')"
          class="snackbar-button mr-3"
          icon
          kind="field"
          size="x-small"
          @click="selectAll(false)"
        >
          <v-icon
            color="gray-darken-1"
            icon="$close"
            size="12"
          />
        </AppButton>

        <div class="d-flex align-center pr-2 p-2 text-white">
          {{ compactLabel }}
        </div>
      </div>

      <div
        class="mx-3"
        style="max-width: 8px; min-width: 8px"
      >
        <v-divider style="border-color: var(--v-gray-darken2)" />
      </div>

      <div class="d-flex align-center">
        <div
          style="cursor: pointer"
          @click="allSelected ? selectAll(false) : selectAll(true)"
        >
          <Checkbox
            class="mr-3"
            :dark="dark"
            :model-value="allSelected"
            style="pointer-events: none"
          />
        </div>

        <div class="d-flex align-center pr-2 p-2 text-white">
          {{ t('table.snackbar.selectAll') }}
        </div>
      </div>

      <v-menu
        v-model="moreOpen"
        location="top end"
        :offset="4"
        :z-index="1001"
      >
        <template #activator="{ props: activatorProps }">
          <AppButton
            v-bind="activatorProps"
            :aria-label="t('button.more')"
            class="ml-auto"
            color="primary"
            data-testid="select-snackbar-more"
            kind="icon"
            style="border-radius: 5px"
          >
            <v-icon
              color="gray-darken-1"
              icon="$morehorizontal"
              size="20"
            />
          </AppButton>
        </template>

        <!-- The list closes the menu on any click inside it (legacy: the menu closed on a content click); the slot gets `close` too. An item
             that opens a dialog must call `close` itself before it emits: when the dialog opens first, the menu stays open above it
             (the menu stays open above it on mobile). -->
        <v-list
          class="select-snackbar-menu"
          @click="close"
        >
          <slot
            :close="close"
            name="menu-items"
          />
        </v-list>
      </v-menu>
    </div>
  </v-snackbar>
</template>

<script lang="ts" setup>
  // The shape is shared with the plugins select snackbar.
  // The desktop row shows above 966px of JS width (not a Vuetify breakpoint); below it the compact bar has a close
  // button, the label, a select-all checkbox and a "more" menu. The host fills the actions and the menu; this kit only lays them out.
  import { useTranslation } from 'i18next-vue'
  import { computed, ref } from 'vue'
  import { useDisplay } from 'vuetify'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import Checkbox from '@/shared/ui/form/Checkbox.vue'

  const props = defineProps<{
    /** Number of selected items (legacy `numberOfCheckedItems`). */
    count: number
    /** Every item of the list is selected (legacy `isAllSelected`, computed by the host). */
    allSelected: boolean
    /** The wide row's label, already translated with the count. */
    selectedLabel: string
    /** The compact bar's label, already translated with the count. Defaults to `selectedLabel`. */
    shortLabel?: string
    /**
     * Unchecked box on the bar's dark surface (the legacy backups snackbar passed `:dark="true"`). V2 `dark` only set the `theme--dark` class of
     * the bar; the bar's own colours (`--v-massaction-base`, text, shadow) kept following the app theme, so no V4 `theme` is set on the bar.
     */
    dark?: boolean
  }>()

  const emit = defineEmits<{
    'update:check-all': [value: boolean]
  }>()

  defineSlots<{
    'actions'?: () => unknown
    'menu-items'?: (scope: { close: () => void }) => unknown
  }>()

  const { t } = useTranslation()
  const { width } = useDisplay()

  // Legacy `$vuetify.breakpoint.width > 966`.
  const isWide = computed(() => width.value > 966)
  const compactLabel = computed(() => props.shortLabel ?? props.selectedLabel)

  const moreOpen = ref(false)

  function close (): void {
    moreOpen.value = false
  }

  function selectAll (value: boolean): void {
    emit('update:check-all', value)
  }
</script>

<style lang="scss" scoped>
@use '@/app/styles/legacy/tokens/variables' as v;

// V2 `elevation="4"` went to the bar (`.elevation-4`, `!important`); V4 `v-snackbar` has no `elevation` prop. V2 `.v-snack` is 14px with a
// 1.5 line height and no margin around the bar (V4 `.v-snackbar` has an 8px margin: the bar sat 8px higher).
.snackbar {
  margin: 0;

  :deep(.v-snackbar__wrapper) {
    box-shadow: v.$box-shadow-elevation-4 !important;
    font-size: 0.875rem;
    line-height: 1.5;
  }
}

// V2 default (elevated) button shadow, `.v-btn:not(.v-btn--flat)` of the V2 stylesheet; V4's is the MD3 level 1. The buttons come from the
// host's `actions` slot and carry the host's scope id, so the rule reaches them with `:deep`.
.snackbar__row :deep(.v-btn) {
  box-shadow: v.$box-shadow-v2-btn;
}

.snackbar-button.v-btn {
  border-radius: 5px;
  border: 1px solid var(--v-gray-darken2) !important;
  max-width: 24px !important;
  max-height: 24px !important;
  min-height: 24px !important;
  min-width: 24px !important;
  padding: 0 !important;

  &:hover {
    background-color: transparent !important;
    border: 1px solid var(--v-primary-darken1) !important;
  }
}

// V2 `.v-input--checkbox:not(.active) .v-input--selection-controls__input` is the V4 `.v-selection-control__input` of the kit `Checkbox`.
.checkbox :deep(.v-checkbox:not(.active) .v-selection-control__input) {
  background-color: transparent;
  border: 1px solid var(--v-gray-darken2) !important;
}

// The menu is teleported, but its `v-list` is written in this kit and carries the scope id. The items come from the host's slot, so they
// are reached with `:deep`; the item look is the one of the legacy snackbar menu (`.v-list-item`, `.text-error`).
.select-snackbar-menu {
  :deep(.v-list-item) {
    color: var(--v-gray-darken1);
    min-height: 36px;

    &:not(:last-child) {
      margin-bottom: 8px;
    }

    &.text-error {
      .v-list-item-title,
      .v-icon {
        color: var(--v-error-base);
      }
    }

    .v-list-item-title {
      font-size: v.$font-size-sm;
      line-height: v.$line-height-sm;
      font-weight: v.$font-weight-semibold;
    }
  }
}
</style>

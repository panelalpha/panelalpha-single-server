<template>
  <SelectSnackbar
    :all-selected="isAllSelected"
    :count="numberOfCheckedItems"
    data-testid="instances-snackbar"
    :selected-label="selectedLabel"
    :short-label="`${numberOfCheckedItems} ${selectedLabel}`"
    @update:check-all="emit('update:check-all', $event)"
  >
    <template #actions>
      <AppButton
        v-if="canShare"
        class="mr-3"
        color="info"
        data-testid="instances-snackbar-share"
        kind="primary"
        @click="emit('mass-action-share')"
      >
        <v-icon
          color="white"
          icon="$shareIcon"
          size="20"
        />

        <span class="font-weight-bold">{{ t('button.share') }}</span>
      </AppButton>

      <AppButton
        data-testid="instances-snackbar-remove"
        kind="danger"
        @click="emit('mass-action-remove')"
      >
        <v-icon
          icon="$xcircle"
          size="24"
        />

        <span class="font-weight-bold">{{ t('button.remove') }}</span>
      </AppButton>
    </template>

    <template #menu-items="{ close }">
      <v-list-item
        v-if="canShare"
        data-testid="instances-snackbar-menu-share"
        @click="onMoreAction(close, 'mass-action-share')"
      >
        <v-icon
          class="mr-3"
          icon="$shareIcon"
          size="20"
        />

        <v-list-item-title>{{ t('button.share') }}</v-list-item-title>
      </v-list-item>

      <v-list-item
        class="text-error"
        color="error"
        @click="onMoreAction(close, 'mass-action-remove')"
      >
        <v-icon
          class="mr-3"
          icon="$xcircle"
          size="20"
        />

        <v-list-item-title>{{ t('button.remove') }}</v-list-item-title>
      </v-list-item>
    </template>
  </SelectSnackbar>
</template>

<script lang="ts" setup>
  // The bar is the kit `SelectSnackbar` (desktop row above 966px, compact bar with the "more" menu below); the two mass actions are
  // the instance part. The compact label is the counter and the wide label, as legacy wrote `{{ numberOfCheckedItems }} {{ $t(...) }}`.
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import SelectSnackbar from '@/shared/ui/selection/SelectSnackbar.vue'

  const props = withDefaults(defineProps<{
    checkedItems: ReadonlyArray<number | string>
    items: ReadonlyArray<unknown>
    /**
     * Share (row and "more" menu) only when every selected project has `general.manage_shared_access`, like the kebab and the
     * Shares column. Legacy shows it always.
     */
    canShare?: boolean
  }>(), {
    canShare: true,
  })

  const emit = defineEmits<{
    'update:check-all': [value: boolean]
    'mass-action-share': []
    'mass-action-remove': []
  }>()

  const { t } = useTranslation()

  const numberOfCheckedItems = computed(() => props.checkedItems.length)
  const isAllSelected = computed(() => props.checkedItems.length === props.items.length)
  const selectedLabel = computed(() => String(t('table.snackbar.selected.instance', { count: numberOfCheckedItems.value })))

  // The menu closes before the action, as legacy did: the action opens a dialog, and a menu still open then stays above it.
  function onMoreAction (close: () => void, event: 'mass-action-share' | 'mass-action-remove'): void {
    close()
    if (event === 'mass-action-share') emit('mass-action-share')
    else emit('mass-action-remove')
  }
</script>

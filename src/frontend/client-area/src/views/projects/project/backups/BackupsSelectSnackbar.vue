<template>
  <SelectSnackbar
    :all-selected="isAllSelected"
    :count="numberOfCheckedItems"
    dark
    :selected-label="t('table.snackbar.selected.backup', { count: numberOfCheckedItems })"
    @update:check-all="emit('update:check-all', $event)"
  >
    <template #actions>
      <AppButton
        data-testid="backups-snackbar-remove"
        kind="danger"
        @click="emit('mass-action-remove')"
      >
        <v-icon
          icon="$xcircle"
          size="24"
        />

        <!-- The legacy label keeps the spaces around the text (`.v-btn__content` is `white-space: break-spaces`, so the trailing one counts too). -->

        <span class="font-weight-bold">{{ ` ${t('button.remove')} ` }}</span>
      </AppButton>
    </template>

    <template #menu-items="{ close }">
      <v-list-item
        class="text-error"
        color="error"
        data-testid="backups-snackbar-menu-remove"
        @click="removeFromMenu(close)"
      >
        <template #prepend>
          <v-icon
            class="mr-3"
            icon="$xcircle"
            size="20"
          />
        </template>

        <v-list-item-title>{{ t('button.remove') }}</v-list-item-title>
      </v-list-item>
    </template>
  </SelectSnackbar>
</template>

<script lang="ts" setup>
  // Always dark.
  // The shell (the desktop row above 966px, the compact bar with its close button, the select-all checkbox and the "more" menu) is the kit
  // `SelectSnackbar`; this file only supplies the backup labels, the remove action and the page-wide select-all rule.
  import type { BackupItem } from './backups-list'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import SelectSnackbar from '@/shared/ui/selection/SelectSnackbar.vue'

  const props = defineProps<{
    items: ReadonlyArray<Pick<BackupItem, 'id'>>
    checkedItems: ReadonlyArray<number>
  }>()

  const emit = defineEmits<{
    'update:check-all': [checked: boolean]
    'mass-action-remove': []
  }>()

  const { t } = useTranslation()

  const numberOfCheckedItems = computed(() => props.checkedItems.length)
  // Legacy `checkedItems.length === items.length`, which a selection on another page would tick by mistake; here every row of the page
  // has to be checked (the same rule as the table header, `use-backup-selection.ts`).
  const isAllSelected = computed(() => props.items.length > 0
    && props.items.every(item => props.checkedItems.includes(item.id)))

  // The menu closes before the mass-delete dialog opens, otherwise it stays above the dialog (see the kit's menu comment).
  function removeFromMenu (close: () => void): void {
    close()
    emit('mass-action-remove')
  }
</script>

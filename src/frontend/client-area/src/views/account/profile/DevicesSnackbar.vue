<template>
  <SelectSnackbar
    :all-selected="isAllSelected"
    class="devices-snackbar"
    :count="numberOfCheckedItems"
    :selected-label="t('table.snackbar.selected.device', { count: numberOfCheckedItems })"
    :short-label="t('table.snackbar.selected.short', { count: numberOfCheckedItems })"
    @update:check-all="selectAll"
  >
    <template #actions>
      <AppButton
        data-testid="account-snackbar-forget"
        kind="danger"
        @click="emit('mass-action-forget')"
      >
        <v-icon
          icon="$xcircle"
          size="24"
        />

        <span class="font-weight-bold">{{ t('button.forget') }}</span>
      </AppButton>
    </template>

    <template #menu-items="{ close }">
      <v-list-item
        class="text-error"
        color="error"
        data-testid="account-snackbar-menu-forget"
        @click="forgetFromMenu(close)"
      >
        <template #prepend>
          <v-icon
            class="mr-3"
            icon="$xcircle"
            size="20"
          />
        </template>

        <v-list-item-title>{{ t('button.forget') }}</v-list-item-title>
      </v-list-item>
    </template>
  </SelectSnackbar>
</template>

<script lang="ts" setup>
  // The shell (the desktop row above 966px, the compact bar, the select-all checkbox and the "more" menu) is the kit `SelectSnackbar`;
  // this file only supplies the device labels, the forget action and the device select-all rule. Not dark (legacy `:dark="false"`).
  import type { Device } from './account.api'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import SelectSnackbar from '@/shared/ui/selection/SelectSnackbar.vue'

  const props = defineProps<{
    items: Device[]
    checkedItems: Array<string | undefined>
  }>()

  const emit = defineEmits<{
    'update:check-all': [checked: boolean]
    'mass-action-forget': []
  }>()

  const { t } = useTranslation()

  const numberOfCheckedItems = computed(() => props.checkedItems.length)
  const isAllSelected = computed(() => props.checkedItems.length === props.items.filter(item => !item.current_device).length)

  function selectAll (checked: boolean): void {
    emit('update:check-all', checked)
  }

  // The menu closes before the mass-forget modal opens, otherwise it stays above the modal.
  function forgetFromMenu (close: () => void): void {
    close()
    emit('mass-action-forget')
  }
</script>

<style lang="scss">
// Lite snackbar text is 14px / 22px (1.375rem); the kit keeps the 1.5 line height of app (instance backups measure against app).
.snackbar.devices-snackbar.devices-snackbar .v-snackbar__wrapper {
  line-height: 1.375rem;
}
</style>

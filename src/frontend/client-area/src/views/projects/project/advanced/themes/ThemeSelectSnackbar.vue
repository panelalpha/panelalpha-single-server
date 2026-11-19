<template>
  <SelectSnackbar
    :all-selected="allSelected"
    :count="count"
    :selected-label="t('table.snackbar.selected.theme', { count })"
    :short-label="t('table.snackbar.selected.short', { count })"
    @update:check-all="emit('update:check-all', $event)"
  >
    <template #actions>
      <div
        v-ripple
        class="d-flex btn-icon-horizontal p-2 font-weight-600"
        @click="emit('mass-action-update')"
      >
        <v-icon icon="$update" />{{ t('button.update') }}
      </div>

      <!-- A 6 px gap between the icon and the label (the space node of the V2 button), and 8 px after the Update action. -->
      <AppButton
        class="ml-2"
        kind="danger"
        @click="emit('mass-action-remove')"
      >
        <v-icon
          class="remove-icon"
          icon="$xcircle"
        />

        <span class="font-weight-bold">{{ t('button.remove') }}</span>
      </AppButton>
    </template>

    <template #menu-items>
      <v-list-item @click="emit('mass-action-update')">
        <v-icon
          class="mr-3"
          icon="$update"
          size="20"
        />

        <v-list-item-title>{{ t('button.update') }}</v-list-item-title>
      </v-list-item>

      <v-list-item
        class="text-error"
        color="error"
        @click="emit('mass-action-remove')"
      >
        <v-icon
          class="mr-3"
          icon="$xcircle"
          size="20"
        />

        <v-list-item-title>{{ t('button.delete') }}</v-list-item-title>
      </v-list-item>
    </template>
  </SelectSnackbar>
</template>

<script lang="ts" setup>
  // The shell is the kit `SelectSnackbar`; the two mass actions and their labels are the theme part. Update is always shown (legacy has no `hasUpdate`
  // here, unlike plugins), in the wide row and in the menu. The remove button is red in the row and "delete" in the menu (legacy wording).
  // The activate action is commented out in legacy and is not ported.
  import { useTranslation } from 'i18next-vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import SelectSnackbar from '@/shared/ui/selection/SelectSnackbar.vue'

  defineProps<{
    count: number
    allSelected: boolean
  }>()

  const emit = defineEmits<{
    'update:check-all': [value: boolean]
    'mass-action-update': []
    'mass-action-remove': []
  }>()

  const { t } = useTranslation()
</script>

<style lang="scss" scoped>
// Legacy: the V2 button keeps a space node between the icon and the label (the icon's 10 px margin plus a 6 px space node).
.remove-icon {
  margin-right: 16px;
}
</style>

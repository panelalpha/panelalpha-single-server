<template>
  <SelectSnackbar
    :all-selected="allSelected"
    :count="count"
    :selected-label="t('table.snackbar.selected.plugin', { count })"
    :short-label="t('table.snackbar.selected.short', { count })"
    @update:check-all="emit('update:check-all', $event)"
  >
    <template #actions>
      <div
        v-ripple
        class="d-flex btn-icon-horizontal p-2 font-weight-600"
        @click="emit('mass-action-activate')"
      >
        <v-icon icon="$checkcircle" />{{ t('button.activate') }}
      </div>

      <div
        v-ripple
        class="d-flex btn-icon-horizontal p-2 font-weight-600"
        @click="emit('mass-action-deactivate')"
      >
        <v-icon icon="$xcircle" />{{ t('button.disable') }}
      </div>

      <div
        v-if="hasUpdate"
        v-ripple
        class="d-flex btn-icon-horizontal p-2 font-weight-600"
        @click="emit('mass-action-update')"
      >
        <v-icon icon="$update" />{{ t('button.update') }}
      </div>

      <AppButton
        kind="danger"
        @click="emit('mass-action-remove')"
      >
        <!-- V2 `.v-icon` is 24px, V4 sizes it 18px inside a button (button 120.25 vs 114.23 px). -->
        <v-icon
          icon="$xcircle"
          size="24"
        />

        <span class="font-weight-bold">{{ t('button.remove') }}</span>
      </AppButton>
    </template>

    <template #menu-items>
      <v-list-item @click="emit('mass-action-activate')">
        <v-icon
          class="mr-3"
          icon="$checkcircle"
          size="20"
        />

        <v-list-item-title>{{ t('button.activate') }}</v-list-item-title>
      </v-list-item>

      <v-list-item @click="emit('mass-action-deactivate')">
        <v-icon
          class="mr-3"
          icon="$xcircle"
          size="20"
        />

        <v-list-item-title>{{ t('button.disable') }}</v-list-item-title>
      </v-list-item>

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
  // The shell is the kit `SelectSnackbar`;
  // the four mass actions and their labels are the plugin part. Update shows in the wide row only when a selected plugin has an update,
  // and always in the menu. The remove button is red in the row and "delete" in the menu (legacy wording).
  import type { InstalledPlugin } from '@/entities/project/instance-plugins.api'
  import { useTranslation } from 'i18next-vue'
  import { computed } from 'vue'
  import AppButton from '@/shared/ui/buttons/AppButton.vue'
  import SelectSnackbar from '@/shared/ui/selection/SelectSnackbar.vue'

  const props = defineProps<{
    checkedPlugins: InstalledPlugin[]
    count: number
    allSelected: boolean
  }>()

  const emit = defineEmits<{
    'update:check-all': [value: boolean]
    'mass-action-activate': []
    'mass-action-deactivate': []
    'mass-action-update': []
    'mass-action-remove': []
  }>()

  const { t } = useTranslation()

  const hasUpdate = computed(() => props.checkedPlugins.some(plugin => plugin.update === 'available'))
</script>
